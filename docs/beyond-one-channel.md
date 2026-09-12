# StandUp beyond one channel

The bot is **not** locked to `#new-channel`. It posts wherever you run the command, after it is invited.

## Other channels in *your* workspace (mundecodes)

1. Open the other channel.
2. `/invite @Standup` (or Channel → Integrations → Add apps).
3. Run `/standup` or `/standup-demo` **in that channel**.

The stand-up questions and the summary both land in **that** channel (a thread, not DMs).

For “everyone in the channel,” add bot scopes **`channels:read`** / **`channels:history`** (public) and **`groups:read`** / **`groups:history`** (private), subscribe to **`message.channels`** (and **`message.groups`** if private), then **Reinstall to mundecodes**.

## Other companies’ Slack (not mundecodes)

It will **not** appear there until they install the same app.

1. [api.slack.com/apps](https://api.slack.com/apps) → Standup → **Manage Distribution** → activate public/unlisted distribution.
2. Add redirect URL: `http://localhost:3002/slack/oauth_redirect` (or your deployed URL + `/slack/oauth_redirect`).
3. Copy **Client ID** and **Client Secret** into `.env` as `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET`.
4. Restart `npm run dev:slack`. Share the install link (`/slack/install` on port 3002).
5. A workspace admin clicks install. Their bot token is saved under `.data/slack-installs.json`.
6. They `/invite @Standup` into *their* channel and run `/standup`.

One `.env` `SLACK_BOT_TOKEN` is only mundecodes. Extra workspaces need that OAuth install.

## 08:00 Africa/Nairobi

`src/trigger/daily-standup.ts` POSTs `STANDUP_START_URL` (default `http://localhost:3001/internal/standup/start`). Keep the Slack adapter running. Deploy Trigger.dev with `TRIGGER_SECRET_KEY` when you leave the laptop.

## Discord

1. Create a bot at the Discord developer portal. Enable Message Content + Server Members intents.
2. Invite it with applications.commands, bot, Send Messages, DM.
3. `DISCORD_BOT_TOKEN` in `.env`.
4. `npm run dev:discord`
5. `/standup` or `/standup-demo` in any server channel the bot can see.
