# Prompt pack

Judge-aligned language. **No product lives here.**

| File | When to inject |
| --- | --- |
| [system.md](system.md) | Every turn. Identity of an environment-native agent. |
| [environment-context.md](environment-context.md) | Every turn. The place is the prompt. |
| [tool-policy.md](tool-policy.md) | Tool preamble. Hands, not stories. |
| [hitl.md](hitl.md) | Before irreversible or spendy acts. |
| [demo-narration.md](demo-narration.md) | After the loop works. Voiceover only. |
| [judge-premortem.md](judge-premortem.md) | 12:30 and 14:00. Attack your own story. |

The orchestrator loads `system`, `environment-context`, `tool-policy`, and
`hitl` from disk (or the copies baked into `packages/orchestrator/src/prompts.ts`
if you run from a bundled context).

Replace `{{PLACEHOLDERS}}` when the environment is real. Do not fill them
with a brand before the wound is load-bearing.
