import type { WebClient } from "@slack/web-api";

function envTeamIds(): string[] {
  return (process.env.SLACK_TEAM_USER_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.startsWith("U"));
}

async function isHuman(
  client: WebClient,
  userId: string,
  botUserId: string | undefined,
): Promise<boolean> {
  if (userId === botUserId || userId === "USLACKBOT") return false;
  try {
    const info = await client.users.info({ user: userId });
    const user = info.user;
    if (!user || user.deleted || user.is_bot) return false;
    return true;
  } catch {
    return userId.startsWith("U");
  }
}

async function channelMemberIds(
  client: WebClient,
  channelId: string,
): Promise<string[]> {
  const ids: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await client.conversations.members({
      channel: channelId,
      cursor,
      limit: 200,
    });
    ids.push(...(page.members ?? []));
    cursor = page.response_metadata?.next_cursor || undefined;
  } while (cursor);
  return ids;
}

/** Prefer .env list, else humans in the channel, else the person who ran /standup. */
export async function resolveStandupUserIds(
  client: WebClient,
  options: {
    channelId: string;
    invokerUserId: string;
    botUserId?: string;
  },
): Promise<{ ids: string[]; source: "env" | "channel" | "invoker" }> {
  const fromEnv = envTeamIds();
  if (fromEnv.length > 0) {
    return { ids: fromEnv, source: "env" };
  }

  try {
    const raw = await channelMemberIds(client, options.channelId);
    const humans: string[] = [];
    for (const id of raw) {
      if (await isHuman(client, id, options.botUserId)) humans.push(id);
    }
    if (humans.length > 0) {
      return { ids: humans, source: "channel" };
    }
  } catch {
    // Missing channels:read / groups:read — still DM the invoker.
  }

  return { ids: [options.invokerUserId], source: "invoker" };
}
