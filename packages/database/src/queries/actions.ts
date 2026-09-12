import type {
  PendingActionRecord,
  PendingActionStatus,
  Platform,
} from "@red/shared";
import { getSupabaseClient } from "../client";
import { getMemoryStore } from "../memory-store";

export async function createPendingAction(
  action: PendingActionRecord,
): Promise<PendingActionRecord> {
  const client = getSupabaseClient();
  if (client) {
    const { data, error } = await client
      .from("pending_actions")
      .insert({
        id: action.id,
        standup_id: action.standupId,
        workspace_id: action.workspaceId,
        type: action.type,
        target_user_id: action.targetUserId ?? null,
        platform: action.platform ?? null,
        message: action.message,
        status: action.status,
        requires_approval: action.requiresApproval,
        payload: action.payload ?? {},
        error: action.error ?? null,
        created_at: action.createdAt ?? new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.warn("Failed to create pending action in Supabase:", error.message);
    } else if (data) {
      action = {
        id: data.id,
        standupId: data.standup_id,
        workspaceId: data.workspace_id,
        type: data.type,
        targetUserId: data.target_user_id ?? undefined,
        platform: data.platform as Platform | undefined,
        message: data.message,
        status: data.status as PendingActionStatus,
        requiresApproval: data.requires_approval,
        payload: data.payload ?? undefined,
        error: data.error ?? undefined,
        createdAt: data.created_at,
        executedAt: data.executed_at ?? undefined,
      };
    }
  }

  const store = getMemoryStore();
  store.pendingActions.push(action);
  return action;
}

export async function updateActionStatus(
  id: string,
  status: PendingActionStatus,
  error?: string,
): Promise<PendingActionRecord | null> {
  const executedAt = ["approved", "executed", "rejected", "failed"].includes(status)
    ? new Date().toISOString()
    : undefined;

  const client = getSupabaseClient();
  if (client) {
    const updatePayload: Record<string, unknown> = { status };
    if (error !== undefined) updatePayload.error = error;
    if (executedAt) updatePayload.executed_at = executedAt;

    const { data, error: sbErr } = await client
      .from("pending_actions")
      .update(updatePayload)
      .eq("id", id)
      .select()
      .maybeSingle();

    if (sbErr) {
      console.warn("Failed to update pending action status in Supabase:", sbErr.message);
    } else if (data) {
      return {
        id: data.id,
        standupId: data.standup_id,
        workspaceId: data.workspace_id,
        type: data.type,
        targetUserId: data.target_user_id ?? undefined,
        platform: data.platform as Platform | undefined,
        message: data.message,
        status: data.status as PendingActionStatus,
        requiresApproval: data.requires_approval,
        payload: data.payload ?? undefined,
        error: data.error ?? undefined,
        createdAt: data.created_at,
        executedAt: data.executed_at ?? undefined,
      };
    }
  }

  const found = getMemoryStore().pendingActions.find((a) => a.id === id);
  if (found) {
    found.status = status;
    if (error !== undefined) found.error = error;
    if (executedAt) found.executedAt = executedAt;
    return found;
  }
  return null;
}

export async function getAction(id: string): Promise<PendingActionRecord | null> {
  const client = getSupabaseClient();
  if (client) {
    const { data, error } = await client
      .from("pending_actions")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.warn("Failed to get action from Supabase:", error.message);
    } else if (data) {
      return {
        id: data.id,
        standupId: data.standup_id,
        workspaceId: data.workspace_id,
        type: data.type,
        targetUserId: data.target_user_id ?? undefined,
        platform: data.platform as Platform | undefined,
        message: data.message,
        status: data.status as PendingActionStatus,
        requiresApproval: data.requires_approval,
        payload: data.payload ?? undefined,
        error: data.error ?? undefined,
        createdAt: data.created_at,
        executedAt: data.executed_at ?? undefined,
      };
    }
  }

  const found = getMemoryStore().pendingActions.find((a) => a.id === id);
  return found ?? null;
}

export async function listPendingActions(
  workspaceId?: string,
  status?: PendingActionStatus,
): Promise<PendingActionRecord[]> {
  const client = getSupabaseClient();
  if (client) {
    let query = client.from("pending_actions").select("*").order("created_at", { ascending: false });
    if (workspaceId) {
      query = query.eq("workspace_id", workspaceId);
    }
    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;
    if (error) {
      console.warn("Failed to list pending actions from Supabase:", error.message);
    } else if (data && data.length > 0) {
      return data.map((d) => ({
        id: d.id,
        standupId: d.standup_id,
        workspaceId: d.workspace_id,
        type: d.type,
        targetUserId: d.target_user_id ?? undefined,
        platform: d.platform as Platform | undefined,
        message: d.message,
        status: d.status as PendingActionStatus,
        requiresApproval: d.requires_approval,
        payload: d.payload ?? undefined,
        error: d.error ?? undefined,
        createdAt: d.created_at,
        executedAt: d.executed_at ?? undefined,
      }));
    }
  }

  return getMemoryStore().pendingActions.filter((a) => {
    if (workspaceId && a.workspaceId !== workspaceId) return false;
    if (status && a.status !== status) return false;
    return true;
  });
}
