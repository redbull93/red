import { App } from "@slack/bolt";
import type { EnvironmentEvent } from "@red/shared";

export interface SlackAdapterOptions {
  botToken: string;
  appToken: string;
  signingSecret: string;
  standupChannel?: string;
  onEvent: (event: EnvironmentEvent) => Promise<void>;
}

export class SlackAdapter {
  private app: App;

  constructor(private readonly opts: SlackAdapterOptions) {
    this.app = new App({
      token: opts.botToken,
      appToken: opts.appToken,
      socketMode: true,
      signingSecret: opts.signingSecret,
    });

    this.register();
  }

  private register() {
    this.app.message(async ({ message, body }) => {
      const m = message as Record<string, any>;
      if (m.subtype || m.bot_id) return;

      const isDm = m.channel_type === "im";

      await this.opts.onEvent({
        type: isDm ? "dm.received" : "message.received",
        platform: "slack",
        workspaceId:
          (body as any).team_id ?? (body as any).team?.id ?? "unknown",
        channelId: m.channel,
        userId: m.user ?? "unknown",
        text: m.text ?? "",
        messageId: m.ts,
        timestamp: new Date(Number(m.ts) * 1000).toISOString(),
        raw: body,
      });
    });

    this.app.command("/standup", async ({ command, ack, respond }) => {
      await ack();
      await respond({ text: "Stand-up started. I will DM all teammates." });

      await this.opts.onEvent({
        type: "interaction.received",
        platform: "slack",
        workspaceId: command.team_id,
        channelId: command.channel_id,
        userId: command.user_id,
        text: "standup.start",
        messageId: command.trigger_id,
        timestamp: new Date().toISOString(),
        raw: command,
      });
    });

    this.app.action(/^approve_action:/, async ({ ack, body, action }) => {
      await ack();
      const a = action as any;

      await this.opts.onEvent({
        type: "interaction.received",
        platform: "slack",
        workspaceId: (body as any).team?.id ?? (body as any).team_id ?? "unknown",
        channelId: (body as any).channel?.id ?? "unknown",
        userId: (body as any).user?.id ?? "unknown",
        text: `approve:${a.value ?? a.action_id}`,
        messageId: (body as any).message?.ts ?? "unknown",
        timestamp: new Date().toISOString(),
        raw: body,
      });
    });

    this.app.action(/^stop_action:/, async ({ ack, body, action }) => {
      await ack();
      const a = action as any;

      await this.opts.onEvent({
        type: "interaction.received",
        platform: "slack",
        workspaceId: (body as any).team?.id ?? (body as any).team_id ?? "unknown",
        channelId: (body as any).channel?.id ?? "unknown",
        userId: (body as any).user?.id ?? "unknown",
        text: `stop:${a.value ?? a.action_id}`,
        messageId: (body as any).message?.ts ?? "unknown",
        timestamp: new Date().toISOString(),
        raw: body,
      });
    });
  }

  async start() {
    await this.app.start();
    console.log("Slack adapter running in Socket Mode");
  }

  async sendDM(userId: string, text: string, blocks?: unknown[]) {
    const open = await this.app.client.conversations.open({ users: userId });
    const channel = open.channel?.id;
    if (!channel) throw new Error(`Could not open Slack DM for ${userId}`);

    await this.app.client.chat.postMessage({
      channel,
      text,
      blocks: blocks as any,
    });
  }

  async postToChannel(channelId: string, text: string, blocks?: unknown[]) {
    await this.app.client.chat.postMessage({
      channel: channelId,
      text,
      blocks: blocks as any,
    });
  }

  async requestApproval(channelId: string, actionId: string, text: string) {
    await this.postToChannel(channelId, text, [
      {
        type: "section",
        text: { type: "mrkdwn", text },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "Approve" },
            style: "primary",
            action_id: `approve_action:${actionId}`,
            value: actionId,
          },
          {
            type: "button",
            text: { type: "plain_text", text: "Stop" },
            style: "danger",
            action_id: `stop_action:${actionId}`,
            value: actionId,
          },
        ],
      },
    ]);
  }
}
