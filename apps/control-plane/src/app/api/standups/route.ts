import { listStandups } from "@red/database";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const workspaceId = searchParams.get("workspaceId") || undefined;
  const limit = parseInt(searchParams.get("limit") || "20", 10);

  const standups = await listStandups(workspaceId, limit);
  return NextResponse.json({ standups });
}
