import { startStandup } from "@red/agent";
import { getWorkspace, listWorkspaces } from "@red/database";
import type { AgentPlatformPort } from "@red/agent";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    workspaceId?: string;
  };

  let workspace = body.workspaceId
    ? await getWorkspace(body.workspaceId)
    : null;

  if (!workspace) {
    const all = await listWorkspaces();
    workspace = all[0] ?? null;
  }

  if (!workspace) {
    return NextResponse.json(
      { error: "No workspace available" },
      { status: 400 },
    );
  }

  // Stub port for direct control-plane trigger
  const stubPort: AgentPlatformPort = {
    sendDM: async (p, uid, text) => {
      console.log(`[Control Plane Standup DM -> @${uid}]:`, text.split("\n")[0]);
    },
    postToChannel: async (p, ch, text) => {
      console.log(`[Control Plane Standup Channel Post #${ch}]:`, text.split("\n")[0]);
      return { messageTs: String(Date.now()) };
    },
  };

  const standup = await startStandup({
    workspaceId: workspace.id,
    platform: workspace.platform,
    port: stubPort,
  });

  return NextResponse.json({ success: true, standup });
}
