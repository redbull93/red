import type { WebClient } from "@slack/web-api";
import {
  attachThread,
  STANDUP_QUESTIONS,
  startSession,
} from "./collect.ts";
import { resolveStandupUserIds } from "./resolve-members.ts";

export async function beginStandup(options: {
  client: WebClient;
  channelId: string;
  invokerUserId: string;
  botUserId?: string;
  displayName: (userId: string) => Promise<string>;
}): Promise<{ messaged: number; failed: string[]; source: string }> {
  const { ids, source } = await resolveStandupUserIds(options.client, {
    channelId: options.channelId,
    invokerUserId: options.invokerUserId,
    botUserId: options.botUserId,
  });

  const members = await Promise.all(
    ids.map(async (userId) => ({
      userId,
      displayName: await options.displayName(userId),
    })),
  );
  const session = startSession(options.channelId, members);
  const mentions = members.map((m) => `<@${m.userId}>`).join(" ");

  const opener = await options.client.chat.postMessage({
    channel: options.channelId,
    text: `${mentions}\nStand-up is in this thread — not DMs. Three questions, reply here.`,
  });
  const threadTs = opener.ts;
  if (!threadTs) {
    throw new Error("Slack posted the opener but did not return a thread id.");
  }
  attachThread(session, threadTs);

  const failed: string[] = [];
  let messaged = 0;
  for (const member of members) {
    try {
      await options.client.chat.postMessage({
        channel: options.channelId,
        thread_ts: threadTs,
        text: `<@${member.userId}> ${STANDUP_QUESTIONS[0].text}`,
      });
      messaged += 1;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.error(`Could not ping ${member.userId} in-thread: ${detail}`);
      failed.push(member.displayName);
    }
  }

  return { messaged, failed, source };
}
