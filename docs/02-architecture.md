# Environment-first architecture

No product lives here. This is the shape that scores on Technical
Execution without turning the environment into a wrapper.

```
Existing environment
        │  signals only this place has
        ▼
 Context adapter
        │
        ▼
   Orchestrator ──► durable jobs (retries, waits)
        │
        ├── MCP tool servers (act + receipt)
        ├── HITL gate (approve / stop)
        └── Control plane (Vengeance UI: traces, not home)
        │
        ▼
 Receipt returns to the SAME environment
```

If you deleted the control plane, the agent must still have a home.
If you deleted the environment, the agent must die.

---

## Layers

### 1. Existing environment

The runtime. Slack thread, WhatsApp chat, inbox, ticket, open browser
tab, microphone in a room. This kit does not pick one. You plug a
**source** into the context adapter:

- inbound webhook / bot event
- poller
- voice/vision frame
- email listener

The environment is also the **sink**. Every successful act should land a
receipt back here (message, comment, calendar hold, ticket note).

### 2. Context adapter

Turns raw environment payload into structured context the model should
never have to guess:

- `place` — where this is happening
- `actors` — who is present, who may act
- `signal` — what just changed
- `artifacts` — thread, doc, image, ticket fields
- `constraints` — language, urgency, permission

See `packages/orchestrator` (`EnvironmentEvent`, `toAgentContext`).
This is **context engineering**. The environment is the prompt.

### 3. Orchestrator

`packages/orchestrator` runs a small loop:

1. Ingest environment event
2. Build messages from [`prompts/`](../prompts/)
3. Call OpenAI or OpenRouter with tools
4. Dispatch MCP tools
5. Pause on HITL when the policy says so
6. Enqueue a durable job when the work will outlive a request
7. Emit a trace the control plane can film

The loop is intentionally boring. Judges reward reliability, not a
custom framework.

### 4. MCP tool servers

`packages/mcp-tools` exposes four thin servers. Swap the stubs for a
real place on the day:

| Server | Job |
| --- | --- |
| `environment-io` | Read the place. Write a receipt back. |
| `exa-search` | Ground the agent in the live web (sponsor: Exa). |
| `act-receipt` | Perform one world action and return a receipt id. |
| `health-fail` | Heartbeat, forced failure, retry signal. |

Do not grow a private API zoo. Add MCP servers. CopilotKit, Ambiguous,
and many workplace tools already speak MCP.

### 5. Durable jobs

Real work waits: a human reply, a portal, a payment, a retry. Chat
timeouts are how toy agents die.

`packages/orchestrator/src/jobs.ts` is a local queue you can replace
with Trigger.dev (`trigger.dev`) without changing the trace shape.
Same events: `queued`, `running`, `retrying`, `failed`, `succeeded`.

### 6. Identity and HITL

Who may act, on whose behalf, and how they stop it.

- Auth0 (or a stub principal) rides on the event
- [`prompts/hitl.md`](../prompts/hitl.md) and
  [`prompts/tool-policy.md`](../prompts/tool-policy.md) decide when to
  pause
- Control plane shows **Approve** / **Stop**
- The environment should also get a one-tap refuse if the place allows
  it (reaction, reply `STOP`, email undo)

Controllability is a judging line, not a footnote.

### 7. Control plane (Vengeance UI)

`apps/control-plane` is mission control:

- live traces
- approval queue
- environment signal feed
- job retries
- kinetic status for the two-minute video

It is **not** the agent's home. Do not demo only this screen.

---

## Sponsor stack — use what deepens the place

You do not need every logo.

| Partner | Use when |
| --- | --- |
| OpenAI | Frontier model, tools, Realtime voice |
| OpenRouter | Failover when the primary model flakes |
| CopilotKit / AG-UI | Human sees the agent *doing* (Best Use prize) |
| Exa | Agent search, not SEO search |
| Trigger.dev | Long jobs, retries, waits |
| Auth0 | Real principals, not a shared API key |
| Mozilla.ai | Transparency / controllability story |
| Ambiguous AI | Agent as coworker in Docs/Mail/Chat/Calendar (Best Use prize) |

Sticker rule: if you cannot film the sponsor tool in the loop, drop it.

---

## One-loop contract (StandUp)

Every demo must narrate this without a diagram:

1. Three stand-up replies appear **in Slack/Discord**
2. The adapter keeps who replied, who is named, the channel
3. The orchestrator cross-references blockers
4. A tool acts (`standup.summary`)
5. A receipt returns **to the same team channel**
6. If the tool fails, the job retries and a human can Stop / Approve @-mentions

That is a 4 on Core Requirements. Innovation is whether step 2 was
load-bearing (it is — see [`05-standup-agent.md`](05-standup-agent.md)).

---

## File map

| Path | Role |
| --- | --- |
| `packages/orchestrator` | Event → plan → tools → traces |
| `packages/mcp-tools` | MCP servers |
| `apps/control-plane` | Vengeance UI theater |
| `prompts/` | Judge-aligned language, no product |
| `docs/03-day-of-runbook.md` | Four-hour clock |

Wire your environment into `ingestEnvironmentEvent` and
`environment-io`. Leave the rest until the loop is real.
