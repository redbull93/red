import type { ToolResult, ToolSpec } from "../types";

/**
 * Ambiguous Workspace tools.
 *
 * Ambiguous is a 17-app workspace where every feature has an agent endpoint as
 * well as a human UI, so the agent acts as a real member rather than scraping.
 * See docs/06-ambiguous-setup.md for the credential walkthrough.
 *
 * Every tool degrades to an honest stub when AMBIGUOUS_API_KEY is unset: the call
 * succeeds, the data is clearly marked `stub: true`, and nothing is invented as
 * though it had really landed.
 */

const DEFAULT_BASE = "https://app.ambiguous.ai";

function config(): { key: string; base: string } {
  return {
    key: process.env.AMBIGUOUS_API_KEY || "",
    base: (process.env.AMBIGUOUS_BASE_URL || DEFAULT_BASE).replace(/\/+$/, ""),
  };
}

function stub(tool: string, data: Record<string, unknown>): ToolResult {
  return {
    ok: true,
    tool,
    data: {
      stub: true,
      note: "AMBIGUOUS_API_KEY is not set. The tool ran; the workspace was not contacted.",
      ...data,
    },
  };
}

type ApiOutcome =
  | { ok: true; data: unknown }
  | { ok: false; status: number; detail: string };

async function api(
  method: "GET" | "POST" | "PATCH",
  path: string,
  body?: Record<string, unknown>,
): Promise<ApiOutcome> {
  const { key, base } = config();
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    return {
      ok: false,
      status: 0,
      detail: error instanceof Error ? error.message : "network error",
    };
  }

  const raw = await response.text();
  if (!response.ok) {
    return { ok: false, status: response.status, detail: raw.slice(0, 300) };
  }
  try {
    return { ok: true, data: raw ? JSON.parse(raw) : {} };
  } catch {
    return { ok: true, data: { raw: raw.slice(0, 300) } };
  }
}

function failed(tool: string, outcome: { status: number; detail: string }): ToolResult {
  return {
    ok: false,
    tool,
    data: { status: outcome.status },
    error: `Ambiguous ${outcome.status || "network"}: ${outcome.detail}`,
  };
}

/** Pull an id out of whatever envelope the workspace returns. */
function idOf(data: unknown, fallback: string): string {
  if (typeof data === "object" && data !== null) {
    const record = data as Record<string, unknown>;
    const direct = record.id ?? record._id;
    if (typeof direct === "string") return direct;
    const nested = record.data;
    if (typeof nested === "object" && nested !== null) {
      const inner = (nested as Record<string, unknown>).id;
      if (typeof inner === "string") return inner;
    }
  }
  return fallback;
}

// ── Chat: the receipt surface ─────────────────────────────────────

export const workspaceChatPost: ToolSpec = {
  name: "workspace.chatPost",
  description:
    "Post a message into an Ambiguous Chat channel. This is how the stand-up summary lands back in the same place the stand-up happened.",
  inputSchema: {
    type: "object",
    properties: {
      channelId: {
        type: "string",
        description: "Ambiguous channel id. Defaults to AMBIGUOUS_STANDUP_CHANNEL.",
      },
      body: { type: "string", description: "Message content, channel-native and short." },
    },
    required: ["body"],
  },
  async handler(args) {
    const body = String(args.body ?? "").trim();
    const channelId = String(args.channelId ?? process.env.AMBIGUOUS_STANDUP_CHANNEL ?? "").trim();

    if (!body) {
      return { ok: false, tool: this.name, data: {}, error: "body is required" };
    }
    if (!channelId) {
      return {
        ok: false,
        tool: this.name,
        data: {},
        error: "channelId is required (set AMBIGUOUS_STANDUP_CHANNEL or pass it explicitly)",
      };
    }
    if (!config().key) {
      return stub(this.name, { channelId, body, would: "post to Ambiguous Chat" });
    }

    const outcome = await api("POST", `/api/chat/channels/${channelId}/messages`, {
      content: body,
    });
    if (!outcome.ok) return failed(this.name, outcome);

    const messageId = idOf(outcome.data, "msg_unknown");
    return {
      ok: true,
      tool: this.name,
      receiptId: messageId,
      data: { channelId, messageId, body },
    };
  },
};

// ── Search: falsify a self-report against workspace state ─────────

export const workspaceSearch: ToolSpec = {
  name: "workspace.search",
  description:
    "Search across the Ambiguous workspace (docs, mail, tasks, chat) to check whether a teammate's claim is actually still true. Use this to verify a blocker before repeating it — the artifact someone is 'waiting for' may already exist.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "What to look for, e.g. 'API endpoint docs'" },
      limit: { type: "number", description: "Max results, default 5" },
    },
    required: ["query"],
  },
  async handler(args) {
    const query = String(args.query ?? "").trim();
    const limit = Math.min(Math.max(Number(args.limit ?? 5), 1), 20);
    if (!query) {
      return { ok: false, tool: this.name, data: {}, error: "query is required" };
    }
    if (!config().key) {
      return stub(this.name, {
        query,
        results: [],
        would: "search docs, mail, tasks and chat for evidence",
      });
    }

    const outcome = await api(
      "GET",
      `/api/search?q=${encodeURIComponent(query)}&limit=${limit}`,
    );
    if (!outcome.ok) return failed(this.name, outcome);

    const payload = outcome.data as { results?: unknown; data?: unknown };
    const rows = Array.isArray(payload.results)
      ? payload.results
      : Array.isArray(payload.data)
        ? payload.data
        : [];

    const results = rows.slice(0, limit).map((row) => {
      const r = (row ?? {}) as Record<string, unknown>;
      return {
        id: typeof r.id === "string" ? r.id : "",
        kind: String(r.type ?? r.kind ?? "unknown"),
        title: String(r.title ?? r.name ?? r.subject ?? ""),
        snippet: String(r.snippet ?? r.excerpt ?? r.content ?? "").slice(0, 240),
      };
    });

    return {
      ok: true,
      tool: this.name,
      data: {
        query,
        found: results.length,
        results,
        // Spelled out so the model does not over-read an empty result set.
        interpretation: results.length
          ? "Evidence exists in the workspace. Link it instead of asking someone to produce it again."
          : "No evidence found. The blocker is probably still real.",
      },
    };
  },
};

// ── Calendar: turn a suggestion into an actual hold ───────────────

export const workspaceCalendarHold: ToolSpec = {
  name: "workspace.calendarHold",
  description:
    "Create a short calendar hold between two teammates to clear a blocker. Prefer this over pinging someone: an invite is an action, a nudge is a notification. Irreversible enough to need HITL first.",
  inputSchema: {
    type: "object",
    properties: {
      title: { type: "string" },
      attendeeIds: {
        type: "array",
        items: { type: "string" },
        description: "Ambiguous user ids who should be on the hold",
      },
      durationMinutes: { type: "number", description: "Default 10" },
      startsAt: {
        type: "string",
        description: "ISO timestamp. Omit to place it 30 minutes from now.",
      },
    },
    required: ["title", "attendeeIds"],
  },
  async handler(args, ctx) {
    const title = String(args.title ?? "").trim();
    const attendeeIds = Array.isArray(args.attendeeIds)
      ? args.attendeeIds.map((a) => String(a)).filter(Boolean)
      : [];
    const durationMinutes = Math.min(Math.max(Number(args.durationMinutes ?? 10), 5), 60);

    if (!title || attendeeIds.length === 0) {
      return {
        ok: false,
        tool: this.name,
        data: {},
        error: "title and at least one attendeeId are required",
      };
    }

    const start = args.startsAt
      ? new Date(String(args.startsAt))
      : new Date(ctx.now().getTime() + 30 * 60 * 1000);
    if (Number.isNaN(start.getTime())) {
      return { ok: false, tool: this.name, data: {}, error: "startsAt is not a valid date" };
    }
    const end = new Date(start.getTime() + durationMinutes * 60 * 1000);

    if (!config().key) {
      return stub(this.name, {
        title,
        attendeeIds,
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        would: "create an Ambiguous calendar hold",
      });
    }

    const outcome = await api("POST", "/api/calendar/events", {
      title,
      start: start.toISOString(),
      end: end.toISOString(),
      attendees: attendeeIds,
    });
    if (!outcome.ok) return failed(this.name, outcome);

    const eventId = idOf(outcome.data, "evt_unknown");
    return {
      ok: true,
      tool: this.name,
      receiptId: eventId,
      data: {
        eventId,
        title,
        attendeeIds,
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
      },
    };
  },
};

// ── Tasks: assign the follow-up to a named person ─────────────────

export const workspaceTaskCreate: ToolSpec = {
  name: "workspace.taskCreate",
  description:
    "File an Ambiguous task for the suggested next action so the follow-up is owned by a named person rather than living in a chat message.",
  inputSchema: {
    type: "object",
    properties: {
      title: { type: "string" },
      assignee: { type: "string", description: "Ambiguous user id or email" },
      priority: { type: "string", enum: ["low", "medium", "high"] },
      due: { type: "string", description: "ISO date, optional" },
    },
    required: ["title"],
  },
  async handler(args) {
    const title = String(args.title ?? "").trim();
    if (!title) {
      return { ok: false, tool: this.name, data: {}, error: "title is required" };
    }
    const assignee = args.assignee ? String(args.assignee) : undefined;
    const priority = ["low", "medium", "high"].includes(String(args.priority))
      ? String(args.priority)
      : "medium";

    if (!config().key) {
      return stub(this.name, { title, assignee, priority, would: "create an Ambiguous task" });
    }

    const outcome = await api("POST", "/api/tasks", {
      title,
      ...(assignee ? { assignee } : {}),
      priority,
      ...(args.due ? { due: String(args.due) } : {}),
    });
    if (!outcome.ok) return failed(this.name, outcome);

    const taskId = idOf(outcome.data, "task_unknown");
    return {
      ok: true,
      tool: this.name,
      receiptId: taskId,
      data: { taskId, title, assignee, priority },
    };
  },
};

// ── Docs: the durable stand-up log ────────────────────────────────

export const workspaceDocAppend: ToolSpec = {
  name: "workspace.docAppend",
  description:
    "Append the stand-up summary to a running Ambiguous doc, so the team has a durable log rather than only a chat scroll.",
  inputSchema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Doc title. Defaults to AMBIGUOUS_STANDUP_DOC_TITLE." },
      body: { type: "string" },
    },
    required: ["body"],
  },
  async handler(args) {
    const body = String(args.body ?? "").trim();
    const title = String(
      args.title ?? process.env.AMBIGUOUS_STANDUP_DOC_TITLE ?? "Stand-up log",
    ).trim();
    if (!body) {
      return { ok: false, tool: this.name, data: {}, error: "body is required" };
    }
    if (!config().key) {
      return stub(this.name, { title, body, would: "append to an Ambiguous doc" });
    }

    const outcome = await api("POST", "/api/docs", {
      title,
      content: [{ type: "paragraph", text: body }],
    });
    if (!outcome.ok) return failed(this.name, outcome);

    const docId = idOf(outcome.data, "doc_unknown");
    return { ok: true, tool: this.name, receiptId: docId, data: { docId, title } };
  },
};

export const ambiguousTools: ToolSpec[] = [
  workspaceChatPost,
  workspaceSearch,
  workspaceCalendarHold,
  workspaceTaskCreate,
  workspaceDocAppend,
];

/** True when the workspace is really wired, rather than running on stubs. */
export function ambiguousConfigured(): boolean {
  return Boolean(config().key);
}
