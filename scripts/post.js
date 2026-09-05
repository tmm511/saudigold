/**
 * One-shot price post — no gateway connection, no long-running process.
 *
 * This is what runs on a scheduler (GitHub Actions, cron, any free runner):
 * fetch the prices, then edit the bot's own most recent message in the channel,
 * or send a new one if there isn't one. Finding the message to edit by scanning
 * recent channel history keeps this completely stateless, so it works on a
 * fresh runner every time.
 *
 * Env: DISCORD_TOKEN, AUTO_CHANNEL_ID, and optionally AUTO_MODE=post to always
 * send a new message instead of editing.
 */
import 'dotenv/config';
import { buildComponents, buildEmbeds } from '../src/embeds.js';
import { fetchAll } from '../src/prices.js';

const API = 'https://discord.com/api/v10';
const token = process.env.DISCORD_TOKEN?.trim();
const channelId = process.env.AUTO_CHANNEL_ID?.trim();
const alwaysPost = (process.env.AUTO_MODE || 'edit').trim().toLowerCase() === 'post';

if (!token) throw new Error('Missing DISCORD_TOKEN');
if (!channelId) throw new Error('Missing AUTO_CHANNEL_ID');

async function discord(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bot ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'SaudiGoldBot (https://github.com/, 1.0.0)',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });

  if (res.status === 429) {
    const retryAfter = Number((await res.json().catch(() => ({}))).retry_after ?? 5);
    console.log(`Rate limited, retrying in ${retryAfter}s`);
    await new Promise((r) => setTimeout(r, retryAfter * 1000));
    return discord(path, { method, body });
  }

  if (!res.ok) {
    // 401 has exactly one cause worth naming: the token this job was given is
    // not a token Discord recognises any more. Resetting the token in the
    // Developer Portal invalidates the previous one instantly, so a reset that
    // updated the always-on host but not this secret lands here on every run.
    if (res.status === 401) {
      throw new Error(
        'Discord rejected the bot token (401 Unauthorized).\n' +
          '  The DISCORD_TOKEN secret used by this job is stale or wrong.\n' +
          '  Fix: Developer Portal -> Bot -> Reset Token, copy it ONCE, then paste that\n' +
          '  same value into BOTH the repo secret (Settings -> Secrets and variables ->\n' +
          '  Actions -> DISCORD_TOKEN) and the always-on host\'s environment. Each reset\n' +
          '  invalidates the one before it, so resetting again for the second place\n' +
          '  breaks the first.',
      );
    }
    throw new Error(`Discord ${method} ${path} -> ${res.status} ${await res.text()}`);
  }
  return res.status === 204 ? null : res.json();
}

const me = await discord('/users/@me');
console.log(`Authenticated as ${me.username}#${me.discriminator} (${me.id})`);

const results = await fetchAll();
for (const r of results) {
  console.log(r.ok ? `  ok    ${r.meta.name}` : `  FAIL  ${r.meta.name}: ${r.error}`);
}
if (results.every((r) => !r.ok)) {
  throw new Error('Every price source failed — not posting.');
}

// components is sent explicitly so an edit clears anything left on the message
// by a previous version; omitting the field would preserve it.
const payload = { embeds: buildEmbeds(results).map((e) => e.toJSON()), components: buildComponents() };

let target = null;
if (!alwaysPost) {
  const recent = await discord(`/channels/${channelId}/messages?limit=50`).catch((error) => {
    console.log(`Could not read channel history (${error.message}) — will send a new message.`);
    return [];
  });
  target = recent.find((m) => m.author?.id === me.id && m.embeds?.length) ?? null;
}

if (target) {
  await discord(`/channels/${channelId}/messages/${target.id}`, { method: 'PATCH', body: payload });
  console.log(`Edited existing message ${target.id} in channel ${channelId}`);
} else {
  const sent = await discord(`/channels/${channelId}/messages`, { method: 'POST', body: payload });
  console.log(`Sent new message ${sent.id} in channel ${channelId}`);
}
