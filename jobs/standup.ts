/**
 * Trigger.dev Scheduled Task: Morning StandUp Agent
 *
 * Runs every weekday at 09:00 AM UTC (or configured timezone).
 * Kicks off standup prompts via Slack & Discord DMs across all registered workspaces.
 */

export { runScheduledStandup, type ScheduledStandupResult } from "@red/agent";

export const STANDUP_CRON = "0 9 * * 1-5"; // 09:00 AM Mon-Fri
