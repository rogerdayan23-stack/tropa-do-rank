import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase";

export async function GET() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("users")
    .select("apelido, username, avatar_url, total_segundos")
    .order("total_segundos", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const medalhas = ["🥇", "🥈", "🥉", "", ""];
  const ranking = (data || []).map((u: any, i: number) => ({
    posicao: i + 1,
    apelido: u.apelido,
    username: u.username || u.apelido,
    avatar_url: u.avatar_url || null,
    total_segundos: u.total_segundos || 0,
    medalha: medalhas[i] || "",
  }));

  return NextResponse.json({ ranking });
}
