import { cookies, headers } from "next/headers";
import jwt from "jsonwebtoken";
import { createServiceClient } from "@/lib/supabase";

const JWT_SECRET = process.env.JWT_SECRET;

// Colunas reais da tabela users (o schema usa "criado_em", não "created_at")
const USER_COLUMNS = "id, username, role, is_admin, avatar_url, criado_em, total_segundos";

export interface AppUser {
  id: string;
  username: string;
  role: string;
  is_admin: boolean;
  avatar_url: string | null;
  created_at: string;
  total_segundos?: number;
  apelido?: string;
}

interface UserRow {
  id: string;
  username: string;
  role: string | null;
  is_admin: boolean | null;
  avatar_url: string | null;
  criado_em: string;
  total_segundos: number | null;
}

function mapearUsuario(row: UserRow): AppUser {
  return {
    id: row.id,
    username: row.username,
    role: row.role || "user",
    is_admin: row.is_admin ?? row.role === "admin",
    avatar_url: row.avatar_url ?? null,
    created_at: row.criado_em,
    total_segundos: row.total_segundos || 0,
    apelido: row.username,
  };
}

export async function getUserFromRequest(): Promise<AppUser | null> {
  try {
    const cookieStore = cookies();
    let token = cookieStore.get("tropa_session")?.value;

    if (!token) {
      const authHeader = headers().get("authorization");
      if (authHeader && authHeader.startsWith("Bearer ")) {
        token = authHeader.substring(7);
      }
    }

    if (!token) return null;
    if (!JWT_SECRET || JWT_SECRET.length < 32) return null;

    const supabase = createServiceClient();

    const decoded = jwt.verify(token, JWT_SECRET) as { id?: string };
    if (!decoded?.id) return null;
    const { data } = await supabase
      .from("users")
      .select(USER_COLUMNS)
      .eq("id", decoded.id)
      .maybeSingle();
    return data ? mapearUsuario(data) : null;
  } catch {
    return null;
  }
}

// Admin Master: apenas role === "admin"
export function isAdminRole(user: AppUser | null | undefined): boolean {
  return !!user && user.role === "admin";
}

// Admin (compatível com o antigo is_admin)
export function isAdminUser(user: AppUser | null | undefined): boolean {
  return isAdminRole(user) || user?.is_admin === true;
}

// Co-Admin: admin + moderador (podem gerenciar saldos e penalidades)
export function isManager(user: AppUser | null | undefined): boolean {
  return isAdminUser(user) || user?.role === "moderador";
}

export function generateToken(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
