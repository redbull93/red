import {
  fixtureEvent,
  getStore,
  ingestEnvironmentEvent,
  resolveApproval,
  createGlobalStream,
  onAgUi,
  getAllUsage,
  getAllBlockers,
  getActiveBlockers,
} from "./index";
import type { ApproverIdentity, EnvironmentEvent } from "./types";

// ── ANSI Color Helpers for Terminal Output ─────────────────────────
const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  blue: "\x1b[34m",
};

interface TestResult {
  name: string;
  passed: boolean;
  durationMs: number;
  details: string;
  error?: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

async function runTest(name: string, fn: () => Promise<string>) {
  const start = Date.now();
  process.stdout.write(`  ${c.cyan}RUNS${c.reset}  ${name}...`);
  try {
    const details = await fn();
    const durationMs = Date.now() - start;
    results.push({ name, passed: true, durationMs, details });
    process.stdout.write(`\r  ${c.green}PASS${c.reset}  ${name} ${c.dim}(${durationMs}ms)${c.reset}\n`);
    if (details) {
      console.log(`        ${c.dim}↳ ${details}${c.reset}`);
    }
  } catch (err: unknown) {
    const durationMs = Date.now() - start;
    const errorMsg = err instanceof Error ? err.message : String(err);
    results.push({ name, passed: false, durationMs, details: "", error: errorMsg });
    process.stdout.write(`\r  ${c.red}FAIL${c.reset}  ${name} ${c.dim}(${durationMs}ms)${c.reset}\n`);
    console.error(`        ${c.red}↳ Error: ${errorMsg}${c.reset}`);
  }
}

// ── Test Suites ───────────────────────────────────────────────────

console.log(`\n${c.bold}${c.magenta}═══ StandUp Agent Orchestrator Test Suite ═══${c.reset}\n`);

// Test 1: Standard End-to-End Ingestion Loop
await runTest("1. Standard Loop: Standup Collection & Receipt Generation", async () => {
  const event = fixtureEvent({ forceFail: false, requireHitl: false });
  const run = await ingestEnvironmentEvent(event);

  assert(run.status === "completed", `Expected status 'completed', got '${run.status}'`);
  
  const store = getStore();
  const receipts = store.receipts.filter((r) => r.runId === run.id);
  assert(receipts.length > 0, "Expected at least 1 receipt to be generated");

  const receipt = receipts[0];
  assert(receipt.channelId === "C-standup", `Expected channel 'C-standup', got '${receipt.channelId}'`);
  assert(receipt.body.includes("Stand-up summary") || receipt.body.length > 0, "Receipt body is empty");

  return `Run ID: ${run.id} | Receipts: ${receipts.length} | Status: ${run.status}`;
});

// Test 2: Cross-Run Blocker & Memory Tracking
await runTest("2. Cross-Run Memory: Multi-Day Blocker Streak Detection", async () => {
  const day1Event: EnvironmentEvent = {
    ...fixtureEvent(),
    id: "evt_test_day1",
    channelId: "C-team-alpha",
    signalBody: "Alice: Waiting for Bob to deploy auth service.\nBob: Working on DB migration.",
    actors: [
      { id: "alice", role: "teammate", present: true, mayAct: true, language: "en" },
      { id: "bob", role: "teammate", present: true, mayAct: true, language: "en" },
    ],
  };

  const day2Event: EnvironmentEvent = {
    ...fixtureEvent(),
    id: "evt_test_day2",
    channelId: "C-team-alpha",
    signalBody: "Alice: Still blocked on Bob for auth service.\nBob: Still finishing migration.",
    actors: [
      { id: "alice", role: "teammate", present: true, mayAct: true, language: "en" },
      { id: "bob", role: "teammate", present: true, mayAct: true, language: "en" },
    ],
  };

  await ingestEnvironmentEvent(day1Event);
  await ingestEnvironmentEvent(day2Event);

  const blockers = getActiveBlockers("C-team-alpha");
  assert(blockers.length > 0, "Expected at least one blocker to be detected for C-team-alpha");

  const aliceBlocker = blockers.find((b) => b.from === "alice" && b.to === "bob");
  assert(Boolean(aliceBlocker), "Expected blocker from alice -> bob");
  assert((aliceBlocker?.streak ?? 0) >= 2, `Expected streak >= 2, got ${aliceBlocker?.streak}`);

  return `Tracked blocker 'alice → bob' with streak of ${aliceBlocker?.streak} days`;
});

// Test 3: Guardrail Enforcement
await runTest("3. Guardrail Engine: Actor Grounding & Safety Checks", async () => {
  const event: EnvironmentEvent = {
    ...fixtureEvent(),
    id: "evt_guardrail_test",
    channelId: "C-guardrails",
    signalBody: "Charlie: All tests passing.",
    actors: [
      { id: "charlie", role: "teammate", present: true, mayAct: true, language: "en" },
    ],
  };

  const run = await ingestEnvironmentEvent(event);
  const store = getStore();
  const guardrailTraces = store.traces.filter(
    (t) => t.runId === run.id && t.title === "Guardrail check"
  );

  assert(guardrailTraces.length > 0, "Expected guardrail check trace event");
  return `Guardrail check executed (${guardrailTraces.length} check(s) recorded in trace)`;
});

// Test 4: Token & Cost Usage Tracking
await runTest("4. Usage Analytics: Token & Cost Attribution", async () => {
  const allUsage = getAllUsage();
  assert(allUsage.length > 0, "Expected usage records to be present in store");

  const latest = allUsage[allUsage.length - 1];
  assert(typeof latest.runId === "string", "Usage record missing runId");
  assert(typeof latest.estimatedCostUsd === "number", "Usage record missing estimatedCostUsd");

  return `Recorded ${allUsage.length} LLM turns | Latest model: ${latest.model}`;
});

// Test 5: Human-In-The-Loop (HITL) Workflow
await runTest("5. HITL Interception & Approval Resolution", async () => {
  const hitlEvent = fixtureEvent({ requireHitl: true });
  const hitlRun = await ingestEnvironmentEvent(hitlEvent);

  assert(hitlRun.status === "awaiting_hitl", `Expected status 'awaiting_hitl', got '${hitlRun.status}'`);

  const store = getStore();
  const pendingApproval = store.approvals.find(
    (a) => a.runId === hitlRun.id && a.status === "pending"
  );
  assert(Boolean(pendingApproval), "Expected a pending approval in store");

  // Approve the action with verified Auth0 approver identity
  const approver: ApproverIdentity = {
    userId: "auth0|64f123abc456",
    email: "lead@acme.corp",
    name: "Ada Lovelace",
    roles: ["tech-lead", "member"],
  };

  const resolvedRun = await resolveApproval(pendingApproval!.id, "approve", approver);
  assert(resolvedRun?.status === "completed", `Expected status 'completed' after approval, got '${resolvedRun?.status}'`);
  
  const resolvedReceipts = store.receipts.filter((r) => r.runId === resolvedRun!.id);
  assert(resolvedReceipts.length > 0, "Expected receipt generated after approval");
  assert(resolvedReceipts[0].approvedBy?.userId === "auth0|64f123abc456", "Expected receipt to record Auth0 approver");

  return `Approval ${pendingApproval!.id} approved by ${approver.name} (${approver.userId}) -> Run ${resolvedRun!.id} completed`;
});

// Test 6: Real-time Ag-UI SSE Stream
await runTest("6. Ag-UI Streaming: SSE Stream & Event Dispatch", async () => {
  let eventCount = 0;
  const unsubscribe = onAgUi(() => {
    eventCount++;
  });

  const stream = createGlobalStream();
  assert(Boolean(stream), "Expected createGlobalStream() to return a ReadableStream");

  const testEvent = fixtureEvent({ forceFail: false });
  await ingestEnvironmentEvent(testEvent);

  unsubscribe();
  assert(eventCount > 0, `Expected Ag-UI events to be emitted, got ${eventCount}`);

  return `Dispatched and observed ${eventCount} realtime Ag-UI lifecycle events`;
});

// Test 7: Auth0 RBAC Guardrail Enforcement
await runTest("7. Auth0 RBAC: Role-Based Approval Verification", async () => {
  const highRiskEvent = fixtureEvent({
    requireHitl: true,
    urgency: "high",
  });
  const run = await ingestEnvironmentEvent(highRiskEvent);
  const store = getStore();
  const approval = store.approvals.find((a) => a.runId === run.id && a.status === "pending");
  assert(Boolean(approval), "Expected high risk approval");
  assert(approval?.requiredRole === "tech-lead", `Expected requiredRole 'tech-lead', got ${approval?.requiredRole}`);

  // Test unauthorized approval attempt (dev role lacking tech-lead/admin)
  let rejected = false;
  try {
    await resolveApproval(approval!.id, "approve", {
      userId: "auth0|junior_dev",
      email: "junior@acme.corp",
      roles: ["junior-dev"],
    });
  } catch {
    rejected = true;
  }
  assert(rejected, "Expected approval to be rejected for lacking required role");

  // Test authorized approval (tech-lead role)
  const authorizedRun = await resolveApproval(approval!.id, "approve", {
    userId: "auth0|tech_lead_99",
    email: "lead@acme.corp",
    roles: ["tech-lead"],
  });
  assert(authorizedRun?.status === "completed", "Expected run to succeed with authorized role");

  return `RBAC blocked unauthorized approver and allowed verified role 'tech-lead'`;
});

// Test 8: Multi-Tenant Scoping (Auth0 Organizations)
await runTest("8. Multi-Tenancy: Auth0 Organization Memory & Ledger Scoping", async () => {
  const org1Event: EnvironmentEvent = {
    ...fixtureEvent(),
    id: "evt_org1_day1",
    orgId: "org_alpha_inc",
    channelId: "C-standup",
    signalBody: "Dave: Blocked on Emma for API key.",
    actors: [
      { id: "dave", role: "teammate", present: true, mayAct: true, language: "en" },
      { id: "emma", role: "teammate", present: true, mayAct: true, language: "en" },
    ],
  };

  const org2Event: EnvironmentEvent = {
    ...fixtureEvent(),
    id: "evt_org2_day1",
    orgId: "org_beta_corp",
    channelId: "C-standup",
    signalBody: "Dave: All good, working on UI.",
    actors: [
      { id: "dave", role: "teammate", present: true, mayAct: true, language: "en" },
    ],
  };

  await ingestEnvironmentEvent(org1Event);
  await ingestEnvironmentEvent(org2Event);

  const org1Blockers = getAllBlockers("org_alpha_inc");
  const org2Blockers = getAllBlockers("org_beta_corp");

  assert(org1Blockers.length > 0, "Expected blockers in org_alpha_inc");
  assert(org2Blockers.length === 0, "Expected no blockers in org_beta_corp");

  return `Isolated memory: org_alpha_inc has ${org1Blockers.length} blocker(s) while org_beta_corp has ${org2Blockers.length}`;
});

// ── Summary Report ────────────────────────────────────────────────

console.log(`\n${c.bold}═══ Test Summary ═══${c.reset}`);
const passedCount = results.filter((r) => r.passed).length;
const totalCount = results.length;
const totalTime = results.reduce((acc, r) => acc + r.durationMs, 0);

if (passedCount === totalCount) {
  console.log(`${c.green}${c.bold}✔ ALL ${totalCount} TESTS PASSED${c.reset} ${c.dim}(total ${totalTime}ms)${c.reset}\n`);
  process.exit(0);
} else {
  console.log(`${c.red}${c.bold}✖ ${totalCount - passedCount} OF ${totalCount} TESTS FAILED${c.reset} ${c.dim}(total ${totalTime}ms)${c.reset}\n`);
  process.exit(1);
}
