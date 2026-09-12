import { App } from "@slack/bolt";
import {
  fixtureEvent,
  ingestEnvironmentEvent,
  setReceiptSink,
} from "@red/orchestrator";
import { beginStandup } from "./begin-standup.ts";
import { summaryBlocks } from "./blocks.ts";
import {
  allComplete,
  clearSession,
  nextQuestion,
  recordAnswer,
  sessionForThread,
  sessionForUser,
} from "./collect.ts";
import { startControlServer } from "./http.ts";
import { fileInstallStore, seedDefaultInstall } from "./install-store.ts";
import { readChannelTranscript } from "./channel-history.ts";
import { buildBriefing, formatFollowUps } from "./briefing.ts";
import { resolveChannelHumans } from "./resolve-members.ts";
import { sessionToEvent } from "./to-event.ts";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name} in .env`);
  }
  return value;
}

const signingSecret = requireEnv("SLACK_SIGNING_SECRET");
const appToken = requireEnv("SLACK_APP_TOKEN");
const defaultChannel = process.env.SLACK_STANDUP_CHANNEL?.trim();
const clientId = process.env.SLACK_CLIENT_ID?.trim();
const clientSecret = process.env.SLACK_CLIENT_SECRET?.trim();
const oauthEnabled = Boolean(clientId && clientSecret);

seedDefaultInstall();

const app = new App({
  signingSecret,
  socketMode: true,
  appToken,
  token: oauthEnabled ? undefined : requireEnv("SLACK_BOT_TOKEN"),
  clientId: oauthEnabled ? clientId : undefined,
  clientSecret: oauthEnabled ? clientSecret : undefined,
  stateSecret: process.env.SLACK_STATE_SECRET?.trim() || "standup-dev-state",
  installationStore: oauthEnabled ? fileInstallStore : undefined,
  installerOptions: oauthEnabled
    ? {
        directInstall: true,
        callbackOptions: {
          success: (_i, _c, req, res) => {
            res.writeHead(200).end("StandUp installed. Invite @Standup to a channel and run /standup.");
          },
        },
      }
    : undefined,
  port: oauthEnabled ? Number(process.env.SLACK_OAUTH_PORT ?? 3002) : undefined,
});

setReceiptSink(async ({ channelId, body }) => {
  await app.client.chat.postMessage({
    channel: channelId,
    text: body,
    blocks: summaryBlocks(body),
  });
});

async function displayName(userId: string): Promise<string> {
  try {
    const info = await app.client.users.info({ user: userId });
    return (
      info.user?.profile?.display_name ||
      info.user?.real_name ||
      info.user?.name ||
      userId
    );
  } catch {
    return userId;
  }
}

async function runCollected(
  channelId: string,
  event: ReturnType<typeof fixtureEvent>,
) {
  await ingestEnvironmentEvent({
    ...event,
    channelId,
    environmentName: "Slack stand-up",
    environmentKind: "slack",
  });
}

app.command("/standup-demo", async ({ ack, command, respond }) => {
  await ack();
  const channelId = command.channel_id || defaultChannel;
  if (!channelId) {
    await respond("Run this in a channel, or set SLACK_STANDUP_CHANNEL.");
    return;
  }
  try {
    await runCollected(channelId, fixtureEvent({ channelId }));
    await respond({
      response_type: "ephemeral",
      text: "Demo posted here. /standup asks people in *this* channel, in a thread.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await respond(`Demo failed: ${message}`);
  }
});

function mentionIntent(text: string): "start" | "demo" | "status" | "help" {
  const stripped = text
    .replace(/<@[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (/\b(status|progress|update|action items?|follow[- ]?up)\b/.test(stripped)) {
    return "status";
  }
  if (/\b(what'?s|how'?s|how is)\b/.test(stripped) && /\b(project|going|channel)\b/.test(stripped)) {
    return "status";
  }
  if (/\b(demo|sample|fixture)\b/.test(stripped)) return "demo";
  if (/\b(start|standup|stand-up|begin|run)\b/.test(stripped)) return "start";
  if (!stripped) return "help";
  return "help";
}

function typedStandupCommand(text: string): "start" | "demo" | "status" | null {
  const stripped = text.replace(/\s+/g, " ").trim().toLowerCase();
  if (
    stripped === "/standup status" ||
    stripped === "standup status" ||
    stripped === "standup what is the current status of the project"
  ) {
    return "status";
  }
  if (
    stripped === "/standup" ||
    stripped === "/standup start" ||
    stripped === "standup start"
  ) {
    return "start";
  }
  if (stripped === "/standup-demo" || stripped === "/standup demo") {
    return "demo";
  }
  return null;
}

async function kickOffStandup(options: {
  client: typeof app.client;
  channelId: string;
  invokerUserId: string;
  botUserId?: string;
}) {
  return beginStandup({
    ...options,
    displayName,
  });
}

const claimedEvents = new Set<string>();

function claimEvent(key: string): boolean {
  if (claimedEvents.has(key)) return false;
  claimedEvents.add(key);
  setTimeout(() => claimedEvents.delete(key), 8000);
  return true;
}

async function postChannelStatus(
  client: typeof app.client,
  channelId: string,
  botUserId?: string,
) {
  console.log(`Reading channel status for ${channelId}`);
  const { lines, error } = await readChannelTranscript(client, channelId, {
    botUserId,
  });
  if (error) {
    const missingHistory = /missing_scope|not_in_channel|not_allowed|channel_not_found/i.test(
      error,
    );
    throw new Error(
      missingHistory
        ? `I cannot read this channel yet. Add bot scope *channels:history* (and *groups:history* if private), reinstall Standup, and invite me here. Slack said: ${error}`
        : `Could not read this channel: ${error}`,
    );
  }

  const memberIds = (
    await resolveChannelHumans(client, { channelId, botUserId })
  ).filter((id) => id !== botUserId);
  const briefing = await buildBriefing({
    channelId,
    lines,
    memberIds,
  });
  await client.chat.postMessage({
    channel: channelId,
    text: briefing.body,
    blocks: summaryBlocks(briefing.body),
  });
  const followUps = formatFollowUps(briefing.followUps);
  if (followUps) {
    await client.chat.postMessage({
      channel: channelId,
      text: followUps,
      blocks: summaryBlocks(followUps),
    });
  }
}

app.command("/standup", async ({ ack, command, respond, client, context }) => {
  await ack();
  const channelId = command.channel_id || defaultChannel;
  if (!channelId) {
    await respond("Run this in a channel, or set SLACK_STANDUP_CHANNEL.");
    return;
  }

  const extra = command.text?.trim().toLowerCase() ?? "";
  try {
    if (extra === "demo") {
      await runCollected(channelId, fixtureEvent({ channelId }));
      await respond({
        response_type: "in_channel",
        text: "Demo posted in this channel.",
      });
      return;
    }

    if (extra === "status") {
      await postChannelStatus(client, channelId, context.botUserId);
      await respond({
        response_type: "ephemeral",
        text: "Read this channel and posted the current project status.",
      });
      return;
    }

    const result = await kickOffStandup({
      client,
      channelId,
      invokerUserId: command.user_id,
      botUserId: context.botUserId,
    });
    await respond({
      response_type: "ephemeral",
      text: `Stand-up is in the thread above. Asked ${result.messaged} person(s). Reply there — not in DMs.${result.failed.length ? ` Could not ping: ${result.failed.join(", ")}.` : ""}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await respond(`Stand-up failed: ${message}`);
  }
});

const HELP =
  "I run this channel like a project manager.\n• `@Standup status` — summary, action items, and follow-ups on unfinished work\n• `@Standup start` or `/standup` — ask the team three questions in a thread\n• `@Standup demo` or `/standup-demo` — sample Eugene/Brian summary";

async function handleMention(options: {
  text: string;
  channelId: string;
  userId: string;
  eventKey: string;
  client: typeof app.client;
  botUserId?: string;
  reply: (text: string) => Promise<unknown>;
}) {
  if (!claimEvent(options.eventKey)) return;
  const intent = mentionIntent(options.text);
  console.log(`Standup mention intent=${intent} channel=${options.channelId}`);

  if (intent === "demo") {
    await runCollected(options.channelId, fixtureEvent({ channelId: options.channelId }));
    await options.reply("Posted the demo summary in this channel.");
    return;
  }

  if (intent === "status") {
    await options.reply("Pulling a project-manager briefing from this channel…");
    await postChannelStatus(
      options.client,
      options.channelId,
      options.botUserId,
    );
    return;
  }

  if (intent === "start") {
    const result = await kickOffStandup({
      client: options.client,
      channelId: options.channelId,
      invokerUserId: options.userId,
      botUserId: options.botUserId,
    });
    await options.reply(
      `Asked ${result.messaged} person(s) in the thread. Reply there.${result.failed.length ? ` Could not ping: ${result.failed.join(", ")}.` : ""}`,
    );
    return;
  }

  await options.reply(HELP);
}

app.event("app_mention", async ({ event, client, context, say }) => {
  try {
    await handleMention({
      text: event.text ?? "",
      channelId: event.channel,
      userId: event.user ?? "USLACKBOT",
      eventKey: `mention:${event.channel}:${event.ts}`,
      client,
      botUserId: context.botUserId,
      reply: (text) => say(text),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await say(`Stand-up failed: ${message}`);
  }
});

app.message(async ({ message, client, context }) => {
  if (message.subtype || !("user" in message) || !("text" in message)) return;
  const userId = message.user;
  const text = message.text?.trim();
  if (!userId || !text) return;

  const mentionsBot = Boolean(
    context.botUserId && text.includes(`<@${context.botUserId}>`),
  );
  const mentionKind = mentionIntent(text);
  if (
    mentionsBot &&
    (mentionKind === "status" ||
      mentionKind === "demo" ||
      mentionKind === "start")
  ) {
    try {
      await handleMention({
        text,
        channelId: message.channel,
        userId,
        eventKey: `mention:${message.channel}:${"ts" in message ? message.ts : text}`,
        client,
        botUserId: context.botUserId,
        reply: (body) =>
          client.chat.postMessage({ channel: message.channel, text: body }),
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      await client.chat.postMessage({
        channel: message.channel,
        text: `Stand-up failed: ${detail}`,
      });
    }
    return;
  }

  const typed = typedStandupCommand(text);
  if (typed) {
    const channelId = message.channel;
    try {
      if (typed === "demo") {
        await runCollected(channelId, fixtureEvent({ channelId }));
        await client.chat.postMessage({
          channel: channelId,
          text: "Posted the demo summary in this channel.",
        });
        return;
      }
      if (typed === "status") {
        await postChannelStatus(client, channelId, context.botUserId);
        return;
      }
      await kickOffStandup({
        client,
        channelId,
        invokerUserId: userId,
        botUserId: context.botUserId,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      await client.chat.postMessage({
        channel: channelId,
        text: `Stand-up failed: ${detail}`,
      });
    }
    return;
  }

  const channelId = message.channel;
  const threadTs =
    "thread_ts" in message && typeof message.thread_ts === "string"
      ? message.thread_ts
      : undefined;
  const session =
    sessionForThread(channelId, threadTs) ?? sessionForUser(userId);
  if (!session || !session.members.has(userId)) return;
  if (channelId !== session.receiptChannelId) return;
  if (session.threadTs && threadTs !== session.threadTs) return;

  recordAnswer(userId, text);
  const followUp = nextQuestion(userId);
  const replyThread = session.threadTs ?? threadTs;
  if (followUp) {
    await client.chat.postMessage({
      channel: channelId,
      thread_ts: replyThread,
      text: `<@${userId}> ${followUp}`,
    });
    return;
  }

  if (!allComplete(session)) {
    await client.chat.postMessage({
      channel: channelId,
      thread_ts: replyThread,
      text: `<@${userId}> Thanks — waiting on the rest of the team in this thread.`,
    });
    return;
  }

  await client.chat.postMessage({
    channel: channelId,
    thread_ts: replyThread,
    text: "Everyone is in. Posting the stand-up summary.",
  });
  const event = sessionToEvent(session);
  clearSession(session);
  await runCollected(channelId, event);
});

const port = Number(process.env.PORT ?? 3001);
startControlServer({
  client: app.client,
  displayName,
  port,
});

await app.start();
console.log(
  `StandUp Slack running. Slash commands in any invited channel. Trigger webhook: http://0.0.0.0:${port}/internal/standup/start${oauthEnabled ? ` Install link: /slack/install` : ""}`,
);
