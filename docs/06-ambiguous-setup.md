# Ambiguous AI — what to do on your end

First time with Ambiguous? This is the whole path, in order. Roughly
twenty minutes, most of it waiting on a browser.

Ambiguous is a 17-app workspace (Docs, Mail, Chat, Calendar, Tasks, CRM,
Drive…) where **every feature has an agent endpoint as well as a human
UI**. That is why it matters here: the agent is not scraping a workspace
through a side door, it is a member of one.

---

## Why we use it at all

Read [`01-judging-decoder.md`](01-judging-decoder.md) before you wire
anything. Two lines it scores that Ambiguous answers directly:

- **Identity** — "who is allowed to act, on whose behalf." Ambiguous
  gives each agent its own identity and email address, so the stand-up
  bot posts as itself, not as you holding a shared token.
- **The wrapper test** — the agent reads workspace state to *falsify* a
  teammate's self-report. Eugene says he is blocked waiting on API
  docs; the agent finds Brian's doc already exists and links it. A
  chatbox is never told that.

Sticker rule from [`02-architecture.md`](02-architecture.md): if you
cannot film it in the loop, drop it.

---

## 1. Create the workspace

Sign up at [ambiguous.ai](https://www.ambiguous.ai/). Free for up to
five members with 1,000 AI actions a month, no card.

You will get a workspace domain like `yourteam.ambiguous.ai`.

## 2. Add the cast as real members

Add Eugene, Brian and Amina (or your real teammates) as members.

Do not skip this and keep them as fixture strings. `calendar.availability`
needs real user ids to find a slot, and the calendar hold is the act with
the strongest receipt in the demo.

## 3. Give the agent its own identity

In the **Identity** / **Admin** app, create an agent member — something
like `standup@yourteam.ambiguous.ai`.

This is the principal that posts. Using your own account instead is the
single most common way to lose the identity point: judges cannot tell an
agent from a human running a script.

## 4. Mint the agent's API key

**Admin → API keys**, for the agent member you just created. Keys look
like `ak_...`.

Put it in `.env.local` at the repo root:

```bash
AMBIGUOUS_API_KEY=ak_your_key_here
AMBIGUOUS_BASE_URL=https://app.ambiguous.ai
```

`.env.local` is gitignored. Never commit it, never paste it in chat.

## 5. Create the stand-up channel and grab its id

Make a `#standup` channel in Chat, then:

```bash
npx ambiguous auth login --token ak_your_key_here
npx ambiguous auth status
npx ambiguous chat channels list --json
```

Copy the channel id into `.env.local`:

```bash
AMBIGUOUS_STANDUP_CHANNEL=the_channel_id
```

Two login modes, and the difference matters. `ambiguous auth login` with
no arguments opens a browser and logs in **as you**. `--token` is the
agent/CI path, which is what we want.

## 6. Send me your workspace's real API shape

The CLI is a dynamic shell: it fetches your workspace's OpenAPI spec at
startup and builds its command tree from it. So `--help` is the only
trustworthy source for route and field names — not the marketing page,
not this document.

Run these and paste the output:

```bash
npx ambiguous chat --help
npx ambiguous calendar --help
npx ambiguous search --help
npx ambiguous webhooks --help
npx ambiguous api GET /api/users/me --json
```

## 7. Seed the evidence that makes the agent look smart

Logged in **as Brian**, create a doc titled something like
`API endpoint reference`.

This is the money shot. Eugene claims he is blocked on API docs;
`workspace.search` finds Brian's doc; the summary links it instead of
nagging Brian. Without this doc in the workspace, the agent has nothing
to falsify and the demo is just a summarizer.

## 8. Decide the public URL for inbound replies

Teammate replies reach us as a webhook, so the control plane needs a
public address. Either:

- a tunnel — `cloudflared tunnel --url http://localhost:3000` or ngrok
- or deploy the control plane and use its URL

Then register it:

```bash
npx ambiguous webhooks --help      # confirm the exact flags first
# point it at  https://your-url/api/ingest
```

Inbound webhook plus outbound receipt in the same place is what makes
Ambiguous the **environment** rather than a toolbelt.

## 9. Check the action budget

**Admin → usage.**

Routine CRUD from an external BYO-LLM coworker — which is what our
orchestrator is, since the models come from Agent Router — is free.
Only premium operations bill against the 1,000. Chat posts, calendar
holds, task creation and doc writes should all be free.

Verify whether cross-module `search` counts as premium **before** demo
day, because we lean on it.

---

## Verify it end to end

```bash
npm run preflight
```

The Ambiguous section will confirm the key and channel are loaded. With
no key, every workspace tool degrades to an honest stub and the loop
still runs — so you are never blocked, you just score lower on
Technical Execution.

---

## What the agent can do once this is wired

| Tool | Ambiguous surface | Why it earns its place |
| --- | --- | --- |
| `workspace.chatPost` | Chat | The receipt, in the same channel the stand-up happened |
| `workspace.search` | Cross-module search | Falsifies a self-report against real workspace state |
| `workspace.calendarHold` | Calendar | Turns a suggested action into a 10-minute unblock invite |
| `workspace.taskCreate` | Tasks | Assigns the follow-up to a named person |
| `workspace.docAppend` | Docs | Durable stand-up log the team can read later |

Cut order if you run out of clock: keep `chatPost` and `search`, then
`calendarHold`. Drop `taskCreate` and `docAppend` first — they are the
least filmable.

---

## Troubleshooting

**`401` from the CLI** — the token is not loaded. Re-run
`npx ambiguous auth status`.

**Commands you expect are missing from `--help`** — the CLI mirrors your
workspace's live spec. If a command is absent, your workspace or plan
does not expose it; do not code against it.

**Receipts land nowhere** — `AMBIGUOUS_STANDUP_CHANNEL` is unset, so the
receipt fell back to the in-memory place. `npm run preflight` warns
about exactly this.

**Agent posts as you** — you minted the key against your own user
instead of the agent member. Redo step 3.
