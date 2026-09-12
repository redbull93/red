import { completePlain } from "@red/orchestrator";
import type { ChannelLine } from "./channel-history.ts";
import {
  mergeActions,
  type StoredAction,
} from "./action-store.ts";

export type Briefing = {
  body: string;
  followUps: StoredAction[];
};

type PersonState = {
  userId: string;
  texts: string[];
  doing?: string;
  incomplete?: string;
  blocker?: string;
  latest: string;
};

export async function buildBriefing(options: {
  channelId: string;
  lines: ChannelLine[];
  memberIds: string[];
}): Promise<Briefing> {
  const people = collectPeople(options.lines);
  const silent = options.memberIds.filter((id) => !people.has(id));
  const extracted = extractActions(people, silent);
  const closers = new Map(
    [...people.entries()].map(([id, p]) => [id, p.latest] as const),
  );
  const followUps = mergeActions(options.channelId, extracted, closers);

  const local = formatBriefing(people, followUps, silent);
  const polished = await polishBriefing(options.lines, local);
  return { body: polished ?? local, followUps };
}

function collectPeople(lines: ChannelLine[]): Map<string, PersonState> {
  const people = new Map<string, PersonState>();
  for (const line of lines) {
    const existing = people.get(line.userId) ?? {
      userId: line.userId,
      texts: [],
      latest: line.text,
    };
    existing.texts.push(line.text);
    existing.latest = line.text;
    people.set(line.userId, existing);
  }

  for (const person of people.values()) {
    const blob = person.texts.join(" ");
    person.doing =
      matchTail(blob, /(?:working on(?: the)?|finished)\s+(.+?)(?:\.|$)/i) ??
      undefined;
    person.incomplete = matchTail(
      blob,
      /(?:yet to|haven't|have not|need to|still need to|waiting (?:on|for))\s+(.+?)(?:\.|$)/i,
    );
    person.blocker = matchTail(blob, /(?:blocked on|blocker[:\s]+)\s*(.+?)(?:\.|$)/i);
  }
  return people;
}

function extractActions(
  people: Map<string, PersonState>,
  silent: string[],
): Omit<StoredAction, "openedAt">[] {
  const items: Omit<StoredAction, "openedAt">[] = [];

  for (const person of people.values()) {
    if (person.blocker) {
      items.push({
        userId: person.userId,
        task: trimPhrase(person.blocker),
        kind: "blocker",
      });
    }
    if (person.incomplete) {
      items.push({
        userId: person.userId,
        task: trimPhrase(person.incomplete),
        kind: "incomplete",
      });
    }
  }

  for (const userId of silent) {
    items.push({
      userId,
      task: "post today's stand-up: finished / working on / blocked",
      kind: "check-in",
    });
  }

  return items;
}

function formatBriefing(
  people: Map<string, PersonState>,
  actions: StoredAction[],
  silent: string[],
): string {
  const summary: string[] = [];
  for (const person of people.values()) {
    const who = `<@${person.userId}>`;
    if (person.doing && person.incomplete) {
      summary.push(
        `${who} is on ${trimPhrase(person.doing)}, but still needs to ${trimPhrase(person.incomplete)}.`,
      );
    } else if (person.doing) {
      summary.push(`${who} is on ${trimPhrase(person.doing)}.`);
    } else {
      summary.push(`${who} checked in.`);
    }
  }
  if (silent.length > 0) {
    summary.push(
      `${silent.map((id) => `<@${id}>`).join(", ")} have not posted an update.`,
    );
  }
  if (summary.length === 0) {
    summary.push("No teammate updates to manage yet.");
  }

  const actionLines =
    actions.length > 0
      ? actions.map(
          (item, index) =>
            `${index + 1}. <@${item.userId}> — ${item.task}${item.kind === "blocker" ? " (blocker)" : ""}`,
        )
      : ["None yet. Ask people to post what they are working on."];

  return [
    "*Project manager briefing*",
    "",
    "*Summary*",
    summary.join(" "),
    "",
    "*Action items*",
    ...actionLines,
  ].join("\n");
}

function followUpLine(item: StoredAction): string {
  const who = `<@${item.userId}>`;
  if (item.kind === "blocker") {
    return `${who} what's the latest on this blocker: ${item.task}? Who can unblock it?`;
  }
  if (item.kind === "incomplete") {
    return `${who} following up — please ${item.task}, or say what's in the way.`;
  }
  return `${who} checking in: ${item.task}.`;
}

export function formatFollowUps(items: StoredAction[]): string | null {
  if (items.length === 0) return null;
  return ["*Follow-ups*", ...items.map((item) => `• ${followUpLine(item)}`)].join(
    "\n",
  );
}

async function polishBriefing(
  lines: ChannelLine[],
  local: string,
): Promise<string | null> {
  const modeled = await completePlain(
    [
      "You are a project manager in Slack. Rewrite the briefing so it is crisp.",
      "Keep this exact structure and Slack mention tokens (<@U…>):",
      "*Project manager briefing*",
      "*Summary* (2-4 sentences, no quotes)",
      "*Action items* (numbered, owner + concrete next step)",
      "Do not invent people, tasks, or blockers. Do not add a Follow-ups section.",
    ].join("\n"),
    `Draft:\n${local}\n\nSource:\n${lines.map((l) => `<@${l.userId}>: ${l.text}`).join("\n")}`,
  );
  return modeled;
}

function matchTail(text: string, pattern: RegExp): string | undefined {
  return text.match(pattern)?.[1]?.trim();
}

function trimPhrase(text: string): string {
  return text.replace(/\s+/g, " ").replace(/[.,;:]+$/, "").trim();
}
