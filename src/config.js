import 'dotenv/config';

function bool(value, fallback) {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function int(value, fallback, min = 1) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n >= min ? n : fallback;
}

export const config = {
  token: process.env.DISCORD_TOKEN?.trim(),
  guildId: process.env.GUILD_ID?.trim() || null,
  autoChannelId: process.env.AUTO_CHANNEL_ID?.trim() || null,
  // REFRESH_SECONDS wins; REFRESH_MINUTES is kept for older .env files.
  // Floored at 30s — both sites only recompute about once a minute, so polling
  // harder just hammers someone else's server for nothing.
  refreshSeconds: int(
    process.env.REFRESH_SECONDS,
    int(process.env.REFRESH_MINUTES, 1, 1) * 60,
    30,
  ),
  // "edit" keeps one live message up to date; "post" sends a new message each cycle.
  autoMode: (process.env.AUTO_MODE || 'edit').trim().toLowerCase() === 'post' ? 'post' : 'edit',
  prefix: process.env.PREFIX || '!',
  enablePrefixCommands: bool(process.env.ENABLE_PREFIX_COMMANDS, false),
};

if (!config.token) {
  console.error('Missing DISCORD_TOKEN. Copy .env.example to .env and fill it in.');
  process.exit(1);
}
