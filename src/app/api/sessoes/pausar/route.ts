import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { getUserFromRequest } from "@/lib/auth";

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

  const inicio = new Date(sessao.inicio).getTime();
  const acumulado = (sessao.segundos_acumulados || 0) + Math.floor((Date.now() - inicio) / 1000);

  const { data, error } = await service
    .from("sessoes")
    .update({ status: "pausada", segundos_acumulados: acumulado, ultima_atividade: agora })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ sessao: { id: data.id, status: data.status, segundos_acumulados: data.segundos_acumulados } });
}
