import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { getUserFromRequest } from "@/lib/auth";
import { STATUS_PAUSADA, calcularDuracaoSessao, logContagemSessao } from "@/lib/sessao";
import { registrarLog } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const user = await getUserFromRequest();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "ID da sessão obrigatório" }, { status: 400 });

  const agora = new Date().toISOString();
  const service = createServiceClient();

  const { data: sessao, error: fetchError } = await service
    .from("sessoes")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (fetchError || !sessao || sessao.status !== "ativa") {
    return NextResponse.json({ error: "Sessão ativa não encontrada" }, { status: 404 });
  }

  const segundosAcumulados = calcularDuracaoSessao(sessao);
  const { data, error } = await service
    .from("sessoes")
    .update({ status: STATUS_PAUSADA, segundos_acumulados: segundosAcumulados, ultima_atividade: agora })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await registrarLog(service, {
    user_id: user.id,
    sessao_id: data.id,
    acao: "pausar_sessao",
    detalhe: "Contagem pausada.",
    admin_id: null,
    criado_em: agora,
  });

  logContagemSessao(data.id, data.segundos_acumulados || 0, "pausada-manual");

  return NextResponse.json({
    sessao: { id: data.id, status: data.status, segundos_acumulados: data.segundos_acumulados },
  });
}
