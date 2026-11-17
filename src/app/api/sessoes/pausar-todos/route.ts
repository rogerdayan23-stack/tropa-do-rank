import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { getUserFromRequest, isAdminRole } from "@/lib/auth";
import { STATUS_ATIVA, STATUS_PAUSADA, calcularDuracaoSessao, logContagemSessao } from "@/lib/sessao";

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
        logContagemSessao(s.id, segundosAcumulados, "pausar-todos");
      }
    }

    await service.from("logs").insert({
      user_id: user.id,
      acao: "pausar_todos",
      detalhe: `${count} sessões pausadas pelo admin`,
      admin_id: user.id,
      criado_em: agora,
    });

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
        logContagemSessao(s.id, s.segundos_acumulados || 0, "despausar-todos");
      }
    }

    await service.from("logs").insert({
      user_id: user.id,
      acao: "despausar_todos",
      detalhe: `${count} sessões retomadas pelo admin`,
      admin_id: user.id,
      criado_em: agora,
    });

    return NextResponse.json({ ok: true, count });
  }

  return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
}
