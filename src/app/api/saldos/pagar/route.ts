import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest, isManager } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase";
import crypto from "crypto";
import { registrarAuditoria } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const user = await getUserFromRequest();
  if (!user || !isManager(user)) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const supabase = createServiceClient();

  try {
    const { data, user_id, horas_farmadas, valor_calculado } = await req.json();

    if (!data || !user_id) {
      return NextResponse.json({ error: "Data e usuário são obrigatórios" }, { status: 400 });
    }

    const agora = new Date().toISOString();

    const { data: alvo, error: alvoError } = await supabase.from("users").select("username").eq("id", user_id).maybeSingle();
    if (alvoError) throw alvoError;
    if (!alvo) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });

    const valor = Number(valor_calculado || 0);
    const horas = Number(horas_farmadas || 0);
    if (!Number.isFinite(valor) || valor < 0 || !Number.isFinite(horas) || horas < 0) {
      return NextResponse.json({ error: "Horas ou valor do pagamento inválidos" }, { status: 400 });
    }

    const { data: existing, error: existingError } = await supabase
      .from("pagamentos")
      .select("id")
      .eq("data", data)
      .eq("user_id", user_id)
      .maybeSingle();

    if (existingError) throw existingError;

    if (existing) {
      const { error: updateError } = await supabase
        .from("pagamentos")
        .update({
          pago: true,
          pago_em: agora,
          valor_calculado: valor,
          horas_farmadas: horas,
        })
        .eq("id", existing.id);
      if (updateError) throw updateError;
    } else {
      const { error: insertError } = await supabase.from("pagamentos").insert({
        id: crypto.randomUUID(),
        data,
        user_id,
        horas_farmadas: horas,
        valor_calculado: valor,
        pago: true,
        pago_em: agora,
      });
      if (insertError) throw insertError;
    }

    await registrarAuditoria(supabase, user, "admin:confirmar_pagamento", `Pagamento do dia ${data} confirmado: ${horas}h, R$ ${valor.toFixed(2)}.`, { id: user_id, username: alvo.username });

    return NextResponse.json({
      success: true,
      message: "Pagamento confirmado com sucesso!",
    });
  } catch (error: any) {
    console.error("Erro ao confirmar pagamento:", error);
    return NextResponse.json({ error: "Erro interno ao confirmar pagamento" }, { status: 500 });
  }
}

