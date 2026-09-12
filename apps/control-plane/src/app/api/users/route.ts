import { listUsersByWorkspace, listWorkspaces } from "@red/database";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  let workspaceId = searchParams.get("workspaceId");

  if (!workspaceId) {
    const workspaces = await listWorkspaces();
    workspaceId = workspaces[0]?.id || "ws_slack_demo";
  }

  const users = await listUsersByWorkspace(workspaceId);
  return NextResponse.json({ users });
}
