"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Plus, Shield, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

interface Penalidade {
  id: string;
  user_id: string;
  jogador_nome: string;
  jogador_avatar: string | null;
  admin_nome: string;
  motivo: string;
  valor: number;
  created_at: string;
}

interface Jogador {
  id: string;
  username: string;
  avatar_url: string | null;
}

interface ResumoJogador {
  id: string;
  nome: string;
  avatar: string | null;
  total: number;
  quantidade: number;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Avatar({ url, nome, size = 8 }: { url: string | null; nome: string; size?: number }) {
  const src = url ? (url.startsWith("http") ? url : `/${url.replace(/^\//, "")}`) : null;
  const sz = `w-${size} h-${size}`;
  return (
    <div
      className={`${sz} rounded-full overflow-hidden bg-primary/20 border border-primary/30 flex items-center justify-center flex-shrink-0`}
    >
      {src ? (
        <img src={src} alt={nome} className="w-full h-full object-cover" />
      ) : (
        <span className="text-xs font-bold text-primary">{nome?.[0]?.toUpperCase() || "?"}</span>
      )}
    </div>
  );
}

export default function PenalidadesPage() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [penalidades, setPenalidades] = useState<Penalidade[]>([]);
  const [jogadores, setJogadores] = useState<Jogador[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [removendo, setRemovendo] = useState<string | null>(null);

  // Form state
  const [userId, setUserId] = useState("");
  const [motivo, setMotivo] = useState("");
  const [valor, setValor] = useState("");

  useEffect(() => {
    carregar();
  }, []);

  async function carregar() {
    setLoading(true);
    try {
      const [resMe, resPen, resJog] = await Promise.all([
        fetch("/api/auth/me"),
        fetch("/api/penalidades"),
        fetch("/api/jogadores"),
      ]);
      const me = await resMe.json();
      const pen = await resPen.json();
      const jog = await resJog.json();

      setIsAdmin(me.user?.role === "admin" || me.user?.role === "moderador");
      setPenalidades(pen.penalidades || []);
      setJogadores(jog.jogadores || []);
    } catch {
      toast.error("Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  }

  async function salvarPenalidade() {
    if (!userId || !motivo.trim() || !valor) {
      toast.error("Preencha todos os campos");
      return;
    }
    const valorNum = parseFloat(valor);
    if (isNaN(valorNum) || valorNum <= 0) {
      toast.error("O valor deve ser maior que zero");
      return;
    }

    setSalvando(true);
    try {
      const res = await fetch("/api/penalidades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, motivo: motivo.trim(), valor: valorNum }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Erro ao salvar penalidade");
        return;
      }
      toast.success("Penalidade aplicada!");
      setModalOpen(false);
      setUserId("");
      setMotivo("");
      setValor("");
      await carregar();
    } catch {
      toast.error("Erro de conexão");
    } finally {
      setSalvando(false);
    }
  }

  async function removerPenalidade(id: string, nomeJogador: string) {
    if (!confirm(`Remover penalidade de ${nomeJogador}? Esta ação não pode ser desfeita.`)) return;
    setRemovendo(id);
    try {
      const res = await fetch("/api/penalidades", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Erro ao remover");
        return;
      }
      toast.success("Penalidade removida!");
      await carregar();
    } catch {
      toast.error("Erro de conexão");
    } finally {
      setRemovendo(null);
    }
  }

  if (loading) {
    return (
      <div className="h-96 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Resumo por jogador
  const resumoPorJogador: ResumoJogador[] = [];
  const mapaJogadores: Record<string, ResumoJogador> = {};
  for (const p of penalidades) {
    if (!mapaJogadores[p.user_id]) {
      mapaJogadores[p.user_id] = {
        id: p.user_id,
        nome: p.jogador_nome,
        avatar: p.jogador_avatar,
        total: 0,
        quantidade: 0,
      };
      resumoPorJogador.push(mapaJogadores[p.user_id]);
    }
    mapaJogadores[p.user_id].total += p.valor;
    mapaJogadores[p.user_id].quantidade += 1;
  }
  resumoPorJogador.sort((a, b) => b.total - a.total);

  return (
    <div className="space-y-6">
      {/* Header */}
        <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle size={22} className="text-violet-200" />
            <h1 className="text-2xl font-bold tracking-tight">Penalidades</h1>
          </div>
          <p className="text-muted-foreground text-sm">
            Registre e acompanhe as penalidades aplicadas ao time
          </p>
        </div>
        {isAdmin && (
          <Button
            onClick={() => setModalOpen(true)}
            className="bg-primary text-black font-semibold hover:bg-primary/90"
          >
            <Plus size={16} className="mr-2" />
            Nova Penalidade
          </Button>
        )}
      </div>

      {/* Resumo por jogador */}
      {resumoPorJogador.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {resumoPorJogador.map((j) => (
          <Card key={j.id} className="border-rose-400/20">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2 mb-2">
                  <Avatar url={j.avatar} nome={j.nome} size={7} />
                  <span className="text-sm font-semibold truncate">{j.nome}</span>
                </div>
                <p className="text-xl font-bold text-red-400">
                  -R$ {j.total.toFixed(2).replace(".", ",")}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {j.quantidade} {j.quantidade === 1 ? "penalidade" : "penalidades"}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Tabela */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            Histórico de Penalidades
            <span className="text-xs font-normal text-muted-foreground">
              {penalidades.length} {penalidades.length === 1 ? "registro" : "registros"}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {penalidades.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <AlertTriangle size={40} className="mb-3 opacity-30" />
              <p className="text-sm">Nenhuma penalidade registrada ainda</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Jogador
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Motivo
                    </th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Valor
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Aplicada por
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Data
                    </th>
                    {isAdmin && (
                      <th className="w-12 px-4 py-3" />
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {penalidades.map((p) => (
                    <tr key={p.id} className="hover:bg-white/[0.02] transition-colors group">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Avatar url={p.jogador_avatar} nome={p.jogador_nome} />
                          <span className="font-medium">{p.jogador_nome}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground max-w-xs">
                        <span className="line-clamp-2">{p.motivo}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Badge variant="destructive" className="font-mono">
                          -R$ {p.valor.toFixed(2).replace(".", ",")}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Shield size={12} className="text-primary" />
                          {p.admin_nome || "—"}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                        {formatDate(p.created_at)}
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-3">
                          <button
                            onClick={() => removerPenalidade(p.id, p.jogador_nome)}
                            disabled={removendo === p.id}
                            title="Remover penalidade (paga)"
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md hover:bg-red-500/10 hover:text-red-400 text-muted-foreground disabled:opacity-50"
                          >
                            {removendo === p.id ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <Trash2 size={14} />
                            )}
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal Nova Penalidade */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="bg-[#111] border-border/60 max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle size={18} className="text-violet-200" />
              Nova Penalidade
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Jogador</Label>
              <select
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                className="w-full h-10 rounded-md border border-border/60 bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Selecione o jogador...</option>
                {jogadores.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.username}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label>Motivo</Label>
              <textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Descreva o motivo da penalidade..."
                rows={3}
                className="w-full rounded-md border border-border/60 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              />
            </div>

            <div className="space-y-2">
              <Label>Valor do Desconto (R$)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                  R$
                </span>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  placeholder="0,00"
                  className="pl-9 bg-background border-border/60"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Padrão Regra 5: R$ 3,00 (entregada grave)
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={salvando}>
              Cancelar
            </Button>
            <Button
              onClick={salvarPenalidade}
              disabled={salvando}
              className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold"
            >
              {salvando ? <Loader2 size={16} className="animate-spin mr-2" /> : null}
              Aplicar Penalidade
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
