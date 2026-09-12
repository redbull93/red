/**
 * StandUp Database Seeder
 * Populates Supabase (or in-memory store) with demo workspaces and teammates.
 */

import { upsertUser, upsertWorkspace, isSupabaseConfigured } from "@red/database";
import type { User, Workspace } from "@red/shared";

async function main() {
  console.log("==================================================");
  console.log("🌱 Seeding StandUp Database...");
  console.log(
    `Database target: ${isSupabaseConfigured() ? "Supabase Cloud" : "In-Memory Store (offline demo)"}`,
  );
  console.log("==================================================\n");

  const slackWorkspace: Workspace = {
    id: "ws_slack_demo",
    name: "StandUp Core Team (Slack)",
    platform: "slack",
    teamId: "T08DEMO1234",
    channelId: "C08STANDUP",
  };

  const discordWorkspace: Workspace = {
    id: "ws_discord_demo",
    name: "StandUp Engineering (Discord)",
    platform: "discord",
    teamId: "G11DEMO5678",
    channelId: "119900000000000001",
  };

  await upsertWorkspace(slackWorkspace);
  await upsertWorkspace(discordWorkspace);
  console.log(`✅ Seeded Workspaces: "${slackWorkspace.name}" & "${discordWorkspace.name}"`);

  const demoUsers: User[] = [
    {
      id: "usr_eugene",
      workspaceId: slackWorkspace.id,
      platformUserId: "U_EUGENE",
      name: "Eugene",
      email: "eugene@standup.ai",
      role: "Frontend Engineer",
      avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Eugene",
    },
    {
      id: "usr_brian",
      workspaceId: slackWorkspace.id,
      platformUserId: "U_BRIAN",
      name: "Brian",
      email: "brian@standup.ai",
      role: "Backend Lead",
      avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Brian",
    },
    {
      id: "usr_mary",
      workspaceId: slackWorkspace.id,
      platformUserId: "U_MARY",
      name: "Mary",
      email: "mary@standup.ai",
      role: "QA & Reliability Engineer",
      avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Mary",
    },
    {
      id: "usr_amina",
      workspaceId: slackWorkspace.id,
      platformUserId: "U_AMINA",
      name: "Amina",
      email: "amina@standup.ai",
      role: "Product Designer",
      avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=Amina",
    },
  ];

  for (const user of demoUsers) {
    await upsertUser(user);
    console.log(`  👤 Seeded user: ${user.name} (${user.role}) - ${user.platformUserId}`);
  }

  console.log("\n🎉 Database seeding finished successfully!");
}

main().catch((err) => {
  console.error("❌ Seeding failed:", err);
  process.exit(1);
});
