import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase";
import { createServiceClient } from "@/lib/supabase";
import { getUserFromRequest, isAdminUser } from "@/lib/auth";

async function requireAdmin() {
  const user = await getUserFromRequest();
  if (!user || !isAdminUser(user)) return { response: NextResponse.json({ error: "Acesso negado" }, { status: 403 }), user: null };
  return { response: null, user };
}

export async function GET() {
  const { response, user } = await requireAdmin();
  if (response) return response;

  const supabase = createClient();
  const { data, error } = await supabase
    .from("sessoes")
    .select("*, users(apelido)")
    .in("status", ["ativa", "pausada"])
    .order("inicio", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const sessoes = (data || []).map((s: any) => ({
    id: s.id,
    user_id: s.user_id,
    apelido: s.users?.apelido || "?",
    inicio: s.inicio,
    status: s.status,
    segundos_acumulados: s.segundos_acumulados || 0,
    ultima_atividade: s.ultima_atividade,
  }));

  return NextResponse.json({ sessoes });
}

export async function POST(req: NextRequest) {
  const { response, user } = await requireAdmin();
  if (response) return response;

  const { acao, sessao_id, minutos } = await req.json();
  const agora = new Date().toISOString();
  const supabase = createClient();
  const service = createServiceClient();

  if (acao === "encerrar") {
    const { data: s, error: fe } = await supabase.from("sessoes").select("*").eq("id", sessao_id).single();
    if (fe || !s) return NextResponse.json({ error: "Sessão não encontrada" }, { status: 404 });
    let acumulado = s.segundos_acumulados || 0;
    if (s.status === "ativa" && s.inicio) {
      acumulado += Math.floor((Date.now() - new Date(s.inicio).getTime()) / 1000);
    }
    await supabase.from("sessoes").update({ status: "encerrada", fim: agora, segundos_acumulados: acumulado }).eq("id", sessao_id);
    const { data: usr } = await service.from("users").select("total_segundos").eq("id", s.user_id).single();
    const novoTotal = ((usr?.total_segundos as number) || 0) + acumulado;
    await service.from("users").update({ total_segundos: novoTotal }).eq("id", s.user_id);
  } else if (acao === "ajustar") {
    const ajuste = (minutos || 0) * 60;
    const { data: s } = await supabase.from("sessoes").select("segundos_acumulados").eq("id", sessao_id).single();
    const atual = ((s?.segundos_acumulados as number) || 0);
    await supabase.from("sessoes").update({ segundos_acumulados: atual + ajuste }).eq("id", sessao_id);
  } else if (acao === "cancelar") {
    await supabase.from("sessoes").delete().eq("id", sessao_id);
  }

  await service.from("logs").insert({
    user_id: user!.id,
    acao: `admin:${acao}`,
    detalhe: sessao_id,
    admin_id: user!.id,
    criado_em: agora,
  });

  return NextResponse.json({ ok: true });
}
