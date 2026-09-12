import {
  listDependencies,
  listResponsesByWorkspace,
  listStandups,
} from "@red/database";
import type { DependencyRecord, Standup, StandupResponse } from "@red/shared";

export interface WorkspaceHistoryMetrics {
  totalStandups: number;
  totalResponses: number;
  totalDependencies: number;
  activeDependencies: number;
  resolvedDependencies: number;
  recentStandups: Standup[];
  recentDependencies: DependencyRecord[];
  recentResponses: StandupResponse[];
}

export async function getWorkspaceHistoryMetrics(
  workspaceId: string,
): Promise<WorkspaceHistoryMetrics> {
  const standups = await listStandups(workspaceId, 10);
  const dependencies = await listDependencies(workspaceId);
  const responses = await listResponsesByWorkspace(workspaceId, 30);

  const activeDependencies = dependencies.filter((d) => d.status !== "resolved").length;
  const resolvedDependencies = dependencies.filter((d) => d.status === "resolved").length;

  return {
    totalStandups: standups.length,
    totalResponses: responses.length,
    totalDependencies: dependencies.length,
    activeDependencies,
    resolvedDependencies,
    recentStandups: standups,
    recentDependencies: dependencies.slice(0, 10),
    recentResponses: responses.slice(0, 10),
  };
}
