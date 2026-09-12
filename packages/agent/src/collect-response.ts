import {
  createAgentEvent,
  createResponse,
  getUserByPlatformId,
  listResponsesByStandup,
} from "@red/database";
import type { EnvironmentEvent, StandupResponse } from "@red/shared";
import { nanoid } from "nanoid";

export interface ParsedUpdate {
  finished?: string;
  workingOn?: string;
  blockedBy?: string;
}

export function parseRawStandupText(text: string): ParsedUpdate {
  const result: ParsedUpdate = {};

  // Simple heuristic parser for structured updates:
  // 1. Finished: ...
  // 2. Working on: ...
  // 3. Blockers: ...
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    if (/(?:yesterday|done|finished|completed|1[\).])/i.test(line)) {
      result.finished = line.replace(/^(?:1[\).]|yesterday|done|finished|completed)[:\s-]*/i, "").trim();
    } else if (/(?:today|working\s+on|doing|in\s+progress|2[\).])/i.test(line)) {
      result.workingOn = line.replace(/^(?:2[\).]|today|working\s+on|doing)[:\s-]*/i, "").trim();
    } else if (/(?:blocked|blocker|waiting\s+on|need|3[\).])/i.test(line)) {
      result.blockedBy = line.replace(/^(?:3[\).]|blocked|blocker|waiting\s+on)[:\s-]*/i, "").trim();
    }
  }

  // If no sections matched, place all raw text in workingOn
  if (!result.finished && !result.workingOn && !result.blockedBy) {
    result.workingOn = text.trim();
  }

  return result;
}

export async function collectResponse(
  event: EnvironmentEvent,
  standupId: string,
): Promise<{ response: StandupResponse; allResponses: StandupResponse[] }> {
  const user = await getUserByPlatformId(event.workspaceId, event.userId);
  const parsed = parseRawStandupText(event.text);

  const responseId = `resp_${nanoid(10)}`;
  const response: StandupResponse = {
    id: responseId,
    workspaceId: event.workspaceId,
    platform: event.platform,
    userId: event.userId,
    userName: user?.name ?? event.userId,
    channelId: event.channelId,
    standupId,
    finished: parsed.finished,
    workingOn: parsed.workingOn,
    blockedBy: parsed.blockedBy,
    rawText: event.text,
    createdAt: event.timestamp || new Date().toISOString(),
  };

  await createResponse(response);

  await createAgentEvent({
    id: `evt_${nanoid(10)}`,
    workspaceId: event.workspaceId,
    eventType: "response.collected",
    payload: {
      standupId,
      userId: event.userId,
      userName: response.userName,
      hasBlocker: Boolean(parsed.blockedBy),
    },
  });

  const allResponses = await listResponsesByStandup(standupId);
  return { response, allResponses };
}
