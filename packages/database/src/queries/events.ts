import type { AgentEventRecord } from "@red/shared";
import { getSupabaseClient } from "../client";
import { getMemoryStore } from "../memory-store";

export async function createAgentEvent(
  event: AgentEventRecord,
): Promise<AgentEventRecord> {
  const client = getSupabaseClient();
  if (client) {
    const { data, error } = await client
      .from("agent_events")
      .insert({
        id: event.id,
        workspace_id: event.workspaceId,
        event_type: event.eventType,
        payload: event.payload,
        created_at: event.createdAt ?? new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.warn("Failed to create agent event in Supabase:", error.message);
    } else if (data) {
      event = {
        id: data.id,
        workspaceId: data.workspace_id,
        eventType: data.event_type,
        payload: data.payload,
        createdAt: data.created_at,
      };
    }
  }

  const store = getMemoryStore();
  store.agentEvents.push(event);
  return event;
}

export async function listAgentEvents(
  workspaceId: string,
  limit = 50,
): Promise<AgentEventRecord[]> {
  const client = getSupabaseClient();
  if (client) {
    const { data, error } = await client
      .from("agent_events")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.warn("Failed to list agent events from Supabase:", error.message);
    } else if (data && data.length > 0) {
      return data.map((d) => ({
        id: d.id,
        workspaceId: d.workspace_id,
        eventType: d.event_type,
        payload: d.payload,
        createdAt: d.created_at,
      }));
    }
  }

  return getMemoryStore()
    .agentEvents.filter((e) => e.workspaceId === workspaceId)
    .slice(-limit)
    .reverse();
}
