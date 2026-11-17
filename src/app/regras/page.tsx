"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Shield, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function RegrasPage() {
  const [texto, setTexto] = useState("");
  const [aceito, setAceito] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState(false);
  const [primeiroAcesso, setPrimeiroAcesso] = useState(true);

  useEffect(() => {
    carregar();
    if (typeof window !== "undefined") {
      const aceitoLS = localStorage.getItem("tropa_regras_aceito");
      setAceito(!!aceitoLS);
      setPrimeiroAcesso(!aceitoLS);
    }
  }, []);

  async function carregar() {
    try {
      const [resRegras, resMe] = await Promise.all([fetch("/api/regras"), fetch("/api/auth/me")]);
      const regras = await resRegras.json();
      const me = await resMe.json();
      setTexto(regras.texto || "");
      setIsAdmin(me.user?.role === "admin");
    } catch {
      // silencioso
    } finally {
      setLoading(false);
    }
  }

  async function salvarRegras() {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const res = await fetch("/api/regras", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto }),
      });
      if (res.ok) {
        setEditando(false);
        toast.success("Regras atualizadas");
      } else {
        toast.error("Erro ao salvar regras");
      }
    } catch {
      toast.error("Erro de conexão");
    } finally {
      setLoading(false);
    }
  }

  function aceitarRegras() {
    localStorage.setItem("tropa_regras_aceito", "1");
    setAceito(true);
    toast.success("Regras aceitas");
  }

  if (loading) return <div className="h-96 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Regras</h1>
          <p className="text-muted-foreground">Regras do Rank dos Cuiudos</p>
        </div>
        {isAdmin && (
          <Button onClick={() => setEditando(!editando)} variant="outline" size="sm">
            {editando ? "Cancelar edição" : "Editar regras"}
          </Button>
        )}
      </div>

      {primeiroAcesso && !aceito && (
        <Card className="border-warning/50 bg-warning/5">
          <CardHeader className="flex items-center gap-3">
            <Shield size={20} className="text-warning" />
            <CardTitle>Aceite as regras antes de começar</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">Leia as regras abaixo e marque que concorda para iniciar suas sessões de farm.</p>
          </CardContent>
          <CardFooter>
            <Button onClick={aceitarRegras} className="bg-primary text-primary-foreground font-semibold">
              <Check size={18} className="mr-2" />
              Li e aceito as regras
            </Button>
          </CardFooter>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Texto das regras</CardTitle>
        </CardHeader>
        <CardContent className={isAdmin && editando ? "p-0" : "p-6"}>
          {isAdmin && editando ? (
            <div className="p-6">
              <Textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                className="h-96 font-mono text-sm mb-4"
                placeholder="Digite as regras..."
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditando(false)}>Cancelar</Button>
                <Button onClick={salvarRegras} disabled={loading} className="bg-primary text-primary-foreground">
                  Salvar regras
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-foreground leading-relaxed">
              {texto ? (
                <div className="prose prose-invert max-w-none space-y-4">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      h1: ({ node, ...props }) => <h1 className="text-2xl font-bold text-primary mb-4 border-b border-border pb-2" {...props} />,
                      h2: ({ node, ...props }) => <h2 className="text-xl font-bold text-foreground mt-6 mb-3" {...props} />,
                      h3: ({ node, ...props }) => <h3 className="text-lg font-semibold text-foreground mt-4 mb-2" {...props} />,
                      p: ({ node, ...props }) => <p className="text-muted-foreground my-2" {...props} />,
                      strong: ({ node, ...props }) => <strong className="text-foreground font-semibold" {...props} />,
                      table: ({ node, ...props }) => (
                        <div className="overflow-x-auto my-4 rounded-lg border border-border">
                          <table className="w-full text-left border-collapse" {...props} />
                        </div>
                      ),
                      thead: ({ node, ...props }) => <thead className="bg-muted text-foreground border-b border-border" {...props} />,
                      th: ({ node, ...props }) => <th className="p-3 text-sm font-semibold" {...props} />,
                      td: ({ node, ...props }) => <td className="p-3 text-sm border-t border-border/50 text-muted-foreground" {...props} />,
                      tr: ({ node, ...props }) => <tr className="hover:bg-muted/40 transition-colors" {...props} />,
                      hr: ({ node, ...props }) => <hr className="my-6 border-border" {...props} />,
                      ul: ({ node, ...props }) => <ul className="list-disc pl-5 my-2 space-y-1.5" {...props} />,
                      ol: ({ node, ...props }) => <ol className="list-decimal pl-5 my-2 space-y-1.5" {...props} />,
                      li: ({ node, ...props }) => <li className="text-muted-foreground leading-relaxed pl-1" {...props} />,
                      blockquote: ({ node, ...props }) => (
                        <blockquote className="border-l-4 border-primary/50 bg-primary/5 pl-4 pr-3 py-2 my-4 rounded-r-lg text-muted-foreground" {...props} />
                      ),
                      a: ({ node, ...props }) => <a className="text-primary underline hover:text-primary/80" {...props} />,
                      code: ({ node, ...props }) => (
                        <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono text-foreground" {...props} />
                      ),
                    }}
                  >
                    {texto}
                  </ReactMarkdown>
                </div>
              ) : (
                <p className="text-muted-foreground">Nenhuma regra cadastrada ainda.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {!primeiroAcesso && aceito && (
        <Card>
          <CardHeader>
            <CardTitle>Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-sm">
              <Check size={16} className="text-primary" />
              <span>Você já aceitou as regras.</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
