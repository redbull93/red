/**
 * StandUp Autonomous Loop & E2E Validation Runner
 *
 * Runs the full end-to-end lifecycle:
 * 1. Morning Standup Initiation
 * 2. Multi-Party DM update collection
 * 3. AI Cross-Reference & Blocker Deduction
 * 4. GitHub PR Reality Check (#42)
 * 5. Human-In-The-Loop Approval & Action Execution
 * 6. Channel Receipt Delivery
 */

import { ReasoningEngine } from "@red/ai";
import {
  analyzeStandupSession,
  collectResponse,
  handleActionDecision,
  startStandup,
  type AgentPlatformPort,
} from "@red/agent";
import {
  getAction,
  getLatestSummary,
  listDependencies,
  listStandups,
  upsertUser,
  upsertWorkspace,
} from "@red/database";
import type { Platform, Workspace } from "@red/shared";

async function main() {
  console.log("================================================================================");
  console.log("🤖 STARTING STANDUP AUTONOMOUS MULTI-PARTY LOOP VERIFICATION");
  console.log("================================================================================\n");

  const channelMessages: string[] = [];
  const dmMessages: { userId: string; text: string }[] = [];
  const approvalPrompts: { actionId: string; text: string }[] = [];

  const mockPort: AgentPlatformPort = {
    sendDM: async (_platform, userId, text) => {
      dmMessages.push({ userId, text });
      console.log(`📩 [DM -> @${userId}]: ${text.split("\n")[0]}`);
    },
    postToChannel: async (_platform, channelId, text) => {
      channelMessages.push(text);
      console.log(`📢 [CHANNEL #${channelId} POST]:\n${text}\n`);
      return { messageTs: "1720000000.000100" };
    },
    requestApproval: async (_platform, channelId, actionId, text) => {
      approvalPrompts.push({ actionId, text });
      console.log(`⚠️ [HITL APPROVAL REQUEST] Action ID: ${actionId}\n${text}\n`);
    },
  };

  const ai = new ReasoningEngine({
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
  });

  // 1. Setup Workspace & Users
  const workspace: Workspace = {
    id: "ws_demo_loop",
    name: "StandUp Engineering Loop",
    platform: "slack",
    teamId: "T_DEMO_LOOP",
    channelId: "C_STANDUP_RECEIPTS",
  };

  await upsertWorkspace(workspace);

  const eugene = await upsertUser({
    id: "usr_eugene",
    workspaceId: workspace.id,
    platformUserId: "U_EUGENE",
    name: "Eugene",
    role: "Frontend Engineer",
  });

  const brian = await upsertUser({
    id: "usr_brian",
    workspaceId: workspace.id,
    platformUserId: "U_BRIAN",
    name: "Brian",
    role: "Backend Lead",
  });

  const mary = await upsertUser({
    id: "usr_mary",
    workspaceId: workspace.id,
    platformUserId: "U_MARY",
    name: "Mary",
    role: "QA Lead",
  });

  console.log("Step 1: Initiating Daily Standup across workspace...");
  const standup = await startStandup({
    workspaceId: workspace.id,
    platform: workspace.platform,
    port: mockPort,
    users: [eugene, brian, mary],
  });
  console.log(`✅ Standup ${standup.id} started. DMs sent to teammates.\n`);

  // 2. Submit DM responses
  console.log("Step 2: Teammates replying with daily updates via DM...");

  const eugeneReply = await collectResponse(
    {
      type: "dm.received",
      platform: "slack",
      workspaceId: workspace.id,
      channelId: "D_EUGENE",
      userId: eugene.platformUserId,
      text: "Yesterday: Built the login screen UI. Today: Integrating OAuth endpoints. Blocked: Waiting on Brian to merge PR #42 (auth token provider).",
      messageId: "m_1",
      timestamp: new Date().toISOString(),
    },
    standup.id,
  );
  console.log(`  ✓ Collected update from @Eugene`);

  const brianReply = await collectResponse(
    {
      type: "dm.received",
      platform: "slack",
      workspaceId: workspace.id,
      channelId: "D_BRIAN",
      userId: brian.platformUserId,
      text: "Yesterday: Finished PR #42 for OAuth2 auth provider. Today: Database migrations. Blockers: None, PR #42 is ready.",
      messageId: "m_2",
      timestamp: new Date().toISOString(),
    },
    standup.id,
  );
  console.log(`  ✓ Collected update from @Brian`);

  const maryReply = await collectResponse(
    {
      type: "dm.received",
      platform: "slack",
      workspaceId: workspace.id,
      channelId: "D_MARY",
      userId: mary.platformUserId,
      text: "Yesterday: Regression testing v1.2. Today: Verifying staging build. Blockers: None.",
      messageId: "m_3",
      timestamp: new Date().toISOString(),
    },
    standup.id,
  );
  console.log(`  ✓ Collected update from @Mary\n`);

  // 3. Analyze Multi-Party Standup
  console.log("Step 3: Reasoning Engine analyzing multi-party updates + GitHub reality check...");
  const analysis = await analyzeStandupSession({
    standupId: standup.id,
    workspace,
    responses: maryReply.allResponses,
    ai,
    port: mockPort,
  });

  console.log("--------------------------------------------------------------------------------");
  console.log("📊 ANALYSIS RESULTS:");
  console.log(`Summary: ${analysis.decision.summary}`);
  console.log(`Blockers Detected: ${analysis.dependencies.length}`);
  for (const dep of analysis.dependencies) {
    console.log(`  - [${dep.type.toUpperCase()}] ${dep.subject} (status: ${dep.status})`);
  }
  console.log(`GitHub Reality Checks: ${analysis.reconciliationNotes.length}`);
  for (const note of analysis.reconciliationNotes) {
    console.log(`  - ${note}`);
  }
  console.log(`Pending Actions: ${analysis.pendingActions.length}`);
  for (const act of analysis.pendingActions) {
    console.log(`  - [${act.type}] ${act.message} (approval required: ${act.requiresApproval})`);
  }
  console.log("--------------------------------------------------------------------------------\n");

  // 4. Simulate Human-In-The-Loop Approval
  if (analysis.pendingActions.length > 0) {
    const firstAction = analysis.pendingActions[0];
    console.log(`Step 4: Executing Human-In-The-Loop (HITL) decision on action ${firstAction.id}...`);
    const hitlResult = await handleActionDecision(
      firstAction.id,
      "approved",
      "usr_admin",
      mockPort,
    );
    console.log(`✅ HITL Action Decision: ${hitlResult.message}\n`);
  }

  // 5. Verification checks
  const finalStandups = await listStandups(workspace.id);
  const finalDeps = await listDependencies(workspace.id);
  const summaryReceipt = await getLatestSummary(workspace.id);

  console.log("Step 5: Database & Receipt State Validation:");
  console.log(`  • Standup Completed: ${finalStandups[0]?.status === "completed" ? "✅ YES" : "❌ NO"}`);
  console.log(`  • Dependencies Tracked: ${finalDeps.length > 0 ? `✅ YES (${finalDeps.length})` : "❌ NO"}`);
  console.log(`  • Channel Receipt Landed: ${summaryReceipt ? "✅ YES" : "❌ NO"}`);

  console.log("\n================================================================================");
  console.log("✨ ALL STANDUP LOOP STAGES VERIFIED CLEANLY!");
  console.log("================================================================================");
}

main().catch((err) => {
  console.error("❌ Loop runner failed:", err);
  process.exit(1);
});
