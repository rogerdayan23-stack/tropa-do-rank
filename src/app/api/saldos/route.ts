import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest, isManager } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase";
import crypto from "crypto";

function getIntervaloSemana(dataStr: string) {
  const [ano, mes, dia] = dataStr.split("-").map(Number);
  const d = new Date(ano, mes - 1, dia, 12, 0, 0);
  const diaSemana = d.getDay();
  const diffSegunda = diaSemana === 0 ? -6 : 1 - diaSemana;

  const segunda = new Date(d);
  segunda.setDate(d.getDate() + diffSegunda);

  const domingo = new Date(segunda);
  domingo.setDate(segunda.getDate() + 6);

  const toISO = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const inicioStr = toISO(segunda);
  const fimStr = toISO(domingo);

  return {
    inicioStr,
    fimStr,
    inicioISO: `${inicioStr}T00:00:00.000Z`,
    fimISO: `${fimStr}T23:59:59.999Z`,
  };
}

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { searchParams } = new URL(req.url);
  const dataQuery = searchParams.get("data") || new Date().toISOString().split("T")[0];

  try {
    const semana = getIntervaloSemana(dataQuery);

    // 1. Busca todos os usuários
    const { data: todosUsuarios, error: usersError } = await supabase
      .from("users")
      .select("id, username, avatar_url")
      .order("username", { ascending: true });

    if (usersError) throw usersError;

    // 2. Busca lucros diários da semana
    const { data: lucrosSemanaRows, error: lucrosError } = await supabase
      .from("lucros_diarios")
      .select("data, valor_total")
      .gte("data", semana.inicioStr)
      .lte("data", semana.fimStr);

    if (lucrosError) throw lucrosError;

    const lucroPorDiaMap: Record<string, number> = {};
    for (const row of (lucrosSemanaRows || [])) {
      lucroPorDiaMap[row.data] = row.valor_total;
    }
    const valorLucroDia = lucroPorDiaMap[dataQuery] || 0;
    const lucroBrutoSemana = (lucrosSemanaRows || []).reduce((acc, row) => acc + row.valor_total, 0);

    // 3. Busca sessões da semana no Supabase (tabela sessoes)
    const { data: sessoes, error: sessoesErr } = await supabase
      .from("sessoes")
      .select("*")
      .gte("inicio", semana.inicioISO)
      .lte("inicio", semana.fimISO);

    if (sessoesErr) console.error("Erro ao buscar sessões:", sessoesErr);

    // 4. Agrupa segundos por usuário e por data
    const segundosPorUsuarioPorDia: Record<string, Record<string, number>> = {};
    for (const u of (todosUsuarios || [])) {
      segundosPorUsuarioPorDia[u.id] = {};
    }

    for (const s of (sessoes || [])) {
      if (!s.user_id || !segundosPorUsuarioPorDia[s.user_id]) continue;
      const diaSessao = (s.inicio || "").substring(0, 10);
      if (!diaSessao) continue;
      segundosPorUsuarioPorDia[s.user_id][diaSessao] = (segundosPorUsuarioPorDia[s.user_id][diaSessao] || 0) + (s.segundos_acumulados || 0);
    }

    // 5. Converte para horas arredondadas de 30 em 30 minutos
    const horasPorUsuarioPorDia: Record<string, Record<string, number>> = {};
    const totalHorasTimePorDia: Record<string, number> = {};

    for (const u of (todosUsuarios || [])) {
      horasPorUsuarioPorDia[u.id] = {};
      const diasDoUsuario = segundosPorUsuarioPorDia[u.id] || {};
      for (const [diaStr, segs] of Object.entries(diasDoUsuario)) {
        const blocos = Math.round(segs / 1800);
        const horasArred = blocos * 0.5;
        horasPorUsuarioPorDia[u.id][diaStr] = horasArred;
        totalHorasTimePorDia[diaStr] = (totalHorasTimePorDia[diaStr] || 0) + horasArred;
      }
    }

    // 6. Calcula taxa por hora e ganhos diários
    const ganhosPorUsuarioPorDia: Record<string, Record<string, number>> = {};
    for (const u of (todosUsuarios || [])) {
      ganhosPorUsuarioPorDia[u.id] = {};
    }

    const todasDatas = Array.from(
      new Set<string>([...Object.keys(lucroPorDiaMap), ...Object.keys(totalHorasTimePorDia), dataQuery])
    );

    for (const diaStr of todasDatas) {
      const lucroDaqueleDia = lucroPorDiaMap[diaStr] || 0;
      const totalHorasDaqueleDia = totalHorasTimePorDia[diaStr] || 0;
      const taxaDaqueleDia = totalHorasDaqueleDia > 0 && lucroDaqueleDia > 0 ? lucroDaqueleDia / totalHorasDaqueleDia : 0;

      for (const u of (todosUsuarios || [])) {
        const h = horasPorUsuarioPorDia[u.id]?.[diaStr] || 0;
        ganhosPorUsuarioPorDia[u.id][diaStr] = h * taxaDaqueleDia;
      }
    }

    // 7. Busca penalidades da semana
    const { data: penalidadesRows, error: penError } = await supabase
      .from("penalidades")
      .select("user_id, valor")
      .gte("created_at", `${semana.inicioStr}T00:00:00.000Z`)
      .lte("created_at", `${semana.fimStr}T23:59:59.999Z`);

    if (penError) throw penError;

    const penalidadesMap: Record<string, number> = {};
    for (const p of (penalidadesRows || [])) {
      penalidadesMap[p.user_id] = (penalidadesMap[p.user_id] || 0) + p.valor;
    }

    // 8. Busca pagamentos da data selecionada
    const { data: pagamentosRows, error: pagError } = await supabase
      .from("pagamentos")
      .select("user_id, pago, pago_em, valor_calculado")
      .eq("data", dataQuery);

    if (pagError) throw pagError;

    const pagamentosMap: Record<string, { pago: boolean; pago_em: string; valor_calculado: number }> = {};
    for (const pg of (pagamentosRows || [])) {
      pagamentosMap[pg.user_id] = {
        pago: pg.pago === true || pg.pago === 1,
        pago_em: pg.pago_em,
        valor_calculado: pg.valor_calculado,
      };
    }

    // 9. Monta lista consolidada
    let totalHorasEquipeSemana = 0;
    const totalHorasDia = totalHorasTimePorDia[dataQuery] || 0;
    const taxaHoraDia = totalHorasDia > 0 && valorLucroDia > 0 ? valorLucroDia / totalHorasDia : 0;

    const jogadores = (todosUsuarios || []).map((u: any) => {
      const horasDia = horasPorUsuarioPorDia[u.id]?.[dataQuery] || 0;
      const valorDia = ganhosPorUsuarioPorDia[u.id]?.[dataQuery] || 0;

      let horasSemana = 0;
      for (const h of Object.values(horasPorUsuarioPorDia[u.id] || {})) {
        horasSemana += h;
      }
      totalHorasEquipeSemana += horasSemana;

      let ganhoBrutoSemana = 0;
      for (const g of Object.values(ganhosPorUsuarioPorDia[u.id] || {})) {
        ganhoBrutoSemana += g;
      }

      const penalidadesSemana = penalidadesMap[u.id] || 0;
      const totalReceberSemana = Math.max(0, ganhoBrutoSemana - penalidadesSemana);

      return {
        id: u.id,
        username: u.username,
        avatar_url: u.avatar_url,
        horas_dia: horasDia,
        horas_semana: horasSemana,
        valor_dia: Number(valorDia.toFixed(2)),
        bruto_semana: Number(ganhoBrutoSemana.toFixed(2)),
        penalidades_semana: Number(penalidadesSemana.toFixed(2)),
        total_receber_semana: Number(totalReceberSemana.toFixed(2)),
        pago: pagamentosMap[u.id]?.pago || false,
        pago_em: pagamentosMap[u.id]?.pago_em || null,
      };
    });

    // 10. Verifica fechamento da semana
    const { data: fechamento, error: fechError } = await supabase
      .from("fechamentos_semanais")
      .select("*")
      .eq("data_inicio", semana.inicioStr)
      .eq("data_fim", semana.fimStr)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fechError) throw fechError;

    return NextResponse.json({
      resumo_semanal: {
        data_inicio: semana.inicioStr,
        data_fim: semana.fimStr,
        lucro_bruto_semana: Number(lucroBrutoSemana.toFixed(2)),
        total_horas_equipe_semana: totalHorasEquipeSemana,
        fechada: !!fechamento,
      },
      dia_selecionado: {
        data: dataQuery,
        lucro_dia: valorLucroDia,
        total_horas_dia: totalHorasDia,
        taxa_hora_dia: Number(taxaHoraDia.toFixed(2)),
      },
      jogadores,
    });
  } catch (error: any) {
    console.error("Erro ao calcular saldos:", error);
    return NextResponse.json({ error: "Erro interno ao calcular saldos" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getUserFromRequest();
  if (!user || !isManager(user)) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const supabase = createServiceClient();

  try {
    const { data, valor_total } = await req.json();

    if (!data || valor_total === undefined || valor_total === null) {
      return NextResponse.json({ error: "Data e valor total são obrigatórios" }, { status: 400 });
    }

    const valorNum = parseFloat(valor_total);
    if (isNaN(valorNum) || valorNum < 0) {
      return NextResponse.json({ error: "Valor total inválido" }, { status: 400 });
    }

    const { error } = await supabase.from("lucros_diarios").upsert(
      {
        id: crypto.randomUUID(),
        data,
        valor_total: valorNum,
        criado_por: user.id,
      },
      { onConflict: "data" }
    );

    if (error) throw error;

    return NextResponse.json({
      success: true,
      message: "Lucro diário salvo com sucesso!",
      data,
      valor_total: valorNum,
    });
  } catch (error: any) {
    console.error("Erro ao registrar lucro diário:", error);
    return NextResponse.json({ error: "Erro interno ao salvar lucro diário" }, { status: 500 });
  }
}
