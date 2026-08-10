/**
 * Lists every message the bot has posted in the channel, newest first.
 * Pass --delete-old to remove all but the newest, which is the one both the
 * scheduled poster and the gateway bot converge on.
 */
import 'dotenv/config';

const API = 'https://discord.com/api/v10';
const token = process.env.DISCORD_TOKEN?.trim();
const channelId = process.env.AUTO_CHANNEL_ID?.trim();
const doDelete = process.argv.includes('--delete-old');

const headers = { Authorization: `Bot ${token}` };
const me = await (await fetch(`${API}/users/@me`, { headers })).json();
const messages = await (await fetch(`${API}/channels/${channelId}/messages?limit=100`, { headers })).json();

const mine = messages.filter((m) => m.author?.id === me.id && m.embeds?.length);
console.log(`Bot messages with embeds in channel: ${mine.length}\n`);
mine.forEach((m, i) => {
  console.log(`  ${i === 0 ? 'KEEP  ' : 'EXTRA '} ${m.id}  posted ${m.timestamp}`);
});

if (!doDelete) {
  console.log(`\nDry run. Re-run with --delete-old to remove the ${Math.max(0, mine.length - 1)} extra message(s).`);
  process.exit(0);
}

for (const m of mine.slice(1)) {
  const res = await fetch(`${API}/channels/${channelId}/messages/${m.id}`, { method: 'DELETE', headers });
  console.log(`Deleted ${m.id}: ${res.status === 204 ? 'ok' : `HTTP ${res.status}`}`);
  await new Promise((r) => setTimeout(r, 600)); // stay clear of the delete rate limit
}
