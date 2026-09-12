import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CouncilVerdict } from "./types";
import { loadRuntimeEnv, repoRoot } from "./runtime-env";

/**
 * Captured council verdicts.
 *
 * Agent Router rations GPT and Opus in daily batches, so a full three-model
 * verdict is only obtainable in certain windows. Rather than fake a council when
 * two seats are 402, we capture real verdicts when they happen and replay them —
 * clearly labelled as replayed, never as live. A cached-but-real verdict is
 * honest; three hardcoded opinions would not be.
 */

const DIR_NAME = join("fixtures", "council");

function cacheDir(): string {
  return join(repoRoot(), DIR_NAME);
}

function slug(tag: string): string {
  return tag.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "") || "verdict";
}

/**
 * Replay is opt-in. `COUNCIL_REPLAY=1` uses the newest capture; setting it to a
 * tag replays that specific one.
 */
export function replayRequest(): { active: boolean; tag?: string } {
  loadRuntimeEnv();
  const raw = (process.env.COUNCIL_REPLAY || "").trim();
  if (!raw || /^(0|false|no|off)$/i.test(raw)) return { active: false };
  if (/^(1|true|yes|on|latest)$/i.test(raw)) return { active: true };
  return { active: true, tag: slug(raw) };
}

/** Only multi-seat verdicts are worth keeping; a single seat proves no agreement. */
export function isWorthCaching(verdict: CouncilVerdict): boolean {
  return !verdict.cached && verdict.seated.length >= 2;
}

export function saveVerdict(verdict: CouncilVerdict, tag = "latest"): string | null {
  try {
    const dir = cacheDir();
    mkdirSync(dir, { recursive: true });
    const stamp = verdict.at.replace(/[:.]/g, "-");
    const named = join(dir, `${slug(tag)}-${stamp}.json`);
    const payload = JSON.stringify(verdict, null, 2);
    writeFileSync(named, payload, "utf8");
    // A stable filename so COUNCIL_REPLAY=1 always finds the newest capture.
    writeFileSync(join(dir, "latest.json"), payload, "utf8");
    return named;
  } catch {
    return null;
  }
}

export function loadVerdict(tag?: string): CouncilVerdict | null {
  const dir = cacheDir();
  if (!existsSync(dir)) return null;

  let file: string | null = null;
  if (tag) {
    const matches = readdirSync(dir)
      .filter((f) => f.startsWith(tag) && f.endsWith(".json"))
      .sort();
    file = matches.length ? join(dir, matches[matches.length - 1]) : null;
  } else {
    const latest = join(dir, "latest.json");
    file = existsSync(latest) ? latest : null;
  }
  if (!file) return null;

  try {
    const verdict = JSON.parse(readFileSync(file, "utf8")) as CouncilVerdict;
    // Replayed material is always marked, so nothing downstream can present it
    // as a live result.
    return { ...verdict, cached: true };
  } catch {
    return null;
  }
}

export function listVerdicts(): string[] {
  const dir = cacheDir();
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
}
