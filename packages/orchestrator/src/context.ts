import type { AgentContext, EnvironmentEvent } from "./types";
import { uid } from "./ids";

export function toAgentContext(event: EnvironmentEvent): AgentContext {
  const occurredAt = event.occurredAt ?? new Date().toISOString();
  return {
    ...event,
    id: event.id ?? uid("evt"),
    occurredAt,
    localTime: event.localTime ?? occurredAt,
    urgency: event.urgency ?? "medium",
    language: event.language ?? "en",
    permissionScope: event.permissionScope ?? "channel",
    artifacts: event.artifacts ?? [],
    actors: event.actors.length
      ? event.actors
      : [
          {
            id: "unknown",
            role: "human",
            present: true,
            mayAct: true,
          },
        ],
  };
}

export function renderEnvironmentBlock(ctx: AgentContext): string {
  const actors = ctx.actors
    .map(
      (a) =>
        `    <actor id="${a.id}" role="${a.role}" present="${a.present}" may_act="${a.mayAct}" language="${a.language ?? ""}" />`,
    )
    .join("\n");
  const artifacts = (ctx.artifacts ?? [])
    .map(
      (a) =>
        `    <artifact kind="${a.kind}" id="${a.id}">${a.summary}</artifact>`,
    )
    .join("\n");

  return `<environment>
  <place name="${ctx.environmentName}" kind="${ctx.environmentKind}" />
  <channel id="${ctx.channelId}" thread="${ctx.threadId ?? ""}" />
  <when iso="${ctx.occurredAt}" local="${ctx.localTime ?? ""}" />
  <actors>
${actors}
  </actors>
  <signal type="${ctx.signalType}">
    ${ctx.signalBody}
  </signal>
  <artifacts>
${artifacts}
  </artifacts>
  <constraints>
    urgency: ${ctx.urgency}
    language: ${ctx.language}
    permission: ${ctx.permissionScope}
    irreversible_actions_require_hitl: true
    force_fail: ${ctx.forceFail ? "true" : "false"}
    require_hitl: ${ctx.requireHitl ? "true" : "false"}
  </constraints>
  <what_a_chatbox_would_never_know>
    ${ctx.placeOnlyContext}
  </what_a_chatbox_would_never_know>
</environment>`;
}
