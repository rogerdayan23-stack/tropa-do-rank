import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest, isAdminUser } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  const user = await getUserFromRequest();
  if (!user || !isAdminUser(user)) {
    return NextResponse.json({ error: "Apenas administradores podem fechar a semana" }, { status: 403 });
  }

  const supabase = createServiceClient();

  try {
    const { data_inicio, data_fim, lucro_total, total_horas, detalhes } = await req.json();

    if (!data_inicio || !data_fim) {
      return NextResponse.json({ error: "Período da semana é obrigatório" }, { status: 400 });
    }

    const id = crypto.randomUUID();
    await supabase.from("fechamentos_semanais").insert({
      id,
      data_inicio,
      data_fim,
      lucro_total: Number(lucro_total) || 0,
      total_horas: Number(total_horas) || 0,
      detalhes_json: JSON.stringify(detalhes || []),
      fechado_por: user.id,
    });

    // Deleta os lucros diários da semana fechada (reset da tabela principal)
    await supabase
      .from("lucros_diarios")
      .delete()
      .gte("data", data_inicio)
      .lte("data", data_fim);

    return NextResponse.json({
      success: true,
      message: `Semana de ${data_inicio} a ${data_fim} resetada com sucesso! Lucros diários removidos e histórico arquivado.`,
      id,
    });
  } catch (error: any) {
    console.error("Erro ao fechar semana:", error);
    return NextResponse.json({ error: "Erro interno ao fechar semana" }, { status: 500 });
  }
}
