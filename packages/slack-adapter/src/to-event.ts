import type { EnvironmentEvent } from "@red/orchestrator";
import type { Session } from "./collect.ts";

export function sessionToEvent(session: Session): EnvironmentEvent {
  const members = [...session.members.values()];
  const lines = members.map((m) => {
    const name = m.displayName || m.userId;
    return [
      `${name}:`,
      `Finished: ${m.finished ?? ""}`,
      `Working on: ${m.workingOn ?? ""}`,
      `Blocking: ${m.blocking ?? ""}`,
    ].join(" ");
  });

  return {
    environmentName: "Slack stand-up",
    environmentKind: "slack",
    channelId: session.receiptChannelId,
    threadId: `standup-${new Date().toISOString().slice(0, 10)}`,
    signalType: "standup.collected",
    signalBody: ["Morning stand-up replies collected.", "", ...lines].join("\n"),
    placeOnlyContext:
      "These DM replies arrived for the scheduled stand-up in Slack. Cross-reference hidden dependencies. Post one receipt into the team channel.",
    actors: members.map((m) => ({
      id: m.userId,
      role: "teammate",
      present: true,
      mayAct: true,
      language: "en",
    })),
    artifacts: members.map((m) => ({
      kind: "standup_reply",
      id: m.userId,
      summary: `${m.displayName}: finished=${m.finished}; working=${m.workingOn}; blocking=${m.blocking}`,
    })),
    urgency: "medium",
    principal: "standup-lead",
  };
}
