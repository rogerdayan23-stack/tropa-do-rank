import { createServiceClient } from "@/lib/supabase";
import type { AppUser } from "@/lib/auth";

type AuditTarget = { id?: string | null; username?: string | null };

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

  const { error } = await supabase.from("logs").insert({
    user_id: alvo?.id || ator.id,
    admin_id: ator.id,
    acao,
    detalhe: partes.join(" | "),
    criado_em: new Date().toISOString(),
  });

  if (error) console.error(`[AUDITORIA] Não foi possível registrar ${acao}:`, error);
  return !error;
}

