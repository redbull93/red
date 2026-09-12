import { auth0 } from "@/lib/auth";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (auth0) {
    return auth0.middleware(request);
  }

  return new Response(
    JSON.stringify({
      configured: false,
      message:
        "Auth0 environment variables (AUTH0_SECRET, AUTH0_ISSUER_BASE_URL) not yet configured. Operating in local dev mode.",
    }),
    {
      headers: { "Content-Type": "application/json" },
      status: 200,
    },
  );
}
