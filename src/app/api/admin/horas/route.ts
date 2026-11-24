import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { getUserFromRequest, isManager } from "@/lib/auth";
import { LIMITE_SESSAO_SEGUNDOS } from "@/lib/sessao";

const PAGE_SIZE = 50;
const ACOES_CONTAGEM = [
  "iniciar_sessao",
  "pausar_sessao",
  "retomar_sessao",
  "encerrar_sessao",
  "admin:pausar_sessao",
  "admin:retomar_sessao",
  "admin:encerrar_sessao",
];

function colunaSessaoAusente(error: { code?: string; message?: string } | null): boolean {
  return (error?.code === "42703" || error?.code === "PGRST204") && /sessao_id/i.test(error.message || "");
}

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest();
  if (!user) return NextResponse.json({ error: "Sessão inválida ou expirada. Entre novamente." }, { status: 401 });
  if (!isManager(user)) return NextResponse.json({ error: "Apenas administradores e co-admins podem consultar estes horários." }, { status: 403 });

  const pagina = Math.max(1, Math.min(10000, Number.parseInt(new URL(req.url).searchParams.get("pagina") || "1", 10) || 1));
  const inicio = (pagina - 1) * PAGE_SIZE;
  const supabase = createServiceClient();
  const consulta = await supabase
    .from("logs")
    .select("id,user_id,sessao_id,acao,criado_em", { count: "exact" })
    .in("acao", ACOES_CONTAGEM)
    .order("criado_em", { ascending: false })
    .range(inicio, inicio + PAGE_SIZE - 1);

  let eventos = (consulta.data || []) as {
    id: string;
    user_id: string | null;
    sessao_id: string | null;
    acao: string;
    criado_em: string;
  }[];
  let total = consulta.count || 0;
  let consultaError = consulta.error;

  if (colunaSessaoAusente(consultaError)) {
    const legado = await supabase
      .from("logs")
      .select("id,user_id,acao,criado_em", { count: "exact" })
      .in("acao", ACOES_CONTAGEM)
      .order("criado_em", { ascending: false })
      .range(inicio, inicio + PAGE_SIZE - 1);

    consultaError = legado.error;
    total = legado.count || 0;
    eventos = (legado.data || []).map((evento) => ({ ...evento, sessao_id: null }));

    if (!consultaError && eventos.length > 0) {
      const userIds = Array.from(new Set(eventos.map((evento) => evento.user_id).filter(Boolean))) as string[];
      const instantes = eventos.map((evento) => Date.parse(evento.criado_em)).filter(Number.isFinite);
      if (userIds.length > 0 && instantes.length > 0) {
        const menorData = new Date(Math.min(...instantes)).toISOString();
        const maiorData = new Date(Math.max(...instantes)).toISOString();
        const { data: sessoes, error: sessoesError } = await supabase
          .from("sessoes")
          .select("id,user_id,inicio,fim")
          .in("user_id", userIds)
          .lte("inicio", maiorData)
          .or(`fim.is.null,fim.gte.${menorData}`);

        if (sessoesError) consultaError = sessoesError;
        else {
          const sessoesOrdenadas = [...(sessoes || [])].sort((a, b) => {
            const fimA = a.fim ? Date.parse(a.fim) : Number.POSITIVE_INFINITY;
            const fimB = b.fim ? Date.parse(b.fim) : Number.POSITIVE_INFINITY;
            return fimA - fimB || Date.parse(b.inicio || "") - Date.parse(a.inicio || "");
          });
          eventos = eventos.map((evento) => {
            const instante = Date.parse(evento.criado_em);
            const sessao = sessoesOrdenadas.find((candidata) => {
              const inicioSessao = Date.parse(candidata.inicio || "");
              const fimSessao = candidata.fim ? Date.parse(candidata.fim) : Number.POSITIVE_INFINITY;
              return candidata.user_id === evento.user_id && instante >= inicioSessao && instante <= fimSessao;
            });
            return { ...evento, sessao_id: sessao?.id || null };
          });
        }
      }
    }
  }

  const idsSessoes = Array.from(new Set(eventos.map((evento) => evento.sessao_id).filter(Boolean))) as string[];
  let sessoes: { id: string; user_id: string; status: string; fim: string | null; ultima_atividade: string | null }[] = [];
  if (idsSessoes.length > 0) {
    const consultaSessoes = await supabase
      .from("sessoes")
      .select("id,user_id,status,fim,ultima_atividade")
      .in("id", idsSessoes);
    if (consultaSessoes.error) consultaError = consultaSessoes.error;
    else sessoes = consultaSessoes.data || [];
  }

  if (!consultaError) {
    const agora = Date.now();
    for (const sessao of sessoes) {
      const daSessao = eventos
        .filter((evento) => evento.sessao_id === sessao.id)
        .sort((a, b) => Date.parse(a.criado_em) - Date.parse(b.criado_em));
      const ultima = daSessao[daSessao.length - 1];
      if (!ultima) continue;

      const acaoUltima = ultima.acao.replace(/^admin:/, "");
      let acaoFinal: "pausar_sessao" | "encerrar_sessao" | null = null;
      let criadoEmFinal: string | null = null;

      if (sessao.status === "pausada" && acaoUltima !== "pausar_sessao") {
        acaoFinal = "pausar_sessao";
        criadoEmFinal = sessao.ultima_atividade;
      } else if (["encerrada", "expirada"].includes(sessao.status) && acaoUltima !== "encerrar_sessao") {
        acaoFinal = "encerrar_sessao";
        criadoEmFinal = sessao.fim || sessao.ultima_atividade;
      } else if (sessao.status === "ativa" && ["iniciar_sessao", "retomar_sessao"].includes(acaoUltima)) {
        const inicioAtivo = Date.parse(ultima.criado_em);
        if (Number.isFinite(inicioAtivo) && agora - inicioAtivo >= LIMITE_SESSAO_SEGUNDOS * 1000) {
          acaoFinal = "encerrar_sessao";
          criadoEmFinal = new Date(inicioAtivo + LIMITE_SESSAO_SEGUNDOS * 1000).toISOString();
        }
      }

      if (!acaoFinal || !criadoEmFinal || Date.parse(criadoEmFinal) <= Date.parse(ultima.criado_em)) continue;
      eventos.push({
        id: `sintetico-${sessao.id}-${acaoFinal}`,
        user_id: sessao.user_id,
        sessao_id: sessao.id,
        acao: acaoFinal,
        criado_em: criadoEmFinal,
      });
    }
  }

  if (consultaError) {
    console.error("[HORAS] Erro ao consultar eventos de contagem:", consultaError);
    return NextResponse.json({ error: "Não foi possível carregar os horários de contagem." }, { status: 500 });
  }

  const ids = Array.from(new Set(eventos.map((evento) => evento.user_id).filter(Boolean))) as string[];
  const nomes = new Map<string, string>();
  if (ids.length) {
    const { data: usuarios, error: usuariosError } = await supabase.from("users").select("id,username,apelido").in("id", ids);
    if (usuariosError) console.error("[HORAS] Erro ao resolver jogadores:", usuariosError);
    else for (const usuario of usuarios || []) nomes.set(usuario.id, usuario.apelido || usuario.username);
  }

  return NextResponse.json({
    eventos: eventos.map((evento) => ({
      ...evento,
      acao: evento.acao.replace(/^admin:/, "") as typeof evento.acao,
      jogador: evento.user_id ? nomes.get(evento.user_id) || "Jogador removido" : "Jogador desconhecido",
    })),
    pagina,
    por_pagina: PAGE_SIZE,
    total,
    tem_mais: inicio + eventos.length < total,
  }, { headers: { "Cache-Control": "no-store" } });
}
