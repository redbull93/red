import { listDependencies, updateDependencyStatus } from "@red/database";
import type { DependencyStatus } from "@red/shared";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const workspaceId = searchParams.get("workspaceId") || undefined;
  const standupId = searchParams.get("standupId") || undefined;

  const dependencies = await listDependencies(workspaceId, standupId);
  return NextResponse.json({ dependencies });
}

export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    id: string;
    status: DependencyStatus;
  };

  if (!body.id || !body.status) {
    return NextResponse.json(
      { error: "Missing id or status" },
      { status: 400 },
    );
  }

  const updated = await updateDependencyStatus(body.id, body.status);
  return NextResponse.json({ dependency: updated });
}
