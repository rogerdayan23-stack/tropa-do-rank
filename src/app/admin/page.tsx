"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Shield, Clock, Download, Activity, List } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function formatHMS(segundos: number) {
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  const s = Math.floor(segundos % 60);
  return [h, m, s].map((v) => v.toString().padStart(2, "0")).join(":");
}

export default function AdminPage() {
  const [sessoes, setSessoes] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [ajustes, setAjustes] = useState<Record<string, string>>({});

  useEffect(() => {
    carregar();
  }, []);

  async function carregar() {
    setLoading(true);
    try {
      const [resS, resL] = await Promise.all([fetch("/api/admin/sessoes"), fetch("/api/admin/logs")]);
      const sData = await resS.json();
      const lData = await resL.json();
      setSessoes(sData.sessoes || []);
      setLogs(lData.logs || []);
    } catch {
      // silencioso
    } finally {
      setLoading(false);
    }
  }

  async function adminAcao(acao: string, sessao_id: string, minutos?: number) {
    try {
      const res = await fetch("/api/admin/sessoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao, sessao_id, minutos }),
      });
      if (res.ok) {
        toast.success(`Ação ${acao} executada`);
        carregar();
      } else {
        toast.error("Erro na ação admin");
      }
    } catch {
      toast.error("Erro de conexão");
    }
  }

  function encerrar(id: string) {
    if (!window.confirm("Encerrar esta sessão?")) return;
    adminAcao("encerrar", id);
  }

  function cancelar(id: string) {
    if (!window.confirm("Cancelar esta sessão?")) return;
    adminAcao("cancelar", id);
  }

  function ajustar(id: string) {
    const minutos = parseInt(ajustes[id] || "0", 10);
    if (!minutos) return toast.error("Digite minutos válidos");
    adminAcao("ajustar", id, minutos);
  }

  async function exportar() {
    window.location.href = "/api/admin/export";
  }

  if (loading) return <div className="h-96 flex items-center justify-center">Carregando...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Admin</h1>
          <p className="text-muted-foreground">Controle total das sessões e regras</p>
        </div>
        <Button onClick={exportar} variant="outline" size="sm" className="flex items-center gap-2">
          <Download size={18} /> Exportar CSV
        </Button>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="flex items-center gap-2">
            <Clock size={18} className="text-primary" />
            <CardTitle>Sessões ativas</CardTitle>
          </CardHeader>
          <CardContent>
            {sessoes.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhuma sessão ativa no momento</p>
            ) : (
              <div className="space-y-3">
                {sessoes.map((s) => {
                  const acumulado = s.segundos_acumulados || 0;
                  const extra = s.status === "ativa" && s.inicio ? Math.floor((Date.now() - new Date(s.inicio).getTime()) / 1000) : 0;
                  return (
                    <Card key={s.id} className="border-border p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-sm">{s.apelido}</span>
                        <Badge variant={s.status === "ativa" ? "default" : "secondary"}>{s.status}</Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3">
                        <span>Acumulado: {formatHMS(acumulado)}</span>
                        <span>•</span>
                        <span>Total agora: {formatHMS(acumulado + extra)}</span>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => encerrar(s.id)} variant="destructive" className="flex-1">
                          Encerrar
                        </Button>
                        <Button size="sm" onClick={() => cancelar(s.id)} variant="outline" className="flex-1">
                          Cancelar
                        </Button>
                        <div className="flex-1 relative">
                          <Input
                            placeholder="min"
                            value={ajustes[s.id] || ""}
                            onChange={(e) => setAjustes({ ...ajustes, [s.id]: e.target.value })}
                            className="h-8 text-xs pr-8"
                            disabled={s.status !== "ativa"}
                          />
                          <Button
                            size="sm"
                            onClick={() => ajustar(s.id)}
                            className="absolute right-1 top-1 h-7 p-1 text-xs"
                            disabled={s.status !== "ativa" || !ajustes[s.id]}
                          >
                            +
                          </Button>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex items-center gap-2">
            <List size={18} className="text-primary" />
            <CardTitle>Log de auditoria</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-96 overflow-y-auto space-y-2">
              {logs.length === 0 ? (
                <p className="text-muted-foreground text-sm">Sem logs ainda</p>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className="p-2 rounded bg-muted border border-border text-xs">
                    <div className="flex justify-between">
                      <span className="font-medium">{log.admin?.apelido || log.user_id || "sistema"}</span>
                      <span className="text-muted-foreground">{new Date(log.criado_em).toLocaleString("pt-BR")}</span>
                    </div>
                    <div className="text-muted-foreground">{log.acao}</div>
                    {log.detalhe && <div className="text-xs truncate">{log.detalhe}</div>}
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
