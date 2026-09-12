import { recordBlockers } from "./memory";
import { getStore } from "./store";
import { recordUsage } from "./usage";
import type {
  Actor,
  AgentContext,
  Approval,
  Claim,
  CouncilVerdict,
  Dependency,
  ModelOpinion,
  Receipt,
  Run,
  TraceEvent,
} from "./types";

/**
 * Demo seed data.
 *
 * A live demo has two failure modes and this addresses the second one. The first
 * is the agent breaking; the second is the agent working perfectly against an
 * empty board, so there is nothing on screen to look at. This fills the board
 * with three stand-ups that between them exercise every path worth showing:
 * a clean unanimous run, a run the council split on, and a run where the council
 * could not be corroborated at all because two of three models were rationed.
 *
 * Everything written here is marked `demo: true` and every run id is prefixed
 * `demo-`, because a seeded verdict looks exactly like a real one on screen and
 * the difference matters. prompts/council.md draws this line: replaying a real
 * captured council is honest, and hardcoding opinions is only honest when the
 * record and the UI both say so.
 *
 * Safe to call more than once — it clears its own rows first, so refreshing the
 * demo does not stack six copies of the same morning.
 */

const CHANNEL = "C-standup";
const SEAT_MODELS: Record<string, { label: string; model: string }> = {
  gpt: { label: "GPT", model: "gpt-6-astra" },
  opus: { label: "Opus", model: "claude-opus-4-6-20260712" },
  deepseek: { label: "DeepSeek", model: "deepseek-v3.2" },
};

const TEAM: Actor[] = ["eugene", "brian", "amina", "mary"].map((id) => ({
  id,
  role: "teammate",
  present: true,
  mayAct: true,
  language: "en",
}));

/** Minutes before now, so the board reads as a sequence rather than one instant. */
function ago(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

function dep(waiter: string, blocker: string, artifact: string): Dependency {
  return { waiter, blocker, artifact };
}

function claim(dependency: Dependency, agreedBy: string[]): Claim {
  return {
    key: `${dependency.waiter.toLowerCase()}->${dependency.blocker.toLowerCase()}`,
    dependency,
    text: `${dependency.waiter} is waiting on ${dependency.blocker} for ${dependency.artifact}`,
    agreedBy,
  };
}

function answered(
  seat: string,
  input: {
    blockers: string[];
    dependencies: Dependency[];
    suggestedAction: string;
    confidence: number;
    reasoning?: string;
    latencyMs: number;
    totalTokens: number;
  },
): ModelOpinion {
  return { seat, ...SEAT_MODELS[seat], status: "answered", ...input };
}

function abstained(seat: string, reason: string): ModelOpinion {
  return {
    seat,
    ...SEAT_MODELS[seat],
    status: "abstained",
    abstainReason: reason,
    blockers: [],
    dependencies: [],
    suggestedAction: "",
    confidence: 0,
    latencyMs: 0,
  };
}

function verdict(input: {
  at: string;
  opinions: ModelOpinion[];
  consensus: Claim[];
  dissent: Claim[];
  suggestedAction: string;
}): CouncilVerdict {
  const seated = input.opinions.filter((o) => o.status === "answered").map((o) => o.seat);
  return {
    at: input.at,
    seated,
    abstained: input.opinions
      .filter((o) => o.status === "abstained")
      .map((o) => ({ seat: o.seat, label: o.label, reason: o.abstainReason ?? "unknown" })),
    consensus: input.consensus,
    dissent: input.dissent,
    suggestedAction: input.suggestedAction,
    unverified: seated.length < 2,
    cached: false,
    demo: true,
    opinions: input.opinions,
  };
}

function event(input: {
  id: string;
  at: string;
  signalBody: string;
  placeOnlyContext: string;
}): AgentContext {
  return {
    id: input.id,
    occurredAt: input.at,
    environmentName: "Slack #standup",
    environmentKind: "slack",
    channelId: CHANNEL,
    threadId: `standup-${input.at.slice(0, 10)}`,
    signalType: "standup.collected",
    signalBody: input.signalBody,
    placeOnlyContext: input.placeOnlyContext,
    actors: TEAM,
    urgency: "medium",
    language: "en",
    principal: "standup-agent",
  };
}

export type SeedSummary = {
  runs: number;
  receipts: number;
  approvals: number;
  traces: number;
  blockers: number;
  pendingApprovalId?: string;
};

export function seedDemoData(): SeedSummary {
  const store = getStore();

  // Idempotent: drop anything a previous seed wrote, leave real runs alone.
  const isDemo = (id: string) => id.startsWith("demo-");
  store.runs = store.runs.filter((r) => !isDemo(r.id));
  store.traces = store.traces.filter((t) => !isDemo(t.runId));
  store.approvals = store.approvals.filter((a) => !isDemo(a.runId));
  store.receipts = store.receipts.filter((r) => !isDemo(r.runId));
  store.signals = store.signals.filter((s) => !isDemo(s.id));

  const traces: TraceEvent[] = [];
  let traceSeq = 0;
  const trace = (
    runId: string,
    at: string,
    kind: TraceEvent["kind"],
    title: string,
    detail: string,
    data?: Record<string, unknown>,
  ) => {
    traces.push({ id: `demo-tr-${++traceSeq}`, runId, at, kind, title, detail, data });
  };

  const runs: Run[] = [];
  const receipts: Receipt[] = [];
  const approvals: Approval[] = [];

  // ── Run 1: unanimous. The path where the agent just acts. ────────
  const oneId = "demo-run-unanimous";
  const oneAt = ago(180);
  const oneEvent = event({
    id: `demo-sig-${oneId}`,
    at: oneAt,
    signalBody: [
      "Morning stand-up replies collected.",
      "",
      "Eugene: Can't finish the dashboard until I get the API endpoint from Brian.",
      "Brian: API endpoint is done, just haven't sent Eugene the docs yet.",
      "Amina: Finished onboarding docs. Working on billing polish. No blockers.",
    ].join("\n"),
    placeOnlyContext:
      "Three DM replies arrived for the scheduled stand-up. Brian finished the work but never closed the loop with Eugene, so the block is a notification gap rather than unfinished code.",
  });
  const oneVerdict = verdict({
    at: oneAt,
    opinions: [
      answered("gpt", {
        blockers: ["Eugene blocked on the API endpoint docs"],
        dependencies: [dep("Eugene", "Brian", "API endpoint docs")],
        suggestedAction: "Link Brian's endpoint docs into the thread and tell Eugene it is unblocked.",
        confidence: 0.91,
        reasoning: "Brian states the endpoint is complete, so the gap is handoff, not work.",
        latencyMs: 2140,
        totalTokens: 743,
      }),
      answered("opus", {
        blockers: ["Eugene waiting on Brian's endpoint documentation"],
        dependencies: [dep("Eugene", "Brian", "API endpoint docs")],
        suggestedAction: "Post the docs link and confirm the endpoint contract matches the dashboard.",
        confidence: 0.87,
        reasoning: "Agrees on the dependency; notes the contract itself was never confirmed.",
        latencyMs: 3310,
        totalTokens: 902,
      }),
      answered("deepseek", {
        blockers: ["Eugene needs endpoint docs from Brian"],
        dependencies: [dep("eugene", "brian", "API endpoint docs")],
        suggestedAction: "Share the endpoint docs with Eugene in the stand-up thread.",
        confidence: 0.83,
        latencyMs: 1870,
        totalTokens: 688,
      }),
    ],
    consensus: [claim(dep("Eugene", "Brian", "API endpoint docs"), ["gpt", "opus", "deepseek"])],
    dissent: [],
    suggestedAction: "Link Brian's endpoint docs into the thread and tell Eugene it is unblocked.",
  });

  runs.push({
    id: oneId,
    status: "completed",
    event: oneEvent,
    startedAt: oneAt,
    finishedAt: ago(178),
    demo: true,
    verdict: oneVerdict,
    assistantText:
      "Eugene was blocked on API endpoint docs from Brian. The endpoint is finished — this was a handoff gap, not unfinished work. Docs linked in thread; Eugene is unblocked.",
  });

  trace(oneId, oneAt, "signal", "Stand-up collected", "3 replies from Slack #standup");
  trace(oneId, oneAt, "council", "Tribunal: 3 of 3 answered", "Unanimous on 1 claim, no dissent.", {
    seated: ["gpt", "opus", "deepseek"],
    consensus: 1,
    dissent: 0,
  });
  trace(oneId, ago(179), "tool", "workspace.search", "Found Brian's endpoint docs already published.");
  trace(oneId, ago(179), "tool", "world.act", "Posted docs link, @-mentioned Eugene.");
  trace(oneId, ago(178), "receipt", "Receipt posted", "Landed in Slack #standup.");

  receipts.push({
    id: "demo-rcpt-1",
    runId: oneId,
    channelId: CHANNEL,
    at: ago(178),
    body: [
      "*Stand-up — resolved 1 blocker*",
      "",
      "• Eugene was waiting on API endpoint docs from Brian. The endpoint was already done, so this was a handoff gap. Docs linked above — Eugene, you are unblocked.",
      "• Amina: no blockers, on billing polish.",
      "",
      "_All 3 council models agreed on this. Acted without asking._",
    ].join("\n"),
  });

  // ── Run 2: the council split. This is what the Warden is for. ────
  const twoId = "demo-run-contested";
  const twoAt = ago(75);
  const twoEvent = event({
    id: `demo-sig-${twoId}`,
    at: twoAt,
    signalBody: [
      "Morning stand-up replies collected.",
      "",
      "Mary: Staging is behaving oddly again. Might be the migration Eugene ran, might just be me. Going to keep poking at it.",
      "Eugene: Ran the migration on staging yesterday. Dashboard work continuing.",
      "Brian: Reviewing PRs. No blockers.",
    ].join("\n"),
    placeOnlyContext:
      "Mary hedges — she names Eugene's migration but immediately doubts herself. Whether that counts as a blocker on Eugene is exactly the judgement the models disagreed about.",
  });
  const twoVerdict = verdict({
    at: twoAt,
    opinions: [
      answered("gpt", {
        blockers: ["Staging instability, cause unconfirmed"],
        dependencies: [dep("Mary", "Eugene", "staging migration rollback")],
        suggestedAction: "Ask Eugene to roll back the staging migration.",
        confidence: 0.78,
        reasoning: "Timing lines up: migration ran the day before the instability appeared.",
        latencyMs: 2260,
        totalTokens: 811,
      }),
      answered("opus", {
        blockers: ["Staging instability reported by Mary"],
        dependencies: [],
        suggestedAction: "Ask Mary for the failing request id before assigning cause.",
        confidence: 0.72,
        reasoning:
          "Mary explicitly says it might just be her. Naming Eugene as the blocker on that basis is a guess dressed as a finding.",
        latencyMs: 3480,
        totalTokens: 967,
      }),
      answered("deepseek", {
        blockers: ["Staging odd since Eugene's migration"],
        dependencies: [dep("mary", "eugene", "staging migration rollback")],
        suggestedAction: "Open a task for Eugene to verify the migration on staging.",
        confidence: 0.69,
        latencyMs: 1990,
        totalTokens: 702,
      }),
    ],
    consensus: [],
    dissent: [claim(dep("Mary", "Eugene", "staging migration rollback"), ["gpt", "deepseek"])],
    suggestedAction: "Ask Eugene to roll back the staging migration.",
  });

  runs.push({
    id: twoId,
    status: "awaiting_hitl",
    event: twoEvent,
    startedAt: twoAt,
    demo: true,
    verdict: twoVerdict,
    assistantText:
      "Two of three models read Mary as blocked on Eugene's migration; Opus argued she explicitly doubted her own diagnosis. That is a disagreement about cause, so it goes to a human rather than into the channel as fact.",
  });

  trace(twoId, twoAt, "signal", "Stand-up collected", "3 replies from Slack #standup");
  trace(
    twoId,
    twoAt,
    "council",
    "Tribunal split: 2 of 3 on a contested claim",
    "GPT and DeepSeek named Eugene as the blocker. Opus refused on the grounds that Mary doubted herself.",
    { seated: ["gpt", "opus", "deepseek"], consensus: 0, dissent: 1 },
  );
  trace(
    twoId,
    ago(74),
    "hitl",
    "Warden needed",
    "Council split on whether Mary is blocked on Eugene. Paused before acting.",
  );

  const pendingApproval: Approval = {
    id: "demo-appr-1",
    runId: twoId,
    at: ago(74),
    reason:
      "Council split: 2 of 3 models named Eugene as the blocker, and the third argued the reporter contradicted that.",
    proposedAction: "Ask Eugene to roll back the staging migration.",
    preview:
      "@Eugene — Mary is seeing instability on staging since your migration yesterday. Can you roll it back or confirm it is unrelated?",
    risk: "medium",
    principal: "standup-agent",
    requiredRole: "approver",
    status: "pending",
    expiresAt: new Date(Date.now() + 6 * 3600_000).toISOString(),
    dissent: twoVerdict.dissent,
    opinions: twoVerdict.opinions,
  };
  approvals.push(pendingApproval);

  // ── Run 3: two seats rationed. Acts, but says it could not check. ──
  const threeId = "demo-run-unverified";
  const threeAt = ago(20);
  const threeEvent = event({
    id: `demo-sig-${threeId}`,
    at: threeAt,
    signalBody: [
      "Morning stand-up replies collected.",
      "",
      "Eugene: Still waiting on the API endpoint docs from Brian. Third day.",
      "Brian: Swamped with the incident. Docs not sent.",
      "Amina: Shipped billing polish. No blockers.",
    ].join("\n"),
    placeOnlyContext:
      "The same Eugene-to-Brian block as earlier in the week, which is what makes it worth escalating rather than restating.",
  });
  const threeVerdict = verdict({
    at: threeAt,
    opinions: [
      abstained("gpt", "quota exhausted (402) — next batch 19:00 EAT"),
      abstained("opus", "quota exhausted (402) — next batch 19:00 EAT"),
      answered("deepseek", {
        blockers: ["Eugene blocked on Brian's API docs for the third day"],
        dependencies: [dep("Eugene", "Brian", "API endpoint docs")],
        suggestedAction: "Book a 10-minute hold between Eugene and Brian rather than nudging again.",
        confidence: 0.81,
        reasoning:
          "Two nudges have already failed this week, so a third is unlikely to work; a calendar hold forces the handoff.",
        latencyMs: 2030,
        totalTokens: 754,
      }),
    ],
    consensus: [],
    dissent: [],
    suggestedAction: "Book a 10-minute hold between Eugene and Brian rather than nudging again.",
  });

  runs.push({
    id: threeId,
    status: "completed",
    event: threeEvent,
    startedAt: threeAt,
    finishedAt: ago(19),
    demo: true,
    verdict: threeVerdict,
    assistantText:
      "Third day of the same block, so a calendar hold rather than another nudge. Only 1 of 3 models was reachable, so this is stated as unverified rather than as a finding.",
  });

  trace(threeId, threeAt, "signal", "Stand-up collected", "3 replies from Slack #standup");
  trace(
    threeId,
    threeAt,
    "council",
    "Tribunal uncorroborated: 1 of 3 answered",
    "GPT and Opus were rationed. One opinion cannot be cross-checked, so the receipt says so.",
    { seated: ["deepseek"], consensus: 0, dissent: 0, unverified: true },
  );
  trace(
    threeId,
    ago(19),
    "tool",
    "workspace.calendarHold",
    "Booked 10 minutes between Eugene and Brian.",
  );
  trace(threeId, ago(19), "receipt", "Receipt posted", "Landed in Slack #standup.");

  receipts.push({
    id: "demo-rcpt-2",
    runId: threeId,
    channelId: CHANNEL,
    at: ago(19),
    body: [
      "*Stand-up — 1 recurring blocker escalated*",
      "",
      "• Eugene → Brian on API endpoint docs. Third day running, so I booked 10 minutes between you both at 14:30 instead of nudging again.",
      "• Amina: shipped billing polish, no blockers.",
      "",
      "_Only 1 of 3 council models was reachable this morning, so treat the above as uncorroborated._",
    ].join("\n"),
  });

  // Cross-run memory: the streak is what justifies escalating instead of repeating.
  const seenBlockers = [
    ...recordBlockers(oneId, CHANNEL, TEAM, oneEvent.signalBody),
    ...recordBlockers(threeId, CHANNEL, TEAM, threeEvent.signalBody),
  ];

  // Usage rows so the cost panel is not blank. These carry the demo- run id, which
  // is how anything reading the ledger can tell the tokens were never really spent.
  for (const run of runs) {
    let turn = 0;
    for (const opinion of run.verdict?.opinions ?? []) {
      if (opinion.status !== "answered") continue;
      const total = opinion.totalTokens ?? 0;
      const completion = Math.round(total * 0.3);
      recordUsage(run.id, turn++, opinion.model, {
        prompt_tokens: total - completion,
        completion_tokens: completion,
        total_tokens: total,
      });
    }
  }

  store.runs.push(...runs);
  store.traces.push(...traces);
  store.approvals.push(...approvals);
  store.receipts.push(...receipts);
  store.signals.push(...runs.map((r) => r.event));

  return {
    runs: runs.length,
    receipts: receipts.length,
    approvals: approvals.length,
    traces: traces.length,
    blockers: seenBlockers.length,
    pendingApprovalId: pendingApproval.id,
  };
}
