import type { UsageRecord } from "./types";

// ── Usage Store (globalThis singleton) ────────────────────────────

const USAGE_KEY = "__red_usage_store__";

function getUsageStore(): UsageRecord[] {
  const g = globalThis as typeof globalThis & { [USAGE_KEY]?: UsageRecord[] };
  if (!g[USAGE_KEY]) g[USAGE_KEY] = [];
  return g[USAGE_KEY];
}

// ── Cost estimation ───────────────────────────────────────────────

/**
 * Rough per-token pricing for common models (USD per 1K tokens).
 * Updated for mid-2026 pricing. Add models as needed.
 */
const PRICING: Record<string, { prompt: number; completion: number }> = {
  "gpt-4.1-mini": { prompt: 0.0004, completion: 0.0016 },
  "gpt-4.1": { prompt: 0.002, completion: 0.008 },
  "gpt-4o-mini": { prompt: 0.00015, completion: 0.0006 },
  "gpt-4o": { prompt: 0.005, completion: 0.015 },
  "openai/gpt-4.1-mini": { prompt: 0.0004, completion: 0.0016 },
  "openai/gpt-4.1": { prompt: 0.002, completion: 0.008 },
  "openai/gpt-4o-mini": { prompt: 0.00015, completion: 0.0006 },
  "openai/gpt-4o": { prompt: 0.005, completion: 0.015 },
};

const DEFAULT_PRICING = { prompt: 0.001, completion: 0.003 };

function estimateCost(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const pricing = PRICING[model] ?? DEFAULT_PRICING;
  return (
    (promptTokens / 1000) * pricing.prompt +
    (completionTokens / 1000) * pricing.completion
  );
}

// ── Public API ────────────────────────────────────────────────────

/**
 * Records token usage from an LLM API response.
 *
 * @param runId - The run this turn belongs to.
 * @param turnIndex - Which turn in the loop (0-based).
 * @param model - Model identifier string.
 * @param usage - The `usage` object from the API response.
 */
export function recordUsage(
  runId: string,
  turnIndex: number,
  model: string,
  usage: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  },
): UsageRecord {
  const promptTokens = usage.prompt_tokens ?? 0;
  const completionTokens = usage.completion_tokens ?? 0;
  const totalTokens = usage.total_tokens ?? promptTokens + completionTokens;

  const record: UsageRecord = {
    runId,
    turnIndex,
    model,
    promptTokens,
    completionTokens,
    totalTokens,
    estimatedCostUsd: estimateCost(model, promptTokens, completionTokens),
    stub: false,
    at: new Date().toISOString(),
  };

  getUsageStore().push(record);
  return record;
}

/**
 * Records a stub turn (no API call). Tracks that the turn happened
 * but consumed zero tokens.
 */
export function recordStubUsage(runId: string, turnIndex: number): UsageRecord {
  const record: UsageRecord = {
    runId,
    turnIndex,
    model: "stub",
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
    stub: true,
    at: new Date().toISOString(),
  };

  getUsageStore().push(record);
  return record;
}

/**
 * Returns aggregated usage for a specific run.
 */
export function getRunUsage(runId: string): {
  turns: UsageRecord[];
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  totalCostUsd: number;
  model: string;
} {
  const turns = getUsageStore().filter((r) => r.runId === runId);

  return {
    turns,
    totalPromptTokens: turns.reduce((s, t) => s + t.promptTokens, 0),
    totalCompletionTokens: turns.reduce((s, t) => s + t.completionTokens, 0),
    totalTokens: turns.reduce((s, t) => s + t.totalTokens, 0),
    totalCostUsd: turns.reduce((s, t) => s + t.estimatedCostUsd, 0),
    model: turns.find((t) => !t.stub)?.model ?? "stub",
  };
}

/**
 * Returns all usage records across all runs.
 */
export function getAllUsage(): UsageRecord[] {
  return [...getUsageStore()];
}
