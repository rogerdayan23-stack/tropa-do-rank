import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { getUserFromRequest, isManager } from "@/lib/auth";
import { registrarAuditoria, registrarLog } from "@/lib/audit";
import { STATUS_ATIVA, STATUS_PAUSADA, STATUS_ENCERRADA, calcularDuracaoSessao, construirAtualizacaoSessao, LIMITE_SESSAO_SEGUNDOS, logContagemSessao, type SessaoRow } from "@/lib/sessao";
import { expirarSessoesVencidas } from "@/lib/sessao-server";

async function requireAdmin() {
  const user = await getUserFromRequest();
  if (!user || !isManager(user)) return { response: NextResponse.json({ error: "Acesso negado" }, { status: 403 }), user: null };
  return { response: null, user };
}

export async function GET() {
  const { response } = await requireAdmin();
  if (response) return response;

  // A autorização já foi validada acima; use o cliente de serviço para a
  // consulta administrativa, sem depender das políticas RLS do cliente público.
  const supabase = createServiceClient();
  const { data: ativas, error: activeError } = await supabase.from("sessoes").select("*").eq("status", STATUS_ATIVA);
  if (activeError) return NextResponse.json({ error: activeError.message }, { status: 500 });

  try {
    await expirarSessoesVencidas(supabase, (ativas || []) as SessaoRow[]);
  } catch (expireError) {
    const message = expireError instanceof Error ? expireError.message : "Falha ao encerrar sessão vencida";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const { data, error } = await supabase
    .from("sessoes")
    .select("*")
    .in("status", ["ativa", "pausada"])
    .order("inicio", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const sessoes = (data || []).map((s: SessaoRow) => ({
    id: s.id,
    user_id: s.user_id,
    inicio: s.inicio,
    status: s.status,
    segundos_acumulados: s.segundos_acumulados || 0,
    duracao: calcularDuracaoSessao(s),
    ultima_atividade: s.ultima_atividade,
  }));

  return NextResponse.json({ sessoes });
}

export async function POST(req: NextRequest) {
  const { response, user } = await requireAdmin();
  if (response) return response;

  const { acao, sessao_id, minutos } = await req.json();
  const agora = new Date().toISOString();
  const supabase = createServiceClient();
  const service = createServiceClient();

  if (acao === "pausar" || acao === "retomar") {
    if (!sessao_id) return NextResponse.json({ error: "Sessão não informada" }, { status: 400 });

    const { data: sessao, error: fetchError } = await supabase
      .from("sessoes")
      .select("*")
      .eq("id", sessao_id)
      .maybeSingle();
    if (fetchError || !sessao) return NextResponse.json({ error: "Sessão não encontrada" }, { status: 404 });

    const statusEsperado = acao === "pausar" ? STATUS_ATIVA : STATUS_PAUSADA;
    if (sessao.status !== statusEsperado) {
      return NextResponse.json({ error: acao === "pausar" ? "A sessão não está ativa" : "A sessão não está pausada" }, { status: 409 });
    }

    const atualizacao = acao === "pausar"
      ? { status: STATUS_PAUSADA, segundos_acumulados: calcularDuracaoSessao(sessao), ultima_atividade: agora }
      : { status: STATUS_ATIVA, inicio: agora, ultima_atividade: agora, segundos_acumulados: Math.max(0, Number(sessao.segundos_acumulados) || 0) };
    const { error: updateError } = await supabase
      .from("sessoes")
      .update(atualizacao)
      .eq("id", sessao_id)
      .eq("status", statusEsperado);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

    const { data: alvo } = await service.from("users").select("username").eq("id", sessao.user_id).maybeSingle();
    await registrarAuditoria(service, user!, `admin:${acao}_sessao`, `Sessão ${sessao_id} ${acao === "pausar" ? "pausada" : "retomada"}.`, { id: sessao.user_id, username: alvo?.username || null, sessao_id });
    return NextResponse.json({ ok: true });
  }

  if (acao === "pausar_todos") {
    const { data: ativas, error: listError } = await supabase.from("sessoes").select("*").eq("status", STATUS_ATIVA);
    if (listError) return NextResponse.json({ error: listError.message }, { status: 500 });
    let count = 0;
    for (const s of ativas || []) {
      const segundosAcumulados = calcularDuracaoSessao(s);
      const { error: e } = await supabase.from("sessoes").update({ status: STATUS_PAUSADA, segundos_acumulados: segundosAcumulados, ultima_atividade: agora }).eq("id", s.id);
      if (!e) {
        count++;
        await registrarLog(service, { user_id: s.user_id, sessao_id: s.id, acao: "pausar_sessao", detalhe: "Contagem pausada pelo Admin Master.", admin_id: user!.id, criado_em: agora });
        logContagemSessao(s.id, segundosAcumulados, "pausar-todos-admin");
      }
    }
    const ids = (ativas || []).map((sessao) => sessao.user_id).filter(Boolean);
    const { data: alvos } = ids.length ? await service.from("users").select("username").in("id", ids) : { data: [] };
    await registrarAuditoria(service, user!, "admin:pausar_todos", `${count} sessões pausadas. Jogadores: ${(alvos || []).map((alvo) => alvo.username).join(", ") || "nenhum"}.`);
    return NextResponse.json({ ok: true, count });
  }

  if (acao === "despausar_todos") {
    const { data: pausadas, error: listError } = await supabase.from("sessoes").select("*").eq("status", STATUS_PAUSADA);
    if (listError) return NextResponse.json({ error: listError.message }, { status: 500 });
    let count = 0;
    for (const s of pausadas || []) {
      const { error: e } = await supabase.from("sessoes").update({ status: STATUS_ATIVA, inicio: agora, ultima_atividade: agora }).eq("id", s.id);
      if (!e) {
        count++;
        await registrarLog(service, { user_id: s.user_id, sessao_id: s.id, acao: "retomar_sessao", detalhe: "Contagem retomada pelo Admin Master.", admin_id: user!.id, criado_em: agora });
        logContagemSessao(s.id, s.segundos_acumulados || 0, "despausar-todos-admin");
      }
    }
    const ids = (pausadas || []).map((sessao) => sessao.user_id).filter(Boolean);
    const { data: alvos } = ids.length ? await service.from("users").select("username").in("id", ids) : { data: [] };
    await registrarAuditoria(service, user!, "admin:despausar_todos", `${count} sessões retomadas. Jogadores: ${(alvos || []).map((alvo) => alvo.username).join(", ") || "nenhum"}.`);
    return NextResponse.json({ ok: true, count });
  }

  if (acao === "contagem") {
    const { data: ativas, error: listError } = await supabase.from("sessoes").select("*").eq("status", STATUS_ATIVA);
    if (listError) return NextResponse.json({ error: listError.message }, { status: 500 });
    let atualizadas = 0;
    let expiradas = 0;
    for (const s of ativas || []) {
      const { update, expirou } = construirAtualizacaoSessao(s, agora);
      const { error: e } = await supabase.from("sessoes").update(update).eq("id", s.id);
      if (!e) {
        atualizadas++;
        if (expirou) {
          expiradas++;
          const segundos = update.segundos_acumulados as number;
          logContagemSessao(s.id, segundos, "expirou-5h-admin");
          const { data: usr } = await service.from("users").select("total_segundos").eq("id", s.user_id).single();
          await service.from("users").update({ total_segundos: (usr?.total_segundos || 0) + segundos }).eq("id", s.user_id);
        }
      }
    }
    await registrarAuditoria(service, user!, "admin:contagem_horas", `${atualizadas} sessões sincronizadas; ${expiradas} expiradas automaticamente; limite ${LIMITE_SESSAO_SEGUNDOS}s.`);
    return NextResponse.json({ ok: true, atualizadas, expiradas });
  }

  if (acao === "encerrar") {
    const consulta = supabase.from("sessoes").select("*");
    const { data: sessoesParaEncerrar, error: fetchError } = sessao_id
      ? await consulta.eq("id", sessao_id).in("status", [STATUS_ATIVA, STATUS_PAUSADA])
      : await consulta.in("status", [STATUS_ATIVA, STATUS_PAUSADA]);
    if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
    if (sessao_id && !sessoesParaEncerrar?.length) return NextResponse.json({ error: "Sessão não encontrada ou já encerrada" }, { status: 404 });

    let count = 0;
    for (const sessao of sessoesParaEncerrar || []) {
      const acumulado = calcularDuracaoSessao(sessao);
      const { data: encerrada, error: updateError } = await supabase
        .from("sessoes")
        .update({ status: STATUS_ENCERRADA, fim: agora, segundos_acumulados: acumulado, ultima_atividade: agora })
        .eq("id", sessao.id)
        .in("status", [STATUS_ATIVA, STATUS_PAUSADA])
        .select("id")
        .maybeSingle();
      if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
      if (!encerrada) continue;

      const { data: usr, error: userError } = await service.from("users").select("total_segundos").eq("id", sessao.user_id).single();
      if (userError) return NextResponse.json({ error: userError.message }, { status: 500 });
      const novoTotal = Number(usr?.total_segundos || 0) + acumulado;
      const { error: totalError } = await service.from("users").update({ total_segundos: novoTotal }).eq("id", sessao.user_id);
      if (totalError) return NextResponse.json({ error: totalError.message }, { status: 500 });
      await registrarLog(service, {
        user_id: sessao.user_id,
        sessao_id: sessao.id,
        acao: "encerrar_sessao",
        detalhe: "Contagem encerrada pelo Admin Master.",
        admin_id: user!.id,
        criado_em: agora,
      });
      count++;
    }

    const alvos = Array.from(new Set((sessoesParaEncerrar || []).map((sessao) => sessao.user_id).filter(Boolean)));
    const { data: usuariosAfetados } = alvos.length ? await service.from("users").select("username").in("id", alvos) : { data: [] };
    await registrarAuditoria(service, user!, sessao_id ? "admin:encerrar_sessao" : "admin:encerrar_todas", `${count} sessões encerradas. Jogadores: ${(usuariosAfetados || []).map((alvo) => alvo.username).join(", ") || "nenhum"}.`);
    return NextResponse.json({ ok: true, count });
  } else if (acao === "ajustar") {
    if (!sessao_id || !Number.isInteger(minutos) || minutos === 0) {
      return NextResponse.json({ error: "Informe uma sessão e uma quantidade válida de minutos" }, { status: 400 });
    }
    const ajuste = (minutos || 0) * 60;
    const { data: s, error: sessaoError } = await supabase.from("sessoes").select("user_id, segundos_acumulados").eq("id", sessao_id).maybeSingle();
    if (sessaoError || !s) return NextResponse.json({ error: "Sessão não encontrada" }, { status: 404 });
    const atual = Math.max(0, Number(s.segundos_acumulados) || 0);
    if (atual + ajuste < 0) return NextResponse.json({ error: "O ajuste não pode deixar a sessão negativa" }, { status: 400 });
    const { error: ajusteError } = await supabase.from("sessoes").update({ segundos_acumulados: atual + ajuste }).eq("id", sessao_id);
    if (ajusteError) return NextResponse.json({ error: ajusteError.message }, { status: 500 });
    const { data: alvo } = await service.from("users").select("username").eq("id", s.user_id).maybeSingle();
    await registrarAuditoria(service, user!, "admin:ajustar", `Sessão ${sessao_id}: ${minutos > 0 ? "+" : ""}${minutos} min (${atual}s → ${atual + ajuste}s).`, { id: s.user_id, username: alvo?.username || null });
  } else if (acao === "cancelar") {
    const { data: sessao, error: sessaoError } = await supabase.from("sessoes").select("user_id, status, segundos_acumulados").eq("id", sessao_id).maybeSingle();
    if (sessaoError || !sessao) return NextResponse.json({ error: "Sessão não encontrada" }, { status: 404 });
    const { error: deleteError } = await supabase.from("sessoes").delete().eq("id", sessao_id);
    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });
    const { data: alvo } = await service.from("users").select("username").eq("id", sessao.user_id).maybeSingle();
    await registrarAuditoria(service, user!, "admin:cancelar", `Sessão ${sessao_id} cancelada (${sessao.status}, ${sessao.segundos_acumulados || 0}s acumulados).`, { id: sessao.user_id, username: alvo?.username || null });
    return NextResponse.json({ ok: true });
  } else {
    return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
