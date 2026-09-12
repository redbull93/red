import { z } from "zod";

export const PlatformSchema = z.enum(["slack", "discord"]);
export type Platform = z.infer<typeof PlatformSchema>;

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
