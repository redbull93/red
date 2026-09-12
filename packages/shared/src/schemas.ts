import { z } from "zod";

export const PlatformSchema = z.enum(["slack", "discord"]);
export type Platform = z.infer<typeof PlatformSchema>;

export const WorkspaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  platform: PlatformSchema,
  teamId: z.string().optional(),
  channelId: z.string(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type Workspace = z.infer<typeof WorkspaceSchema>;

export const UserSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  platformUserId: z.string(),
  name: z.string(),
  email: z.string().optional(),
  role: z.string().optional(),
  avatarUrl: z.string().optional(),
  createdAt: z.string().optional(),
});
export type User = z.infer<typeof UserSchema>;

export const StandupStatusSchema = z.enum([
  "scheduled",
  "in_progress",
  "completed",
  "missed",
]);
export type StandupStatus = z.infer<typeof StandupStatusSchema>;

export const StandupSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  date: z.string(),
  status: StandupStatusSchema.default("in_progress"),
  summary: z.string().optional(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  createdAt: z.string().optional(),
});
export type Standup = z.infer<typeof StandupSchema>;

export const StandupResponseSchema = z.object({
  id: z.string().optional(),
  workspaceId: z.string(),
  platform: PlatformSchema,
  userId: z.string(),
  userName: z.string().optional(),
  channelId: z.string().optional(),
  standupId: z.string(),
  finished: z.string().optional(),
  workingOn: z.string().optional(),
  blockedBy: z.string().optional(),
  rawText: z.string(),
  createdAt: z.string(),
});
export type StandupResponse = z.infer<typeof StandupResponseSchema>;

export const DependencyStatusSchema = z.enum([
  "detected",
  "investigating",
  "waiting_hitl",
  "action_taken",
  "resolved",
]);
export type DependencyStatus = z.infer<typeof DependencyStatusSchema>;

export const DependencyRecordSchema = z.object({
  id: z.string(),
  standupId: z.string(),
  workspaceId: z.string(),
  blockerUserId: z.string().optional(),
  blockedUserId: z.string().optional(),
  blockerName: z.string().optional(),
  blockedName: z.string().optional(),
  subject: z.string(),
  type: z.enum(["explicit", "implicit", "dependency", "recurring", "risk"]).default("explicit"),
  status: DependencyStatusSchema.default("detected"),
  confidence: z.number().min(0).max(1).default(1),
  evidence: z.array(z.string()).default([]),
  createdAt: z.string().optional(),
  resolvedAt: z.string().optional(),
});
export type DependencyRecord = z.infer<typeof DependencyRecordSchema>;

export const PendingActionStatusSchema = z.enum([
  "pending",
  "approved",
  "rejected",
  "executed",
  "failed",
]);
export type PendingActionStatus = z.infer<typeof PendingActionStatusSchema>;

export const PendingActionRecordSchema = z.object({
  id: z.string(),
  standupId: z.string(),
  workspaceId: z.string(),
  type: z.enum([
    "notify",
    "ask_clarification",
    "post_summary",
    "request_approval",
    "stop",
    "follow_up",
  ]),
  targetUserId: z.string().optional(),
  platform: PlatformSchema.optional(),
  message: z.string(),
  status: PendingActionStatusSchema.default("pending"),
  requiresApproval: z.boolean().default(true),
  payload: z.record(z.unknown()).optional(),
  error: z.string().optional(),
  createdAt: z.string().optional(),
  executedAt: z.string().optional(),
});
export type PendingActionRecord = z.infer<typeof PendingActionRecordSchema>;

export const StandupSummaryRecordSchema = z.object({
  id: z.string(),
  standupId: z.string(),
  workspaceId: z.string(),
  channelId: z.string(),
  messageTs: z.string().optional(),
  content: z.string(),
  blockersCount: z.number().default(0),
  createdAt: z.string().optional(),
});
export type StandupSummaryRecord = z.infer<typeof StandupSummaryRecordSchema>;

export const AgentEventRecordSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  eventType: z.string(),
  payload: z.record(z.unknown()).default({}),
  createdAt: z.string().optional(),
});
export type AgentEventRecord = z.infer<typeof AgentEventRecordSchema>;

export const EnvironmentEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("message.received"),
    platform: PlatformSchema,
    workspaceId: z.string(),
    channelId: z.string(),
    userId: z.string(),
    text: z.string(),
    messageId: z.string(),
    timestamp: z.string(),
    raw: z.unknown().optional(),
  }),
  z.object({
    type: z.literal("dm.received"),
    platform: PlatformSchema,
    workspaceId: z.string(),
    channelId: z.string(),
    userId: z.string(),
    text: z.string(),
    messageId: z.string(),
    timestamp: z.string(),
    raw: z.unknown().optional(),
  }),
  z.object({
    type: z.literal("interaction.received"),
    platform: PlatformSchema,
    workspaceId: z.string(),
    channelId: z.string(),
    userId: z.string(),
    text: z.string(),
    messageId: z.string(),
    timestamp: z.string(),
    raw: z.unknown().optional(),
  }),
]);
export type EnvironmentEvent = z.infer<typeof EnvironmentEventSchema>;

export const AgentBlockerSchema = z.object({
  type: z.enum(["explicit", "implicit", "dependency", "recurring", "risk"]),
  blockedPerson: z.string().optional(),
  responsiblePerson: z.string().optional(),
  subject: z.string(),
  evidence: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1),
});
export type AgentBlocker = z.infer<typeof AgentBlockerSchema>;

export const AgentActionSchema = z.object({
  id: z.string(),
  type: z.enum([
    "notify",
    "ask_clarification",
    "post_summary",
    "request_approval",
    "stop",
    "follow_up",
  ]),
  target: z.string().optional(),
  platform: PlatformSchema.optional(),
  message: z.string(),
  requiresApproval: z.boolean().default(true),
});
export type AgentAction = z.infer<typeof AgentActionSchema>;

export const AgentDecisionSchema = z.object({
  summary: z.string(),
  blockers: z.array(AgentBlockerSchema).default([]),
  actions: z.array(AgentActionSchema).default([]),
  state: z.enum([
    "OBSERVING",
    "ANALYZING",
    "WAITING",
    "ACTION_REQUIRED",
    "FOLLOWING_UP",
    "RESOLVED",
  ]),
});
export type AgentDecision = z.infer<typeof AgentDecisionSchema>;
