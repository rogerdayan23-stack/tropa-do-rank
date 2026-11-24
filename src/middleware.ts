import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_ROUTES = ["/login", "/register", "/api/login", "/api/register", "/api/auth/logout"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    PUBLIC_ROUTES.includes(pathname) ||
    pathname.startsWith("/api/login") ||
    pathname.startsWith("/api/register") ||
    pathname.startsWith("/api/auth/")
  ) {
    return NextResponse.next();
  }

  const sessionToken = request.cookies.get("tropa_session")?.value;

  if (!sessionToken) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
