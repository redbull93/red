import { DiscordAdapter } from "./index.js";
import { loadEnv } from "@red/shared";

const env = loadEnv();

if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_CLIENT_ID) {
  console.warn("Missing Discord credentials (DISCORD_BOT_TOKEN, DISCORD_CLIENT_ID).");
  console.warn("Set them in .env.local to run a live Discord connection.");
  process.exit(1);
}

const discord = new DiscordAdapter({
  token: env.DISCORD_BOT_TOKEN,
  clientId: env.DISCORD_CLIENT_ID,
  guildId: env.DISCORD_GUILD_ID,
  onEvent: async (event) => {
    console.log("[Discord Event Received]:", JSON.stringify(event, null, 2));
  },
});

await discord.start();
