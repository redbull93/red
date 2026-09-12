import type { User } from "@red/shared";
import { getSupabaseClient } from "../client";
import { getMemoryStore } from "../memory-store";

export async function getUser(id: string): Promise<User | null> {
  const client = getSupabaseClient();
  if (client) {
    const { data, error } = await client
      .from("users")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.warn("Failed to get user from Supabase:", error.message);
    } else if (data) {
      return {
        id: data.id,
        workspaceId: data.workspace_id,
        platformUserId: data.platform_user_id,
        name: data.name,
        email: data.email ?? undefined,
        role: data.role ?? undefined,
        avatarUrl: data.avatar_url ?? undefined,
        createdAt: data.created_at,
      };
    }
  }

  const found = getMemoryStore().users.find((u) => u.id === id);
  return found ?? null;
}

export async function getUserByPlatformId(
  workspaceId: string,
  platformUserId: string,
): Promise<User | null> {
  const client = getSupabaseClient();
  if (client) {
    const { data, error } = await client
      .from("users")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("platform_user_id", platformUserId)
      .maybeSingle();

    if (error) {
      console.warn("Failed to get user by platform ID from Supabase:", error.message);
    } else if (data) {
      return {
        id: data.id,
        workspaceId: data.workspace_id,
        platformUserId: data.platform_user_id,
        name: data.name,
        email: data.email ?? undefined,
        role: data.role ?? undefined,
        avatarUrl: data.avatar_url ?? undefined,
        createdAt: data.created_at,
      };
    }
  }

  const found = getMemoryStore().users.find(
    (u) => u.workspaceId === workspaceId && u.platformUserId === platformUserId,
  );
  return found ?? null;
}

export async function upsertUser(user: User): Promise<User> {
  const client = getSupabaseClient();
  if (client) {
    const { data, error } = await client
      .from("users")
      .upsert({
        id: user.id,
        workspace_id: user.workspaceId,
        platform_user_id: user.platformUserId,
        name: user.name,
        email: user.email ?? null,
        role: user.role ?? "engineer",
        avatar_url: user.avatarUrl ?? null,
      })
      .select()
      .single();

    if (error) {
      console.warn("Failed to upsert user in Supabase:", error.message);
    } else if (data) {
      user = {
        id: data.id,
        workspaceId: data.workspace_id,
        platformUserId: data.platform_user_id,
        name: data.name,
        email: data.email ?? undefined,
        role: data.role ?? undefined,
        avatarUrl: data.avatar_url ?? undefined,
        createdAt: data.created_at,
      };
    }
  }

  const store = getMemoryStore();
  const index = store.users.findIndex((u) => u.id === user.id);
  if (index >= 0) {
    store.users[index] = user;
  } else {
    store.users.push(user);
  }
  return user;
}

export async function listUsersByWorkspace(workspaceId: string): Promise<User[]> {
  const client = getSupabaseClient();
  if (client) {
    const { data, error } = await client
      .from("users")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: true });

    if (error) {
      console.warn("Failed to list users from Supabase:", error.message);
    } else if (data && data.length > 0) {
      return data.map((d) => ({
        id: d.id,
        workspaceId: d.workspace_id,
        platformUserId: d.platform_user_id,
        name: d.name,
        email: d.email ?? undefined,
        role: d.role ?? undefined,
        avatarUrl: d.avatar_url ?? undefined,
        createdAt: d.created_at,
      }));
    }
  }

  return getMemoryStore().users.filter((u) => u.workspaceId === workspaceId);
}

export async function listUsers(workspaceId?: string): Promise<User[]> {
  if (workspaceId) {
    return listUsersByWorkspace(workspaceId);
  }
  const client = getSupabaseClient();
  if (client) {
    const { data, error } = await client.from("users").select("*");
    if (!error && data) {
      return data.map((d) => ({
        id: d.id,
        workspaceId: d.workspace_id,
        platformUserId: d.platform_user_id,
        name: d.name,
        email: d.email ?? undefined,
        role: d.role ?? undefined,
        avatarUrl: d.avatar_url ?? undefined,
        createdAt: d.created_at,
      }));
    }
  }
  return getMemoryStore().users;
}

