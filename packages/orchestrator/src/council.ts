import type { AgentContext, Claim, CouncilVerdict, Dependency, ModelOpinion } from "./types";
import { renderEnvironmentBlock } from "./context";
import { envInt, loadRuntimeEnv } from "./runtime-env";
import { COUNCIL_PROMPT } from "./prompts";
import {
  callModel,
  describeFailure,
  hasRouterKey,
  modelForSeat,
  SEAT_IDS,
  SEAT_LABELS,
  type SeatId,
} from "./router";
import { isWorthCaching, loadVerdict, replayRequest, saveVerdict } from "./verdict-cache";

/**
 * The council.
 *
 * Three models cross-reference the same stand-up independently. Where they all
 * agree, the claim is treated as fact and the agent acts on it. Where they
 * disagree, that disagreement is the product: it becomes the approval card, so a
 * human decides instead of the system quietly averaging three opinions into one
 * confident-sounding answer.
 *
 * prompts/hitl.md already lists "tools disagreed" as a reason to pause. This
 * extends the same rule to the models themselves.
 */

type RawOpinion = {
  blockers?: unknown;
  dependencies?: unknown;
  suggestedAction?: unknown;
  suggested_action?: unknown;
  confidence?: unknown;
};

export function councilSeats(): SeatId[] {
  loadRuntimeEnv();
  const configured = (process.env.COUNCIL_SEATS || "").trim();
  if (!configured) return SEAT_IDS;
  const wanted = configured
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is SeatId => (SEAT_IDS as string[]).includes(s));
  return wanted.length ? wanted : SEAT_IDS;
}

export function councilEnabled(): boolean {
  loadRuntimeEnv();
  if (/^(0|false|no|off)$/i.test(process.env.COUNCIL_ENABLED ?? "")) return false;
  return hasRouterKey();
}

/** Minimum answering seats before agreement is considered meaningful. */
function minQuorum(): number {
  return Math.max(1, envInt("COUNCIL_MIN_QUORUM", 2));
}

export async function runCouncil(ctx: AgentContext): Promise<CouncilVerdict> {
  const replay = replayRequest();
  if (replay.active) {
    const cached = loadVerdict(replay.tag);
    if (cached) return cached;
    // Fall through to a live run rather than failing: an empty cache should not
    // stop the loop.
  }

  const seats = councilSeats();
  const environment = renderEnvironmentBlock(ctx);
  const actorIds = ctx.actors.map((a) => a.id.toLowerCase());

  const settled = await Promise.all(
    seats.map((seat) => askSeat(seat, environment, actorIds)),
  );

  const verdict = buildVerdict(settled, false);
  // Capture any genuine multi-model verdict the moment it happens, because the
  // window where GPT and Opus are both un-rationed is narrow.
  if (isWorthCaching(verdict)) saveVerdict(verdict);
  return verdict;
}

async function askSeat(
  seat: SeatId,
  environment: string,
  actorIds: string[],
): Promise<ModelOpinion> {
  const model = modelForSeat(seat);
  const label = SEAT_LABELS[seat];
  const startedAt = Date.now();

  const result = await callModel({
    model,
    json: true,
    temperature: 0,
    messages: [
      { role: "system", content: COUNCIL_PROMPT },
      { role: "user", content: environment },
    ],
  });

  const latencyMs = Date.now() - startedAt;

  if (!result.ok) {
    return {
      seat,
      label,
      model,
      status: "abstained",
      abstainReason: describeFailure(result.failure),
      blockers: [],
      dependencies: [],
      suggestedAction: "",
      confidence: 0,
      latencyMs,
    };
  }

  const parsed = parseOpinion(result.text);
  if (!parsed) {
    return {
      seat,
      label,
      model,
      status: "abstained",
      abstainReason: "returned no parseable JSON",
      blockers: [],
      dependencies: [],
      suggestedAction: "",
      confidence: 0,
      reasoning: result.reasoning,
      latencyMs,
    };
  }

  return {
    seat,
    label,
    model,
    status: "answered",
    blockers: parsed.blockers,
    dependencies: parsed.dependencies
      .map((d) => canonicalizeDependency(d, actorIds))
      .filter((d): d is Dependency => d !== null),
    suggestedAction: parsed.suggestedAction,
    confidence: parsed.confidence,
    reasoning: result.reasoning,
    latencyMs,
    totalTokens: result.totalTokens,
  };
}

/**
 * Models wrap JSON in prose or fences even when asked not to, so pull the widest
 * brace-delimited span rather than trusting the whole body to parse.
 */
function parseOpinion(text: string): {
  blockers: string[];
  dependencies: Dependency[];
  suggestedAction: string;
  confidence: number;
} | null {
  const candidates: string[] = [text];
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced?.[1]) candidates.push(fenced[1]);
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end > start) candidates.push(text.slice(start, end + 1));

  for (const candidate of candidates) {
    let raw: RawOpinion;
    try {
      raw = JSON.parse(candidate.trim()) as RawOpinion;
    } catch {
      continue;
    }
    const confidence = Number(raw.confidence);
    return {
      blockers: asStringArray(raw.blockers),
      dependencies: asDependencyArray(raw.dependencies),
      suggestedAction: String(raw.suggestedAction ?? raw.suggested_action ?? "").trim(),
      confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0.5,
    };
  }
  return null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v).trim()).filter(Boolean).slice(0, 12);
}

function asDependencyArray(value: unknown): Dependency[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (typeof entry !== "object" || entry === null) return null;
      const e = entry as Record<string, unknown>;
      return {
        waiter: String(e.waiter ?? e.blocked ?? "").trim(),
        blocker: String(e.blocker ?? e.blockedBy ?? e.owner ?? "").trim(),
        artifact: String(e.artifact ?? e.what ?? e.item ?? "").trim(),
      };
    })
    .filter((d): d is Dependency => Boolean(d && d.waiter && d.blocker))
    .slice(0, 12);
}

/**
 * Resolve free-text names onto real actor ids so "Brian", "brian" and
 * "@brian" all become one claim. A name that matches nobody in the place is
 * dropped: the models are not allowed to invent teammates.
 */
function canonicalizeDependency(dep: Dependency, actorIds: string[]): Dependency | null {
  const waiter = matchActor(dep.waiter, actorIds);
  const blocker = matchActor(dep.blocker, actorIds);
  if (!waiter || !blocker || waiter === blocker) return null;
  return { waiter, blocker, artifact: dep.artifact };
}

function matchActor(name: string, actorIds: string[]): string | null {
  const cleaned = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!cleaned) return null;
  const exact = actorIds.find((id) => id.replace(/[^a-z0-9]/g, "") === cleaned);
  if (exact) return exact;
  return actorIds.find((id) => cleaned.includes(id) || id.includes(cleaned)) ?? null;
}

/**
 * Agreement is keyed on the dependency pair, not on the artifact wording. Models
 * describe the same artifact as "API docs", "API documentation" or "endpoint
 * docs"; insisting those strings match would manufacture fake dissent. Who is
 * waiting on whom is the claim that matters.
 */
function claimKey(dep: Dependency): string {
  // Case-folded so the key does not depend on upstream canonicalization having
  // already run. "Eugene" and "eugene" are one claim, not two.
  return `${dep.waiter.toLowerCase()}->${dep.blocker.toLowerCase()}`;
}

export function buildVerdict(opinions: ModelOpinion[], cached: boolean): CouncilVerdict {
  const answered = opinions.filter((o) => o.status === "answered");
  const seated = answered.map((o) => o.seat);

  const byKey = new Map<string, Claim>();
  for (const opinion of answered) {
    // Deduplicate within a single model before counting votes, so one model
    // listing a dependency twice cannot look like agreement.
    const seen = new Set<string>();
    for (const dep of opinion.dependencies) {
      const key = claimKey(dep);
      if (seen.has(key)) continue;
      seen.add(key);

      const existing = byKey.get(key);
      if (existing) {
        existing.agreedBy.push(opinion.seat);
        if (dep.artifact && dep.artifact.length > existing.dependency.artifact.length) {
          existing.dependency = dep;
          existing.text = describeClaim(dep);
        }
      } else {
        byKey.set(key, {
          key,
          dependency: dep,
          text: describeClaim(dep),
          agreedBy: [opinion.seat],
        });
      }
    }
  }

  const claims = [...byKey.values()];
  const unanimous = (claim: Claim) => claim.agreedBy.length === seated.length;

  const consensus = seated.length ? claims.filter(unanimous) : [];
  const dissent = seated.length ? claims.filter((c) => !unanimous(c)) : [];

  return {
    at: new Date().toISOString(),
    seated,
    abstained: opinions
      .filter((o) => o.status === "abstained")
      .map((o) => ({
        seat: o.seat,
        label: o.label,
        reason: o.abstainReason ?? "unknown",
      })),
    consensus,
    dissent,
    suggestedAction: pickSuggestedAction(answered),
    unverified: seated.length < minQuorum(),
    cached,
    opinions,
  };
}

function describeClaim(dep: Dependency): string {
  const artifact = dep.artifact ? ` on ${dep.artifact}` : "";
  return `${dep.waiter} is waiting for ${dep.blocker}${artifact}`;
}

/**
 * Prefer the action proposed by the most seats; break ties on confidence. This
 * keeps the posted next step attributable to agreement rather than to whichever
 * model happened to answer first.
 */
function pickSuggestedAction(answered: ModelOpinion[]): string {
  const withAction = answered.filter((o) => o.suggestedAction);
  if (!withAction.length) return "";

  const tally = new Map<string, { text: string; votes: number; confidence: number }>();
  for (const opinion of withAction) {
    const key = opinion.suggestedAction.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const entry = tally.get(key);
    if (entry) {
      entry.votes += 1;
      entry.confidence = Math.max(entry.confidence, opinion.confidence);
    } else {
      tally.set(key, {
        text: opinion.suggestedAction,
        votes: 1,
        confidence: opinion.confidence,
      });
    }
  }

  return [...tally.values()].sort(
    (a, b) => b.votes - a.votes || b.confidence - a.confidence,
  )[0].text;
}

/** One-line summary for traces and the channel receipt. */
export function summarizeVerdict(verdict: CouncilVerdict): string {
  const parts = [
    `${verdict.seated.length} seated`,
    `${verdict.consensus.length} agreed`,
    `${verdict.dissent.length} contested`,
  ];
  if (verdict.abstained.length) {
    parts.push(`${verdict.abstained.length} abstained`);
  }
  if (verdict.cached) parts.push("replayed from cache");
  if (verdict.unverified) parts.push("unverified (no quorum)");
  return parts.join(" · ");
}

/**
 * True when a human must decide before the agent posts.
 *
 * Only genuine disagreement escalates. A verdict that merely lacks quorum — which
 * is the normal state whenever Agent Router has GPT and Opus rationed — proceeds,
 * labelled unverified. Pausing on a thin council would make the agent less
 * capable than a single model was, and would put an approval gate in front of
 * every ordinary stand-up. Set COUNCIL_HITL_ON_UNVERIFIED=1 for the stricter
 * posture where nothing uncorroborated is ever posted unattended.
 */
export function needsHuman(verdict: CouncilVerdict): boolean {
  if (verdict.dissent.length > 0) return true;
  if (!verdict.unverified) return false;
  loadRuntimeEnv();
  return /^(1|true|yes|on)$/i.test(process.env.COUNCIL_HITL_ON_UNVERIFIED ?? "");
}

/**
 * Hands the council's findings to the model driving the tool loop, so it acts on
 * what was agreed instead of re-deriving the cross-reference on its own. Contested
 * claims are named but explicitly fenced off.
 */
export function renderVerdictBlock(verdict: CouncilVerdict): string {
  const lines: string[] = ["<council>"];
  lines.push(
    `  <seats answered="${verdict.seated.join(",") || "none"}" cached="${verdict.cached}" />`,
  );

  if (verdict.abstained.length) {
    for (const a of verdict.abstained) {
      lines.push(`  <abstained seat="${a.seat}">${a.reason}</abstained>`);
    }
  }

  lines.push("  <agreed>");
  for (const claim of verdict.consensus) {
    lines.push(
      `    <dependency waiter="${claim.dependency.waiter}" blocker="${claim.dependency.blocker}" artifact="${claim.dependency.artifact}" votes="${claim.agreedBy.length}" />`,
    );
  }
  lines.push("  </agreed>");

  if (verdict.dissent.length) {
    lines.push("  <contested>");
    for (const claim of verdict.dissent) {
      lines.push(
        `    <dependency waiter="${claim.dependency.waiter}" blocker="${claim.dependency.blocker}" artifact="${claim.dependency.artifact}" agreed_by="${claim.agreedBy.join(",")}" />`,
      );
    }
    lines.push("  </contested>");
    lines.push(
      "  <instruction>Do not state a contested dependency as fact. A human is deciding it.</instruction>",
    );
  }

  if (verdict.suggestedAction) {
    lines.push(`  <suggested_action>${verdict.suggestedAction}</suggested_action>`);
  }
  if (verdict.unverified) {
    lines.push(
      "  <instruction>Fewer than two models answered, so nothing here was corroborated. Say so rather than implying consensus.</instruction>",
    );
  }
  lines.push("</council>");
  return lines.join("\n");
}
