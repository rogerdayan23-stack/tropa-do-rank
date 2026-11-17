import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase";
import { createServiceClient } from "@/lib/supabase";
import { getUserFromRequest, isAdminRole } from "@/lib/auth";

export async function GET() {
  const user = await getUserFromRequest();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const supabase = createClient();
  const { data, error } = await supabase.from("regras").select("*").order("atualizado_em", { ascending: false }).limit(1).single();

  if (error && error.code !== "PGRST116") return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ texto: data?.texto || "" });
}

export async function PUT(req: NextRequest) {
  const user = await getUserFromRequest();
  if (!user || !isAdminRole(user)) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });

  const { texto } = await req.json();
  const agora = new Date().toISOString();
  const service = createServiceClient();

  const { data: existente } = await service.from("regras").select("id").limit(1).single();

  let result;
  if (existente) {
    result = await service.from("regras").update({ texto, atualizado_em: agora }).eq("id", existente.id);
  } else {
    result = await service.from("regras").insert({ texto, atualizado_em: agora });
  }

  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
