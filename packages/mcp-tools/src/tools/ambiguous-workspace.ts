import type { ToolSpec } from "../types";

/**
 * Ambiguous AI MCP Tool: Workspace & Coworker Collaboration
 *
 * Integrates with Ambiguous AI (sponsor tool) to assign tasks, schedule follow-ups,
 * and sync standup blocker resolutions directly into the team's shared workspace.
 */
export const ambiguousTask: ToolSpec = {
  name: "ambiguous.task",
  description:
    "Create or update a collaborative task in the team's Ambiguous AI workspace (when AMBIGUOUS_API_KEY is set). Useful for assigning follow-up resolutions detected during stand-up.",
  inputSchema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Title of the task or action item" },
      assignee: { type: "string", description: "Teammate responsible for resolving this task" },
      description: { type: "string", description: "Context and details about the dependency/blocker" },
      urgency: { type: "string", enum: ["low", "medium", "high"], default: "medium" },
    },
    required: ["title", "assignee"],
  },
  async handler(args) {
    const title = String(args.title ?? "").trim();
    const assignee = String(args.assignee ?? "").trim();
    const description = String(args.description ?? "");
    const urgency = String(args.urgency ?? "medium");

    if (!title || !assignee) {
      return {
        ok: false,
        tool: "ambiguous.task",
        data: {},
        error: "title and assignee are required",
      };
    }

    const receiptId = `amb_task_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const apiKey = process.env.AMBIGUOUS_API_KEY;

    if (!apiKey) {
      return {
        ok: true,
        tool: "ambiguous.task",
        receiptId,
        data: {
          stub: true,
          taskId: receiptId,
          title,
          assignee,
          urgency,
          status: "created",
          note: "Ambiguous AI task recorded. Set AMBIGUOUS_API_KEY for live workspace synchronization.",
        },
      };
    }

    try {
      const res = await fetch("https://api.ambiguous.ai/v1/tasks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          title,
          assignee,
          description,
          priority: urgency,
        }),
      });

      if (!res.ok) {
        return {
          ok: false,
          tool: "ambiguous.task",
          data: { status: res.status },
          error: `Ambiguous API error: ${res.statusText}`,
        };
      }

      const json = await res.json().catch(() => ({}));
      return {
        ok: true,
        tool: "ambiguous.task",
        receiptId,
        data: {
          ...json,
          taskId: receiptId,
          title,
          assignee,
          status: "synced",
        },
      };
    } catch (err) {
      return {
        ok: false,
        tool: "ambiguous.task",
        data: {},
        error: String(err),
      };
    }
  },
};
