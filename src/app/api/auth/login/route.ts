import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase";
import { createServiceClient } from "@/lib/supabase";
import { generateToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const { apelido } = await req.json();
    if (!apelido || typeof apelido !== "string" || apelido.trim().length < 2) {
      return NextResponse.json({ error: "Apelido deve ter pelo menos 2 caracteres" }, { status: 400 });
    }

    const supabase = createServiceClient();
    const nome = apelido.trim();

    let { data: user, error } = await supabase.from("users").select("*").eq("apelido", nome).single();

    if (error || !user) {
      const token = generateToken();
      const { data: newUser, error: insertError } = await supabase
        .from("users")
        .insert({
          username: nome,
          apelido: nome,
          role: "user",
          total_segundos: 0,
          is_admin: false,
          session_token: token,
        })
        .select()
        .single();

      if (insertError || !newUser) {
        return NextResponse.json({ error: "Não foi possível criar o usuário" }, { status: 500 });
      }
      user = newUser;
    } else {
      const token = generateToken();
      await supabase.from("users").update({ session_token: token }).eq("id", user.id);
      user = { ...user, session_token: token };
    }

    const response = NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        apelido: user.apelido,
        role: user.role,
        is_admin: user.is_admin ?? user.role === "admin",
      },
    });
    response.cookies.set("tropa_session", user.session_token!, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    return response;
  } catch (e) {
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
