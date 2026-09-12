# Judging decoder — self-score before you write code

Judges are not scoring "cool AI." They are scoring four questions. Use this
file as a premortem. If you cannot honestly circle a 4 on every axis before
lunch, cut scope.

Scoring is 1–5. Global review. No local winner.

---

## 1. Core Requirements & Functionality

**What they wrote:** Does the project deliver a working agent inside a
place where people already work, talk, or live? Does the core workflow
function end-to-end?

| Score | Meaning |
| --- | --- |
| 1 | Does not run, or no functional agent. |
| 2 | Parts run; core workflow or environment integration is incomplete. |
| 3 | Basic end-to-end agent in the intended environment, with bugs. |
| 4 | Reliable, complete agent experience, minor issues. |
| 5 | Robust, reliable, fully functional in its intended environment. |

**Ask yourself**

- Can a stranger watch the two-minute video and see the agent **finish**
  something inside Slack / WhatsApp / email / a ticket / a browser / a
  room — not only on a landing page?
- Is the environment the runtime, or a screenshot?
- If the laptop dies after the demo, did the action still land in the
  real place?

**Hackathon kill shots:** mocked Slack, "imagine this is WhatsApp,"
seven half-features, zero finished loop.

**Ship bar for a 4:** one user, one place, one complete action, one
visible receipt back in that place.

---

## 2. Innovation & Theme Alignment

**What they wrote:** Does the project explore a compelling new place or
interaction for agents? Does the environment materially improve what the
agent can do?

| Score | Meaning |
| --- | --- |
| 1 | Generic chatbot or automation; environment is irrelevant. |
| 2 | Eligible environment, but it is mostly a wrapper. |
| 3 | Theme is clear; environment adds meaningful value. |
| 4 | Environment shapes the core workflow; original agent experience. |
| 5 | Surprising pattern whose central value **could not** be reproduced in a standalone chatbox. |

**The wrapper test:** rip the agent out and drop it into ChatGPT. If it
still works the same, you are a 2. If it dies because it lost thread
context, presence, timing, the room, the queue, the group — you are near
a 5.

**Hackathon kill shots:** "AI assistant that also has a Slack bot."
Theme sentence in the README, chatbot in the demo.

**Ship bar for a 4:** the environment supplies a signal a chatbox will
never be told (who is in the thread, what just changed, where the body
is, which document is open).

---

## 3. Technical Execution & Integration

**What they wrote:** Code, architecture, reliability, tool use, data
handling, depth of integration with the selected environment.

| Score | Meaning |
| --- | --- |
| 1 | Conceptual or mocked. |
| 2 | Basic, unstable, or superficial integrations. |
| 3 | Solid execution, working integrations, rough edges. |
| 4 | Well engineered; tools, data, and environment integrate effectively. |
| 5 | Exceptional: robust orchestration, thoughtful failure handling, deeply integrated architecture. |

**Visible engineering judges can taste in a video**

- MCP tools that actually act (not `console.log`)
- A durable job that retries (Trigger.dev or the stub in this kit)
- A human stop / approve gate
- Traces on the control plane
- Identity: who is allowed to act (Auth0 or an honest stub)
- Failure that is handled, not hidden

Sponsor stickers without depth do not raise this score. One deep
integration beats five logos.

**Ship bar for a 4:** one real MCP server, one retry path, one HITL
gate, traces you can film.

---

## 4. Usefulness & Agentic Experience

**What they wrote:** Clear value for intended users? Intuitive, effective,
appropriate for the environment?

| Score | Meaning |
| --- | --- |
| 1 | Unclear use case; little value. |
| 2 | Recognizable use case; mostly prompt-and-response. |
| 3 | Useful, understandable, meaningful actions, reasonable control. |
| 4 | Solves a clear problem; agent feels native; strong people–AI interaction. |
| 5 | Substantial value designed specifically for this environment; intelligent context; still clear and controllable. |

**Ask yourself**

- Name the human in one sentence. Not "teams." Not "Africa." A person.
- What do they stop doing with their thumbs?
- Can they refuse, undo, or approve without leaving the place they
  already live?

**Ship bar for a 4:** a specific human gets a specific outcome, with
control, in the place they already are.

---

## Premortem checklist (print this)

- [ ] Environment is load-bearing (wrapper test fails — in a good way)
- [ ] One complete loop: signal → plan → tool → receipt in-place
- [ ] One failure path the agent names and recovers from
- [ ] One human override
- [ ] Video can show all of the above without a slide
- [ ] README says who, where, and why this cannot be a chatbox
- [ ] Control plane is theater, not the home
- [ ] Honest 4+ on every axis, or we cut

If any box is empty at 14:00, cut. Do not add a second environment.
