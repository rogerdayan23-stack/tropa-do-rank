import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { createServiceClient } from "@/lib/supabase";

const JWT_SECRET = process.env.JWT_SECRET || "chave_padrao_rank_farm_2026";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json(
        { error: "Usuário e senha são obrigatórios" },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    const { data: user, error } = await supabase
      .from("users")
      .select("id, username, password_hash, role, avatar_url, criado_em")
      .eq("username", username.trim())
      .single();

    if (error || !user) {
      return NextResponse.json(
        { error: "Usuário ou senha inválidos" },
        { status: 401 }
      );
    }

    if (user.password_hash) {
      const match = await bcrypt.compare(password, user.password_hash);
      if (!match) {
        return NextResponse.json(
          { error: "Usuário ou senha inválidos" },
          { status: 401 }
        );
      }
    }

    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        role: user.role,
      },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    const userData = {
      id: user.id,
      username: user.username,
      role: user.role,
      avatar_url: user.avatar_url,
      criado_em: user.criado_em,
    };

    const response = NextResponse.json({
      success: true,
      message: "Login realizado com sucesso",
      token,
      user: userData,
    });

    response.cookies.set("tropa_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    return response;
  } catch (error: any) {
    console.error("Erro na rota /api/login:", error);
    return NextResponse.json(
      { error: "Erro interno no servidor" },
      { status: 500 }
    );
  }
}
