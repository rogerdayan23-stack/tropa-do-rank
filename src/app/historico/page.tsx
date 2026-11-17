"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Activity } from "lucide-react";

function formatHMS(segundos: number) {
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  const s = Math.floor(segundos % 60);
  return [h, m, s].map((v) => v.toString().padStart(2, "0")).join(":");
}

function formatData(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR");
}

export default function HistoricoPage() {
  const [sessoes, setSessoes] = useState<any[]>([]);
  const [filtro, setFiltro] = useState("tudo");
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    carregar();
  }, [filtro]);

  async function carregar() {
    setLoading(true);
    try {
      const res = await fetch("/api/sessoes");
      const data = await res.json();
      let lista: any[] = (data.sessoes || []).filter((s: any) => s.status === "encerrada" || s.status === "expirada");

      const agora = new Date();
      if (filtro === "hoje") {
        lista = lista.filter((s) => {
          const d = new Date(s.inicio || s.fim || "");
          return d.toDateString() === agora.toDateString();
        });
      } else if (filtro === "semana") {
        const inicioSemana = new Date(agora);
        inicioSemana.setDate(agora.getDate() - agora.getDay());
        lista = lista.filter((s) => new Date(s.inicio || s.fim || "") >= inicioSemana);
      } else if (filtro === "mes") {
        lista = lista.filter((s) => {
          const d = new Date(s.inicio || s.fim || "");
          return d.getMonth() === agora.getMonth() && d.getFullYear() === agora.getFullYear();
        });
      }

      lista.sort((a, b) => new Date(b.inicio || b.fim || "").getTime() - new Date(a.inicio || a.fim || "").getTime());

      setSessoes(lista);
      setTotal(lista.reduce((acc, s) => acc + (s.duracao || 0), 0));
    } catch {
      // silencioso
    } finally {
      setLoading(false);
    }
  }

  const filtroLabel: Record<string, string> = { hoje: "Hoje", semana: "Semana", mes: "Mês", tudo: "Tudo" };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="pl-12 sm:pl-0">
          <h1 className="text-3xl font-bold tracking-tight">Histórico</h1>
          <p className="text-muted-foreground">Suas sessões encerradas</p>
        </div>
        <div className="grid w-full grid-cols-4 gap-1 sm:flex sm:w-auto sm:gap-2">
          {["hoje", "semana", "mes", "tudo"].map((f) => (
            <Button
              key={f}
              onClick={() => setFiltro(f)}
              variant={filtro === f ? "default" : "outline"}
              size="sm"
              className={`min-w-0 px-2 text-xs sm:px-3 sm:text-sm ${filtro === f ? "bg-primary text-primary-foreground" : ""}`}
            >
              {filtroLabel[f]}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Total no período</CardTitle>
            <CardDescription>{formatHMS(total)}</CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Sessões</CardTitle>
            <CardDescription>{sessoes.length}</CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Média por sessão</CardTitle>
            <CardDescription>{sessoes.length ? formatHMS(Math.floor(total / sessoes.length)) : "00:00:00"}</CardDescription>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity size={18} /> Sessões
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="h-64 flex items-center justify-center">Carregando...</div>
          ) : sessoes.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-muted-foreground">
              <p>Nenhuma sessão encontrada neste período</p>
            </div>
          ) : (
          <div className="space-y-3">
                {sessoes.map((s) => (
                  <div key={s.id} className="rounded-xl border border-border/60 bg-white/[0.02] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">{formatData(s.inicio || s.fim || "")}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{new Date(s.inicio || "").toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} – {s.fim ? new Date(s.fim).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—"}</p>
                      </div>
                      <Badge variant={s.status === "encerrada" ? "secondary" : "destructive"}>
                        {s.status === "encerrada" ? "Encerrada" : "Expirada"}
                      </Badge>
                    </div>
                    <div className="mt-3 flex items-center gap-2 border-t border-white/5 pt-3 text-sm text-muted-foreground">
                      <Clock size={14} /> Duração <span className="ml-auto font-mono font-semibold text-foreground">{formatHMS(s.duracao || 0)}</span>
                    </div>
                  </div>
                ))}
          </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
