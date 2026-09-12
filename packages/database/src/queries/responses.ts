import type { Platform, StandupResponse } from "@red/shared";
import { getSupabaseClient } from "../client";
import { getMemoryStore } from "../memory-store";

export async function createResponse(
  response: StandupResponse,
): Promise<StandupResponse> {
  const client = getSupabaseClient();
  if (client) {
    const { data, error } = await client
      .from("standup_responses")
      .insert({
        id: response.id,
        standup_id: response.standupId,
        user_id: response.userId,
        workspace_id: response.workspaceId,
        platform: response.platform,
        finished: response.finished ?? null,
        working_on: response.workingOn ?? null,
        blocked_by: response.blockedBy ?? null,
        raw_text: response.rawText,
        created_at: response.createdAt,
      })
      .select()
      .single();

    if (error) {
      console.warn("Failed to create response in Supabase:", error.message);
    } else if (data) {
      response = {
        id: data.id,
        workspaceId: data.workspace_id,
        platform: data.platform as Platform,
        userId: data.user_id,
        userName: response.userName,
        channelId: response.channelId,
        standupId: data.standup_id,
        finished: data.finished ?? undefined,
        workingOn: data.working_on ?? undefined,
        blockedBy: data.blocked_by ?? undefined,
        rawText: data.raw_text,
        createdAt: data.created_at,
      };
    }
  }

  const store = getMemoryStore();
  store.standupResponses.push(response);
  return response;
}

export async function listResponsesByStandup(
  standupId: string,
): Promise<StandupResponse[]> {
  const client = getSupabaseClient();
  if (client) {
    const { data, error } = await client
      .from("standup_responses")
      .select("*")
      .eq("standup_id", standupId)
      .order("created_at", { ascending: true });

    if (error) {
      console.warn("Failed to list responses from Supabase:", error.message);
    } else if (data && data.length > 0) {
      return data.map((d) => ({
        id: d.id,
        workspaceId: d.workspace_id,
        platform: d.platform as Platform,
        userId: d.user_id,
        standupId: d.standup_id,
        finished: d.finished ?? undefined,
        workingOn: d.working_on ?? undefined,
        blockedBy: d.blocked_by ?? undefined,
        rawText: d.raw_text,
        createdAt: d.created_at,
      }));
    }
  }

  return getMemoryStore().standupResponses.filter(
    (r) => r.standupId === standupId,
  );
}

export async function listResponsesByWorkspace(
  workspaceId: string,
  limit = 50,
): Promise<StandupResponse[]> {
  const client = getSupabaseClient();
  if (client) {
    const { data, error } = await client
      .from("standup_responses")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.warn("Failed to list workspace responses from Supabase:", error.message);
    } else if (data && data.length > 0) {
      return data.map((d) => ({
        id: d.id,
        workspaceId: d.workspace_id,
        platform: d.platform as Platform,
        userId: d.user_id,
        standupId: d.standup_id,
        finished: d.finished ?? undefined,
        workingOn: d.working_on ?? undefined,
        blockedBy: d.blocked_by ?? undefined,
        rawText: d.raw_text,
        createdAt: d.created_at,
      }));
    }
  }

  return getMemoryStore()
    .standupResponses.filter((r) => r.workspaceId === workspaceId)
    .slice(-limit)
    .reverse();
}
