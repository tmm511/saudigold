# Saudi Gold Discord Bot

Posts live Saudi gold prices in Discord, one embed per source:

| Source | What it gives |
|---|---|
| [saudigoldprice.com](https://saudigoldprice.com/) | Ounce buy/sell + gram prices for karat 24/22/21/18, plus the change vs. the previous day |
| [ounce.com.sa](https://ounce.com.sa/%D8%A3%D8%B3%D8%B9%D8%A7%D8%B1-%D8%A7%D9%84%D8%B0%D9%87%D8%A8/) | Gram prices for karat 24/22/21/18 + trend, read from the site's own live JSON API |

Each message carries a **🔄 تحديث • Refresh** button, and the bot can keep one
message permanently up to date in a channel.

## Setup

1. **Create the bot** — [Discord Developer Portal](https://discord.com/developers/applications)
   → New Application → Bot → *Reset Token* and copy it.
2. **Invite it** — OAuth2 → URL Generator → scopes `bot` + `applications.commands`,
   bot permissions: *Send Messages*, *Embed Links*, *Read Message History*.
3. **Configure**:

```bash
copy .env.example .env
```

Fill in `DISCORD_TOKEN`. Optionally set `GUILD_ID` (your server ID) so `/gold`
appears immediately instead of waiting up to an hour for global registration.

4. **Install and run**:

```bash
npm install
```

```bash
npm start
```

## Usage

- `/gold` — slash command, works anywhere the bot can see.
- `!gold` / `!ذهب` — text commands. Off by default; set
  `ENABLE_PREFIX_COMMANDS=true` **and** enable *Message Content Intent* in the
  Developer Portal (Bot → Privileged Gateway Intents), otherwise login fails.
- **🔄 Refresh button** — re-fetches both sources and edits the message in place.

## Automatic updates

Set `AUTO_CHANNEL_ID` to a channel ID (Discord → User Settings → Advanced →
Developer Mode, then right-click the channel → Copy Channel ID):

```env
AUTO_CHANNEL_ID=123456789012345678
REFRESH_MINUTES=30
AUTO_MODE=edit
```

- `AUTO_MODE=edit` — posts one message and keeps editing it, so the channel
  stays clean. The message ID is remembered in `data/state.json`; delete that
  file to start a fresh message.
- `AUTO_MODE=post` — sends a new message every cycle.

Both sites update roughly every minute, but they're scraped sites — a refresh
interval under ~5 minutes is inconsiderate and gains you very little.

## Checking the scrapers without Discord

```bash
npm run test:scrape
```

Fetches both sources, prints the parsed prices, and builds the actual Discord
embed payload — so a layout change on either site shows up here first, no token
needed.

## Layout

```
src/
  index.js       Discord client, /gold command, refresh button, auto-update loop
  config.js      .env parsing and validation
  prices.js      fetches all sources concurrently; one failure never blocks the other
  embeds.js      builds the Discord embeds and the refresh button
  http.js        fetch helpers with charset detection (both sites serve Arabic)
  numbers.js     Arabic-Indic digit normalisation and SAR formatting
  state.js       remembers the auto-update message ID
  sources/
    saudigoldprice.js   HTML scrape (tables located by content, not position)
    ounce.js            JSON API with an HTML scrape as fallback
scripts/
  test-scrape.js
```

## If prices stop showing

The embed will say which source failed and why instead of going silent. Both
scrapers are written defensively — tables are found by the Arabic text they
contain rather than by index, because saudigoldprice.com reorders its tables
between requests. If a site redesigns, run `npm run test:scrape` and adjust the
matching in the relevant file under `src/sources/`.

Prices are scraped from third-party sites and are informational only.
