import type { PlaceSnapshot, ToolContext } from "./types";

/** Standalone memory for the MCP stdio server. The orchestrator injects its own. */
export function createMemoryPlace(seed?: PlaceSnapshot): ToolContext {
  const places = new Map<string, PlaceSnapshot>();
  if (seed) places.set(seed.channelId, seed);

  return {
    now: () => new Date(),
    readPlace: (channelId) => places.get(channelId) ?? null,
    writeReceipt: ({ channelId, body, receiptId }) => {
      const id = receiptId ?? `rcp_${Date.now().toString(36)}`;
      const existing = places.get(channelId);
      const landedAt = new Date().toISOString();
      if (existing) {
        existing.recent = [...existing.recent, `[receipt ${id}] ${body}`].slice(
          -12,
        );
      } else {
        places.set(channelId, {
          environmentName: "unwired environment",
          environmentKind: "unknown",
          channelId,
          recent: [`[receipt ${id}] ${body}`],
          placeOnlyContext:
            "No live environment is wired. This receipt is a stub.",
        });
      }
      return { receiptId: id, landedAt };
    },
  };
}
