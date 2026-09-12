# Council prompt — three models, one stand-up

Injected once per run, before the tool loop. Sent **in parallel** to three
models through Agent Router, each getting the identical environment block
and no tools.

Baked copy: `COUNCIL_PROMPT` in
[`../packages/orchestrator/src/prompts.ts`](../packages/orchestrator/src/prompts.ts).

---

## Why three

A single model that hallucinates a dependency states it with the same
confidence as a real one. Nothing downstream can tell the difference, and
the cost lands on a person: Brian gets pinged about a doc he already sent.

So three models read the same stand-up independently and we compare:

- **All three name a dependency** → treat as fact, act on it.
- **Only some name it** → contested. Do not post it. Send it to a human
  with each model's position shown side by side.
- **A model cannot answer** → it abstains, by name, with a reason.

Disagreement is not noise to be averaged away. It is the most useful
signal in the run, and it is what [`hitl.md`](hitl.md) already asked for
under "tools disagreed."

## What agreement is keyed on

The **dependency pair**, not the artifact wording.

Models describe the same thing as "API docs", "API documentation" and
"endpoint docs". Insisting those strings match would manufacture fake
dissent on every run. `eugene → brian` is the claim; the artifact text is
descriptive detail, and the longest version is kept for the summary.

Names are resolved onto real actor ids from the environment block, so a
model that invents a teammate is silently dropped rather than trusted.

## Seats

| Seat | Model | Note |
| --- | --- | --- |
| `deepseek` | `deepseek-v4-flash` | Anchor. Not rationed, so it is always seated. |
| `gpt` | `gpt-6-astra` | Rationed daily by Agent Router. |
| `opus` | `claude-opus-4-8` | Rationed daily by Agent Router. |

Agent Router releases GPT and Opus in batches at **03:00, 11:00 and 19:00
Nairobi**, while supplies last. Once a batch drains they return
`402 Budget pool quota has been exhausted`.

A 402 is an **abstention, not a failure**. The run continues on whoever
answered, and the control plane names who sat out and why. "GPT
abstained: quota exhausted" is honest; silently pretending three models
agreed would not be.

## Quorum

Fewer than two answering seats means agreement was never testable, so the
verdict is marked `unverified` and the summary must say so rather than
implying consensus.

It does **not** pause by default. Blocking on a thin council would make
the agent less capable than a single model was, and would put an approval
gate in front of every ordinary stand-up. Set
`COUNCIL_HITL_ON_UNVERIFIED=1` for the stricter posture where nothing
uncorroborated is ever posted unattended.

## Capture and replay

Because the full-council window is narrow, a genuine multi-seat verdict is
written to `fixtures/council/` whenever one occurs:

```bash
npm run preflight         # which seats are alive right now
npm run council:capture   # capture a real verdict while they are up
npm run council:replay    # replay it, labelled as replayed
```

Replayed verdicts carry `cached: true` everywhere they surface. Replaying
a real captured council is honest. Hardcoding three opinions would not be.

## Environment knobs

| Variable | Default | Effect |
| --- | --- | --- |
| `COUNCIL_ENABLED` | on | `0` skips the council entirely |
| `COUNCIL_SEATS` | all three | Comma list, e.g. `deepseek,gpt` |
| `COUNCIL_MIN_QUORUM` | `2` | Seats needed before agreement counts |
| `COUNCIL_HITL_ON_UNVERIFIED` | off | Pause when quorum is missing |
| `COUNCIL_REPLAY` | off | `1` for newest capture, or a tag |
