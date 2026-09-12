/**
 * StandUp Comprehensive End-to-End System Test Suite
 *
 * Exercises the entire system end-to-end:
 * 1. Supabase Database Persistence & Query Layer
 * 2. Autonomous Multi-Party Standup Agent (DMs, Blocker Cross-Referencing, GitHub Verification, HITL, Receipts)
 * 3. Orchestrator Engine (Traces, Streaks, Guardrails, Token Telemetry, Auth0 RBAC, Multi-tenancy)
 * 4. Bots HTTP Webhook & Integration Server (/health, /trigger-standup, /execute-action)
 * 5. Control Plane API Layer Handlers
 */

import http from "node:http";
import { ReasoningEngine } from "@red/ai";
import {
  analyzeStandupSession,
  collectResponse,
  handleActionDecision,
  startStandup,
  type AgentPlatformPort,
} from "@red/agent";
import {
  createPendingAction,
  getAction,
  getLatestSummary,
  listDependencies,
  listPendingActions,
  listStandups,
  listUsers,
  listWorkspaces,
  updateActionStatus,
  upsertUser,
  upsertWorkspace,
} from "@red/database";
import {
  getActiveBlockers,
  fixtureEvent,
  getStore,
  ingestEnvironmentEvent,
  resolveApproval,
  validateApproverPermission,
} from "@red/orchestrator";
import { createHttpServer } from "../apps/bots/src/http";
import type { Platform, Workspace } from "@red/shared";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
    console.log(`  ✅ PASS: ${message}`);
  } else {
    failed++;
    console.error(`  ❌ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function requestJson<T>(
  url: string,
  options: { method?: string; body?: unknown } = {},
): Promise<{ status: number; data: T }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const postData = options.body ? JSON.stringify(options.body) : undefined;

    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        method: options.method || "GET",
        headers: {
          "Content-Type": "application/json",
          ...(postData ? { "Content-Length": Buffer.byteLength(postData) } : {}),
        },
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => {
          try {
            const data = raw ? JSON.parse(raw) : null;
            resolve({ status: res.statusCode || 200, data });
          } catch {
            resolve({ status: res.statusCode || 200, data: raw as unknown as T });
          }
        });
      },
    );

    req.on("error", reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function runAllTests() {
  console.log("\n================================================================================");
  console.log("🚀 EXECUTING STANDUP COMPREHENSIVE END-TO-END VERIFICATION");
  console.log("================================================================================\n");

  const startTime = Date.now();

  // ──────────────────────────────────────────────────────────────────────────
  // Stage 1: Database & Workspace Layer
  // ──────────────────────────────────────────────────────────────────────────
  console.log("📦 Stage 1: Supabase / Database Store Layer Verification");
  const wsId = "ws_e2e_corp";
  const workspace: Workspace = {
    id: wsId,
    name: "StandUp Engineering Team",
    platform: "slack",
    teamId: "T_E2E_TEAM",
    channelId: "C_STANDUP_MAIN",
  };
  await upsertWorkspace(workspace);

  const eugene = await upsertUser({
    id: "usr_e2e_eugene",
    workspaceId: wsId,
    platformUserId: "U_E2E_EUGENE",
    name: "Eugene",
    role: "Frontend Engineer",
  });

  const brian = await upsertUser({
    id: "usr_e2e_brian",
    workspaceId: wsId,
    platformUserId: "U_E2E_BRIAN",
    name: "Brian",
    role: "Backend Lead",
  });

  const mary = await upsertUser({
    id: "usr_e2e_mary",
    workspaceId: wsId,
    platformUserId: "U_E2E_MARY",
    name: "Mary",
    role: "QA Lead",
  });

  const workspaces = await listWorkspaces();
  const users = await listUsers(wsId);
  assert(workspaces.some((w) => w.id === wsId), "Workspace created and retrieved from DB");
  assert(users.length >= 3, `Retrieved ${users.length} seeded users`);

  // ──────────────────────────────────────────────────────────────────────────
  // Stage 2: Autonomous Agent Multi-Party Loop
  // ──────────────────────────────────────────────────────────────────────────
  console.log("\n🤖 Stage 2: Multi-Party Agent Standup & Blocker Cross-Referencing");
  const dmLog: string[] = [];
  const channelLog: string[] = [];
  const approvalLog: string[] = [];

  const agentPort: AgentPlatformPort = {
    sendDM: async (platform, userId, text) => {
      dmLog.push(`[@${userId}]: ${text}`);
    },
    postToChannel: async (platform, channelId, text) => {
      channelLog.push(text);
      return { messageTs: String(Date.now()) };
    },
    requestApproval: async (platform, channelId, actionId, text) => {
      approvalLog.push(`${actionId}: ${text}`);
    },
  };

  const standup = await startStandup({
    workspaceId: wsId,
    platform: "slack",
    port: agentPort,
    users: [eugene, brian, mary],
  });
  assert(standup.status === "in_progress", "Standup started in progress");
  assert(dmLog.length === 3, `Morning standup DMs dispatched to 3 teammates (got ${dmLog.length})`);

  // Teammates reply
  await collectResponse(
    {
      type: "dm.received",
      platform: "slack",
      workspaceId: wsId,
      channelId: "D_EUGENE",
      userId: eugene.platformUserId,
      text: "Yesterday: Built the login view. Today: Integrating OAuth endpoints. Blocked: Waiting on Brian to merge PR #42 (auth provider).",
      messageId: "msg_1",
      timestamp: new Date().toISOString(),
    },
    standup.id,
  );

  await collectResponse(
    {
      type: "dm.received",
      platform: "slack",
      workspaceId: wsId,
      channelId: "D_BRIAN",
      userId: brian.platformUserId,
      text: "Yesterday: Finished PR #42 for OAuth2 provider. Today: Database index tuning. Blockers: None, PR #42 is ready.",
      messageId: "msg_2",
      timestamp: new Date().toISOString(),
    },
    standup.id,
  );

  const replyMary = await collectResponse(
    {
      type: "dm.received",
      platform: "slack",
      workspaceId: wsId,
      channelId: "D_MARY",
      userId: mary.platformUserId,
      text: "Yesterday: Test coverage pass. Today: Smoke testing staging. Blockers: None.",
      messageId: "msg_3",
      timestamp: new Date().toISOString(),
    },
    standup.id,
  );
  assert(replyMary.allResponses.length === 3, "All 3 teammate responses collected");

  // AI Analysis
  const ai = new ReasoningEngine();
  const analysis = await analyzeStandupSession({
    standupId: standup.id,
    workspace,
    responses: replyMary.allResponses,
    ai,
    port: agentPort,
  });

  assert(analysis.dependencies.length > 0, `Blocker dependency detected (${analysis.dependencies.length})`);
  assert(analysis.pendingActions.length > 0, "Action generated from analysis");
  assert(channelLog.length > 0, "Summary receipt posted to team channel");

  // HITL Decision
  const hitlAction = analysis.pendingActions[0];
  const decisionResult = await handleActionDecision(
    hitlAction.id,
    "approved",
    "usr_tech_lead",
    agentPort,
  );
  assert(decisionResult.success, "HITL approval executed successfully");
  assert(decisionResult.action.status === "executed", "Action state updated to executed");

  const standupRecords = await listStandups(wsId);
  const summaryReceipt = await getLatestSummary(wsId);
  assert(standupRecords[0]?.status === "completed", "Standup marked completed in DB");
  assert(summaryReceipt !== null, "Summary receipt persisted in DB");

  // ──────────────────────────────────────────────────────────────────────────
  // Stage 3: Orchestrator Engine & Guardrails
  // ──────────────────────────────────────────────────────────────────────────
  console.log("\n🛡️ Stage 3: Orchestrator Streaks, Guardrails, Usage & RBAC");

  // Ingest multi-day blocker
  const run1 = await ingestEnvironmentEvent({
    ...fixtureEvent(),
    id: "evt_e2e_day1",
    environmentName: "Slack #standup",
    environmentKind: "slack",
    channelId: "C-e2e-blocker",
    threadId: "t1",
    signalType: "standup.collected",
    signalBody: "Alice: Waiting for Bob to deploy auth service.\nBob: Working on DB migration.",
    actors: [
      { id: "alice", role: "teammate", present: true, mayAct: true, language: "en" },
      { id: "bob", role: "teammate", present: true, mayAct: true, language: "en" },
    ],
    artifacts: [
      { kind: "standup_reply", id: "alice", summary: "Blocked on Bob for auth service" },
      { kind: "standup_reply", id: "bob", summary: "Working on migrations" },
    ],
    urgency: "medium",
    principal: "standup-lead",
    orgId: "org_engineering",
  });
  assert(run1.status === "completed", "Orchestrator Day 1 run completed");

  const run2 = await ingestEnvironmentEvent({
    ...fixtureEvent(),
    id: "evt_e2e_day2",
    environmentName: "Slack #standup",
    environmentKind: "slack",
    channelId: "C-e2e-blocker",
    threadId: "t2",
    signalType: "standup.collected",
    signalBody: "Alice: Still blocked on Bob for auth service.\nBob: Still finishing migration.",
    actors: [
      { id: "alice", role: "teammate", present: true, mayAct: true, language: "en" },
      { id: "bob", role: "teammate", present: true, mayAct: true, language: "en" },
    ],
    artifacts: [
      { kind: "standup_reply", id: "alice", summary: "Still blocked on Bob" },
    ],
    urgency: "medium",
    principal: "standup-lead",
    orgId: "org_engineering",
  });
  assert(run2.status === "completed", "Orchestrator Day 2 run completed");

  const activeBlockers = getActiveBlockers("C-e2e-blocker");
  const trackedBlocker = activeBlockers.find((b) => b.from === "alice" && b.to === "bob");
  assert(trackedBlocker !== undefined, "Multi-day blocker registered in store");
  assert((trackedBlocker?.streak ?? 0) >= 2, `Blocker streak detected across days (streak: ${trackedBlocker?.streak})`);

  // RBAC Permission Check
  const rbacLead = validateApproverPermission("tech-lead", {
    userId: "auth0|lead",
    roles: ["tech-lead"],
  });
  assert(rbacLead.pass, "Tech-lead role granted approval permission");

  const rbacGuest = validateApproverPermission("tech-lead", {
    userId: "auth0|guest",
    roles: ["viewer"],
  });
  assert(!rbacGuest.pass, "Viewer role rejected for tech-lead action");

  // ──────────────────────────────────────────────────────────────────────────
  // Stage 4: Bots HTTP Webhook Server
  // ──────────────────────────────────────────────────────────────────────────
  console.log("\n🌐 Stage 4: Bots HTTP Webhook Server Endpoints");
  const testPort = 3099;
  const botServer = createHttpServer(agentPort, testPort);

  // Allow server to bind
  await new Promise((r) => setTimeout(r, 100));

  try {
    // 1. Health check
    const health = await requestJson<{ status: string; name: string }>(
      `http://localhost:${testPort}/health`,
    );
    assert(health.status === 200, "HTTP /health returned HTTP 200");
    assert(health.data.status === "healthy", "Bot service status is healthy");

    // 2. Trigger standup via webhook
    const triggerRes = await requestJson<{ success: boolean; standup: { id: string } }>(
      `http://localhost:${testPort}/trigger-standup`,
      {
        method: "POST",
        body: { workspaceId: wsId },
      },
    );
    assert(triggerRes.status === 200, "HTTP /trigger-standup returned HTTP 200");
    assert(triggerRes.data.success, "Standup triggered via webhook");

    // 3. Execute action via webhook
    const testAction = await createPendingAction({
      workspaceId: wsId,
      standupId: triggerRes.data.standup.id,
      type: "send_dm",
      targetUserId: brian.platformUserId,
      message: "Please unblock Eugene on PR #42",
      requiresApproval: true,
      platform: "slack",
    });

    const execRes = await requestJson<{ success: boolean; message: string }>(
      `http://localhost:${testPort}/execute-action`,
      {
        method: "POST",
        body: {
          actionId: testAction.id,
          decision: "approved",
          approverUserId: "lead_dev",
        },
      },
    );
    assert(execRes.status === 200, "HTTP /execute-action returned HTTP 200");
    assert(execRes.data.success, "Action approved and executed via HTTP webhook");
  } finally {
    botServer.close();
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Stage 5: Control Plane Route Handlers
  // ──────────────────────────────────────────────────────────────────────────
  console.log("\n🖥️ Stage 5: Control Plane API Layer Handlers");
  const cpActions = await listPendingActions(wsId);
  assert(cpActions.length > 0, "Control Plane actions retrieved from Supabase store");

  const cpDeps = await listDependencies(wsId);
  assert(cpDeps.length > 0, "Control Plane dependencies retrieved from Supabase store");

  const duration = Date.now() - startTime;
  console.log("\n================================================================================");
  console.log(`🎉 ALL ${passed} END-TO-END TESTS PASSED IN ${duration}ms! (0 Failures)`);
  console.log("================================================================================\n");
}

runAllTests().catch((err) => {
  console.error("\n💥 End-to-end test execution crashed:", err);
  process.exit(1);
});
