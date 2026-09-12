import { resolveApproval } from "@red/orchestrator";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json()) as { approvalId?: string };
  if (!body.approvalId) {
    return NextResponse.json({ error: "approvalId required" }, { status: 400 });
  }
  const run = await resolveApproval(body.approvalId, "stopped");
  return NextResponse.json({ run });
}
