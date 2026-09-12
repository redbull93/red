import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder,
} from "discord.js";
import type { EnvironmentEvent } from "@red/shared";

export interface DiscordAdapterOptions {
  token: string;
  clientId: string;
  guildId?: string;
  onEvent: (event: EnvironmentEvent) => Promise<void>;
}

export class DiscordAdapter {
  private client: Client;

  constructor(private readonly opts: DiscordAdapterOptions) {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent,
      ],
      partials: [Partials.Channel],
    });

    this.register();
  }

  private register() {
    this.client.once(Events.ClientReady, (c) => {
      console.log(`Discord ready as ${c.user.tag}`);
    });

    this.client.on(Events.MessageCreate, async (message) => {
      if (message.author.bot) return;

      const isDM = message.channel.type === ChannelType.DM;

      await this.opts.onEvent({
        type: isDM ? "dm.received" : "message.received",
        platform: "discord",
        workspaceId: message.guildId ?? "dm",
        channelId: message.channelId,
        userId: message.author.id,
        text: message.content,
        messageId: message.id,
        timestamp: message.createdAt.toISOString(),
        raw: { isDM },
      });
    });

    this.client.on(Events.InteractionCreate, async (interaction) => {
      if (!interaction.isButton() && !interaction.isChatInputCommand()) return;

      if (interaction.isButton()) {
        await interaction.deferUpdate().catch(() => {});
      }

      await this.opts.onEvent({
        type: "interaction.received",
        platform: "discord",
        workspaceId: interaction.guildId ?? "dm",
        channelId: interaction.channelId ?? "unknown",
        userId: interaction.user.id,
        text: interaction.isChatInputCommand()
          ? interaction.commandName
          : interaction.customId,
        messageId: interaction.id,
        timestamp: new Date().toISOString(),
        raw: {
          customId: interaction.isButton() ? interaction.customId : undefined,
        },
      });
    });
  }

  async start() {
    await this.client.login(this.opts.token);
  }

  async sendDM(userId: string, content: string) {
    const user = await this.client.users.fetch(userId);
    await user.send(content);
  }

  async postToChannel(channelId: string, content: string) {
    const channel = await this.client.channels.fetch(channelId);
    if (channel?.isTextBased()) {
      await (channel as any).send(content);
    }
  }

  async requestApproval(channelId: string, actionId: string, text: string) {
    const channel = await this.client.channels.fetch(channelId);
    if (!channel?.isTextBased()) return;

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`approve_action:${actionId}`)
        .setLabel("Approve")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`stop_action:${actionId}`)
        .setLabel("Stop")
        .setStyle(ButtonStyle.Danger),
    );

    await (channel as any).send({ content: text, components: [row] });
  }
}

export async function deployDiscordCommands(opts: {
  token: string;
  clientId: string;
  guildId: string;
}) {
  const commands = [
    new SlashCommandBuilder()
      .setName("standup")
      .setDescription("Start the daily stand-up")
      .toJSON(),
  ];

  const rest = new REST({ version: "10" }).setToken(opts.token);

  await rest.put(
    Routes.applicationGuildCommands(opts.clientId, opts.guildId),
    { body: commands },
  );

  console.log("Discord commands deployed successfully");
}
