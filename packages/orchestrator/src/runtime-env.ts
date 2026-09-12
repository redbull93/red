import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/**
 * Reads .env.local from the repo root into process.env.
 *
 * Next.js does this automatically, but `npm run loop`, the test suite, and
 * Trigger.dev tasks are plain Node processes that do not, so without this the
 * CLI silently ran against no keys and every integration fell back to a stub.
 *
 * Distinct from @red/shared's loadEnv, which validates an already-populated
 * process.env with zod. This populates it; that one checks it.
 */
let loaded = false;

const CANDIDATES = [".env.local", ".env"];

function findRepoRoot(from: string): string | null {
  let dir = from;
  for (let up = 0; up < 8; up += 1) {
    if (existsSync(join(dir, "package-lock.json")) || existsSync(join(dir, ".git"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function repoRoot(): string {
  return findRepoRoot(resolve(process.cwd())) ?? resolve(process.cwd());
}

export function loadRuntimeEnv(): void {
  if (loaded) return;
  loaded = true;

  const root = findRepoRoot(resolve(process.cwd()));
  if (!root) return;

  for (const name of CANDIDATES) {
    const path = join(root, name);
    if (!existsSync(path)) continue;
    try {
      // Existing process.env values win, so a real shell export always beats
      // whatever is in the file.
      process.loadEnvFile(path);
    } catch {
      // A malformed env file should not take the loop down; keys just stay unset
      // and every integration falls back to its honest stub.
    }
  }
}

export function envInt(name: string, fallback: number): number {
  loadRuntimeEnv();
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}
