import { logger, schedules } from "@trigger.dev/sdk";

export const dailyStandup = schedules.task({
  id: "daily-standup",
  cron: { pattern: "0 8 * * 1-5", timezone: "Africa/Nairobi" },
  run: async () => {
    const url = process.env.STANDUP_START_URL;
    const secret = process.env.STANDUP_WEBHOOK_SECRET;
    if (!url) {
      logger.warn("STANDUP_START_URL missing — skip scheduled start");
      return;
    }
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
      },
      body: JSON.stringify({
        channelId: process.env.SLACK_STANDUP_CHANNEL,
        demo: false,
      }),
    });
    if (!response.ok) {
      throw new Error(`standup start ${response.status}: ${await response.text()}`);
    }
    logger.info("Morning stand-up started", { status: response.status });
  },
});
