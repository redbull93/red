import { ingestEnvironmentEvent } from "@red/orchestrator";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type SlackEvent = {
  type?: string;
  text?: string;
  user?: string;
  channel?: string;
  ts?: string;
  thread_ts?: string;
};

type SlackPayload = {
  type?: string;
  challenge?: string;
  event?: SlackEvent;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as SlackPayload;

  console.log("Slack payload received:", body);

  // Slack uses this during endpoint verification.
  if (body.type === "url_verification" && body.challenge) {
    return NextResponse.json({
      challenge: body.challenge,
    });
  }

  // Ignore Slack events that do not contain an actual event.
  if (!body.event) {
    return NextResponse.json({
      ok: true,
    });
  }

  const event = body.event;

  // Ignore events without useful text.
  if (!event.text || !event.channel) {
    return NextResponse.json({
      ok: true,
    });
  }

  const run = await ingestEnvironmentEvent({
    environmentName: `Slack #${event.channel}`,
    environmentKind: "slack",
    channelId: event.channel,
    threadId: event.thread_ts,
    occurredAt: event.ts
      ? new Date(Number(event.ts.split(".")[0]) * 1000).toISOString()
      : new Date().toISOString(),
    actors: [
      {
        id: event.user ?? "unknown",
        role: "slack_user",
        present: true,
        mayAct: true,
      },
    ],
    signalType: "message",
    signalBody: event.text,
    placeOnlyContext: `Slack channel ${event.channel}`,
  });

  return NextResponse.json({
    ok: true,
    run,
  });
}