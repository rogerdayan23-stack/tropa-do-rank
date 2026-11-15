export interface DatabaseUser {
  id: string;
  apelido: string;
  discord_id: string | null;
  total_segundos: number;
  is_admin: boolean;
  criado_em: string;
  session_token: string | null;
}

export interface DatabaseSession {
  id: string;
  user_id: string;
  inicio: string | null;
  ultima_atividade: string | null;
  fim: string | null;
  segundos_acumulados: number;
  status: "ativa" | "pausada" | "encerrada" | "expirada";
  validada_por: string | null;
}

export interface DatabaseRule {
  id: string;
  texto: string;
  atualizado_em: string;
}

export interface DatabaseLog {
  id: string;
  user_id: string | null;
  acao: string;
  detalhe: string | null;
  admin_id: string | null;
  criado_em: string;
}

export interface SessaoComUsuario extends DatabaseSession {
  apelido: string;
  duracao_segundos: number;
}

export interface RankingEntry {
  apelido: string;
  total_segundos: number;
  posicao: number;
  medalha: string;
}
