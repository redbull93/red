import { resolveApproval } from "@red/orchestrator";
import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { approvalId?: string };
  if (!body.approvalId) {
    return NextResponse.json({ error: "approvalId required" }, { status: 400 });
  }

  const approver = await getAuthenticatedUser(request);

  try {
    const run = await resolveApproval(body.approvalId, "stopped", approver);
    return NextResponse.json({ run, approver });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
