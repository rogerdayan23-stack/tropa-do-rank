import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { getUserFromRequest } from "@/lib/auth";
import { STATUS_ATIVA, calcularDuracaoSessao, logContagemSessao } from "@/lib/sessao";

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

  if (fetchError || !sessao) {
    return NextResponse.json({ error: "Sessão não encontrada" }, { status: 404 });
  }

  const acumulado = calcularDuracaoSessao(sessao);

  const { error: updError } = await service
    .from("sessoes")
    .update({ status: "encerrada", fim: agora, segundos_acumulados: acumulado, ultima_atividade: agora })
    .eq("id", id);

  if (updError) return NextResponse.json({ error: updError.message }, { status: 500 });

  const { data: usr } = await service.from("users").select("total_segundos").eq("id", user.id).single();
  const novoTotal = ((usr?.total_segundos as number) || 0) + acumulado;
  await service.from("users").update({ total_segundos: novoTotal }).eq("id", user.id);

  await service.from("logs").insert({
    user_id: user.id,
    acao: "encerrar_sessao",
    detalhe: `Sessão encerrada com ${acumulado} segundos`,
    admin_id: null,
    criado_em: agora,
  });

  logContagemSessao(id, acumulado, "encerrada-manual");

  return NextResponse.json({ ok: true, total_segundos: acumulado });
}

