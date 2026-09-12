import { defineConfig } from "@trigger.dev/sdk";

/**
 * Trigger.dev v4 configuration.
 *
 * The stand-up is a scheduled, durable job, not something a human remembers to
 * start. That is the whole point: an agent that only runs when you click a button
 * is a chatbox with extra steps.
 *
 * Set TRIGGER_PROJECT_REF in .env.local from the dashboard, then:
 *
 *   npx trigger.dev@latest dev      # local, real waitpoints and real retries
 *   npx trigger.dev@latest deploy   # cloud
 */
export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF ?? "proj_standup_agent",
  dirs: ["./src/trigger", "./packages/orchestrator/src/trigger"],

  // Council calls fan out to three models and the tool loop runs up to six
  // turns, so a stand-up can legitimately take a couple of minutes.
  maxDuration: 600,

  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 2_000,
      maxTimeoutInMs: 30_000,
      factor: 2,
      randomize: true,
    },
  },
});
