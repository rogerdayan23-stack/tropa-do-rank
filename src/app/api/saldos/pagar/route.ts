import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest, isAdminUser } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  const user = await getUserFromRequest();
  if (!user || !isAdminUser(user)) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const supabase = createServiceClient();

  try {
    const { data, user_id, horas_farmadas, valor_calculado } = await req.json();

    if (!data || !user_id) {
      return NextResponse.json({ error: "Data e usuário são obrigatórios" }, { status: 400 });
    }

    const agora = new Date().toISOString();

    const { data: existing } = await supabase
      .from("pagamentos")
      .select("id")
      .eq("data", data)
      .eq("user_id", user_id)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("pagamentos")
        .update({
          pago: true,
          pago_em: agora,
          valor_calculado: valor_calculado || 0,
          horas_farmadas: horas_farmadas || 0,
        })
        .eq("id", existing.id);
    } else {
      await supabase.from("pagamentos").insert({
        id: crypto.randomUUID(),
        data,
        user_id,
        horas_farmadas: horas_farmadas || 0,
        valor_calculado: valor_calculado || 0,
        pago: true,
        pago_em: agora,
      });
    }

    return NextResponse.json({
      success: true,
      message: "Pagamento confirmado com sucesso!",
    });
  } catch (error: any) {
    console.error("Erro ao confirmar pagamento:", error);
    return NextResponse.json({ error: "Erro interno ao confirmar pagamento" }, { status: 500 });
  }
}
