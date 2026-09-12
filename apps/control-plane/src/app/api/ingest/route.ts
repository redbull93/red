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

  const run = await ingestEnvironmentEvent(
    fixtureEvent({
      environmentName: body.environmentName ?? "Slack #standup",
      environmentKind: body.environmentKind ?? "slack",
      signalBody: body.signalBody,
      placeOnlyContext: body.placeOnlyContext,
      requireHitl: body.mode === "hitl",
      forceFail: body.mode === "fail",
    }),
  );

  return NextResponse.json({ run });
}
