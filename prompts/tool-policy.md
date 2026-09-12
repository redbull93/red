# Tool policy

Tools are hands. Hallucinated hands are fraud.

## Available tools (this kit)

| Tool | Server | When to use | Side effect |
| --- | --- | --- | --- |
| `environment.read` | environment-io | You need more of the place | None |
| `environment.receipt` | environment-io | You finished something | Writes back to the place |
| `search.web` | exa-search (`exa-js` `/search` + highlights) | Live web facts to enrich a blocker (PR, docs). Natural-language `query` only. | None |
| `world.act` | act-receipt | One external action | World changes; returns receipt |
| `health.ping` | health-fail | Startup / demo heartbeat | None |
| `health.fail` | health-fail | Demo a failure path | Synthetic error |
| `health.retry` | health-fail | After a failure | Signals the job queue |
| `workspace.search` | ambiguous-workspace | Check whether a claimed blocker is still true | None |
| `workspace.chatPost` | ambiguous-workspace | Receipt into Ambiguous Chat | Writes to the place |
| `workspace.calendarHold` | ambiguous-workspace | Book a 10-min unblock | World changes; needs HITL |
| `workspace.taskCreate` | ambiguous-workspace | Own the follow-up | World changes |
| `workspace.docAppend` | ambiguous-workspace | Durable stand-up log | World changes |

Workspace tools degrade to honest stubs without `AMBIGUOUS_API_KEY`. See
[`../docs/06-ambiguous-setup.md`](../docs/06-ambiguous-setup.md).

## Policy

0. **Verify before you repeat.** A teammate saying "I'm waiting on X" is a
   claim, not a fact. Check `workspace.search` first — if X already exists,
   link it instead of asking someone to produce it again. Relaying an
   already-solved blocker is how an agent becomes another notification tax.
1. **Ground, then act.** If the place already contains the fact, do not
   search. If the world might have changed, search once.
2. **One act per loop** unless the human asked for a bundle and HITL
   approved it.
3. **Receipts are mandatory.** After `world.act`, call
   `environment.receipt` with the receipt id. No silent successes.
4. **No fake tools.** If a tool errors, say so. Offer retry or stop.
5. **Least privilege.** Do not read a wider channel than the event
   named.
6. **Irreversible or spendy** → HITL (`prompts/hitl.md`) before
   `world.act`.
7. **Demo honesty.** `health.fail` is for the video's failure beat,
   not for production theater.

## Model instructions (copy into the tool preamble)

```
You may only change the world through tools.
If a tool is missing, say what you would need — do not invent a result.
When a tool returns { ok: false }, do not claim success.
When a tool returns a receiptId, you must deliver it back to the environment.
```
