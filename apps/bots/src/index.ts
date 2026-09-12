import { ReasoningEngine } from "@red/ai";
import { DiscordAdapter } from "@red/discord-adapter";
import { ingestLiveEnvironmentEvent } from "@red/orchestrator";
import { SlackAdapter } from "@red/slack-adapter";
import { loadEnv } from "@red/shared";

const env = loadEnv();

const ai = new ReasoningEngine({
  apiKey: env.OPENAI_API_KEY,
  model: env.OPENAI_MODEL,
});

let slack: SlackAdapter | null = null;
let discord: DiscordAdapter | null = null;

const deps = {
  ai,
  sendDM: async (platform: "slack" | "discord", userId: string, text: string) => {
    if (platform === "slack") {
      if (!slack) throw new Error("Slack adapter is not active");
      return slack.sendDM(userId, text);
    }
    if (!discord) throw new Error("Discord adapter is not active");
    return discord.sendDM(userId, text);
  },
  postToChannel: async (
    platform: "slack" | "discord",
    channelId: string,
    text: string,
  ) => {
    if (platform === "slack") {
      if (!slack) throw new Error("Slack adapter is not active");
      return slack.postToChannel(channelId, text);
    }
    if (!discord) throw new Error("Discord adapter is not active");
    return discord.postToChannel(channelId, text);
  },
  requestApproval: async (
    platform: "slack" | "discord",
    channelId: string,
    actionId: string,
    text: string,
  ) => {
    if (platform === "slack") {
      if (!slack) throw new Error("Slack adapter is not active");
      return slack.requestApproval(channelId, actionId, text);
    }
    if (!discord) throw new Error("Discord adapter is not active");
    return discord.requestApproval(channelId, actionId, text);
  },
  standupChannelByWorkspace: {
    [env.SLACK_TEAM_ID ?? "unknown"]: env.SLACK_STANDUP_CHANNEL ?? "general",
    [env.DISCORD_GUILD_ID ?? "unknown"]: env.DISCORD_STANDUP_CHANNEL ?? "standup",
  },
};

let adaptersRunning = 0;

if (env.SLACK_BOT_TOKEN && env.SLACK_APP_TOKEN && env.SLACK_SIGNING_SECRET) {
  try {
    slack = new SlackAdapter({
      botToken: env.SLACK_BOT_TOKEN,
      appToken: env.SLACK_APP_TOKEN,
      signingSecret: env.SLACK_SIGNING_SECRET,
      standupChannel: env.SLACK_STANDUP_CHANNEL,
      onEvent: async (event) => {
        await ingestLiveEnvironmentEvent(event, deps);
      },
    });
    await slack.start();
    adaptersRunning += 1;
  } catch (err) {
    console.error("Failed to start Slack adapter:", err);
  }
} else {
  console.log("ℹ️ Slack adapter: missing tokens (SLACK_BOT_TOKEN, SLACK_APP_TOKEN, SLACK_SIGNING_SECRET).");
}

if (env.DISCORD_BOT_TOKEN && env.DISCORD_CLIENT_ID) {
  try {
    discord = new DiscordAdapter({
      token: env.DISCORD_BOT_TOKEN,
      clientId: env.DISCORD_CLIENT_ID,
      guildId: env.DISCORD_GUILD_ID,
      onEvent: async (event) => {
        await ingestLiveEnvironmentEvent(event, deps);
      },
    });
    await discord.start();
    adaptersRunning += 1;
  } catch (err) {
    console.error("Failed to start Discord adapter:", err);
  }
} else {
  console.log("ℹ️ Discord adapter: missing tokens (DISCORD_BOT_TOKEN, DISCORD_CLIENT_ID).");
}

if (adaptersRunning === 0) {
  console.log("\n=======================================================");
  console.log("🤖 StandUp Unified Bot Runner Initialized");
  console.log("No live bot tokens set yet in .env.local.");
  console.log("To connect live bots, add your Slack / Discord tokens to:");
  console.log("  apps/control-plane/.env.local (or root .env)");
  console.log("Run smoke tests anytime with:");
  console.log("  npm run smoke:openai");
  console.log("=======================================================\n");
} else {
  console.log(`🚀 StandUp running with ${adaptersRunning} active adapter(s).`);
}
