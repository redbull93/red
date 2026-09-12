import type { ToolSpec } from "../types";

export const healthPing: ToolSpec = {
  name: "health.ping",
  description: "Heartbeat. Use at startup or to prove the tool bus is alive.",
  inputSchema: {
    type: "object",
    properties: {
      note: { type: "string" },
    },
  },
  async handler(args, ctx) {
    return {
      ok: true,
      tool: "health.ping",
      data: {
        pong: true,
        at: ctx.now().toISOString(),
        note: args.note ? String(args.note) : "alive",
      },
    };
  },
};

export const healthFail: ToolSpec = {
  name: "health.fail",
  description:
    "Synthetic failure for the demo's failure beat. Do not use as a fake production error.",
  inputSchema: {
    type: "object",
    properties: {
      reason: { type: "string" },
    },
  },
  async handler(args) {
    return {
      ok: false,
      tool: "health.fail",
      data: { synthetic: true },
      error: String(args.reason ?? "Synthetic failure for the demo path"),
    };
  },
};

export const healthRetry: ToolSpec = {
  name: "health.retry",
  description:
    "Signal the job queue to retry after a failure. Pair with health.fail in the video.",
  inputSchema: {
    type: "object",
    properties: {
      jobHint: { type: "string" },
    },
  },
  async handler(args, ctx) {
    return {
      ok: true,
      tool: "health.retry",
      data: {
        queued: true,
        at: ctx.now().toISOString(),
        jobHint: args.jobHint ? String(args.jobHint) : "default",
      },
    };
  },
};
