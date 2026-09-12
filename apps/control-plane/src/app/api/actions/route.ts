import { getAction, listPendingActions, updateActionStatus } from "@red/database";
import { handleActionDecision, type AgentPlatformPort } from "@red/agent";
import type { PendingActionStatus } from "@red/shared";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const workspaceId = searchParams.get("workspaceId") || undefined;
  const status = (searchParams.get("status") as PendingActionStatus) || undefined;

  const actions = await listPendingActions(workspaceId, status);
  return NextResponse.json({ actions });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    actionId: string;
    decision: "approved" | "rejected";
    approver?: string;
  };

  if (!body.actionId || !body.decision) {
    return NextResponse.json(
      { error: "Missing actionId or decision" },
      { status: 400 },
    );
  }

  const existing = await getAction(body.actionId);
  if (existing) {
    const stubPort: AgentPlatformPort = {
      sendDM: async (p, uid, text) => {
        console.log(`[Control Plane Action DM -> @${uid}]:`, text);
      },
      postToChannel: async (p, ch, text) => {
        console.log(`[Control Plane Action Channel #${ch}]:`, text);
        return { messageTs: String(Date.now()) };
      },
    };

    const result = await handleActionDecision(
      body.actionId,
      body.decision,
      body.approver || "admin",
      stubPort,
    );
    return NextResponse.json({ action: result.action, message: result.message, success: result.success });
  }

  const updated = await updateActionStatus(
    body.actionId,
    body.decision === "approved" ? "executed" : "rejected",
  );

  return NextResponse.json({ action: updated });
}
