import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";

export async function GET() {
  const user = await getUserFromRequest();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  return NextResponse.json({
    user: {
      id: user.id,
      username: user.username,
      apelido: user.username,
      role: user.role,
      is_admin: user.is_admin,
      avatar_url: user.avatar_url,
      created_at: user.created_at,
      total_segundos: user.total_segundos || 0,
    },
  });
}
