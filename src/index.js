import {
  ActivityType,
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
import { buildComponents, buildEmbeds } from './embeds.js';
import { fetchAll, priceFingerprints, priceSignature, pricesMoved } from './prices.js';
import { readState, writeState } from './state.js';

// A host that reports only "failed to launch" is useless for diagnosis, so
// make the process say why before it dies.
process.on('unhandledRejection', (reason) => {
  console.error('FATAL unhandled rejection:', reason);
  process.exit(1);
});
process.on('uncaughtException', (error) => {
  console.error('FATAL uncaught exception:', error);
  process.exit(1);
});

const COMMAND = new SlashCommandBuilder()
  .setName('gold')
  // No name localization: Discord's locale list has no Arabic entry.
  .setDescription('أسعار الذهب اليوم في السعودية — live Saudi gold prices')
  .toJSON();

const intents = [GatewayIntentBits.Guilds];
if (config.enablePrefixCommands) {
  intents.push(GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent);
}

const ACTIVITY_TYPES = {
  streaming: ActivityType.Streaming,
  playing: ActivityType.Playing,
  listening: ActivityType.Listening,
  watching: ActivityType.Watching,
  competing: ActivityType.Competing,
};

function buildPresence() {
  if (!config.statusText) return undefined;

  const type = ACTIVITY_TYPES[config.statusType] ?? ActivityType.Streaming;
  const activity = { name: config.statusText, type };
  // url only means anything for Streaming, and Discord requires a twitch.tv or
  // youtube.com link before it will render the purple "Streaming" label.
  if (type === ActivityType.Streaming) activity.url = config.statusUrl;

  return { activities: [activity], status: config.statusOnline };
}

// Passing presence here (rather than only calling setPresence after ready)
// means it is sent with every gateway identify, so it survives reconnects.
const client = new Client({ intents, partials: [Partials.Channel], presence: buildPresence() });

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

// Prices as of the last update, per source. Seeded from state on the first
// tick so a restart keeps its baseline: the first tick after a restart edits
// the message like any other (lastSignature is null) but must not ping unless
// a price really moved since the previous process last looked. `undefined`
// means "not loaded yet"; `null` means "no baseline, so no ping this tick".
let lastPrices;

/**
 * Locate the message this bot keeps up to date.
 *
 * Checks the saved ID first, then falls back to scanning recent channel
 * history for the bot's own last embed message. The fallback matters because
 * the scheduled GitHub Actions poster maintains the same message without ever
 * writing state here — on a fresh host, trusting state alone would post a
 * duplicate alongside the message that already exists.
 */
async function findLiveMessage(channel) {
  const { autoMessageId, autoChannelId } = await readState();
  if (autoMessageId && autoChannelId === config.autoChannelId) {
    const saved = await channel.messages.fetch(autoMessageId).catch(() => null);
    if (saved) return saved;
  }

  const recent = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  return recent?.find((m) => m.author.id === client.user.id && m.embeds.length > 0) ?? null;
}

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

  if (lastPrices === undefined) lastPrices = (await readState()).lastPrices ?? null;
  const prices = priceFingerprints(results);
  const previousPrices = lastPrices;
  const moved = previousPrices !== null && pricesMoved(previousPrices, prices);
  lastPrices = prices;

  const payload = { embeds: buildEmbeds(results), components: buildComponents() };
  console.log(`Prices changed — updating channel ${config.autoChannelId}`);

  const message = await publish(channel, payload);
  await writeState({
    lastPrices: prices,
    // Re-record the message: it may have been found by scanning rather than
    // read from state, e.g. on a fresh host with no data directory.
    ...(config.autoMode === 'edit' ? { autoMessageId: message.id, autoChannelId: config.autoChannelId } : {}),
  });

  if (!config.pingOnChange) return;
  if (!moved) {
    // Said out loud because "the message changed but nobody was pinged" is
    // otherwise indistinguishable from a broken ping. Name which of the two
    // harmless reasons it was, so the log cannot be read as a fault.
    console.log(
      previousPrices === null
        ? 'First update since startup — nothing to compare against yet, so not pinging.'
        : 'Message changed but no price moved (a source failed or recovered) — not pinging.',
    );
    return;
  }
  // Its own catch: a ping that fails on permissions must not be reported as
  // "auto update failed", which points at the wrong half of the job.
  await announceChange(channel).catch((error) =>
    console.error('Ping FAILED:', error.message || error),
  );
}

/** Edit the live message, or send a new one when there is none (or in post mode). */
async function publish(channel, payload) {
  if (config.autoMode === 'edit') {
    const existing = await findLiveMessage(channel);
    if (existing) {
      await existing.edit(payload);
      return existing;
    }
  }
  return channel.send(payload);
}

/**
 * Notify the channel that a price moved, then remove the notice. The mention
 * is what matters — it reaches phones and unread badges the moment it is sent —
 * so the message itself only needs to exist long enough to deliver it.
 */
async function announceChange(channel) {
  // Raw REST calls rather than channel.send()/message.delete(): the ping
  // exists only to be deleted, so there is no point building a Message object,
  // resolving caches or emitting events for it. The floor is still two round
  // trips — Discord has to hand back the message ID before it can be deleted —
  // so the elapsed time is logged to make that floor visible.
  const started = Date.now();
  const sent = await client.rest.post(Routes.channelMessages(channel.id), {
    body: {
      content: config.pingText,
      // Opt in explicitly: Discord only notifies for mention types the payload
      // allows. Users, roles and @here/@everyone are all allowed so PING_TEXT
      // can hold any of them (@here/@everyone also need "Mention Everyone").
      allowed_mentions: { parse: ['users', 'roles', 'everyone'] },
    },
  });
  const remove = () =>
    client.rest
      .delete(Routes.channelMessage(channel.id, sent.id))
      .catch((error) => console.error('Could not delete ping:', error.message || error));

  if (config.pingDeleteSeconds === 0) {
    await remove();
    console.log(`Pinged channel ${config.autoChannelId} and deleted it ${Date.now() - started}ms later`);
  } else {
    console.log(`Pinged channel ${config.autoChannelId}; deleting in ${config.pingDeleteSeconds}s`);
    setTimeout(remove, config.pingDeleteSeconds * 1000);
  }
}

/**
 * Fire one ping immediately, on demand. Prices move a few times a day at most
 * and not at all at the weekend, so without this there is no way to tell a
 * working ping from a broken one except by waiting.
 */
async function runPingTest() {
  if (!config.autoChannelId) {
    console.error('SEND_TEST_PING is set but AUTO_CHANNEL_ID is not — nothing to ping.');
    return;
  }
  const channel = await client.channels.fetch(config.autoChannelId).catch(() => null);
  if (!channel?.isTextBased?.()) {
    console.error(`SEND_TEST_PING: channel ${config.autoChannelId} is not reachable.`);
    return;
  }
  console.log(`SEND_TEST_PING: sending one test ping (${config.pingText}) — unset SEND_TEST_PING afterwards.`);
  await announceChange(channel).catch((error) =>
    console.error('TEST PING FAILED:', error.message || error),
  );
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

  const presence = buildPresence();
  if (presence) {
    // Re-assert after ready as well: the identify payload can be dropped if the
    // gateway resumes an older session.
    c.user.setPresence(presence);
    console.log(`Presence: ${config.statusType} "${config.statusText}"`);
  }
  try {
    await registerCommands(c.application.id);
  } catch (error) {
    console.error('Slash command registration failed:', error.message || error);
  }
  startAutoUpdates();
  if (config.pingTest) await runPingTest();
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand() && interaction.commandName === 'gold') {
      await interaction.deferReply();
      await interaction.editReply(await buildPayload());
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

// Many free hosts only keep a service alive if it binds an HTTP port, and some
// expect a health endpoint to poll. A Discord bot needs neither, so this starts
// only when PORT is set — locally it stays out of the way.
if (process.env.PORT) {
  const { createServer } = await import('node:http');
  createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: client.isReady() ? 'ready' : 'connecting',
        bot: client.user?.tag ?? null,
        uptimeSeconds: Math.round(process.uptime()),
      }),
    );
  }).listen(process.env.PORT, () => console.log(`Health endpoint on :${process.env.PORT}`));
}

// Free hosts sleep a web service that receives no inbound traffic, and a
// Discord bot receives none — its gateway connection is outbound. So the
// service generates its own traffic by requesting its own public URL.
//
// Render publishes that URL as RENDER_EXTERNAL_URL, so this needs no
// configuration there; KEEPALIVE_URL covers hosts that do not. Deliberately
// not dependent on the GitHub Actions schedule, which is best-effort and can
// be delayed well past the sleep threshold.
const keepaliveUrl = process.env.KEEPALIVE_URL || process.env.RENDER_EXTERNAL_URL;
if (keepaliveUrl) {
  // Every 5 minutes, not 10. The idle timer resets on each request, so with a
  // 10-minute gap a single failed ping leaves a 20-minute window and the
  // service sleeps. At 5 minutes it takes two consecutive failures to do that.
  const everyMs = 5 * 60_000;
  setInterval(() => {
    fetch(keepaliveUrl, { signal: AbortSignal.timeout(30_000) }).catch((error) =>
      console.error('Keepalive ping failed:', error.message),
    );
  }, everyMs).unref();
  console.log(`Keepalive: pinging ${keepaliveUrl} every ${everyMs / 60_000} minutes`);
}

client.login(config.token).catch((error) => {
  // The common causes are a stale token after a reset and a privileged intent
  // that is enabled in code but not in the Developer Portal. Both surface here
  // as a login rejection, so name them rather than printing a bare stack.
  console.error('FATAL: Discord login failed —', error.message);
  process.exit(1);
});
