import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest, isManager } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase";
import { calcularDuracaoSessao, type SessaoRow } from "@/lib/sessao";
import { registrarAuditoria } from "@/lib/audit";
import { arredondarHorasParaMeiaHora, calcularSegundosAtivosPorDia, calcularTaxaHoraSemana, calcularTotalReceber } from "@/lib/finance.mjs";
import crypto from "crypto";

function lerAjusteManualEmSegundos(detalhe: string | null): number {
  if (!detalhe) return 0;

  // Formato atual, explícito e fácil de auditar. A segunda expressão mantém
  // compatibilidade com os lançamentos anteriores, que guardavam o total
  // antes e depois do ajuste no texto do log.
  const marcado = detalhe.match(/\[ajuste-semanal:([+-]?\d+)s\]/i);
  if (marcado) return Number(marcado[1]) || 0;

  const totais = detalhe.match(/\((-?\d+)s\s*→\s*(-?\d+)s\)/);
  if (totais) return (Number(totais[2]) || 0) - (Number(totais[1]) || 0);

  return 0;
}

function colunaSessaoAusente(error: { code?: string; message?: string } | null): boolean {
  return (error?.code === "42703" || error?.code === "PGRST204") && /sessao_id/i.test(error.message || "");
}

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

    // 3. Busca sessões que cruzaram o período e seus eventos de contagem.
    const { data: sessoes, error: sessoesErr } = await supabase
      .from("sessoes")
      .select("id,user_id,inicio,fim,status,segundos_acumulados,ultima_atividade")
      .lte("inicio", semana.fimISO)
      .or(`fim.is.null,fim.gte.${semana.inicioISO}`);

    if (sessoesErr) throw sessoesErr;

    const sessoesEncontradas = sessoes || [];
    const idsSessoes = sessoesEncontradas.map((sessao) => sessao.id).filter(Boolean);
    let eventosPorSessao = new Map<string, { acao: string; criado_em: string }[]>();
    if (idsSessoes.length > 0) {
      const { data: eventosSessao, error: eventosSessaoError } = await supabase
        .from("logs")
        .select("sessao_id,acao,criado_em")
        .in("sessao_id", idsSessoes)
        .in("acao", ["iniciar_sessao", "pausar_sessao", "retomar_sessao", "encerrar_sessao", "admin:pausar_sessao", "admin:retomar_sessao", "admin:encerrar_sessao"])
        .lte("criado_em", semana.fimISO)
        .order("criado_em", { ascending: true });

      if (eventosSessaoError && !colunaSessaoAusente(eventosSessaoError)) throw eventosSessaoError;

      eventosPorSessao = new Map();
      if (!eventosSessaoError) {
        for (const evento of eventosSessao || []) {
          if (!evento.sessao_id) continue;
          const lista = eventosPorSessao.get(evento.sessao_id) || [];
          lista.push({ acao: evento.acao, criado_em: evento.criado_em });
          eventosPorSessao.set(evento.sessao_id, lista);
        }
      } else {
        // Bancos que ainda não receberam a migração não têm sessao_id em logs.
        // Relaciona os eventos antigos pelo jogador e pelo intervalo da sessão.
        const userIds = Array.from(new Set(sessoesEncontradas.map((sessao) => sessao.user_id).filter(Boolean)));
        const inicioMaisAntigo = sessoesEncontradas.reduce((maisAntigo, sessao) => {
          const inicio = Date.parse(sessao.inicio || "");
          return Number.isFinite(inicio) ? Math.min(maisAntigo, inicio) : maisAntigo;
        }, Date.parse(semana.inicioISO));

        if (userIds.length > 0) {
          const { data: eventosLegados, error: eventosLegadosError } = await supabase
            .from("logs")
            .select("user_id,acao,criado_em")
            .in("user_id", userIds)
            .in("acao", ["iniciar_sessao", "pausar_sessao", "retomar_sessao", "encerrar_sessao", "admin:pausar_sessao", "admin:retomar_sessao", "admin:encerrar_sessao"])
            .gte("criado_em", new Date(inicioMaisAntigo).toISOString())
            .lte("criado_em", semana.fimISO)
            .order("criado_em", { ascending: true });

          if (eventosLegadosError) throw eventosLegadosError;

          const sessoesPorFim = [...sessoesEncontradas].sort((a, b) => {
            const fimA = a.fim ? Date.parse(a.fim) : Number.POSITIVE_INFINITY;
            const fimB = b.fim ? Date.parse(b.fim) : Number.POSITIVE_INFINITY;
            return fimA - fimB || Date.parse(b.inicio || "") - Date.parse(a.inicio || "");
          });

          for (const evento of eventosLegados || []) {
            if (!evento.user_id || !evento.criado_em) continue;
            const instante = Date.parse(evento.criado_em);
            const sessao = sessoesPorFim.find((candidata) => {
              const inicio = Date.parse(candidata.inicio || "");
              const fim = candidata.fim ? Date.parse(candidata.fim) : Number.POSITIVE_INFINITY;
              return candidata.user_id === evento.user_id && instante >= inicio && instante <= fim;
            });
            if (!sessao) continue;
            const lista = eventosPorSessao.get(sessao.id) || [];
            lista.push({ acao: evento.acao, criado_em: evento.criado_em });
            eventosPorSessao.set(sessao.id, lista);
          }
        }
      }
    }

    // Ajustes feitos pelo Admin Master também são horas do período financeiro.
    // Eles ficam no log de auditoria, então não dependem de uma tabela nova.
    const { data: ajustesRows, error: ajustesErr } = await supabase
      .from("logs")
      .select("user_id, acao, detalhe, criado_em")
      .in("acao", ["admin_adjust_user_hours", "admin_reset_user"])
      .gte("criado_em", `${semana.inicioStr}T00:00:00.000Z`)
      .lte("criado_em", `${semana.fimStr}T23:59:59.999Z`)
      .order("criado_em", { ascending: true });

    if (ajustesErr) throw ajustesErr;

    // 4. Agrupa segundos por usuário e por data
    const segundosPorUsuarioPorDia: Record<string, Record<string, number>> = {};
    for (const u of (todosUsuarios || [])) {
      segundosPorUsuarioPorDia[u.id] = {};
    }

    const ultimoResetPorUsuario: Record<string, number> = {};
    for (const registro of (ajustesRows || [])) {
      if (registro.acao !== "admin_reset_user" || !registro.user_id || !registro.criado_em) continue;
      ultimoResetPorUsuario[registro.user_id] = Math.max(
        ultimoResetPorUsuario[registro.user_id] || 0,
        new Date(registro.criado_em).getTime(),
      );
    }

    const inicioSemanaMs = Date.parse(semana.inicioISO);
    const fimSemanaMs = Math.min(Date.parse(semana.fimISO), Date.now());
    for (const s of (sessoes || [])) {
      if (!s.user_id || !segundosPorUsuarioPorDia[s.user_id]) continue;
      const eventos = eventosPorSessao.get(s.id) || [];
      const primeiroInicio = eventos.find((evento) => evento.acao.replace(/^admin:/, "") === "iniciar_sessao");
      const inicioOriginalMs = Date.parse(primeiroInicio?.criado_em || s.inicio || "");
      if (inicioOriginalMs <= (ultimoResetPorUsuario[s.user_id] || 0)) continue;

      if (eventos.length > 0) {
        const eventosComFim = [...eventos];
        const temFim = eventos.some((evento) => evento.acao.replace(/^admin:/, "") === "encerrar_sessao");
        if (s.fim && !temFim) eventosComFim.push({ acao: "encerrar_sessao", criado_em: s.fim });
        const porDia = calcularSegundosAtivosPorDia(eventosComFim, inicioSemanaMs, fimSemanaMs);
        for (const [dia, segundos] of Array.from(porDia.entries())) {
          segundosPorUsuarioPorDia[s.user_id][dia] = (segundosPorUsuarioPorDia[s.user_id][dia] || 0) + segundos;
        }
        continue;
      }

      // Compatibilidade com sessões antigas sem eventos vinculados.
      const diaSessao = (s.inicio || "").substring(0, 10);
      if (!diaSessao || diaSessao < semana.inicioStr || diaSessao > semana.fimStr) continue;
      const segundosDaSessao = Math.max(0, calcularDuracaoSessao(s as SessaoRow));
      segundosPorUsuarioPorDia[s.user_id][diaSessao] = (segundosPorUsuarioPorDia[s.user_id][diaSessao] || 0) + segundosDaSessao;
    }

    for (const registro of (ajustesRows || [])) {
      if (!registro.user_id || !segundosPorUsuarioPorDia[registro.user_id]) continue;
      if (registro.acao === "admin_reset_user") {
        // O reset abaixo é aplicado como limite para as sessões e ajustes.
        continue;
      }
      if (new Date(registro.criado_em || "").getTime() <= (ultimoResetPorUsuario[registro.user_id] || 0)) continue;

      const diaAjuste = (registro.criado_em || "").substring(0, 10);
      const segundosAjuste = lerAjusteManualEmSegundos(registro.detalhe);
      if (!diaAjuste || !segundosAjuste) continue;
      const horasDoUsuario = segundosPorUsuarioPorDia[registro.user_id];

      if (segundosAjuste > 0) {
        horasDoUsuario[diaAjuste] = (horasDoUsuario[diaAjuste] || 0) + segundosAjuste;
        continue;
      }

      // Descontos reduzem primeiro o dia do ajuste; o excedente tira horas
      // dos dias anteriores da semana, sem permitir saldo negativo.
      let restante = Math.abs(segundosAjuste);
      const diasParaDescontar = [
        diaAjuste,
        ...Object.keys(horasDoUsuario).filter((dia) => dia < diaAjuste).sort().reverse(),
      ];
      for (const dia of diasParaDescontar) {
        const disponivel = Math.max(0, horasDoUsuario[dia] || 0);
        const descontado = Math.min(disponivel, restante);
        horasDoUsuario[dia] = disponivel - descontado;
        restante -= descontado;
        if (restante === 0) break;
      }
    }

    // 5. Converte para horas arredondadas de 30 em 30 minutos
    const horasPorUsuarioPorDia: Record<string, Record<string, number>> = {};
    const totalHorasTimePorDia: Record<string, number> = {};

    for (const u of (todosUsuarios || [])) {
      horasPorUsuarioPorDia[u.id] = {};
      const diasDoUsuario = segundosPorUsuarioPorDia[u.id] || {};
      for (const [diaStr, segs] of Object.entries(diasDoUsuario)) {
        const horasArred = arredondarHorasParaMeiaHora(segs);
        horasPorUsuarioPorDia[u.id][diaStr] = horasArred;
        totalHorasTimePorDia[diaStr] = (totalHorasTimePorDia[diaStr] || 0) + horasArred;
      }
    }

    const totalHorasEquipeSemana = Object.values(totalHorasTimePorDia).reduce((total, horas) => total + horas, 0);
    const taxaHoraSemana = calcularTaxaHoraSemana(lucroBrutoSemana, totalHorasEquipeSemana);

    // 6. Divide o lucro acumulado da semana pelo total de horas da semana.
    // Assim, lucro lançado em um dia sem sessões também entra no rateio semanal.
    const ganhosPorUsuarioPorDia: Record<string, Record<string, number>> = {};
    for (const u of (todosUsuarios || [])) {
      ganhosPorUsuarioPorDia[u.id] = {};
    }

    const todasDatas = Array.from(
      new Set<string>([...Object.keys(lucroPorDiaMap), ...Object.keys(totalHorasTimePorDia), dataQuery])
    );

    for (const diaStr of todasDatas) {
      for (const u of (todosUsuarios || [])) {
        const h = horasPorUsuarioPorDia[u.id]?.[diaStr] || 0;
        ganhosPorUsuarioPorDia[u.id][diaStr] = h * taxaHoraSemana;
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
    const totalHorasDia = totalHorasTimePorDia[dataQuery] || 0;

    const jogadores = (todosUsuarios || []).map((u: { id: string; username: string; avatar_url: string | null }) => {
      const horasDia = horasPorUsuarioPorDia[u.id]?.[dataQuery] || 0;
      const valorDia = ganhosPorUsuarioPorDia[u.id]?.[dataQuery] || 0;

      let horasSemana = 0;
      for (const h of Object.values(horasPorUsuarioPorDia[u.id] || {})) {
        horasSemana += h;
      }
      let ganhoBrutoSemana = 0;
      for (const g of Object.values(ganhosPorUsuarioPorDia[u.id] || {})) {
        ganhoBrutoSemana += g;
      }

      const penalidadesSemana = penalidadesMap[u.id] || 0;
      const totalReceberSemana = calcularTotalReceber(ganhoBrutoSemana, penalidadesSemana);

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

    const diasSemana = Array.from({ length: 7 }, (_, indice) => {
      const data = new Date(`${semana.inicioStr}T12:00:00.000Z`);
      data.setUTCDate(data.getUTCDate() + indice);
      const chave = data.toISOString().slice(0, 10);
      return {
        data: chave,
        lucro_total: Number((lucroPorDiaMap[chave] || 0).toFixed(2)),
        horas_total: Number((totalHorasTimePorDia[chave] || 0).toFixed(2)),
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
        taxa_hora_semana: Number(taxaHoraSemana.toFixed(2)),
        fechada: !!fechamento,
      },
      dia_selecionado: {
        data: dataQuery,
        lucro_dia: valorLucroDia,
        total_horas_dia: totalHorasDia,
        taxa_hora_semana: Number(taxaHoraSemana.toFixed(2)),
      },
      dias: diasSemana,
      jogadores,
    });
  } catch (error: unknown) {
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

    const { data: lucroAnterior, error: lucroAnteriorError } = await supabase
      .from("lucros_diarios")
      .select("valor_total")
      .eq("data", data)
      .maybeSingle();

    if (lucroAnteriorError) throw lucroAnteriorError;

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

    await registrarAuditoria(
      supabase,
      user,
      "admin:salvar_lucro_diario",
      `Lucro de ${data} alterado de R$ ${Number(lucroAnterior?.valor_total || 0).toFixed(2)} para R$ ${valorNum.toFixed(2)}.`,
    );

    return NextResponse.json({
      success: true,
      message: "Lucro diário salvo com sucesso!",
      data,
      valor_total: valorNum,
    });
  } catch (error: unknown) {
    console.error("Erro ao registrar lucro diário:", error);
    return NextResponse.json({ error: "Erro interno ao salvar lucro diário" }, { status: 500 });
  }
}
