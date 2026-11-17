"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, Clock, Crown, Loader2, Pause, Play, RefreshCw, Shield, Square, Users } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface UsuarioMonitorado {
  id: string;
  username: string;
  apelido: string;
  role: string;
  avatar_url: string | null;
  total_segundos: number;
}

interface SessaoMonitorada {
  id: string;
  user_id: string;
  inicio: string | null;
  status: "ativa" | "pausada";
  segundos_acumulados: number;
  duracao: number;
  ultima_atividade: string | null;
  sincronizadaEm: number;
}

type FiltroStatus = "todos" | "ativa" | "pausada" | "inativa";

function formatHMS(segundos: number) {
  const total = Math.max(0, Math.floor(Number(segundos) || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((v) => v.toString().padStart(2, "0")).join(":");
}

export default function AdminMasterMonitor() {
  const router = useRouter();
  const [users, setUsers] = useState<UsuarioMonitorado[]>([]);
  const [sessoes, setSessoes] = useState<SessaoMonitorada[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [atualizadoEm, setAtualizadoEm] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<FiltroStatus>("todos");
  const [, atualizarRelogio] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const carregandoRef = useRef(false);

  const carregarDados = useCallback(async () => {
    if (carregandoRef.current) return;
    carregandoRef.current = true;
    try {
      const [resUsers, resSessoes] = await Promise.all([
        fetch("/api/admin/monitoramento/users", { cache: "no-store" }),
        fetch("/api/admin/sessoes", { cache: "no-store" }),
      ]);
      const [dadosUsers, dadosSessoes] = await Promise.all([resUsers.json(), resSessoes.json()]);
      if (!resUsers.ok) throw new Error(dadosUsers.error || "Não foi possível carregar os jogadores.");
      if (!resSessoes.ok) throw new Error(dadosSessoes.error || "Não foi possível carregar as sessões ao vivo.");

      setUsers(dadosUsers.users || []);
      setSessoes((dadosSessoes.sessoes || []).map((sessao: Omit<SessaoMonitorada, "sincronizadaEm">) => ({
        ...sessao,
        duracao: Math.max(0, Number(sessao.duracao ?? sessao.segundos_acumulados) || 0),
        sincronizadaEm: performance.now(),
      })));
      setAtualizadoEm(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
      setErro(null);
    } catch (error) {
      const mensagem = error instanceof Error ? error.message : "Erro ao atualizar o monitoramento.";
      setErro(mensagem);
    } finally {
      setLoading(false);
      carregandoRef.current = false;
    }
  }, []);

  useEffect(() => {
    let cancelado = false;

    async function iniciarMonitoramento() {
      try {
        const resposta = await fetch("/api/auth/me", { cache: "no-store" });
        const dados = await resposta.json();
        if (!resposta.ok || !["admin", "moderador"].includes(dados.user?.role)) {
          toast.error("Apenas administradores e co-admins podem acessar o monitoramento.");
          router.replace("/dashboard");
          return;
        }
        if (cancelado) return;

        await carregarDados();
        if (cancelado) return;
        intervalRef.current = setInterval(() => void carregarDados(), 3000);
        tickRef.current = setInterval(() => atualizarRelogio((valor) => valor + 1), 1000);
      } catch {
        router.replace("/dashboard");
      }
    }

    void iniciarMonitoramento();
    return () => {
      cancelado = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [carregarDados, router]);

  const sessaoPorUsuario = useMemo(() => {
    const mapa = new Map<string, SessaoMonitorada>();
    for (const sessao of sessoes) {
      if (!mapa.has(sessao.user_id)) mapa.set(sessao.user_id, sessao);
    }
    return mapa;
  }, [sessoes]);

  const jogadores = useMemo(() => users.map((usuario) => ({
    usuario,
    sessao: sessaoPorUsuario.get(usuario.id) || null,
    status: sessaoPorUsuario.get(usuario.id)?.status || "inativa",
  })), [users, sessaoPorUsuario]);

  const jogadoresFiltrados = jogadores.filter((jogador) => filtro === "todos" || jogador.status === filtro);
  const ativas = sessoes.filter((sessao) => sessao.status === "ativa").length;
  const pausadas = sessoes.filter((sessao) => sessao.status === "pausada").length;
  const inativas = Math.max(0, users.length - ativas - pausadas);

  function duracaoAtual(sessao: SessaoMonitorada) {
    const extra = sessao.status === "ativa" ? Math.max(0, Math.floor((performance.now() - sessao.sincronizadaEm) / 1000)) : 0;
    return Math.max(0, sessao.duracao + extra);
  }

  async function executarAcao(acao: string, sessaoId?: string) {
    try {
      const resposta = await fetch("/api/admin/sessoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao, ...(sessaoId ? { sessao_id: sessaoId } : {}) }),
      });
      const dados = await resposta.json();
      if (!resposta.ok) throw new Error(dados.error || "Não foi possível atualizar a sessão.");
      toast.success(acao === "pausar" ? "Sessão pausada." : acao === "retomar" ? "Sessão retomada." : "Sessões atualizadas.");
      await carregarDados();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao atualizar a sessão.");
    }
  }

  function confirmarAcaoEmLote(acao: "pausar_todos" | "despausar_todos" | "encerrar") {
    const mensagem = acao === "pausar_todos"
      ? "Pausar todas as sessões ativas?"
      : acao === "despausar_todos"
        ? "Retomar todas as sessões pausadas?"
        : "Encerrar todas as sessões abertas? Esta ação não pode ser desfeita.";
    if (window.confirm(mensagem)) void executarAcao(acao);
  }

  function classeStatus(status: string) {
    if (status === "ativa") return "border-violet-300/30 bg-violet-300/10 text-violet-100";
    if (status === "pausada") return "border-cyan-300/30 bg-cyan-300/10 text-cyan-100";
    return "border-border bg-secondary/70 text-muted-foreground";
  }

  function textoStatus(status: string) {
    return status === "ativa" ? "Ativa agora" : status === "pausada" ? "Pausada" : "Inativa";
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 items-center gap-3 pl-12 sm:pl-0">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-violet-300/30 bg-violet-300/10">
            <Crown size={23} className="text-violet-100" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Monitoramento ao vivo</h1>
            <p className="text-sm text-muted-foreground">Status e tempo de cada jogador, atualizados automaticamente.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 pl-12 sm:pl-0">
          <Badge variant="outline" className="gap-1.5 px-3 py-1"><Users size={13} /> {users.length} jogadores</Badge>
          <Badge variant="outline" className="gap-1.5 border-violet-300/30 px-3 py-1 text-violet-100"><Activity size={13} /> {ativas} ativos</Badge>
          <Button variant="outline" size="sm" onClick={() => void carregarDados()} disabled={loading} className="gap-2">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Atualizar
          </Button>
        </div>
      </header>

      {erro && (
        <div role="alert" className="flex flex-col gap-3 rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-100 sm:flex-row sm:items-center sm:justify-between">
          <span>Falha ao atualizar os dados: {erro}. A lista pode estar desatualizada.</span>
          <Button size="sm" variant="outline" onClick={() => void carregarDados()} className="shrink-0">Tentar novamente</Button>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="p-4 sm:p-5"><p className="text-xs text-muted-foreground">Ativos</p><p className="mt-1 text-2xl font-bold text-violet-100">{ativas}</p></CardContent></Card>
        <Card><CardContent className="p-4 sm:p-5"><p className="text-xs text-muted-foreground">Pausados</p><p className="mt-1 text-2xl font-bold text-cyan-100">{pausadas}</p></CardContent></Card>
        <Card><CardContent className="p-4 sm:p-5"><p className="text-xs text-muted-foreground">Inativos</p><p className="mt-1 text-2xl font-bold text-muted-foreground">{inativas}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="gap-4 border-b border-border/70 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><Users size={18} className="text-primary" /> Jogadores</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Cada pessoa aparece aqui, mesmo quando não iniciou uma sessão.</p>
          </div>
          <p className="text-xs text-muted-foreground">{atualizadoEm ? `Sincronizado às ${atualizadoEm}` : "Sincronizando…"} · a cada 3 s</p>
        </CardHeader>
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-wrap gap-2">
            {(["todos", "ativa", "pausada", "inativa"] as FiltroStatus[]).map((opcao) => {
              const rotulos: Record<FiltroStatus, string> = { todos: "Todos", ativa: "Ativos", pausada: "Pausados", inativa: "Inativos" };
              return <Button key={opcao} size="sm" variant={filtro === opcao ? "default" : "outline"} onClick={() => setFiltro(opcao)}>{rotulos[opcao]}</Button>;
            })}
          </div>

          {loading ? (
            <div className="flex min-h-40 items-center justify-center text-muted-foreground"><Loader2 className="mr-2 animate-spin" size={18} /> Carregando jogadores…</div>
          ) : jogadoresFiltrados.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              {users.length === 0 ? "Nenhum jogador cadastrado." : "Nenhum jogador neste filtro."}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {jogadoresFiltrados.map(({ usuario, sessao, status }) => {
                const nome = usuario.apelido || usuario.username;
                const tempo = sessao ? duracaoAtual(sessao) : Math.max(0, Number(usuario.total_segundos) || 0);
                return (
                  <article key={usuario.id} className="min-w-0 rounded-xl border border-border/80 bg-card/70 p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-violet-300/20 bg-violet-300/10 text-sm font-bold text-violet-100">
                          {usuario.avatar_url ? <img src={usuario.avatar_url} alt="" className="h-full w-full object-cover" /> : nome.slice(0, 1).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{nome}</p>
                          <p className="truncate text-xs text-muted-foreground">@{usuario.username}</p>
                        </div>
                      </div>
                      <Badge variant="outline" className={`shrink-0 ${classeStatus(status)}`}>
                        {status === "ativa" ? <Play size={11} className="mr-1" /> : status === "pausada" ? <Pause size={11} className="mr-1" /> : <Shield size={11} className="mr-1" />}
                        {textoStatus(status)}
                      </Badge>
                    </div>
                    <div className="mt-4 flex items-center justify-between gap-2 border-t border-border/70 pt-3">
                      <span className="text-xs text-muted-foreground">{sessao ? (status === "ativa" ? "Sessão atual" : "Tempo da sessão") : "Total acumulado"}</span>
                      <span className="font-mono text-base font-bold tabular-nums">{formatHMS(tempo)}</span>
                    </div>
                    {sessao && (
                      <div className="mt-3 flex gap-2">
                        {status === "ativa" ? (
                          <Button size="sm" variant="outline" onClick={() => void executarAcao("pausar", sessao.id)} className="flex-1 gap-1.5 border-violet-300/30 text-violet-100"><Pause size={13} /> Pausar</Button>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => void executarAcao("retomar", sessao.id)} className="flex-1 gap-1.5 border-cyan-300/30 text-cyan-100"><Play size={13} /> Retomar</Button>
                        )}
                        <Button size="sm" variant="destructive" onClick={() => {
                          if (window.confirm(`Encerrar a sessão de ${nome}?`)) void executarAcao("encerrar", sessao.id);
                        }} className="flex-1 gap-1.5"><Square size={13} /> Encerrar</Button>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Clock size={18} className="text-primary" /> Ações gerais</CardTitle></CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-3">
          <Button variant="outline" disabled={!ativas} onClick={() => confirmarAcaoEmLote("pausar_todos")} className="gap-2"><Pause size={15} /> Pausar ativos</Button>
          <Button variant="outline" disabled={!pausadas} onClick={() => confirmarAcaoEmLote("despausar_todos")} className="gap-2"><Play size={15} /> Retomar pausados</Button>
          <Button variant="destructive" disabled={!sessoes.length} onClick={() => confirmarAcaoEmLote("encerrar")} className="gap-2"><Square size={15} /> Encerrar sessões</Button>
        </CardContent>
      </Card>
    </div>
  );
}

