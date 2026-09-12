import type { Standup, StandupStatus } from "@red/shared";
import { getSupabaseClient } from "../client";
import { getMemoryStore } from "../memory-store";

export async function getStandup(id: string): Promise<Standup | null> {
  const client = getSupabaseClient();
  if (client) {
    const { data, error } = await client
      .from("standups")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.warn("Failed to get standup from Supabase:", error.message);
    } else if (data) {
      return {
        id: data.id,
        workspaceId: data.workspace_id,
        date: data.date,
        status: data.status as StandupStatus,
        summary: data.summary ?? undefined,
        startedAt: data.started_at ?? undefined,
        completedAt: data.completed_at ?? undefined,
        createdAt: data.created_at,
      };
    }
  }

  const found = getMemoryStore().standups.find((s) => s.id === id);
  return found ?? null;
}

export async function getLatestStandup(workspaceId: string): Promise<Standup | null> {
  const client = getSupabaseClient();
  if (client) {
    const { data, error } = await client
      .from("standups")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn("Failed to get latest standup from Supabase:", error.message);
    } else if (data) {
      return {
        id: data.id,
        workspaceId: data.workspace_id,
        date: data.date,
        status: data.status as StandupStatus,
        summary: data.summary ?? undefined,
        startedAt: data.started_at ?? undefined,
        completedAt: data.completed_at ?? undefined,
        createdAt: data.created_at,
      };
    }
  }

  const matches = getMemoryStore().standups.filter((s) => s.workspaceId === workspaceId);
  if (matches.length === 0) return null;
  return matches[matches.length - 1];
}

export async function createStandup(standup: Standup): Promise<Standup> {
  const client = getSupabaseClient();
  if (client) {
    const { data, error } = await client
      .from("standups")
      .upsert({
        id: standup.id,
        workspace_id: standup.workspaceId,
        date: standup.date,
        status: standup.status,
        summary: standup.summary ?? null,
        started_at: standup.startedAt ?? new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.warn("Failed to create standup in Supabase:", error.message);
    } else if (data) {
      standup = {
        id: data.id,
        workspaceId: data.workspace_id,
        date: data.date,
        status: data.status as StandupStatus,
        summary: data.summary ?? undefined,
        startedAt: data.started_at ?? undefined,
        completedAt: data.completed_at ?? undefined,
        createdAt: data.created_at,
      };
    }
  }

  const store = getMemoryStore();
  const index = store.standups.findIndex((s) => s.id === standup.id);
  if (index >= 0) {
    store.standups[index] = standup;
  } else {
    store.standups.push(standup);
  }
  return standup;
}

export async function updateStandupStatus(
  id: string,
  status: StandupStatus,
  summary?: string,
): Promise<Standup | null> {
  const completedAt = status === "completed" ? new Date().toISOString() : undefined;
  const client = getSupabaseClient();
  if (client) {
    const updatePayload: Record<string, unknown> = { status };
    if (summary !== undefined) updatePayload.summary = summary;
    if (completedAt) updatePayload.completed_at = completedAt;

    const { data, error } = await client
      .from("standups")
      .update(updatePayload)
      .eq("id", id)
      .select()
      .maybeSingle();

    if (error) {
      console.warn("Failed to update standup status in Supabase:", error.message);
    } else if (data) {
      return {
        id: data.id,
        workspaceId: data.workspace_id,
        date: data.date,
        status: data.status as StandupStatus,
        summary: data.summary ?? undefined,
        startedAt: data.started_at ?? undefined,
        completedAt: data.completed_at ?? undefined,
        createdAt: data.created_at,
      };
    }
  }

  const item = getMemoryStore().standups.find((s) => s.id === id);
  if (item) {
    item.status = status;
    if (summary !== undefined) item.summary = summary;
    if (completedAt) item.completedAt = completedAt;
    return item;
  }
  return null;
}

export async function listStandups(
  workspaceId?: string,
  limit = 20,
): Promise<Standup[]> {
  const client = getSupabaseClient();
  if (client) {
    let query = client.from("standups").select("*").order("created_at", { ascending: false }).limit(limit);
    if (workspaceId) {
      query = query.eq("workspace_id", workspaceId);
    }

    const { data, error } = await query;
    if (error) {
      console.warn("Failed to list standups from Supabase:", error.message);
    } else if (data && data.length > 0) {
      return data.map((d) => ({
        id: d.id,
        workspaceId: d.workspace_id,
        date: d.date,
        status: d.status as StandupStatus,
        summary: d.summary ?? undefined,
        startedAt: d.started_at ?? undefined,
        completedAt: d.completed_at ?? undefined,
        createdAt: d.created_at,
      }));
    }
  }

  let list = getMemoryStore().standups;
  if (workspaceId) {
    list = list.filter((s) => s.workspaceId === workspaceId);
  }
  return list.slice(-limit).reverse();
}
