# Working in this repo

**Read [`ARCHITECTURE.md`](./ARCHITECTURE.md) first.** It is the full map of the
project: what it is, every directory and file, the core design idea, how to add a
game, and the gotchas. This file is only a summary so you know what you are
looking at before you open it.

## In one paragraph

**TAKA** — named after the wooden fishing boats of the eastern Black Sea. A
private two-player game site made by Yiğit for Sofia: no accounts, no database,
exactly two seats. Durak is the only game so far, ported from a Godot original.
React + Vite in the browser, Express + `ws` on the server, TypeScript throughout,
run with `tsx` — the server has no build step.

The copy is personal, first-person, and addressed to the two of them. Match that
voice; do not write product marketing.

## The rule that governs everything

The server holds the real game state and **only ever sends each player a redacted
`view`**. Clients send intent (`{type:'attack', card:'7H'}`) and the server
re-validates through `reduce`. Legality predicates take a small context that can
be built from a state *or* a view, so the server, the UI hints, and the bot all
run the same code. Never send full state to a client.

## Before you say a change is done

```bash
npx tsc --noEmit      # strict, noUnusedLocals — an unused import fails the build
npm run test:rules    # 400 bot-vs-bot games, card conservation + legality asserted
npm run test:net      # two clients against a running server (needs npm run dev)
```

## Fast orientation

| Looking for | Go to |
|---|---|
| Game rules | `shared/games/durak/rules.ts` |
| Game state machine + bot | `shared/games/durak/index.ts` |
| The contract new games implement | `shared/games/types.ts` |
| WebSocket messages | `shared/protocol.ts` |
| Server protocol handling | `server/index.ts` |
| Rooms, seating, reconnect | `server/rooms.ts` |
| The board UI | `src/games/durak/DurakBoard.tsx` |
| Colours, suit palette, card size | `src/styles/base.css` |
| Shuffle + deal animation | `src/games/durak/dealing.ts` |
| Emotes (incl. thrown text) | `EMOTES` in `shared/protocol.ts` |
| The two names | `src/lib/people.ts` |
| Adding a game | `ARCHITECTURE.md` §9 |
| Deploying | `DEPLOY.md` |
| The optional passphrase gate | `TAKA_PASSPHRASE` in `server/index.ts`, `src/components/Gate.tsx` |

## House style

- Two players only. `Seat` is `0 | 1`. Do not generalise to N players.
- One UI accent (`--clay`) plus the four suit colours. New colours go in
  `base.css` tokens or nowhere.
- Import with explicit `.ts` / `.tsx` extensions; `import type` for types.
- Comments explain *why*, not *what*. Match the density already in the files.
- Do not add a server build step, a database, a state library, or a CSS framework.
