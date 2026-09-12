import type { Actor, BlockerRecord } from "./types";

// ── Blocker Ledger (globalThis singleton, same pattern as store.ts) ──

const LEDGER_KEY = "__red_blocker_ledger__";

type BlockerLedger = Map<string, BlockerRecord>;

function getLedger(): BlockerLedger {
  const g = globalThis as typeof globalThis & { [LEDGER_KEY]?: BlockerLedger };
  if (!g[LEDGER_KEY]) g[LEDGER_KEY] = new Map();
  return g[LEDGER_KEY];
}

function blockerKey(from: string, to: string): string {
  return `${from.toLowerCase()}→${to.toLowerCase()}`;
}

// ── Blocker extraction ────────────────────────────────────────────

/**
 * Simple heuristic patterns that detect "A blocked on B" relationships
 * from free-text stand-up replies. Not LLM-based — fast and deterministic.
 */
const BLOCKER_PATTERNS: RegExp[] = [
  // "Can't finish X until I get Y from Brian"
  /(\w+):\s*[^.]*(?:blocked|waiting|can'?t finish|stuck|need)[^.]*(?:from|on|by)\s+(\w+)/gi,
  // "waiting on Brian" / "blocked by Brian"
  /(\w+):\s*[^.]*(?:waiting on|blocked by|depends on|need(?:s)? from)\s+(\w+)/gi,
];

type ExtractedBlocker = {
  from: string;
  to: string;
  context: string;
};

/**
 * Extracts blocker relationships from signal text by matching names
 * against known actors in the event.
 */
export function extractBlockers(
  signalBody: string,
  actors: Actor[],
): ExtractedBlocker[] {
  const actorIds = new Set(actors.map((a) => a.id.toLowerCase()));
  const actorNames = new Set(actors.map((a) => a.id)); // Original casing
  const found: ExtractedBlocker[] = [];
  const seen = new Set<string>();

  for (const pattern of BLOCKER_PATTERNS) {
    // Reset lastIndex for global regex
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(signalBody)) !== null) {
      const fromRaw = match[1]?.trim();
      const toRaw = match[2]?.trim();
      if (!fromRaw || !toRaw) continue;

      const fromLower = fromRaw.toLowerCase();
      const toLower = toRaw.toLowerCase();

      // Both parties must be known actors
      if (!actorIds.has(fromLower) || !actorIds.has(toLower)) continue;
      // No self-blocks
      if (fromLower === toLower) continue;

      const key = blockerKey(fromLower, toLower);
      if (seen.has(key)) continue;
      seen.add(key);

      // Use original casing from actor list
      const from = [...actorNames].find((n) => n.toLowerCase() === fromLower) ?? fromRaw;
      const to = [...actorNames].find((n) => n.toLowerCase() === toLower) ?? toRaw;

      found.push({
        from,
        to,
        context: match[0].trim(),
      });
    }
  }

  return found;
}

// ── Public API ────────────────────────────────────────────────────

/**
 * Record blocker relationships from a run's signal text.
 * Upserts into the global ledger and increments streaks for recurring blockers.
 */
export function recordBlockers(
  runId: string,
  channelId: string,
  actors: Actor[],
  signalBody: string,
): BlockerRecord[] {
  const ledger = getLedger();
  const now = new Date().toISOString();
  const extracted = extractBlockers(signalBody, actors);
  const recorded: BlockerRecord[] = [];

  for (const { from, to, context } of extracted) {
    const key = `${channelId}:${blockerKey(from, to)}`;
    const existing = ledger.get(key);

    if (existing && !existing.resolved) {
      // Recurring blocker — bump streak
      existing.lastSeen = now;
      existing.streak += 1;
      if (!existing.runIds.includes(runId)) {
        existing.runIds.push(runId);
      }
      recorded.push(existing);
    } else {
      // New blocker
      const record: BlockerRecord = {
        from,
        to,
        topic: context,
        channelId,
        firstSeen: now,
        lastSeen: now,
        runIds: [runId],
        streak: 1,
        resolved: false,
      };
      ledger.set(key, record);
      recorded.push(record);
    }
  }

  return recorded;
}

/**
 * Returns all unresolved blockers for a channel that have appeared in ≥2 runs.
 */
export function getRecurringBlockers(channelId: string): BlockerRecord[] {
  const ledger = getLedger();
  const recurring: BlockerRecord[] = [];

  for (const record of ledger.values()) {
    if (
      record.channelId === channelId &&
      !record.resolved &&
      record.streak >= 2
    ) {
      recurring.push(record);
    }
  }

  return recurring;
}

/**
 * Returns all unresolved blockers for a channel (any streak).
 */
export function getActiveBlockers(channelId: string): BlockerRecord[] {
  const ledger = getLedger();
  const active: BlockerRecord[] = [];

  for (const record of ledger.values()) {
    if (record.channelId === channelId && !record.resolved) {
      active.push(record);
    }
  }

  return active;
}

/**
 * Marks a blocker as resolved. Called when a receipt confirms the action was taken.
 */
export function resolveBlocker(
  channelId: string,
  from: string,
  to: string,
): boolean {
  const ledger = getLedger();
  const key = `${channelId}:${blockerKey(from, to)}`;
  const record = ledger.get(key);
  if (!record || record.resolved) return false;

  record.resolved = true;
  return true;
}

/**
 * Renders an XML memory context block for injection into the LLM prompt.
 * Only includes unresolved blockers so the model can reference prior history.
 */
export function renderMemoryContext(channelId: string): string {
  const active = getActiveBlockers(channelId);
  if (active.length === 0) return "";

  const entries = active.map((b) => {
    const escalation =
      b.streak >= 3
        ? "ESCALATE"
        : b.streak >= 2
          ? "recurring"
          : "new";

    return `    <blocker from="${b.from}" to="${b.to}" streak="${b.streak}" escalation="${escalation}" first_seen="${b.firstSeen}">
      ${b.topic}
    </blocker>`;
  });

  return `<memory>
  <prior_blockers count="${active.length}">
${entries.join("\n")}
  </prior_blockers>
  <instruction>
    If a blocker has escalation="ESCALATE", emphasise urgency in the summary.
    If a blocker from a prior run is now resolved in today's signal, note that it cleared.
  </instruction>
</memory>`;
}

/**
 * Returns all blocker records (for snapshot / dashboard).
 */
export function getAllBlockers(): BlockerRecord[] {
  return [...getLedger().values()];
}
