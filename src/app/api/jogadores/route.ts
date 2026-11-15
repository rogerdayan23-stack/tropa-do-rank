import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase";

export async function GET() {
  const user = await getUserFromRequest();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("users")
        .select("id, username, role, avatar_url, criado_em")
      .order("username", { ascending: true });

    if (error) throw error;

    return NextResponse.json({ jogadores: data || [] });
  } catch (error: any) {
    console.error("Erro ao listar jogadores:", error);
    return NextResponse.json({ error: "Erro interno ao buscar jogadores" }, { status: 500 });
  }
}
