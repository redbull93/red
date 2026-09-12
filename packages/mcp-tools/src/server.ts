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

function schemaFor(specName: string): Record<string, z.ZodTypeAny> {
  if (specName === "environment.read") {
    return { channelId: z.string() };
  }
  if (specName === "environment.receipt") {
    return { channelId: z.string(), body: z.string(), receiptId: z.string().optional() };
  }
  if (specName === "search.web") {
    return { query: z.string() };
  }
  if (specName === "world.act") {
    return {
      kind: z.string(),
      summary: z.string(),
      payload: z.record(z.unknown()).optional(),
    };
  }
  if (specName === "ambiguous.task") {
    return {
      title: z.string(),
      assignee: z.string(),
      description: z.string().optional(),
      urgency: z.string().optional(),
    };
  }
  if (specName === "health.ping") return { note: z.string().optional() };
  if (specName === "health.fail") return { reason: z.string().optional() };
  if (specName === "health.retry") return { jobHint: z.string().optional() };
  return {};
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
