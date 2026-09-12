import { completePlain } from "@red/orchestrator";
import type { EnvironmentEvent } from "@red/orchestrator";
import type { ChannelLine } from "./channel-history.ts";

export function channelStatusEvent(
  channelId: string,
  lines: ChannelLine[],
): EnvironmentEvent {
  const people = [...new Set(lines.map((l) => l.name))];
  const transcript = lines.map((l) => `${l.name}: ${l.text}`).join("\n");

  return {
    environmentName: "Slack channel status",
    environmentKind: "slack",
    channelId,
    threadId: `status-${new Date().toISOString().slice(0, 10)}`,
    signalType: "channel.status",
    signalBody: transcript
      ? `Someone asked for the current project status from this channel.\n\n${transcript}`
      : "Someone asked for the current project status. The channel has no recent human messages.",
    placeOnlyContext:
      "This is not a collected stand-up. Read the channel transcript as ground truth. Post one short status: what is moving, what is blocked, who last spoke. Do not invent Eugene/Brian/Amina. If the channel is empty, say so.",
    actors: people.map((name) => ({
      id: name,
      role: "teammate",
      present: true,
      mayAct: true,
      language: "en",
    })),
    artifacts: lines.slice(-12).map((l) => ({
      kind: "channel_message",
      id: l.ts,
      summary: `${l.name}: ${l.text.slice(0, 180)}`,
    })),
    urgency: "low",
    principal: "channel-reader",
  };
}

export async function summarizeChannel(lines: ChannelLine[]): Promise<string> {
  if (lines.length === 0) {
    return [
      "*Project status*",
      "",
      "No teammate updates yet — only setup chatter.",
      "Drop what you’re working on in this channel, then ask again.",
    ].join("\n");
  }

  const modeled = await completePlain(
    [
      "You write Slack stand-up status. Summarize; do not quote messages.",
      "Use Slack mention tokens exactly as given (like <@U123>).",
      "3-6 short bullets: what is moving, who owns it, what is waiting or blocked.",
      "Do not invent people, work, or blockers. If something is unclear, say so.",
    ].join(" "),
    lines
      .map((l) => `<@${l.userId}>: ${l.text}`)
      .join("\n"),
  );
  if (modeled) {
    return modeled.startsWith("*") ? modeled : `*Project status*\n\n${modeled}`;
  }

  return localSummary(lines);
}

function localSummary(lines: ChannelLine[]): string {
  const byPerson = new Map<string, string[]>();
  for (const line of lines) {
    const texts = byPerson.get(line.userId) ?? [];
    texts.push(clean(line.text));
    byPerson.set(line.userId, texts);
  }

  const moving: string[] = [];
  const waiting: string[] = [];

  for (const [userId, texts] of byPerson) {
    const blob = texts.join(" ");
    const who = `<@${userId}>`;
    const doing =
      matchTail(blob, /(?:working on|working on the|on the)\s+(.+?)(?:\.|$)/i) ??
      matchTail(blob, /finished\s+(.+?)(?:\.|$)/i);
    const held =
      matchTail(
        blob,
        /(?:yet to|haven't|have not|need to|waiting (?:on|for)|blocked on)\s+(.+?)(?:\.|$)/i,
      );

    if (doing) moving.push(`• ${who} is on ${trimPhrase(doing)}`);
    else moving.push(`• ${who} checked in`);

    if (held) waiting.push(`• ${who} still needs to ${trimPhrase(held)}`);
  }

  const parts = ["*Project status*", "", "*Moving*", ...moving];
  if (waiting.length > 0) {
    parts.push("", "*Waiting*", ...waiting);
  }
  return parts.join("\n");
}

function matchTail(text: string, pattern: RegExp): string | undefined {
  return text.match(pattern)?.[1]?.trim();
}

function trimPhrase(text: string): string {
  return text.replace(/\s+/g, " ").replace(/[.,;:]+$/, "").trim();
}

function clean(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}
