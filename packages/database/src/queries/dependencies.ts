import type { DependencyRecord, DependencyStatus } from "@red/shared";
import { getSupabaseClient } from "../client";
import { getMemoryStore } from "../memory-store";

export async function createDependency(
  dep: DependencyRecord,
): Promise<DependencyRecord> {
  const client = getSupabaseClient();
  if (client) {
    const { data, error } = await client
      .from("dependencies")
      .insert({
        id: dep.id,
        standup_id: dep.standupId,
        workspace_id: dep.workspaceId,
        blocker_user_id: dep.blockerUserId ?? null,
        blocked_user_id: dep.blockedUserId ?? null,
        blocker_name: dep.blockerName ?? null,
        blocked_name: dep.blockedName ?? null,
        subject: dep.subject,
        type: dep.type,
        status: dep.status,
        confidence: dep.confidence,
        evidence: dep.evidence,
        created_at: dep.createdAt ?? new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.warn("Failed to create dependency in Supabase:", error.message);
    } else if (data) {
      dep = {
        id: data.id,
        standupId: data.standup_id,
        workspaceId: data.workspace_id,
        blockerUserId: data.blocker_user_id ?? undefined,
        blockedUserId: data.blocked_user_id ?? undefined,
        blockerName: data.blocker_name ?? undefined,
        blockedName: data.blocked_name ?? undefined,
        subject: data.subject,
        type: data.type,
        status: data.status as DependencyStatus,
        confidence: Number(data.confidence),
        evidence: data.evidence ?? [],
        createdAt: data.created_at,
        resolvedAt: data.resolved_at ?? undefined,
      };
    }
  }

  const store = getMemoryStore();
  store.dependencies.push(dep);
  return dep;
}

export async function updateDependencyStatus(
  id: string,
  status: DependencyStatus,
  resolvedAt?: string,
): Promise<DependencyRecord | null> {
  const client = getSupabaseClient();
  if (client) {
    const updatePayload: Record<string, unknown> = { status };
    if (resolvedAt || status === "resolved") {
      updatePayload.resolved_at = resolvedAt || new Date().toISOString();
    }

    const { data, error } = await client
      .from("dependencies")
      .update(updatePayload)
      .eq("id", id)
      .select()
      .maybeSingle();

    if (error) {
      console.warn("Failed to update dependency status in Supabase:", error.message);
    } else if (data) {
      return {
        id: data.id,
        standupId: data.standup_id,
        workspaceId: data.workspace_id,
        blockerUserId: data.blocker_user_id ?? undefined,
        blockedUserId: data.blocked_user_id ?? undefined,
        blockerName: data.blocker_name ?? undefined,
        blockedName: data.blocked_name ?? undefined,
        subject: data.subject,
        type: data.type,
        status: data.status as DependencyStatus,
        confidence: Number(data.confidence),
        evidence: data.evidence ?? [],
        createdAt: data.created_at,
        resolvedAt: data.resolved_at ?? undefined,
      };
    }
  }

  const found = getMemoryStore().dependencies.find((d) => d.id === id);
  if (found) {
    found.status = status;
    if (status === "resolved") {
      found.resolvedAt = resolvedAt || new Date().toISOString();
    }
    return found;
  }
  return null;
}

export async function listDependencies(
  workspaceId?: string,
  standupId?: string,
): Promise<DependencyRecord[]> {
  const client = getSupabaseClient();
  if (client) {
    let query = client.from("dependencies").select("*").order("created_at", { ascending: false });
    if (workspaceId) {
      query = query.eq("workspace_id", workspaceId);
    }
    if (standupId) {
      query = query.eq("standup_id", standupId);
    }

    const { data, error } = await query;
    if (error) {
      console.warn("Failed to list dependencies from Supabase:", error.message);
    } else if (data && data.length > 0) {
      return data.map((d) => ({
        id: d.id,
        standupId: d.standup_id,
        workspaceId: d.workspace_id,
        blockerUserId: d.blocker_user_id ?? undefined,
        blockedUserId: d.blocked_user_id ?? undefined,
        blockerName: d.blocker_name ?? undefined,
        blockedName: d.blocked_name ?? undefined,
        subject: d.subject,
        type: d.type,
        status: d.status as DependencyStatus,
        confidence: Number(d.confidence),
        evidence: d.evidence ?? [],
        createdAt: d.created_at,
        resolvedAt: d.resolved_at ?? undefined,
      }));
    }
  }

  return getMemoryStore().dependencies.filter((d) => {
    if (workspaceId && d.workspaceId !== workspaceId) return false;
    if (standupId && d.standupId !== standupId) return false;
    return true;
  });
}
