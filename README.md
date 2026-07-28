# TAKA

A *taka* is one of the small wooden boats the fishermen keep on Türkiye's eastern
Black Sea coast. This one carries card games — made by Yiğit, for Sofia, to play
on the evenings we spend in two different cities.

First game on board: **Durak**, ported from my Godot version.

- **Play together** — open a table, get a four-letter code, send it. No accounts.
- **Play alone** — Zoya, a bot that only sees what a human opponent would see.
- Light and dark, phone and laptop, one deploy.
- A four-colour deck, a riffle shuffle, and cards that fly out of the stock.
- Things to throw across the table, including "miu miu".
- Add to Home Screen and it opens fullscreen like an app.
- Optional shared passphrase (`TAKA_PASSPHRASE`) if you want the door locked.

```bash
npm install
npm run dev          # http://localhost:5173
```

---

## How it is put together

```
shared/          rules and wire format — imported by BOTH server and browser
  games/
    types.ts       the GameDefinition contract every game implements
    cards.ts       deck, shuffle, seeded RNG — shared by any card game
    registry.ts    the catalogue
    durak/
      rules.ts     pure predicates: what beats what, what may be played
      index.ts     the state machine (create / reduce / view / outcome / bot)
server/
  index.ts       express + ws; serves the built app and referees the games
  rooms.ts       four-letter rooms, two chairs, reconnect grace period
  simulate.ts    bot-vs-bot invariant checker    (npm run test:rules)
  e2e.ts         two fake browsers vs the real server (npm run test:net)
src/
  net/           two interchangeable backends behind one Session interface
  games/durak/   the board; knows nothing about networking
  styles/        design tokens, then everything else
```

### The one idea worth knowing

The server holds the real game state and **never sends it to anybody**. Each
player gets a *view* — their own hand, the other player's card *count*, the
table, the trump. Hidden information stays hidden because the client is never
told it, not because the client politely looks away.

Clients send intent (`{type:'attack', card:'7H'}`), never state. Every action
is re-validated server-side, so a tampered client can ask for illegal moves and
simply be told no.

That same `reduce`/`view` pair runs locally for solo play, with the bot reading
a view instead of the state — which is why the bot cannot cheat either, and why
both modes are literally the same board component.

### Two corrections to the Godot original

1. **End-of-game was checked mid-bout.** `check_game_over()` ran on every turn
   update, so an attacker who played their last card was declared the winner
   while their attack was still sitting unbeaten on the table. It is now checked
   only when a bout resolves.
2. **Peer-to-peer move relay drifted.** Godot sent moves between peers and each
   side applied them to its own copy. One dropped packet and the two players
   were playing different games. The server is now the single source of truth.

Hand *order* is also part of the authoritative state now, so "Tidy" survives a
reconnect.

---

## Adding a game

Three files, and nothing else in the app changes.

**1. The rules** — `shared/games/<name>/index.ts`:

```ts
export const chess: GameDefinition<State, Action, View> = {
  meta: { id: 'chess', title: 'Chess', available: true, hasBot: false, ... },
  create(seed)              { /* deal / set up, deterministically */ },
  reduce(state, seat, act)  { /* validate, return next state or an error */ },
  view(state, seat)         { /* redact to what this seat may see */ },
  outcome(state)            { /* null while playing */ },
  bot(view)                 { /* optional; sees only the view */ },
};
```

**2. Register it** — add it to `GAMES` and `GAME_LIST` in
`shared/games/registry.ts`.

**3. The board** — a React component taking `{ session }`, added to `GAME_UI` in
`src/games/registry.tsx` alongside its "how it plays" copy.

The lobby, room codes, invite links, reconnection, rematch handshake, emotes and
the solo bot runner all work immediately — none of that is Durak-specific.

Run `npm run test:rules` to have the bot play a few hundred games against itself
and check that no card is ever lost or duplicated, no illegal move is accepted,
and every game terminates.

---

## Commands

| | |
|---|---|
| `npm run dev` | Vite on :5173, game server on :8787 |
| `npm run build` | Type-check, then build to `dist/` |
| `npm start` | Production: one process serves the app **and** the sockets |
| `npm run test:rules` | 400 bot-vs-bot games, invariants checked |
| `npm run test:net` | Two fake clients play a real game over the real server |

Deployment, and how to get her playing without a terminal: see
**[DEPLOY.md](./DEPLOY.md)**.

Full repository guide (directories, every file, how to add a game, gotchas):
**[ARCHITECTURE.md](./ARCHITECTURE.md)** — written to be handed to an AI agent as
context.
