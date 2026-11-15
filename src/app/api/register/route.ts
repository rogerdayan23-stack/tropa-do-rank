import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { createServiceClient } from "@/lib/supabase";

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

    const cleanUsername = username.trim();
    if (cleanUsername.length < 3) {
      return NextResponse.json(
        { error: "O nome de usuário deve ter pelo menos 3 caracteres" },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "A senha deve ter pelo menos 6 caracteres" },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    const { data: existing } = await supabase
      .from("users")
      .select("id")
      .eq("username", cleanUsername)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: "Este nome de usuário já está em uso" },
        { status: 409 }
      );
    }

    // 3. Criptografa a senha com bcrypt (10 rounds)
    const saltRounds = 10;
    const password_hash = await bcrypt.hash(password, saltRounds);

    const id = crypto.randomUUID();

        const { error: insertError } = await supabase.from("users").insert({
      id,
      username: cleanUsername,
      apelido: cleanUsername, // <-- ADICIONE ESTA LINHA
      role: "user",
      avatar_url: null,
      is_admin: false,
      password_hash,
    });

    if (insertError) {
      return NextResponse.json(
        { error: "Erro ao cadastrar usuário: " + insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Usuário cadastrado com sucesso!",
      user: {
        id,
        username: cleanUsername,
        role: "user",
        avatar_url: null,
      },
    });
  } catch (error: any) {
    console.error("Erro na rota /api/register:", error);
    return NextResponse.json(
      { error: "Erro interno ao cadastrar usuário" },
      { status: 500 }
    );
  }
}
