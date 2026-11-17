import { NextResponse } from "next/server";
import { getUserFromRequest, isManager } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase";

export async function GET() {
  const user = await getUserFromRequest();
  if (!user || !isManager(user)) {
    return NextResponse.json({ error: "Acesso restrito aos administradores" }, { status: 403 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("users")
    .select("id, username, apelido, role, avatar_url, total_segundos")
    .order("username", { ascending: true });

  if (error) {
    console.error("[MONITORAMENTO] Erro ao carregar jogadores:", error);
    return NextResponse.json({ error: "Não foi possível carregar os jogadores" }, { status: 500 });
  }

  return NextResponse.json({ users: data || [] });
}

