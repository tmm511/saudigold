import {
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder,
} from 'discord.js';
import { config } from './config.js';
import { buildComponents, buildEmbeds, REFRESH_BUTTON_ID } from './embeds.js';
import { fetchAll, priceSignature } from './prices.js';
import { readState, writeState } from './state.js';

const COMMAND = new SlashCommandBuilder()
  .setName('gold')
  // No name localization: Discord's locale list has no Arabic entry.
  .setDescription('أسعار الذهب اليوم في السعودية — live Saudi gold prices')
  .toJSON();

const intents = [GatewayIntentBits.Guilds];
if (config.enablePrefixCommands) {
  intents.push(GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent);
}

const client = new Client({ intents, partials: [Partials.Channel] });

async function buildPayload() {
  const results = await fetchAll();
  return { embeds: buildEmbeds(results), components: buildComponents() };
}

async function registerCommands(appId) {
  const rest = new REST({ version: '10' }).setToken(config.token);
  const route = config.guildId
    ? Routes.applicationGuildCommands(appId, config.guildId)
    : Routes.applicationCommands(appId);
  await rest.put(route, { body: [COMMAND] });
  console.log(`Registered /gold (${config.guildId ? `guild ${config.guildId}` : 'global — may take up to 1h'})`);
}

// ---------------------------------------------------------------- auto poster

let lastSignature = null;

async function runAutoUpdate() {
  const channel = await client.channels.fetch(config.autoChannelId).catch(() => null);
  if (!channel?.isTextBased?.()) {
    console.error(`AUTO_CHANNEL_ID ${config.autoChannelId} is not a reachable text channel.`);
    return;
  }

  const results = await fetchAll();
  const signature = priceSignature(results);

  // Poll often, write rarely: only touch Discord when a number actually moved.
  if (config.autoMode === 'edit' && signature === lastSignature) return;
  lastSignature = signature;

  const payload = { embeds: buildEmbeds(results), components: buildComponents() };
  console.log(`Prices changed — updating channel ${config.autoChannelId}`);

  if (config.autoMode === 'edit') {
    const { autoMessageId, autoChannelId } = await readState();
    if (autoMessageId && autoChannelId === config.autoChannelId) {
      const existing = await channel.messages.fetch(autoMessageId).catch(() => null);
      if (existing) {
        await existing.edit(payload);
        return;
      }
    }
  }

  const sent = await channel.send(payload);
  if (config.autoMode === 'edit') {
    await writeState({ autoMessageId: sent.id, autoChannelId: config.autoChannelId });
  }
}

function startAutoUpdates() {
  if (!config.autoChannelId) {
    console.log('AUTO_CHANNEL_ID not set — auto updates disabled (slash command still works).');
    return;
  }

  const tick = () =>
    runAutoUpdate().catch((error) => console.error('Auto update failed:', error.message || error));

  tick();
  setInterval(tick, config.refreshSeconds * 1000);
  console.log(
    `Checking prices every ${config.refreshSeconds}s in channel ${config.autoChannelId} ` +
      `(mode: ${config.autoMode}; the message is edited only when a price changes).`,
  );
}

// -------------------------------------------------------------------- handlers

client.once(Events.ClientReady, async (c) => {
  console.log(`Logged in as ${c.user.tag}`);
  try {
    await registerCommands(c.application.id);
  } catch (error) {
    console.error('Slash command registration failed:', error.message || error);
  }
  startAutoUpdates();
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand() && interaction.commandName === 'gold') {
      await interaction.deferReply();
      await interaction.editReply(await buildPayload());
      return;
    }

    if (interaction.isButton() && interaction.customId === REFRESH_BUTTON_ID) {
      await interaction.deferUpdate();
      await interaction.message.edit(await buildPayload());
    }
  } catch (error) {
    console.error('Interaction failed:', error);
    const body = { content: '⚠️ حدث خطأ أثناء جلب الأسعار. حاول مرة أخرى.', flags: MessageFlags.Ephemeral };
    if (interaction.isRepliable()) {
      await (interaction.deferred || interaction.replied
        ? interaction.followUp(body)
        : interaction.reply(body)
      ).catch(() => {});
    }
  }
});

if (config.enablePrefixCommands) {
  const triggers = new Set([`${config.prefix}gold`, `${config.prefix}ذهب`]);
  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;
    if (!triggers.has(message.content.trim().toLowerCase())) return;
    try {
      await message.reply(await buildPayload());
    } catch (error) {
      console.error('Prefix command failed:', error);
    }
  });
}

client.login(config.token);
