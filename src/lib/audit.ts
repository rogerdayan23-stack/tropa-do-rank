import { createServiceClient } from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppUser } from "@/lib/auth";

type AuditTarget = { id?: string | null; username?: string | null; sessao_id?: string | null };

type LogEntry = {
  user_id: string | null;
  admin_id: string | null;
  sessao_id?: string | null;
  acao: string;
  detalhe: string;
  criado_em: string;
};

export async function registrarLog(
  supabase: SupabaseClient,
  registro: LogEntry,
): Promise<boolean> {
  const { error } = await supabase.from("logs").insert(registro);
  if (!error) return true;

  const colunaAusente = /sessao_id/i.test(error.message || "")
    && (error.code === "42703" || error.code === "PGRST204");
  if (colunaAusente && Object.prototype.hasOwnProperty.call(registro, "sessao_id")) {
    const registroLegado = { ...registro };
    delete registroLegado.sessao_id;
    const { error: erroLegado } = await supabase.from("logs").insert(registroLegado);
    if (!erroLegado) return true;
    console.error(`[AUDITORIA] Não foi possível registrar ${registro.acao}:`, erroLegado);
    return false;
  }

  console.error(`[AUDITORIA] Não foi possível registrar ${registro.acao}:`, error);
  return false;
}

export async function registrarAuditoria(
  supabase: ReturnType<typeof createServiceClient>,
  ator: Pick<AppUser, "id" | "username">,
  acao: string,
  detalhe: string,
  alvo?: AuditTarget,
) {
  const partes = [`Responsável: ${ator.username || ator.id}`];
  if (alvo?.username) partes.push(`Alvo: ${alvo.username}${alvo.id ? ` (${alvo.id})` : ""}`);
  if (detalhe) partes.push(detalhe);

  return registrarLog(supabase, {
    user_id: alvo?.id || ator.id,
    admin_id: ator.id,
    sessao_id: alvo?.sessao_id || null,
    acao,
    detalhe: partes.join(" | "),
    criado_em: new Date().toISOString(),
  });
}
