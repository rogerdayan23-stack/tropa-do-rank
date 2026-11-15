import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { getUserFromRequest } from "@/lib/auth";

export async function GET() {
  const user = await getUserFromRequest();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const service = createServiceClient();
  const { data, error } = await service
    .from("sessoes")
    .select("*")
    .eq("user_id", user.id)
    .order("inicio", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const sessoes = (data || []).map((s: any) => {
    let duracao = s.segundos_acumulados || 0;
    if (s.status === "ativa" && s.inicio) {
      duracao += Math.floor((Date.now() - new Date(s.inicio).getTime()) / 1000);
    }
    return {
      id: s.id,
      inicio: s.inicio,
      fim: s.fim,
      duracao,
      status: s.status,
      ultima_atividade: s.ultima_atividade,
    };
  });

  return NextResponse.json({ sessoes });
}
