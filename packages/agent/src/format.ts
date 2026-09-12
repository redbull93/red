import type { AgentDecision } from "@red/shared";

export interface FormattedSummaryOptions {
  decision: AgentDecision;
  reconciliationNotes?: string[];
  totalTeammates?: number;
  repliedTeammates?: number;
}

export function formatChannelSummary(options: FormattedSummaryOptions): string {
  const { decision, reconciliationNotes = [], totalTeammates, repliedTeammates } =
    options;

  const participationHeader =
    totalTeammates && repliedTeammates
      ? ` (${repliedTeammates}/${totalTeammates} teammates checked in)`
      : "";

  const blockersSection =
    decision.blockers.length > 0
      ? decision.blockers
          .map((b, idx) => {
            const blockedTag = b.blockedPerson ? ` [@${b.blockedPerson}]` : "";
            const blockerTag = b.responsiblePerson
              ? ` → waiting on @${b.responsiblePerson}`
              : "";
            return `• *[${b.type.toUpperCase()}]* ${b.subject}${blockedTag}${blockerTag} (${Math.round(b.confidence * 100)}% confidence)`;
          })
          .join("\n")
      : "✅ No active blockers detected. All workflows unobstructed.";

  const reconSection =
    reconciliationNotes.length > 0
      ? `\n\n*🔍 GitHub Reality Checks*\n` +
        reconciliationNotes.map((r) => `• ${r}`).join("\n")
      : "";

  const actionsSection =
    decision.actions.length > 0
      ? decision.actions
          .map((a) => {
            const approvalTag = a.requiresApproval ? " _(approval requested)_" : "";
            return `• ${a.message}${approvalTag}`;
          })
          .join("\n")
      : "• No automated actions required.";

  return [
    `📢 *StandUp Summary & Cross-Reference*${participationHeader}`,
    "",
    decision.summary,
    "",
    "*Dependencies & Blockers*",
    blockersSection,
    reconSection,
    "",
    "*Next Actions & Resolutions*",
    actionsSection,
  ]
    .filter(Boolean)
    .join("\n");
}

export function formatHITLPrompt(
  actionId: string,
  targetPerson: string,
  suggestedAction: string,
): string {
  return [
    `⚠️ *StandUp Agent Approval Required*`,
    `Agent proposes notifying @${targetPerson}:`,
    `> "${suggestedAction}"`,
    "",
    `Do you want to send this action? (Action ID: \`${actionId}\`)`,
  ].join("\n");
}
