/**
 * Fills the control-plane board with demo stand-ups.
 *
 * The engine store lives on globalThis inside whichever process owns it, so this
 * cannot seed in-process and then expect the web app to see it — it has to ask the
 * running app to seed itself. Which means the dev server must be up first.
 */

const BASE = process.env.CONTROL_PLANE_URL ?? "http://localhost:3000";

async function main(): Promise<number> {
  let response: Response;
  try {
    response = await fetch(`${BASE}/api/demo-seed`, {
      method: "POST",
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    console.error(`Could not reach the control plane at ${BASE}.`);
    console.error("Start it with `npm run dev`, then run this again.");
    console.error(`  ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }

  const body = (await response.json().catch(() => ({}))) as {
    seeded?: Record<string, unknown>;
    error?: string;
  };

  if (!response.ok) {
    console.error(`Seed failed (${response.status}): ${body.error ?? "unknown"}`);
    return 1;
  }

  const seeded = body.seeded ?? {};
  console.log("Seeded the board:");
  for (const [key, value] of Object.entries(seeded)) {
    console.log(`  ${key.padEnd(18)} ${value}`);
  }
  console.log(`\nOpen ${BASE}/dungeon — one run is waiting on the Warden.`);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
