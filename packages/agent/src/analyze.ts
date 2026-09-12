import { ReasoningEngine } from "@red/ai";
import {
  createAgentEvent,
  createDependency,
  createPendingAction,
  createStandupSummary,
  listUsersByWorkspace,
  updateStandupStatus,
} from "@red/database";
import { reconcileBlockerWithGitHub } from "@red/github";
import type {
  AgentDecision,
  DependencyRecord,
  DependencyStatus,
  PendingActionRecord,
  StandupResponse,
  Workspace,
} from "@red/shared";
import { nanoid } from "nanoid";
import { formatChannelSummary } from "./format";
import type { AgentPlatformPort } from "./ports";

export interface AnalyzeSessionOptions {
  standupId: string;
  workspace: Workspace;
  responses: StandupResponse[];
  ai: ReasoningEngine;
  port: AgentPlatformPort;
}

export interface AnalysisResult {
  decision: AgentDecision;
  dependencies: DependencyRecord[];
  pendingActions: PendingActionRecord[];
  reconciliationNotes: string[];
}

export async function analyzeStandupSession(
  options: AnalyzeSessionOptions,
): Promise<AnalysisResult> {
  const { standupId, workspace, responses, ai, port } = options;

  // 1. Call Reasoning Engine
  const decision = await ai.analyzeStandup({
    team: { id: workspace.id, name: workspace.name },
    responses,
  });

  const teamUsers = await listUsersByWorkspace(workspace.id);
  const userMap = new Map(
    teamUsers.map((u) => [u.name.toLowerCase(), u.platformUserId]),
  );

  const reconciliationNotes: string[] = [];
  const createdDependencies: DependencyRecord[] = [];

  // 2. Process Blockers & GitHub Reality Checks
  for (const blocker of decision.blockers) {
    const depId = `dep_${nanoid(10)}`;

    // Cross-reference with GitHub
    const realityCheck = await reconcileBlockerWithGitHub(
      blocker.subject,
      blocker.evidence,
    );

    let depStatus: DependencyStatus = "detected";
    if (realityCheck) {
      reconciliationNotes.push(realityCheck.reconciliationNote);
      if (realityCheck.isAutoResolved) {
        depStatus = "resolved";
      } else {
        depStatus = "investigating";
      }
    }

    const blockedUserId = blocker.blockedPerson
      ? userMap.get(blocker.blockedPerson.toLowerCase())
      : undefined;
    const blockerUserId = blocker.responsiblePerson
      ? userMap.get(blocker.responsiblePerson.toLowerCase())
      : undefined;

    const depRecord = await createDependency({
      id: depId,
      standupId,
      workspaceId: workspace.id,
      blockedUserId,
      blockerUserId,
      blockedName: blocker.blockedPerson,
      blockerName: blocker.responsiblePerson,
      subject: blocker.subject,
      type: blocker.type,
      status: depStatus,
      confidence: blocker.confidence,
      evidence: blocker.evidence,
      createdAt: new Date().toISOString(),
      resolvedAt: depStatus === "resolved" ? new Date().toISOString() : undefined,
    });

    createdDependencies.push(depRecord);
  }

  // 3. Process Actions & HITL Queue
  const createdActions: PendingActionRecord[] = [];

  for (const action of decision.actions) {
    const actionId = `act_${nanoid(10)}`;
    const targetUserId = action.target
      ? userMap.get(action.target.toLowerCase()) ?? action.target
      : undefined;

    const actionRecord = await createPendingAction({
      id: actionId,
      standupId,
      workspaceId: workspace.id,
      type: action.type,
      targetUserId,
      platform: action.platform ?? workspace.platform,
      message: action.message,
      status: "pending",
      requiresApproval: action.requiresApproval,
      createdAt: new Date().toISOString(),
    });

    createdActions.push(actionRecord);

    if (action.type === "request_approval" && port.requestApproval) {
      await port.requestApproval(
        workspace.platform,
        workspace.channelId,
        actionId,
        action.message,
      );
    } else if (action.type === "notify" && !action.requiresApproval && targetUserId) {
      await port.sendDM(workspace.platform, targetUserId, action.message);
    }
  }

  // 4. Format & Post Channel Summary Receipt
  const formattedSummary = formatChannelSummary({
    decision,
    reconciliationNotes,
    totalTeammates: teamUsers.length > 0 ? teamUsers.length : responses.length,
    repliedTeammates: responses.length,
  });

  const channelReceipt = await port.postToChannel(
    workspace.platform,
    workspace.channelId,
    formattedSummary,
  );

  await createStandupSummary({
    id: `sum_${nanoid(10)}`,
    standupId,
    workspaceId: workspace.id,
    channelId: workspace.channelId,
    messageTs: channelReceipt?.messageTs,
    content: formattedSummary,
    blockersCount: decision.blockers.length,
    createdAt: new Date().toISOString(),
  });

  // 5. Update Standup Status
  await updateStandupStatus(standupId, "completed", decision.summary);

  await createAgentEvent({
    id: `evt_${nanoid(10)}`,
    workspaceId: workspace.id,
    eventType: "standup.completed",
    payload: {
      standupId,
      blockersCount: decision.blockers.length,
      actionsCount: decision.actions.length,
      autoResolvedCount: createdDependencies.filter((d) => d.status === "resolved").length,
    },
  });

  return {
    decision,
    dependencies: createdDependencies,
    pendingActions: createdActions,
    reconciliationNotes,
  };
}
