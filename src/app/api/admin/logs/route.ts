import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { getUserFromRequest, isManager } from "@/lib/auth";

const PAGE_SIZE = 50;

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest();
  if (!user || !isManager(user)) {
    return NextResponse.json({ error: "Apenas administradores e co-admins podem consultar a auditoria" }, { status: 403 });
  }

  const params = new URL(req.url).searchParams;
  const pagina = Math.max(1, Math.min(10000, Number.parseInt(params.get("pagina") || "1", 10) || 1));
  const inicio = (pagina - 1) * PAGE_SIZE;
  const supabase = createServiceClient();

  const { data, error, count } = await supabase
    .from("logs")
    .select("id, user_id, admin_id, acao, detalhe, criado_em", { count: "exact" })
    .or("admin_id.not.is.null,acao.like.admin:%,acao.like.admin\\_%,acao.eq.pausar_todos,acao.eq.despausar_todos")
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

