import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { getUserFromRequest, isAdminRole } from "@/lib/auth";
import { STATUS_ATIVA, STATUS_PAUSADA, STATUS_ENCERRADA, construirAtualizacaoSessao, logContagemSessao, LIMITE_SESSAO_SEGUNDOS } from "@/lib/sessao";
import { registrarAuditoria } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const user = await getUserFromRequest();
  if (!user || !isAdminRole(user)) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const service = createServiceClient();
  const agora = new Date().toISOString();

  // 1) Atualiza todas as sessões ativas acumulando o tempo e verificando expiração
  const { data: ativas, error: listError } = await service
    .from("sessoes")
    .select("*")
    .eq("status", STATUS_ATIVA);

  if (listError) {
    return NextResponse.json({ error: listError.message }, { status: 500 });
  }

  let atualizadas = 0;
  let expiradas = 0;

  for (const s of ativas || []) {
    const { update, expirou } = construirAtualizacaoSessao(s, agora);
    const { error: updError } = await service
      .from("sessoes")
      .update(update)
      .eq("id", s.id);

    if (!updError) {
      atualizadas++;
      if (expirou) {
        expiradas++;
        logContagemSessao(s.id, update.segundos_acumulados as number, "expirou-5h");
      } else {
        logContagemSessao(s.id, update.segundos_acumulados as number, "contagem-automatizada");
      }
    }
  }

  // 2) Atualiza o total_segundos de cada usuário com sessões ativas
  const { data: totais, error: totError } = await service
    .from("sessoes")
    .select("user_id, segundos_acumulados")
    .eq("status", STATUS_ATIVA);

  if (!totError && totais) {
    const somas: Record<string, number> = {};
    for (const t of totais) {
      somas[t.user_id] = (somas[t.user_id] || 0) + (t.segundos_acumulados || 0);
    }
    for (const [userId, total] of Object.entries(somas)) {
      await service.from("users").update({ total_segundos: total }).eq("id", userId);
    }
  }

  await registrarAuditoria(service, user, "admin:cron_contagem_horas", `${atualizadas} sessões atualizadas, ${expiradas} expiradas (limite ${LIMITE_SESSAO_SEGUNDOS}s).`);

  return NextResponse.json({ ok: true, atualizadas, expiradas });
}

