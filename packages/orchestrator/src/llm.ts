import { openaiToolDefinitions } from "@red/mcp-tools";

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  name?: string;
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
};

export function hasModelKey() {
  return Boolean(process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY);
}

export async function completePlain(
  system: string,
  user: string,
): Promise<string | null> {
  if (!hasModelKey()) return null;

  const openRouter = Boolean(process.env.OPENROUTER_API_KEY);
  const url = openRouter
    ? "https://openrouter.ai/api/v1/chat/completions"
    : "https://api.openai.com/v1/chat/completions";
  const key = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
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

export async function completeTurn(messages: ChatMessage[]): Promise<LlmTurn> {
  if (!hasModelKey()) {
    return stubTurn(messages);
  }

  const openRouter = Boolean(process.env.OPENROUTER_API_KEY);
  const url = openRouter
    ? "https://openrouter.ai/api/v1/chat/completions"
    : "https://api.openai.com/v1/chat/completions";
  const key = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
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
      messages: messages.map((m) => {
        if (m.role === "tool") {
          return {
            role: "tool",
            tool_call_id: m.tool_call_id,
            content: m.content,
          };
        }
        return { role: m.role, content: m.content };
      }),
      tools: openaiToolDefinitions(),
      tool_choice: "auto",
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`LLM ${response.status}: ${detail.slice(0, 400)}`);
  }

  const json = (await response.json()) as ChatCompletion;
  const message = json.choices?.[0]?.message;
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

  return {
    text: message?.content ?? "",
    toolCalls,
    stub: false,
  };
}

function statusReceiptFromSignal(body: string): string {
  const signal =
    body.match(/<signal type="channel.status">([\s\S]*?)<\/signal>/)?.[1] ??
    "";
  const lines = signal
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("Someone asked"));
  if (lines.length === 0 || /no recent human messages/i.test(signal)) {
    return "This channel is quiet — no recent human messages to read.";
  }
  const latest = new Map<string, string>();
  for (const line of lines) {
    const match = line.match(/^([^:]+):\s*(.+)$/);
    if (match) latest.set(match[1], match[2].slice(0, 220));
  }
  if (latest.size === 0) {
    return "I read this channel but could not parse a project status yet.";
  }
  return [
    "*Project status from this channel*",
    "",
    ...[...latest.entries()].map(([name, text]) => `• *${name}:* ${text}`),
  ].join("\n");
}

function stubTurn(messages: ChatMessage[]): LlmTurn {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const body = lastUser?.content ?? "";
  const forceFail = /(?:^|\n)\s*force_fail:\s*true/.test(body);
  const requireHitl = /(?:^|\n)\s*require_hitl:\s*true/.test(body);
  const channel =
    body.match(/<channel id="([^"]+)"/)?.[1] ?? "fixture-thread";
  const signalType = body.match(/<signal type="([^"]+)">/)?.[1];

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
      const statusBody =
        signalType === "channel.status" ? statusReceiptFromSignal(body) : "";
      return {
        text:
          signalType === "channel.status"
            ? "Posting the channel status back to the team."
            : "Posting the stand-up summary back to the team channel.",
        toolCalls: [
          {
            id: "stub_receipt",
            name: "environment.receipt",
            args: {
              channelId: channel,
              body:
                statusBody ||
                [
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

  if (signalType === "channel.status") {
    const summary = statusReceiptFromSignal(body);
    return {
      text: "Read the channel transcript. Posting current project status.",
      toolCalls: [
        {
          id: "stub_status_act",
          name: "world.act",
          args: {
            kind: "channel.status",
            summary,
          },
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
