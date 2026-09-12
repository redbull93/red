import type { StandupSummaryRecord } from "@red/shared";
import { getSupabaseClient } from "../client";
import { getMemoryStore } from "../memory-store";

export async function createStandupSummary(
  summary: StandupSummaryRecord,
): Promise<StandupSummaryRecord> {
  const client = getSupabaseClient();
  if (client) {
    const { data, error } = await client
      .from("standup_summaries")
      .insert({
        id: summary.id,
        standup_id: summary.standupId,
        workspace_id: summary.workspaceId,
        channel_id: summary.channelId,
        message_ts: summary.messageTs ?? null,
        content: summary.content,
        blockers_count: summary.blockersCount,
        created_at: summary.createdAt ?? new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.warn("Failed to create standup summary in Supabase:", error.message);
    } else if (data) {
      summary = {
        id: data.id,
        standupId: data.standup_id,
        workspaceId: data.workspace_id,
        channelId: data.channel_id,
        messageTs: data.message_ts ?? undefined,
        content: data.content,
        blockersCount: data.blockers_count,
        createdAt: data.created_at,
      };
    }
  }

  const store = getMemoryStore();
  store.standupSummaries.push(summary);
  return summary;
}

export async function getLatestSummary(
  workspaceId: string,
): Promise<StandupSummaryRecord | null> {
  const client = getSupabaseClient();
  if (client) {
    const { data, error } = await client
      .from("standup_summaries")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn("Failed to get latest summary from Supabase:", error.message);
    } else if (data) {
      return {
        id: data.id,
        standupId: data.standup_id,
        workspaceId: data.workspace_id,
        channelId: data.channel_id,
        messageTs: data.message_ts ?? undefined,
        content: data.content,
        blockersCount: data.blockers_count,
        createdAt: data.created_at,
      };
    }
  }

  const matches = getMemoryStore().standupSummaries.filter(
    (s) => s.workspaceId === workspaceId,
  );
  if (matches.length === 0) return null;
  return matches[matches.length - 1];
}
