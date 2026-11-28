import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { getUserFromRequest, isManager, isPrimaryAdmin } from "@/lib/auth";

const PAGE_SIZE = 50;
const FILTRO_AUDITORIA = "admin_id.not.is.null,acao.like.admin:%,acao.like.admin\\_%,acao.eq.pausar_todos,acao.eq.despausar_todos";

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest();
  if (!user) {
    return NextResponse.json({ error: "Sessão inválida ou expirada. Entre novamente." }, { status: 401 });
  }
  if (!isManager(user)) {
    return NextResponse.json({ error: "Apenas administradores e co-admins podem consultar a auditoria" }, { status: 403 });
  }

  const params = new URL(req.url).searchParams;
  const pagina = Math.max(1, Math.min(10000, Number.parseInt(params.get("pagina") || "1", 10) || 1));
  const inicio = (pagina - 1) * PAGE_SIZE;
  const supabase = createServiceClient();

  const { data, error, count } = await supabase
    .from("logs")
    .select("id, user_id, admin_id, acao, detalhe, criado_em", { count: "exact" })
    .or(FILTRO_AUDITORIA)
    .not("acao", "in", '("admin:excluir_registros_auditoria","admin:falha_excluir_registros_auditoria")')
    .not("acao", "eq", "internal_hours_credit")
    .order("criado_em", { ascending: false })
    .range(inicio, inicio + PAGE_SIZE - 1);

  if (error) {
    console.error("[AUDITORIA] Erro ao consultar registros:", error);
    return NextResponse.json({ error: "Não foi possível carregar os registros" }, { status: 500 });
  }

  const ids = Array.from(new Set((data || []).flatMap((registro) => [registro.admin_id, registro.user_id]).filter(Boolean))) as string[];
  const nomes = new Map<string, string>();
  if (ids.length) {
    const { data: usuarios, error: usuariosError } = await supabase
      .from("users")
      .select("id, username, apelido")
      .in("id", ids);

    if (usuariosError) {
      console.error("[AUDITORIA] Erro ao resolver nomes:", usuariosError);
    } else {
      for (const usuario of usuarios || []) {
        nomes.set(usuario.id, usuario.apelido || usuario.username);
      }
    }
  }

  const registros = (data || []).map((registro) => ({
    ...registro,
    detalhe: registro.acao === "admin:editar_regras"
      ? "As regras do site foram atualizadas."
      : registro.detalhe,
    ator_nome: registro.admin_id ? nomes.get(registro.admin_id) || null : null,
    alvo_nome: registro.user_id && registro.user_id !== registro.admin_id ? nomes.get(registro.user_id) || null : null,
  }));

  return NextResponse.json({
    registros,
    pagina,
    por_pagina: PAGE_SIZE,
    total: count || 0,
    tem_mais: inicio + registros.length < (count || 0),
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(req: NextRequest) {
  const user = await getUserFromRequest();
  if (!user) {
    return NextResponse.json({ error: "Sessão inválida ou expirada. Entre novamente." }, { status: 401 });
  }
  if (!isPrimaryAdmin(user)) {
    return NextResponse.json({ error: "Somente o Admin Master pode excluir registros." }, { status: 403 });
  }

  let ids: unknown;
  try {
    ({ ids } = await req.json());
  } catch {
    return NextResponse.json({ error: "Envie uma lista válida de registros." }, { status: 400 });
  }

  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 500 || ids.some((id) => typeof id !== "string" || id.length > 80)) {
    return NextResponse.json({ error: "Selecione de 1 a 500 registros válidos." }, { status: 400 });
  }

  const supabase = createServiceClient();
  const idsUnicos = Array.from(new Set(ids as string[]));
  const { data: existentes, error: consultaError } = await supabase
    .from("logs")
    .select("id")
    .in("id", idsUnicos)
    .or(FILTRO_AUDITORIA);

  if (consultaError) {
    console.error("[AUDITORIA] Falha ao preparar exclusão:", consultaError);
    return NextResponse.json({ error: "Não foi possível preparar a exclusão." }, { status: 500 });
  }
  if (!existentes?.length) {
    return NextResponse.json({ error: "Nenhum dos registros selecionados foi encontrado." }, { status: 404 });
  }

  const agora = new Date().toISOString();
  const quantidade = existentes.length;
  const { error: auditError } = await supabase.from("logs").insert({
    user_id: user.id,
    admin_id: user.id,
    acao: "admin:excluir_registros_auditoria",
    detalhe: `Responsável: ${user.username} | ${quantidade} registro(s) do histórico administrativo excluído(s).`,
    criado_em: agora,
  });

  if (auditError) {
    console.error("[AUDITORIA] Falha ao registrar exclusão:", auditError);
    return NextResponse.json({ error: "A exclusão foi cancelada porque não foi possível registrar a auditoria." }, { status: 500 });
  }

  const idsExistentes = existentes.map((registro) => registro.id);
  const { error: deleteError } = await supabase.from("logs").delete().in("id", idsExistentes);
  if (deleteError) {
    console.error("[AUDITORIA] Falha ao excluir registros:", deleteError);
    await supabase.from("logs").insert({
      user_id: user.id,
      admin_id: user.id,
      acao: "admin:falha_excluir_registros_auditoria",
      detalhe: `Responsável: ${user.username} | Falha ao excluir ${quantidade} registro(s) do histórico administrativo.`,
      criado_em: new Date().toISOString(),
    });
    return NextResponse.json({ error: "Não foi possível excluir os registros selecionados." }, { status: 500 });
  }

  return NextResponse.json({ success: true, removidos: quantidade });
}
