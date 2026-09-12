export type Actor = {
  id: string;
  role: string;
  present: boolean;
  mayAct: boolean;
  language?: string;
};

export type Artifact = {
  kind: string;
  id: string;
  summary: string;
};

export type EnvironmentEvent = {
  id?: string;
  environmentName: string;
  environmentKind: string;
  channelId: string;
  threadId?: string;
  occurredAt?: string;
  localTime?: string;
  actors: Actor[];
  signalType: string;
  signalBody: string;
  artifacts?: Artifact[];
  urgency?: "low" | "medium" | "high";
  language?: string;
  permissionScope?: string;
  placeOnlyContext: string;
  principal?: string;
  requireHitl?: boolean;
  forceFail?: boolean;
};

export type AgentContext = EnvironmentEvent & {
  id: string;
  occurredAt: string;
};

export type TraceKind =
  | "signal"
  | "context"
  | "plan"
  | "tool"
  | "hitl"
  | "job"
  | "receipt"
  | "error";

export type TraceEvent = {
  id: string;
  at: string;
  runId: string;
  kind: TraceKind;
  title: string;
  detail: string;
  data?: Record<string, unknown>;
};

export type ApprovalStatus = "pending" | "approved" | "stopped" | "expired";

export type Approval = {
  id: string;
  runId: string;
  at: string;
  reason: string;
  proposedAction: string;
  preview: string;
  risk: "low" | "medium" | "high";
  principal: string;
  status: ApprovalStatus;
  expiresAt: string;
};

export type JobStatus =
  | "queued"
  | "running"
  | "retrying"
  | "failed"
  | "succeeded"
  | "cancelled";

export type Job = {
  id: string;
  runId: string;
  title: string;
  status: JobStatus;
  attempt: number;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
};

export type Receipt = {
  id: string;
  runId: string;
  channelId: string;
  body: string;
  at: string;
};

export type RunStatus =
  | "running"
  | "awaiting_hitl"
  | "completed"
  | "failed"
  | "stopped";

export type Run = {
  id: string;
  status: RunStatus;
  event: AgentContext;
  startedAt: string;
  finishedAt?: string;
  assistantText?: string;
};

export type EngineSnapshot = {
  runs: Run[];
  traces: TraceEvent[];
  approvals: Approval[];
  jobs: Job[];
  receipts: Receipt[];
  signals: AgentContext[];
  usage?: UsageRecord[];
  blockers?: BlockerRecord[];
};

// ── Cross-Run Memory ──────────────────────────────────────────────

export type BlockerRecord = {
  /** Actor who is blocked. */
  from: string;
  /** Actor causing the block. */
  to: string;
  /** Short description extracted from signal text. */
  topic: string;
  /** Channel where the blocker was first seen. */
  channelId: string;
  /** ISO timestamp of first occurrence. */
  firstSeen: string;
  /** ISO timestamp of most recent occurrence. */
  lastSeen: string;
  /** Run IDs where this blocker appeared. */
  runIds: string[];
  /** Number of consecutive stand-ups this blocker has persisted. */
  streak: number;
  /** Whether it has been resolved by a receipt or explicit resolution. */
  resolved: boolean;
};

// ── Output Guardrails ─────────────────────────────────────────────

export type GuardrailViolation = {
  rule: string;
  detail: string;
  severity: "warn" | "block";
};

export type GuardrailResult = {
  pass: boolean;
  violations: GuardrailViolation[];
  checkedAt: string;
};

// ── Cost & Token Tracking ─────────────────────────────────────────

export type UsageRecord = {
  runId: string;
  turnIndex: number;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  stub: boolean;
  at: string;
};
