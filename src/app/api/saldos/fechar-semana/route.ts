import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest, isManager } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const user = await getUserFromRequest();
  if (!user || !isManager(user)) {
    return NextResponse.json({ error: "Apenas administradores podem fechar a semana" }, { status: 403 });
  }

  const supabase = createServiceClient();

  try {
    const { data_inicio, data_fim, lucro_total, total_horas, detalhes, request_id } = await req.json();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(data_inicio || "") || !/^\d{4}-\d{2}-\d{2}$/.test(data_fim || "") || data_inicio > data_fim) {
      return NextResponse.json({ error: "Período da semana é obrigatório" }, { status: 400 });
    }
    if (typeof request_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(request_id)) {
      return NextResponse.json({ error: "Identificador da solicitação inválido" }, { status: 400 });
    }
    if (!Array.isArray(detalhes)) {
      return NextResponse.json({ error: "A conferência dos jogadores está inválida" }, { status: 400 });
    }

    const lucro = Number(lucro_total);
    const horas = Number(total_horas);
    if (!Number.isFinite(lucro) || lucro < 0 || !Number.isFinite(horas) || horas < 0) {
      return NextResponse.json({ error: "Totais semanais inválidos" }, { status: 400 });
    }

    const { data: fechamento, error: fechamentoError } = await supabase.rpc("fechar_semana_atomico", {
      p_data_inicio: data_inicio,
      p_data_fim: data_fim,
      p_lucro_total: lucro,
      p_total_horas: horas,
      p_detalhes: detalhes,
      p_fechado_por: user.id,
      p_request_id: request_id,
    });
    if (fechamentoError) {
      if (fechamentoError.code === "42883" || fechamentoError.code === "PGRST202") {
        return NextResponse.json({ error: "O banco ainda não recebeu a migração semanal. Execute o SQL em migrations/2026-11-23-operacao-semanal.sql." }, { status: 503 });
      }
      throw fechamentoError;
    }

    return NextResponse.json({
      success: true,
      message: `Semana de ${data_inicio} a ${data_fim} fechada com sucesso.`,
      id: fechamento?.id,
      repetido: fechamento?.repetido === true,
    });
  } catch (error: unknown) {
    console.error("Erro ao fechar semana:", error);
    return NextResponse.json({ error: "Erro interno ao fechar semana" }, { status: 500 });
  }
}
