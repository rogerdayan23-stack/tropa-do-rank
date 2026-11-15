import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase";

export async function GET() {
  const supabase = createClient();
  const agora = new Date();
  const limite8h = 8 * 60 * 60 * 1000;

  const { data, error } = await supabase.from("sessoes").select("*, users(apelido)").eq("status", "ativa");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  for (const s of (data || [])) {
    if (s.inicio && Date.now() - new Date(s.inicio).getTime() > limite8h) {
      await supabase.from("sessoes").update({ status: "expirada", fim: new Date().toISOString() }).eq("id", s.id);
    }
  }

  return NextResponse.json({ ok: true });
}
