import { listUsersByWorkspace, listWorkspaces } from "@red/database";
import type { AgentPlatformPort } from "./ports";
import { startStandup } from "./start-standup";

export interface ScheduledStandupResult {
  triggeredAt: string;
  workspacesProcessed: number;
  standupsCreated: string[];
}

export async function runScheduledStandup(
  port: AgentPlatformPort,
): Promise<ScheduledStandupResult> {
  const workspaces = await listWorkspaces();
  const standupIds: string[] = [];

  for (const workspace of workspaces) {
    try {
      const users = await listUsersByWorkspace(workspace.id);
      const standup = await startStandup({
        workspaceId: workspace.id,
        platform: workspace.platform,
        port,
        users,
      });
      standupIds.push(standup.id);
      console.log(
        `[Schedule] Started standup ${standup.id} for workspace ${workspace.name} (${workspace.platform})`,
      );
    } catch (err) {
      console.error(
        `[Schedule] Failed to run standup for workspace ${workspace.id}:`,
        err,
      );
    }
  }

  return {
    triggeredAt: new Date().toISOString(),
    workspacesProcessed: workspaces.length,
    standupsCreated: standupIds,
  };
}
