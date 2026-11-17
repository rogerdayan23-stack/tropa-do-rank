import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { getUserFromRequest } from "@/lib/auth";
import { calcularDuracaoSessao, logContagemSessao, STATUS_ATIVA, type SessaoRow } from "@/lib/sessao";
import { expirarSessoesVencidas } from "@/lib/sessao-server";

export async function GET() {
  const user = await getUserFromRequest();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const service = createServiceClient();
  const consultarSessoes = () => service
    .from("sessoes")
    .select("*")
    .eq("user_id", user.id)
    .order("inicio", { ascending: false });

  let { data, error } = await consultarSessoes();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  try {
    const expiradas = await expirarSessoesVencidas(service, (data || []) as SessaoRow[]);
    if (expiradas > 0) {
      const atualizadas = await consultarSessoes();
      if (atualizadas.error) return NextResponse.json({ error: atualizadas.error.message }, { status: 500 });
      data = atualizadas.data;
    }
  } catch (expireError) {
    const message = expireError instanceof Error ? expireError.message : "Falha ao encerrar sessão vencida";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const sessoes = (data || []).map((s: any) => {
    const duracao = calcularDuracaoSessao(s);
    if (s.status === STATUS_ATIVA) {
      logContagemSessao(s.id, duracao, "total-consultado");
    }
    return {
      id: s.id,
      inicio: s.inicio,
      fim: s.fim,
      duracao,
      segundos_acumulados: s.segundos_acumulados || 0,
      status: s.status,
      ultima_atividade: s.ultima_atividade,
    };
  });

  return NextResponse.json({ sessoes });
}
