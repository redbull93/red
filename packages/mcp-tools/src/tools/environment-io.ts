import type { ToolSpec } from "../types";

export const environmentRead: ToolSpec = {
  name: "environment.read",
  description:
    "Read the current place: who is present, recent artifacts, and the signal a chatbox would never be told.",
  inputSchema: {
    type: "object",
    properties: {
      channelId: {
        type: "string",
        description: "Channel / thread / room id from the inbound event",
      },
    },
    required: ["channelId"],
  },
  async handler(args, ctx) {
    const channelId = String(args.channelId ?? "");
    const place = ctx.readPlace(channelId);
    if (!place) {
      return {
        ok: false,
        tool: "environment.read",
        data: { channelId },
        error: "Place not found. Wire a live environment adapter.",
      };
    }
    return { ok: true, tool: "environment.read", data: { ...place } };
  },
};

export const environmentReceipt: ToolSpec = {
  name: "environment.receipt",
  description:
    "Write a receipt back into the SAME environment the agent was invoked from. Mandatory after a world act.",
  inputSchema: {
    type: "object",
    properties: {
      channelId: { type: "string" },
      body: {
        type: "string",
        description: "What landed. Short. In the language of the place.",
      },
      receiptId: { type: "string" },
    },
    required: ["channelId", "body"],
  },
  async handler(args, ctx) {
    const channelId = String(args.channelId ?? "");
    const body = String(args.body ?? "");
    if (!channelId || !body) {
      return {
        ok: false,
        tool: "environment.receipt",
        data: {},
        error: "channelId and body are required",
      };
    }
    const written = ctx.writeReceipt({
      channelId,
      body,
      receiptId: args.receiptId ? String(args.receiptId) : undefined,
    });
    return {
      ok: true,
      tool: "environment.receipt",
      receiptId: written.receiptId,
      data: { ...written, channelId, body },
    };
  },
};
