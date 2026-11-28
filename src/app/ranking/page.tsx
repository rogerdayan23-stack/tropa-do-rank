"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, ArrowUpRight, Clock3, Crown, Medal, RefreshCw, Trophy, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface RankingEntry {
  id: string;
  posicao: number;
  apelido: string;
  username?: string;
  avatar_url?: string | null;
  total_segundos: number;
  medalha?: string;
  eh_voce?: boolean;
  meta_semanal_segundos?: number;
  sequencia_dias?: number;
  recorde_sessao_segundos?: number;
}

type Periodo = "semana" | "mes" | "geral";

function formatHMS(segundos: number) {
  const total = Math.max(0, Math.floor(Number(segundos) || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((v) => v.toString().padStart(2, "0")).join(":");
}

function nomeJogador(jogador: RankingEntry) {
  return jogador.username || jogador.apelido;
}

function dataLocalHoje() {
  const agora = new Date();
  return new Date(agora.getTime() - agora.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function Avatar({ url, nome, grande = false }: { url?: string | null; nome: string; grande?: boolean }) {
  const src = url ? (url.startsWith("http") ? url : `/${url.replace(/^\//, "")}`) : null;
  return (
    <div className={cn(
      "flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/[0.06] font-bold text-primary",
      grande ? "h-16 w-16 text-xl ring-4 ring-rose-300/20" : "h-11 w-11 text-sm",
    )}>
      {src ? <img src={src} alt={nome} className="h-full w-full object-cover" /> : nome?.[0]?.toUpperCase() || "?"}
    </div>
  );
}

const tonsPosicao: Record<number, { label: string; border: string; badge: string; text: string; bar: string; icon: typeof Medal }> = {
  2: { label: "Vice", border: "border-slate-300/20", badge: "bg-slate-200 text-slate-900", text: "text-slate-200", bar: "from-slate-300 to-slate-100", icon: Medal },
  3: { label: "3º lugar", border: "border-amber-500/20", badge: "bg-amber-600 text-amber-50", text: "text-amber-200", bar: "from-amber-500 to-yellow-300", icon: Medal },
  4: { label: "Na disputa", border: "border-border/70", badge: "bg-secondary text-muted-foreground", text: "text-muted-foreground", bar: "from-rose-500 to-rose-300", icon: Activity },
};

export default function RankingPage() {
  const [ranking, setRanking] = useState<RankingEntry[]>([]);
  const [periodo, setPeriodo] = useState<Periodo>("semana");
  const [metaSemanal, setMetaSemanal] = useState(10 * 60 * 60);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(false);
  const [atualizadoEm, setAtualizadoEm] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const [res, resHoras] = await Promise.all([
        fetch(`/api/ranking?periodo=${periodo}`, { cache: "no-store" }),
        periodo === "semana"
          ? fetch(`/api/saldos?apenas_horas=true&data=${dataLocalHoje()}`, { cache: "no-store" })
          : Promise.resolve(null),
      ]);
      if (!res.ok) throw new Error("Falha ao carregar ranking");
      const data = await res.json();
      let rankingAtualizado: RankingEntry[] = data.ranking || [];
      if (resHoras) {
        if (!resHoras.ok) throw new Error("Falha ao sincronizar as horas da semana");
        const dadosHoras = await resHoras.json();
        const horasPorUsuario = new Map<string, number>((dadosHoras.jogadores || []).map((jogador: { id: string; horas_semana_segundos: number }) => [
          jogador.id,
          Math.max(0, Number(jogador.horas_semana_segundos) || 0),
        ]));
        rankingAtualizado = rankingAtualizado
          .map((jogador) => {
            const horas = horasPorUsuario.get(jogador.id) ?? 0;
            return { ...jogador, total_segundos: horas, meta_semanal_segundos: horas };
          })
          .sort((a, b) => b.total_segundos - a.total_segundos || nomeJogador(a).localeCompare(nomeJogador(b)))
          .map((jogador, index) => ({
            ...jogador,
            posicao: index + 1,
            medalha: ["🥇", "🥈", "🥉"][index] || "",
          }));
      }
      setRanking(rankingAtualizado);
      setMetaSemanal(data.meta_semanal_segundos || 10 * 60 * 60);
      setErro(false);
      setAtualizadoEm(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }));
    } catch {
      setErro(true);
    } finally {
      setLoading(false);
    }
  }, [periodo]);

  useEffect(() => {
    void carregar();
    const intervalo = setInterval(() => void carregar(), 10000);
    return () => clearInterval(intervalo);
  }, [carregar]);

  const lider = ranking[0];
  const segundo = ranking[1];
  const jogadorAtual = ranking.find((jogador) => jogador.eh_voce);
  const demais = ranking.slice(1);
  const totalTropa = ranking.reduce((total, jogador) => total + Math.max(0, jogador.total_segundos || 0), 0);
  const vantagemLider = lider && segundo ? Math.max(0, lider.total_segundos - segundo.total_segundos) : 0;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-7 pb-10">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-rose-300/20 bg-rose-300/[0.07] px-3 py-1 text-xs font-semibold text-rose-100">
            <Trophy size={14} /> Placar da tropa
          </div>
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">A corrida pelo <span className="text-primary">topo</span></h1>
          <p className="mt-2 text-sm text-muted-foreground">Compare o desempenho da tropa em diferentes períodos.</p>
          <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Período do ranking">
            {([
              ["semana", "Esta semana"],
              ["mes", "Este mês"],
              ["geral", "Geral"],
            ] as [Periodo, string][]).map(([valor, texto]) => (
              <Button key={valor} size="sm" variant={periodo === valor ? "default" : "outline"} onClick={() => setPeriodo(valor)} aria-pressed={periodo === valor}>
                {texto}
              </Button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 self-start rounded-xl border border-border/70 bg-card/60 px-3 py-2 sm:self-auto">
          {erro ? <span className="h-2 w-2 rounded-full bg-red-400" /> : <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />}
          <span className="text-xs text-muted-foreground">{erro ? "Falha ao atualizar" : atualizadoEm ? `Ao vivo · ${atualizadoEm}` : "Conectando"}</span>
          {erro && <Button variant="ghost" size="icon" className="ml-1 h-7 w-7" onClick={() => void carregar()} aria-label="Tentar novamente"><RefreshCw size={14} /></Button>}
        </div>
      </header>

      {loading ? (
        <div className="space-y-4">
          <div className="h-52 animate-pulse rounded-3xl border border-border/50 bg-card/50" />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((item) => <div key={item} className="h-52 animate-pulse rounded-2xl border border-border/50 bg-card/50" />)}
          </div>
        </div>
      ) : ranking.length === 0 ? (
        <section className="flex min-h-72 flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-card/30 px-6 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Trophy size={26} /></div>
          <h2 className="text-xl font-bold">A corrida ainda não começou</h2>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">Quando a tropa iniciar as sessões de farm, a classificação aparece aqui.</p>
        </section>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-3" aria-label="Suas conquistas">
            <article className="rounded-2xl border border-rose-300/20 bg-rose-300/[0.05] p-4">
              <div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold uppercase tracking-wide text-rose-100">Meta semanal</p><span className="text-xs text-muted-foreground">10h</span></div>
              <p className="mt-2 font-mono text-xl font-bold">{formatHMS(jogadorAtual?.meta_semanal_segundos || 0)}</p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.08]" role="progressbar" aria-label="Progresso da meta semanal" aria-valuemin={0} aria-valuemax={metaSemanal} aria-valuenow={Math.min(metaSemanal, jogadorAtual?.meta_semanal_segundos || 0)}>
                <div className="h-full rounded-full bg-gradient-to-r from-rose-400 to-fuchsia-300 transition-[width]" style={{ width: `${Math.min(100, Math.round(((jogadorAtual?.meta_semanal_segundos || 0) / metaSemanal) * 100))}%` }} />
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">{(jogadorAtual?.meta_semanal_segundos || 0) >= metaSemanal ? "Meta concluída!" : "Tempo acumulado nesta semana"}</p>
            </article>
            <article className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.04] p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-100">Sequência atual</p>
              <p className="mt-2 text-xl font-bold">{jogadorAtual?.sequencia_dias || 0} {(jogadorAtual?.sequencia_dias || 0) === 1 ? "dia" : "dias"}</p>
              <p className="mt-2 text-[11px] text-muted-foreground">Dias seguidos com tempo de farm registrado</p>
            </article>
            <article className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.04] p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-100">Recorde de sessão</p>
              <p className="mt-2 font-mono text-xl font-bold">{formatHMS(jogadorAtual?.recorde_sessao_segundos || 0)}</p>
              <p className="mt-2 text-[11px] text-muted-foreground">Sua sessão mais longa registrada</p>
            </article>
          </section>

          <section className="grid gap-4 xl:grid-cols-3" aria-label="Classificação dos jogadores">
            {lider && (
              <article className="relative isolate overflow-hidden rounded-3xl border border-rose-300/35 bg-gradient-to-br from-rose-400/[0.15] via-rose-500/[0.08] to-card p-5 shadow-[0_20px_70px_rgba(236,72,126,0.10)] sm:p-7 xl:col-span-3">
                <div className="pointer-events-none absolute -right-12 -top-24 -z-10 h-72 w-72 rounded-full bg-rose-400/[0.10] blur-3xl" />
                <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-4 sm:gap-5">
                    <div className="relative">
                      <Avatar url={lider.avatar_url} nome={nomeJogador(lider)} grande />
                      <span className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#11121a] bg-rose-300 text-slate-950"><Crown size={16} /></span>
                    </div>
                    <div className="min-w-0">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-200/20 bg-rose-200/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.15em] text-rose-100"><Crown size={12} /> Líder atual</span>
                      <h2 className="mt-2 truncate text-2xl font-black tracking-tight sm:text-3xl">{nomeJogador(lider)}</h2>
                      <p className="mt-1 text-sm text-rose-100/70">Na frente de {Math.max(0, ranking.length - 1)} {ranking.length === 2 ? "jogador" : "jogadores"}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:min-w-[360px]">
                    <div className="rounded-2xl border border-white/[0.07] bg-black/25 px-4 py-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Tempo acumulado</p>
                      <p className="mt-1 font-mono text-xl font-black tabular-nums text-rose-100 sm:text-2xl">{formatHMS(lider.total_segundos)}</p>
                    </div>
                    <div className="rounded-2xl border border-white/[0.07] bg-black/25 px-4 py-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Vantagem para o 2º</p>
                      <p className="mt-1 font-mono text-xl font-black tabular-nums text-white sm:text-2xl">{segundo ? formatHMS(vantagemLider) : "—"}</p>
                    </div>
                  </div>
                </div>
                <div className="mt-6 flex items-center justify-between border-t border-white/[0.08] pt-4 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-2"><Users size={14} /> {ranking.length} jogadores no placar</span>
                  <span className="inline-flex items-center gap-2"><Clock3 size={14} /> Tropa: {formatHMS(totalTropa)}</span>
                </div>
              </article>
            )}

            {demais.map((jogador) => {
              const anterior = ranking[jogador.posicao - 2];
              const progresso = lider && lider.total_segundos > 0
                ? Math.min(100, Math.round((jogador.total_segundos / lider.total_segundos) * 100))
                : 0;
              const distancia = Math.max(0, (anterior?.total_segundos || 0) - jogador.total_segundos);
              const estilo = tonsPosicao[jogador.posicao] || tonsPosicao[4];
              const Icone = estilo.icon;

              return (
                <article key={jogador.username || jogador.apelido} className={cn("group rounded-2xl border bg-card/55 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:bg-card/90 hover:shadow-xl sm:p-5", estilo.border)}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar url={jogador.avatar_url} nome={nomeJogador(jogador)} />
                      <div className="min-w-0">
                        <p className="truncate font-bold">{nomeJogador(jogador)}</p>
                        <p className={cn("mt-0.5 text-xs", estilo.text)}>{estilo.label}</p>
                      </div>
                    </div>
                    <span className={cn("inline-flex h-8 shrink-0 items-center gap-1 rounded-lg px-2.5 font-mono text-xs font-black", estilo.badge)}>
                      <Icone size={13} /> #{String(jogador.posicao).padStart(2, "0")}
                    </span>
                  </div>

                  <div className="mt-5 rounded-xl border border-white/[0.06] bg-black/20 px-3.5 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">Tempo de farm</p>
                    <p className="mt-1 font-mono text-2xl font-bold tabular-nums tracking-tight">{formatHMS(jogador.total_segundos)}</p>
                  </div>

                  <div className="mt-4">
                    <div className="mb-2 flex items-center justify-between text-[11px]">
                      <span className="text-muted-foreground">Do tempo do líder</span>
                      <span className="font-semibold tabular-nums text-foreground">{progresso}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]" role="progressbar" aria-label={`${nomeJogador(jogador)}: ${progresso}% do tempo do líder`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progresso}>
                      <div className={cn("h-full rounded-full bg-gradient-to-r transition-[width] duration-700", estilo.bar)} style={{ width: `${progresso}%` }} />
                    </div>
                  </div>

                  <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <ArrowUpRight size={13} className={estilo.text} />
                    {distancia === 0 ? "Empatado com a posição acima" : `${formatHMS(distancia)} atrás do ${jogador.posicao - 1}º`}
                  </p>
                </article>
              );
            })}
          </section>

          {ranking.length === 1 && (
            <div className="rounded-2xl border border-dashed border-border/70 px-5 py-4 text-center text-sm text-muted-foreground">
              Os outros jogadores aparecem aqui assim que acumularem tempo de farm.
            </div>
          )}

          <p className="text-center text-xs text-muted-foreground">O placar atualiza automaticamente a cada 10 segundos e considera o tempo total de farm registrado.</p>
        </>
      )}
    </div>
  );
}
