import { cookies, headers } from "next/headers";
import jwt from "jsonwebtoken";
import { createServiceClient } from "@/lib/supabase";

const JWT_SECRET = process.env.JWT_SECRET || "chave_padrao_rank_farm_2026";

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

    const supabase = createServiceClient();

    // 1) Token JWT (login por usuário/senha em /api/login)
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { id?: string };
      if (decoded && decoded.id) {
        const { data } = await supabase
          .from("users")
          .select(USER_COLUMNS)
          .eq("id", decoded.id)
          .maybeSingle();

        if (data) return mapearUsuario(data);
      }
    } catch {
      // Token opaco (não-JWT): segue para a busca por session_token
    }

    // 2) Token opaco salvo em users.session_token (login por apelido)
    const { data } = await supabase
      .from("users")
      .select(USER_COLUMNS)
      .eq("session_token", token)
      .maybeSingle();

    if (data) return mapearUsuario(data);

    return null;
  } catch {
    return null;
  }
}

export function isAdminUser(user: AppUser | null | undefined): boolean {
  return !!user && (user.is_admin === true || user.role === "admin");
}

export function generateToken(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}