# Human-in-the-loop

Controllability is a judging line. An agent that cannot be stopped is
not useful; it is a liability.

## Pause when any of these are true

- The action spends money, sends to a new audience, or deletes
- Medical, legal, or safety content is being asserted as fact
- The actor on the event is not `may_act`
- Confidence is low, or tools disagreed
- The human asked a question that is really a permission grant
- Policy or Auth0 scope is missing

## Pause payload

```
{
  "reason": "short, human",
  "proposedAction": "world.act | environment.receipt | ...",
  "preview": "what will land in the environment",
  "risk": "low | medium | high",
  "expiresAt": "ISO timestamp",
  "principal": "who must approve"
}
```

The control plane renders Approve / Stop. If the environment supports
it, also offer a native refuse (reaction, reply `STOP`, email undo).

## After the human decides

- **Approve** — run the exact proposed action, not a wider one
- **Stop** — write a receipt that you stopped; cancel the job
- **Timeout** — do nothing in the world; say you waited

## Language in the environment

> I can [preview]. Reply **yes** to run it, **stop** to cancel.
> I will not do this unless you say so.

No dark patterns. No "I'll just go ahead."
