# Deploying the gateway bot (hybrid setup)

This project runs in two halves, and they are designed to coexist:

| | Runs on | Provides | If it stops |
|---|---|---|---|
| `scripts/post.js` | GitHub Actions, every 5 min | Price updates | — |
| `src/index.js` | An always-on host | Streaming status, `/gold`, refresh button, 5-second updates | Prices keep updating via Actions |

Actions is the safety net. Deploy the gateway bot on top of it, and if the free
host sleeps, throttles or shuts down, the channel keeps updating regardless.

**Do not delete the GitHub Actions workflow when you deploy this.** Running both
is the entire point of the hybrid setup.

## They share one message on purpose

Both halves keep the *same* Discord message current. Neither stores a message
ID that the other can see, so each locates the message by scanning recent
channel history for the bot's own last embed message. A fresh host with no
`data/` directory therefore adopts the existing message instead of posting a
duplicate.

If duplicates ever do appear, `node scripts/cleanup.js` lists them and
`node scripts/cleanup.js --delete-old` removes all but the newest.

## Environment variables

Set these on the host. Never upload a `.env` file, and never bake one into an
image — hosts expose an environment variables panel for exactly this reason.

| Variable | Value | Required |
|---|---|---|
| `DISCORD_TOKEN` | your bot token | yes |
| `AUTO_CHANNEL_ID` | `1536242189967958078` | yes |
| `REFRESH_SECONDS` | `5` | no (default 15, minimum 5) |
| `AUTO_MODE` | `edit` | no |
| `PING_ON_CHANGE` | `true` | no (default true) |
| `PING_TEXT` | `@here تغيّرت أسعار الذهب 🔔` | no |
| `PING_DELETE_SECONDS` | `5` | no (default 5) |
| `STATUS_TEXT` | `/baba tm` | no |
| `STATUS_TYPE` | `streaming` | no |
| `STATUS_URL` | a twitch.tv or youtube.com URL | for the purple label |
| `STATUS_ONLINE` | `online` | no |
| `PORT` | only if the host requires a bound port | no |

`STATUS_URL` is not decoration. Discord renders the purple **Streaming** label
only when the activity carries a twitch.tv or youtube.com link; with anything
else the status silently degrades to "Playing". The linked channel does not
have to be live.

## Option A — Render (free plan)

A `render.yaml` blueprint is included, so Render can configure the service
itself.

1. Sign in at [render.com](https://render.com) with GitHub.
2. **New → Blueprint**, pick `tmm511/saudigold`, and Render reads `render.yaml`.
3. It will prompt for the two values marked `sync: false` —
   `DISCORD_TOKEN` and `AUTO_CHANNEL_ID`. Everything else is preset.
4. Deploy, then open the service log. `Presence: streaming "/baba tm"` means
   it is live.

### The catch, and how it is handled

Render's free plan covers **web services only** — background workers are paid.
A Discord bot is naturally a worker, so it is deployed as a web service and
binds the health endpoint that the bot exposes when `PORT` is set. Render sets
`PORT` automatically, so this needs no code change.

Free web services **sleep after roughly 15 minutes without inbound HTTP
traffic**, and a Discord bot receives none, so it would sleep and the status
would disappear. The scheduled GitHub Actions job doubles as the keepalive:
set a repository **variable** (not a secret) named `RENDER_URL` to the service
URL under *Settings → Secrets and variables → Actions → Variables*, and every
run pings it. The step is skipped when the variable is unset, and a failed ping
never fails the price update.

Two things to be honest about:

- Keeping a free service awake with external pings works against the spin-down
  the free plan is built around. It is widely done and not currently blocked,
  but it is Render's call to change, not a guarantee.
- The free plan allows 750 instance hours per month, which covers one service
  running continuously (744 hours in a 31-day month). Running a second free
  service alongside it would exceed that.

This is exactly why the hybrid setup matters: if Render sleeps, throttles, or
drops its free plan, GitHub Actions keeps the prices updating. Only the status
would be lost.

## Option B — a free Discord bot host

Hosts aimed specifically at Discord bots (bot-hosting.net and similar) are
usually the least friction: no credit card, and they expect a long-running
process rather than a web service.

1. Sign in with Discord and create a server/instance, runtime **Node.js 18+**.
2. Point it at `https://github.com/tmm511/saudigold` (or upload the folder,
   excluding `node_modules` and `.env`).
3. Install command: `npm ci --omit=dev` — start command: `node src/index.js`.
4. Add the environment variables from the table above.
5. Start it, then open the console log.

Free tiers on these hosts change often, and some require a periodic click to
keep an instance alive. Check the current terms when you sign up.

## Option C — any host that accepts a Dockerfile

A `Dockerfile` is included, so anything Docker-based works without changes.
Point the platform at the repo, let it build, and set the environment
variables. If the platform insists on a bound HTTP port, set `PORT` and the bot
exposes a health endpoint at `/` reporting `ready`/`connecting` and uptime;
without `PORT` no server starts.

## Option D — a free VM

On a persistent VM, keep it running with a process manager:

```bash
npm ci --omit=dev
npm i -g pm2
pm2 start src/index.js --name saudigold
pm2 save
pm2 startup
```

`pm2 startup` prints a command to run once so the bot survives reboots.

## Verifying the deployment

A host reporting "running" only means the process started. Check the things
that actually matter:

1. The bot shows **Streaming /baba tm** in the member list. If it says
   "Playing" instead, `STATUS_URL` is missing or is not a twitch/youtube link.
2. The host's console log shows `Presence: streaming "/baba tm"`.
3. `node scripts/verify.js` (run anywhere with the token) reports a recent
   `Last edited` timestamp.
4. Only one bot message exists — confirm with `node scripts/cleanup.js`.

`/gold` can take up to an hour to appear the first time, because commands are
registered globally when `GUILD_ID` is unset. Setting `GUILD_ID` to your server
ID makes registration instant.
