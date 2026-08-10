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

## Running it 24/7 for free (GitHub Actions)

You do not need a VPS or a PC left on. [`.github/workflows/gold-prices.yml`](.github/workflows/gold-prices.yml)
runs [`scripts/post.js`](scripts/post.js) every hour on GitHub's runners.

That script talks to Discord's REST API directly instead of opening a gateway
connection, so it starts, posts, and exits in a few seconds. It finds the bot's
own most recent message in the channel and edits it, which keeps one live
message current without needing to remember a message ID between runs — the
runner is a fresh machine every time.

Setup, once:

1. Push this folder to a GitHub repo.
2. Repo → **Settings → Secrets and variables → Actions → New repository secret**,
   add two:
   - `DISCORD_TOKEN` — the bot token
   - `AUTO_CHANNEL_ID` — the channel ID
3. Repo → **Actions** tab → enable workflows → open *Gold prices* → **Run workflow**
   to confirm the first run works.

Caveats worth knowing:

- Scheduled runs are queued, not precise. An hourly cron typically fires a few
  minutes late when GitHub is busy.
- GitHub disables scheduled workflows in repos with **60 days of no activity**.
  It emails you first; clicking *Run workflow* resets the clock.
- **Minutes budget.** Public repos get unlimited Actions minutes. Private repos
  get 2,000/month, and GitHub rounds every run up to a whole minute — so the
  schedule is the budget. Hourly is ~720 minutes/month, comfortable. Every 30
  minutes would be ~1,440 and risks exhausting the allowance mid-month, which
  stops updates silently until it resets. Raise the frequency only on a public
  repo.

### Keeping the token safe

The token never enters the repository. It lives in GitHub Actions secrets,
encrypted at rest and masked in logs, and reaches the job only as an
environment variable. Locally it lives in `.env`, which `.gitignore` excludes
along with any `.env.*` variant.

If a token is ever pasted somewhere it shouldn't be — a chat, a screenshot, a
log — treat it as public and rotate it: Developer Portal → Bot → **Reset Token**,
then update the `DISCORD_TOKEN` secret and your local `.env`. Rotation is free
and instant, and it is the only thing that actually revokes a leaked token.

The trade-off: this mode posts and edits on a schedule, but there is no live
process, so `/gold` and the refresh button do not work. For those you need the
gateway bot (`npm start`) running somewhere persistent.

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
