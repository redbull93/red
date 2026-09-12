import { openaiToolDefinitions } from "@red/mcp-tools";
import { recordUsage, recordStubUsage } from "./usage";
import { loadRuntimeEnv } from "./runtime-env";
import {
  callModel,
  describeFailure,
  hasRouterKey,
  modelForSeat,
  type SeatId,
} from "./router";

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  name?: string;
  /**
   * Set on an assistant message when tool results follow it. Strict providers
   * reject a `tool` message that does not answer a preceding `tool_calls`.
   */
  toolCalls?: PlannedTool[];
  /** DeepSeek thinking mode requires its own reasoning back on the next turn. */
  reasoning?: string;
};

export type PlannedTool = {
  id: string;
  name: string;
  args: Record<string, unknown>;
};

export type LlmTurn = {
  text: string;
  toolCalls: PlannedTool[];
  stub: boolean;
  /** Which model actually drove this turn, for the trace. */
  model?: string;
  /** DeepSeek v4 exposes its chain of thought; useful trace material. */
  reasoning?: string;
};

export type TurnContext = {
  runId: string;
  turnIndex: number;
  orgId?: string;
  userId?: string;
};

type ChatCompletion = {
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: Array<{
        id: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

export function hasModelKey() {
  loadRuntimeEnv();
  return Boolean(
    process.env.AGENT_ROUTER_API_KEY ||
      process.env.OPENAI_API_KEY ||
      process.env.OPENROUTER_API_KEY ||
      process.env.AI_GATEWAY_API_KEY ||
      process.env.MODEL_API_KEY,
  );
}

export async function completePlain(
  system: string,
  user: string,
): Promise<string | null> {
  if (!hasModelKey()) return null;

  const openRouter = Boolean(process.env.OPENROUTER_API_KEY);
  const url = openRouter
    ? "https://openrouter.ai/api/v1/chat/completions"
    : `${process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1"}/chat/completions`;
  const key =
    process.env.OPENROUTER_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.AI_GATEWAY_API_KEY ||
    process.env.MODEL_API_KEY;
  const model = openRouter
    ? process.env.OPENROUTER_MODEL || "openai/gpt-4.1-mini"
    : process.env.OPENAI_MODEL || "gpt-4.1-mini";

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      ...(openRouter
        ? {
            "HTTP-Referer": "https://github.com/redbull93/red",
            "X-Title": "red environment-first kit",
          }
        : {}),
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!response.ok) return null;
  const json = (await response.json()) as ChatCompletion;
  const text = json.choices?.[0]?.message?.content?.trim();
  return text || null;
}

/**
 * The seat that drives the tool loop. Defaults to DeepSeek because it is the one
 * seat outside Agent Router's daily rationing, so the loop keeps working when GPT
 * and Opus return 402. Override with ROUTER_DRIVER_SEAT.
 */
function driverSeat(): SeatId {
  loadRuntimeEnv();
  const raw = (process.env.ROUTER_DRIVER_SEAT || "deepseek").toLowerCase();
  return raw === "gpt" || raw === "opus" ? raw : "deepseek";
}

export async function completeTurn(
  messages: ChatMessage[],
  ctx?: TurnContext,
): Promise<LlmTurn> {
  loadRuntimeEnv();

  // Agent Router is the primary gateway. It wins over a direct OpenAI key
  // because it is where the three council models live.
  if (hasRouterKey()) {
    return routerTurn(messages, ctx);
  }

  let model = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
  const apiKey =
    process.env.OPENAI_API_KEY ??
    process.env.OPENROUTER_API_KEY ??
    process.env.AI_GATEWAY_API_KEY ??
    process.env.MODEL_API_KEY;

  if (!apiKey) {
    if (ctx) {
      recordStubUsage(ctx.runId, ctx.turnIndex, {
        orgId: ctx.orgId,
        userId: ctx.userId,
      });
    }
    return stubTurn(messages);
  }

  const openRouter = Boolean(process.env.OPENROUTER_API_KEY);
  const baseURL = openRouter
    ? "https://openrouter.ai/api/v1"
    : (process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1");

  if (openRouter && !model.includes("/")) {
    model = `openai/${model}`;
  }

  const response = await fetch(`${baseURL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      tools: openaiToolDefinitions(),
      tool_choice: "auto",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
  }

  const json = (await response.json()) as ChatCompletion;
  const choice = json.choices?.[0];
  const message = choice?.message;
  const toolCalls: PlannedTool[] = (message?.tool_calls ?? []).map((call) => {
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(call.function?.arguments || "{}") as Record<
        string,
        unknown
      >;
    } catch {
      args = {};
    }
    return {
      id: call.id,
      name: call.function?.name ?? "unknown",
      args,
    };
  });

  // Record token usage
  if (ctx && json.usage) {
    recordUsage(ctx.runId, ctx.turnIndex, model, json.usage, {
      orgId: ctx.orgId,
      userId: ctx.userId,
    });
  }

  return {
    text: message?.content ?? "",
    toolCalls,
    stub: false,
  };
}

/**
 * Drives one tool-calling turn through Agent Router.
 *
 * When the gateway refuses — most often a 402 because the model's daily batch is
 * drained — we fall back to the stub rather than throwing, so the loop stays
 * demonstrable. The reason is prefixed onto the text so nobody mistakes a stub
 * for a live model.
 */
async function routerTurn(
  messages: ChatMessage[],
  ctx?: TurnContext,
): Promise<LlmTurn> {
  const seat = driverSeat();
  const model = modelForSeat(seat);

  const result = await callModel({
    model,
    messages,
    tools: openaiToolDefinitions(),
  });

  if (!result.ok) {
    if (ctx) {
      recordStubUsage(ctx.runId, ctx.turnIndex, {
        orgId: ctx.orgId,
        userId: ctx.userId,
      });
    }
    const stub = stubTurn(messages);
    return {
      ...stub,
      text: `[${model} unavailable: ${describeFailure(result.failure)}]\n${stub.text}`,
    };
  }

  if (ctx && result.usage) {
    recordUsage(ctx.runId, ctx.turnIndex, result.model, result.usage, {
      orgId: ctx.orgId,
      userId: ctx.userId,
    });
  }

  return {
    text: result.text,
    toolCalls: result.toolCalls,
    stub: false,
    model: result.model,
    reasoning: result.reasoning,
  };
}

function stubTurn(messages: ChatMessage[]): LlmTurn {
  // Scan every user message rather than only the last one: the loop now appends a
  // council block after the environment block, so the channel id and the
  // force_fail / require_hitl flags are no longer guaranteed to be in the final
  // message.
  const body = messages
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .join("\n");
  const forceFail = /(?:^|\n)\s*force_fail:\s*true/.test(body);
  const requireHitl = /(?:^|\n)\s*require_hitl:\s*true/.test(body);
  const channel =
    body.match(/<channel id="([^"]+)"/)?.[1] ?? "fixture-thread";

  if (messages.some((m) => m.role === "tool")) {
    const toolPayloads = messages.filter((m) => m.role === "tool");
    const last = toolPayloads.at(-1)?.content ?? "";
    const failed = last.includes('"ok":false') || last.includes('"ok": false');
    if (failed && !toolPayloads.some((t) => t.name === "health.retry")) {
      return {
        text: "The act failed. I am signaling a retry. You can stop me.",
        toolCalls: [
          {
            id: "stub_retry",
            name: "health.retry",
            args: { jobHint: channel },
          },
        ],
        stub: true,
      };
    }
    if (
      last.includes("world.act") &&
      last.includes("receiptId") &&
      !toolPayloads.some((t) => t.content.includes("environment.receipt"))
    ) {
      const receiptId = last.match(/"receiptId":"([^"]+)"/)?.[1] ?? "";
      return {
        text: "Posting the stand-up summary back to the team channel.",
        toolCalls: [
          {
            id: "stub_receipt",
            name: "environment.receipt",
            args: {
              channelId: channel,
              body: [
                "*Stand-up summary*",
                "",
                "Dashboard is blocked on API docs. Brian finished the endpoint but has not shared docs with Eugene.",
                "*Suggested action:* Brian → send API docs to Eugene.",
                "Amina is on track.",
              ].join("\n"),
              receiptId,
            },
          },
        ],
        stub: true,
      };
    }
    return {
      text: "Stand-up closed. Summary is in the channel. I will not open a new chat.",
      toolCalls: [],
      stub: true,
    };
  }

  if (forceFail) {
    return {
      text: "Demo failure path. Calling health.fail.",
      toolCalls: [
        {
          id: "stub_fail",
          name: "health.fail",
          args: { reason: "Synthetic failure for the demo path" },
        },
      ],
      stub: true,
    };
  }

  if (requireHitl) {
    return {
      text: "Suggested action would @ Brian. Pausing for approval before I post.",
      toolCalls: [],
      stub: true,
    };
  }

  return {
    text: "Cross-referenced updates. Hidden dependency: Eugene ↔ Brian. Posting summary.",
    toolCalls: [
      {
        id: "stub_act",
        name: "world.act",
        args: {
          kind: "standup.summary",
          summary:
            "Dashboard blocked on API docs. Brian finished endpoint; has not shared docs with Eugene. Suggested: Brian → send API docs to Eugene. Amina on track.",
          payload: {
            suggestedAction: "Brian → send API docs to Eugene",
            blockers: ["eugene→brian:api-docs"],
          },
        },
      },
    ],
    stub: true,
  };
}
