import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { getUserFromRequest } from "@/lib/auth";
import { STATUS_PAUSADA, STATUS_ATIVA, construirAtualizacaoSessao, logContagemSessao } from "@/lib/sessao";

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

  if (fetchError || !sessao || sessao.status !== STATUS_PAUSADA) {
    return NextResponse.json({ error: "Sessão pausada não encontrada" }, { status: 404 });
  }

  // Acumula o tempo que já havia sido pausado antes de retomar
  const { update } = construirAtualizacaoSessao(sessao, agora);
  const { data, error } = await service
    .from("sessoes")
    .update({
      inicio: agora,
      status: STATUS_ATIVA,
      ultima_atividade: agora,
      segundos_acumulados: update.segundos_acumulados,
    })
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  logContagemSessao(data.id, data.segundos_acumulados || 0, "retomada-manual");

  return NextResponse.json({
    sessao: { id: data.id, inicio: data.inicio, status: data.status, segundos_acumulados: data.segundos_acumulados },
  });
}