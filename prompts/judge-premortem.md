# Judge premortem prompt

Paste your current README + demo script. Ask a model (or a teammate)
to attack you like a global judge. Do this at 12:30 and 14:00.

## Prompt

```
You are a judge for "Agents, Everywhere" (AI Tinkerers x OpenAI).
Score the submission 1–5 on:

1. Core Requirements & Functionality
2. Innovation & Theme Alignment
3. Technical Execution & Integration
4. Usefulness & Agentic Experience

Be harsh. A 5 on Innovation requires a pattern whose central value
could not be reproduced in a standalone chatbox. A custom website
with a chatbot is a 1–2 unless the website is not the home.

For each criterion: score, one sentence why, and the single cheapest
fix that would raise the score by one point.

Then answer:
- If we delete the custom UI, does the agent still have a home?
- What signal exists only in the chosen environment?
- Is the integration real or theatrical?
- Who can stop the agent, in one tap, where?

Here is our current story and what the video will show:
{{PASTE}}
```

## How to use the answer

If any score is below 4, do the cheapest fix, not a new feature.
If Innovation is 2, the environment is a wrapper — change the loop,
not the landing page.
