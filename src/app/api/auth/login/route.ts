import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "Este método de login foi desativado. Entre com usuário e senha." },
    { status: 410 }
  );
}
