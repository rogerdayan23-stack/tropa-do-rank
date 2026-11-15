"use client";

import { useEffect, useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { User, Activity, Clock, Camera, Shield, Calendar, Loader2 } from "lucide-react";
import { toast } from "sonner";

function formatHMS(segundos: number) {
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  const s = Math.floor(segundos % 60);
  return [h, m, s].map((v) => v.toString().padStart(2, "0")).join(":");
}

export default function PerfilPage() {
  const [user, setUser] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [grafico, setGrafico] = useState<{ dia: string; segundos: number }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    carregar();
  }, []);

  async function carregar() {
    try {
      const [resMe, resHist] = await Promise.all([
        fetch("/api/auth/me"),
        fetch("/api/sessoes"),
      ]);
      const me = await resMe.json();
      const data = await resHist.json();

      if (me.user) {
        setUser(me.user);
        // Atualiza localStorage para garantir sincronismo
        try {
          const current = JSON.parse(localStorage.getItem("rankfarm_user") || "{}");
          localStorage.setItem("rankfarm_user", JSON.stringify({ ...current, ...me.user }));
        } catch {}
      }

      const sessoes: any[] = (data.sessoes || []).filter(
        (s: any) => s.status === "encerrada" || s.status === "expirada"
      );

      const total = sessoes.reduce((acc: number, s: any) => acc + (s.duracao || 0), 0);
      const media = sessoes.length ? Math.floor(total / sessoes.length) : 0;

      const diasComSessao = new Set(
        sessoes.map((s) => new Date(s.inicio || s.fim || "").toDateString())
      );
      const streak = diasComSessao.size;

      const agora = new Date();
      const ultimos7 = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(agora);
        d.setDate(agora.getDate() - i);
        ultimos7.push(d.toDateString());
      }
      const porDia: Record<string, number> = {};
      for (const s of sessoes) {
        const ds = new Date(s.inicio || s.fim || "").toDateString();
        porDia[ds] = (porDia[ds] || 0) + (s.duracao || 0);
      }
      const grafico = ultimos7.map((dia) => ({
        dia: new Date(dia).toLocaleDateString("pt-BR", { weekday: "short" }),
        segundos: porDia[dia] || 0,
      }));

      setStats({
        total_segundos: me.user?.total_segundos ?? total,
        total_sessoes: sessoes.length,
        media_segundos: media,
        streak,
      });
      setGrafico(grafico);
    } catch {
      // silencioso
    } finally {
      setLoading(false);
    }
  }

  // Upload da foto de perfil
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validação básica
    if (!file.type.startsWith("image/")) {
      toast.error("Por favor, selecione um arquivo de imagem válido");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("A imagem deve ter no máximo 5MB");
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/user/avatar", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success("Foto de perfil atualizada com sucesso!");
        setUser((prev: any) => ({ ...prev, avatar_url: data.avatar_url }));

        // Atualiza localStorage e dispara evento para navbar
        try {
          const current = JSON.parse(localStorage.getItem("rankfarm_user") || "{}");
          const updated = { ...current, avatar_url: data.avatar_url };
          localStorage.setItem("rankfarm_user", JSON.stringify(updated));
          window.dispatchEvent(new Event("user_updated"));
        } catch {}
      } else {
        toast.error(data.error || "Erro ao fazer upload da imagem");
      }
    } catch {
      toast.error("Erro de conexão ao enviar imagem");
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  const maxSeg = Math.max(...grafico.map((g) => g.segundos), 1);
  const username = user?.username || "Jogador";
  const initial = username.charAt(0).toUpperCase();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Meu Perfil</h1>
        <p className="text-muted-foreground">Gerencie sua conta e visualize suas estatísticas</p>
      </div>

      {loading ? (
        <div className="h-96 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {/* Card de Informações do Usuário e Upload de Foto */}
          <Card className="border-border/60 bg-card/60 backdrop-blur-md overflow-hidden shadow-xl">
            <CardContent className="p-6 sm:p-8">
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
                {/* Avatar com Botão de Upload */}
                <div className="relative group">
                  <div className="h-28 w-28 rounded-full overflow-hidden border-2 border-primary/50 shadow-lg shadow-primary/10 bg-muted/60 flex items-center justify-center">
                    {user?.avatar_url ? (
                      <img
                        src={user.avatar_url}
                        alt={username}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="text-4xl font-extrabold text-primary font-mono">
                        {initial}
                      </span>
                    )}
                  </div>

                  {/* Botão de Câmera sobre o Avatar */}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="absolute inset-0 rounded-full bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white cursor-pointer"
                    title="Alterar foto"
                  >
                    {uploading ? (
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    ) : (
                      <>
                        <Camera size={22} className="text-primary mb-1" />
                        <span className="text-[10px] font-semibold tracking-wider uppercase">Alterar</span>
                      </>
                    )}
                  </button>

                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept="image/*"
                    className="hidden"
                  />
                </div>

                {/* Dados do Usuário */}
                <div className="flex-1 text-center sm:text-left space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                    <h2 className="text-2xl font-bold tracking-tight text-foreground">{username}</h2>
                    {user?.role === "admin" ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-primary/20 text-primary border border-primary/40 w-fit mx-auto sm:mx-0">
                        <Shield size={13} /> Administrador
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-muted text-muted-foreground border border-border w-fit mx-auto sm:mx-0">
                        🟢 Jogador Ativo
                      </span>
                    )}
                  </div>

                  <p className="text-sm text-muted-foreground flex items-center justify-center sm:justify-start gap-1.5">
                    <Calendar size={15} />
                    Membro desde: {user?.created_at ? new Date(user.created_at).toLocaleDateString("pt-BR") : "N/D"}
                  </p>

                  <div className="pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="border-primary/40 text-primary hover:bg-primary/10 gap-2"
                    >
                      {uploading ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          Enviando foto...
                        </>
                      ) : (
                        <>
                          <Camera size={16} />
                          Escolher foto do PC
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Cards de Estatísticas */}
          <div className="grid md:grid-cols-2 gap-6">
            <Card className="border-border/60 bg-card/60 backdrop-blur-md">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <User size={18} className="text-primary" /> Resumo de Atividades
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center text-sm p-2 rounded-lg bg-muted/30">
                  <span className="text-muted-foreground">Tempo total farmado</span>
                  <span className="font-mono font-bold text-primary">{formatHMS(stats.total_segundos)}</span>
                </div>
                <div className="flex justify-between items-center text-sm p-2 rounded-lg bg-muted/30">
                  <span className="text-muted-foreground">Sessões concluídas</span>
                  <span className="font-mono font-bold text-foreground">{stats.total_sessoes}</span>
                </div>
                <div className="flex justify-between items-center text-sm p-2 rounded-lg bg-muted/30">
                  <span className="text-muted-foreground">Média de duração</span>
                  <span className="font-mono font-bold text-foreground">{formatHMS(stats.media_segundos)}</span>
                </div>
                <div className="flex justify-between items-center text-sm p-2 rounded-lg bg-muted/30">
                  <span className="text-muted-foreground">Dias ativos (streak)</span>
                  <span className="font-mono font-bold text-foreground">{stats.streak} dias</span>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/60 bg-card/60 backdrop-blur-md">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Activity size={18} className="text-primary" /> Tempo por Dia (Últimos 7 dias)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64 flex items-end justify-between gap-2 px-2 pb-2">
                  {grafico.map((g) => {
                    const altura = Math.max(20, (g.segundos / maxSeg) * 160);
                    return (
                      <div key={g.dia} className="flex-1 flex flex-col items-center gap-2">
                        <div className="text-xs text-muted-foreground capitalize">{g.dia}</div>
                        <div
                          className="w-full max-w-[40px] rounded-t-lg bg-primary/80 hover:bg-primary transition-all shadow-md shadow-primary/20"
                          style={{ height: `${altura}px` }}
                        />
                        <div className="text-[11px] font-mono text-muted-foreground">{formatHMS(g.segundos)}</div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
