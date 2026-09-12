import { getStore } from "./store";
import { uid } from "./ids";
import type { TraceKind } from "./types";

export function trace(
  runId: string,
  kind: TraceKind,
  title: string,
  detail: string,
  data?: Record<string, unknown>,
) {
  getStore().traces.push({
    id: uid("tr"),
    at: new Date().toISOString(),
    runId,
    kind,
    title,
    detail,
    data,
  });
}
