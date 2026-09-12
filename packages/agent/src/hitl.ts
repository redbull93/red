import {
  createAgentEvent,
  getAction,
  updateActionStatus,
} from "@red/database";
import type { PendingActionRecord, PendingActionStatus } from "@red/shared";
import { nanoid } from "nanoid";
import type { AgentPlatformPort } from "./ports";

export interface HITLDecisionResult {
  action: PendingActionRecord;
  success: boolean;
  message: string;
}

export async function handleActionDecision(
  actionId: string,
  decision: "approved" | "rejected",
  approverUserId: string,
  port: AgentPlatformPort,
): Promise<HITLDecisionResult> {
  const action = await getAction(actionId);
  if (!action) {
    throw new Error(`Action with ID ${actionId} not found`);
  }

  if (action.status !== "pending") {
    return {
      action,
      success: false,
      message: `Action is already ${action.status}`,
    };
  }

  if (decision === "rejected") {
    const updated = await updateActionStatus(actionId, "rejected");
    await createAgentEvent({
      id: `evt_${nanoid(10)}`,
      workspaceId: action.workspaceId,
      eventType: "hitl.rejected",
      payload: { actionId, approverUserId },
    });
    return {
      action: updated || action,
      success: true,
      message: `Action ${actionId} was rejected by ${approverUserId}`,
    };
  }

  // If approved, execute action
  try {
    if (action.targetUserId && action.platform) {
      await port.sendDM(action.platform, action.targetUserId, action.message);
    }

    const updated = await updateActionStatus(actionId, "executed");

    await createAgentEvent({
      id: `evt_${nanoid(10)}`,
      workspaceId: action.workspaceId,
      eventType: "hitl.approved",
      payload: { actionId, approverUserId, executed: true },
    });

    return {
      action: updated || action,
      success: true,
      message: `Action ${actionId} approved and executed successfully`,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await updateActionStatus(actionId, "failed", errMsg);

    return {
      action,
      success: false,
      message: `Execution failed: ${errMsg}`,
    };
  }
}
