/**
 * Demo-day preflight.
 *
 * Run this before you film. It answers, in about ten seconds, the questions that
 * otherwise get discovered on camera:
 *
 *   - Is the Agent Router key loaded and is the base URL sane?
 *   - Which council seats are alive right now, and why are the others not?
 *   - Does tool calling actually work through the gateway?
 *   - Is there a captured three-model verdict on disk to replay if seats are down?
 *   - Is Ambiguous wired, or still stubbed?
 *
 * Exits non-zero only when the loop could not run at all. A rationed seat is
 * reported, not treated as a failure, because that is the normal daytime state.
 */

import {
  callModel,
  describeFailure,
  listVerdicts,
  loadRuntimeEnv,
  loadVerdict,
  modelForSeat,
  routerConfig,
  SEAT_IDS,
  SEAT_LABELS,
  type SeatId,
} from "@red/orchestrator";
import { openaiToolDefinitions } from "@red/mcp-tools";

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
};

const ok = (m: string) => console.log(`  ${c.green}OK  ${c.reset} ${m}`);
const warn = (m: string) => console.log(`  ${c.yellow}WARN${c.reset} ${m}`);
const bad = (m: string) => console.log(`  ${c.red}FAIL${c.reset} ${m}`);
const note = (m: string) => console.log(`       ${c.dim}${m}${c.reset}`);

// Wrapped rather than using top-level await: scripts/ resolves against the root
// package, which is not an ES module.
async function main(): Promise<number> {
loadRuntimeEnv();

console.log(`\n${c.bold}${c.magenta}═══ StandUp Agent preflight ═══${c.reset}\n`);

let fatal = 0;

// ── 1. Configuration ──────────────────────────────────────────────
console.log(`${c.bold}Agent Router configuration${c.reset}`);
const config = routerConfig();

if (!config.key) {
  bad("AGENT_ROUTER_API_KEY is not set — the loop will run on stubs only");
  note("Put it in .env.local at the repo root. Never commit it.");
  fatal += 1;
} else {
  ok(`key loaded (${config.key.slice(0, 6)}…, ${config.key.length} chars)`);
}

ok(`primary base ${config.bases[0]}`);
if (config.bases[1]) {
  note(`mirror failover ${config.bases[1]}`);
}

// A default agent is rejected with 401 by this gateway, so flag anything that
// does not look like one of the supported harnesses.
if (/claude-cli|codex|qwen|roo|opencode/i.test(config.userAgent)) {
  ok(`User-Agent looks like a supported harness (${config.userAgent})`);
} else {
  warn(`User-Agent "${config.userAgent}" may be rejected with 401 unauthorized_client`);
  note("Agent Router fingerprints clients. Supported: Claude Code, Codex, Qwen Code, Roo Code, OpenCode.");
}

// ── 2. Tool schema compatibility ──────────────────────────────────
console.log(`\n${c.bold}Tool schema${c.reset}`);
const dotted = openaiToolDefinitions().filter((d) => d.function.name.includes("."));
ok(`${openaiToolDefinitions().length} tools registered, ${dotted.length} with dotted names`);
note("Dotted names are wire-encoded to satisfy ^[a-zA-Z0-9_-]+$ and decoded on return.");

// ── 3. Live seat check ────────────────────────────────────────────
console.log(`\n${c.bold}Council seats${c.reset}`);

const probeTool = [
  {
    type: "function" as const,
    function: {
      name: "preflight_echo",
      description: "Echo a single word back to confirm tool calling works",
      parameters: {
        type: "object",
        properties: { word: { type: "string" } },
        required: ["word"],
      },
    },
  },
];

const alive: SeatId[] = [];

if (config.key) {
  const checks = await Promise.all(
    SEAT_IDS.map(async (seat) => {
      const started = Date.now();
      const result = await callModel({
        model: modelForSeat(seat),
        messages: [
          { role: "user", content: "Call preflight_echo with the word ready." },
        ],
        tools: probeTool,
        maxTokens: 128,
      });
      return { seat, result, ms: Date.now() - started };
    }),
  );

  for (const { seat, result, ms } of checks) {
    const label = `${SEAT_LABELS[seat]} (${modelForSeat(seat)})`;
    if (result.ok) {
      alive.push(seat);
      const calledTool = result.toolCalls.length > 0;
      ok(`${label} — ${ms}ms${calledTool ? ", tool calling confirmed" : ", replied without a tool call"}`);
      if (result.viaFallback) note("answered via the mirror domain, not the primary");
    } else if (result.failure.kind === "quota_exhausted") {
      warn(`${label} — ${describeFailure(result.failure)}`);
    } else {
      bad(`${label} — ${describeFailure(result.failure)}`);
      if (result.failure.kind === "unauthorized_client") fatal += 1;
    }
  }
}

console.log();
if (alive.length >= 2) {
  ok(`${alive.length} seats alive — a real council can run and will be captured to fixtures`);
} else if (alive.length === 1) {
  warn(`only ${SEAT_LABELS[alive[0]]} is alive — verdicts will be marked unverified`);
  note("Agent Router releases GPT and Opus at 03:00, 11:00 and 19:00 Nairobi time, while supplies last.");
} else if (config.key) {
  bad("no seats alive — the loop will fall back to stubs");
  fatal += 1;
}

// ── 4. Captured verdicts for replay ───────────────────────────────
console.log(`\n${c.bold}Captured verdicts${c.reset}`);
const captures = listVerdicts();
const latest = loadVerdict();
if (latest && latest.seated.length >= 2) {
  ok(`${captures.length} capture(s) on disk; newest has ${latest.seated.length} seats (${latest.seated.join(", ")})`);
  note(`Replay it with COUNCIL_REPLAY=1 — it is labelled as replayed, never as live.`);
} else if (alive.length >= 2) {
  warn("no multi-seat capture yet — run `npm run loop` now while the seats are up");
} else {
  warn("no multi-seat capture on disk and fewer than two seats alive");
  note("Capture one during the next quota window so the demo has a real council to show.");
}

// ── 5. Ambiguous workspace ────────────────────────────────────────
console.log(`\n${c.bold}Ambiguous workspace${c.reset}`);
if (process.env.AMBIGUOUS_API_KEY) {
  ok(`key loaded, base ${process.env.AMBIGUOUS_BASE_URL || "https://app.ambiguous.ai"}`);
  if (process.env.AMBIGUOUS_STANDUP_CHANNEL) {
    ok(`stand-up channel ${process.env.AMBIGUOUS_STANDUP_CHANNEL}`);
  } else {
    warn("AMBIGUOUS_STANDUP_CHANNEL is not set — receipts fall back to the in-memory place");
    note("Find it with: npx ambiguous chat channels list --json");
  }
} else {
  warn("AMBIGUOUS_API_KEY is not set — workspace tools run as honest stubs");
  note("See docs/06-ambiguous-setup.md for the walkthrough.");
}

// ── Verdict ───────────────────────────────────────────────────────
console.log();
if (fatal > 0) {
  console.log(`${c.red}${c.bold}✖ preflight found ${fatal} blocking problem(s)${c.reset}\n`);
  return 1;
}
console.log(`${c.green}${c.bold}✔ preflight clear — the loop can run${c.reset}\n`);
return 0;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(`${c.red}preflight crashed:${c.reset}`, error);
    process.exit(1);
  },
);
