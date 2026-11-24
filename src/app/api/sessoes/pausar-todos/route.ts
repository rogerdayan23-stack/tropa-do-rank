import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { getUserFromRequest, isAdminRole } from "@/lib/auth";
import { STATUS_ATIVA, STATUS_PAUSADA, calcularDuracaoSessao, logContagemSessao } from "@/lib/sessao";
import { registrarAuditoria, registrarLog } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const user = await getUserFromRequest();
  if (!user || !isAdminRole(user)) {
    return NextResponse.json({ error: "Acesso restrito ao Admin Master" }, { status: 403 });
  }

  const { acao } = await req.json();
  const service = createServiceClient();
  const agora = new Date().toISOString();

  if (acao === "pausar_todos") {
    const { data: ativas, error: listError } = await service
      .from("sessoes")
      .select("*")
      .eq("status", STATUS_ATIVA);

    if (listError) {
      return NextResponse.json({ error: listError.message }, { status: 500 });
    }

    let count = 0;
    for (const s of ativas || []) {
      const segundosAcumulados = calcularDuracaoSessao(s);
      const { error: updError } = await service
        .from("sessoes")
        .update({ status: STATUS_PAUSADA, segundos_acumulados: segundosAcumulados, ultima_atividade: agora })
        .eq("id", s.id);
      if (!updError) {
        count++;
        await registrarLog(service, {
          user_id: s.user_id,
          sessao_id: s.id,
          acao: "pausar_sessao",
          detalhe: "Contagem pausada pelo Admin Master.",
          admin_id: user.id,
          criado_em: agora,
        });
        logContagemSessao(s.id, segundosAcumulados, "pausar-todos");
      }
    }

    await registrarAuditoria(service, user, "admin:pausar_todos", `${count} sessões pausadas pelo Admin Master.`);

    return NextResponse.json({ ok: true, count });
  }

  if (acao === "despausar_todos") {
    const { data: pausadas, error: listError } = await service
      .from("sessoes")
      .select("*")
      .eq("status", STATUS_PAUSADA);

    if (listError) {
      return NextResponse.json({ error: listError.message }, { status: 500 });
    }

    let count = 0;
    for (const s of pausadas || []) {
      const { error: updError } = await service
        .from("sessoes")
        .update({ status: STATUS_ATIVA, inicio: agora, ultima_atividade: agora })
        .eq("id", s.id);
      if (!updError) {
        count++;
        await registrarLog(service, {
          user_id: s.user_id,
          sessao_id: s.id,
          acao: "retomar_sessao",
          detalhe: "Contagem retomada pelo Admin Master.",
          admin_id: user.id,
          criado_em: agora,
        });
        logContagemSessao(s.id, s.segundos_acumulados || 0, "despausar-todos");
      }
    }

    await registrarAuditoria(service, user, "admin:despausar_todos", `${count} sessões retomadas pelo Admin Master.`);

    return NextResponse.json({ ok: true, count });
  }

  return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
}
