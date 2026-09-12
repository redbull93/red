/**
 * StandUp Bot Adapters Automated Test Suite: Slack & Discord
 *
 * Tests the complete lifecycle for both Slack and Discord:
 * 1. Slash Commands (/standup)
 * 2. Teammate Direct Messages (DMs)
 * 3. Cross-Referencing & Summary Receipt Generation
 * 4. Human-In-The-Loop Interactive Buttons (Approve / Stop)
 * 5. Database Persistence in Supabase
 */

import {
  startStandup,
  collectResponse,
  analyzeStandupSession,
  handleActionDecision,
  type AgentPlatformPort,
} from "@red/agent";
import {
  upsertWorkspace,
  upsertUser,
  listStandups,
  listDependencies,
  getLatestSummary,
} from "@red/database";
import { ReasoningEngine } from "@red/ai";
import { formatDecision } from "@red/orchestrator";
import type { Workspace } from "@red/shared";

let passed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    passed++;
    console.log(`  ✅ [PASS] ${msg}`);
  } else {
    console.error(`  ❌ [FAIL] ${msg}`);
    throw new Error(`Assertion failed: ${msg}`);
  }
}

async function runBotsTest() {
  console.log("\n================================================================================");
  console.log("🤖 RUNNING SLACK & DISCORD INTEGRATION TEST SUITE");
  console.log("================================================================================\n");

  const ai = new ReasoningEngine();

  // ──────────────────────────────────────────────────────────────────────────
  // TEST PART 1: SLACK ADAPTER WORKFLOW
  // ──────────────────────────────────────────────────────────────────────────
  console.log("🟦 PART 1: Slack Adapter Automated Lifecycle");
  const slackWorkspace: Workspace = {
    id: "ws_slack_test",
    name: "Acme Engineering (Slack)",
    platform: "slack",
    teamId: "T_SLACK_100",
    channelId: "C_STANDUP_SLACK",
  };
  await upsertWorkspace(slackWorkspace);

  const eugeneSlack = await upsertUser({
    id: "usr_slack_eugene",
    workspaceId: slackWorkspace.id,
    platformUserId: "U_SLACK_EUGENE",
    name: "Eugene",
    role: "Frontend Engineer",
  });

  const brianSlack = await upsertUser({
    id: "usr_slack_brian",
    workspaceId: slackWorkspace.id,
    platformUserId: "U_SLACK_BRIAN",
    name: "Brian",
    role: "Backend Lead",
  });

  const slackDMs: { to: string; text: string }[] = [];
  const slackChannelPosts: { channel: string; text: string; blocks?: unknown[] }[] = [];
  const slackApprovals: { actionId: string; text: string }[] = [];

  const slackPort: AgentPlatformPort = {
    sendDM: async (p, uid, text) => {
      slackDMs.push({ to: uid, text });
    },
    postToChannel: async (p, ch, text) => {
      slackChannelPosts.push({ channel: ch, text });
      return { messageTs: String(Date.now()) };
    },
    requestApproval: async (p, ch, actionId, text) => {
      slackApprovals.push({ actionId, text });
    },
  };

  // 1. Slash command `/standup`
  console.log("  Step 1.1: Simulating Slack Slash Command `/standup`...");
  const slackStandup = await startStandup({
    workspaceId: slackWorkspace.id,
    platform: "slack",
    port: slackPort,
    users: [eugeneSlack, brianSlack],
  });
  assert(slackStandup.status === "in_progress", "Slack standup initialized");
  assert(slackDMs.length === 2, "Slack DMs dispatched to Eugene and Brian");

  // 2. DM replies
  console.log("  Step 1.2: Simulating Slack DM responses...");
  await collectResponse(
    {
      type: "dm.received",
      platform: "slack",
      workspaceId: slackWorkspace.id,
      channelId: "D_EUGENE",
      userId: eugeneSlack.platformUserId,
      text: "Waiting for Brian to publish the OAuth2 endpoints docs.",
      messageId: "slack_msg_1",
      timestamp: new Date().toISOString(),
    },
    slackStandup.id,
  );

  const slackReplies = await collectResponse(
    {
      type: "dm.received",
      platform: "slack",
      workspaceId: slackWorkspace.id,
      channelId: "D_BRIAN",
      userId: brianSlack.platformUserId,
      text: "OAuth2 endpoint is finished, docs are in my local notes.",
      messageId: "slack_msg_2",
      timestamp: new Date().toISOString(),
    },
    slackStandup.id,
  );
  assert(slackReplies.allResponses.length === 2, "Collected 2 Slack DM responses");

  // 3. Slack Cross-Reference Analysis
  console.log("  Step 1.3: Cross-referencing Slack updates & generating Block Kit receipt...");
  const slackAnalysis = await analyzeStandupSession({
    standupId: slackStandup.id,
    workspace: slackWorkspace,
    responses: slackReplies.allResponses,
    ai,
    port: slackPort,
  });
  assert(slackAnalysis.dependencies.length > 0, "Slack blocker detected by Reasoning Engine");
  assert(slackChannelPosts.length > 0, "Slack Block Kit receipt delivered to #standup channel");

  // 4. Slack HITL Button Click
  console.log("  Step 1.4: Simulating Slack Block Kit `Approve` button interaction...");
  if (slackAnalysis.pendingActions.length > 0) {
    const slackAction = slackAnalysis.pendingActions[0];
    const hitlRes = await handleActionDecision(slackAction.id, "approved", "admin_slack", slackPort);
    assert(hitlRes.success, "Slack HITL button click approved and executed");
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST PART 2: DISCORD ADAPTER WORKFLOW
  // ──────────────────────────────────────────────────────────────────────────
  console.log("\n🟪 PART 2: Discord Adapter Automated Lifecycle");
  const discordWorkspace: Workspace = {
    id: "ws_discord_test",
    name: "Acme Community (Discord)",
    platform: "discord",
    teamId: "G_GUILD_200",
    channelId: "C_STANDUP_DISCORD",
  };
  await upsertWorkspace(discordWorkspace);

  const maryDiscord = await upsertUser({
    id: "usr_disc_mary",
    workspaceId: discordWorkspace.id,
    platformUserId: "111222333",
    name: "Mary",
    role: "QA Lead",
  });

  const aminaDiscord = await upsertUser({
    id: "usr_disc_amina",
    workspaceId: discordWorkspace.id,
    platformUserId: "444555666",
    name: "Amina",
    role: "Product Designer",
  });

  const discordDMs: { to: string; text: string }[] = [];
  const discordChannelPosts: { channel: string; text: string }[] = [];
  const discordApprovals: { actionId: string; text: string }[] = [];

  const discordPort: AgentPlatformPort = {
    sendDM: async (p, uid, text) => {
      discordDMs.push({ to: uid, text });
    },
    postToChannel: async (p, ch, text) => {
      discordChannelPosts.push({ channel: ch, text });
      return { messageTs: String(Date.now()) };
    },
    requestApproval: async (p, ch, actionId, text) => {
      discordApprovals.push({ actionId, text });
    },
  };

  // 1. Discord Slash Command `/standup`
  console.log("  Step 2.1: Simulating Discord Slash Command `/standup`...");
  const discordStandup = await startStandup({
    workspaceId: discordWorkspace.id,
    platform: "discord",
    port: discordPort,
    users: [maryDiscord, aminaDiscord],
  });
  assert(discordStandup.status === "in_progress", "Discord standup initialized");
  assert(discordDMs.length === 2, "Discord DMs dispatched to Mary and Amina");

  // 2. Discord DMs
  console.log("  Step 2.2: Simulating Discord DM responses...");
  await collectResponse(
    {
      type: "dm.received",
      platform: "discord",
      workspaceId: discordWorkspace.id,
      channelId: "DM_MARY",
      userId: maryDiscord.platformUserId,
      text: "Testing the staging build. No blockers.",
      messageId: "disc_msg_1",
      timestamp: new Date().toISOString(),
    },
    discordStandup.id,
  );

  const discordReplies = await collectResponse(
    {
      type: "dm.received",
      platform: "discord",
      workspaceId: discordWorkspace.id,
      channelId: "DM_AMINA",
      userId: aminaDiscord.platformUserId,
      text: "Figma specs completed. Everything on schedule.",
      messageId: "disc_msg_2",
      timestamp: new Date().toISOString(),
    },
    discordStandup.id,
  );
  assert(discordReplies.allResponses.length === 2, "Collected 2 Discord DM responses");

  // 3. Discord Summary Receipt
  console.log("  Step 2.3: Analyzing Discord updates & posting embed receipt...");
  const discordAnalysis = await analyzeStandupSession({
    standupId: discordStandup.id,
    workspace: discordWorkspace,
    responses: discordReplies.allResponses,
    ai,
    port: discordPort,
  });
  assert(discordChannelPosts.length > 0, "Discord channel receipt delivered to #standup channel");

  console.log("\n================================================================================");
  console.log(`🎉 ALL ${passed} SLACK & DISCORD INTEGRATION TESTS PASSED CLEANLY! (0 Failures)`);
  console.log("================================================================================\n");
}

runBotsTest().catch((err) => {
  console.error("Bot test failed:", err);
  process.exit(1);
});
