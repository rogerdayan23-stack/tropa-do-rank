"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  Users,
  Trash2,
  RotateCcw,
  Crown,
  Shield,
  ShieldCheck,
  Loader2,
  Clock,
  UserCog,
  Settings2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface AdminUser {
  id: string;
  username: string;
  apelido: string;
  role: string;
  is_admin: boolean | null;
  avatar_url: string | null;
  criado_em: string;
  total_segundos: number;
}

function formatHMS(segundos: number) {
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  const s = Math.floor(segundos % 60);
  return [h, m, s].map((v) => v.toString().padStart(2, "0")).join(":");
}

function formatDate(iso: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

const estiloRole: Record<string, { label: string; className: string; icone: typeof Crown }> = {
  admin: {
    label: "Admin Master",
    className: "border-rose-300/35 bg-rose-300/10 text-rose-200",
    icone: Crown,
  },
  moderador: {
    label: "Co-Admin",
    className: "border-rose-400/35 bg-rose-400/10 text-rose-200",
    icone: ShieldCheck,
  },
  user: {
    label: "Jogador",
    className: "border-border/60 bg-white/5 text-muted-foreground",
    icone: Shield,
  },
};

function Avatar({ url, nome }: { url: string | null; nome: string }) {
  const src = url ? (url.startsWith("http") ? url : `/${url.replace(/^\//, "")}`) : null;
  return (
    <div className="h-9 w-9 flex-shrink-0 overflow-hidden rounded-full border border-white/10 bg-primary/15 flex items-center justify-center">
      {src ? (
        <img src={src} alt={nome} className="h-full w-full object-cover" />
      ) : (
        <span className="text-xs font-bold text-primary">{nome?.[0]?.toUpperCase() || "?"}</span>
      )}
    </div>
  );
}

export default function UsuariosAdminPage() {
  const router = useRouter();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [autorizado, setAutorizado] = useState(false);
  const [meId, setMeId] = useState<string | null>(null);
  const [podeAlterarCargos, setPodeAlterarCargos] = useState(false);
  const [busca, setBusca] = useState("");
  const [processando, setProcessando] = useState<string | null>(null);
  const [usuarioEmEdicao, setUsuarioEmEdicao] = useState<AdminUser | null>(null);
  const [operacaoHoras, setOperacaoHoras] = useState<"add" | "subtract">("add");
  const [horasAjuste, setHorasAjuste] = useState("1");
  const [minutosAjuste, setMinutosAjuste] = useState("0");
  const [salvandoAjuste, setSalvandoAjuste] = useState(false);

  useEffect(() => {
    async function verificarECarregar() {
      try {
        const resMe = await fetch("/api/auth/me");
        const me = await resMe.json();

        if (me.user?.role !== "admin") {
          toast.error("Acesso restrito ao Admin Master");
          router.replace("/dashboard");
          return;
        }

        setMeId(me.user.id);
        setPodeAlterarCargos(me.user.username?.trim().toLocaleLowerCase("pt-BR") === "dnz");
        setAutorizado(true);
        await carregar();
      } catch {
        router.replace("/dashboard");
      } finally {
        setLoading(false);
      }
    }

    verificarECarregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function carregar() {
    try {
      const res = await fetch("/api/admin/users");
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Erro ao carregar usuários");
        return;
      }
      setUsers(data.users || []);
    } catch {
      toast.error("Erro de conexão");
    }
  }

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return users;
    return users.filter(
      (u) =>
        (u.username || "").toLowerCase().includes(termo) ||
        (u.apelido || "").toLowerCase().includes(termo)
    );
  }, [users, busca]);

  const totalAdmins = users.filter((u) => u.role === "admin").length;
  const totalModeradores = users.filter((u) => u.role === "moderador").length;

  async function executar(acao: "reset" | "toggle_role", user: AdminUser, role?: string) {
    setProcessando(user.id);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user.id, acao, role }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Erro ao executar ação");
        return;
      }
      toast.success(data.message || "Ação executada");
      await carregar();
    } catch {
      toast.error("Erro de conexão");
    } finally {
      setProcessando(null);
    }
  }

  function abrirAjusteHoras(user: AdminUser) {
    setOperacaoHoras("add");
    setHorasAjuste("1");
    setMinutosAjuste("0");
    setUsuarioEmEdicao(user);
  }

  async function ajustarHoras() {
    if (!usuarioEmEdicao) return;

    const horas = Number(horasAjuste);
    const minutos = Number(minutosAjuste);
    const segundos = horas * 3600 + minutos * 60;
    const totalAtual = Number(usuarioEmEdicao.total_segundos || 0);

    if (
      !Number.isInteger(horas) || horas < 0 || horas > 100000 ||
      !Number.isInteger(minutos) || minutos < 0 || minutos > 59 ||
      !Number.isSafeInteger(segundos) || segundos <= 0
    ) {
      toast.error("Informe uma duração válida em horas e minutos");
      return;
    }

    if (operacaoHoras === "subtract" && segundos > totalAtual) {
      toast.error("O desconto não pode deixar o total de horas abaixo de zero");
      return;
    }

    setSalvandoAjuste(true);
    setProcessando(usuarioEmEdicao.id);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: usuarioEmEdicao.id,
          acao: "adjust_hours",
          operation: operacaoHoras,
          hours: horas,
          minutes: minutos,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Não foi possível ajustar as horas");
        return;
      }

      toast.success(data.message || "Horas ajustadas com sucesso");
      setUsuarioEmEdicao(null);
      await carregar();
    } catch {
      toast.error("Erro de conexão ao ajustar as horas");
    } finally {
      setSalvandoAjuste(false);
      setProcessando(null);
    }
  }

  async function remover(user: AdminUser) {
    if (
      !window.confirm(
        `Remover o usuário "${user.username}"? Essa ação apaga o usuário, as sessões, os pagamentos e as penalidades dele. Não pode ser desfeita.`
      )
    ) {
      return;
    }

    setProcessando(user.id);
    try {
      const res = await fetch("/api/admin/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Erro ao remover usuário");
        return;
      }
      toast.success("Usuário removido");
      await carregar();
    } catch {
      toast.error("Erro de conexão");
    } finally {
      setProcessando(null);
    }
  }

  function zerar(user: AdminUser) {
    if (
      !window.confirm(
        `Zerar as horas e os saldos de "${user.username}"? As sessões, pagamentos e penalidades desse jogador serão apagados.`
      )
    ) {
      return;
    }
    executar("reset", user);
  }

  function togglarRole(user: AdminUser, role: "admin" | "moderador") {
    if (!window.confirm(
      `${user.role === role ? 'Remover' : 'Conceder'} o cargo de ${role === "admin" ? "Admin Master" : "Co-Admin"} de "${user.username}"? ${user.role === role ? 'Voltará para Jogador' : ''}`
    )) return;
    executar("toggle_role", user, user.role === role ? "user" : role);
  }

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!autorizado) return null;

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/30 bg-primary/15">
            <UserCog size={22} className="text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight">GERENCIAR USUÁRIOS</h1>
            <p className="text-sm text-muted-foreground">
              Controle total de cargos, estatísticas e acessos da Tropa
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="border-border/60 gap-1.5 px-3 py-1">
            <Users size={12} /> {users.length} usuários
          </Badge>
          <Badge variant="outline" className="border-rose-300/35 gap-1.5 px-3 py-1 text-rose-200">
            <Crown size={12} /> {totalAdmins} admins
          </Badge>
          <Badge variant="outline" className="border-rose-400/35 gap-1.5 px-3 py-1 text-rose-200">
            <ShieldCheck size={12} /> {totalModeradores} co-admins
          </Badge>
        </div>
      </div>

      {/* Busca */}
      <div className="relative max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar pelo nome ou apelido..."
          className="bg-background border-border/60 pl-9"
        />
      </div>

      {/* Lista responsiva de usuários */}
      <Card className="overflow-hidden border-border/60 bg-[#0b0b0b]/80">
        <CardHeader className="border-b border-border/50 pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Users size={18} className="text-primary" />
            Usuários cadastrados
          </CardTitle>
          <CardDescription>
            Exibindo {filtrados.length} de {users.length}
          </CardDescription>
        </CardHeader>

        <CardContent className="p-3 sm:p-5">
          {filtrados.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center gap-3 text-muted-foreground">
              <Users size={40} className="opacity-30" />
              <p className="text-sm">Nenhum usuário encontrado</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                  {filtrados.map((u) => {
                    const estilo = estiloRole[u.role] || estiloRole.user;
                    const RoleIcon = estilo.icone;
                    const souEu = u.id === meId;
                    const ocupado = processando === u.id;

                    return (
                      <article key={u.id} className="min-w-0 rounded-xl border border-border/60 bg-white/[0.02] p-4 transition-colors hover:border-primary/30 hover:bg-white/[0.035]">
                        <div className="flex min-w-0 items-start justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <Avatar url={u.avatar_url} nome={u.username} />
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <p className="truncate font-semibold text-foreground">{u.username}</p>
                                {souEu && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">Você</span>}
                              </div>
                              <p className="mt-0.5 truncate text-xs text-muted-foreground">Apelido: {u.apelido || "—"}</p>
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <span
                              className={cn(
                                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold sm:text-[11px]",
                                estilo.className
                              )}
                            >
                              <RoleIcon size={12} />
                              {estilo.label}
                            </span>
                            <Button
                              type="button"
                              size="icon"
                              variant="outline"
                              disabled={ocupado}
                              onClick={() => abrirAjusteHoras(u)}
                              title={`Ajustar horas de ${u.username}`}
                              aria-label={`Ajustar horas de ${u.username}`}
                              className="h-9 w-9 shrink-0 border-primary/30 text-primary hover:bg-primary/10 hover:text-primary"
                            >
                              <Settings2 size={16} />
                            </Button>
                          </div>
                        </div>

                        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/5 pt-3 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1.5"><Clock size={13} /> {formatHMS(u.total_segundos || 0)} <span className="text-muted-foreground/70">de farm</span></span>
                          <span>Cadastrado em {formatDate(u.criado_em)}</span>
                        </div>

                        <div className="mt-3 border-t border-white/5 pt-3">
                          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Ações</p>
                          <div className="flex flex-wrap items-center gap-2">
                            {ocupado ? (
                              <span className="inline-flex items-center gap-2 py-2 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin text-primary" /> Atualizando usuário…</span>
                            ) : (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => zerar(u)}
                                  title="Zerar horas e saldos"
                                  className="h-8 gap-1.5 border-rose-300/25 px-2.5 text-[11px] text-rose-200 hover:bg-rose-300/10 hover:text-rose-100"
                                >
                                  <RotateCcw size={13} />
                                  Zerar
                                </Button>

                                {podeAlterarCargos && u.id !== meId && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={souEu}
                                    onClick={() => togglarRole(u, "admin")}
                                    title={u.role === "admin" ? 'Remover Admin Master' : 'Tornar Admin Master'}
                                    className="h-8 gap-1.5 border-rose-300/30 px-2.5 text-[11px] text-rose-200 hover:bg-rose-300/10 hover:text-rose-100"
                                  >
                                    {u.role === "admin" ? (
                                      <>
                                        <Crown size={13} />
                                        Remover cargo
                                      </>
                                    ) : (
                                      <>
                                        <Crown size={13} />
                                        Admin
                                      </>
                                    )}
                                  </Button>
                                )}

                                {podeAlterarCargos && u.id !== meId && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={souEu}
                                    onClick={() => togglarRole(u, "moderador")}
                                    title={u.role === "moderador" ? 'Remover Co-Admin' : 'Tornar Co-Admin'}
                                    className="h-8 gap-1.5 border-rose-400/30 px-2.5 text-[11px] text-rose-200 hover:bg-rose-400/10 hover:text-rose-100"
                                  >
                                    {u.role === "moderador" ? (
                                      <>
                                        <ShieldCheck size={13} />
                                        Remover cargo
                                      </>
                                    ) : (
                                      <>
                                        <ShieldCheck size={13} />
                                        Co-Admin
                                      </>
                                    )}
                                  </Button>
                                )}

                                {podeAlterarCargos && u.id !== meId && (u.role === "admin" || u.role === "moderador") && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      if (window.confirm(`Remover o cargo de ${u.username} e voltar para Jogador?`)) {
                                        executar("toggle_role", u, "user");
                                      }
                                    }}
                                    title="Remover cargo e voltar para Jogador"
                                    className="h-8 gap-1.5 border-border/70 px-2.5 text-[11px] text-muted-foreground hover:bg-white/5 hover:text-foreground"
                                  >
                                    Remover cargo
                                  </Button>
                                )}

                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={souEu}
                                  onClick={() => remover(u)}
                                  title="Remover usuário"
                                  className="h-8 gap-1.5 border-red-500/30 px-2.5 text-[11px] text-red-400 hover:bg-red-500/10 hover:text-red-300"
                                >
                                  <Trash2 size={13} />
                                  Remover
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(usuarioEmEdicao)} onOpenChange={(open) => !open && !salvandoAjuste && setUsuarioEmEdicao(null)}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-md rounded-2xl border-border/70 bg-[#111] p-5 sm:p-6">
          <DialogHeader className="pr-7 text-left">
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Settings2 size={20} className="text-primary" />
              Ajustar horas
            </DialogTitle>
            <DialogDescription>
              {usuarioEmEdicao ? `Edite o total de farm de ${usuarioEmEdicao.username}.` : "Edite o total de farm do jogador."}
            </DialogDescription>
          </DialogHeader>

          {usuarioEmEdicao && (
            <div className="space-y-5">
              <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
                <p className="text-xs text-muted-foreground">Total atual</p>
                <p className="mt-1 font-mono text-2xl font-bold tracking-tight text-foreground">
                  {formatHMS(Number(usuarioEmEdicao.total_segundos || 0))}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-black/20 p-1">
                <Button
                  type="button"
                  variant={operacaoHoras === "add" ? "default" : "ghost"}
                  onClick={() => setOperacaoHoras("add")}
                  className={cn("h-10 gap-2", operacaoHoras === "add" && "bg-primary text-primary-foreground")}
                >
                  <span aria-hidden="true">+</span> Adicionar
                </Button>
                <Button
                  type="button"
                  variant={operacaoHoras === "subtract" ? "default" : "ghost"}
                  onClick={() => setOperacaoHoras("subtract")}
                  className={cn("h-10 gap-2", operacaoHoras === "subtract" && "bg-red-500 text-white hover:bg-red-600")}
                >
                  <span aria-hidden="true">−</span> Descontar
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-2 text-sm font-medium">
                  Horas
                  <Input
                    type="number"
                    min="0"
                    max="100000"
                    step="1"
                    inputMode="numeric"
                    value={horasAjuste}
                    onChange={(event) => setHorasAjuste(event.target.value)}
                    className="h-12 bg-background text-base"
                  />
                </label>
                <label className="space-y-2 text-sm font-medium">
                  Minutos
                  <Input
                    type="number"
                    min="0"
                    max="59"
                    step="1"
                    inputMode="numeric"
                    value={minutosAjuste}
                    onChange={(event) => setMinutosAjuste(event.target.value)}
                    className="h-12 bg-background text-base"
                  />
                </label>
              </div>

              {(() => {
                const horas = Number(horasAjuste);
                const minutos = Number(minutosAjuste);
                const segundosAjuste = horas * 3600 + minutos * 60;
                const duracaoValida = Number.isInteger(horas) && horas >= 0 && horas <= 100000 && Number.isInteger(minutos) && minutos >= 0 && minutos <= 59 && segundosAjuste > 0;
                const totalAtual = Number(usuarioEmEdicao.total_segundos || 0);
                const podeDescontar = operacaoHoras !== "subtract" || segundosAjuste <= totalAtual;
                const novoTotal = operacaoHoras === "add" ? totalAtual + segundosAjuste : totalAtual - segundosAjuste;

                return (
                  <div className={cn("rounded-xl border p-3", duracaoValida && podeDescontar ? "border-primary/25 bg-primary/5" : "border-red-500/25 bg-red-500/5")}>
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-muted-foreground">Novo total previsto</span>
                      <span className={cn("font-mono font-bold", duracaoValida && podeDescontar ? "text-primary" : "text-red-400")}>
                        {duracaoValida && podeDescontar ? formatHMS(novoTotal) : "Confira o valor"}
                      </span>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                      O ajuste atualiza o ranking e preserva o histórico das sessões.
                    </p>
                  </div>
                );
              })()}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" disabled={salvandoAjuste} onClick={() => setUsuarioEmEdicao(null)} className="h-11 sm:flex-1">
              Cancelar
            </Button>
            <Button type="button" disabled={salvandoAjuste} onClick={ajustarHoras} className="h-11 sm:flex-1">
              {salvandoAjuste ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {operacaoHoras === "add" ? "Adicionar horas" : "Descontar horas"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
