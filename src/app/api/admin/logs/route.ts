import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase";
import { getUserFromRequest } from "@/lib/auth";

export async function GET() {
  const user = await getUserFromRequest();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const supabase = createClient();
  const { data, error } = await supabase
    .from("logs")
    .select("*, admin:users!logs_admin_id_fkey(apelido)")
    .order("criado_em", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ logs: data || [] });
}
