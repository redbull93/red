import type {
  AgentContext,
  Approval,
  EngineSnapshot,
  Job,
  Receipt,
  Run,
  TraceEvent,
} from "./types";
import { getAllUsage } from "./usage";
import { getAllBlockers } from "./memory";

export class EngineStore {
  runs: Run[] = [];
  traces: TraceEvent[] = [];
  approvals: Approval[] = [];
  jobs: Job[] = [];
  receipts: Receipt[] = [];
  signals: AgentContext[] = [];

  snapshot(): EngineSnapshot {
    return {
      runs: [...this.runs].reverse(),
      traces: [...this.traces].reverse(),
      approvals: [...this.approvals].reverse(),
      jobs: [...this.jobs].reverse(),
      receipts: [...this.receipts].reverse(),
      signals: [...this.signals].reverse(),
      usage: getAllUsage(),
      blockers: getAllBlockers(),
    };
  }
}

const globalKey = "__red_engine_store__";

export function getStore(): EngineStore {
  const g = globalThis as typeof globalThis & {
    [globalKey]?: EngineStore;
  };
  if (!g[globalKey]) g[globalKey] = new EngineStore();
  return g[globalKey];
}

