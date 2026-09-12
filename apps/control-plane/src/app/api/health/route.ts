import { isSupabaseConfigured } from "@red/database";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    status: "healthy",
    project: "StandUp",
    version: "0.1.0",
    supabase: isSupabaseConfigured() ? "connected" : "in-memory-fallback",
    timestamp: new Date().toISOString(),
  });
}
