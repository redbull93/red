/**
 * Captures a real three-model council verdict to fixtures/council/.
 *
 * Agent Router releases GPT and Opus in daily batches (03:00, 11:00 and 19:00
 * Nairobi time) and they stay 402 once a batch drains. So the window where a full
 * council is possible is narrow and may not overlap with when you film.
 *
 * Run this the moment `npm run preflight` shows two or three seats alive. The
 * capture is a genuine verdict from genuine models; replaying it later is honest
 * because it is labelled as replayed everywhere it surfaces.
 *
 *   npm run council:capture
 *   COUNCIL_REPLAY=1 npm run loop     # replays the capture
 */

import {
  fixtureEvent,
  loadRuntimeEnv,
  runCouncil,
  saveVerdict,
  summarizeVerdict,
  toAgentContext,
} from "@red/orchestrator";

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  magenta: "\x1b[35m",
};

// Wrapped rather than using top-level await: scripts/ resolves against the root
// package, which is not an ES module.
async function main(): Promise<number> {
loadRuntimeEnv();

const tag = process.argv[2] ?? "standup";

console.log(`\n${c.bold}${c.magenta}═══ Capturing council verdict ═══${c.reset}\n`);

const event = toAgentContext(fixtureEvent());
const verdict = await runCouncil(event);

console.log(`  ${c.bold}${summarizeVerdict(verdict)}${c.reset}\n`);

for (const opinion of verdict.opinions) {
  if (opinion.status === "abstained") {
    console.log(
      `  ${c.yellow}abstained${c.reset} ${opinion.label.padEnd(9)} ${c.dim}${opinion.abstainReason}${c.reset}`,
    );
    continue;
  }
  console.log(
    `  ${c.green}answered ${c.reset} ${opinion.label.padEnd(9)} confidence ${opinion.confidence} · ${opinion.latencyMs}ms · ${opinion.totalTokens ?? "?"} tokens`,
  );
  for (const dep of opinion.dependencies) {
    console.log(`            ${c.dim}${dep.waiter} waits on ${dep.blocker} — ${dep.artifact}${c.reset}`);
  }
  if (opinion.suggestedAction) {
    console.log(`            ${c.dim}suggests: ${opinion.suggestedAction}${c.reset}`);
  }
}

console.log();
if (verdict.consensus.length) {
  console.log(`  ${c.bold}Agreed by all seated models${c.reset}`);
  for (const claim of verdict.consensus) {
    console.log(`    ${claim.text} ${c.dim}(${claim.agreedBy.join(", ")})${c.reset}`);
  }
}
if (verdict.dissent.length) {
  console.log(`\n  ${c.bold}Contested — this is what a human decides${c.reset}`);
  for (const claim of verdict.dissent) {
    console.log(`    ${claim.text} ${c.dim}(only ${claim.agreedBy.join(", ")})${c.reset}`);
  }
}

console.log();
if (verdict.seated.length < 2) {
  console.log(
    `${c.red}Not saved.${c.reset} Only ${verdict.seated.length} seat answered, so there is no agreement to capture.`,
  );
  console.log(
    `${c.dim}Wait for the next quota release (03:00 / 11:00 / 19:00 Nairobi) and run this again.${c.reset}\n`,
  );
  return 1;
}

const path = saveVerdict(verdict, tag);
console.log(`${c.green}${c.bold}✔ captured${c.reset} ${path ?? "(write failed)"}`);
console.log(`${c.dim}Replay with: COUNCIL_REPLAY=1 npm run loop${c.reset}\n`);
return 0;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(`${c.red}capture crashed:${c.reset}`, error);
    process.exit(1);
  },
);
