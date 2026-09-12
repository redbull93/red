import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { auth0, isAuth0Configured } from "@/lib/auth";

/**
 * Auth0 v4 mounts /auth/login, /auth/logout, /auth/callback, /auth/profile
 * through this middleware. When Auth0 env is missing we stay in local-dev mode.
 */
export async function middleware(request: NextRequest) {
  if (!isAuth0Configured || !auth0) {
    return NextResponse.next();
  }

  const authResponse = await auth0.middleware(request);

  // Require a session for the control plane UI (not for webhooks / health).
  const { pathname } = request.nextUrl;
  const isPublic =
    pathname.startsWith("/auth") ||
    pathname.startsWith("/api/slack") ||
    pathname.startsWith("/api/discord") ||
    pathname.startsWith("/api/whatsapp") ||
    pathname.startsWith("/api/health") ||
    pathname === "/api/state"; // polled by the board; returns auth status

  if (isPublic) {
    return authResponse;
  }

  // Only enforce login on page navigations and mutating APIs when required.
  const requireAuth = process.env.AUTH0_REQUIRE_AUTH === "1";
  if (requireAuth && !pathname.startsWith("/_next")) {
    const session = await auth0.getSession(request);
    if (!session) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const login = new URL("/auth/login", request.nextUrl.origin);
      login.searchParams.set("returnTo", pathname);
      return NextResponse.redirect(login);
    }
  }

  return authResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
