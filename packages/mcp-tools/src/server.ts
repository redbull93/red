#!/usr/bin/env npx tsx
/**
 * Stdio MCP server wrapping the four kit tools.
 * Inspect with any MCP client. The orchestrator can also call tools in-process.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio";
import { z } from "zod";
import { createMemoryPlace } from "./memory-place";
import { toolSpecs } from "./index";

const ctx = createMemoryPlace({
  environmentName: "unwired environment",
  environmentKind: "stdio",
  channelId: "stdio",
  recent: ["MCP stdio server started. Wire a live place on the day."],
  placeOnlyContext:
    "This process is a tool bus, not a home. Attach an environment adapter.",
});

const server = new McpServer({
  name: "red-environment-tools",
  version: "0.1.0",
});

/**
 * Declared as one record rather than a chain of returns: separate object literals
 * infer as a union, and TypeScript then widens every key to `T | undefined`,
 * which does not satisfy Zod's raw-shape constraint.
 */
const SCHEMAS: Record<string, z.ZodRawShape> = {
  "environment.read": { channelId: z.string() },
  "environment.receipt": {
    channelId: z.string(),
    body: z.string(),
    receiptId: z.string().optional(),
  },
  "search.web": { query: z.string(), numResults: z.number().optional() },
  "world.act": {
    kind: z.string(),
    summary: z.string(),
    payload: z.record(z.unknown()).optional(),
  },
  "health.ping": { note: z.string().optional() },
  "health.fail": { reason: z.string().optional() },
  "health.retry": { jobHint: z.string().optional() },
  "workspace.chatPost": { channelId: z.string().optional(), body: z.string() },
  "workspace.search": { query: z.string(), limit: z.number().optional() },
  "workspace.calendarHold": {
    title: z.string(),
    attendeeIds: z.array(z.string()),
    durationMinutes: z.number().optional(),
    startsAt: z.string().optional(),
  },
  "workspace.taskCreate": {
    title: z.string(),
    assignee: z.string().optional(),
    priority: z.enum(["low", "medium", "high"]).optional(),
    due: z.string().optional(),
  },
  "ambiguous.task": {
    title: z.string(),
    assignee: z.string().optional(),
    priority: z.enum(["low", "medium", "high"]).optional(),
    due: z.string().optional(),
  },
  "workspace.docAppend": { title: z.string().optional(), body: z.string() },
};

function schemaFor(specName: string): z.ZodRawShape {
  return SCHEMAS[specName] ?? {};
}

for (const spec of toolSpecs) {
  server.tool(
    spec.name,
    spec.description,
    schemaFor(spec.name),
    async (args) => {
      const result = await spec.handler(args as Record<string, unknown>, ctx);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result),
          },
        ],
        isError: !result.ok,
      };
    },
  );
}

const transport = new StdioServerTransport();
await server.connect(transport);
