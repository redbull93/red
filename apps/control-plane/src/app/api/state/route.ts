import { getStore } from "@red/orchestrator";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(getStore().snapshot());
}
