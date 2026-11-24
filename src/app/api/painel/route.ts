import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase";
import { calcularDuracaoSessao, type SessaoRow } from "@/lib/sessao";
import { expirarSessoesVencidas } from "@/lib/sessao-server";

export async function GET() {
  const user = await getUserFromRequest();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const supabase = createServiceClient();
  const consultaInicial = await supabase
    .from("sessoes")
    .select("id,user_id,inicio,status,segundos_acumulados,ultima_atividade")
    .in("status", ["ativa", "pausada"])
    .order("inicio", { ascending: false });

  if (consultaInicial.error) {
    console.error("[PAINEL] Erro ao consultar sessões da equipe:", consultaInicial.error);
    return NextResponse.json({ error: "Não foi possível carregar o status da equipe" }, { status: 500 });
  }
  let sessoes = consultaInicial.data;

  try {
    const expiradas = await expirarSessoesVencidas(supabase, (sessoes || []) as SessaoRow[]);
    if (expiradas) {
      const atualizadas = await supabase
        .from("sessoes")
        .select("id,user_id,inicio,status,segundos_acumulados,ultima_atividade")
        .in("status", ["ativa", "pausada"])
        .order("inicio", { ascending: false });
      if (atualizadas.error) throw atualizadas.error;
      sessoes = atualizadas.data;
    }
  } catch (expireError) {
    console.error("[PAINEL] Falha ao finalizar sessão vencida:", expireError);
    return NextResponse.json({ error: "Não foi possível atualizar as sessões vencidas" }, { status: 500 });
  }

  const sessoesPorUsuario = new Map<string, SessaoRow>();
  for (const sessao of (sessoes || []) as SessaoRow[]) {
    if (sessao.user_id && !sessoesPorUsuario.has(sessao.user_id)) sessoesPorUsuario.set(sessao.user_id, sessao);
  }

  const ids = Array.from(sessoesPorUsuario.keys());
  if (!ids.length) return NextResponse.json({ sessoes: [] }, { headers: { "Cache-Control": "no-store" } });

  const { data: usuarios, error: usuariosError } = await supabase
    .from("users")
    .select("id,username,apelido,avatar_url")
    .in("id", ids);

  if (usuariosError) {
    console.error("[PAINEL] Erro ao consultar jogadores ativos:", usuariosError);
    return NextResponse.json({ error: "Não foi possível carregar os jogadores" }, { status: 500 });
  }

  const porId = new Map((usuarios || []).map((usuario) => [usuario.id, usuario]));
  const resultado = Array.from(sessoesPorUsuario.values()).map((sessao) => {
    const jogador = porId.get(sessao.user_id);
    return {
      id: sessao.id,
      user_id: sessao.user_id,
      jogador: jogador?.apelido || jogador?.username || "Jogador",
      avatar_url: jogador?.avatar_url || null,
      status: sessao.status,
      segundos: calcularDuracaoSessao(sessao),
      inicio: sessao.inicio,
      ultima_atividade: sessao.ultima_atividade,
    };
  }).sort((a, b) => (a.status === b.status ? a.jogador.localeCompare(b.jogador) : a.status === "ativa" ? -1 : 1));

  return NextResponse.json({ sessoes: resultado }, { headers: { "Cache-Control": "no-store" } });
}
