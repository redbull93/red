import type { Platform, Workspace } from "@red/shared";
import { getSupabaseClient } from "../client";
import { getMemoryStore } from "../memory-store";

export async function getWorkspace(id: string): Promise<Workspace | null> {
  const client = getSupabaseClient();
  if (client) {
    const { data, error } = await client
      .from("workspaces")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.warn("Failed to get workspace from Supabase:", error.message);
    } else if (data) {
      return {
        id: data.id,
        name: data.name,
        platform: data.platform as Platform,
        teamId: data.team_id ?? undefined,
        channelId: data.channel_id,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
    }
  }

  const found = getMemoryStore().workspaces.find((w) => w.id === id);
  return found ?? null;
}

export async function getWorkspaceByTeamId(
  platform: Platform,
  teamId: string,
): Promise<Workspace | null> {
  const client = getSupabaseClient();
  if (client) {
    const { data, error } = await client
      .from("workspaces")
      .select("*")
      .eq("platform", platform)
      .eq("team_id", teamId)
      .maybeSingle();

    if (error) {
      console.warn("Failed to get workspace by teamId from Supabase:", error.message);
    } else if (data) {
      return {
        id: data.id,
        name: data.name,
        platform: data.platform as Platform,
        teamId: data.team_id ?? undefined,
        channelId: data.channel_id,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
    }
  }

  const found = getMemoryStore().workspaces.find(
    (w) => w.platform === platform && w.teamId === teamId,
  );
  return found ?? null;
}

export async function upsertWorkspace(workspace: Workspace): Promise<Workspace> {
  const client = getSupabaseClient();
  if (client) {
    const { data, error } = await client
      .from("workspaces")
      .upsert({
        id: workspace.id,
        name: workspace.name,
        platform: workspace.platform,
        team_id: workspace.teamId ?? null,
        channel_id: workspace.channelId,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.warn("Failed to upsert workspace in Supabase:", error.message);
    } else if (data) {
      workspace = {
        id: data.id,
        name: data.name,
        platform: data.platform as Platform,
        teamId: data.team_id ?? undefined,
        channelId: data.channel_id,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      };
    }
  }

  const store = getMemoryStore();
  const index = store.workspaces.findIndex((w) => w.id === workspace.id);
  if (index >= 0) {
    store.workspaces[index] = workspace;
  } else {
    store.workspaces.push(workspace);
  }
  return workspace;
}

export async function listWorkspaces(): Promise<Workspace[]> {
  const client = getSupabaseClient();
  if (client) {
    const { data, error } = await client
      .from("workspaces")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.warn("Failed to list workspaces from Supabase:", error.message);
    } else if (data && data.length > 0) {
      return data.map((d) => ({
        id: d.id,
        name: d.name,
        platform: d.platform as Platform,
        teamId: d.team_id ?? undefined,
        channelId: d.channel_id,
        createdAt: d.created_at,
        updatedAt: d.updated_at,
      }));
    }
  }

  return [...getMemoryStore().workspaces];
}
