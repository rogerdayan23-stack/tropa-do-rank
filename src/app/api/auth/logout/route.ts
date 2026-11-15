import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const url = new URL("/login", req.url);
  const response = NextResponse.redirect(url);
  response.cookies.set("tropa_session", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set("tropa_session", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
