import { ingestEnvironmentEvent } from "@red/orchestrator";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type DiscordAuthor = {
  id?: string;
  username?: string;
  global_name?: string;
};

type DiscordPayload = {
  type?: number;
  token?: string;
  channel_id?: string;
  content?: string;
  author?: DiscordAuthor;
  data?: {
    name?: string;
    options?: Array<{ name: string; value: unknown }>;
  };
  member?: {
    user?: DiscordAuthor;
  };
};

/**
 * Discord interactions & events endpoint.
 * Handles Discord ping verification (Type 1) and channel messages / slash commands.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as DiscordPayload;

  // 1. Discord ping verification (ACK)
  if (body.type === 1) {
    return NextResponse.json({ type: 1 });
  }

  // Extract author, channel, and content
  const author = body.author ?? body.member?.user;
  const channelId = body.channel_id ?? "discord-standup";
  const text =
    body.content ??
    (body.data?.name ? `/${body.data.name}` : undefined);

  if (!text) {
    return NextResponse.json({ ok: true, message: "No text content" });
  }

  const authorName =
    author?.global_name ?? author?.username ?? author?.id ?? "discord_user";

  const run = await ingestEnvironmentEvent({
    environmentName: `Discord #${channelId}`,
    environmentKind: "discord",
    channelId,
    occurredAt: new Date().toISOString(),
    actors: [
      {
        id: author?.id ?? "discord_user",
        role: "discord_member",
        present: true,
        mayAct: true,
      },
    ],
    signalType: "discord.message",
    signalBody: `${authorName}: ${text}`,
    placeOnlyContext: `Discord channel ${channelId} — message from ${authorName}`,
  });

  return NextResponse.json({
    type: 4, // ChannelMessageWithSource
    data: {
      content: run.assistantText || "StandUp Agent received update.",
    },
    run,
  });
}
