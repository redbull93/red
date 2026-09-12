# Where the agent actually runs

Short answer to the obvious question: **Ambiguous is not a host.** It is
the room the agent works in, not the machine it runs on.

Ambiguous is a workspace with an API. Our agent is an external
"bring-your-own-LLM" coworker: it holds a member identity in the
workspace, reads and writes through the API, and receives replies by
webhook — but the Node process lives somewhere else. There is nowhere in
Ambiguous to upload `packages/orchestrator` to.

That is a feature, not a limitation. It is why the models can come from
Agent Router and the schedule from Trigger.dev, while the agent still
shows up as a real colleague inside the workspace.

---

## The three surfaces

Once you see it as three separate things, deployment stops being
confusing:

| | What it is | Where it lives |
| --- | --- | --- |
| **The clock** | Fires the stand-up at 09:00, retries failures, holds approval waitpoints | **Trigger.dev** |
| **The face and the door** | Mission control UI, plus `/api/ingest` for inbound webhooks | **Vercel** |
| **The room** | Where the agent reads state and lands receipts | **Ambiguous** (no deploy) |

The clock is the one people get wrong. The agent's real home is
Trigger.dev, because that is what makes it run when nobody is watching.
Vercel hosts the *window* onto it.

---

## Piece by piece

| Piece | Deploy target | Notes |
| --- | --- | --- |
| `packages/orchestrator/src/trigger/*` | Trigger.dev | `npx trigger.dev@4.5.16 deploy`. Owns cron, retry backoff, waitpoints. |
| `apps/control-plane` | Vercel | Next.js 15. Gives the public HTTPS URL Ambiguous posts to. |
| `packages/orchestrator` | — | A library. Bundled into the two above. |
| `packages/mcp-tools` | — | Runs in-process. The stdio server is only for local inspection. |
| `packages/slack-adapter`, `packages/discord-adapter` | Railway / Fly / Render | **Not Vercel.** Socket Mode needs a persistent process; serverless functions get killed between requests. |
| Agent Router | — | External API. |
| Ambiguous | — | External API. The environment. |

---

## Demo day: deploy nothing

For filming, the lowest-risk setup is entirely local, and **nothing about
it is faked**:

```bash
npm run preflight            # which council seats are alive
npm run trigger:dev          # real retries, real waitpoints, local
npm run dev                  # mission control on :3000
cloudflared tunnel --url http://localhost:3000   # public URL for webhooks
```

`trigger.dev dev` is not a simulator. The cron, the retry backoff and the
waitpoints are the same platform machinery as production, just executing
against your machine. A run genuinely suspends on an approval and
genuinely resumes when someone clicks.

The tunnel URL goes into the Ambiguous webhook config, pointed at
`https://<tunnel>/api/ingest`.

---

## Deploying for real

Both free tiers are enough.

**Trigger.dev** — the agent itself:

```bash
# TRIGGER_PROJECT_REF from the dashboard, into .env.local
npx trigger.dev@4.5.16 login
npm run trigger:deploy
```

Set the same env vars in the Trigger.dev dashboard that you have in
`.env.local`: `AGENT_ROUTER_API_KEY`, `AMBIGUOUS_API_KEY`,
`AMBIGUOUS_STANDUP_CHANNEL`, and the `ROUTER_MODEL_*` values. The task
bundle does not carry your local `.env.local` with it.

**Vercel** — the control plane:

```bash
npx vercel link
npx vercel env pull            # or set them in the dashboard
npx vercel deploy --prod
```

This is a monorepo, so set the Vercel project root to
`apps/control-plane` and let it build the workspace. The same env vars are
needed here, since the UI reads council verdicts and resolves approvals.

Then re-point the Ambiguous webhook from the tunnel to the Vercel URL.

---

## Things that will bite you

**`.env.local` does not travel.** It is gitignored, so neither Vercel nor
Trigger.dev sees it. Every key has to be set again in each dashboard.
Symptom: everything silently falls back to honest stubs, and receipts stop
reaching the workspace.

**The store is in memory.** `packages/orchestrator/src/store.ts` hangs
state off a `globalThis` key. On Vercel that means each serverless
instance has its own copy, and a redeploy wipes it. Fine for a demo,
wrong for anything real — cross-run blocker memory needs Supabase (the
credentials are already in `.env.example`) before it survives a restart.

**Serverless timeouts.** A council call fans out to three models and the
tool loop runs up to six turns. `trigger.config.ts` allows 600s; a Vercel
function will not. Keep the loop on Trigger.dev and let the UI only read
and approve.

**The webhook needs to be public before Ambiguous can reach it.**
`localhost` is not reachable from their servers. Tunnel or deploy; there
is no third option.

---

## The identity problem, which is not a deployment problem

`npm run ambiguous:probe` currently reports:

```
{"id":"d1a9fbf3-dae6-48d4-94a9-b3fb4aed0877","type":"human"}
```

The API key belongs to a **human account**, so every receipt the agent
posts will appear to come from a person. No amount of deployment fixes
that — it is step 3 of
[`06-ambiguous-setup.md`](06-ambiguous-setup.md): create an agent member
and mint the key against it.

This is worth fixing before filming. "Who is allowed to act, and on whose
behalf" is a scored line in
[`01-judging-decoder.md`](01-judging-decoder.md), and right now the honest
answer is "it acts as Taz."
