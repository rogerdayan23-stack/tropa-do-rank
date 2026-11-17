import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest, isAdminRole } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase";
import { registrarAuditoria } from "@/lib/audit";

const USER_COLUMNS = "id, username, apelido, role, is_admin, avatar_url, criado_em, total_segundos";
const ROLES_VALIDAS = ["user", "moderador", "admin"];

async function requireAdmin() {
  const user = await getUserFromRequest();
  if (!user) {
    return { response: NextResponse.json({ error: "Não autenticado" }, { status: 401 }), user: null };
  }
  if (!isAdminRole(user)) {
    return { response: NextResponse.json({ error: "Acesso restrito ao Admin Master" }, { status: 403 }), user: null };
  }
  return { response: null, user };
}

async function contarAdmins(supabase: ReturnType<typeof createServiceClient>) {
  const { count } = await supabase
    .from("users")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin");
  return count || 0;
}

export async function GET() {
  const { response } = await requireAdmin();
  if (response) return response;

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("users")
    .select(USER_COLUMNS)
    .order("criado_em", { ascending: false });

  if (error) {
    console.error("[ADMIN/USERS] Erro ao listar usuários:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ users: data || [] });
}

export async function PATCH(req: NextRequest) {
  const { response, user: admin } = await requireAdmin();
  if (response) return response;

  const supabase = createServiceClient();

  try {
    const body = await req.json();
    const { user_id, acao, role } = body;

    if (!user_id || typeof user_id !== "string") {
      return NextResponse.json({ error: "Usuário inválido" }, { status: 400 });
    }

    if (user_id === admin.id && acao !== "adjust_hours") {
      return NextResponse.json(
        { error: "Você não pode executar esta ação na sua própria conta" },
        { status: 403 }
      );
    }

    const { data: alvo, error: alvoError } = await supabase
      .from("users")
      .select(USER_COLUMNS)
      .eq("id", user_id)
      .maybeSingle();

    if (alvoError) throw alvoError;
    if (!alvo) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });

    if (acao === "adjust_hours") {
      const { operation, hours, minutes } = body;
      if (operation !== "add" && operation !== "subtract") {
        return NextResponse.json({ error: "Tipo de ajuste inválido" }, { status: 400 });
      }
      if (
        !Number.isInteger(hours) || hours < 0 || hours > 100000 ||
        !Number.isInteger(minutes) || minutes < 0 || minutes > 59
      ) {
        return NextResponse.json({ error: "Informe uma duração válida em horas e minutos" }, { status: 400 });
      }

      const segundosAjuste = hours * 3600 + minutes * 60;
      if (!Number.isSafeInteger(segundosAjuste) || segundosAjuste <= 0) {
        return NextResponse.json({ error: "O ajuste precisa ser maior que zero" }, { status: 400 });
      }

      const totalAnterior = Number(alvo.total_segundos || 0);
      const totalNovo = operation === "add"
        ? totalAnterior + segundosAjuste
        : totalAnterior - segundosAjuste;

      if (totalNovo < 0) {
        return NextResponse.json({ error: "O desconto não pode deixar o total de horas abaixo de zero" }, { status: 400 });
      }
      if (!Number.isSafeInteger(totalNovo)) {
        return NextResponse.json({ error: "O total informado é muito alto" }, { status: 400 });
      }

      const { error: updateError } = await supabase
        .from("users")
        .update({ total_segundos: totalNovo })
        .eq("id", user_id);

      if (updateError) throw updateError;

      const sinal = operation === "add" ? "+" : "−";
      const ajusteSemanal = operation === "add" ? segundosAjuste : -segundosAjuste;
      const marcadorSemanal = `${ajusteSemanal > 0 ? "+" : ""}${ajusteSemanal}s`;
      const detalhe = `${alvo.username}: ${sinal}${hours}h${String(minutes).padStart(2, "0")}m (${totalAnterior}s → ${totalNovo}s) [ajuste-semanal:${marcadorSemanal}]`;
      await registrarAuditoria(supabase, admin, "admin_adjust_user_hours", detalhe, { id: user_id, username: alvo.username });

      return NextResponse.json({
        success: true,
        total_segundos: totalNovo,
        message: `Horas de ${alvo.username} ajustadas com sucesso`,
      });
    }

    if (acao === "reset") {
      // Zera horas e saldos: apaga sessões, pagamentos e penalidades do jogador
      const [sessoes, pagamentos, penalidades] = await Promise.all([
        supabase.from("sessoes").delete().eq("user_id", user_id),
        supabase.from("pagamentos").delete().eq("user_id", user_id),
        supabase.from("penalidades").delete().eq("user_id", user_id),
      ]);

      const falhas = [sessoes.error, pagamentos.error, penalidades.error].filter(Boolean);
      if (falhas.length > 0) {
        console.error("[ADMIN/USERS] Erro ao zerar estatísticas:", falhas);
        return NextResponse.json({ error: "Erro ao zerar estatísticas" }, { status: 500 });
      }

      const { error: updateError } = await supabase
        .from("users")
        .update({ total_segundos: 0 })
        .eq("id", user_id);

      if (updateError) throw updateError;

      await registrarAuditoria(
        supabase,
        admin,
        "admin_reset_user",
        `Estatísticas e horas zeradas para ${alvo.username}; total anterior: ${Number(alvo.total_segundos || 0)}s.`,
        { id: user_id, username: alvo.username },
      );

      return NextResponse.json({ success: true, message: "Estatísticas zeradas" });
    }

    if (acao === "toggle_role") {
      const { role } = body;
      if (!ROLES_VALIDAS.includes(role)) {
        return NextResponse.json({ error: "Cargo inválido" }, { status: 400 });
      }

      // Impede rebaixar/remover o último Admin Master
      if (alvo.role === "admin" && role !== "admin") {
        const totalAdmins = await contarAdmins(supabase);
        if (totalAdmins <= 1) {
          return NextResponse.json(
            { error: "Não é possível alterar o último Admin Master" },
            { status: 400 }
          );
        }
      }

      // Impede promover um admin para moderador se já for admin
      if (alvo.role === "admin" && role === "admin") {
        return NextResponse.json({ error: "Cargo inalterado" }, { status: 400 });
      }

      const { error: updateError } = await supabase
        .from("users")
        .update({ role, is_admin: role === "admin" })
        .eq("id", user_id);

      if (updateError) throw updateError;

      await registrarAuditoria(supabase, admin, "admin_toggle_role", `Cargo alterado de ${alvo.role} para ${role}.`, { id: user_id, username: alvo.username });

      return NextResponse.json({ success: true, role, message: "Cargo atualizado" });
    }

    return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
  } catch (error) {
    console.error("[ADMIN/USERS] Erro ao atualizar usuário:", error);
    return NextResponse.json({ error: "Erro interno ao atualizar usuário" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const { response, user: admin } = await requireAdmin();
  if (response) return response;

  const supabase = createServiceClient();

  try {
    const body = await req.json();
    const { user_id } = body;

    if (!user_id || typeof user_id !== "string") {
      return NextResponse.json({ error: "Usuário inválido" }, { status: 400 });
    }

    if (user_id === admin.id) {
      return NextResponse.json({ error: "Você não pode remover a si mesmo" }, { status: 403 });
    }

    const { data: alvo, error: alvoError } = await supabase
      .from("users")
      .select("id, username, role")
      .eq("id", user_id)
      .maybeSingle();

    if (alvoError) throw alvoError;
    if (!alvo) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });

    if (alvo.role === "admin") {
      const totalAdmins = await contarAdmins(supabase);
      if (totalAdmins <= 1) {
        return NextResponse.json(
          { error: "Não é possível remover o último Admin Master" },
          { status: 400 }
        );
      }
    }

    // Remove os registros ligados ao usuário antes de apagar a conta
    const limpezas = await Promise.all([
      supabase.from("sessoes").delete().eq("user_id", user_id),
      supabase.from("pagamentos").delete().eq("user_id", user_id),
      supabase.from("penalidades").delete().eq("user_id", user_id),
    ]);

    const falhas = limpezas.map((r) => r.error).filter(Boolean);
    if (falhas.length > 0) {
      console.error("[ADMIN/USERS] Erro ao limpar dados do usuário:", falhas);
      return NextResponse.json({ error: "Erro ao limpar dados do usuário" }, { status: 500 });
    }

    const { error: deleteError } = await supabase.from("users").delete().eq("id", user_id);
    if (deleteError) throw deleteError;

    // Não apagar os logs do usuário: a auditoria precisa sobreviver à remoção.
    await registrarAuditoria(supabase, admin, "admin_delete_user", `Usuário ${alvo.username} removido permanentemente (id ${user_id}, cargo ${alvo.role}).`);

    return NextResponse.json({ success: true, message: "Usuário removido" });
  } catch (error) {
    console.error("[ADMIN/USERS] Erro ao remover usuário:", error);
    return NextResponse.json({ error: "Erro interno ao remover usuário" }, { status: 500 });
  }
}

