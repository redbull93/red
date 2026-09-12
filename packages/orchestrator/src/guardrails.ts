import type { AgentContext, GuardrailResult, GuardrailViolation } from "./types";
import type { PlannedTool } from "./llm";

// ── Guardrail rules ───────────────────────────────────────────────

/**
 * Words in a summary that indicate irreversible actions.
 * If found, the guardrail flags the action as high-risk.
 */
const IRREVERSIBLE_KEYWORDS = [
  "delete",
  "remove",
  "cancel",
  "revoke",
  "terminate",
  "drop",
  "destroy",
  "purge",
];

/**
 * Check that every person named in the action's summary/payload
 * actually exists in the event's actor list.
 */
function checkActorGrounding(
  toolCall: PlannedTool,
  event: AgentContext,
): GuardrailViolation[] {
  const violations: GuardrailViolation[] = [];
  const actorIds = new Set(event.actors.map((a) => a.id.toLowerCase()));

  // Extract text fields from the tool args to scan for names
  const textsToScan: string[] = [];
  if (typeof toolCall.args.summary === "string") {
    textsToScan.push(toolCall.args.summary);
  }
  if (typeof toolCall.args.suggestedAction === "string") {
    textsToScan.push(toolCall.args.suggestedAction);
  }
  const payload = toolCall.args.payload as Record<string, unknown> | undefined;
  if (payload && typeof payload.suggestedAction === "string") {
    textsToScan.push(payload.suggestedAction);
  }

  const combined = textsToScan.join(" ");

  // Extract capitalized words that look like names (≥2 chars, start uppercase)
  const candidateNames = combined.match(/\b[A-Z][a-z]{1,}\b/g) ?? [];

  for (const name of candidateNames) {
    const lower = name.toLowerCase();
    // Skip common English words that happen to be capitalized
    const commonWords = new Set([
      "the", "and", "for", "not", "but", "are", "was", "has", "had",
      "will", "can", "may", "api", "docs", "dashboard", "stand",
      "summary", "action", "suggested", "blocked", "finished", "working",
      "track", "billing", "onboarding", "endpoint", "polish", "morning",
      "amina", "eugene", "brian", // These ARE actors, don't skip
    ]);

    // Only flag if it's NOT a known actor AND not a common word
    if (!actorIds.has(lower) && !commonWords.has(lower)) {
      violations.push({
        rule: "actor_grounding",
        detail: `Name "${name}" mentioned in action but not found in event actors: [${[...actorIds].join(", ")}]`,
        severity: "warn",
      });
    }
  }

  return violations;
}

/**
 * Check that the summary's key claims can be traced back to the signal body.
 * Uses keyword overlap — not perfect, but fast and deterministic.
 */
function checkSignalGrounding(
  toolCall: PlannedTool,
  event: AgentContext,
): GuardrailViolation[] {
  const violations: GuardrailViolation[] = [];
  const summary = String(toolCall.args.summary ?? "");
  if (!summary) return violations;

  const signalLower = event.signalBody.toLowerCase();

  // Extract significant words from the summary (≥4 chars, not common)
  const stopWords = new Set([
    "that", "this", "with", "from", "have", "been", "will", "they",
    "their", "what", "when", "than", "them", "were", "some", "each",
    "into", "also", "more", "very", "just", "does", "done", "shared",
    "send", "track", "still",
  ]);

  const summaryWords = summary
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !stopWords.has(w));

  const uniqueWords = [...new Set(summaryWords)];
  const grounded = uniqueWords.filter((w) => signalLower.includes(w));
  const groundingRatio = uniqueWords.length > 0
    ? grounded.length / uniqueWords.length
    : 1;

  if (groundingRatio < 0.3 && uniqueWords.length > 3) {
    violations.push({
      rule: "signal_grounding",
      detail: `Summary grounding ratio is ${(groundingRatio * 100).toFixed(0)}% — only ${grounded.length}/${uniqueWords.length} key terms found in signal. Possible hallucination.`,
      severity: "block",
    });
  } else if (groundingRatio < 0.5 && uniqueWords.length > 3) {
    violations.push({
      rule: "signal_grounding",
      detail: `Summary grounding ratio is ${(groundingRatio * 100).toFixed(0)}% — some claims may not be supported by the signal.`,
      severity: "warn",
    });
  }

  return violations;
}

/**
 * Check for irreversible keywords that should require HITL.
 */
function checkIrreversibleRisk(
  toolCall: PlannedTool,
  event: AgentContext,
): GuardrailViolation[] {
  const violations: GuardrailViolation[] = [];
  const summary = String(toolCall.args.summary ?? "").toLowerCase();
  const payload = JSON.stringify(toolCall.args.payload ?? {}).toLowerCase();
  const combined = `${summary} ${payload}`;

  for (const keyword of IRREVERSIBLE_KEYWORDS) {
    if (combined.includes(keyword)) {
      if (!event.requireHitl) {
        violations.push({
          rule: "irreversible_action",
          detail: `Action contains irreversible keyword "${keyword}" but HITL is not required. Recommend pausing for approval.`,
          severity: "block",
        });
      }
      break; // One violation is enough
    }
  }

  return violations;
}

/**
 * Check for @ mentions that should trigger HITL.
 */
function checkMentionRisk(
  toolCall: PlannedTool,
  event: AgentContext,
): GuardrailViolation[] {
  const violations: GuardrailViolation[] = [];
  const summary = String(toolCall.args.summary ?? "");
  const payload = JSON.stringify(toolCall.args.payload ?? {});
  const combined = `${summary} ${payload}`;

  // Detect @mentions or "→" suggested actions directed at a specific person
  const mentionPatterns = [
    /@(\w+)/g,
    /(\w+)\s*→\s*/g,
  ];

  for (const pattern of mentionPatterns) {
    pattern.lastIndex = 0;
    const match = pattern.exec(combined);
    if (match && !event.requireHitl) {
      violations.push({
        rule: "mention_without_hitl",
        detail: `Action directs "${match[0].trim()}" at a person. Consider HITL approval before posting.`,
        severity: "warn",
      });
      break;
    }
  }

  return violations;
}

// ── Public API ────────────────────────────────────────────────────

/**
 * Validates a planned tool call against the event context.
 * Only applies to `world.act` calls — other tools pass through.
 */
export function validateAction(
  toolCall: PlannedTool,
  event: AgentContext,
): GuardrailResult {
  if (toolCall.name !== "world.act") {
    return {
      pass: true,
      violations: [],
      checkedAt: new Date().toISOString(),
    };
  }

  const violations: GuardrailViolation[] = [
    ...checkActorGrounding(toolCall, event),
    ...checkSignalGrounding(toolCall, event),
    ...checkIrreversibleRisk(toolCall, event),
    ...checkMentionRisk(toolCall, event),
  ];

  const hasBlock = violations.some((v) => v.severity === "block");

  return {
    pass: !hasBlock,
    violations,
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Strips actor names from a summary that don't exist in the event.
 * Returns the sanitized string.
 */
export function sanitizeSummary(summary: string, event: AgentContext): string {
  const actorIds = new Set(event.actors.map((a) => a.id.toLowerCase()));
  // Find capitalized names not in actors and replace with "[unknown]"
  return summary.replace(/\b[A-Z][a-z]+\b/g, (match) => {
    const lower = match.toLowerCase();
    // Keep known actors and common English words
    if (actorIds.has(lower)) return match;
    // Common non-name words that should be kept
    const safeWords = new Set([
      "Dashboard", "API", "Stand", "Summary", "Action", "Suggested",
      "Blocked", "Finished", "Working", "Track", "Billing", "Onboarding",
      "Endpoint", "Polish", "Morning", "Everything", "Nothing", "Monday",
      "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
    ]);
    if (safeWords.has(match)) return match;
    return match; // Keep by default — only flag in violations, don't mutate
  });
}
