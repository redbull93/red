import type { WebClient } from "@slack/web-api";

export type ChannelLine = {
  userId: string;
  name: string;
  text: string;
  ts: string;
};

const SKIP_SUBTYPES = new Set([
  "channel_join",
  "channel_leave",
  "channel_topic",
  "channel_purpose",
  "channel_name",
  "message_changed",
  "message_deleted",
  "bot_message",
]);

type DirectoryEntry = { name: string; bot: boolean };

export async function readChannelTranscript(
  client: WebClient,
  channelId: string,
  options: { botUserId?: string } = {},
): Promise<{ lines: ChannelLine[]; error?: string }> {
  try {
    const directory = await loadDirectory(client);
    const history = await client.conversations.history({
      channel: channelId,
      limit: 80,
    });
    const parents = [...(history.messages ?? [])].reverse();
    const raw: ChannelLine[] = [];

    const take = async (
      message: {
        user?: string;
        bot_id?: string;
        subtype?: string;
        text?: string;
        ts?: string;
        reply_count?: number;
      },
    ) => {
      if (message.subtype && SKIP_SUBTYPES.has(message.subtype)) return;
      if (message.bot_id) return;
      const userId = message.user;
      const text = message.text?.trim();
      if (!userId || !text || !message.ts) return;
      if (options.botUserId && userId === options.botUserId) return;
      if (directory.get(userId)?.bot) return;
      if (isBotNoise(text)) return;
      raw.push({
        userId,
        name: directory.get(userId)?.name ?? userId,
        text,
        ts: message.ts,
      });
    };

    let threaded = 0;
    for (const message of parents) {
      await take(message);
      const replies = Number(message.reply_count ?? 0);
      if (replies > 0 && message.ts && threaded < 8) {
        threaded += 1;
        const thread = await client.conversations.replies({
          channel: channelId,
          ts: message.ts,
          limit: 30,
        });
        for (const reply of thread.messages ?? []) {
          if (reply.ts === message.ts) continue;
          await take(reply);
        }
      }
    }

    const unresolved = raw.filter((line) => line.name === line.userId);
    for (const line of unresolved) {
      const resolved = await lookupUser(client, line.userId);
      if (resolved) directory.set(line.userId, resolved);
    }

    const lines = raw
      .filter((line) => !directory.get(line.userId)?.bot)
      .map((line) => ({
        ...line,
        name: directory.get(line.userId)?.name ?? line.name,
        text: unwrapMentions(line.text, directory),
      }))
      .sort((a, b) => Number(a.ts) - Number(b.ts));

    return { lines };
  } catch (error) {
    return { lines: [], error: slackErrorText(error) };
  }
}

export function isBotNoise(text: string): boolean {
  const t = text
    .replace(/<@[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (!t) return true;
  return (
    /reading this channel/.test(t) ||
    /project status from this channel/.test(t) ||
    /^(status|start|demo)$/.test(t) ||
    /^\/standup\b/.test(t) ||
    /what'?s the current status/.test(t) ||
    /what is the status/.test(t) ||
    /status of (this|the project|the channel)/.test(t) ||
    /current status of the project/.test(t) ||
    /stand-up is in this thread/.test(t) ||
    /stand-up started/.test(t) ||
    /three questions/.test(t) ||
    /what did you finish/.test(t) ||
    /what are you working on/.test(t) ||
    /what'?s blocking you/.test(t) ||
    /dmed 0 person/.test(t) ||
    /could not dm/.test(t) ||
    /asked \d+ person/.test(t) ||
    /everyone is in/.test(t) ||
    /i live in \*this\* channel/.test(t) ||
    /i run stand-up/.test(t) ||
    /project manager briefing/.test(t) ||
    /action items/.test(t) ||
    /follow-ups/.test(t)
  );
}

export function slackErrorText(error: unknown): string {
  if (error && typeof error === "object") {
    const data = (error as { data?: { error?: string; needed?: string } }).data;
    if (data?.error) {
      return data.needed ? `${data.error} (need ${data.needed})` : data.error;
    }
  }
  return error instanceof Error ? error.message : String(error);
}

async function loadDirectory(
  client: WebClient,
): Promise<Map<string, DirectoryEntry>> {
  const directory = new Map<string, DirectoryEntry>();
  try {
    let cursor: string | undefined;
    do {
      const page = await client.users.list({ cursor, limit: 200 });
      for (const user of page.members ?? []) {
        if (!user.id || user.deleted) continue;
        directory.set(user.id, {
          name:
            user.profile?.display_name ||
            user.real_name ||
            user.name ||
            user.id,
          bot: Boolean(user.is_bot || user.id === "USLACKBOT"),
        });
      }
      cursor = page.response_metadata?.next_cursor || undefined;
    } while (cursor);
  } catch {
    // users:read missing — lookupUser will try one-by-one
  }
  return directory;
}

async function lookupUser(
  client: WebClient,
  userId: string,
): Promise<DirectoryEntry | undefined> {
  try {
    const info = await client.users.info({ user: userId });
    const user = info.user;
    if (!user?.id) return undefined;
    return {
      name:
        user.profile?.display_name ||
        user.real_name ||
        user.name ||
        userId,
      bot: Boolean(user.is_bot),
    };
  } catch {
    return undefined;
  }
}

function unwrapMentions(
  text: string,
  directory: Map<string, DirectoryEntry>,
): string {
  return text.replace(/<@([UW][A-Z0-9]+)(?:\|[^>]+)?>/g, (_, id: string) => {
    const name = directory.get(id)?.name;
    return name ? `@${name}` : `@${id}`;
  });
}
