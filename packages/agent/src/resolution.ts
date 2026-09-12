import {
  listDependencies,
  updateDependencyStatus,
  createAgentEvent,
} from "@red/database";
import type { DependencyRecord, StandupResponse } from "@red/shared";
import { nanoid } from "nanoid";

export interface ResolvedDependencyInfo {
  dependency: DependencyRecord;
  reason: string;
}

export async function detectResolution(
  workspaceId: string,
  newResponses: StandupResponse[],
): Promise<ResolvedDependencyInfo[]> {
  const activeDependencies = (await listDependencies(workspaceId)).filter(
    (d) => d.status !== "resolved",
  );

  if (activeDependencies.length === 0) return [];

  const resolved: ResolvedDependencyInfo[] = [];

  for (const dep of activeDependencies) {
    // If we have a blocker name or user ID
    const relevantResponse = newResponses.find(
      (r) =>
        (dep.blockerUserId && r.userId === dep.blockerUserId) ||
        (dep.blockerName &&
          r.userName &&
          r.userName.toLowerCase().includes(dep.blockerName.toLowerCase())),
    );

    if (relevantResponse) {
      const finishedText = relevantResponse.finished?.toLowerCase() ?? "";
      const rawText = relevantResponse.rawText.toLowerCase();

      // Check if finished text contains keywords of the subject
      const subjectWords = dep.subject
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 3);

      const isResolved =
        subjectWords.some((w) => finishedText.includes(w)) ||
        finishedText.includes("done") ||
        finishedText.includes("merged") ||
        finishedText.includes("deployed");

      if (isResolved) {
        const reason = `Resolved by @${relevantResponse.userName}'s update: "${relevantResponse.finished || relevantResponse.rawText}"`;
        const updated = await updateDependencyStatus(dep.id, "resolved");

        if (updated) {
          resolved.push({ dependency: updated, reason });

          await createAgentEvent({
            id: `evt_${nanoid(10)}`,
            workspaceId,
            eventType: "dependency.resolved",
            payload: {
              dependencyId: dep.id,
              subject: dep.subject,
              resolvedByUserId: relevantResponse.userId,
              reason,
            },
          });
        }
      }
    }
  }

  return resolved;
}
