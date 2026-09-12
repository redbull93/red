/**
 * Discovers your Ambiguous workspace's real API shape.
 *
 * The five tools in packages/mcp-tools/src/tools/ambiguous-workspace.ts were
 * written against *assumed* REST routes, because the Ambiguous CLI builds its
 * command tree from your workspace's own OpenAPI spec at runtime — so the only
 * trustworthy source of route names is your workspace, not documentation.
 *
 * This script fetches that spec and tells you which assumed routes are real,
 * which are wrong, and what the correct ones are. Run it as soon as
 * AMBIGUOUS_API_KEY is set:
 *
 *   npm run ambiguous:probe
 *
 * It only ever issues GETs against spec and identity endpoints. It does not
 * post, create or modify anything in your workspace.
 */

import { loadRuntimeEnv } from "@red/orchestrator";

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  magenta: "\x1b[35m",
};

/** Routes the tools currently assume. Each is `METHOD /path`. */
const ASSUMED: Array<{ tool: string; method: string; path: string }> = [
  { tool: "workspace.chatPost", method: "POST", path: "/api/chat/channels/{id}/messages" },
  { tool: "workspace.search", method: "GET", path: "/api/search" },
  { tool: "workspace.calendarHold", method: "POST", path: "/api/calendar/events" },
  { tool: "workspace.taskCreate", method: "POST", path: "/api/tasks" },
  { tool: "workspace.docAppend", method: "POST", path: "/api/docs" },
];

/** Where an OpenAPI document commonly lives. */
const SPEC_PATHS = [
  "/api/openapi.json",
  "/openapi.json",
  "/api/spec",
  "/api/schema",
  "/api/v1/openapi.json",
  "/.well-known/openapi.json",
];

const IDENTITY_PATHS = ["/api/users/me", "/api/me", "/api/v1/users/me"];

async function get(base: string, path: string, key: string) {
  try {
    const response = await fetch(`${base}${path}`, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
    const text = await response.text();
    return { status: response.status, text };
  } catch (error) {
    return {
      status: 0,
      text: error instanceof Error ? error.message : "network error",
    };
  }
}

async function main(): Promise<number> {
  loadRuntimeEnv();

  const key = process.env.AMBIGUOUS_API_KEY;
  const base = (process.env.AMBIGUOUS_BASE_URL || "https://app.ambiguous.ai").replace(/\/+$/, "");

  console.log(`\n${c.bold}${c.magenta}═══ Ambiguous API discovery ═══${c.reset}\n`);

  if (!key) {
    console.log(`${c.red}AMBIGUOUS_API_KEY is not set.${c.reset}`);
    console.log(
      `${c.dim}Add it to .env.local at the repo root, then run this again.`,
    );
    console.log(`See docs/06-ambiguous-setup.md steps 3 and 4.${c.reset}\n`);
    return 1;
  }

  console.log(`  base ${base}`);
  console.log(`  key  ${key.slice(0, 6)}… (${key.length} chars)\n`);

  // ── Who are we? Confirms the key belongs to the agent, not to you. ──
  console.log(`${c.bold}Identity${c.reset}`);
  let identityFound = false;
  for (const path of IDENTITY_PATHS) {
    const { status, text } = await get(base, path, key);
    if (status === 200) {
      identityFound = true;
      console.log(`  ${c.green}200${c.reset} ${path}`);
      try {
        const me = JSON.parse(text) as Record<string, unknown>;
        const inner = (me.data ?? me) as Record<string, unknown>;
        console.log(
          `      ${c.dim}${JSON.stringify({
            id: inner.id,
            email: inner.email,
            name: inner.name,
            type: inner.type ?? inner.kind,
          })}${c.reset}`,
        );
        console.log(
          `      ${c.yellow}Check this is the agent member, not your own account.${c.reset}`,
        );
      } catch {
        console.log(`      ${c.dim}${text.slice(0, 200)}${c.reset}`);
      }
      break;
    }
    if (status === 401 || status === 403) {
      console.log(`  ${c.red}${status}${c.reset} ${path} — key rejected`);
      console.log(`      ${c.dim}${text.slice(0, 200)}${c.reset}`);
      return 1;
    }
  }
  if (!identityFound) {
    console.log(`  ${c.yellow}no identity endpoint matched${c.reset}`);
    console.log(`      ${c.dim}Try: npx ambiguous api GET /api/users/me --json${c.reset}`);
  }

  // ── The spec, which is the real source of truth ──
  console.log(`\n${c.bold}OpenAPI spec${c.reset}`);
  let spec: { paths?: Record<string, Record<string, unknown>> } | null = null;
  for (const path of SPEC_PATHS) {
    const { status, text } = await get(base, path, key);
    if (status !== 200) continue;
    try {
      const parsed = JSON.parse(text) as { paths?: Record<string, Record<string, unknown>> };
      if (parsed.paths) {
        spec = parsed;
        console.log(`  ${c.green}200${c.reset} ${path} — ${Object.keys(parsed.paths).length} paths`);
        break;
      }
    } catch {
      // Not JSON; keep looking.
    }
  }

  if (!spec?.paths) {
    console.log(`  ${c.yellow}no OpenAPI document found at the usual locations${c.reset}`);
    console.log(`      ${c.dim}Fall back to the CLI, which reads the spec itself:${c.reset}`);
    console.log(`      ${c.dim}npx ambiguous chat --help${c.reset}`);
    console.log(`      ${c.dim}npx ambiguous calendar --help${c.reset}`);
    console.log(`      ${c.dim}npx ambiguous search --help${c.reset}`);
    console.log(
      `\n${c.yellow}Paste that output and the assumed routes can be corrected directly.${c.reset}\n`,
    );
    return 0;
  }

  const paths = Object.keys(spec.paths).sort();

  // ── Are the assumed routes real? ──
  console.log(`\n${c.bold}Assumed routes${c.reset}`);
  let wrong = 0;
  for (const assumed of ASSUMED) {
    // Compare loosely: spec templates use {channelId}, ours uses {id}.
    const normalize = (p: string) => p.replace(/\{[^}]+\}/g, "{}").replace(/\/+$/, "");
    const target = normalize(assumed.path);
    const hit = paths.find((p) => normalize(p) === target);

    if (hit) {
      const methods = Object.keys(spec.paths?.[hit] ?? {}).map((m) => m.toUpperCase());
      if (methods.includes(assumed.method)) {
        console.log(`  ${c.green}OK  ${c.reset} ${assumed.tool} — ${assumed.method} ${hit}`);
      } else {
        wrong += 1;
        console.log(
          `  ${c.yellow}METHOD${c.reset} ${assumed.tool} — ${hit} exists but allows ${methods.join(", ")}, not ${assumed.method}`,
        );
      }
    } else {
      wrong += 1;
      console.log(`  ${c.red}MISS${c.reset} ${assumed.tool} — ${assumed.method} ${assumed.path}`);
    }
  }

  // ── What does exist, for the areas we care about ──
  console.log(`\n${c.bold}Candidate routes in your workspace${c.reset}`);
  const areas: Record<string, RegExp> = {
    chat: /chat|message|channel/i,
    search: /search|query/i,
    calendar: /calendar|event|availability/i,
    tasks: /task|todo|issue/i,
    docs: /doc|page|note/i,
    webhooks: /webhook|subscription/i,
  };

  for (const [area, pattern] of Object.entries(areas)) {
    const matches = paths.filter((p) => pattern.test(p));
    if (matches.length === 0) {
      console.log(`  ${c.dim}${area.padEnd(9)} — none${c.reset}`);
      continue;
    }
    console.log(`  ${c.bold}${area}${c.reset}`);
    for (const p of matches.slice(0, 12)) {
      const methods = Object.keys(spec.paths?.[p] ?? {})
        .map((m) => m.toUpperCase())
        .join(" ");
      console.log(`    ${c.dim}${methods.padEnd(16)}${c.reset} ${p}`);
    }
    if (matches.length > 12) {
      console.log(`    ${c.dim}… and ${matches.length - 12} more${c.reset}`);
    }
  }

  console.log();
  if (wrong > 0) {
    console.log(
      `${c.yellow}${wrong} assumed route(s) need correcting in packages/mcp-tools/src/tools/ambiguous-workspace.ts.${c.reset}`,
    );
    console.log(`${c.dim}Paste this output and they can be fixed exactly.${c.reset}\n`);
    return 0;
  }

  console.log(`${c.green}${c.bold}✔ every assumed route exists — the tools should work live${c.reset}\n`);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(`${c.red}probe crashed:${c.reset}`, error);
    process.exit(1);
  },
);
