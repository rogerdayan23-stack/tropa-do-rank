import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { getUserFromRequest } from "@/lib/auth";
import { STATUS_ATIVA, type SessaoRow } from "@/lib/sessao";
import { expirarSessoesVencidas } from "@/lib/sessao-server";
import { registrarLog } from "@/lib/audit";

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
  const consultarExistente = () => service
    .from("sessoes")
    .select("*")
    .eq("user_id", user.id)
    .in("status", ["ativa", "pausada"])
    .order("inicio", { ascending: false })
    .limit(1)
    .maybeSingle();

  const consultaInicial = await consultarExistente();
  let existente = consultaInicial.data;

  if (consultaInicial.error) {
    return NextResponse.json({ error: consultaInicial.error.message }, { status: 500 });
  }

  if (existente?.status === STATUS_ATIVA) {
    try {
      const expiradas = await expirarSessoesVencidas(service, [existente as SessaoRow], agora);
      if (expiradas > 0) {
        const atualizada = await consultarExistente();
        if (atualizada.error) return NextResponse.json({ error: atualizada.error.message }, { status: 500 });
        existente = atualizada.data;
      }
    } catch (expireError) {
      const message = expireError instanceof Error ? expireError.message : "Falha ao encerrar sessão vencida";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  let sessao: { id: string; inicio: string | null; status: string; segundos_acumulados: number | null };
  let acaoLog = "iniciar_sessao";

  if (existente && existente.status === "pausada") {
    const { data: atualizada, error: updError } = await service
      .from("sessoes")
      .update({ inicio: agora, status: "ativa", ultima_atividade: agora })
      .eq("id", existente.id)
      .select()
      .single();
    if (updError) return NextResponse.json({ error: updError.message }, { status: 500 });
    sessao = atualizada;
    acaoLog = "retomar_sessao";
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
  await registrarLog(service, {
    user_id: user.id,
    sessao_id: sessao.id,
    acao: acaoLog,
    detalhe: acaoLog === "iniciar_sessao" ? `Contagem iniciada em ${agora}.` : `Contagem retomada em ${agora}.`,
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
