import type { SupabaseClient } from "@supabase/supabase-js";
import {
  calcularDuracaoSessao,
  LIMITE_SESSAO_SEGUNDOS,
  logContagemSessao,
  sessaoExpirada,
  STATUS_ATIVA,
  STATUS_EXPIRADA,
  type SessaoRow,
} from "@/lib/sessao";

/** Fecha sessões vencidas e soma o tempo uma única vez, mesmo com consultas concorrentes. */
export async function expirarSessoesVencidas(
  supabase: SupabaseClient,
  sessoes: SessaoRow[],
  agora = new Date().toISOString(),
): Promise<number> {
  let expiradas = 0;

  for (const sessao of sessoes) {
    if (!sessaoExpirada(sessao)) continue;

    const segundos = Math.min(calcularDuracaoSessao(sessao), LIMITE_SESSAO_SEGUNDOS);
    const { data: atualizada, error: erroSessao } = await supabase
      .from("sessoes")
      .update({
        status: STATUS_EXPIRADA,
        fim: agora,
        segundos_acumulados: segundos,
        ultima_atividade: agora,
      })
      .eq("id", sessao.id)
      .eq("status", STATUS_ATIVA)
      .select("id")
      .maybeSingle();

    if (erroSessao) throw new Error(erroSessao.message);
    // Se outra requisição já encerrou a sessão, ela também contabilizou o tempo.
    if (!atualizada) continue;

    const { data: usuario, error: erroUsuario } = await supabase
      .from("users")
      .select("total_segundos")
      .eq("id", sessao.user_id)
      .single();

    if (erroUsuario) throw new Error(erroUsuario.message);

    const { error: erroTotal } = await supabase
      .from("users")
      .update({ total_segundos: Number(usuario?.total_segundos || 0) + segundos })
      .eq("id", sessao.user_id);

    if (erroTotal) throw new Error(erroTotal.message);

    expiradas++;
    logContagemSessao(sessao.id, segundos, "expirou-5h");
  }

  return expiradas;
}
