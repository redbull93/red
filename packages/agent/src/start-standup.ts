import {
  createAgentEvent,
  createStandup,
  listUsersByWorkspace,
} from "@red/database";
import type { Platform, Standup, User } from "@red/shared";
import { nanoid } from "nanoid";
import type { AgentPlatformPort } from "./ports";
import { formatStandupGreeting } from "./questions";

export interface StartStandupOptions {
  workspaceId: string;
  platform: Platform;
  port: AgentPlatformPort;
  users?: User[];
}

export async function startStandup(
  options: StartStandupOptions,
): Promise<Standup> {
  const { workspaceId, platform, port } = options;

  const standupId = `std_${nanoid(10)}`;
  const today = new Date().toISOString().split("T")[0];

  const standup: Standup = {
    id: standupId,
    workspaceId,
    date: today,
    status: "in_progress",
    startedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };

  await createStandup(standup);

  await createAgentEvent({
    id: `evt_${nanoid(10)}`,
    workspaceId,
    eventType: "standup.started",
    payload: { standupId, date: today, platform },
  });

  const teamUsers =
    options.users ?? (await listUsersByWorkspace(workspaceId));

  for (const user of teamUsers) {
    try {
      const greeting = formatStandupGreeting(user.name);
      await port.sendDM(platform, user.platformUserId, greeting);
    } catch (err) {
      console.warn(
        `Failed to send standup DM to ${user.name} (${user.platformUserId}):`,
        err,
      );
    }
  }

  return standup;
}
