/** Explains exactly why the bot can or cannot post in AUTO_CHANNEL_ID. */
import 'dotenv/config';

const API = 'https://discord.com/api/v10';
const token = process.env.DISCORD_TOKEN?.trim();
const channelId = process.env.AUTO_CHANNEL_ID?.trim();

async function call(path) {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bot ${token}` } });
  return { ok: res.ok, status: res.status, body: await res.json().catch(() => null) };
}

const me = await call('/users/@me');
console.log(`Bot: ${me.body?.username} (${me.body?.id})`);

const guilds = await call('/users/@me/guilds');
console.log(`\nServers the bot is in (${guilds.body?.length ?? 0}):`);
for (const g of guilds.body ?? []) console.log(`  ${g.name}  —  id ${g.id}`);

const channel = await call(`/channels/${channelId}`);
console.log(`\nChannel ${channelId}: HTTP ${channel.status}`);
if (channel.ok) {
  console.log(`  name: #${channel.body.name}  type: ${channel.body.type}  guild: ${channel.body.guild_id}`);
  const inGuild = (guilds.body ?? []).some((g) => g.id === channel.body.guild_id);
  console.log(`  bot is a member of that server: ${inGuild}`);
} else {
  console.log(`  ${JSON.stringify(channel.body)}`);
  console.log('  -> The bot cannot see this channel.');

  for (const g of guilds.body ?? []) {
    const channels = await call(`/guilds/${g.id}/channels`);
    if (!channels.ok) {
      console.log(`\n${g.name}: cannot list channels (HTTP ${channels.status})`);
      continue;
    }
    const match = channels.body.find((c) => c.id === channelId);
    console.log(`\n${g.name}: ${match ? `CONTAINS the target channel (#${match.name})` : 'does NOT contain the target channel'}`);
    if (!match) {
      const textChannels = channels.body.filter((c) => c.type === 0 || c.type === 5);
      console.log('  Text channels the bot can see here:');
      for (const c of textChannels) console.log(`    #${c.name}  —  id ${c.id}`);
    }
  }
}
