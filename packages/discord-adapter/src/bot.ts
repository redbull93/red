import {
  ChannelType,
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
} from "discord.js";
import {
  fixtureEvent,
  ingestEnvironmentEvent,
  setReceiptSink,
} from "@red/orchestrator";
import {
  allComplete,
  clearSession,
  nextQuestion,
  recordAnswer,
  sessionForUser,
  STANDUP_QUESTIONS,
  startSession,
} from "../../slack-adapter/src/collect.ts";
import { sessionToEvent } from "../../slack-adapter/src/to-event.ts";

const token = process.env.DISCORD_BOT_TOKEN?.trim();
if (!token) {
  throw new Error("Missing DISCORD_BOT_TOKEN in .env");
}

const defaultChannel = process.env.DISCORD_STANDUP_CHANNEL?.trim();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
  ],
});

setReceiptSink(async ({ channelId, body }) => {
  const channel = await client.channels.fetch(channelId);
  if (!channel || !channel.isTextBased() || channel.isDMBased()) return;
  const embed = new EmbedBuilder()
    .setTitle("Stand-up summary")
    .setDescription(body.slice(0, 4000))
    .setColor(0x111111);
  await channel.send({ embeds: [embed] });
});

const commands = [
  new SlashCommandBuilder()
    .setName("standup")
    .setDescription("DM this channel's members the three stand-up questions"),
  new SlashCommandBuilder()
    .setName("standup-demo")
    .setDescription("Post the Eugene/Brian fixture summary in this channel"),
].map((c) => c.toJSON());

async function runCollected(channelId: string, event: ReturnType<typeof fixtureEvent>) {
  await ingestEnvironmentEvent({
    ...event,
    channelId,
    environmentName: "Discord stand-up",
    environmentKind: "discord",
  });
}

client.once("ready", async () => {
  const rest = new REST({ version: "10" }).setToken(token);
  if (client.user) {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
  }
  console.log(`StandUp Discord running as ${client.user?.tag}. /standup in any invited server channel.`);
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const channelId = interaction.channelId || defaultChannel;
  if (!channelId) {
    await interaction.reply({
      content: "Run this in a channel or set DISCORD_STANDUP_CHANNEL.",
      ephemeral: true,
    });
    return;
  }

  if (interaction.commandName === "standup-demo") {
    await interaction.deferReply({ ephemeral: true });
    await runCollected(channelId, fixtureEvent({ channelId }));
    await interaction.editReply("Demo posted in this channel.");
    return;
  }

  if (interaction.commandName === "standup") {
    await interaction.deferReply({ ephemeral: true });
    const humans: Array<{ userId: string; displayName: string }> = [];
    const guild = interaction.guild;
    if (guild) {
      const members = await guild.members.fetch();
      for (const member of members.values()) {
        if (member.user.bot) continue;
        humans.push({
          userId: member.id,
          displayName: member.displayName,
        });
      }
    }
    if (humans.length === 0) {
      humans.push({
        userId: interaction.user.id,
        displayName: interaction.user.displayName,
      });
    }
    startSession(channelId, humans);
    let messaged = 0;
    for (const person of humans) {
      try {
        const user = await client.users.fetch(person.userId);
        await user.send(STANDUP_QUESTIONS[0].text);
        messaged += 1;
      } catch {
        // User may have DMs closed
      }
    }
    await interaction.editReply(
      `Stand-up started. DMed ${messaged} person(s). Invite this bot to another server/channel and run /standup there.`,
    );
  }
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (message.channel.type !== ChannelType.DM) return;
  const userId = message.author.id;
  if (!sessionForUser(userId)) return;

  recordAnswer(userId, message.content.trim());
  const followUp = nextQuestion(userId);
  if (followUp) {
    await message.reply(followUp);
    return;
  }
  const session = sessionForUser(userId);
  if (!session || !allComplete(session)) {
    await message.reply("Thanks — waiting on the rest of the team.");
    return;
  }
  await message.reply("Got it. Posting the summary to the team channel.");
  const event = sessionToEvent(session);
  const channelId = session.receiptChannelId;
  clearSession(session);
  await runCollected(channelId, event);
});

await client.login(token);
