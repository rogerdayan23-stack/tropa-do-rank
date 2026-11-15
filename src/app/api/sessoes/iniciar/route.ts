import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { getUserFromRequest } from "@/lib/auth";

export async function POST() {
  const user = await getUserFromRequest();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const service = createServiceClient();
  const agora = new Date().toISOString();

  // 1. Garante que o usuário existe na tabela users do Supabase (para foreign key)
  try {
    await service.from("users").upsert(
      {
        id: user.id,
        apelido: user.username,
        is_admin: user.is_admin,
      },
      { onConflict: "id" }
    );
  } catch (syncError) {
    console.error("Erro ao sincronizar usuário no Supabase:", syncError);
  }

  // 2. Verifica se já existe sessão ativa ou pausada
  const { data: existente, error: listError } = await service
    .from("sessoes")
    .select("*")
    .eq("user_id", user.id)
    .in("status", ["ativa", "pausada"])
    .order("inicio", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (listError) {
    return NextResponse.json({ error: listError.message }, { status: 500 });
  }

  let sessao: any;

  if (existente && existente.status === "pausada") {
    const { data: atualizada, error: updError } = await service
      .from("sessoes")
      .update({ inicio: agora, status: "ativa", ultima_atividade: agora })
      .eq("id", existente.id)
      .select()
      .single();
    if (updError) return NextResponse.json({ error: updError.message }, { status: 500 });
    sessao = atualizada;
  } else if (existente && existente.status === "ativa") {
    return NextResponse.json({ error: "Já existe uma sessão ativa" }, { status: 400 });
  } else {
    const { data: nova, error: insError } = await service
      .from("sessoes")
      .insert({
        user_id: user.id,
        inicio: agora,
        ultima_atividade: agora,
        fim: null,
        segundos_acumulados: 0,
        status: "ativa",
        validada_por: null,
      })
      .select()
      .single();
    if (insError) return NextResponse.json({ error: insError.message }, { status: 500 });
    sessao = nova;
  }

  // Log de auditoria
  await service.from("logs").insert({
    user_id: user.id,
    acao: "iniciar_sessao",
    detalhe: `Sessão iniciada em ${agora}`,
    admin_id: null,
    criado_em: agora,
  });

  return NextResponse.json({
    sessao: {
      id: sessao.id,
      inicio: sessao.inicio,
      status: sessao.status,
      segundos_acumulados: sessao.segundos_acumulados,
    },
  });
}
