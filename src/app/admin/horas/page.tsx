"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, Clock3, Loader2, RefreshCw, UserRound } from "lucide-react";
import { toast } from "sonner";
import { LIMITE_SESSAO_SEGUNDOS } from "@/lib/sessao";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface EventoContagem {
  id: string;
  user_id: string | null;
  sessao_id: string | null;
  acao: "iniciar_sessao" | "pausar_sessao" | "retomar_sessao" | "encerrar_sessao";
  criado_em: string;
  jogador: string;
}

function dataHora(valor: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).format(new Date(valor));
}

function duracao(segundos: number) {
  const total = Math.max(0, Math.floor(segundos));
  return [Math.floor(total / 3600), Math.floor((total % 3600) / 60), total % 60]
    .map((parte) => String(parte).padStart(2, "0")).join(":");
}

const tipoEvento = {
  iniciar_sessao: { label: "Iniciada", className: "border-emerald-300/30 bg-emerald-300/10 text-emerald-200" },
  pausar_sessao: { label: "Pausada", className: "border-amber-300/30 bg-amber-300/10 text-amber-200" },
  retomar_sessao: { label: "Retomada", className: "border-emerald-300/30 bg-emerald-300/10 text-emerald-200" },
  encerrar_sessao: { label: "Encerrada", className: "border-red-300/30 bg-red-300/10 text-red-200" },
};

export default function RegistroHorasPage() {
  const router = useRouter();
  const [eventos, setEventos] = useState<EventoContagem[]>([]);
  const [pagina, setPagina] = useState(1);
  const [temMais, setTemMais] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMais, setLoadingMais] = useState(false);
  const [agora, setAgora] = useState<number | null>(null);

  useEffect(() => {
    setAgora(Date.now());
    const intervalo = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(intervalo);
  }, []);

  const grupos = useMemo(() => {
    const porSessao = new Map<string, EventoContagem[]>();
    for (const evento of eventos) {
      const chave = evento.sessao_id || `legado-${evento.id}`;
      porSessao.set(chave, [...(porSessao.get(chave) || []), evento]);
    }

    return Array.from(porSessao.entries()).map(([id, itens]) => {
      const ordenados = [...itens].sort((a, b) => new Date(a.criado_em).getTime() - new Date(b.criado_em).getTime());
      let trechoInicio: number | null = null;
      let totalSegundos = 0;
      const duracaoPorEvento = new Map<string, number>();
      for (const evento of ordenados) {
        const instante = new Date(evento.criado_em).getTime();
        if (evento.acao === "iniciar_sessao" || evento.acao === "retomar_sessao") {
          trechoInicio = instante;
        } else if (trechoInicio !== null && (evento.acao === "pausar_sessao" || evento.acao === "encerrar_sessao")) {
          const segundos = Math.max(0, Math.floor((instante - trechoInicio) / 1000));
          totalSegundos += segundos;
          duracaoPorEvento.set(evento.id, segundos);
          trechoInicio = null;
        }
      }
      const ultima = ordenados[ordenados.length - 1];
      const temTrechoAberto = ultima?.acao === "iniciar_sessao" || ultima?.acao === "retomar_sessao";
      const trechoDecorrido = temTrechoAberto && trechoInicio !== null && agora !== null
        ? Math.max(0, Math.floor((agora - trechoInicio) / 1000))
        : 0;
      const limiteAtingido = temTrechoAberto && trechoDecorrido >= LIMITE_SESSAO_SEGUNDOS;
      const emAndamento = temTrechoAberto && !limiteAtingido;
      const trechoAtual = Math.min(trechoDecorrido, LIMITE_SESSAO_SEGUNDOS);
      return {
        id,
        jogador: ultima?.jogador || "Jogador",
        eventos: ordenados,
        ultima,
        emAndamento,
        pausada: ultima?.acao === "pausar_sessao",
        totalSegundos: totalSegundos + trechoAtual,
        duracaoPorEvento,
        trechoAtual,
        limiteAtingido,
      };
    }).sort((a, b) => new Date(b.ultima?.criado_em || 0).getTime() - new Date(a.ultima?.criado_em || 0).getTime());
  }, [eventos, agora]);

  const carregar = useCallback(async (paginaAlvo = 1, anexar = false) => {
    if (anexar) setLoadingMais(true);
    else setLoading(true);
    try {
      const res = await fetch(`/api/admin/horas?pagina=${paginaAlvo}`, { cache: "no-store" });
      const dados = await res.json();
      if (res.status === 401 || res.status === 403) {
        toast.error(dados.error || "Você não tem acesso a esta página.");
        router.replace(res.status === 401 ? "/login" : "/dashboard");
        return;
      }
      if (!res.ok) throw new Error(dados.error || "Não foi possível carregar os horários.");
      setEventos((anteriores) => anexar ? [...anteriores, ...(dados.eventos || [])] : (dados.eventos || []));
      setPagina(paginaAlvo);
      setTemMais(Boolean(dados.tem_mais));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao carregar os horários.");
    } finally {
      setLoading(false);
      setLoadingMais(false);
    }
  }, [router]);

  useEffect(() => { void carregar(); }, [carregar]);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 pb-8">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-rose-200/80">Administração</p>
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Linha do tempo de sessões</h1>
          <p className="mt-1 text-sm text-muted-foreground">Cada cartão reúne início, pausas, retomadas e encerramento do mesmo farm.</p>
        </div>
        <Button variant="outline" onClick={() => void carregar()} disabled={loading} className="gap-2 self-start sm:self-auto">
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Atualizar
        </Button>
      </header>

      <Card>
        <CardHeader className="border-b border-border/70">
          <CardTitle className="flex items-center gap-2"><Activity size={18} className="text-rose-200" /> Sessões registradas</CardTitle>
          <p className="text-sm text-muted-foreground">Horários no fuso local. Os trechos mostram o tempo ativo entre as ações.</p>
        </CardHeader>
        <CardContent className="space-y-3 p-4 sm:p-5">
          {loading ? (
            <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground"><Loader2 size={17} className="mr-2 animate-spin" /> Carregando eventos…</div>
          ) : grupos.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Ainda não há eventos de contagem registrados.</div>
          ) : grupos.map((grupo) => {
            return (
              <article key={grupo.id} className="rounded-xl border border-border/80 bg-card/60 p-4 sm:p-5">
                <header className="flex flex-col gap-3 border-b border-border/60 pb-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-300/10 text-rose-200"><UserRound size={17} /></span>
                    <div className="min-w-0"><p className="truncate font-semibold">{grupo.jogador}</p><p className="text-xs text-muted-foreground">{grupo.eventos.length} eventos · {duracao(grupo.totalSegundos)} de tempo ativo</p></div>
                  </div>
                  <Badge variant="outline" className={grupo.emAndamento ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-200" : grupo.pausada ? "border-amber-300/30 bg-amber-300/10 text-amber-200" : "border-rose-300/30 bg-rose-300/10 text-rose-200"}>
                    {grupo.emAndamento ? "Em andamento" : grupo.pausada ? "Pausada" : "Encerrada"}
                  </Badge>
                </header>
                <ol className="mt-4 space-y-3">
                  {grupo.eventos.map((evento) => {
                    const tipo = tipoEvento[evento.acao];
                    const segundosTrecho = grupo.duracaoPorEvento.get(evento.id);
                    const trechoAtivo = grupo.emAndamento && evento.id === grupo.ultima?.id;
                    const trechoLimitado = grupo.limiteAtingido && evento.id === grupo.ultima?.id;
                    return (
                      <li key={evento.id} className="relative flex flex-col gap-2 pl-5 text-sm before:absolute before:bottom-[-12px] before:left-[5px] before:top-2 before:w-px before:bg-border/70 last:before:hidden sm:flex-row sm:items-center sm:justify-between">
                        <span className="absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full bg-rose-300 ring-4 ring-rose-300/10" />
                        <div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className={tipo.className}>{tipo.label}</Badge>{typeof segundosTrecho === "number" && <span className="text-xs text-muted-foreground">Trecho ativo: {duracao(segundosTrecho)}</span>}{trechoAtivo && <span className="text-xs text-emerald-200">Trecho atual: {duracao(grupo.trechoAtual)}</span>}{trechoLimitado && <span className="text-xs text-amber-200">Limite de sessão atingido: {duracao(grupo.trechoAtual)}</span>}</div>
                        <time className="inline-flex shrink-0 items-center gap-2 text-xs tabular-nums text-muted-foreground"><Clock3 size={14} />{dataHora(evento.criado_em)}</time>
                      </li>
                    );
                  })}
                </ol>
              </article>
            );
          })}
          {temMais && <div className="flex justify-center pt-2"><Button variant="outline" onClick={() => void carregar(pagina + 1, true)} disabled={loadingMais} className="gap-2">{loadingMais && <Loader2 size={15} className="animate-spin" />}Carregar mais</Button></div>}
        </CardContent>
      </Card>
    </div>
  );
}
