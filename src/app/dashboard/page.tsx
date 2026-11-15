"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Play, Pause, Square, Timer, Clock, AlertTriangle, DollarSign, Shield } from "lucide-react";
import { toast } from "sonner";

function formatHMS(segundos: number) {
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  const s = Math.floor(segundos % 60);
  return [h, m, s].map((v) => v.toString().padStart(2, "0")).join(":");
}

function formatHHMM(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export default function DashboardPage() {
  const router = useRouter();
  const [sessao, setSessao] = useState<any>(null);
  const [segundos, setSegundos] = useState(0);
  const [expirada, setExpirada] = useState(false);
  const [loading, setLoading] = useState(false);
  const [inicioAtual, setInicioAtual] = useState<string | null>(null);
  const [segundosBase, setSegundosBase] = useState(0);
  const [statusAtual, setStatusAtual] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => setIsAdmin(!!d.user?.is_admin)).catch(() => {});
  }, []);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    let hbInterval: NodeJS.Timeout;

    const carregar = async () => {
      try {
        const res = await fetch("/api/sessoes");
        const data = await res.json();
        const lista = data.sessoes || [];
        // Pega a sessão mais recente ativa ou pausada
        const ativaOuPausada = lista.find((s: any) => s.status === "ativa" || s.status === "pausada");
        const maisRecente = lista[0];

        if (ativaOuPausada && ativaOuPausada.status === "ativa") {
          setSessao(ativaOuPausada);
          setInicioAtual(ativaOuPausada.inicio);
          setSegundosBase(ativaOuPausada.segundos_acumulados || 0);
          setStatusAtual("ativa");
          setExpirada(false);
        } else if (ativaOuPausada && ativaOuPausada.status === "pausada") {
          setSessao(ativaOuPausada);
          setSegundosBase(ativaOuPausada.segundos_acumulados || 0);
          setStatusAtual("pausada");
          setExpirada(false);
        } else if (maisRecente && maisRecente.status === "expirada") {
          setSessao(null);
          setStatusAtual("expirada");
          setExpirada(true);
          toast.error("Sessão expirada por tempo limite (8h)");
        } else {
          setSessao(null);
          setStatusAtual(null);
          setExpirada(false);
        }
      } catch {
        // silencioso
      }
    };

    carregar();
    interval = setInterval(carregar, 1000);
    hbInterval = setInterval(() => {
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
        const agora = Date.now();
        const desdeInicio = Math.floor((agora - new Date(inicioAtual).getTime()) / 1000);
        setSegundos((segundosBase || 0) + desdeInicio);
        if ((segundosBase || 0) + desdeInicio >= 8 * 3600) {
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

  const temSessaoAtivaOuPausada = statusAtual === "ativa" || statusAtual === "pausada";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">Controle suas sessões de farm</p>
        </div>
        <div className="flex gap-2">
          {!temSessaoAtivaOuPausada ? (
            <Button onClick={iniciar} disabled={loading} className="h-12 px-8 bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-all font-bold text-lg">
              <Play size={24} className="mr-2" />
              INICIAR FARM
            </Button>
          ) : null}
        </div>
      </div>

      {temSessaoAtivaOuPausada ? (
        <Card className="border-primary/50 bg-primary/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-primary">Sessão Ativa</CardTitle>
            <div className="text-right">
              <div className="text-4xl font-mono font-bold text-primary">{formatHMS(segundos)}</div>
              <div className="text-xs text-muted-foreground">Sessão ativa desde {formatHHMM(inicioAtual || "")}</div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex gap-3">
              <Button onClick={pausar} disabled={loading || statusAtual !== "ativa"} className="flex-1 h-11 bg-secondary text-secondary-foreground shadow-sm">
                <Pause size={20} className="mr-2" /> Pausar
              </Button>
              <Button onClick={retomar} disabled={loading || statusAtual !== "pausada"} className="flex-1 h-11 shadow-sm">
                <Play size={20} className="mr-2" /> Retomar
              </Button>
              <Button onClick={parar} disabled={loading} className="flex-1 h-11 bg-destructive text-destructive-foreground shadow-sm">
                <Square size={20} className="mr-2" /> Parar
              </Button>
            </div>
            {expirada && (
              <div className="mt-4 p-3 rounded bg-destructive/10 border border-destructive/20 flex items-center gap-2 text-destructive">
                <AlertTriangle size={18} />
                <span className="text-sm font-medium">Sessão expirada (limite de 8h atingido)</span>
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
              <div className={`bg-primary h-2 rounded-full transition-all duration-1000`} style={{ width: Math.min((segundos / (8 * 3600)) * 100, 100) }}></div>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>00:00</span>
              <span>08:00 (limite)</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Botões admin */}
      {isAdmin && (
        <div className="grid sm:grid-cols-2 gap-4">
          <Card
            className="border-orange-500/20 hover:border-orange-500/40 cursor-pointer transition-all hover:bg-orange-500/5"
            onClick={() => router.push("/penalidades")}
          >
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center">
                  <AlertTriangle size={18} className="text-orange-400" />
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
