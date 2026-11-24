import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase";
import { calcularDuracaoSessao, type SessaoRow } from "@/lib/sessao";
import { calcularSegundosAtivosPorDia } from "@/lib/finance.mjs";

type Periodo = "semana" | "mes" | "geral";
type Evento = { user_id: string | null; acao: string; criado_em: string };

const META_SEMANAL_SEGUNDOS = 10 * 60 * 60;
const ACOES_SESSAO = [
  "iniciar_sessao", "pausar_sessao", "retomar_sessao", "encerrar_sessao",
  "admin:pausar_sessao", "admin:retomar_sessao",
];

function inicioPeriodo(tipo: Exclude<Periodo, "geral">, agora: Date) {
  const inicio = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate()));
  if (tipo === "semana") {
    const diasDesdeSegunda = (inicio.getUTCDay() + 6) % 7;
    inicio.setUTCDate(inicio.getUTCDate() - diasDesdeSegunda);
  } else {
    inicio.setUTCDate(1);
  }
  return inicio;
}

function acumularEventos(eventos: Evento[], ate: number, desde: number) {
  const eventosPorJogador = new Map<string, Evento[]>();
  for (const evento of eventos) {
    if (!evento.user_id) continue;
    const lista = eventosPorJogador.get(evento.user_id) || [];
    lista.push(evento);
    eventosPorJogador.set(evento.user_id, lista);
  }

  const porJogador = new Map<string, Map<string, number>>();
  eventosPorJogador.forEach((lista, id) => {
    porJogador.set(id, calcularSegundosAtivosPorDia(lista, desde, ate));
  });
  return porJogador;
}

function sequenciaAtual(dias: Map<string, number>, agora: Date) {
  const hoje = Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate());
  const hojeKey = new Date(hoje).toISOString().slice(0, 10);
  let cursor = dias.get(hojeKey) ? hoje : hoje - 24 * 60 * 60 * 1000;
  let total = 0;
  while (total < 90) {
    const chave = new Date(cursor).toISOString().slice(0, 10);
    if (!dias.get(chave)) break;
    total++;
    cursor -= 24 * 60 * 60 * 1000;
  }
  return total;
}

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const tipo = (new URL(req.url).searchParams.get("periodo") || "geral") as Periodo;
  if (!["semana", "mes", "geral"].includes(tipo)) {
    return NextResponse.json({ error: "Período inválido" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const agora = new Date();
  const agoraMs = agora.getTime();
  const inicioSemana = inicioPeriodo("semana", agora);
  const fimSemana = new Date(inicioSemana.getTime() + 7 * 24 * 60 * 60 * 1000);
  const inicioSelecionado = tipo === "geral" ? null : inicioPeriodo(tipo, agora);
  const fimSelecionado = tipo === "semana"
    ? fimSemana
    : tipo === "mes"
      ? new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() + 1, 1))
      : null;

  const [{ data: usuarios, error: usuariosError }, { data: eventos, error: eventosError }, { data: sessoes, error: sessoesError }] = await Promise.all([
    supabase.from("users").select("id,apelido,username,avatar_url,total_segundos").order("username", { ascending: true }),
    supabase.from("logs").select("user_id,acao,criado_em").in("acao", ACOES_SESSAO)
      .gte("criado_em", new Date(agoraMs - 96 * 24 * 60 * 60 * 1000).toISOString())
      .lte("criado_em", agora.toISOString()).order("criado_em", { ascending: true }).limit(50000),
    supabase.from("sessoes").select("id,user_id,inicio,fim,status,segundos_acumulados,ultima_atividade")
      .order("segundos_acumulados", { ascending: false }).limit(5000),
  ]);

  if (usuariosError || eventosError || sessoesError) {
    console.error("[RANKING] Falha ao carregar classificação:", usuariosError || eventosError || sessoesError);
    return NextResponse.json({ error: "Não foi possível carregar a classificação" }, { status: 500 });
  }

  const diasRecentes = acumularEventos((eventos || []) as Evento[], agoraMs, agoraMs - 90 * 24 * 60 * 60 * 1000);
  const deSemana = acumularEventos((eventos || []) as Evento[], Math.min(fimSemana.getTime(), agoraMs), inicioSemana.getTime());
  const dePeriodo = inicioSelecionado && fimSelecionado
    ? acumularEventos((eventos || []) as Evento[], Math.min(fimSelecionado.getTime(), agoraMs), inicioSelecionado.getTime())
    : null;

  const recordes = new Map<string, number>();
  for (const sessao of (sessoes || []) as SessaoRow[]) {
    const duracao = calcularDuracaoSessao(sessao);
    recordes.set(sessao.user_id, Math.max(recordes.get(sessao.user_id) || 0, duracao));
  }

  const ranking = (usuarios || []).map((jogador) => {
    const dias = diasRecentes.get(jogador.id) || new Map<string, number>();
    const diasSemana = deSemana.get(jogador.id) || new Map<string, number>();
    const diasPeriodo = dePeriodo?.get(jogador.id) || new Map<string, number>();
    const totalSelecionado = tipo === "geral"
      ? Number(jogador.total_segundos || 0)
      : Array.from(diasPeriodo.values()).reduce((total, segundos) => total + segundos, 0);
    const horasMeta = Array.from(diasSemana.values()).reduce((total, segundos) => total + segundos, 0);
    return {
      id: jogador.id,
      apelido: jogador.apelido || jogador.username,
      username: jogador.username || jogador.apelido,
      avatar_url: jogador.avatar_url || null,
      total_segundos: totalSelecionado,
      medalha: "",
      eh_voce: jogador.id === user.id,
      meta_semanal_segundos: horasMeta,
      sequencia_dias: sequenciaAtual(dias, agora),
      recorde_sessao_segundos: recordes.get(jogador.id) || 0,
    };
  }).sort((a, b) => b.total_segundos - a.total_segundos || a.username.localeCompare(b.username))
    .map((jogador, index) => ({ ...jogador, posicao: index + 1, medalha: ["🥇", "🥈", "🥉"][index] || "" }));

  const periodo = {
    tipo,
    inicio: inicioSelecionado?.toISOString().slice(0, 10) || null,
    fim: fimSelecionado ? new Date(Math.min(fimSelecionado.getTime() - 1, agoraMs)).toISOString().slice(0, 10) : null,
  };

  return NextResponse.json({ ranking, periodo, meta_semanal_segundos: META_SEMANAL_SEGUNDOS }, { headers: { "Cache-Control": "no-store" } });
}
