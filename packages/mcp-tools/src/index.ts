import { environmentRead, environmentReceipt } from "./tools/environment-io";
import { searchWeb } from "./tools/exa-search";
import { worldAct } from "./tools/act-receipt";
import { healthFail, healthPing, healthRetry } from "./tools/health-fail";
import type { ToolContext, ToolResult, ToolSpec } from "./types";

export type { PlaceSnapshot, ToolContext, ToolResult, ToolSpec } from "./types";
export { createMemoryPlace } from "./memory-place";

export const toolSpecs: ToolSpec[] = [
  environmentRead,
  environmentReceipt,
  searchWeb,
  worldAct,
  healthPing,
  healthFail,
  healthRetry,
];

export const toolByName = Object.fromEntries(
  toolSpecs.map((t) => [t.name, t]),
) as Record<string, ToolSpec>;

export async function dispatchTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const spec = toolByName[name];
  if (!spec) {
    return {
      ok: false,
      tool: name,
      data: {},
      error: `Unknown tool: ${name}`,
    };
  }
  return spec.handler(args, ctx);
}

export function openaiToolDefinitions() {
  return toolSpecs.map((spec) => ({
    type: "function" as const,
    function: {
      name: spec.name,
      description: spec.description,
      parameters: spec.inputSchema,
    },
  }));
}
