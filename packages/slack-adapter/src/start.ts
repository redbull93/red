import { SlackAdapter } from "./index.js";
import { loadEnv } from "@red/shared";

const env = loadEnv();

if (!env.SLACK_BOT_TOKEN || !env.SLACK_APP_TOKEN || !env.SLACK_SIGNING_SECRET) {
  console.warn("Missing Slack credentials (SLACK_BOT_TOKEN, SLACK_APP_TOKEN, SLACK_SIGNING_SECRET).");
  console.warn("Set them in .env.local to run a live Slack connection.");
  process.exit(1);
}

const slack = new SlackAdapter({
  botToken: env.SLACK_BOT_TOKEN,
  appToken: env.SLACK_APP_TOKEN,
  signingSecret: env.SLACK_SIGNING_SECRET,
  standupChannel: env.SLACK_STANDUP_CHANNEL,
  onEvent: async (event) => {
    console.log("[Slack Event Received]:", JSON.stringify(event, null, 2));
  },
});

await slack.start();
