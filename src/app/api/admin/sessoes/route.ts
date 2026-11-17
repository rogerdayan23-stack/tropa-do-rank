import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { getUserFromRequest, isAdminRole } from "@/lib/auth";
import { STATUS_ATIVA, STATUS_PAUSADA, STATUS_ENCERRADA, calcularDuracaoSessao, construirAtualizacaoSessao, LIMITE_SESSAO_SEGUNDOS, logContagemSessao, type SessaoRow } from "@/lib/sessao";
import { expirarSessoesVencidas } from "@/lib/sessao-server";

async function requireAdmin() {
  const user = await getUserFromRequest();
  if (!user || !isAdminRole(user)) return { response: NextResponse.json({ error: "Acesso negado" }, { status: 403 }), user: null };
  return { response: null, user };
}

export async function GET() {
  const { response, user } = await requireAdmin();
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
    .select("*, users(apelido)")
    .in("status", ["ativa", "pausada"])
    .order("inicio", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const sessoes = (data || []).map((s: any) => ({
    id: s.id,
    user_id: s.user_id,
    apelido: s.users?.apelido || "?",
    inicio: s.inicio,
    status: s.status,
    segundos_acumulados: s.segundos_acumulados || 0,
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

  if (acao === "pausar_todos") {
    const { data: ativas, error: listError } = await supabase.from("sessoes").select("*").eq("status", STATUS_ATIVA);
    if (listError) return NextResponse.json({ error: listError.message }, { status: 500 });
    let count = 0;
    for (const s of ativas || []) {
      const segundosAcumulados = calcularDuracaoSessao(s);
      const { error: e } = await supabase.from("sessoes").update({ status: STATUS_PAUSADA, segundos_acumulados: segundosAcumulados, ultima_atividade: agora }).eq("id", s.id);
      if (!e) { count++; logContagemSessao(s.id, segundosAcumulados, "pausar-todos-admin"); }
    }
    await service.from("logs").insert({ user_id: user!.id, acao: "admin:pausar_todos", detalhe: `${count} sessões pausadas`, admin_id: user!.id, criado_em: agora });
    return NextResponse.json({ ok: true, count });
  }

  if (acao === "despausar_todos") {
    const { data: pausadas, error: listError } = await supabase.from("sessoes").select("*").eq("status", STATUS_PAUSADA);
    if (listError) return NextResponse.json({ error: listError.message }, { status: 500 });
    let count = 0;
    for (const s of pausadas || []) {
      const { error: e } = await supabase.from("sessoes").update({ status: STATUS_ATIVA, inicio: agora, ultima_atividade: agora }).eq("id", s.id);
      if (!e) { count++; logContagemSessao(s.id, s.segundos_acumulados || 0, "despausar-todos-admin"); }
    }
    await service.from("logs").insert({ user_id: user!.id, acao: "admin:despausar_todos", detalhe: `${count} sessões retomadas`, admin_id: user!.id, criado_em: agora });
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
    await service.from("logs").insert({ user_id: user!.id, acao: "admin:contagem_horas", detalhe: `${atualizadas} atualizadas, ${expiradas} expiradas (limite ${LIMITE_SESSAO_SEGUNDOS}s)`, admin_id: user!.id, criado_em: agora });
    return NextResponse.json({ ok: true, atualizadas, expiradas });
  }

  if (acao === "encerrar") {
    const { data: s, error: fe } = await supabase.from("sessoes").select("*").eq("id", sessao_id).single();
    if (fe || !s) return NextResponse.json({ error: "Sessão não encontrada" }, { status: 404 });
    let acumulado = s.segundos_acumulados || 0;
    if (s.status === "ativa" && s.inicio) {
      acumulado += Math.floor((Date.now() - new Date(s.inicio).getTime()) / 1000);
    }
    await supabase.from("sessoes").update({ status: "encerrada", fim: agora, segundos_acumulados: acumulado }).eq("id", sessao_id);
    const { data: usr } = await service.from("users").select("total_segundos").eq("id", s.user_id).single();
    const novoTotal = ((usr?.total_segundos as number) || 0) + acumulado;
    await service.from("users").update({ total_segundos: novoTotal }).eq("id", s.user_id);
  } else if (acao === "ajustar") {
    const ajuste = (minutos || 0) * 60;
    const { data: s } = await supabase.from("sessoes").select("segundos_acumulados").eq("id", sessao_id).single();
    const atual = ((s?.segundos_acumulados as number) || 0);
    await supabase.from("sessoes").update({ segundos_acumulados: atual + ajuste }).eq("id", sessao_id);
  } else if (acao === "cancelar") {
    await supabase.from("sessoes").delete().eq("id", sessao_id);
  }

  await service.from("logs").insert({
    user_id: user!.id,
    acao: `admin:${acao}`,
    detalhe: sessao_id,
    admin_id: user!.id,
    criado_em: agora,
  });

  return NextResponse.json({ ok: true });
}
