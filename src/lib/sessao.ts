// Configuração central de sessões do Rank Farm.
// Qualquer alteração no timeout de sessão deve ser feita aqui.

/** Limite de duração de uma sessão ativa: 5 horas (18000 segundos). */
export const LIMITE_SESSAO_SEGUNDOS = 5 * 60 * 60; // 18000

/** Tempo de inatividade antes de pausar automaticamente (10 minutos). */
export const LIMITE_INATIVIDADE_SEGUNDOS = 10 * 60; // 600

export const STATUS_ATIVA = "ativa";
export const STATUS_PAUSADA = "pausada";
export const STATUS_ENCERRADA = "encerrada";
export const STATUS_EXPIRADA = "expirada";

export interface SessaoRow {
  id: string;
  user_id: string;
  inicio: string | null;
  fim: string | null;
  status: string;
  segundos_acumulados: number | null;
  ultima_atividade: string | null;
}

function segundosDesdeInicio(inicio: string | null): number {
  if (!inicio) return 0;
  const instanteInicio = new Date(inicio).getTime();
  if (!Number.isFinite(instanteInicio)) return 0;
  // Relógios do cliente e do servidor podem divergir; uma data futura não
  // deve transformar o tempo da sessão em um valor negativo.
  return Math.max(0, Math.floor((Date.now() - instanteInicio) / 1000));
}

/**
 * Calcula o total de segundos contabilizados para uma sessão.
 * - Se estiver ativa, soma o tempo decorrido desde `inicio` até agora.
 * - Se estiver pausada/encerrada, usa apenas `segundos_acumulados`.
 */
export function calcularDuracaoSessao(s: SessaoRow): number {
  const acumulado = Math.max(0, Math.floor(Number(s.segundos_acumulados) || 0));
  if (s.status === STATUS_ATIVA && s.inicio) {
    return acumulado + segundosDesdeInicio(s.inicio);
  }
  return acumulado;
}

/**
 * Verifica se uma sessão ativa ultrapassou o limite de 5 horas.
 * Usado para forçar o encerramento automático.
 */
export function sessaoExpirada(s: SessaoRow): boolean {
  if (s.status !== STATUS_ATIVA || !s.inicio) return false;
  return calcularDuracaoSessao(s) >= LIMITE_SESSAO_SEGUNDOS;
}

/**
 * Atualiza os campos de contagem em uma sessão do Supabase.
 * - Acumula o tempo decorrido desde `inicio` até agora em `segundos_acumulados`.
 * - Atualiza `ultima_atividade` para o instante atual.
 * - Se a sessão estiver ativa e ultrapassou o limite, marca como encerrada.
 */
export function construirAtualizacaoSessao(s: SessaoRow, agora: string): {
  update: Record<string, unknown>;
  expirou: boolean;
} {
  const acumulado = Math.max(0, Math.floor(Number(s.segundos_acumulados) || 0));
  let novosAcumulados = calcularDuracaoSessao(s);
  let expirou = false;

  if (s.status === STATUS_ATIVA && novosAcumulados >= LIMITE_SESSAO_SEGUNDOS) {
    expirou = true;
    novosAcumulados = Math.min(novosAcumulados, LIMITE_SESSAO_SEGUNDOS);
  }

  const update: Record<string, unknown> = { ultima_atividade: agora };

  if (expirou) {
    update.segundos_acumulados = novosAcumulados;
    update.status = STATUS_EXPIRADA;
    update.fim = agora;
  }

  return { update, expirou };
}

/**
 * Helper de logging padronizado para contagem de horas.
 * Ex: [FARM] Sessão abc-123 acumulou 3600 segundos
 */
export function logContagemSessao(sessaoId: string, segundos: number, contexto = "contagem") {
  console.log(`[FARM] Sessão ${sessaoId} ${contexto}: ${segundos} segundos acumulados`);
}

