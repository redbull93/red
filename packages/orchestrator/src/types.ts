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
};
