"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Play, Pause, Square, Clock, AlertTriangle, DollarSign, Users, TrendingUp, UserRound } from "lucide-react";
import { toast } from "sonner";
import { LIMITE_SESSAO_SEGUNDOS } from "@/lib/sessao";

interface SessaoDashboard {
  id: string;
  inicio: string | null;
  status: string;
  duracao?: number;
  segundos_acumulados?: number | null;
}

interface JogadorSaldoDashboard {
  id: string;
  total_receber_semana: number;
}

interface ResumoSemanaDashboard {
  lucro_bruto_semana: number;
  total_horas_equipe_semana: number;
  total_horas_equipe_semana_segundos?: number;
}

interface SessaoEquipeDashboard {
  id: string;
  jogador: string;
  status: "ativa" | "pausada";
  segundos: number;
}

function formatHMS(segundos: number) {
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  const s = Math.floor(segundos % 60);
  return [h, m, s].map((v) => v.toString().padStart(2, "0")).join(":");
}

function formatHHMM(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function dataLocal(date = new Date()) {
  const deslocada = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return deslocada.toISOString().slice(0, 10);
}

function moeda(valor: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(valor) || 0);
}

export default function DashboardPage() {
  const router = useRouter();
  const [sessao, setSessao] = useState<SessaoDashboard | null>(null);
  const [segundos, setSegundos] = useState(0);
  const [expirada, setExpirada] = useState(false);
  const [loading, setLoading] = useState(false);
  const [inicioAtual, setInicioAtual] = useState<string | null>(null);
  const [segundosBase, setSegundosBase] = useState(0);
  const [statusAtual, setStatusAtual] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [usuarioId, setUsuarioId] = useState<string | null>(null);
  const [resumoSemana, setResumoSemana] = useState<ResumoSemanaDashboard | null>(null);
  const [jogadoresSemana, setJogadoresSemana] = useState<JogadorSaldoDashboard[]>([]);
  const [statusEquipe, setStatusEquipe] = useState<SessaoEquipeDashboard[]>([]);
  const timerSyncRef = useRef<{ segundos: number; sincronizadoEm: number } | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        setIsAdmin(d.user?.role === "admin");
        setUsuarioId(d.user?.id || null);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let ativo = true;
    const carregarPainel = async () => {
      try {
        const [resumoRes, equipeRes] = await Promise.all([
          fetch(`/api/saldos?data=${dataLocal()}`, { cache: "no-store" }),
          fetch("/api/painel", { cache: "no-store" }),
        ]);
        const [resumoData, equipeData] = await Promise.all([
          resumoRes.json() as Promise<{ resumo_semanal?: ResumoSemanaDashboard; jogadores?: JogadorSaldoDashboard[] }>,
          equipeRes.json() as Promise<{ sessoes?: SessaoEquipeDashboard[] }>,
        ]);
        if (!ativo) return;
        if (resumoRes.ok) {
          setResumoSemana(resumoData.resumo_semanal ?? null);
          setJogadoresSemana(resumoData.jogadores || []);
        }
        if (equipeRes.ok) setStatusEquipe(equipeData.sessoes || []);
      } catch {
        // O painel mantém os últimos dados carregados se a rede oscilar.
      }
    };
    void carregarPainel();
    const intervalo = setInterval(() => void carregarPainel(), 30_000);
    return () => { ativo = false; clearInterval(intervalo); };
  }, []);

  useEffect(() => {
    const carregar = async () => {
      try {
        const res = await fetch("/api/sessoes");
        const data = await res.json() as { sessoes?: SessaoDashboard[] };
        const lista = data.sessoes || [];
        // Pega a sessão mais recente ativa ou pausada
        const ativaOuPausada = lista.find((s) => s.status === "ativa" || s.status === "pausada");
        const maisRecente = lista[0];

        if (ativaOuPausada && ativaOuPausada.status === "ativa") {
          const duracao = Math.max(0, Number(ativaOuPausada.duracao ?? ativaOuPausada.segundos_acumulados) || 0);
          timerSyncRef.current = { segundos: duracao, sincronizadoEm: performance.now() };
          setSessao(ativaOuPausada);
          setInicioAtual(ativaOuPausada.inicio);
          setSegundosBase(ativaOuPausada.segundos_acumulados || 0);
          setSegundos(duracao);
          setStatusAtual("ativa");
          setExpirada(false);
        } else if (ativaOuPausada && ativaOuPausada.status === "pausada") {
          const duracao = Math.max(0, Number(ativaOuPausada.duracao ?? ativaOuPausada.segundos_acumulados) || 0);
          timerSyncRef.current = null;
          setSessao(ativaOuPausada);
          setSegundosBase(ativaOuPausada.segundos_acumulados || 0);
          setSegundos(duracao);
          setStatusAtual("pausada");
          setExpirada(false);
        } else if (maisRecente && maisRecente.status === "expirada") {
          timerSyncRef.current = null;
          setSessao(null);
          setStatusAtual("expirada");
          setExpirada(true);
          toast.error(`Sessão expirada por tempo limite (${LIMITE_SESSAO_SEGUNDOS / 3600}h)`);
        } else {
          timerSyncRef.current = null;
          setSessao(null);
          setStatusAtual(null);
          setSegundos(0);
          setExpirada(false);
        }
      } catch {
        // silencioso
      }
    };

    carregar();
    const interval = setInterval(carregar, 5000);
    const hbInterval = setInterval(() => {
      fetch("/api/heartbeat", { method: "POST", body: JSON.stringify({ id: sessao?.id }) }).catch(() => {});
    }, 60000);

    return () => {
      clearInterval(interval);
      clearInterval(hbInterval);
    };
  }, [sessao?.id]);

  useEffect(() => {
    if (statusAtual === "ativa" && inicioAtual) {
      const tick = () => {
        const sincronizacao = timerSyncRef.current;
        if (!sincronizacao) return;
        const total = Math.max(0, sincronizacao.segundos + Math.floor((performance.now() - sincronizacao.sincronizadoEm) / 1000));
        setSegundos(total);
        if (total >= LIMITE_SESSAO_SEGUNDOS) {
          setExpirada(true);
        }
      };
      tick();
      const t = setInterval(tick, 1000);
      return () => clearInterval(t);
    }
  }, [statusAtual, inicioAtual, segundosBase]);

  const iniciar = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/sessoes/iniciar", { method: "POST" });
      if (res.ok) {
        toast.success("Farm iniciado!");
      } else {
        const err = await res.json();
        toast.error(err.error || "Erro ao iniciar");
      }
    } catch {
      toast.error("Erro de conexão");
    } finally {
      setLoading(false);
    }
  };

  const pausar = async () => {
    if (!sessao?.id) return;
    setLoading(true);
    try {
      const res = await fetch("/api/sessoes/pausar", { method: "POST", body: JSON.stringify({ id: sessao.id }) });
      if (res.ok) toast.info("Sessão pausada");
      else toast.error("Erro ao pausar");
    } catch {
      toast.error("Erro de conexão");
    } finally {
      setLoading(false);
    }
  };

  const retomar = async () => {
    if (!sessao?.id) return;
    setLoading(true);
    try {
      const res = await fetch("/api/sessoes/retomar", { method: "POST", body: JSON.stringify({ id: sessao.id }) });
      if (res.ok) toast.success("Sessão retomada");
      else toast.error("Erro ao retomar");
    } catch {
      toast.error("Erro de conexão");
    } finally {
      setLoading(false);
    }
  };

  const parar = async () => {
    if (!sessao?.id) return;
    setLoading(true);
    try {
      const res = await fetch("/api/sessoes/parar", { method: "POST", body: JSON.stringify({ id: sessao.id }) });
      if (res.ok) {
        toast.success("Sessão encerrada");
        setSessao(null);
        setStatusAtual(null);
        setSegundos(0);
        setSegundosBase(0);
        setInicioAtual(null);
      } else toast.error("Erro ao parar");
    } catch {
      toast.error("Erro de conexão");
    } finally {
      setLoading(false);
    }
  };

  const pausarTodos = async () => {
    if (!window.confirm("Pausar todas as sessões ativas da Tropa?")) return;
    try {
      const res = await fetch("/api/sessoes/pausar-todos", { method: "POST", body: JSON.stringify({ acao: "pausar_todos" }) });
      if (res.ok) {
        const data = await res.json();
        toast.success(`${data.count || 0} sessões pausadas`);
      } else toast.error("Erro ao pausar todos");
    } catch {
      toast.error("Erro de conexão");
    }
  };

  const despausarTodos = async () => {
    if (!window.confirm("Despausar todas as sessões da Tropa?")) return;
    try {
      const res = await fetch("/api/sessoes/pausar-todos", { method: "POST", body: JSON.stringify({ acao: "despausar_todos" }) });
      if (res.ok) {
        const data = await res.json();
        toast.success(`${data.count || 0} sessões retomadas`);
      } else toast.error("Erro ao despausar todos");
    } catch {
      toast.error("Erro de conexão");
    }
  };

  const contagem = async () => {
    try {
      const res = await fetch("/api/admin/sessoes", { method: "POST", body: JSON.stringify({ acao: "contagem" }) });
      if (res.ok) {
        const data = await res.json();
        toast.success(`Contagem: ${data.atualizadas} atualizadas, ${data.expiradas} expiradas`);
      } else toast.error("Erro na contagem");
    } catch {
      toast.error("Erro de conexão");
    }
  };

  const temSessaoAtivaOuPausada = statusAtual === "ativa" || statusAtual === "pausada";
  const meuSaldo = jogadoresSemana.find((j) => j.id === usuarioId);
  const farmandoAgora = statusEquipe.filter((s) => s.status === "ativa");
  const pausadosAgora = statusEquipe.filter((s) => s.status === "pausada");

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 pl-12 lg:pl-0">
          <h1 className="text-3xl font-bold tracking-tight">Início</h1>
          <p className="text-muted-foreground">Controle suas sessões de farm</p>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:justify-end">
          {statusAtual === "pausada" && (
            <Button variant="success" onClick={retomar} disabled={loading} className="col-span-2 h-12 px-4 font-bold sm:col-span-1 sm:px-8">
              <Play size={20} className="mr-2" /> RETOMAR FARM
            </Button>
          )}
          {!temSessaoAtivaOuPausada ? (
            <Button variant="success" onClick={iniciar} disabled={loading} className="col-span-2 h-12 px-4 shadow-lg font-bold text-base sm:col-span-1 sm:px-8 sm:text-lg">
              <Play size={24} className="mr-2" />
              INICIAR FARM
            </Button>
          ) : null}

        </div>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Resumo semanal">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Clock size={18} /></span>
            <div><p className="text-xs text-muted-foreground">Horas da semana (seg–sex)</p><p className="text-xl font-bold tabular-nums">{resumoSemana ? formatHMS(resumoSemana.total_horas_equipe_semana_segundos ?? resumoSemana.total_horas_equipe_semana * 3600) : "—"}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-300"><TrendingUp size={18} /></span>
            <div><p className="text-xs text-muted-foreground">Lucro da semana</p><p className="text-xl font-bold tabular-nums">{resumoSemana ? moeda(resumoSemana.lucro_bruto_semana) : "—"}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-400/10 text-rose-200"><DollarSign size={18} /></span>
            <div><p className="text-xs text-muted-foreground">Sua estimativa</p><p className="text-xl font-bold tabular-nums">{meuSaldo ? moeda(meuSaldo.total_receber_semana) : "—"}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-400/10 text-rose-200"><Users size={18} /></span>
            <div><p className="text-xs text-muted-foreground">Farmando agora</p><p className="text-xl font-bold tabular-nums">{farmandoAgora.length} <span className="text-sm font-medium text-muted-foreground">ativos</span></p></div>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><UserRound size={17} className="text-primary" /> Agora na tropa</CardTitle>
          <CardDescription>Quem está farmando e quem pausou a contagem.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-emerald-400/15 bg-emerald-400/[0.04] p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-200">Farmando</p>
            <div className="flex flex-wrap gap-2">
              {farmandoAgora.length ? farmandoAgora.map((s) => <Badge key={s.id} variant="outline" className="border-emerald-300/20 text-emerald-100">{s.jogador} · {formatHMS(s.segundos)}</Badge>) : <span className="text-sm text-muted-foreground">Ninguém está farmando agora.</span>}
            </div>
          </div>
          <div className="rounded-xl border border-amber-400/15 bg-amber-400/[0.04] p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-200">Pausados</p>
            <div className="flex flex-wrap gap-2">
              {pausadosAgora.length ? pausadosAgora.map((s) => <Badge key={s.id} variant="outline" className="border-amber-300/20 text-amber-100">{s.jogador} · {formatHMS(s.segundos)}</Badge>) : <span className="text-sm text-muted-foreground">Ninguém está pausado.</span>}
            </div>
          </div>
        </CardContent>
      </Card>

      {temSessaoAtivaOuPausada ? (
        <Card className="border-primary/50 bg-primary/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-primary">{statusAtual === "pausada" ? "Sessão pausada" : "Sessão ativa"}</CardTitle>
            <div className="text-right">
              <div className="text-4xl font-mono font-bold text-primary">{formatHMS(segundos)}</div>
              <div className="text-xs text-muted-foreground">{statusAtual === "pausada" ? "Contagem pausada" : `Contando desde ${formatHHMM(inicioAtual || "")}`}</div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex gap-3">
              <Button onClick={pausar} disabled={loading || statusAtual !== "ativa"} className="flex-1 h-11 bg-secondary text-secondary-foreground shadow-sm">
                <Pause size={20} className="mr-2" /> Pausar
              </Button>
              <Button variant="success" onClick={retomar} disabled={loading || statusAtual !== "pausada"} className="flex-1 h-11 shadow-sm">
                <Play size={20} className="mr-2" /> Retomar
              </Button>
              <Button onClick={parar} disabled={loading} className="flex-1 h-11 bg-destructive text-destructive-foreground shadow-sm">
                <Square size={20} className="mr-2" /> Parar
              </Button>
            </div>
            {expirada && (
              <div className="mt-4 p-3 rounded bg-destructive/10 border border-destructive/20 flex items-center gap-2 text-destructive">
                <AlertTriangle size={18} />
                <span className="text-sm font-medium">Sessão expirada (limite de 5h atingido)</span>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Nenhuma sessão ativa</CardTitle>
            <CardDescription>Clique em INICIAR FARM para começar a acumular tempo.</CardDescription>
          </CardHeader>
        </Card>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Status atual</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <Badge variant={statusAtual === "ativa" ? "default" : statusAtual === "pausada" ? "secondary" : "outline"}>
                {statusAtual === "ativa" ? "Ativa" : statusAtual === "pausada" ? "Pausada" : "Inativa"}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {statusAtual === "ativa" ? `Acumulado: ${formatHMS(segundos)}` : statusAtual === "pausada" ? `Pausado em: ${formatHMS(segundosBase)}` : "Sem sessão em andamento"}
              </span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Limite de sessão</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="w-full bg-secondary rounded-full h-2">
              <div className={`bg-primary h-2 rounded-full transition-all duration-1000`} style={{ width: `${Math.min((segundos / LIMITE_SESSAO_SEGUNDOS) * 100, 100)}%` }}></div>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>00:00</span>
              <span>05:00 (limite)</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Botões admin */}
      {isAdmin && (
        <details className="group rounded-xl border border-rose-400/20 bg-rose-400/[0.025] p-4">
          <summary className="cursor-pointer list-none font-semibold marker:hidden">Controles administrativos <span className="ml-2 text-xs font-normal text-muted-foreground">Clique para abrir</span></summary>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Button onClick={pausarTodos} disabled={loading} variant="outline" className="border-rose-400/35 text-rose-200 hover:bg-rose-400/10"><Pause size={17} className="mr-2" />Pausar todos</Button>
            <Button onClick={despausarTodos} disabled={loading} variant="outline" className="border-emerald-400/40 text-emerald-300 hover:bg-emerald-400/10"><Play size={17} className="mr-2" />Retomar todos</Button>
            <Button onClick={contagem} disabled={loading} variant="outline" title="Sincroniza a duração das sessões e encerra as que atingiram cinco horas."><Clock size={17} className="mr-2" />Sincronizar horas</Button>
          </div>
        </details>
      )}

      {isAdmin && (
        <div className="grid sm:grid-cols-2 gap-4">
          <Card
            className="border-rose-400/20 hover:border-rose-400/40 cursor-pointer transition-all hover:bg-rose-400/5"
            onClick={() => router.push("/penalidades")}
          >
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-rose-400/15 flex items-center justify-center">
                  <AlertTriangle size={18} className="text-rose-200" />
                </div>
                <div>
                  <p className="font-semibold text-sm">Penalidades</p>
                  <p className="text-xs text-muted-foreground">Registrar entregadas graves</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card
            className="border-primary/20 hover:border-primary/40 cursor-pointer transition-all hover:bg-primary/5"
            onClick={() => router.push("/saldos")}
          >
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" className="text-primary"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                </div>
                <div>
                  <p className="font-semibold text-sm">Gerenciar Saldos</p>
                  <p className="text-xs text-muted-foreground">Registrar lucro e confirmar pagamentos</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
