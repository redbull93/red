import { seedDemoData } from "@red/orchestrator";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Fills the board with demo stand-ups.
 *
 * This has to be a route rather than a CLI script because the engine store lives
 * on globalThis inside whichever process owns it — seeding from a terminal would
 * populate a store that the web app never sees.
 *
 * Refuses to run in production. The seeded runs are indistinguishable from real
 * ones at a glance, which is fine on a demo laptop and not fine on a deployment
 * someone is trusting.
 */
export async function POST() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_SEED !== "1") {
    return NextResponse.json(
      { error: "Demo seeding is disabled in production. Set ALLOW_DEMO_SEED=1 to override." },
      { status: 403 },
    );
  }

  const summary = seedDemoData();
  return NextResponse.json({ ok: true, seeded: summary });
}
