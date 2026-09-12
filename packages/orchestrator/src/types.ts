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
  orgId?: string;
  authenticatedUser?: ApproverIdentity;
  /**
   * Set when a human has already approved a split council verdict, so replaying
   * the event does not pause on the same dissent forever.
   */
  councilApproved?: boolean;
};

export type AgentContext = EnvironmentEvent & {
  id: string;
  occurredAt: string;
};

export type TraceKind =
  | "signal"
  | "context"
  | "council"
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

export type ApproverIdentity = {
  userId: string;
  email?: string;
  name?: string;
  roles?: string[];
  permissions?: string[];
  orgId?: string;
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
  requiredRole?: string;
  status: ApprovalStatus;
  expiresAt: string;
  resolvedBy?: ApproverIdentity;
  resolvedAt?: string;
  orgId?: string;
  /** Populated when the council split, so the human sees what was contested. */
  dissent?: Claim[];
  /** Per-seat detail behind the dissent, for the approval card. */
  opinions?: ModelOpinion[];
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
  approvedBy?: ApproverIdentity;
  orgId?: string;
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
  verdict?: CouncilVerdict;
  /**
   * Seeded demo data rather than a real run. Carried on the record itself, not
   * inferred from an id prefix, so the UI can label it and nobody mistakes a
   * fixture for something three models actually said.
   */
  demo?: boolean;
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

// ── Model Council ─────────────────────────────────────────────────

/** One teammate waiting on another over a named artifact. */
export type Dependency = {
  waiter: string;
  blocker: string;
  artifact: string;
};

/** What a single council model said, or why it could not say anything. */
export type ModelOpinion = {
  seat: string;
  label: string;
  model: string;
  status: "answered" | "abstained";
  /** Plain-language abstention reason, e.g. "quota exhausted". */
  abstainReason?: string;
  blockers: string[];
  dependencies: Dependency[];
  suggestedAction: string;
  confidence: number;
  reasoning?: string;
  latencyMs: number;
  totalTokens?: number;
};

/** A single normalized claim plus which seats voted for it. */
export type Claim = {
  key: string;
  dependency: Dependency;
  text: string;
  agreedBy: string[];
};

export type CouncilVerdict = {
  at: string;
  /** Seats that returned a usable opinion. */
  seated: string[];
  abstained: Array<{ seat: string; label: string; reason: string }>;
  /** Claims every seated model named. Safe to act on. */
  consensus: Claim[];
  /** Claims only some seats named. This is what escalates to a human. */
  dissent: Claim[];
  suggestedAction: string;
  /** True when fewer than two seats answered, so agreement was not testable. */
  unverified: boolean;
  /** True when replayed from a captured fixture rather than run live. */
  cached: boolean;
  /**
   * True when the opinions were written by hand for a demo instead of returned by
   * a model. Replaying a real captured council is honest; hardcoding three
   * opinions is only honest if it says so on the record.
   */
  demo?: boolean;
  opinions: ModelOpinion[];
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
  /** Organization tenancy ID (Auth0 Org). */
  orgId?: string;
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
  orgId?: string;
  userId?: string;
};
