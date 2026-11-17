"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Shield,
  ShieldCheck,
  Crown,
  Loader2,
  Clock,
  Pause,
  Play,
  Square,
  Activity,
  Users,
} from "lucide-react";
import { toast as notify } from "sonner";

interface SessaoAtiva {
  id: string;
  user_id: string;
  apelido: string;
  status: "ativa" | "pausada" | "encerrada";
  inicio: string | null;
  segundos_acumulados: number;
  ultima_atividade: string | null;
}

interface UsuarioAtivo {
  id: string;
  username: string;
 apelido: string;
  role: string;
  is_admin: boolean | null;
  avatar_url: string | null;
  criado_em: string;
  total_segundos: number;
}

export default function AdminMasterMonitor() {
  const router = useRouter();
  const [users, setUsers] = useState<UsuarioAtivo[]>([]);
  const [sessoes, setSessoes] = useState<SessaoAtiva[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState<string | null>(null);
  const [showPausarAll, setShowPausarAll] = useState(false);
  const [showPararAll, setShowPararAll] = useState(false);

  const toast = ({ title, description, variant }: { title?: string; description?: string; variant?: string }) => {
    const message = description || title || "";
    if (variant === "destructive") notify.error(message);
    else notify.success(message);
  };

  // Interval ref for real-time updates
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Verificar autorização
    async function verificarECarregar() {
      try {
        const resMe = await fetch("/api/auth/me");
        const me = await resMe.json();

        if (me.user?.role !== "admin") {
          toast({
            title: "Acesso negado",
            description: "Apenas Admin Master pode acessar esta página",
            variant: "destructive",
          });
          router.replace("/admin/usuarios");
          return;
        }

        setLoading(false);
        await carregarDados();

        // Iniciar intervalo de atualização em tempo real (a cada 3 segundos)
        intervalRef.current = setInterval(async () => {
          await carregarSessoesAtivas();
        }, 3000);

        return () => {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
        };
      } catch {
        router.replace("/dashboard");
      }
    }

    verificarECarregar();
  }, [router]);

  async function carregarDados() {
    try {
      // Carregar usuários
      const resU = await fetch("/api/admin/users");
      const dadosU = await resU.json();
      if (resU.ok) {
        setUsers(dadosU.users || []);
      }

      // Carregar sessões ativas e pausadas
      await carregarSessoesAtivas();
    } catch (err) {
      console.error("Erro ao carregar dados:", err);
      toast({
        title: "Erro",
        description: "Erro ao carregar dados do admin master",
        variant: "destructive",
      });
    }
  }

  async function carregarSessoesAtivas() {
    try {
      const res = await fetch("/api/admin/sessoes");
      const data = await res.json();
      if (res.ok) {
        setSessoes(data.sessoes || []);
      }
    } catch (err) {
      console.error("Erro ao carregar sessões:", err);
    }
  }

  function formatHMS(segundos: number) {
    const h = Math.floor(segundos / 3600);
    const m = Math.floor((segundos % 3600) / 60);
    const s = Math.floor(segundos % 60);
    return [h, m, s].map((v) => v.toString().padStart(2, "0")).join(":");
  }

  function getStatusBadgeClass(status: string) {
    switch (status) {
      case "ativa":
        return "border-primary/30 bg-primary/10 text-primary";
      case "pausada":
        return "border-yellow-500/30 bg-yellow-500/10 text-yellow-300";
      case "encerrada":
        return "border-red-500/30 bg-red-500/10 text-red-300";
      default:
        return "border-gray-500/30 bg-gray-500/10 text-gray-300";
    }
  }

  function getStatusIcon(status: string) {
    switch (status) {
      case "ativa":
        return <Play size={12} className="text-primary" />;
      case "pausada":
        return <Pause size={12} className="text-yellow-400" />;
      case "encerrada":
        return <Square size={12} className="text-red-400" />;
      default:
        return <Loader2 size={12} className="text-gray-400 animate-spin" />;
    }
  }

  // Funções de ação em lote
  async function pausarTodos() {
    setShowPausarAll(true);
  }

  async function confirmarPausarTodos() {
    try {
      const res = await fetch("/api/admin/sessoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "pausar_todos" }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({
          title: "Sucesso",
          description: `${data.count || 0} sessões pausadas`,
        });
        await carregarSessoesAtivas();
      } else {
        toast({
          title: "Erro",
          description: data.error || "Erro ao pausar sessões",
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({
        title: "Erro",
        description: "Erro de conexão",
        variant: "destructive",
      });
    } finally {
      setShowPausarAll(false);
    }
  }

  async function pararTodos() {
    setShowPararAll(true);
  }

  async function confirmarPararTodos() {
    try {
      const res = await fetch("/api/admin/sessoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "encerrar" }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({
          title: "Sucesso",
          description: "Todas as sessões foram encerradas",
        });
        await carregarSessoesAtivas();
      } else {
        toast({
          title: "Erro",
          description: data.error || "Erro ao encerrar sessões",
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({
        title: "Erro",
        description: "Erro de conexão",
        variant: "destructive",
      });
    } finally {
      setShowPararAll(false);
    }
  }

  // Funções de pausa/retomar individual
  async function pausarSessao(id: string) {
    try {
      const res = await fetch("/api/admin/sessoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "pausar", sessao_id: id }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({
          title: "Sucesso",
          description: "Sessão pausada",
        });
        await carregarSessoesAtivas();
      } else {
        toast({
          title: "Erro",
          description: data.error || "Erro ao pausar sessão",
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({
        title: "Erro",
        description: "Erro de conexão",
        variant: "destructive",
      });
    }
  }

  async function retomarSessao(id: string) {
    try {
      const res = await fetch("/api/admin/sessoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "retomar", sessao_id: id }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({
          title: "Sucesso",
          description: "Sessão retomada",
        });
        await carregarSessoesAtivas();
      } else {
        toast({
          title: "Erro",
          description: data.error || "Erro ao retomar sessão",
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({
        title: "Erro",
        description: "Erro de conexão",
        variant: "destructive",
      });
    }
  }

  async function pararSessao(id: string) {
    if (!window.confirm("Tem certeza que deseja encerrar esta sessão?")) return;
    try {
      const res = await fetch("/api/admin/sessoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "encerrar", sessao_id: id }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({
          title: "Sucesso",
          description: "Sessão encerrada",
        });
        await carregarSessoesAtivas();
      } else {
        toast({
          title: "Erro",
          description: data.error || "Erro ao encerrar sessão",
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({
        title: "Erro",
        description: "Erro de conexão",
        variant: "destructive",
      });
    }
  }

  if (loading) {
    return (
      <div className="h-96 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-yellow-400/30 bg-yellow-400/10">
            <Crown size={24} className="text-yellow-400" />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight">ADMIN MASTER - MONITORAMENTO</h1>
            <p className="text-sm text-muted-foreground">
              Visão em tempo real de todos os jogadores ativos e controle de sessões
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="border-border/60 gap-1.5 px-3 py-1">
            <Users size={12} /> {users.length} usuários cadastrados
          </Badge>
          <Badge variant="outline" className="border-yellow-400/40 gap-1.5 px-3 py-1 text-yellow-300">
            <Crown size={12} /> Uptime
          </Badge>
        </div>
      </div>

      {/* Controles em lote */}
      <div className="grid md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex items-center gap-2">
            <Loader2 size={18} className="text-primary" />
            <CardTitle>Sessões Ativas</CardTitle>
          </CardHeader>
          <CardContent>
            {sessoes.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhuma sessão ativa no momento</p>
            ) : (
              <div className="space-y-3">
                {sessoes.map((s) => {
                  const estiloStatus = getStatusBadgeClass(s.status);
                  const iconeStatus = getStatusIcon(s.status);
                  const acumulado = s.segundos_acumulados || 0;
                  const extra = s.status === "ativa" && s.inicio ? Math.floor((Date.now() - new Date(s.inicio).getTime()) / 1000) : 0;
                  const tempoTotal = acumulado + extra;

                  return (
                    <Card key={s.id} className="border-border p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-sm">{s.apelido}</span>
                        <Badge variant="outline" className={estiloStatus}>
                          {iconeStatus}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3">
                        <span>Acumulado: {formatHMS(acumulado)}</span>
                        <span>•</span>
                        <span>Total agora: {formatHMS(tempoTotal)}</span>
                      </div>
                      <div className="flex gap-2">
                        {s.status === "ativa" && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => pausarSessao(s.id)}
                              className="h-7 gap-1.5 border-yellow-500/30 px-2 text-[10px] text-yellow-400 hover:bg-yellow-500/10 hover:text-yellow-300"
                            >
                              <Pause size={11} /> Pausar
                            </Button>
                          </>
                        )}
                        {s.status === "pausada" && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => retomarSessao(s.id)}
                              className="h-7 gap-1.5 border-sky-500/30 px-2 text-[10px] text-sky-300 hover:bg-sky-500/10 hover:text-sky-200"
                            >
                              <Play size={11} /> Retomar
                            </Button>
                          </>
                        )}
                        {s.status !== "encerrada" && (
                          <>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => pararSessao(s.id)}
                              className="h-7 gap-1.5 border-red-500/30 px-2 text-[10px] text-red-400 hover:bg-red-500/10 hover:text-red-300"
                            >
                              <Square size={11} /> Encerrar
                            </Button>
                          </>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Controles em lote */}
        <Card>
          <CardHeader className="flex items-center gap-2">
            <Activity size={18} className="text-primary" />
            <CardTitle>Ações em Lote</CardTitle>
          </CardHeader>
          <CardContent>
            {sessoes.length > 0 ? (
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground">Pausar todas:</p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={pausarTodos}
                    className="w-full h-9 border-yellow-500/30 px-3 text-[10px] text-yellow-400 hover:bg-yellow-500/10 hover:text-yellow-300"
                    disabled={showPausarAll}
                  >
                    {showPausarAll ? "Pausando..." : "Pausar Todas"}
                  </Button>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Parar todas:</p>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={pararTodos}
                    className="w-full h-9 border-red-500/30 px-3 text-[10px] text-red-400 hover:bg-red-500/10 hover:text-red-300"
                    disabled={showPararAll}
                  >
                    {showPararAll ? "Encerrando..." : "Parar Todas"}
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">Nenhuma sessão para ações em lote</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Estatísticas resumidas */}
      <div className="grid md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <Clock size={18} className="text-primary" />
            <CardTitle>Sessões Ativas</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="text-3xl font-bold text-primary">{sessoes.filter((s) => s.status === "ativa").length}</div>
            <div className="text-xs text-muted-foreground">total</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Pause size={18} className="text-yellow-400" />
            <CardTitle>Sessões Pausadas</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="text-3xl font-bold text-yellow-400">{sessoes.filter((s) => s.status === "pausada").length}</div>
            <div className="text-xs text-muted-foreground">total</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Square size={18} className="text-red-400" />
            <CardTitle>Sessões Encerradas</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="text-3xl font-bold text-red-400">{sessoes.filter((s) => s.status === "encerrada").length}</div>
            <div className="text-xs text-muted-foreground">total</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
