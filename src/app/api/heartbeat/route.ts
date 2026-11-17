import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { getUserFromRequest } from "@/lib/auth";
import { STATUS_ATIVA, STATUS_PAUSADA, STATUS_EXPIRADA, calcularDuracaoSessao, construirAtualizacaoSessao, LIMITE_SESSAO_SEGUNDOS, logContagemSessao } from "@/lib/sessao";

export async function POST(req: NextRequest) {
  const user = await getUserFromRequest();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { id } = await req.json();
  const agora = new Date().toISOString();
  const supabase = createServiceClient();

  // 1) Atualiza a sessão do usuário: acumula tempo e checa expiração
  const { data: sessao, error: fetchError } = await supabase
    .from("sessoes")
    .select("*")
    .eq("user_id", user.id)
    .in("status", [STATUS_ATIVA, STATUS_PAUSADA])
    .order("inicio", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  let sessaoId: string | null = null;
  let segundosAcumulados = 0;
  let expirou = false;
  let contabilizouExpiracao = false;

  if (sessao) {
    const { update, expirou: exp } = construirAtualizacaoSessao(sessao, agora);
    const updatePayload: Record<string, unknown> = { ultima_atividade: agora };

    if (sessao.status === STATUS_ATIVA) {
      updatePayload.segundos_acumulados = update.segundos_acumulados;
      if (exp) {
        updatePayload.status = STATUS_EXPIRADA;
        updatePayload.fim = agora;
        expirou = true;
      }
    } else if (sessao.status === STATUS_PAUSADA) {
      updatePayload.segundos_acumulados = update.segundos_acumulados;
    }

    const { data: atualizada, error: updError } = await supabase
      .from("sessoes")
      .update(updatePayload)
      .eq("id", sessao.id)
      .eq("status", sessao.status)
      .select("id")
      .maybeSingle();

    if (updError) {
      return NextResponse.json({ error: updError.message }, { status: 500 });
    }

    sessaoId = sessao.id;

    if (!atualizada) {
      // Outra requisição encerrou ou alterou essa sessão primeiro.
      const { data: estado, error: estadoError } = await supabase
        .from("sessoes")
        .select("status, segundos_acumulados")
        .eq("id", sessao.id)
        .maybeSingle();
      if (estadoError) return NextResponse.json({ error: estadoError.message }, { status: 500 });
      expirou = estado?.status === STATUS_EXPIRADA;
      segundosAcumulados = Number(estado?.segundos_acumulados || 0);
    } else {
      expirou = exp;
      contabilizouExpiracao = exp;
      segundosAcumulados = exp
        ? Math.min(Number(update.segundos_acumulados || 0), LIMITE_SESSAO_SEGUNDOS)
        : calcularDuracaoSessao(sessao);
      logContagemSessao(sessao.id, segundosAcumulados, expirou ? "expirou-5h" : "heartbeat");
    }
  }

  // 2) Se expirou, atualiza o total_segundos do usuário
  if (expirou && sessaoId && contabilizouExpiracao) {
    const { data: usr } = await supabase.from("users").select("total_segundos").eq("id", user.id).single();
    const novoTotal = ((usr?.total_segundos as number) || 0) + segundosAcumulados;
    await supabase.from("users").update({ total_segundos: novoTotal }).eq("id", user.id);
  }

  return NextResponse.json({
    ok: true,
    sessao_id: sessaoId,
    segundos_acumulados: segundosAcumulados,
    expirou,
    limite_segundos: LIMITE_SESSAO_SEGUNDOS,
  });
}
