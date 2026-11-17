"use client";

import { useEffect, useState, useMemo } from "react";
import {
  DollarSign,
  Loader2,
  CheckCircle2,
  Clock,
  TrendingUp,
  Users,
  CalendarDays,
  RotateCcw,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";

interface JogadorSaldo {
  id: string;
  username: string;
  avatar_url: string | null;
  horas_dia: number;
  horas_semana: number;
  valor_dia: number;
  bruto_semana: number;
  penalidades_semana: number;
  total_receber_semana: number;
  pago: boolean;
  pago_em: string | null;
}

interface ResumoSemanal {
  data_inicio: string;
  data_fim: string;
  lucro_bruto_semana: number;
  total_horas_equipe_semana: number;
  fechada: boolean;
}

interface DiaSelecionado {
  data: string;
  lucro_dia: number;
  total_horas_dia: number;
  taxa_hora_dia: number;
}

interface SaldoData {
  resumo_semanal: ResumoSemanal;
  dia_selecionado: DiaSelecionado;
  jogadores: JogadorSaldo[];
}

function Avatar({ url, nome }: { url: string | null; nome: string }) {
  const src = url ? (url.startsWith("http") ? url : `/${url.replace(/^\//, "")}`) : null;
  return (
    <div className="w-8 h-8 rounded-full overflow-hidden bg-primary/20 border border-primary/30 flex items-center justify-center flex-shrink-0">
      {src ? (
        <img src={src} alt={nome} className="w-full h-full object-cover" />
      ) : (
        <span className="text-xs font-bold text-primary">{nome?.[0]?.toUpperCase() || "?"}</span>
      )}
    </div>
  );
}

function formatHoras(h: number) {
  if (!h || h <= 0) return "0h 00m";
  const horas = Math.floor(h);
  const mins = Math.round((h - horas) * 60);
  return `${horas}h ${mins.toString().padStart(2, "0")}m`;
}

function formatPagoEm(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function formatDataBR(dataStr: string) {
  if (!dataStr) return "";
  const [ano, mes, dia] = dataStr.split("-");
  return `${dia}/${mes}/${ano}`;
}

export default function SaldosPage() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [salvandoLucro, setSalvandoLucro] = useState(false);
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [fechandoSemana, setFechandoSemana] = useState(false);
  const [modalFecharOpen, setModalFecharOpen] = useState(false);

  const hoje = new Date().toISOString().split("T")[0];
  const [dataSel, setDataSel] = useState(hoje);
  const [valorLucroInput, setValorLucroInput] = useState("");
  const [saldoData, setSaldoData] = useState<SaldoData | null>(null);

  useEffect(() => {
    verificarAdmin();
  }, []);

  useEffect(() => {
    void buscarSaldos();
    const intervalo = setInterval(() => void buscarSaldos(false), 10000);
    return () => clearInterval(intervalo);
  }, [dataSel]);

  async function verificarAdmin() {
    try {
      const res = await fetch("/api/auth/me");
      const data = await res.json();
      setIsAdmin(data.user?.role === "admin" || data.user?.role === "moderador");
      setLoading(false);
    } catch {
      setLoading(false);
    }
  }

  async function buscarSaldos(atualizarInputLucro = true) {
    try {
      const res = await fetch(`/api/saldos?data=${dataSel}`, { cache: "no-store" });
      const data: SaldoData = await res.json();
      if (res.ok) {
        setSaldoData(data);
        if (atualizarInputLucro) {
          if (data.dia_selecionado?.lucro_dia > 0) {
            setValorLucroInput(data.dia_selecionado.lucro_dia.toString());
          } else {
            setValorLucroInput("");
          }
        }
      } else {
        toast.error("Erro ao carregar saldos");
      }
    } catch {
      toast.error("Erro ao conectar com a API");
    }
  }

  async function salvarLucro() {
    const valor = parseFloat(valorLucroInput);
    if (isNaN(valor) || valor < 0) {
      toast.error("Informe um valor válido");
      return;
    }
    setSalvandoLucro(true);
    try {
      const res = await fetch("/api/saldos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: dataSel, valor_total: valor }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Erro ao salvar lucro");
        return;
      }
      toast.success("Lucro diário salvo e cálculos atualizados!");
      await buscarSaldos();
    } catch {
      toast.error("Erro de conexão");
    } finally {
      setSalvandoLucro(false);
    }
  }

  async function fecharSemana() {
    if (!saldoData) return;
    setFechandoSemana(true);
    try {
      const res = await fetch("/api/saldos/fechar-semana", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data_inicio: saldoData.resumo_semanal.data_inicio,
          data_fim: saldoData.resumo_semanal.data_fim,
          lucro_total: dadosCalculadosEmTempoReal.lucroBrutoSemana,
          total_horas: saldoData.resumo_semanal.total_horas_equipe_semana,
          detalhes: dadosCalculadosEmTempoReal.jogadores,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Erro ao fechar semana");
        return;
      }
      toast.success("Semana resetada com sucesso!");
      setModalFecharOpen(false);
      setValorLucroInput("");
      await buscarSaldos();
    } catch {
      toast.error("Erro de conexão ao fechar semana");
    } finally {
      setFechandoSemana(false);
    }
  }

  async function confirmarPagamento(jogador: JogadorSaldo) {
    setConfirmando(jogador.id);
    try {
      const res = await fetch("/api/saldos/pagar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: dataSel,
          user_id: jogador.id,
          horas_farmadas: jogador.horas_dia,
          valor_calculado: jogador.valor_dia,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Erro ao confirmar pagamento");
        return;
      }
      toast.success(`Pagamento de ${jogador.username} confirmado!`);
      await buscarSaldos();
    } catch {
      toast.error("Erro de conexão");
    } finally {
      setConfirmando(null);
    }
  }

  // CÁLCULO DINÂMICO EM TEMPO REAL:
  // Conforme o Admin altera o valor do input, recalcula as linhas instantaneamente
  const dadosCalculadosEmTempoReal = useMemo(() => {
    if (!saldoData) {
      return {
        taxaHoraDia: 0,
        lucroBrutoSemana: 0,
        jogadores: [],
      };
    }

    const valorDiaDigitado = parseFloat(valorLucroInput) || 0;
    const totalHorasDia = saldoData.dia_selecionado.total_horas_dia || 0;
    const taxaHoraDia = totalHorasDia > 0 ? valorDiaDigitado / totalHorasDia : 0;

    // Diferença em relação ao lucro salvo no banco para ajustar o total semanal
    const lucroSalvoDia = saldoData.dia_selecionado.lucro_dia || 0;
    const diffDia = valorDiaDigitado - lucroSalvoDia;
    const lucroBrutoSemana = Math.max(0, saldoData.resumo_semanal.lucro_bruto_semana + diffDia);

    const jogadoresAtualizados = saldoData.jogadores.map((j) => {
      // Valor ganho no dia com o novo input
      const novoValorDia = j.horas_dia * taxaHoraDia;

      // Ganho dos outros dias da semana (excluindo o valor antigo do dia)
      const ganhoOutrosDias = Math.max(0, j.bruto_semana - j.valor_dia);
      const novoBrutoSemana = ganhoOutrosDias + novoValorDia;

      // Total a receber na semana = Bruto da semana - Penalidades ativas da semana (mínimo 0)
      const novoTotalReceber = Math.max(0, novoBrutoSemana - j.penalidades_semana);

      return {
        ...j,
        valor_dia: Number(novoValorDia.toFixed(2)),
        bruto_semana: Number(novoBrutoSemana.toFixed(2)),
        total_receber_semana: Number(novoTotalReceber.toFixed(2)),
      };
    });

    return {
      taxaHoraDia: Number(taxaHoraDia.toFixed(2)),
      lucroBrutoSemana: Number(lucroBrutoSemana.toFixed(2)),
      jogadores: jogadoresAtualizados,
    };
  }, [saldoData, valorLucroInput]);

  if (loading) {
    return (
      <div className="h-96 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const resumo = saldoData?.resumo_semanal;

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <DollarSign size={24} className="text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">Gerenciar Saldos</h1>
        </div>
        <p className="text-muted-foreground text-sm">
          Acompanhe o acúmulo semanal da banca, lance os lucros diários e faça o rateio proporcional.
        </p>
      </div>

      {/* 1. SEÇÃO DE DESTAQUE: RESUMO SEMANAL */}
      {resumo && (
        <Card className="border-2 border-primary/35 bg-primary/[0.025] shadow-[0_0_25px_rgba(99,102,241,0.08)]">
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
                  <CardTitle className="text-lg font-bold text-foreground">
                    Resumo Semanal da Tropa
                  </CardTitle>
                  <Badge variant="outline" className="border-primary/40 text-primary text-xs">
                    {formatDataBR(resumo.data_inicio)} até {formatDataBR(resumo.data_fim)}
                  </Badge>
                </div>
                <CardDescription className="mt-1">
                  Saldo bruto acumulado de Segunda a Domingo (sem descontos de penalidades na banca)
                </CardDescription>
              </div>

            {isAdmin && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setModalFecharOpen(true)}
                className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300 self-start sm:self-auto"
              >
                <RotateCcw size={14} className="mr-2" />
                Fechar Semana / Resetar
              </Button>
            )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
              <div className="p-4 rounded-lg bg-black/40 border border-primary/20">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  <TrendingUp size={14} className="text-primary" />
                  Lucro Bruto da Semana
                </p>
                <p className="text-3xl font-extrabold text-primary font-mono">
                  R$ {dadosCalculadosEmTempoReal.lucroBrutoSemana.toFixed(2).replace(".", ",")}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Total de lucros diários registrados</p>
              </div>

              <div className="p-4 rounded-lg bg-black/40 border border-border/40">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  <Clock size={14} className="text-primary" />
                  Total de Horas Farmadas pela Equipe
                </p>
                <p className="text-3xl font-bold font-mono">
                  {formatHoras(resumo.total_horas_equipe_semana)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Soma das horas jogadas na semana</p>
              </div>

              <div className="p-4 rounded-lg bg-black/40 border border-border/40 sm:col-span-2 lg:col-span-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  <Users size={14} className="text-primary" />
                  Jogadores Cadastrados
                </p>
                <p className="text-3xl font-bold font-mono">
                  {dadosCalculadosEmTempoReal.jogadores.length}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Integrantes ativos no time</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 2. CONTROLE DIÁRIO (LANÇAMENTO DO DIA) - APENAS ADMIN */}
      {isAdmin && (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarDays size={18} className="text-primary" />
            Lançamento e Cálculo Diário
          </CardTitle>
          <CardDescription>
            Selecione a data, informe o lucro do dia e clique em calcular para ratear em tempo real.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:flex sm:flex-wrap sm:items-end">
            <div className="space-y-2 w-full sm:w-auto">
              <Label className="text-xs text-muted-foreground">Data do Farm</Label>
              <div className="relative">
                <CalendarDays size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="date"
                  value={dataSel}
                  onChange={(e) => setDataSel(e.target.value)}
                  className="pl-9 bg-background border-border/60 w-full sm:w-44"
                />
              </div>
            </div>

            <div className="space-y-2 w-full sm:w-auto">
              <Label className="text-xs text-muted-foreground">Lucro Total do Dia (R$)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-semibold">
                  R$
                </span>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={valorLucroInput}
                  onChange={(e) => setValorLucroInput(e.target.value)}
                  placeholder="0,00"
                  className="pl-9 bg-background border-border/60 w-full sm:w-44 font-mono"
                />
              </div>
            </div>

            {isAdmin && (
              <Button
                onClick={salvarLucro}
                disabled={salvandoLucro || !valorLucroInput}
                className="w-full sm:w-auto bg-primary text-black font-semibold hover:bg-primary/90"
              >
                {salvandoLucro ? <Loader2 size={14} className="animate-spin mr-2" /> : null}
                Salvar / Calcular Lucro do Dia
              </Button>
            )}

            {/* Taxa/Hora do Dia em destaque */}
            <div className="w-full sm:ml-auto sm:w-auto flex items-center justify-between sm:justify-start gap-3 bg-muted/30 px-4 py-3 sm:py-2 rounded-lg border border-border/40">
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Horas do Dia (Time):</p>
                <p className="font-bold text-sm">
                  {formatHoras(saldoData?.dia_selecionado?.total_horas_dia || 0)}
                </p>
              </div>
              <div className="h-7 w-px bg-border/60" />
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Taxa/Hora do Dia:</p>
                <p className="font-bold text-sm text-primary font-mono">
                  R$ {dadosCalculadosEmTempoReal.taxaHoraDia.toFixed(2).replace(".", ",")}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      )}

      {/* 3. TABELA: DIVISÃO POR JOGADOR (SEMPRE VISÍVEL) */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <CardTitle className="text-base flex items-center gap-2">
                <Users size={18} className="text-primary" />
                Divisão por Jogador
              </CardTitle>
              <CardDescription>
                Lista de todos os jogadores cadastrados com rateio dinâmico em tempo real
              </CardDescription>
            </div>
            <span className="text-xs text-muted-foreground">
              Exibindo dia: <strong>{formatDataBR(dataSel)}</strong>
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 bg-muted/20">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Jogador
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Horas do Dia
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Horas da Semana
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Valor do Dia (R$)
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Penalidades Sem.
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-primary uppercase tracking-wider bg-primary/5">
                    Total a Receber na Semana
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Status Dia
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {dadosCalculadosEmTempoReal.jogadores.map((j) => (
                  <tr key={j.id} className="hover:bg-white/[0.02] transition-colors">
                    {/* Jogador: Nome e Foto */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <Avatar url={j.avatar_url} nome={j.username} />
                        <div>
                          <p className="font-semibold text-foreground">{j.username}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {j.horas_semana > 0 ? "Horas contabilizadas" : "Sem horas no período"}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Horas do Dia */}
                    <td className="px-4 py-3.5 text-center font-mono">
                      {formatHoras(j.horas_dia)}
                    </td>

                    {/* Horas da Semana */}
                    <td className="px-4 py-3.5 text-center font-mono font-medium">
                      {formatHoras(j.horas_semana)}
                    </td>

                    {/* Valor do Dia */}
                    <td className="px-4 py-3.5 text-right font-mono">
                      R$ {j.valor_dia.toFixed(2).replace(".", ",")}
                    </td>

                    {/* Penalidades da Semana */}
                    <td className="px-4 py-3.5 text-right font-mono">
                      {j.penalidades_semana > 0 ? (
                        <span className="text-red-400 font-semibold">
                          -R$ {j.penalidades_semana.toFixed(2).replace(".", ",")}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>

                    {/* Total a Receber na Semana (EM DESTAQUE) */}
                    <td className="px-4 py-3.5 text-right font-mono font-extrabold text-base text-primary bg-primary/[0.04]">
                      R$ {j.total_receber_semana.toFixed(2).replace(".", ",")}
                    </td>

                    {/* Status / Ação */}
                    <td className="px-4 py-3.5 text-center">
                      {j.pago ? (
                        <div className="flex flex-col items-center gap-0.5">
                          <Badge className="bg-primary/15 text-primary border-primary/30 text-xs font-semibold">
                            <CheckCircle2 size={11} className="mr-1" />
                            Pago
                          </Badge>
                          {j.pago_em && (
                            <span className="text-[10px] text-muted-foreground">
                              {formatPagoEm(j.pago_em)}
                            </span>
                          )}
                        </div>
                      ) : j.valor_dia > 0 ? (
                        isAdmin ? (
                          <Button
                            size="sm"
                            onClick={() => confirmarPagamento(j)}
                            disabled={confirmando === j.id}
                            className="h-7 text-xs bg-primary text-black hover:bg-primary/90 font-semibold"
                          >
                            {confirmando === j.id ? (
                              <Loader2 size={12} className="animate-spin mr-1" />
                            ) : null}
                            Confirmar
                          </Button>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-[10px] border-violet-400/30 text-violet-200"
                          >
                            <Clock size={10} className="mr-1" />
                            A pagar
                          </Badge>
                        )
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-3 p-3 md:hidden">
            {dadosCalculadosEmTempoReal.jogadores.map((j) => (
              <article key={j.id} className="rounded-xl border border-border/60 bg-white/[0.025] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar url={j.avatar_url} nome={j.username} />
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{j.username}</p>
                      <p className="text-xs text-muted-foreground">{j.horas_semana > 0 ? "Horas contabilizadas" : "Sem horas no período"}</p>
                    </div>
                  </div>
                  {j.pago ? (
                    <Badge className="shrink-0 bg-primary/15 text-primary border-primary/30"><CheckCircle2 size={12} className="mr-1" />Pago</Badge>
                  ) : j.valor_dia > 0 ? (
                    <Badge variant="outline" className="shrink-0 border-violet-400/30 text-violet-200"><Clock size={12} className="mr-1" />A pagar</Badge>
                  ) : <Badge variant="outline" className="shrink-0">Pendente</Badge>}
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded-lg bg-black/20 p-2.5"><p className="text-muted-foreground">Horas hoje</p><p className="mt-1 font-mono font-semibold">{formatHoras(j.horas_dia)}</p></div>
                  <div className="rounded-lg bg-black/20 p-2.5"><p className="text-muted-foreground">Horas semana</p><p className="mt-1 font-mono font-semibold">{formatHoras(j.horas_semana)}</p></div>
                  <div className="rounded-lg bg-black/20 p-2.5"><p className="text-muted-foreground">Valor do dia</p><p className="mt-1 font-mono">R$ {j.valor_dia.toFixed(2).replace(".", ",")}</p></div>
                  <div className="rounded-lg bg-black/20 p-2.5"><p className="text-muted-foreground">Penalidades</p><p className={`mt-1 font-mono ${j.penalidades_semana > 0 ? "font-semibold text-red-400" : ""}`}>{j.penalidades_semana > 0 ? `−R$ ${j.penalidades_semana.toFixed(2).replace(".", ",")}` : "—"}</p></div>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-primary/20 bg-primary/[0.06] px-3 py-2.5">
                  <span className="text-xs text-muted-foreground">Total na semana</span>
                  <span className="font-mono text-base font-extrabold text-primary">R$ {j.total_receber_semana.toFixed(2).replace(".", ",")}</span>
                </div>
                {j.pago_em && j.pago && <p className="mt-2 text-right text-[11px] text-muted-foreground">Pago às {formatPagoEm(j.pago_em)}</p>}
                {!j.pago && j.valor_dia > 0 && isAdmin && (
                  <Button onClick={() => confirmarPagamento(j)} disabled={confirmando === j.id} className="mt-3 h-11 w-full bg-primary font-semibold text-black hover:bg-primary/90">
                    {confirmando === j.id ? <Loader2 size={14} className="mr-2 animate-spin" /> : <CheckCircle2 size={14} className="mr-2" />}
                    Confirmar pagamento
                  </Button>
                )}
              </article>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* MODAL DE CONFIRMAÇÃO: FECHAR SEMANA / RESETAR */}
      <Dialog open={modalFecharOpen} onOpenChange={setModalFecharOpen}>
        <DialogContent className="bg-[#111] border-border/60 max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <AlertTriangle size={20} />
              Fechar Semana e Resetar Ciclo?
            </DialogTitle>
            <DialogDescription className="text-muted-foreground pt-2 text-sm leading-relaxed">
              Esta ação irá consolidar todos os lucros e rateios da semana atual (
              <strong>
                {formatDataBR(resumo?.data_inicio || "")} até {formatDataBR(resumo?.data_fim || "")}
              </strong>
              ), salvar um histórico no banco de dados e iniciar um novo ciclo semanal.
            </DialogDescription>
          </DialogHeader>

          <div className="py-3 px-4 rounded-lg bg-black/60 border border-border/40 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Lucro Total a fechar:</span>
              <span className="font-bold font-mono text-primary">
                R$ {dadosCalculadosEmTempoReal.lucroBrutoSemana.toFixed(2).replace(".", ",")}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total de Horas da Equipe:</span>
              <span className="font-bold font-mono">
                {formatHoras(resumo?.total_horas_equipe_semana || 0)}
              </span>
            </div>
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setModalFecharOpen(false)}
              disabled={fechandoSemana}
            >
              Cancelar
            </Button>
            <Button
              onClick={fecharSemana}
              disabled={fechandoSemana}
              className="bg-red-500 hover:bg-red-600 text-white font-semibold"
            >
              {fechandoSemana ? <Loader2 size={14} className="animate-spin mr-2" /> : null}
              Confirmar Fechamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

