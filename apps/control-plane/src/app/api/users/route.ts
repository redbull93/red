import { listUsersByWorkspace, listWorkspaces, upsertUser } from "@red/database";
import type { User } from "@red/shared";
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

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Partial<User>;

  if (!body.name || !body.platformUserId) {
    return NextResponse.json(
      { error: "name and platformUserId are required" },
      { status: 400 },
    );
  }

  const workspaces = await listWorkspaces();
  const workspaceId = body.workspaceId || workspaces[0]?.id || "ws_slack_demo";

  const newUser: User = {
    id: body.id || `usr_${Date.now()}`,
    workspaceId,
    platformUserId: body.platformUserId,
    name: body.name,
    email: body.email,
    role: body.role || "Software Engineer",
    avatarUrl: body.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(body.name)}`,
  };

  const saved = await upsertUser(newUser);
  return NextResponse.json({ user: saved });
}
