# TAKA

A *taka* is one of the small wooden fishing boats on Türkiye's eastern Black Sea
coast. This one carries card games.

Made by Yiğit, for Sofia — to play on the evenings we spend in two different
cities.

<br>

## What's inside

**Durak** — the Russian card game, ported from an earlier Godot version of mine.

**Backgammon** — the full thing: bar, hitting, bearing off, gammons. No doubling
cube.

Either one, two ways to play:

- **Together.** Open a table, send the four-letter code (or just the link), and
  you're sitting across from each other.
- **Alone.** Zoya, a bot, for when the other chair is empty.

Still to build: Batak.

<br>

## Tech

| | |
|---|---|
| Front end | React 18 + TypeScript, built by Vite |
| Animation | framer-motion |
| Server | Node, Express + `ws`, run straight from TypeScript with `tsx` |
| Styling | Plain CSS with custom properties. No framework |
| State | None. No database — games live in memory |
| Hosting | One process serves the app *and* the WebSocket |

The server is the referee: it holds the real game state and only ever sends each
player a redacted view of it, so neither of us can see the other's hand.

<br>

## Running it

```bash
npm install
npm run dev      # app on :5173, game server on :8787
```

| | |
|---|---|
| `npm run build` | Type-check and build |
| `npm start` | Production — one process, serves everything |
| `npm run test:rules` | 400 bot-vs-bot games, checking no card is ever lost |
| `npm run test:net` | Two fake browsers play a real game against the server |

<br>

## More

- **[DEPLOY.md](./DEPLOY.md)** — getting it online, free, and onto her phone.
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** — every directory and file, how to add
  a game, and the traps. Written to hand to an AI agent as context.
