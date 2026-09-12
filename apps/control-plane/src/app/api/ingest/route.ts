import { fixtureEvent, ingestEnvironmentEvent } from "@red/orchestrator";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    mode?: "loop" | "hitl" | "fail";
    environmentName?: string;
    environmentKind?: string;
    signalBody?: string;
    placeOnlyContext?: string;
  };

  const envKind = body.environmentKind ?? "slack";
  const envName =
    body.environmentName ??
    (envKind === "whatsapp"
      ? "WhatsApp StandUp Group"
      : envKind === "discord"
        ? "Discord #standup"
        : "Slack #standup");
  const channelId =
    envKind === "whatsapp"
      ? "whatsapp-group-eng"
      : envKind === "discord"
        ? "C-discord-standup"
        : "C-standup";

  const run = await ingestEnvironmentEvent(
    fixtureEvent({
      environmentName: envName,
      environmentKind: envKind,
      channelId,
      signalBody: body.signalBody,
      placeOnlyContext:
        body.placeOnlyContext ??
        (envKind === "whatsapp"
          ? "Three WhatsApp voice notes/texts summarized from the team group. Eugene waiting on Brian; Brian completed endpoint but didn't notify Eugene. A standalone chatbot would never receive this group context."
          : envKind === "discord"
            ? "Three Discord stand-up replies collected in #standup thread. Eugene blocked on Brian's API. Receipt must return to Discord."
            : undefined),
      requireHitl: body.mode === "hitl",
      forceFail: body.mode === "fail",
    }),
  );

  return NextResponse.json({ run });
}
