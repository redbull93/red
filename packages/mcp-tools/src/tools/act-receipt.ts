import type { ToolSpec } from "../types";

export const worldAct: ToolSpec = {
  name: "world.act",
  description:
    "Perform ONE external action and return a receipt id. Swap the stub for a live API (calendar, ticket, payment, browser). Irreversible acts require HITL first.",
  inputSchema: {
    type: "object",
    properties: {
      kind: {
        type: "string",
        description: "What kind of world action (create, update, notify, file)",
      },
      summary: { type: "string" },
      payload: { type: "object" },
    },
    required: ["kind", "summary"],
  },
  async handler(args) {
    const kind = String(args.kind ?? "");
    const summary = String(args.summary ?? "");
    if (!kind || !summary) {
      return {
        ok: false,
        tool: "world.act",
        data: {},
        error: "kind and summary are required",
      };
    }

    const receiptId = `act_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 6)}`;

    return {
      ok: true,
      tool: "world.act",
      receiptId,
      data: {
        kind,
        summary,
        payload: (args.payload as Record<string, unknown>) ?? {},
        stub: true,
        note: "Replace this handler with a live integration. The receipt id is real for the loop.",
      },
    };
  },
};
