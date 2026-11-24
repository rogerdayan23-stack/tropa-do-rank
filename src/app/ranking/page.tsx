"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Trophy, Medal, Crown, Clock, TrendingUp, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

interface RankingEntry {
  posicao: number;
  apelido: string;
  username?: string;
  avatar_url?: string | null;
  total_segundos: number;
  medalha?: string;
}

function formatHMS(segundos: number) {
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  const s = Math.floor(segundos % 60);
  return [h, m, s].map((v) => v.toString().padStart(2, "0")).join(":");
}

function nomeJogador(u: RankingEntry) {
  return u.username || u.apelido;
}

function Avatar({
  url,
  nome,
  size = "md",
}: {
  url?: string | null;
  nome: string;
  size?: "sm" | "md" | "lg";
}) {
  const src = url ? (url.startsWith("http") ? url : `/${url.replace(/^\//, "")}`) : null;
  const dimensoes = size === "lg" ? "h-20 w-20 text-2xl" : size === "sm" ? "h-8 w-8 text-xs" : "h-10 w-10 text-sm";

  return (
    <div
      className={cn(
        "rounded-full overflow-hidden bg-primary/15 border border-white/10 flex items-center justify-center flex-shrink-0",
        dimensoes
      )}
    >
      {src ? (
        <img src={src} alt={nome} className="h-full w-full object-cover" />
      ) : (
        <span className="font-black text-primary">{nome?.[0]?.toUpperCase() || "?"}</span>
      )}
    </div>
  );
}

const estiloPodio: Record<
  number,
  {
    borda: string;
    fundo: string;
    texto: string;
    icone: typeof Trophy;
    rotulo: string;
    badge: string;
    anel: string;
    altura: string;
  }
> = {
  1: {
    borda: "border-rose-300/55",
    fundo: "bg-gradient-to-b from-rose-400/20 via-rose-500/5 to-transparent",
    texto: "text-rose-200",
    icone: Crown,
    rotulo: "Campeão",
    badge: "bg-rose-300 text-slate-950",
    anel: "ring-rose-300/50",
    altura: "sm:-translate-y-6",
  },
  2: {
    borda: "border-slate-300/40",
    fundo: "bg-gradient-to-b from-slate-400/15 via-slate-400/5 to-transparent",
    texto: "text-slate-200",
    icone: Medal,
    rotulo: "Vice",
    badge: "bg-slate-300 text-black",
    anel: "ring-slate-300/40",
    altura: "",
  },
  3: {
    borda: "border-cyan-400/35",
    fundo: "bg-gradient-to-b from-cyan-400/12 via-sky-500/5 to-transparent",
    texto: "text-cyan-200",
    icone: Medal,
    rotulo: "3º lugar",
    badge: "bg-cyan-500/80 text-slate-950",
    anel: "ring-cyan-300/35",
    altura: "",
  },
};

function PodioCard({ u }: { u: RankingEntry }) {
  const estilo = estiloPodio[u.posicao] || estiloPodio[3];
  const Icone = estilo.icone;
  const primeiro = u.posicao === 1;

  return (
    <div
      className={cn(
        "group relative rounded-2xl border bg-card/60 backdrop-blur-sm p-5 text-center transition-all duration-300 hover:scale-105 hover:shadow-2xl",
        estilo.borda,
        estilo.fundo,
        primeiro
          ? "shadow-[0_0_45px_rgba(236,72,126,0.14)] sm:p-6"
          : "shadow-lg",
        estilo.altura
      )}
    >
      <div
        className={cn(
          "absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-0.5 text-[10px] font-black uppercase tracking-widest",
          estilo.badge
        )}
      >
        {u.posicao}º
      </div>

      <div className="mt-3 flex flex-col items-center gap-3">
        <div className="relative">
          <div
            className={cn(
              "rounded-full p-1 ring-2",
              estilo.anel,
              primeiro && "ring-4"
            )}
          >
            <Avatar url={u.avatar_url} nome={nomeJogador(u)} size={primeiro ? "lg" : "md"} />
          </div>
          <span
            className={cn(
              "absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#0a0a0a]",
              estilo.badge
            )}
          >
            <Icone size={14} strokeWidth={2.5} />
          </span>
        </div>

        <div className="min-w-0">
          <p className={cn("truncate font-black tracking-tight", primeiro ? "text-xl" : "text-base")}>
            {nomeJogador(u)}
          </p>
          <p className={cn("text-[10px] font-semibold uppercase tracking-widest", estilo.texto)}>
            {estilo.rotulo}
          </p>
        </div>

        <div className="w-full rounded-xl border border-white/5 bg-black/40 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Tempo total</p>
          <p className={cn("font-mono font-bold", primeiro ? "text-2xl text-rose-200" : "text-lg")}>
            {formatHMS(u.total_segundos)}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function RankingPage() {
  const [ranking, setRanking] = useState<RankingEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    carregar();
    const t = setInterval(carregar, 10000);
    return () => clearInterval(t);
  }, []);

  async function carregar() {
    try {
      const res = await fetch("/api/ranking");
      const data = await res.json();
      setRanking(data.ranking || []);
    } catch {
      // silencioso
    } finally {
      setLoading(false);
    }
  }

  const top3 = ranking.slice(0, 3);
  const demais = ranking.slice(3);
  const lider = ranking[0]?.total_segundos || 0;

  const ordem = [top3[1], top3[0], top3[2]].filter(Boolean) as RankingEntry[];

  return (
    <div className="space-y-8">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/30 bg-primary/15 shadow-lg shadow-primary/10">
            <Trophy size={22} className="text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight">
              RANKING <span className="text-primary">DA TROPA</span>
            </h1>
            <p className="text-sm text-muted-foreground">Classificação por tempo total de farm</p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto rounded-full border border-border/60 bg-card/60 px-3 py-1.5">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-50" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
          </span>
          <span className="text-xs font-medium text-muted-foreground">Atualizando em tempo real</span>
        </div>
      </div>

      {/* Pódio mobile: campeão em destaque e demais posições compactas */}
      {!loading && top3.length > 0 && (
        <div className="space-y-3 pt-3 md:hidden">
          {top3[0] && (
            <article className="relative overflow-hidden rounded-3xl border border-rose-300/45 bg-gradient-to-br from-rose-400/[0.17] via-rose-500/[0.07] to-card p-5 shadow-[0_12px_45px_rgba(236,72,126,0.12)]">
              <div className="pointer-events-none absolute -right-10 -top-14 h-40 w-40 rounded-full bg-rose-400/10 blur-3xl" />
              <div className="relative flex items-center gap-4">
                <div className="relative shrink-0 rounded-full p-1 ring-2 ring-rose-300/70 ring-offset-2 ring-offset-[#0b0e18]">
                  <Avatar url={top3[0].avatar_url} nome={nomeJogador(top3[0])} size="lg" />
                  <span className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#0b0e18] bg-rose-300 text-slate-950 shadow-lg">
                    <Crown size={16} />
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <span className="inline-flex items-center gap-1 rounded-full border border-rose-300/30 bg-rose-300/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-100">
                    <Trophy size={11} /> Líder da tropa
                  </span>
                  <h2 className="mt-2 truncate text-xl font-black tracking-tight text-white">{nomeJogador(top3[0])}</h2>
                  <p className="text-xs text-rose-100/70">1º lugar · campeão</p>
                </div>
              </div>
              <div className="relative mt-5 flex items-end justify-between gap-3 rounded-2xl border border-white/5 bg-black/35 px-4 py-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-rose-100/60">Tempo total de farm</p>
                  <p className="mt-1 font-mono text-2xl font-black tracking-tight text-rose-200">{formatHMS(top3[0].total_segundos)}</p>
                </div>
                <div className="pb-1 text-right">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Vantagem</p>
                  <p className="font-mono text-sm font-bold text-white">{formatHMS(top3[0].total_segundos - (top3[1]?.total_segundos || 0))}</p>
                </div>
              </div>
            </article>
          )}

          {top3.length > 1 && (
            <div className="grid grid-cols-2 gap-3">
              {top3.slice(1).map((u) => {
                const vice = u.posicao === 2;
                return (
                  <article key={u.posicao} className={cn(
                    "min-w-0 rounded-2xl border p-3.5",
                    vice ? "border-slate-300/30 bg-gradient-to-br from-slate-300/[0.10] to-card" : "border-cyan-400/30 bg-gradient-to-br from-cyan-400/[0.10] to-card"
                  )}>
                    <div className="flex items-center justify-between gap-2">
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-black", vice ? "bg-slate-200 text-slate-900" : "bg-cyan-400 text-slate-950")}>{u.posicao}º</span>
                      {vice ? <Medal size={15} className="text-slate-200" /> : <Medal size={15} className="text-cyan-300" />}
                    </div>
                    <div className="mt-3 flex items-center gap-2.5">
                      <Avatar url={u.avatar_url} nome={nomeJogador(u)} size="sm" />
                      <p className="min-w-0 truncate text-sm font-bold text-foreground">{nomeJogador(u)}</p>
                    </div>
                    <p className="mt-3 font-mono text-sm font-bold text-foreground">{formatHMS(u.total_segundos)}</p>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{vice ? "Vice-campeão" : "3º lugar"}</p>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Pódio para telas maiores */}
      {loading ? (
        <>
          <div className="space-y-3 pt-3 md:hidden">
            <div className="h-40 animate-pulse rounded-3xl border border-border/40 bg-card/40" />
            <div className="grid grid-cols-2 gap-3">
              <div className="h-28 animate-pulse rounded-2xl border border-border/40 bg-card/40" />
              <div className="h-28 animate-pulse rounded-2xl border border-border/40 bg-card/40" />
            </div>
          </div>
          <div className="hidden md:grid md:grid-cols-3 gap-4 sm:gap-5 items-end">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-56 animate-pulse rounded-2xl border border-border/40 bg-card/40" />
            ))}
          </div>
        </>
      ) : top3.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex h-56 flex-col items-center justify-center gap-3 text-muted-foreground">
            <Trophy size={40} className="opacity-30" />
            <p className="text-sm">Nenhum jogador no ranking ainda</p>
          </CardContent>
        </Card>
      ) : (
        <div className="hidden md:grid md:grid-cols-3 gap-4 sm:gap-5 items-end pt-4">
          {ordem.map((u) => (
            <div
              key={u.posicao}
              className={cn(
                u.posicao === 1 ? "order-1 sm:order-2" : u.posicao === 2 ? "order-2 sm:order-1" : "order-3"
              )}
            >
              <PodioCard u={u} />
            </div>
          ))}
        </div>
      )}

      {/* Classificação a partir do 4º */}
      {!loading && demais.length > 0 && (
        <Card className="overflow-hidden border-border/60 bg-[#0b0b0b]/80">
          <div className="flex items-center justify-between gap-3 border-b border-border/50 px-5 py-4">
            <div className="flex items-center gap-2">
              <TrendingUp size={16} className="text-primary" />
              <h2 className="text-sm font-bold uppercase tracking-widest">Classificação geral</h2>
            </div>
            <span className="text-xs text-muted-foreground">
              {ranking.length} {ranking.length === 1 ? "jogador" : "jogadores"}
            </span>
          </div>

          <div className="hidden md:block overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead>
                <tr className="border-b border-border/50 bg-white/[0.02] text-left">
                  <th className="px-5 py-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    #
                  </th>
                  <th className="px-5 py-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Jogador
                  </th>
                  <th className="px-5 py-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Progresso
                  </th>
                  <th className="px-5 py-3 text-right text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Tempo total
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {demais.map((u) => {
                  const progresso = lider > 0 ? Math.min(100, (u.total_segundos / lider) * 100) : 0;

                  return (
                    <tr
                      key={u.posicao}
                      className="group transition-colors hover:bg-white/[0.04]"
                    >
                      <td className="px-5 py-3.5">
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border/60 bg-white/5 font-mono text-xs font-bold text-muted-foreground group-hover:text-foreground">
                          {u.posicao}
                        </span>
                      </td>

                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <Avatar url={u.avatar_url} nome={nomeJogador(u)} size="sm" />
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-foreground">{nomeJogador(u)}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {progresso.toFixed(0)}% do líder
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="px-5 py-3.5">
                        <div className="h-2 w-full max-w-[220px] overflow-hidden rounded-full bg-white/5">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-rose-400 to-blue-500 transition-all duration-700 ease-out"
                            style={{ width: `${progresso}%` }}
                          />
                        </div>
                      </td>

                      <td className="px-5 py-3.5 text-right">
                        <span className="font-mono text-sm font-semibold text-primary">
                          {formatHMS(u.total_segundos)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="space-y-2 p-3 md:hidden">
            {demais.map((u) => {
              const progresso = lider > 0 ? Math.min(100, (u.total_segundos / lider) * 100) : 0;
              return (
                <article key={u.posicao} className="rounded-xl border border-border/60 bg-white/[0.025] p-3.5">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-white/5 font-mono text-xs font-bold text-muted-foreground">
                      {u.posicao}
                    </span>
                    <Avatar url={u.avatar_url} nome={nomeJogador(u)} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-foreground">{nomeJogador(u)}</p>
                      <p className="text-[11px] text-muted-foreground">{progresso.toFixed(0)}% do líder</p>
                    </div>
                    <span className="shrink-0 font-mono text-xs font-semibold text-primary sm:text-sm">
                      {formatHMS(u.total_segundos)}
                    </span>
                  </div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/5">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-rose-400 to-blue-500 transition-all duration-700 ease-out"
                      style={{ width: `${progresso}%` }}
                    />
                  </div>
                </article>
              );
            })}
          </div>
        </Card>
      )}

      {/* Rodapé informativo */}
      {!loading && ranking.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-card/40 px-4 py-3">
            <Clock size={16} className="text-primary" />
            <p className="text-xs text-muted-foreground">
              Tempo contabilizado apenas em sessões de <strong className="text-foreground">RANK</strong>.
            </p>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-card/40 px-4 py-3">
            <Zap size={16} className="text-rose-200" />
            <p className="text-xs text-muted-foreground">
              A proporção das barras é calculada sobre o tempo do <strong className="text-foreground">1º colocado</strong>.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
