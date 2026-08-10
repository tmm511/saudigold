/** Confirms the live message exists and reports when it was last edited. */
import 'dotenv/config';

const API = 'https://discord.com/api/v10';
const token = process.env.DISCORD_TOKEN?.trim();
const channelId = process.env.AUTO_CHANNEL_ID?.trim();

const res = await fetch(`${API}/channels/${channelId}/messages?limit=10`, {
  headers: { Authorization: `Bot ${token}` },
});
const messages = await res.json();
const me = await (await fetch(`${API}/users/@me`, { headers: { Authorization: `Bot ${token}` } })).json();

const mine = messages.find((m) => m.author?.id === me.id && m.embeds?.length);
if (!mine) {
  console.log('No bot message with embeds found in the channel.');
  process.exit(1);
}

const edited = mine.edited_timestamp ?? mine.timestamp;
const ageSeconds = Math.round((Date.now() - new Date(edited)) / 1000);
console.log(`Message ${mine.id}`);
console.log(`Last edited: ${edited}  (${ageSeconds}s ago)`);
console.log(`Embeds: ${mine.embeds.length}`);
for (const e of mine.embeds) {
  console.log(`  ${e.title}: ${e.fields?.length ?? 0} rows — ${e.fields?.map((f) => f.value.split('\n')[0]).join(' | ')}`);
}
