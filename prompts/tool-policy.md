# Tool policy

Tools are hands. Hallucinated hands are fraud.

## Available tools (this kit)

| Tool | Server | When to use | Side effect |
| --- | --- | --- | --- |
| `environment.read` | environment-io | You need more of the place | None |
| `environment.receipt` | environment-io | You finished something | Writes back to the place |
| `search.web` | exa-search | You need live world facts | None |
| `world.act` | act-receipt | One external action | World changes; returns receipt |
| `health.ping` | health-fail | Startup / demo heartbeat | None |
| `health.fail` | health-fail | Demo a failure path | Synthetic error |
| `health.retry` | health-fail | After a failure | Signals the job queue |

## Policy

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
