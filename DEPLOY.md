# Getting it online

The goal: **she taps a link on her phone and plays.** No terminal, no install, no
account, no app store. This guide gets you there in about ten minutes.

---

## What you are actually deploying

The whole app is **one process**. In production, `npm start` serves the built
front end *and* runs the WebSocket referee on the same port. One deploy, one URL,
no CORS, nothing to wire together.

That one constraint rules out **Vercel and Netlify** — they cannot hold a
WebSocket open, and this game is nothing but a WebSocket. Anything that runs a
normal Node process is fine.

---

# Part 1 — Put it on the internet

## The honest state of "free" (checked July 2026)

| | Free? | WebSockets | Catch |
|---|---|---|---|
| **Render** | **Yes, no card** | Yes | Sleeps after 15 min idle; ~30–60s to wake |
| Fly.io | **No** | Yes | Free allowances were removed in 2024. New accounts get a 2 VM-hour / 7-day trial, then a card is required |
| Railway | No | Yes | Trial credit only |
| Koyeb | No | Yes | Free Starter tier closed to new users after the 2026 Mistral acquisition |
| Vercel / Netlify | Yes | **No** | Serverless — cannot hold a socket open. Useless for this app |

So: **Render's free tier is the one to use.** It is the only platform still
offering a genuinely free, no-credit-card instance that can hold a WebSocket
open.

## Render — the whole process

1. Put this repo on GitHub (private is fine).
2. Sign in at [render.com](https://render.com) with GitHub.
3. **New → Blueprint** → pick the repo → **Apply**.

`render.yaml` in this repo already declares everything — build command, start
command, health check. First build takes 2–4 minutes. You end up at
`https://taka-xxxx.onrender.com`, and **that URL is what you send her**.

Manual setup, if you would rather not use the blueprint:

- Environment: Node
- Build command: `npm ci --include=dev && npm run build`
- Start command: `npm start`
- Health check path: `/api/health`

### What the free tier actually means for this app

**It sleeps after 15 minutes with no traffic, and takes 30–60 seconds to wake.**
That sounds worse than it is, because of one detail: the server pings every
connected client every 30 seconds, and WebSocket messages count as traffic. So:

- **It will not fall asleep during a game.** As long as either of you has the app
  open, the heartbeat keeps it awake.
- **The slow part is only the first open of the evening.** She taps the link,
  waits about a minute, and then everything is instant until you both close it.

**750 free instance-hours per month** sounds tight but is not: a 31-day month is
744 hours, so even a service that never slept would fit — as long as this is your
*only* free service on the account. Add a second one and they share the budget.

**A spin-down loses open tables.** Rooms live in memory, so if you both close the
app mid-game and leave it 15 minutes, the table is gone and you deal again. Finish
a game in one sitting, or accept the redeal.

### Killing the cold start (optional, still free)

If the one-minute wait annoys you, have something hit the health check on a
schedule. [cron-job.org](https://cron-job.org) is free and lets you set hours:

- URL: `https://your-app.onrender.com/api/health`
- Every 10 minutes, **but only between, say, 19:00 and 01:00**

That keeps it warm exactly when you play and costs about 190 of your 750 hours.
Do not ping it 24/7 "just in case" — that spends the whole monthly budget to save
a minute a day.

## If you would rather pay a little

Two or three dollars a month buys away every caveat above — no sleeping, no cold
start, no lost tables.

- **Render Starter**, $7/month: same repo, same blueprint, just change the plan.
- **Fly.io**, roughly $2–4/month for one shared-cpu-1x/256MB machine. `Dockerfile`
  and `fly.toml` are already in this repo:

  ```bash
  brew install flyctl
  fly auth signup
  fly launch --no-deploy      # say NO to overwriting fly.toml
  fly deploy
  ```

  Set `primary_region` in `fly.toml` to somewhere between the two of you: `fra`,
  `ams`, `lhr`, `cdg`, `iad`, `sjc`. `min_machines_running = 1` is already set so
  it never cold-starts.

## Anywhere else

Same shape everywhere:

| | |
|---|---|
| Build | `npm ci --include=dev && npm run build` |
| Start | `npm start` |
| Port | reads `$PORT`, defaults to 8787 |
| Health check | `GET /api/health` |

`--include=dev` matters: Vite and TypeScript are devDependencies, and hosts that
set `NODE_ENV=production` during install would skip them and the build would fail.

Behind nginx, you **must** pass the upgrade headers through:

```nginx
location / {
  proxy_pass http://127.0.0.1:8787;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
  proxy_read_timeout 3600s;
}
```

Without those two `Upgrade` lines the site loads perfectly and the game never
starts. It is the single most common way this goes wrong.

## A nicer address (optional)

`taka.yourdomain.com` reads better in a message than `taka-x7f2.onrender.com`.
Render: Settings → Custom Domain, then point a CNAME at it. HTTPS is issued
automatically, which matters — **`wss://` will not work over plain http**.

# Part 2 — Making it private

By default anyone with the URL can open a table. They still cannot join *your*
game without your four-letter code, and there is nothing to steal — no accounts,
no data, no history. For a URL nobody knows, that is genuinely fine.

If you want a real door, the app has one built in.

## The shared passphrase

Set one environment variable on the host:

```bash
# Fly
fly secrets set TAKA_PASSPHRASE="whatever you two agree on"

# Render → Dashboard → Environment → Add: TAKA_PASSPHRASE = ...
# anywhere else: just set the env var and restart
```

That is the whole setup. Now:

- The site loads, but the moment anyone tries to open or join a table they get a
  quiet **"Who is it?"** screen asking for the passphrase.
- She types it **once**. It is stored on her device and she never sees that
  screen again — not on the next game, not next month.
- Whatever she was doing resumes automatically. If she tapped your invite link,
  she lands straight at your table after typing it.

To change it later, set a new value and restart; both of you type the new one
once more.

Leave `TAKA_PASSPHRASE` unset and there is no gate at all — verify which mode
you are in with `curl https://your-app/api/health`, which reports `"locked"`.

## What this is and is not

It is a shared secret over HTTPS that keeps strangers from using your server. It
is not per-user auth, it is not encryption, and the passphrase sits in her
browser's localStorage. For two people playing cards, that is the right amount of
security. Do not reuse a password you use anywhere else.

## Stronger, if you actually want it

**Cloudflare Access** (free for up to 50 users) puts a real identity check in
front of the whole site: you allow her email address, and Cloudflare emails her a
one-time code. It is genuinely private, but she has to do the email dance
whenever the session expires. For a card game, the passphrase is the better
trade.

---

# Part 3 — Her side: making it feel like an app

This is the part that turns "a website you sent me" into "the thing we play".

## 1. Send her the link, once

Any message app. `https://your-app.fly.dev`

## 2. Have her add it to her home screen

Two taps, and afterwards it opens fullscreen with no browser bar, with the little
boat icon — indistinguishable from an installed app.

- **iPhone (Safari):** open the link → **Share** (the square with the arrow) →
  scroll → **Add to Home Screen** → **Add**.
- **Android (Chrome):** open the link → **⋮** menu → **Install app** (or *Add to
  Home screen*).

The manifest, icons and fullscreen behaviour are already in the repo (`public/`
and `index.html`), so this just works.

## 3. She sets her name once

On the home screen there is a **Playing as** field. She types her name; it is
remembered on her device and is what you see across the table.

## 4. Playing

Every game after that is:

- One of you opens Durak → **Open a table** → **Copy invite link** → send it.
- The other taps the link and is sitting down. No code to type — the code is in
  the link.
- If you would rather read it out loud, the four letters are on screen and there
  is a **Have a code?** box on the game page. The alphabet has no O/0 or I/1 for
  exactly this reason.

If nobody is around, **Play Zoya** gives her a bot opponent with no setup at all.

---

# How the online part actually behaves

Worth knowing before the first real game.

**Who knows what.** The server keeps the deck and both hands and sends each of
you only your own view. Her hand is a *number* to you and always was — there is
nothing in the browser to peek at.

**Turns.** The server refuses anything that is not your move. If she taps while
you are thinking, she gets *"It is not your turn."* and nothing moves.

**Dropping out.** Tunnels, lifts, a locked phone. The client reconnects with
backoff, and also whenever the tab becomes visible again (phones lie about socket
state after sleeping). Your chair is held for **10 minutes**. Reconnect inside
that window and you get your seat and your cards back exactly as they were; the
other player sees a "waiting for your opponent" banner meanwhile.

**One browser, one player.** Identity lives in localStorage, so two tabs in the
same browser profile are the *same person* and will fight over one seat. Use two
devices, or a private window, if you want to watch both sides.

**Rematch.** Both have to ask. First press shows "waiting for them", the second
deals a fresh hand in the same room.

**Rooms are memory-only.** Restart the server and open tables are gone —
deliberate; there is no database and nothing to back up. Empty rooms are swept a
minute after the last person leaves; everything expires after six hours.

**Scale.** Two people. Rooms live in a `Map` in one process. Do not run this
behind two instances without a shared store — but you will never need to.

**Cost.** Fly's free allowance covers one always-on shared-cpu-1x/256MB machine
comfortably. Render free is £0 with the sleep caveat. Neither will surprise you.

---

# If something breaks

```bash
curl https://your-app/api/health
# {"ok":true,"rooms":0,"uptime":123,"locked":false}
```

| Symptom | Cause |
|---|---|
| Page loads, "Finding the table…" forever | WebSocket blocked — check the proxy `Upgrade` headers, and that you are on `https` |
| "No room with that code" | The server restarted; rooms are in memory. Open a new table |
| "That room is full" | Both chairs claimed. A held seat frees itself after 10 minutes |
| Both tabs share one seat | Same browser profile — use another device |
| ~1 minute wait on first load | Render free tier waking up. Normal |
| Table vanished after a break | The instance slept and rooms are in memory. Deal again |
| "Who is it?" keeps coming back | `TAKA_PASSPHRASE` changed, or she is in a private window (localStorage is wiped) |
| Home screen icon is a screenshot | The link was opened in Chrome on iOS — Add to Home Screen only works from Safari there |

Logs: `fly logs`, or the Logs tab on Render.
