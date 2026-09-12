import { deployDiscordCommands } from "./index.js";
import { loadEnv } from "@red/shared";

const env = loadEnv();

if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_CLIENT_ID || !env.DISCORD_GUILD_ID) {
  console.warn("Missing Discord deploy credentials (DISCORD_BOT_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID).");
  console.warn("Set them in .env.local to deploy Discord slash commands.");
  process.exit(1);
}

await deployDiscordCommands({
  token: env.DISCORD_BOT_TOKEN,
  clientId: env.DISCORD_CLIENT_ID,
  guildId: env.DISCORD_GUILD_ID,
});
