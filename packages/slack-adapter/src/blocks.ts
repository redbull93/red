export function summaryBlocks(body: string) {
  const chunks = body.split("\n").filter((line) => line.trim().length > 0);
  const header = chunks[0]?.replace(/^\*+|\*+$/g, "").trim() || "Stand-up summary";
  const rest = chunks.slice(1).join("\n") || body;

  return [
    {
      type: "header",
      text: { type: "plain_text", text: header.slice(0, 150), emoji: true },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: rest.slice(0, 2900) },
    },
  ];
}
