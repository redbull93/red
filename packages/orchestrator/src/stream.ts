import type { AgUiEvent } from "./ag-ui";
import { onAgUi } from "./ag-ui";

/**
 * Server-Sent Events stream for real-time orchestrator updates.
 *
 * Returns a ReadableStream<Uint8Array> that emits SSE-formatted events
 * as the orchestrator loop progresses. The control-plane can consume
 * this directly via a Next.js route that returns a streaming Response.
 *
 * Usage in a Next.js API route:
 *   return new Response(createRunStream(runId), {
 *     headers: { "Content-Type": "text/event-stream", ... }
 *   });
 */

const encoder = new TextEncoder();

/**
 * Format an AgUiEvent as an SSE frame.
 * Each frame has an `event:` type line and a `data:` JSON line.
 */
export function formatSseEvent(event: AgUiEvent): string {
  const eventType = event.type
    .replace(/([A-Z])/g, "_$1")
    .toLowerCase()
    .slice(1); // RunStarted → run_started

  const data = JSON.stringify(event);
  return `event: ${eventType}\ndata: ${data}\n\n`;
}

/**
 * SSE heartbeat comment to keep the connection alive.
 */
function heartbeat(): string {
  return `: heartbeat ${new Date().toISOString()}\n\n`;
}

/**
 * Creates a ReadableStream that emits SSE events for a specific run.
 *
 * @param runId - Filter events to this run. Pass `"*"` for all events.
 * @param heartbeatMs - Interval for keep-alive pings (default 15s).
 */
export function createRunStream(
  runId: string,
  heartbeatMs = 15_000,
): ReadableStream<Uint8Array> {
  let unsubscribe: (() => void) | undefined;
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined;

  return new ReadableStream<Uint8Array>({
    start(controller) {
      // Send initial connection event
      controller.enqueue(
        encoder.encode(
          formatSseEvent({
            type: "RunStarted",
            runId: runId === "*" ? "all" : runId,
          }),
        ),
      );

      // Subscribe to AG-UI events
      unsubscribe = onAgUi((event) => {
        // Filter by runId unless wildcard
        if (runId !== "*") {
          const eventRunId =
            "runId" in event
              ? event.runId
              : "run" in event
                ? event.run.id
                : "snapshot" in event
                  ? undefined // StateSnapshot is global
                  : "trace" in event
                    ? event.trace.runId
                    : undefined;

          if (eventRunId && eventRunId !== runId) return;
        }

        try {
          controller.enqueue(encoder.encode(formatSseEvent(event)));
        } catch {
          // Stream closed by client
          cleanup();
        }

        // Auto-close on RunFinished
        if (event.type === "RunFinished" && runId !== "*") {
          cleanup();
          try {
            controller.close();
          } catch {
            // Already closed
          }
        }
      });

      // Keep-alive heartbeat
      heartbeatTimer = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(heartbeat()));
        } catch {
          cleanup();
        }
      }, heartbeatMs);
      if (typeof heartbeatTimer?.unref === "function") {
        heartbeatTimer.unref();
      }
    },

    cancel() {
      cleanup();
    },
  });

  function cleanup() {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = undefined;
    }
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = undefined;
    }
  }
}

/**
 * Creates a ReadableStream that emits SSE events for ALL runs.
 * Useful for a global dashboard feed.
 */
export function createGlobalStream(
  heartbeatMs = 15_000,
): ReadableStream<Uint8Array> {
  return createRunStream("*", heartbeatMs);
}
