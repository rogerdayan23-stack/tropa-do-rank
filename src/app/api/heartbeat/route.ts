import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase";
import { getUserFromRequest } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const user = await getUserFromRequest();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { id } = await req.json();
  const agora = new Date().toISOString();

  const supabase = createClient();
  const update: any = { ultima_atividade: agora };
  if (id) update.id = id;

  const query = supabase.from("sessoes").update(update);
  if (id) query.eq("id", id).eq("user_id", user.id);
  else query.eq("user_id", user.id).eq("status", "ativa").order("inicio", { ascending: false }).limit(1);

  const { error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
