# Open the mind — then lock the place

Thinking gym for
[Agents, Everywhere](https://nairobi.aitinkerers.org/p/agents-everywhere-bots-channels-more-global-hackathon)
(AI Tinkerers x OpenAI).

**Direction locked:** [StandUp Agent](05-standup-agent.md) lives in
**Slack / Discord**. The agent cross-references teammates' updates and
returns a receipt to the team channel. Keep using this file as a
premortem: if the place becomes a costume, Innovation dies.

The whole game is one sentence:

> Put a working agent inside a place people already work, talk, or live —
> and make that place do something a standalone chatbot cannot.

If the environment is a costume, you lose Innovation. If the demo does not
complete one real loop, you lose Core Requirements. Pretty UI without those
two is decoration.

---

## The theme, decoded

Most agents still wait inside a separate chat window. This build day starts
from a different premise: the most useful agents show up inside the tools,
channels, devices, and rooms where people already have work to do.

Eligible homes (examples, not tracks):

- **At work:** Slack, Teams, email, documents, calendars, tickets, support,
  live collaboration
- **In your pocket:** messaging, mobile, notifications, short asynchronous
  moments
- **On the web:** browsers and software where an agent can research,
  navigate, transact, or take action
- **In the room:** voice, vision, wearables, robotics, physical-world
  interfaces

These are examples. Every team enters one global pool. The 5 they wrote for
Innovation is the north star:

> A surprising agent pattern whose central value could not be reproduced
> in a standalone chatbox.

Vengeance UI in this repo is **not** the place the agent lives. It is
mission control: traces, approvals, status theater. The agent belongs in
WhatsApp, Slack, email, a ticket, a browser tab, a speaker. If judges only
see a gorgeous custom site, you have built a chatbox with better fonts.

---

## Problems that need agents (not products)

These are **wounds**. An agent earns the right to exist only if it can
**see context the human is already drowning in**, and **act in the same
channel** they already use.

### Care and the body

Hospital discharge is a PDF, a WhatsApp group, and a grandmother who cannot
read the follow-up date. The failure is not "lack of information." It is
**fragmented context across rooms that do not talk**.

Caregivers (mostly women) run a hidden ops stack: meds, money, transport,
siblings arguing in a group chat. Burnout is a coordination failure.

Disability access is still "please download the other app." The person
already has a phone, a voice, a location.

### Work that is invisible

Informal workers, dukas, boda riders, clinic clerks, teachers: the job is
real-time, the paperwork is after-hours, the system of record is a chat
thread or a carbon book.

Small clinics and shops die on admin, not on skill. The agent that matters
lives where the work already happens.

Frontline staff invent workarounds. Those workarounds **are** the
environment.

### The civic maze

Benefits, IDs, county services, tenant rights, immigration forms: the state
speaks PDF; people speak WhatsApp and queues.

Misinformation travels faster than official updates in the same group chats
that families already trust.

After a flood, a protest, or a hospital strike, the useful agent is not a
website. It is whoever can **listen in the channel that is already on fire**
and act with receipts.

### Home and the room

Energy waste, lonely elders, kids' homework, shared houses with one fridge
and five calendars. The environment is the room, the speaker, the camera,
the shared list on the fridge.

Food waste and hunger sit on the same street. The gap is logistics and
timing, not morality.

### Attention and dignity

People are not underserved by chatbots. They are over-notified and
under-helped. An agent that pings without finishing a job is another tax.

Language is power. The person who needs the service often is not the
person who can speak the institution's language.

---

## Hold the wounds next to today's stack

- **Context engineering** — the environment *is* the prompt. Slack threads,
  WhatsApp history, a calendar, a ticket, a camera frame. If you throw that
  away and ask "how can I help?", you already lost.
- **MCP** — tools as servers. The agent should not have a private API zoo.
  It should grow hands: search (Exa), workspace (Ambiguous), mail, calendar,
  tickets, browser.
- **AG-UI / CopilotKit** — the human sees the agent *doing*, not only
  talking. Generative UI, in-app actions, A2A. There is a Best Use of
  CopilotKit prize.
- **Durable workflows (Trigger.dev)** — real work is long: wait for a
  reply, retry a payment, poll a portal. Chat timeouts are how toy agents
  die.
- **Identity (Auth0)** — who may act? On whose behalf? Controllability is
  a judging line, not a footnote.
- **OpenRouter** — model routing when the primary model flakes at 3pm.
- **Ambiguous AI** — an agent that already lives in Docs, Mail, Chat,
  Calendar as a coworker. Best Use prize is a DGX Spark. Use it if the
  environment is work. Do not bolt it on for points.
- **Voice / vision / computer-use** — "in the room" and "on the web" are
  eligible. A laptop camera and a browser are a room.

---

## Rhetorical questions

Do not answer these in the README. Answer them in your gut until one
environment becomes obvious.

1. If you deleted the custom website, would the agent still have a home?
2. What does this place know at 11:07am that no chatbot will ever be told?
3. Who is already exhausted in that place — and what are they *doing with
   their thumbs* when it breaks?
4. What is the smallest loop that starts in the environment, acts in the
   world, and **returns a receipt to the same environment**?
5. If the agent is wrong, who gets hurt, and how does a human stop it in
   one tap?
6. Would a judge say "this had to live here," or "they put a bot in Slack"?
7. Are you solving a wound you have watched, or a demo you have seen on
   Twitter?
8. What would be true on Monday if this shipped to ten real people tonight?
9. Which sponsor tool makes the environment *deeper*, and which one is a
   sticker?
10. Can you film the entire win in two minutes without explaining
    architecture?

When one environment makes three of those questions feel urgent, you have
a direction. Then lock architecture. Not before.

---

## How to use this kit

1. Read this file. Do not name a product.
2. Score a candidate against [`01-judging-decoder.md`](01-judging-decoder.md).
3. When the environment is load-bearing, read
   [`02-architecture.md`](02-architecture.md) and wire the placeholders.
4. Run the day with [`03-day-of-runbook.md`](03-day-of-runbook.md).
5. Film with [`04-demo-script.md`](04-demo-script.md).
6. Steal language from [`../prompts/`](../prompts/), never a use case.
