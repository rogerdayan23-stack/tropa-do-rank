import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { getUserFromRequest, isAdminUser } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/audit";

export async function GET() {
  const user = await getUserFromRequest();
  if (!user || !isAdminUser(user)) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });

  const service = createServiceClient();
  const { data: users, error: usersError } = await service.from("users").select("id, apelido, total_segundos, criado_em").order("apelido");
  const { data: sessoes, error: sessoesError } = await service.from("sessoes").select("*");
  if (usersError || sessoesError) return NextResponse.json({ error: "Não foi possível preparar a exportação" }, { status: 500 });

  const linhas = ["apelido,total_segundos,sessoes"];
  for (const u of (users || [])) {
    const userSessoes = (sessoes || []).filter((s: any) => s.user_id === u.id).length;
    linhas.push(`${u.apelido},${u.total_segundos || 0},${userSessoes}`);
  }

  await registrarAuditoria(service, user, "admin:exportar_dados", `Exportação CSV de ${users?.length || 0} usuários e ${(sessoes || []).length} sessões.`);

  const csv = linhas.join("\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; rank-farm-export.csv",
    },
  });
}

