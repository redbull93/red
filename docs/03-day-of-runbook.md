# Day-of runbook

Nairobi in-person is the default clock. Virtual 24h PDT is the same
rubric with more air. **There is no local winner.** You are in one
global pool.

---

## The clock (Nairobi, EAT)

| Time | What happens | You |
| --- | --- | --- |
| 10:00–10:30 | Doors, food, teammates | Do not code a product. Listen. |
| 10:30–11:00 | Global opening + starter kit | Note credits, starter repo, Auth0/Exa keys |
| 11:00–11:15 | Team formation (1–5) | Name the **environment**, not the brand |
| 11:15–12:30 | Build block 1 | Adapter + one MCP act + receipt |
| 12:30–13:00 | Eat. Write the two-minute script | [`04-demo-script.md`](04-demo-script.md) |
| 13:00–14:30 | Build block 2 | HITL, retries, traces on control plane |
| 14:30–15:00 | Film | Environment first, control plane second |
| 15:00–15:30 | README + social + last bug | Submit-shaped README |
| 15:30–16:00 | Portal submissions | All five artifacts. Do not polish. |
| 16:00–16:45 | Optional local show-and-tell | After submit |
| 16:45–17:00 | Wrap | Group photo |

Virtual: build window is 12:00am Sep 12 → 12:00am Sep 13 Pacific.
Same five artifacts. Same "one loop" bar.

---

## Decision order (do not invert)

1. **Environment** — where people already are
2. **Wound** — who is exhausted there
3. **Smallest loop** — signal → act → receipt
4. **Tools** — one MCP server that is real
5. **Theater** — Vengeance control plane for the video

If you pick a UI first, you will build a chatbox.

---

## Hard cuts for a four-hour solo or pair

Keep:

- One environment
- One human
- One complete action
- One failure + retry
- One Approve / Stop
- One gorgeous control screen

Cut:

- Second environment
- Accounts, billing, onboarding
- A landing page that explains the company
- Five sponsor logos with no footage
- Memory systems you cannot show

---

## Submission — all five, or you are not in the pool

1. **Title** — a name, not a slogan paragraph
2. **Written description** — what you built, who it is for, **why the
   context matters**
3. **Public GitHub** — this repo, filled in
4. **Two-minute video** — environment → agent → tool → result in-place
5. **Social post** — tag sponsors: OpenAI, CopilotKit, OpenRouter, Exa,
   Trigger.dev, Auth0, Mozilla, Ambiguous

Judges watch a video. They will not SSH into your laptop.

---

## Video order (do not invert)

1. The place (real Slack / WhatsApp / inbox / browser / room)
2. The signal only that place has
3. The agent acting (tool call visible)
4. The receipt back in the place
5. A failure, a retry, a human Stop
6. Two seconds of control-plane theater
7. One sentence: why this dies in a standalone chatbox

If step 1 is a custom website, you are already in wrapper territory.

---

## How people lose

- ChatGPT clone with a theme sentence in the README
- Mocked Slack screenshots
- Seven features, zero finished loop
- 90 minutes on a landing page before the agent can act
- No traces, no retries, no stop
- Explaining the stack instead of showing the place

---

## How you stay in the 4–5 band

- Pick environment first, wound second, tools third
- Honest score against [`01-judging-decoder.md`](01-judging-decoder.md)
  at 12:30 and 14:00
- Film by 15:00
- Submit before you polish

---

## Keys and stubs

Copy `.env.example` files. Empty keys fall back to **honest stubs** so
the control plane still moves. Replace stubs before you film if you
want Technical Execution above a 3.

- `OPENAI_API_KEY` or `OPENROUTER_API_KEY`
- `EXA_API_KEY` (search tool)
- Optional: Auth0, Trigger.dev, Ambiguous, CopilotKit

Never commit secrets.
