# Workflows

End-to-end StandUp flows with Mermaid. Read
[`08-how-the-pieces-fit.md`](08-how-the-pieces-fit.md) for the plain-language
map (office / clock / vote / badge).

---

## 1. System context

```mermaid
flowchart TB
  subgraph environments [Environments people already use]
    Slack[Slack]
    Discord[Discord]
    WhatsApp[WhatsApp]
    Ambiguous[Ambiguous Chat Wiki Tasks Calendar]
  end

  subgraph control [Control plane on Vercel]
    MC[Mission Control]
    Dungeon[Dungeon council UI]
    APIs[Next.js API routes]
    Auth0[Auth0 session]
  end

  subgraph brain [Agent brain]
    Orch[Orchestrator]
    MCP[MCP tools]
    Council[Astra Opus Grubflash]
    Jobs[Trigger.dev jobs]
  end

  Slack --> Orch
  Discord --> Orch
  WhatsApp --> Orch
  Jobs --> Orch
  Orch --> Council
  Orch --> MCP
  MCP --> Ambiguous
  MCP --> Slack
  MCP --> Discord
  Orch --> APIs
  APIs --> MC
  APIs --> Dungeon
  Auth0 --> Dungeon
  Auth0 --> MC
```

---

## 2. Morning stand-up happy path

```mermaid
sequenceDiagram
  autonumber
  participant Cron as Trigger.dev
  participant Adapter as SlackOrDiscord
  participant Orch as Orchestrator
  participant Council as Council3
  participant Tools as MCPTools
  participant Room as AmbiguousOrChannel

  Cron->>Adapter: weekday schedule fire
  Adapter->>Adapter: DM each teammate 3 questions
  Adapter->>Orch: standup.collected event
  Orch->>Council: same replies to each seat
  Council-->>Orch: agree
  Orch->>Tools: search.web / Ambiguous search
  Orch->>Tools: world.act standup.summary
  Orch->>Tools: environment.receipt
  Tools->>Room: summary + suggested action
  Note over Room: Home is the channel not Mission Control
```

---

## 3. Hidden dependency example Eugene ↔ Brian

```mermaid
flowchart LR
  E["Eugene: blocked on Brian API docs"]
  B["Brian: endpoint done no mention of Eugene"]
  M["Mustafa: on track"]
  Cross[Cross-reference]
  Out["Channel receipt: Brian → send docs to Eugene"]

  E --> Cross
  B --> Cross
  M --> Cross
  Cross --> Out
```

A formatter reprints three check-ins. StandUp **connects** them and posts
**one** receipt where the team already reads.

---

## 4. Council split → HITL → Auth0

```mermaid
stateDiagram-v2
  [*] --> Collecting: schedule or slash command
  Collecting --> CouncilVote: all replies in
  CouncilVote --> Acting: quorum agree
  CouncilVote --> Paused: split or unverified
  Paused --> Acting: Auth0 tech-lead Approve Send
  Paused --> Stopped: Hold or Stop
  Acting --> ReceiptPosted: environment.receipt
  ReceiptPosted --> [*]
  Stopped --> [*]
```

```mermaid
sequenceDiagram
  participant Council
  participant Trigger as Trigger waitpoint
  participant UI as Dungeon UI
  participant Auth0
  participant Room as Channel

  Council-->>Trigger: split verdict
  Trigger->>Trigger: freeze job
  UI->>Auth0: session required if AUTH0_REQUIRE_AUTH
  Auth0-->>UI: named user + roles
  UI->>Trigger: Approve or Hold
  alt Approve
    Trigger->>Room: post receipt / suggested action
  else Hold
    Trigger->>Room: optional stopped receipt
  end
```

---

## 5. Fail → retry → stop

```mermaid
sequenceDiagram
  participant Orch
  participant Tool as health.fail or live 500
  participant Job as TriggerOrLocalQueue
  participant Human

  Orch->>Tool: act
  Tool-->>Orch: ok false
  Orch->>Job: retrying
  Job->>Orch: attempt N
  alt recovers
    Orch->>Orch: receipt
  else human stops
    Human->>Orch: Stop
    Orch->>Orch: cancel job + stop receipt
  end
```

Demo beat: Mission Control **Force fail + retry**, then **Stop**.

---

## 6. Ingest API path Mission Control

```mermaid
flowchart TD
  A[POST /api/ingest] --> B{mode}
  B -->|loop| C[fixture stand-up event]
  B -->|hitl| D[requireHitl true]
  B -->|fail| E[forceFail true]
  C --> F[ingestEnvironmentEvent]
  D --> F
  E --> F
  F --> G[traces jobs approvals]
  G --> H[GET /api/state polled by UI]
  H --> I[Vengeance Mission Control]
```

Remember: this UI is **theater**. The product receipt must still land in
Slack / Discord / Ambiguous.

---

## 7. Auth0 request path

```mermaid
flowchart TD
  Req[Browser request] --> MW{middleware}
  MW -->|Auth0 not configured| Next[Local persona Lead Engineer]
  MW -->|Auth0 configured| AuthRoutes["/auth/login logout callback"]
  AuthRoutes --> Session{session?}
  Session -->|yes| App[Pages + mutating APIs]
  Session -->|no and REQUIRE_AUTH=1| Login[Redirect /auth/login]
  Session -->|no and REQUIRE_AUTH=0| App
  App --> Identity[getAuthenticatedUser roles org]
  Identity --> HITL[Approve / Stop RBAC]
```

Details: [`07-auth0-setup.md`](07-auth0-setup.md).

---

## 8. Deploy topology

```mermaid
flowchart TB
  subgraph vercel [Vercel]
    CP[apps/control-plane]
  end
  subgraph trigger [Trigger.dev]
    Cron[morning-standup]
    Wait[HITL waitpoints]
  end
  subgraph persistent [Always-on host optional]
    SlackBot[slack-adapter]
    DiscordBot[discord-adapter]
  end
  subgraph saas [SaaS]
    Auth0[Auth0]
    Amb[Ambiguous]
    Exa[Exa]
    Router[Agent Router]
  end

  Cron --> CP
  Wait --> CP
  SlackBot --> CP
  DiscordBot --> CP
  CP --> Auth0
  CP --> Amb
  CP --> Exa
  CP --> Router
  Cron --> Router
  Cron --> Amb
```

Step-by-step Vercel: [`09-vercel-deploy.md`](09-vercel-deploy.md).

---

## 9. Repo map

```mermaid
flowchart LR
  subgraph apps
    CP[control-plane]
  end
  subgraph packages
    Orch[orchestrator]
    MCP[mcp-tools]
    Slack[slack-adapter]
    Discord[discord-adapter]
    DB[database]
    Shared[shared]
    Agent[agent]
  end
  CP --> Orch
  CP --> DB
  Orch --> MCP
  Slack --> Orch
  Discord --> Orch
  Agent --> Orch
```

| Path | Role |
| --- | --- |
| `apps/control-plane` | Next.js UI + APIs + Auth0 middleware |
| `packages/orchestrator` | Event → council → tools → HITL → traces |
| `packages/mcp-tools` | environment I/O, Exa, act+receipt, Ambiguous |
| `packages/slack-adapter` | Socket Mode bot + `/standup` |
| `packages/discord-adapter` | Discord bot |
| `packages/database` | Supabase / memory queries |
| `prompts/` | System, council, HITL, tool policy |
| `docs/` | Judging, deploy, workflows |

---

## 10. Demo-day minimal workflow

```mermaid
flowchart TD
  Start[Start] --> Pre[npm run preflight]
  Pre --> SeedA[npm run seed:ambiguous]
  SeedA --> Trig[npm run trigger:dev]
  Trig --> Dev[npm run dev]
  Dev --> SeedD[npm run seed:demo]
  SeedD --> Film[Film Slack/Ambiguous then Dungeon]
  Film --> Submit[Portal: repo video social]
```

Full clock: [`03-day-of-runbook.md`](03-day-of-runbook.md).  
Film script: [`04-demo-script.md`](04-demo-script.md).
