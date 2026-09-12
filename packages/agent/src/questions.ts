export const STANDUP_QUESTIONS = [
  "1. What did you finish yesterday?",
  "2. What are you working on today?",
  "3. Any blockers or anything you are waiting on from teammates or external services?",
];

export function formatStandupGreeting(userName?: string): string {
  const nameGreeting = userName ? ` ${userName}` : "";
  return [
    `☀️ Good morning${nameGreeting}! It's time for the daily stand-up.`,
    "",
    "Please reply directly to this DM with your update:",
    STANDUP_QUESTIONS.join("\n"),
    "",
    "Tip: Mention any teammates by name if you're waiting on a PR, review, or API dependency.",
  ].join("\n");
}
