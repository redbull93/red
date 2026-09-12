import { ReasoningEngine } from "./openai.js";

const engine = new ReasoningEngine();

const decision = await engine.analyzeStandup({
  team: { id: "demo", name: "Demo Team" },
  responses: [
    {
      workspaceId: "demo",
      platform: "slack",
      userId: "eugene",
      standupId: "demo:slack",
      rawText:
        "Can't finish the dashboard until I get the API endpoint from Brian.",
      createdAt: new Date().toISOString(),
    },
    {
      workspaceId: "demo",
      platform: "slack",
      userId: "brian",
      standupId: "demo:slack",
      rawText: "API endpoint is done, just haven't sent Eugene the docs yet.",
      createdAt: new Date().toISOString(),
    },
    {
      workspaceId: "demo",
      platform: "slack",
      userId: "amina",
      standupId: "demo:slack",
      rawText: "Finished onboarding docs. Working on billing polish. No blockers.",
      createdAt: new Date().toISOString(),
    },
  ],
});

console.log("=== OpenAI / Reasoning Engine Smoke Test Output ===");
console.log(JSON.stringify(decision, null, 2));
