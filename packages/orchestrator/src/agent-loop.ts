import { ReasoningEngine } from "@red/ai";
import type {
  AgentDecision,
  EnvironmentEvent,
  Platform,
  StandupResponse,
} from "@red/shared";
import { getStore } from "./store";
import { trace } from "./traces";
import { uid } from "./ids";

export interface AgentLoopDeps {
  ai: ReasoningEngine;
  sendDM: (platform: Platform, userId: string, text: string) => Promise<void>;
  postToChannel: (
    platform: Platform,
    channelId: string,
    text: string,
  ) => Promise<unknown>;
  requestApproval?: (
    platform: Platform,
    channelId: string,
    actionId: string,
    text: string,
  ) => Promise<void>;
  standupChannelByWorkspace: Record<string, string>;
}

const sessions = new Map<string, StandupResponse[]>();

export async function ingestLiveEnvironmentEvent(
  event: EnvironmentEvent,
  deps: AgentLoopDeps,
): Promise<AgentDecision | undefined> {
  if (event.type !== "dm.received" && event.type !== "message.received") {
    return undefined;
  }

  const runId = uid("run");
  const sessionId = `${event.platform}:${event.workspaceId}`;

  const response: StandupResponse = {
    workspaceId: event.workspaceId,
    platform: event.platform,
    userId: event.userId,
    channelId: event.channelId,
    standupId: sessionId,
    rawText: event.text,
    createdAt: event.timestamp,
  };

  const list = sessions.get(sessionId) ?? [];
  list.push(response);
  sessions.set(sessionId, list);

  trace(
    runId,
    "signal",
    `DM update from @${event.userId} via ${event.platform}`,
    event.text,
    { platform: event.platform, userId: event.userId },
  );

  // When 2 or more responses arrive (or configurable threshold), cross-reference and reason
  if (list.length >= 2) {
    trace(
      runId,
      "plan",
      "Analyzing multi-party updates across team",
      `Collected ${list.length} responses. Cross-referencing dependencies.`,
    );

    const decision = await deps.ai.analyzeStandup({
      team: { id: event.workspaceId, name: event.workspaceId },
      responses: list,
    });

    trace(
      runId,
      "context",
      "Reasoning Engine Decision",
      decision.summary,
      { blockers: decision.blockers, state: decision.state },
    );

    await executeDecision(runId, decision, event.platform, event.workspaceId, deps);
    sessions.delete(sessionId);
    return decision;
  }

  return undefined;
}

async function executeDecision(
  runId: string,
  decision: AgentDecision,
  platform: Platform,
  workspaceId: string,
  deps: AgentLoopDeps,
) {
  const channelId = deps.standupChannelByWorkspace[workspaceId];
  if (!channelId) return;

  const formattedSummary = formatDecision(decision);

  for (const action of decision.actions) {
    if (action.type === "post_summary") {
      await deps.postToChannel(platform, channelId, formattedSummary);
      trace(runId, "receipt", "Posted summary to team channel", channelId, {
        summary: decision.summary,
      });
      getStore().receipts.push({
        id: uid("rcp"),
        runId,
        channelId,
        body: formattedSummary,
        at: new Date().toISOString(),
      });
    } else if (action.type === "request_approval" && deps.requestApproval) {
      await deps.requestApproval(
        platform,
        channelId,
        action.id,
        action.message,
      );
      trace(
        runId,
        "hitl",
        "Approval requested before action",
        action.message,
        { actionId: action.id, target: action.target },
      );
    } else if (action.type === "notify" && action.target) {
      await deps.sendDM(platform, action.target, action.message);
      trace(runId, "tool", `Direct notification sent to @${action.target}`, action.message);
    }
  }

  // Ensure channel always gets the summary receipt if not explicitly posted yet
  if (!decision.actions.some((a) => a.type === "post_summary")) {
    await deps.postToChannel(platform, channelId, formattedSummary);
    trace(runId, "receipt", "Stand-up receipt landed in channel", channelId);
    getStore().receipts.push({
      id: uid("rcp"),
      runId,
      channelId,
      body: formattedSummary,
      at: new Date().toISOString(),
    });
  }
}

export function formatDecision(decision: AgentDecision): string {
  const blockers = decision.blockers
    .map(
      (b, i) =>
        `${i + 1}. [${b.type.toUpperCase()}] ${b.subject} (confidence ${(b.confidence * 100).toFixed(0)}%)`,
    )
    .join("\n");

  const actions = decision.actions.map((a) => `→ ${a.message}`).join("\n");

  return [
    "📢 *Stand-up summary*",
    "",
    decision.summary,
    "",
    "*Dependencies & Blockers*",
    blockers || "None detected. Everything on track.",
    "",
    "*Suggested Next Actions*",
    actions || "None required.",
  ].join("\n");
}
