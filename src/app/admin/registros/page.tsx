"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, CalendarClock, ChevronDown, Clock3, FileClock, Filter, Loader2, RefreshCw, Search, ShieldCheck, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface RegistroAuditoria {
  id: string;
  user_id: string | null;
  admin_id: string | null;
  acao: string;
  detalhe: string | null;
  criado_em: string;
  ator_nome: string | null;
  alvo_nome: string | null;
}

type Categoria = "todas" | "usuarios" | "sessoes" | "financeiro" | "regras";

const PAGE_SIZE = 50;

function rotuloAcao(acao: string) {
  const rotulos: Record<string, string> = {
    admin_adjust_user_hours: "Ajuste manual de horas",
    admin_reset_user: "Estatísticas de usuário zeradas",
    admin_toggle_role: "Cargo alterado",
    admin_delete_user: "Usuário removido",
    "admin:pausar_sessao": "Sessão pausada",
    "admin:retomar_sessao": "Sessão retomada",
    "admin:pausar_todos": "Todas as sessões pausadas",
    "admin:despausar_todos": "Sessões retomadas em lote",
    "admin:encerrar_sessao": "Sessão encerrada pelo admin",
    "admin:encerrar_todas": "Sessões encerradas em lote",
    "admin:contagem_horas": "Contagem de horas sincronizada",
    "admin:ajustar": "Duração de sessão ajustada",
    "admin:cancelar": "Sessão cancelada",
    pausar_todos: "Todas as sessões pausadas",
    despausar_todos: "Sessões retomadas em lote",
    "admin:salvar_lucro_diario": "Lucro diário atualizado",
    "admin:fechar_semana": "Semana fechada e arquivada",
    "admin:confirmar_pagamento": "Pagamento confirmado",
    "admin:criar_penalidade": "Penalidade aplicada",
    "admin:remover_penalidade": "Penalidade removida",
    "admin:editar_regras": "Regras atualizadas",
    "admin:exportar_dados": "Relatório de usuários exportado",
  };

  return rotulos[acao] || acao.replace(/^admin[:_]?/, "").replaceAll("_", " ").replace(/^./, (letra) => letra.toUpperCase());
}

function categoriaAcao(acao: string): Exclude<Categoria, "todas"> {
  if (/user|usuario|role|cargo|horas|reset/i.test(acao)) return "usuarios";
  if (/sess|pausar|retomar|encerrar|contagem|ajustar|cancelar/i.test(acao)) return "sessoes";
  if (/lucro|pagamento|penalidade|semana|saldo|exportar/i.test(acao)) return "financeiro";
  return "regras";
}

function dataHora(valor: string) {
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? valor : data.toLocaleString("pt-BR", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function corCategoria(categoria: Exclude<Categoria, "todas">) {
  if (categoria === "usuarios") return "border-rose-300/25 bg-rose-300/10 text-rose-100";
  if (categoria === "sessoes") return "border-cyan-300/25 bg-cyan-300/10 text-cyan-100";
  if (categoria === "financeiro") return "border-amber-300/25 bg-amber-300/10 text-amber-100";
  return "border-border bg-secondary text-muted-foreground";
}

export default function RegistrosAdminPage() {
  const [registros, setRegistros] = useState<RegistroAuditoria[]>([]);
  const [pagina, setPagina] = useState(1);
  const [temMais, setTemMais] = useState(false);
  const [total, setTotal] = useState(0);
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState<Categoria>("todas");
  const [carregando, setCarregando] = useState(true);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [atualizadoEm, setAtualizadoEm] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async (paginaSolicitada = 1, anexar = false) => {
    if (anexar) setCarregandoMais(true);
    else setCarregando(true);

    try {
      const resposta = await fetch(`/api/admin/logs?pagina=${paginaSolicitada}`, { cache: "no-store" });
      const dados = await resposta.json();
      if (!resposta.ok) throw new Error(dados.error || "Não foi possível carregar os registros.");
      setErro(null);
      setRegistros((anteriores) => anexar ? [...anteriores, ...(dados.registros || [])] : (dados.registros || []));
      setPagina(paginaSolicitada);
      setTemMais(Boolean(dados.tem_mais));
      setTotal(Number(dados.total) || 0);
      setAtualizadoEm(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }));
    } catch (error) {
      const mensagem = error instanceof Error ? error.message : "Erro ao carregar a auditoria.";
      setErro(mensagem);
      toast.error(mensagem);
    } finally {
      setCarregando(false);
      setCarregandoMais(false);
    }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  const registrosFiltrados = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    return registros.filter((registro) => {
      if (categoria !== "todas" && categoriaAcao(registro.acao) !== categoria) return false;
      if (!termo) return true;
      return [rotuloAcao(registro.acao), registro.acao, registro.detalhe, registro.ator_nome, registro.alvo_nome]
        .some((valor) => valor?.toLocaleLowerCase("pt-BR").includes(termo));
    });
  }, [busca, categoria, registros]);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 pb-8">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="flex items-start gap-3">
          <div className="mt-1 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-rose-300/25 bg-rose-300/10 text-rose-200">
            <FileClock size={22} />
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-rose-200/80">Administração</p>
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Registros de auditoria</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Histórico das alterações e operações administrativas feitas no site.</p>
          </div>
        </div>
        <Button variant="outline" onClick={() => void carregar(1)} disabled={carregando} className="gap-2 self-start sm:self-auto">
          <RefreshCw size={15} className={carregando ? "animate-spin" : ""} /> Atualizar
        </Button>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="flex items-center gap-3 p-4">
          <div className="rounded-xl bg-rose-300/10 p-2.5 text-rose-200"><Activity size={18} /></div>
          <div><p className="text-xs text-muted-foreground">Ações registradas</p><p className="text-xl font-bold tabular-nums">{total}</p></div>
        </CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4">
          <div className="rounded-xl bg-cyan-300/10 p-2.5 text-cyan-200"><ShieldCheck size={18} /></div>
          <div><p className="text-xs text-muted-foreground">Exibindo nesta página</p><p className="text-xl font-bold tabular-nums">{registros.length}</p></div>
        </CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4">
          <div className="rounded-xl bg-secondary p-2.5 text-muted-foreground"><CalendarClock size={18} /></div>
          <div><p className="text-xs text-muted-foreground">Última consulta</p><p className="text-base font-semibold">{atualizadoEm || "—"}</p></div>
        </CardContent></Card>
      </section>

      <Card>
        <CardHeader className="gap-4 border-b border-border/70 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><ShieldCheck size={18} className="text-rose-200" /> Histórico administrativo</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Cada evento mostra quem fez a ação, o alvo e os detalhes disponíveis.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="relative block sm:min-w-64">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={busca} onChange={(event) => setBusca(event.target.value)} placeholder="Buscar ação, admin ou usuário" className="pl-9" />
            </label>
            <label className="relative block sm:min-w-40">
              <Filter size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <select value={categoria} onChange={(event) => setCategoria(event.target.value as Categoria)} className="h-10 w-full appearance-none rounded-md border border-input bg-background pl-9 pr-9 text-sm outline-none focus:ring-2 focus:ring-ring">
                <option value="todas">Todas as ações</option>
                <option value="usuarios">Usuários e cargos</option>
                <option value="sessoes">Sessões</option>
                <option value="financeiro">Financeiro</option>
                <option value="regras">Regras e outros</option>
              </select>
              <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            </label>
          </div>
        </CardHeader>

        <CardContent className="space-y-3 p-4 sm:p-5">
          {carregando ? (
            <div className="flex min-h-48 items-center justify-center text-sm text-muted-foreground"><Loader2 size={17} className="mr-2 animate-spin" /> Carregando registros…</div>
          ) : erro ? (
            <div className="rounded-xl border border-red-400/20 bg-red-400/5 p-8 text-center">
              <ShieldCheck size={22} className="mx-auto mb-2 text-red-300" />
              <p className="font-medium">Não foi possível abrir a auditoria.</p>
              <p className="mt-1 text-sm text-muted-foreground">{erro}</p>
            </div>
          ) : registrosFiltrados.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-8 text-center">
              <FileClock size={22} className="mx-auto mb-2 text-muted-foreground" />
              <p className="font-medium">{registros.length ? "Nenhuma ação corresponde à busca." : "Ainda não há ações administrativas registradas."}</p>
              <p className="mt-1 text-sm text-muted-foreground">As novas alterações administrativas aparecerão aqui automaticamente no histórico.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {registrosFiltrados.map((registro) => {
                const categoriaRegistro = categoriaAcao(registro.acao);
                return (
                  <article key={registro.id} className="rounded-xl border border-border/80 bg-card/60 p-4 transition-colors hover:bg-card">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className={corCategoria(categoriaRegistro)}>{rotuloAcao(registro.acao)}</Badge>
                          <span className="text-xs text-muted-foreground">{registro.acao}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                          <span className="inline-flex items-center gap-1.5"><UserRound size={14} className="text-rose-200" /><span className="text-muted-foreground">Responsável:</span> <strong>{registro.ator_nome || "Admin removido"}</strong></span>
                          {registro.alvo_nome && <span className="inline-flex items-center gap-1.5"><span className="text-muted-foreground">Alvo:</span> <strong>{registro.alvo_nome}</strong></span>}
                        </div>
                        {registro.detalhe && <p className="break-words text-sm leading-relaxed text-muted-foreground">{registro.detalhe}</p>}
                      </div>
                      <time className="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground sm:pt-1"><Clock3 size={13} /> {dataHora(registro.criado_em)}</time>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          <div className="flex flex-col items-center justify-between gap-3 border-t border-border/70 pt-4 sm:flex-row">
            <p className="text-xs text-muted-foreground">Os registros são somente leitura e não podem ser alterados nesta tela.</p>
            {temMais && <Button variant="outline" onClick={() => void carregar(pagina + 1, true)} disabled={carregandoMais} className="gap-2">
              {carregandoMais ? <Loader2 size={15} className="animate-spin" /> : <ChevronDown size={15} />} Carregar mais ações
            </Button>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

