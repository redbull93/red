import {
  CopilotRuntime,
  OpenAIAdapter,
  EmptyAdapter,
  copilotRuntimeNextJSAppRouterEndpoint,
} from "@copilotkit/runtime";
import OpenAI from "openai";
import { fixtureEvent, ingestEnvironmentEvent } from "@red/orchestrator";
import {
  listDependencies,
  getAction,
  updateActionStatus,
} from "@red/database";

export const dynamic = "force-dynamic";

function getServiceAdapter() {
  const apiKey = process.env.OPENAI_API_KEY || process.env.AGENT_ROUTER_API_KEY;
  const baseURL = process.env.AGENT_ROUTER_BASE_URL || process.env.OPENAI_BASE_URL;

  if (apiKey) {
    const openai = new OpenAI({
      apiKey,
      baseURL: baseURL || undefined,
    });
    return new OpenAIAdapter({ openai });
  }

  return new EmptyAdapter();
}

const runtime = new CopilotRuntime({
  actions: [
    {
      name: "triggerStandup",
      description: "Trigger a standup event for a team channel (Slack, Discord, or WhatsApp)",
      parameters: [
        {
          name: "platform",
          type: "string",
          description: "Target platform ('slack', 'discord', or 'whatsapp')",
          required: false,
        },
        {
          name: "mode",
          type: "string",
          description: "Run mode: 'loop', 'hitl', or 'fail'",
          required: false,
        },
      ],
      handler: async (args: any) => {
        const platform = args?.platform || "slack";
        const mode = args?.mode || "loop";
        const envName =
          platform === "whatsapp"
            ? "WhatsApp StandUp Group"
            : platform === "discord"
              ? "Discord #standup"
              : "Slack #standup";
        const channelId =
          platform === "whatsapp"
            ? "whatsapp-group-eng"
            : platform === "discord"
              ? "C-discord-standup"
              : "C-standup";

        const run = await ingestEnvironmentEvent(
          fixtureEvent({
            environmentName: envName,
            environmentKind: platform,
            channelId,
            requireHitl: mode === "hitl",
            forceFail: mode === "fail",
          }),
        );
        return {
          success: true,
          runId: run.id,
          status: run.status,
          platform,
          message: `Standup event triggered for ${envName} with run ID ${run.id}`,
        };
      },
    },
    {
      name: "getBlockerSummary",
      description: "Fetch all active dependencies and blocker streaks across the team",
      parameters: [],
      handler: async () => {
        const deps = await listDependencies();
        const activeBlockers = deps.filter((d) => d.status !== "resolved");
        return {
          totalDependencies: deps.length,
          activeBlockersCount: activeBlockers.length,
          blockers: activeBlockers.map((b) => ({
            id: b.id,
            blockedUser: b.blockedName || b.blockedUserId || "unknown",
            blockingUser: b.blockerName || b.blockerUserId || "unknown",
            description: b.subject,
            confidence: b.confidence,
          })),
        };
      },
    },
    {
      name: "approveAction",
      description: "Approve a pending human-in-the-loop (HITL) action",
      parameters: [
        {
          name: "actionId",
          type: "string",
          description: "ID of the pending action or approval to execute",
          required: true,
        },
      ],
      handler: async (args: any) => {
        const actionId = args?.actionId;
        if (!actionId) {
          return { success: false, message: "actionId is required" };
        }
        const action = await getAction(actionId);
        if (action) {
          await updateActionStatus(actionId, "executed");
          return {
            success: true,
            message: `Action ${actionId} approved and executed`,
          };
        }
        return {
          success: false,
          message: `Action ${actionId} not found in store`,
        };
      },
    },
  ] as any,
});

export async function POST(req: Request) {
  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime,
    serviceAdapter: getServiceAdapter(),
    endpoint: "/api/copilotkit",
  });

  return handleRequest(req);
}
