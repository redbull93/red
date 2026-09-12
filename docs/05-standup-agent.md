# StandUp Agent — locked direction

The environment is chosen: **Slack and Discord**, where the team already
stands up. This note maps the product to the judging rubric and the kit.

## Wrapper test

Rip StandUp out of Slack/Discord and paste three updates into ChatGPT.

You lose:

- Morning schedule as a shared ritual (Trigger.dev)
- DMs that already reach each teammate
- Channel presence and @mentions as the receipt surface
- Who has not replied yet
- The social cost of posting a wrong "Brian → send docs" ping

If those disappear and the product still feels the same, you built a
summarizer. Keep the **cross-reference + channel receipt** as the spine.

## Smallest demo loop

1. Signal: three stand-up replies in one event (Eugene blocked on Brian;
   Brian done but silent; Amina fine).
2. Plan: detect the hidden dependency.
3. Act: `world.act` → stand-up summary.
4. Receipt: `environment.receipt` into `#standup` / Discord channel.
5. Optional HITL: approve before @-mentioning Brian with a suggested action.
6. Fail path: `health.fail` → `health.retry` → Stop.

## Map to packages

| Product step | Kit surface |
| --- | --- |
| Slack/Discord webhook or poll | `ingestEnvironmentEvent` |
| Collect DMs | Adapter → `EnvironmentEvent.artifacts` |
| Cross-reference | Orchestrator + prompts |
| Exa enrich | `search.web` MCP tool |
| Post summary | `environment.receipt` / `world.act` |
| Morning cron | `jobs.ts` → swap for Trigger.dev |
| Mission control video | `apps/control-plane` |

## Do not

- Build a custom stand-up website as the home
- Ship seven platforms — Slack first, Discord second if time
- Summarize without a suggested next action when a blocker exists
