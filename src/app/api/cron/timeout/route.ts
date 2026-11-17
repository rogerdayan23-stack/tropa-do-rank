import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { STATUS_ATIVA, type SessaoRow } from "@/lib/sessao";
import { expirarSessoesVencidas } from "@/lib/sessao-server";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET não configurado" }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase.from("sessoes").select("*").eq("status", STATUS_ATIVA);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  try {
    const expiradas = await expirarSessoesVencidas(supabase, (data || []) as SessaoRow[]);
    return NextResponse.json({ ok: true, expiradas });
  } catch (expireError) {
    const message = expireError instanceof Error ? expireError.message : "Falha ao encerrar sessões vencidas";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
