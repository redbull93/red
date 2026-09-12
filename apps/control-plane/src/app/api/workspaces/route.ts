import { listWorkspaces } from "@red/database";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const workspaces = await listWorkspaces();
  return NextResponse.json({ workspaces });
}
