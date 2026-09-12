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

/**
 * Pull an id out of whatever envelope the workspace returns.
 *
 * The shape is not consistent across modules — some routes answer `{id}`, others
 * `{data: {id}}`, others wrap the object under its own name — so this walks a few
 * levels rather than hardcoding one guess. Reporting `task_unknown` for a task
 * that was really created is a small lie the receipt should not have to tell.
 */
function idOf(data: unknown, fallback: string, depth = 0): string {
  if (depth > 3 || typeof data !== "object" || data === null) return fallback;
  const record = data as Record<string, unknown>;

  const direct = record.id ?? record._id ?? record.uuid;
  if (typeof direct === "string" && direct) return direct;

  for (const key of ["data", "task", "event", "page", "message", "result"]) {
    if (key in record) {
      const found = idOf(record[key], "", depth + 1);
      if (found) return found;
    }
  }
  return fallback;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Words that carry no signal in a title match and only narrow the AND. */
const FILLER = new Set([
  "the", "a", "an", "for", "from", "with", "and", "or", "of", "on", "in", "to",
  "docs", "doc", "document", "documentation", "spec", "notes", "info", "details",
  "link", "file", "page", "reference", "ref",
]);

/**
 * Progressively broader queries to try, most specific first. Stops at a single
 * term: below that the results stop being about what was asked.
 */
function queryLadder(query: string): string[] {
  const words = query.split(/\s+/).filter(Boolean);
  if (words.length < 2) return [query];

  const ladder = [query];
  const meaningful = words.filter((w) => !FILLER.has(w.toLowerCase()));
  if (meaningful.length > 0 && meaningful.length < words.length) {
    ladder.push(meaningful.join(" "));
  }
  // Last resort: the longest word, which in practice is the domain noun —
  // "payments" out of "payments endpoint docs".
  const longest = [...(meaningful.length ? meaningful : words)].sort(
    (a, b) => b.length - a.length,
  )[0];
  if (longest && !ladder.includes(longest)) ladder.push(longest);
  return ladder;
}

/**
 * Wiki content is either a Markdown string or ProseMirror JSON. Returns the
 * Markdown, or null when the page is structured JSON that must not be
 * string-concatenated.
 */
function markdownOf(data: unknown): string | null {
  const record =
    typeof data === "object" && data !== null
      ? ((data as Record<string, unknown>).data ?? data)
      : data;
  if (typeof record !== "object" || record === null) return null;
  const content = (record as Record<string, unknown>).content;
  if (typeof content === "string") return content;
  const legacy = (record as Record<string, unknown>).content_markdown;
  if (typeof legacy === "string") return legacy;
  return null;
}

/** Ambiguous wraps collections as `{ success, data: [...] }`. */
function rowsOf(data: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(data)) return data as Array<Record<string, unknown>>;
  if (typeof data === "object" && data !== null) {
    const inner = (data as Record<string, unknown>).data;
    if (Array.isArray(inner)) return inner as Array<Record<string, unknown>>;
  }
  return [];
}

// Resolved once per process. These lookups are stable for the life of a run and
// each one costs a round trip we do not want on every tool call.
let cachedCalendarId: string | null = null;
let cachedSpaceId: string | null = null;
let cachedDirectory: Array<{ id: string; names: string[] }> | null = null;

/**
 * The models talk about teammates by name — "Brian is blocked on Eugene" — but the
 * task and calendar APIs want user UUIDs. Resolving through the real workspace
 * directory is what lets a follow-up land on an actual person instead of being
 * filed unassigned.
 */
async function resolveUserId(nameOrEmail: string): Promise<string | null> {
  const needle = nameOrEmail.trim().toLowerCase();
  if (!needle) return null;
  if (UUID.test(needle)) return needle;

  if (!cachedDirectory) {
    const listed = await api("GET", "/api/users");
    if (!listed.ok) return null;
    cachedDirectory = rowsOf(listed.data).flatMap((row) => {
      const id = typeof row.id === "string" ? row.id : "";
      if (!id) return [];
      const names = ["display_name", "full_name", "name", "email", "username"]
        .map((k) => row[k])
        .filter((v): v is string => typeof v === "string" && v.length > 0)
        .map((v) => v.toLowerCase());
      return [{ id, names }];
    });
  }

  const exact = cachedDirectory.find((u) => u.names.includes(needle));
  if (exact) return exact.id;
  // A first name is how people actually get referred to in a stand-up, so match a
  // leading word too — but only when exactly one person answers to it.
  const partial = cachedDirectory.filter((u) =>
    u.names.some((n) => n.split(/[\s@.]+/).includes(needle)),
  );
  return partial.length === 1 ? partial[0].id : null;
}

/**
 * Events are created under a specific calendar — `POST /api/calendars/{id}/events`
 * — so a hold needs a calendar id first. Prefers the workspace default.
 */
async function resolveCalendarId(): Promise<string | null> {
  if (cachedCalendarId) return cachedCalendarId;
  const outcome = await api("GET", "/api/calendars");
  if (!outcome.ok) return null;
  const rows = rowsOf(outcome.data);
  const chosen =
    rows.find((r) => r.is_default === true) ??
    rows.find((r) => typeof r.id === "string");
  const id = typeof chosen?.id === "string" ? chosen.id : null;
  cachedCalendarId = id;
  return id;
}

/**
 * Wiki pages live inside a space, so the stand-up log needs one. Reuses a space
 * whose name matches AMBIGUOUS_STANDUP_SPACE, otherwise creates it.
 */
async function resolveSpaceId(): Promise<string | null> {
  if (cachedSpaceId) return cachedSpaceId;
  const wanted = (process.env.AMBIGUOUS_STANDUP_SPACE || "Stand-ups").trim();

  const listed = await api("GET", "/api/wiki/spaces");
  if (listed.ok) {
    const hit = rowsOf(listed.data).find(
      (r) => typeof r.name === "string" && r.name.toLowerCase() === wanted.toLowerCase(),
    );
    if (typeof hit?.id === "string") {
      cachedSpaceId = hit.id;
      return hit.id;
    }
  }

  const created = await api("POST", "/api/wiki/spaces", {
    name: wanted,
    description: "Daily stand-up log written by the StandUp agent.",
    visibility: "workspace",
  });
  if (!created.ok) return null;
  const id = idOf(created.data, "");
  cachedSpaceId = id || null;
  return cachedSpaceId;
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

    // Route confirmed against the workspace's own OpenAPI spec — an earlier guess
    // at /api/chat/channels/... does not exist. Content is Markdown and supports
    // @mentions.
    const outcome = await api("POST", `/api/channels/${channelId}/messages`, {
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

    // /api/search is a command-palette search: every term has to match, so a
    // natural phrase like "payments endpoint docs" returns nothing even when the
    // doc is sitting right there — the word "docs" is not in its title. A false
    // negative here is the expensive kind of wrong, because the agent concludes the
    // blocker is real and goes off to nudge someone about work that is already
    // done. So on an empty result, narrow to the distinctive terms and ask again.
    const attempts = queryLadder(query);
    let rows: unknown[] = [];
    let usedQuery = query;

    for (const attempt of attempts) {
      const outcome = await api(
        "GET",
        `/api/search?q=${encodeURIComponent(attempt)}&limit=${limit}`,
      );
      if (!outcome.ok) return failed(this.name, outcome);
      const found = rowsOf(outcome.data);
      if (found.length > 0) {
        rows = found;
        usedQuery = attempt;
        break;
      }
    }

    const results = rows.slice(0, limit).map((row) => {
      const r = (row ?? {}) as Record<string, unknown>;
      const path = typeof r.url === "string" ? r.url : "";
      return {
        id: typeof r.id === "string" ? r.id : "",
        kind: String(r.type ?? r.kind ?? "unknown"),
        module: String(r.module ?? ""),
        title: String(r.title ?? r.name ?? r.subject ?? ""),
        // Without a link the agent can only say the evidence exists, which is
        // barely better than not finding it.
        url: path ? `${config().base}${path}` : "",
        snippet: String(r.snippet ?? r.excerpt ?? r.content ?? "").slice(0, 240),
      };
    });

    return {
      ok: true,
      tool: this.name,
      data: {
        query,
        ...(usedQuery === query ? {} : { broadenedTo: usedQuery }),
        found: results.length,
        results,
        interpretation: results.length
          ? "Evidence exists in the workspace. Link the url instead of asking someone to produce it again."
          : "No evidence found under this phrasing or a narrower one. The blocker is probably still real.",
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
        description: "Ambiguous user ids or email addresses; the API accepts either",
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

    // Events hang off a calendar rather than sitting at /api/calendar/events, and
    // the fields are start_at / end_at. Both were wrong until the spec was read.
    const calendarId = process.env.AMBIGUOUS_CALENDAR_ID || (await resolveCalendarId());
    if (!calendarId) {
      return {
        ok: false,
        tool: this.name,
        data: {},
        error: "No Ambiguous calendar available to hold time on. Set AMBIGUOUS_CALENDAR_ID.",
      };
    }

    // Attendees accept a UUID or an email, but not a bare first name, so resolve
    // what we can and keep the rest — the API is the better judge of an email.
    const attendees = await Promise.all(
      attendeeIds.map(async (a) => (await resolveUserId(a)) ?? a),
    );

    const outcome = await api("POST", `/api/calendars/${calendarId}/events`, {
      title,
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      attendees,
      description: "Placed by the StandUp agent to clear a reported blocker.",
      auto_conference: true,
    });
    if (!outcome.ok) return failed(this.name, outcome);

    const eventId = idOf(outcome.data, "evt_unknown");
    return {
      ok: true,
      tool: this.name,
      receiptId: eventId,
      data: {
        eventId,
        calendarId,
        title,
        attendeeIds: attendees,
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
      assignee: {
        type: "string",
        description: "Ambiguous user id (UUID). A name lands on the task as a suggested owner.",
      },
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

    // The field is assignee_id and it must be a workspace user's UUID — a bare name
    // is rejected with a 403 — so names go through the directory first. If nobody
    // matches, file it unassigned and say who it was meant for rather than dropping
    // the follow-up on the floor.
    const assigneeId = assignee ? ((await resolveUserId(assignee)) ?? undefined) : undefined;
    const unresolved = assignee && !assigneeId ? assignee : undefined;

    const outcome = await api("POST", "/api/tasks", {
      title,
      ...(assigneeId ? { assignee_id: assigneeId } : {}),
      ...(unresolved ? { description: `Suggested owner: ${unresolved} (id not resolved).` } : {}),
      priority,
      ...(args.due ? { due_date: String(args.due).slice(0, 10) } : {}),
    });
    if (!outcome.ok) return failed(this.name, outcome);

    const taskId = idOf(outcome.data, "task_unknown");
    return {
      ok: true,
      tool: this.name,
      receiptId: taskId,
      data: {
        taskId,
        title,
        priority,
        assigneeId,
        ...(unresolved
          ? { unassigned: true, suggestedOwner: unresolved, note: `Filed unassigned: "${unresolved}" is not a user id.` }
          : {}),
      },
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

    // There is no /api/docs. The durable log is a wiki page inside a space, and
    // "append" has to be done as read-then-PATCH because the API only replaces
    // content wholesale — a blind POST every morning would leave thirty pages
    // called "Stand-up log" and no actual log.
    const spaceId = process.env.AMBIGUOUS_STANDUP_SPACE_ID || (await resolveSpaceId());
    if (!spaceId) {
      return {
        ok: false,
        tool: this.name,
        data: {},
        error: "No Ambiguous wiki space available. Set AMBIGUOUS_STANDUP_SPACE_ID.",
      };
    }

    const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
    const entry = `\n\n## ${stamp}\n\n${body}\n`;

    const listed = await api("GET", `/api/wiki/spaces/${spaceId}/pages`);
    const existing = listed.ok
      ? rowsOf(listed.data).find(
          (p) => typeof p.title === "string" && p.title.toLowerCase() === title.toLowerCase(),
        )
      : undefined;

    if (existing && typeof existing.id === "string") {
      const current = await api("GET", `/api/wiki/pages/${existing.id}`);
      const prior = current.ok ? markdownOf(current.data) : null;
      if (prior === null) {
        // The page holds ProseMirror JSON, and a Markdown string cannot be
        // concatenated onto that without destroying what is already there.
        return {
          ok: false,
          tool: this.name,
          data: { docId: existing.id, spaceId, title },
          error: `Page "${title}" is not Markdown, so this entry was not appended rather than overwrite it.`,
        };
      }
      const patched = await api("PATCH", `/api/wiki/pages/${existing.id}`, {
        content: `${prior}${entry}`,
      });
      if (!patched.ok) return failed(this.name, patched);
      return {
        ok: true,
        tool: this.name,
        receiptId: existing.id,
        data: { docId: existing.id, spaceId, title, appended: true },
      };
    }

    const created = await api("POST", `/api/wiki/spaces/${spaceId}/pages`, {
      title,
      content: `# ${title}${entry}`,
    });
    if (!created.ok) return failed(this.name, created);

    const docId = idOf(created.data, "doc_unknown");
    return {
      ok: true,
      tool: this.name,
      receiptId: docId,
      data: { docId, spaceId, title, appended: false, created: true },
    };
  },
};

/** Alias for backward compatibility */
export const ambiguousTask: ToolSpec = workspaceTaskCreate;

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
