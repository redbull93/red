/**
 * Seeds the Ambiguous workspace with material for the demo.
 *
 * Two things go in, and the second one is the whole point:
 *
 *  1. A stand-up thread in the channel, so the agent has replies to read.
 *  2. Brian's endpoint docs as a wiki page — the evidence that Eugene's blocker
 *     is stale. Without this the agent can only nudge Brian, which is what a cron
 *     job with a template would do. With it, `workspace.search` finds the docs
 *     already exist and the agent links them instead of asking anyone for
 *     anything. That is the difference worth demoing.
 *
 * Runs the seeding through the real MCP tools rather than raw fetch, so a green
 * run here is also proof the corrected routes work against the live API.
 *
 * Every message is prefixed with the speaker's name because a single API key can
 * only post as its own account: this workspace cannot make Brian talk.
 */

import { loadRuntimeEnv } from "@red/orchestrator";
import {
  ambiguousConfigured,
  workspaceChatPost,
  workspaceDocAppend,
  workspaceSearch,
} from "@red/mcp-tools";
import type { ToolContext } from "@red/mcp-tools";

const ctx: ToolContext = {
  readPlace: () => null,
  writeReceipt: ({ channelId }) => ({
    receiptId: `seed_${Date.now()}`,
    landedAt: new Date().toISOString(),
  }),
  now: () => new Date(),
};

const STANDUP = [
  "**Eugene** — Dashboard is 80% done. Can't finish it until I get the API endpoint docs from Brian. Third time asking.",
  "**Brian** — Payments endpoint is finished and deployed. Haven't sent Eugene the docs yet, been buried in the incident.",
  "**Amina** — Shipped the onboarding docs. On billing polish today. No blockers.",
  "**Mary** — Staging is behaving oddly again. Might be Eugene's migration, might just be me. Going to keep poking at it.",
];

const EVIDENCE = [
  "# Payments API — endpoint reference",
  "",
  "_Written by Brian. This is the document Eugene has been waiting for._",
  "",
  "## POST /v2/payments/intent",
  "",
  "Creates a payment intent and returns a client secret for the dashboard to confirm against.",
  "",
  "| Field | Type | Required | Notes |",
  "| --- | --- | --- | --- |",
  "| `amount_minor` | integer | yes | Smallest currency unit. 1000 = KES 10.00 |",
  "| `currency` | string | yes | ISO 4217. `KES` or `USD` |",
  "| `customer_ref` | string | yes | Opaque customer id from the dashboard |",
  "| `idempotency_key` | string | no | Strongly recommended on retries |",
  "",
  "Returns `201` with `{ intent_id, client_secret, expires_at }`. The secret is",
  "single-use and expires after 15 minutes.",
  "",
  "## GET /v2/payments/intent/{intent_id}",
  "",
  "Polling endpoint for intent status. Status is one of `pending`, `confirmed`,",
  "`failed`, `expired`. The dashboard should poll no faster than every 2s.",
  "",
  "## Errors",
  "",
  "`402` means the customer's method was declined and is safe to retry with a new",
  "method. `409` means the idempotency key was reused with a different body.",
].join("\n");

async function main(): Promise<number> {
  loadRuntimeEnv();

  if (!ambiguousConfigured()) {
    console.error("AMBIGUOUS_API_KEY is not set in .env.local — nothing to seed.");
    return 1;
  }

  const channelId = process.env.AMBIGUOUS_STANDUP_CHANNEL;
  if (!channelId) {
    console.error(
      "AMBIGUOUS_STANDUP_CHANNEL is not set. Run `npm run ambiguous:probe` to list channels.",
    );
    return 1;
  }

  console.log("Seeding Ambiguous workspace\n");

  // 1. The evidence doc goes in first. If the stand-up were posted first and this
  //    step failed, the demo would look ready while the payoff was missing.
  console.log("→ Brian's endpoint docs (wiki)");
  const doc = await workspaceDocAppend.handler(
    { title: "Payments API — endpoint reference", body: EVIDENCE },
    ctx,
  );
  if (!doc.ok) {
    console.error(`   FAILED: ${doc.error}`);
    return 1;
  }
  console.log(`   ok — page ${doc.data.docId} in space ${doc.data.spaceId}`);

  // 2. Confirm the agent can actually find it. A doc that exists but does not
  //    surface in search is worth nothing to the loop.
  console.log("→ verifying it is findable");
  const found = await workspaceSearch.handler({ query: "payments endpoint docs" }, ctx);
  const hits = Number(found.data.found ?? 0);
  console.log(
    hits > 0
      ? `   ok — search returns ${hits} result(s), so the agent can falsify the blocker`
      : "   WARNING: search returned nothing. Indexing may lag; re-run in a moment.",
  );

  // 3. The stand-up replies.
  console.log("→ stand-up replies (chat)");
  let posted = 0;
  for (const line of STANDUP) {
    const result = await workspaceChatPost.handler({ channelId, body: line }, ctx);
    if (!result.ok) {
      console.error(`   FAILED: ${result.error}`);
      return 1;
    }
    posted += 1;
  }
  console.log(`   ok — ${posted} messages in channel ${channelId}`);

  console.log("\nSeeded. The agent now has replies to read and evidence to check.");
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
