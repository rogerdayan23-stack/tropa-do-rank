import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest, isAdminUser } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase";
import crypto from "crypto";

export async function GET() {
  const user = await getUserFromRequest();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const supabase = createServiceClient();

  try {
    // penalidades.user_id/admin_id são text (sem FK), então os nomes são resolvidos via tabela users
    const [penResult, usersResult] = await Promise.all([
      supabase
        .from("penalidades")
        .select("id, user_id, admin_id, motivo, valor, created_at")
        .order("created_at", { ascending: false }),
      supabase.from("users").select("id, username, avatar_url"),
    ]);

    if (penResult.error) throw penResult.error;
    if (usersResult.error) throw usersResult.error;

    const usuarios = new Map<string, { username: string; avatar_url: string | null }>();
    for (const u of usersResult.data || []) {
      usuarios.set(u.id, { username: u.username, avatar_url: u.avatar_url });
    }

    const penalidades = (penResult.data || []).map((p) => ({
      id: p.id,
      user_id: p.user_id,
      jogador_nome: usuarios.get(p.user_id)?.username || "Desconhecido",
      jogador_avatar: usuarios.get(p.user_id)?.avatar_url || null,
      admin_nome: usuarios.get(p.admin_id)?.username || "Sistema",
      motivo: p.motivo,
      valor: p.valor,
      created_at: p.created_at,
    }));

    return NextResponse.json({ penalidades });
  } catch (error: any) {
    console.error("Erro ao listar penalidades:", error);
    return NextResponse.json({ error: "Erro interno ao buscar penalidades" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getUserFromRequest();
  if (!user || !isAdminUser(user)) {
    return NextResponse.json({ error: "Apenas administradores podem aplicar penalidades" }, { status: 403 });
  }

  const supabase = createServiceClient();

  try {
    const { user_id, motivo, valor } = await req.json();

    if (!user_id || !motivo || valor === undefined || valor === null) {
      return NextResponse.json({ error: "Jogador, motivo e valor são obrigatórios" }, { status: 400 });
    }

    const valorNum = parseFloat(valor);
    if (isNaN(valorNum) || valorNum <= 0) {
      return NextResponse.json({ error: "O valor da penalidade deve ser maior que zero" }, { status: 400 });
    }

    const { data: targetUser, error: userError } = await supabase
      .from("users")
      .select("id, username")
      .eq("id", user_id)
      .single();

    if (userError || !targetUser) {
      return NextResponse.json({ error: "Jogador não encontrado" }, { status: 404 });
    }

    const id = crypto.randomUUID();
    const { error: insertError } = await supabase.from("penalidades").insert({
      id,
      user_id,
      admin_id: user.id,
      motivo: motivo.trim(),
      valor: valorNum,
    });

    if (insertError) throw insertError;

    return NextResponse.json({
      success: true,
      message: "Penalidade aplicada com sucesso!",
      penalidade: {
        id,
        user_id,
        admin_id: user.id,
        motivo: motivo.trim(),
        valor: valorNum,
      },
    });
  } catch (error: any) {
    console.error("Erro ao aplicar penalidade:", error);
    return NextResponse.json({ error: "Erro interno ao registrar penalidade" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const user = await getUserFromRequest();
  if (!user || !isAdminUser(user)) {
    return NextResponse.json({ error: "Apenas administradores podem remover penalidades" }, { status: 403 });
  }

  const supabase = createServiceClient();

  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });

    const { data: existente } = await supabase
      .from("penalidades")
      .select("id")
      .eq("id", id)
      .single();

    if (!existente) return NextResponse.json({ error: "Penalidade não encontrada" }, { status: 404 });

    await supabase.from("penalidades").delete().eq("id", id);

    return NextResponse.json({ success: true, message: "Penalidade removida com sucesso" });
  } catch (error: any) {
    console.error("Erro ao remover penalidade:", error);
    return NextResponse.json({ error: "Erro interno ao remover penalidade" }, { status: 500 });
  }
}
