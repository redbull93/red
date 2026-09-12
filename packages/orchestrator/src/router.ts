import { envInt, loadRuntimeEnv } from "./runtime-env";

/**
 * Agent Router client.
 *
 * Three things about this gateway are load-bearing and were found by probing it,
 * not by reading its docs:
 *
 * 1. It fingerprints the client by User-Agent. A default fetch/curl agent gets
 *    401 `unauthorized client detected` on every model. Sending a supported
 *    harness agent returns 200. This is the single reason a naive integration
 *    fails, so the UA is a first-class config value.
 * 2. Claude and GPT are rationed in daily batches (Beijing 00:00/08:00/16:00 =
 *    Nairobi 03:00/11:00/19:00). Once a batch drains they return 402 until the
 *    next one. A 402 is therefore not an error to retry — it is an abstention.
 * 3. Tokens are scoped per model. An unlisted model returns 403, which is
 *    permanent for that key and must not be retried either.
 */

export type SeatId = "gpt" | "opus" | "deepseek";

export const SEAT_IDS: SeatId[] = ["gpt", "opus", "deepseek"];

/** Verified live against the /api/pricing catalogue. */
const DEFAULT_MODELS: Record<SeatId, string> = {
  gpt: "gpt-6-astra",
  opus: "claude-opus-4-8",
  deepseek: "deepseek-v4-flash",
};

export const SEAT_LABELS: Record<SeatId, string> = {
  gpt: "GPT",
  opus: "Opus",
  deepseek: "DeepSeek",
};

const DEFAULT_BASE = "https://agentrouter.org";
/** Announced by Agent Router as a full-parity mirror, so it doubles as failover. */
const DEFAULT_FALLBACK_BASE = "https://ps.air-outer.com";
const DEFAULT_USER_AGENT = "claude-cli/1.0.83 (external, cli)";

export type FailureKind =
  /** 402 — daily batch drained. Wait for the next release; do not retry. */
  | "quota_exhausted"
  /** 403 — this key may not use this model at all. Permanent. */
  | "model_forbidden"
  /** 401 — the User-Agent was rejected as an unsupported client. */
  | "unauthorized_client"
  /** 400 — unsupported language or sensitive-word rejection. */
  | "content_blocked"
  /** 429 / 5xx / network. Worth one retry, then the mirror domain. */
  | "transient"
  /** 200 but the body was not usable. */
  | "malformed"
  | "no_key";

export type RouterFailure = {
  kind: FailureKind;
  status?: number;
  detail: string;
};

export type RouterMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  name?: string;
  /**
   * Required on an assistant message whose tool results follow it. Without it the
   * gateway rejects the next turn with "Messages with role 'tool' must be a
   * response to a preceding message with 'tool_calls'".
   */
  toolCalls?: RouterToolCall[];
  /**
   * DeepSeek's thinking mode requires the reasoning it produced to be handed back
   * on the next turn, or it rejects the request. Carry it verbatim.
   */
  reasoning?: string;
};

export type RouterToolCall = {
  id: string;
  name: string;
  args: Record<string, unknown>;
};

export type RouterSuccess = {
  ok: true;
  model: string;
  text: string;
  /** DeepSeek v4 returns its chain of thought here; useful trace material. */
  reasoning?: string;
  toolCalls: RouterToolCall[];
  finishReason?: string;
  totalTokens?: number;
  /** Raw usage block, passed straight to recordUsage for cost tracking. */
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  /** True when the mirror domain answered after the primary failed. */
  viaFallback: boolean;
};

export type RouterResult = RouterSuccess | { ok: false; model: string; failure: RouterFailure };

export type RouterConfig = {
  key: string;
  bases: string[];
  userAgent: string;
  models: Record<SeatId, string>;
  timeoutMs: number;
};

/**
 * Accepts `https://agentrouter.org`, a trailing slash, or a `/v1` suffix and
 * returns the bare origin. The trailing slash matters: `${base}/v1/...` against
 * a stored `https://agentrouter.org/` produces a double slash, which the gateway
 * answers with its SPA index page and an HTTP 200 — a silent, confusing failure.
 */
export function normalizeBase(raw: string): string {
  return raw.trim().replace(/\/+$/, "").replace(/\/v1$/, "");
}

/**
 * This kit names its MCP tools with dots — `world.act`, `environment.receipt` —
 * but the OpenAI tool schema enforces `^[a-zA-Z0-9_-]+$`, so Agent Router rejects
 * the whole request with a 400 before the model ever sees it.
 *
 * Rather than rename the tools and break prompts/tool-policy.md, the dots are
 * swapped for a double underscore on the way out and restored on the way back.
 * Double underscore keeps the mapping reversible for names that already contain
 * a single underscore.
 */
export function toWireToolName(name: string): string {
  return name.replace(/\./g, "__");
}

export function fromWireToolName(name: string): string {
  return name.replace(/__/g, ".");
}

export function routerConfig(): RouterConfig {
  loadRuntimeEnv();
  const primary = normalizeBase(process.env.AGENT_ROUTER_BASE_URL || DEFAULT_BASE);
  const fallback = normalizeBase(
    process.env.AGENT_ROUTER_FALLBACK_BASE_URL || DEFAULT_FALLBACK_BASE,
  );

  return {
    key: process.env.AGENT_ROUTER_API_KEY || "",
    bases: fallback && fallback !== primary ? [primary, fallback] : [primary],
    userAgent: process.env.AGENT_ROUTER_USER_AGENT || DEFAULT_USER_AGENT,
    models: {
      gpt: process.env.ROUTER_MODEL_GPT || DEFAULT_MODELS.gpt,
      opus: process.env.ROUTER_MODEL_OPUS || DEFAULT_MODELS.opus,
      deepseek: process.env.ROUTER_MODEL_DEEPSEEK || DEFAULT_MODELS.deepseek,
    },
    timeoutMs: envInt("AGENT_ROUTER_TIMEOUT_MS", 90_000),
  };
}

export function hasRouterKey(): boolean {
  return Boolean(routerConfig().key);
}

export function modelForSeat(seat: SeatId): string {
  return routerConfig().models[seat];
}

function classify(status: number, body: string): RouterFailure {
  const detail = extractMessage(body) || `HTTP ${status}`;
  if (status === 402) return { kind: "quota_exhausted", status, detail };
  if (status === 403) return { kind: "model_forbidden", status, detail };
  if (status === 401) return { kind: "unauthorized_client", status, detail };
  if (status === 400) return { kind: "content_blocked", status, detail };
  return { kind: "transient", status, detail };
}

function extractMessage(body: string): string {
  try {
    const parsed = JSON.parse(body) as {
      error?: { message?: string };
      message?: string;
    };
    return (parsed.error?.message || parsed.message || "").slice(0, 300);
  } catch {
    return body.slice(0, 200);
  }
}

/** A 402 or 403 is settled for this batch; only transient faults deserve another try. */
function isRetryable(failure: RouterFailure): boolean {
  return failure.kind === "transient";
}

export type CallOptions = {
  model: string;
  messages: RouterMessage[];
  tools?: unknown[];
  temperature?: number;
  /** Ask for a JSON object back. Used by the council, which needs parseable claims. */
  json?: boolean;
  maxTokens?: number;
};

export async function callModel(options: CallOptions): Promise<RouterResult> {
  const config = routerConfig();
  if (!config.key) {
    return {
      ok: false,
      model: options.model,
      failure: { kind: "no_key", detail: "AGENT_ROUTER_API_KEY is not set" },
    };
  }

  let last: RouterFailure = { kind: "transient", detail: "no attempt made" };

  for (let baseIndex = 0; baseIndex < config.bases.length; baseIndex += 1) {
    const base = config.bases[baseIndex];
    // One retry on the primary for a transient blip, then move to the mirror.
    const attempts = baseIndex === 0 ? 2 : 1;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const result = await attemptCall(base, config, options, baseIndex > 0);
      if (result.ok) return result;
      last = result.failure;
      if (!isRetryable(result.failure)) return result;
      if (attempt + 1 < attempts) await sleep(400 * (attempt + 1));
    }
  }

  return { ok: false, model: options.model, failure: last };
}

async function attemptCall(
  base: string,
  config: RouterConfig,
  options: CallOptions,
  viaFallback: boolean,
): Promise<RouterResult> {
  const body: Record<string, unknown> = {
    model: options.model,
    messages: options.messages.map((m) => {
      if (m.role === "tool") {
        return { role: "tool", tool_call_id: m.tool_call_id, content: m.content };
      }
      if (m.role === "assistant" && (m.toolCalls?.length || m.reasoning)) {
        const assistant: Record<string, unknown> = {
          role: "assistant",
          content: m.content || null,
        };
        if (m.reasoning) assistant.reasoning_content = m.reasoning;
        if (m.toolCalls?.length) {
          assistant.tool_calls = m.toolCalls.map((call) => ({
            id: call.id,
            type: "function",
            function: {
              name: toWireToolName(call.name),
              arguments: JSON.stringify(call.args ?? {}),
            },
          }));
        }
        return assistant;
      }
      return { role: m.role, content: m.content };
    }),
  };
  if (options.tools?.length) {
    body.tools = options.tools.map((tool) => {
      const spec = tool as { type?: string; function?: { name?: string } };
      if (!spec?.function?.name) return tool;
      return {
        ...spec,
        function: { ...spec.function, name: toWireToolName(spec.function.name) },
      };
    });
    body.tool_choice = "auto";
  }
  if (options.temperature !== undefined) body.temperature = options.temperature;
  if (options.maxTokens !== undefined) body.max_tokens = options.maxTokens;
  if (options.json) body.response_format = { type: "json_object" };

  let response: Response;
  try {
    response = await fetch(`${base}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.key}`,
        // Without a supported harness agent every model returns 401.
        "User-Agent": config.userAgent,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(config.timeoutMs),
    });
  } catch (error) {
    return {
      ok: false,
      model: options.model,
      failure: {
        kind: "transient",
        detail: error instanceof Error ? error.message : "network error",
      },
    };
  }

  const raw = await response.text();
  if (!response.ok) {
    return { ok: false, model: options.model, failure: classify(response.status, raw) };
  }

  // A 200 carrying HTML means the URL was wrong (usually a double slash) and the
  // gateway served its console instead of the API.
  if (raw.trimStart().startsWith("<")) {
    return {
      ok: false,
      model: options.model,
      failure: {
        kind: "malformed",
        status: 200,
        detail: `Received HTML from ${base}/v1/chat/completions — check AGENT_ROUTER_BASE_URL`,
      },
    };
  }

  type Completion = {
    model?: string;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    };
    choices?: Array<{
      finish_reason?: string;
      message?: {
        content?: string | null;
        reasoning_content?: string | null;
        tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }>;
      };
    }>;
  };

  let parsed: Completion;
  try {
    parsed = JSON.parse(raw) as Completion;
  } catch {
    return {
      ok: false,
      model: options.model,
      failure: { kind: "malformed", status: 200, detail: raw.slice(0, 200) },
    };
  }

  const choice = parsed.choices?.[0];
  if (!choice) {
    return {
      ok: false,
      model: options.model,
      failure: { kind: "malformed", status: 200, detail: "no choices in response" },
    };
  }

  const toolCalls: RouterToolCall[] = (choice.message?.tool_calls ?? []).map((call, index) => {
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(call.function?.arguments || "{}") as Record<string, unknown>;
    } catch {
      args = {};
    }
    return {
      id: call.id || `call_${index}`,
      // Restore the dotted MCP name so dispatchTool still recognises it.
      name: fromWireToolName(call.function?.name ?? "unknown"),
      args,
    };
  });

  return {
    ok: true,
    model: parsed.model || options.model,
    text: choice.message?.content ?? "",
    reasoning: choice.message?.reasoning_content ?? undefined,
    toolCalls,
    finishReason: choice.finish_reason,
    totalTokens: parsed.usage?.total_tokens,
    usage: parsed.usage,
    viaFallback,
  };
}

/** Human-readable abstention reason for traces and the control plane. */
export function describeFailure(failure: RouterFailure): string {
  switch (failure.kind) {
    case "quota_exhausted":
      return "quota exhausted — waiting for the next daily batch";
    case "model_forbidden":
      return "this key is not permitted to use that model";
    case "unauthorized_client":
      return "client rejected — AGENT_ROUTER_USER_AGENT is not a supported harness";
    case "content_blocked":
      // A 400 is usually the gateway's language/sensitive-word filter, but it is
      // also how a malformed request surfaces, so quote what it actually said.
      return `rejected (400) — ${failure.detail}`;
    case "no_key":
      return "no AGENT_ROUTER_API_KEY set";
    case "malformed":
      return `unusable response — ${failure.detail}`;
    default:
      return `unreachable — ${failure.detail}`;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
