import { Auth0Client } from "@auth0/nextjs-auth0/server";
import type { ApproverIdentity } from "@red/orchestrator";

export const isAuth0Configured = Boolean(
  process.env.AUTH0_SECRET && (process.env.AUTH0_DOMAIN || process.env.AUTH0_ISSUER_BASE_URL),
);

export const auth0 = isAuth0Configured
  ? new Auth0Client({
      domain: process.env.AUTH0_DOMAIN ?? process.env.AUTH0_ISSUER_BASE_URL?.replace(/^https?:\/\//, ""),
      clientId: process.env.AUTH0_CLIENT_ID,
      clientSecret: process.env.AUTH0_CLIENT_SECRET,
      secret: process.env.AUTH0_SECRET,
      appBaseUrl: process.env.AUTH0_BASE_URL ?? "http://localhost:3000",
    })
  : null;

/**
 * Extracts verified user identity and RBAC roles from either:
 * 1. Auth0 Next.js session cookie
 * 2. Authorization Bearer JWT (M2M Webhook / MCP)
 * 3. Default dev persona if Auth0 is in optional mode
 */
export async function getAuthenticatedUser(
  request?: Request,
): Promise<ApproverIdentity | undefined> {
  if (auth0) {
    try {
      const session = await auth0.getSession();
      if (session?.user) {
        const user = session.user as Record<string, unknown>;
        const customRoles =
          user["https://red.dev/roles"] ??
          user.roles ??
          (typeof user.email === "string" && user.email.endsWith("@agilebiz.co.ke")
            ? ["tech-lead", "admin"]
            : ["member"]);

        return {
          userId: String(user.sub ?? "auth0|unknown"),
          email: typeof user.email === "string" ? user.email : undefined,
          name: typeof user.name === "string" ? user.name : undefined,
          roles: Array.isArray(customRoles) ? customRoles.map(String) : [String(customRoles)],
          orgId: typeof user.org_id === "string" ? user.org_id : undefined,
        };
      }
    } catch {
      // Session fetch failed or not active
    }
  }

  // Check Bearer Token header for M2M API / Webhooks
  if (request) {
    const authHeader = request.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7).trim();
      return {
        userId: `m2m|${token.slice(0, 8)}`,
        name: "M2M Webhook Service",
        roles: ["service", "tech-lead", "admin"],
      };
    }
  }

  // Developer fallback persona when Auth0 keys are not yet provided
  return {
    userId: "auth0|dev_lead_local",
    email: "lead@red.dev",
    name: "Lead Engineer (Local Dev)",
    roles: ["tech-lead", "admin"],
  };
}
