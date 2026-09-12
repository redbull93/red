import type { AgentPlatformPort } from "@red/agent";
import { runScheduledStandup } from "@red/agent";

export interface StandupCronConfig {
  hour?: number; // 0-23, default 9
  minute?: number; // 0-59, default 0
  timezone?: string;
}

export function startStandupCron(
  port: AgentPlatformPort,
  config: StandupCronConfig = {},
): () => void {
  const targetHour = config.hour ?? 9;
  const targetMinute = config.minute ?? 0;
  let lastTriggeredDate: string | null = null;

  console.log(
    `⏰ StandUp Cron scheduler active: set for ${String(targetHour).padStart(2, "0")}:${String(targetMinute).padStart(2, "0")} (weekdays).`,
  );

  const interval = setInterval(async () => {
    const now = new Date();
    const day = now.getUTCDay(); // 0 is Sun, 6 is Sat
    const hour = now.getUTCHours();
    const minute = now.getUTCMinutes();
    const todayStr = now.toISOString().split("T")[0];

    // Weekdays only (Mon=1 ... Fri=5)
    if (day >= 1 && day <= 5) {
      if (
        hour === targetHour &&
        minute === targetMinute &&
        lastTriggeredDate !== todayStr
      ) {
        lastTriggeredDate = todayStr;
        console.log(`⏰ StandUp Cron firing for ${todayStr}...`);
        try {
          const result = await runScheduledStandup(port);
          console.log(
            `✅ StandUp Cron completed: ${result.standupsCreated.length} standup(s) triggered.`,
          );
        } catch (err) {
          console.error("❌ StandUp Cron encountered an error:", err);
        }
      }
    }
  }, 60_000);

  return () => clearInterval(interval);
}
