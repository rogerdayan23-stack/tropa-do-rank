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

  const { data, error } = await service
    .from("sessoes")
    .update({ inicio: agora, status: "ativa", ultima_atividade: agora })
    .eq("id", id)
    .eq("user_id", user.id)
    .in("status", ["pausada"])
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ sessao: { id: data.id, inicio: data.inicio, status: data.status } });
}
