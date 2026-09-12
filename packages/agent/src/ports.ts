import type { Platform } from "@red/shared";

export interface AgentPlatformPort {
  sendDM: (platform: Platform, userId: string, text: string) => Promise<void>;
  postToChannel: (
    platform: Platform,
    channelId: string,
    text: string,
  ) => Promise<{ messageTs?: string } | void>;
  requestApproval?: (
    platform: Platform,
    channelId: string,
    actionId: string,
    text: string,
  ) => Promise<void>;
}
