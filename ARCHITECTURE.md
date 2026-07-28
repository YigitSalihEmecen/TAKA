# TAKA — repository guide

Everything an agent (or a future me) needs to work in this repo confidently:
what it is, where things live, why they are shaped that way, and how to add to
it without breaking anything.

Read this top to bottom once. After that, the section index below is enough.

- [1. What this project is](#1-what-this-project-is)
- [2. Stack and commands](#2-stack-and-commands)
- [3. Directory map](#3-directory-map)
- [4. The central idea: server-authoritative views](#4-the-central-idea-server-authoritative-views)
- [5. `shared/` — rules and wire format](#5-shared--rules-and-wire-format)
- [6. `server/` — the referee](#6-server--the-referee)
- [7. `src/` — the browser app](#7-src--the-browser-app)
- [8. The design system](#8-the-design-system)
- [9. How to add a new game](#9-how-to-add-a-new-game)
- [10. How to change Durak](#10-how-to-change-durak)
- [11. Common tasks, mapped to files](#11-common-tasks-mapped-to-files)
- [12. Testing](#12-testing)
- [13. Conventions and gotchas](#13-conventions-and-gotchas)
- [14. Things deliberately not done](#14-things-deliberately-not-done)

---

## 1. What this project is

**TAKA** — named after the small wooden fishing boats of Türkiye's eastern Black
Sea coast. A private webapp where **exactly two people** play turn-based games
against each other over the internet. Made by Yiğit, for Sofia. Not a product:
no accounts, no database, no scoreboard, no matchmaking.

The copy throughout is written in that voice — first person, addressed to the
two of them. `src/lib/people.ts` holds the two names and works out who is on the
other side of the table from the name you set, so the UI can say "send this to
Sofia" or "send this to Yiğit" as appropriate. Keep new copy in that register;
do not drift back to product language.

Two games so far: **Durak**, the Russian card game, ported from an earlier Godot
implementation at `~/Documents/GODOT/durak`; and **Backgammon**, played by
Turkish (tavla) rules.

Design brief: Anthropic's visual language — warm paper, ink, one clay accent,
serif display type, generous motion. Explicitly *not* a standard-looking webapp.

Two play modes, sharing one board component:

| Mode | Route | Backend |
|---|---|---|
| Together, over the internet | `#/t/ABCD` | WebSocket to the Node server |
| Alone, against a bot | `#/g/durak/solo` | The same engine running in the tab |

---

## 2. Stack and commands

- **React 18 + TypeScript**, bundled by **Vite 6**
- **framer-motion** for all animation (layout animations do the card movement)
- **Express 4 + ws** for the server
- **tsx** to run TypeScript on the server directly — there is no server build step
- No CSS framework. No state library. No router library. No test framework.

```bash
npm install

npm run dev          # Vite on :5173, game server on :8787 (concurrently)
npm run dev:client   # just Vite
npm run dev:server   # just the game server

npm run build        # tsc --noEmit, then vite build -> dist/
npm start            # production: ONE process serves dist/ and the WebSocket
npm run preview      # build + start

npm run test:rules   # 400 bot-vs-bot games, invariants asserted
npm run test:net     # two fake browsers play a real game against the real server
```

**Dev vs production wiring.** In dev, Vite serves the app and proxies `/ws` and
`/api` to `localhost:8787` (see `vite.config.ts`). In production, Express serves
`dist/` *and* hosts the WebSocket on the same port, so there is one origin and no
CORS. `server/index.ts` branches on `NODE_ENV === 'production'` for this.

**Path aliases** (declared in both `tsconfig.json` and `vite.config.ts` — keep
them in sync):

- `@shared/*` → `shared/*`
- `@/*` → `src/*`

Imports use explicit `.ts` / `.tsx` extensions (`allowImportingTsExtensions`),
because `tsx` runs the server files unbundled and needs real specifiers.

---

## 3. Directory map

```
.
├── index.html                  Vite entry; fonts, favicon, PWA meta
├── public/                     copied verbatim into dist/
│   ├── manifest.webmanifest    Add-to-Home-Screen: name, icons, standalone
│   ├── mark.svg                the boat, used as the card-back crest mask
│   ├── favicon.svg             boat on a clay tile
│   ├── icon-256.png            generated with headless Chrome (see below)
│   ├── icon-512.png
│   └── apple-touch-icon.png
├── vite.config.ts              aliases + dev proxy for /ws and /api
├── tsconfig.json               strict, noUnusedLocals, verbatimModuleSyntax
├── Dockerfile, fly.toml        Fly.io deploy
├── render.yaml                 Render blueprint deploy
├── README.md                   short orientation
├── DEPLOY.md                   how to get it online, and how online behaves
├── ARCHITECTURE.md             this file
│
├── shared/                     imported by BOTH server and browser
│   ├── protocol.ts             WebSocket message types, room-code alphabet, emotes
│   └── games/
│       ├── types.ts            GameDefinition contract, Seat, GameMeta, GameOutcome
│       ├── cards.ts            deck building, seeded RNG, shuffle, card encoding
│       ├── registry.ts         GAMES / GAME_LIST / UPCOMING
│       ├── durak/
│       │   ├── rules.ts        pure predicates (beats, canAttackWith, …)
│       │   └── index.ts        the Durak state machine + bot
│       └── backgammon/
│           ├── rules.ts        board maths, move generation, bearing off
│           └── index.ts        the Backgammon state machine + bot
│
├── server/
│   ├── index.ts                HTTP + WebSocket, message handling, heartbeat
│   ├── rooms.ts                room creation, seating, reconnect grace, sweep
│   ├── simulate.ts             bot-vs-bot invariant checker
│   └── e2e.ts                  scripted two-client integration test
│
└── src/
    ├── main.tsx                React root; imports base.css then app.css
    ├── App.tsx                 route switch, theme, name, online session owner
    ├── lib/
    │   ├── router.ts           hash router (Route type, useRoute, navigate)
    │   ├── theme.ts            light/dark, persisted, sets data-theme
    │   └── identity.ts         the player's name, useSyncExternalStore store
    ├── net/
    │   ├── session.ts          the Session interface both backends satisfy
    │   ├── useOnlineSession.ts WebSocket backend (+ reconnect, + createTable/joinTable)
    │   └── useSoloSession.ts   local backend with the bot in seat 1
    ├── components/
    │   ├── Gate.tsx            passphrase door, shown only on a private server
    │   ├── TopBar.tsx          brand, back arrow, breadcrumb, theme toggle, room pill
    │   ├── Home.tsx            hero + the shelf of game cards
    │   ├── Setup.tsx           one game: open a table / play the bot / join by code
    │   ├── Table.tsx           online room: waiting room, then the board
    │   ├── SoloTable.tsx       solo room: straight to the board
    │   ├── NameField.tsx       the inline name input
    │   └── icons.tsx           hairline SVG icons
    ├── games/
    │   ├── registry.tsx        game id -> board component + "how it plays" copy
    │   ├── backgammon/
    │   │   ├── BackgammonBoard.tsx  points, bar, dice, bearing off
    │   │   └── backgammon.css
    │   └── durak/
    │       ├── DurakBoard.tsx  the whole board (fans, table, actions, curtain)
    │       ├── PlayingCard.tsx one card, face or back
    │       ├── dealing.ts      shuffle/deal phase clock + fly-from-deck geometry
    │       └── durak.css       board styles only
    └── styles/
        ├── base.css            design tokens, reset, typography, grain overlay
        └── app.css             shell, home, setup, waiting room, buttons
```

---

## 4. The central idea: server-authoritative views

**This is the one thing to understand before changing anything.**

The server holds the authoritative game state and **never sends it to a client**.
Instead, for each player it calls `def.view(state, seat)` and sends the result.
A Durak view contains your own hand, the *count* of your opponent's cards, the
table, the trump, and whose turn it is — never the deck order, never their cards.

Consequences that shape the whole codebase:

1. **Clients send intent, not state.** `{ t: 'action', action: { type: 'attack',
   card: '7H' } }`. The server re-validates through `def.reduce`, which is the
   only place a state transition can happen.
2. **Legality predicates take a "context", not a state.** `shared/games/durak/
   rules.ts` functions accept a `TableContext` (trump suit, table, round,
   defenderTaking) plus a *count* of the other hand. That context can be built
   from either the full state (server) or a view (client), so the UI lights up
   legal moves with the exact code that enforces them. One source of truth.
   `ctxOfView()` in `shared/games/durak/index.ts` is the bridge.
3. **The bot cannot cheat**, because `def.bot(view)` receives a view.
4. **Solo and online are the same board.** Both backends satisfy the `Session`
   interface in `src/net/session.ts`, so `DurakBoard` has no idea which it is
   talking to and contains zero networking code.

If you ever find yourself wanting to send full state to the client, stop — that
is the bug, not the fix.

---

## 5. `shared/` — rules and wire format

Imported by both sides. Must stay free of Node APIs and of DOM APIs.

### `shared/games/types.ts`

The contract. Every game implements:

```ts
interface GameDefinition<S, A, V> {
  meta: GameMeta;                                  // catalogue entry for the lobby
  create(seed: number): S;                         // deterministic setup
  reduce(state: S, seat: Seat, action: A): ReduceResult<S>;   // {ok:true,state} | {ok:false,error}
  view(state: S, seat: Seat): V;                   // redact to what this seat may see
  outcome(state: S): GameOutcome | null;           // null while playing
  autoplay?(state: S, seat: Seat): A | null;       // forced moves, if any
  bot?(view: V): A | null;                         // optional opponent
  botDelay?: number;                               // ms of fake thinking
}
```

- `Seat` is `0 | 1`. `otherSeat(s)` flips it.
- `GameMeta.available: false` renders the game greyed out in the lobby and makes
  the server refuse to create rooms for it.
- `GameOutcome.headline` may contain the tokens `{winner}` and `{loser}`; the UI
  substitutes real player names (see `Curtain` in `DurakBoard.tsx`). The engine
  does not know anybody's name.
- `reduce` **must be pure** and must reject anything illegal. It is the security
  boundary.

### `shared/games/cards.ts`

Generic deck toolkit for any card game.

- A `Card` is a **string**: rank digits + suit letter — `"6S"`, `"10H"`, `"14D"`.
  Ranks are numbers 2–14 (11=J, 12=Q, 13=K, 14=A); `labelOf()` renders the face.
  Strings mean cards serialise for free and compare with `===`, which is what
  makes them usable as React keys.
- `buildDeck(36 | 52)`, `shuffle(arr, rng)`, `makeRng(seed)` (mulberry32 — same
  seed, same shuffle, so bugs are reproducible), `bySuitThenRank`, `byRankThenSuit`.

### `shared/games/durak/rules.ts`

Pure predicates, no state mutation. `beats`, `canAttackWith`, `canDefendWith`,
`canTransferWith`, `canEndBout`, `canTake`, `undefendedPairs`, `allDefended`,
`ranksOnTable`, `attackLimit`, `cardValue`.

Variant implemented: two-handed *podkidnoy durak* with *переводной* (transfer).
36 cards, six-card hands, opening bout capped at five cards, later bouts at six.

### `shared/games/durak/index.ts`

The state machine, ~390 lines. Key parts:

- `DurakState` — `deck` (index 0 draws next, **last element is the exposed
  trump**), `hands: [Card[], Card[]]`, `table: Pair[]`, `discardCount` (a number;
  discarded cards are never needed again), `attacker`, `defenderTaking`, `round`,
  `outcome`, `log`.
- `DurakAction` — `attack | defend | transfer | take | done | sort`.
- `DurakView` — what a player sees, including `toAct`.
- `whoseTurn(state)` — **strict alternation**. Real Durak lets the attacker throw
  cards in at any moment; that reads badly on a screen, so the defender holds the
  turn while anything is unbeaten and the attacker holds it otherwise. `reduce`
  enforces it. `sort` is exempt (it is bookkeeping, not a move).
- `resolveBout(state, taken)` — clears the table, refills **attacker first**, then
  decides the outcome, then swaps roles if the bout was beaten.
- `durak.bot(view)` — cheap cards first, holds back high trumps until the deck is
  spent, prefers a cheap transfer, yields rather than burning a big trump on a low
  card early.
- `tidyHand(hand, trumpSuit, mode)` — used by the "Tidy" button.

**Hand order is authoritative state.** Sorting sends a `sort` action so the order
survives a reconnect.

**Game-over is checked only inside `resolveBout`.** The Godot original checked it
every turn tick and could declare a winner mid-bout while cards were still
unbeaten. Do not move that check.

### `shared/games/registry.ts`

`GAMES` (id → definition), `GAME_LIST` (lobby order), `UPCOMING` (placeholder
`GameMeta`s that render as dashed "in the works" cards), `getGame(id)`.

### `shared/protocol.ts`

Message unions in both directions, plus `WS_PATH`, `ROOM_ALPHABET`
(no `O/0/I/1` — codes get read aloud), `ROOM_CODE_LENGTH`, `EMOTES`, `PlayerInfo`.

Client → server: `hello | create | join | leave | rename | action | rematch | emote | ping`
Server → client: `welcome | room | view | rematch | emote | left | error | pong`

---

## 6. `server/` — the referee

### `server/rooms.ts`

Pure bookkeeping; knows nothing about Durak.

- A `Room` has a code, a game definition, one `state`, a `rev` counter, up to two
  `Occupant`s, and a `rematchBy` seat.
- `seatClient(room, clientId, name, send)` — reclaims an existing chair if the
  `clientId` matches (this is how reconnect works), otherwise takes a free seat,
  otherwise returns `{ error }`.
- **Grace period**: `GRACE_MS = 10 minutes`. A dropped player's chair is held that
  long. `ROOM_TTL_MS = 6 hours`. `sweep()` runs on the heartbeat and deletes empty
  rooms after a minute of quiet.
- Rooms live in a module-level `Map`. **This is single-process by design** — do
  not run two instances behind a load balancer without a shared store.

### `server/index.ts`

- `GET /api/health` → `{ ok, rooms, uptime, locked }`. Used as the deploy health
  check; `locked` reports whether a passphrase is configured.
- In production: serves `dist/` with immutable caching for `/assets/*` and
  `no-cache` for everything else, and falls back to `index.html` for deep links.
- `WebSocketServer` on `/ws`.
- `handle(session, msg)` is the whole protocol switch. Points worth knowing:
  - `action` is refused unless **both** occupants are currently connected.
  - After a successful action it calls `pushViews(room)`, which sends each seat
    its own freshly-computed view. Views are never broadcast identically.
  - `rematch` is a two-sided handshake: first press records `rematchBy`, the
    second from the *other* seat calls `restart(room)`.
- 30-second ping/pong heartbeat terminates dead sockets and runs `sweep()`.

Adding a message type means editing `shared/protocol.ts` and this switch.

### The optional passphrase

`TAKA_PASSPHRASE` (env var, unset by default). When set:

- `Session.authed` starts `false`; `hello` must carry a matching `pass` or the
  server replies `{t:'error', code:'auth', fatal:true}` and closes the socket.
- Every message except `hello` and `ping` is refused while unauthed.
- Client side: `useOnlineSession` sends `getStoredPass()` in `hello`, and on an
  `auth` error sets `locked` **without clearing `intent`** — so unlocking resumes
  whatever the player was trying to do.
- `Gate.tsx` renders as a **fixed overlay above the app**, never as a replacement
  screen. Replacing the tree unmounts `Setup` and loses its `creating` flag, which
  breaks the navigate-to-table-on-create effect. This was a real bug; keep it an
  overlay.
- Stored in `localStorage` under `taka.pass`, so it is asked once per device.

---

## 7. `src/` — the browser app

### Routing — `src/lib/router.ts`

Hash-based, ~50 lines, no dependency. Hashes are used precisely so a static host
serving one file still deep-links.

| Hash | Route |
|---|---|
| `#/` | `{ name: 'home' }` |
| `#/g/durak` | `{ name: 'setup', gameId }` |
| `#/g/durak/solo` | `{ name: 'solo', gameId }` |
| `#/t/ABCD` | `{ name: 'table', code }` |

`#/t/ABCD` is the shareable invite link. `useRoute()` subscribes to `hashchange`;
`navigate(route)` sets `location.hash`; `hrefFor(route)` builds the string.

### The `Session` interface — `src/net/session.ts`

The seam that makes solo and online interchangeable:

```ts
interface Session<V> {
  kind: 'online' | 'solo';
  status: ConnectionStatus;
  room: RoomInfo | null;      // code, gameId, your seat, players
  view: V | null;
  rev: number;                // bumped on every new view — good animation key
  error: string | null; dismissError(): void;
  bothPresent: boolean;
  send(action: unknown): void;
  rematch(): void; rematchPending: Seat | null;
  emote(kind): void; emotes: EmoteEvent[];
  leave(): void;
}
```

Also holds `getClientId()` — a UUID in `localStorage` under `taka.clientId`.
**That id is the seat identity.** Two tabs in one browser profile are the same
person and will fight over one chair; that is expected, not a bug.

### `useOnlineSession(name)` — `src/net/useOnlineSession.ts`

Adds `createTable(gameId)`, `joinTable(code)`, `setName(n)` to `Session`.

- **Connects lazily.** Nothing opens until you create or join.
- **Replays intent on reconnect.** `intent.current` is `{kind:'create'|'join'}`;
  on `open` it re-sends it. Once a `room` message arrives, the intent is rewritten
  to `join` with that code so a reconnect rejoins rather than dealing a new table.
- **Backoff** capped at 8s, plus a wake handler on `visibilitychange` and `online`
  — phones report a dead socket as open after sleeping.
- `closing.current` is reset **in the effect body**, not only in cleanup. React
  18 StrictMode double-invokes effects; without the reset the flag latched on and
  permanently disabled reconnection. This was a real bug that left the *second*
  player stuck on "Finding the table…" forever. Do not remove that line.

### `useSoloSession(gameId, name)` — `src/net/useSoloSession.ts`

Runs `def.create/reduce/view` locally, you in seat 0, the bot (`BOT_NAME = 'Zoya'`)
in seat 1. An effect computes `def.bot(def.view(state, 1))` and, if non-null,
applies it after `botDelay`. Because the effect re-runs on every state change, the
bot naturally takes consecutive turns (attack, then close the bout).

State is stored **boxed** as `{ s: unknown }`: React treats a bare function-valued
state as an updater, and `unknown` defeats the type narrowing, so the box keeps
`setState` honest.

### `App.tsx`

Owns the theme, the name, and the single `useOnlineSession` instance (so it
survives route changes). Renders `TopBar` plus an `AnimatePresence mode="wait"`
fade between screens keyed by `hrefFor(route)`.

### Screens

- **`Home.tsx`** — hero, animated suit row, `NameField`, then the shelf built from
  `GAME_LIST` and `UPCOMING`. Unavailable games render dashed and disabled.
- **`Setup.tsx`** — one game: *Open a table* (calls `createTable`, then an effect
  navigates to `#/t/CODE` once `online.room` arrives), *Play Zoya*, a join-by-code
  form, and the "How it plays" accordion sourced from `src/games/registry.tsx`.
- **`Table.tsx`** — joins by code (guarded by an `asked` ref *and* re-asks if
  `status` falls back to `idle`), shows `WaitingRoom` until both chairs are filled
  once, then the board. A `banner` appears if the opponent later drops.
- **`SoloTable.tsx`** — thirteen lines: make a solo session, render the board.

### `src/games/registry.tsx`

`GAME_UI: Record<string, { Board, howToPlay }>`. This is the client-side half of
the catalogue and the reason `shared/` stays free of React.

### `DurakBoard.tsx` — the board

One file, ~550 lines, structured as: derived state → interaction handlers →
status prose → JSX → small local components (`SeatPlate`, `DeckCorner`,
`DiscardCorner`, `EmoteRail`, `EmoteLayer`, `Curtain`).

**Interaction model** — tap-based, because it must work on a phone:

- Attacking: tap a card. If legal it is played immediately.
- Defending: tap a card.
  - Exactly one card it can beat, and it cannot transfer → played immediately.
  - It can only transfer → transferred immediately.
  - Ambiguous (several targets, or it can both beat and transfer) → the card is
    *selected*; legal targets glow (`.is-target`) and a "Pass it on ↷" button
    appears. Tap a glowing card to defend, or the button to transfer.
- `selected` clears whenever `session.rev` changes.
- Cards you cannot play get `.is-muted`; cards you can get `.is-live`.

**Animation** — every card that appears is told explicitly where to come *from*.
`DurakBoard` keeps a `prev` ref holding the previous view's hand, table, hand
size, opponent count and discard count, and compares against it:

| A card appears… | …flying from |
|---|---|
| on the table, and it was in your hand | your fan |
| on the table, and it was not | the opponent's fan |
| in your hand, and the table was just *taken* | the table |
| in your hand otherwise | the deck |

"The table was taken" is distinguished from "the bout was beaten" by whether
`discardCount` went up — a beaten bout goes to the discard and both hands then
refill from the stock, which is a different animation.

> **Do not replace this with `layoutId`.** It was written that way first and it
> was wrong: hand cards live inside fan slots that framer rotates, and layout
> projection cannot survive a rotated ancestor. Cards jumped to the table and
> then snapped into position. The same bug hit table cards, which carried both
> a `layoutId` and a `rotate`, inside a `.bout` wrapper that was also animating
> its scale on enter. Explicit origins are immune to all of it.

**The table is a fixed grid, not a centred row.** `.tabletop` is a six-column
grid of fixed-width tracks, and bouts are assigned columns from `SLOT_COLUMNS`
(`[3,4,2,5,1,6]` — centre-outwards, so the table still reads as centred at any
count). This is load-bearing:

> A centre-justified flex row re-positions every card already on the table each
> time a new one is laid. The first card would land dead centre and then slide
> ~65px sideways when the second arrived, while the second flew towards a target
> that was still moving. That is the "flies to the middle, then teleports and
> snaps into place" bug. With fixed columns a slot's position is constant for
> the whole game — verified by asserting each column reports exactly one x
> coordinate across a full game.

Each bout sets **both** `gridColumn` and `gridRow: 1`. The row is not optional:
with only a column set, grid auto-placement refuses to move backwards along a
row, so a centre-outwards order (3, 4, 2, 5 …) spills onto new rows and the
table renders as a staircase instead of a row.

`flyOntoSlot()` derives a slot's centre by reading the used track sizes back out
of `gridTemplateColumns`, so the geometry is never duplicated in JavaScript.

Two supporting details that are load-bearing:

- A hand card's `exit` is instantaneous. Its table copy takes over from exactly
  the same point, so any fade would read as a duplicate card.
- `.board__felt` is a centred flex **column**: status line, then table. The
  status line used to be absolutely positioned over the felt, which the wider
  grid then collided with.
- The defence card is offset with `left`/`top`, not `translate`. A transform on
  a card that framer is animating gets measured into the projection and applied
  twice.

`overlap(n, base)` tightens the fan as a hand grows past six cards, so a
twelve-card hand does not run off the screen.

---

### Dealing: the shuffle and the fly-from-deck

`src/games/durak/dealing.ts` owns two separate things.

**`useDealSequence(view)`** returns `'shuffle' | 'deal' | 'ready'`. It detects a
fresh deal by its exact fingerprint (round 1, empty table, no discards, six and
six) and runs a clock: 1250ms of riffle, then 950ms of dealing. The phase is
also the initial state, so a freshly dealt game never flashes its cards before
the shuffle begins. It re-arms when the fingerprint goes false, which is what
gives a rematch its own shuffle.

> Both timers are set and cleared **together**, on purpose. An earlier version
> keyed the effect on `phase`; the shuffle→deal transition then re-ran the
> effect and its cleanup cancelled the deal→ready timer, leaving the board stuck
> mid-deal forever. Do not re-introduce a `phase` dependency there.

The phase is published as `data-phase` on `.board`, and CSS uses it to fade the
deck, the discard pile and the table felt out of the way while the shuffle has
the stage.

**`flyFromDeck(...)`** returns the `{x, y}` offset that places a fan slot on top
of the deck, so a card entering a hand appears to come *out of the stock*. It is
applied to the `initial` of every hand card — not just during the opening deal —
which is what makes mid-game replenishment look dealt. Flexbox means a slot's
position is unknown before it renders, so the slot centre is reconstructed
analytically from the same `overlap()` fraction the CSS margins use, with the
card width read back off a real card in the deck (`DECK_CARD_SCALE` mirrors
`.pcard--small`).

Cards moving hand→table or table→hand are handled by the same `initial`
mechanism with a different origin — see the table in §7. Nothing in this board
relies on framer's shared-layout (`layoutId`) transitions.

## 8. The design system

`src/styles/base.css` holds every token. Change colour there, nowhere else.

- **Palette**: `--paper`, `--paper-deep`, `--surface`, `--felt`; ink ramp `--ink`,
  `--ink-soft`, `--ink-faint`, `--ink-ghost`; one UI accent `--clay`
  (+ `--clay-wash`, `--clay-line`). Dark mode overrides the same names under
  `[data-theme='dark']`.
- **A four-colour deck**: `--suit-s` slate, `--suit-h` terracotta, `--suit-d`
  ochre, `--suit-c` olive. `PlayingCard` sets `data-suit` and the CSS turns that
  into a `--suit` custom property which tints the **whole card** — face wash,
  edge, corner index, pip and a solid colour band down the left edge (that band
  is what keeps a fanned hand readable when only a sliver of each card shows).
  These four are the only colours besides clay; do not add more.
- **The mark**: `--taka-mark` is the boat as an inline SVG data URI, used as a
  CSS mask by `.mark` (top bar, gate) and by `.pcard__crest` (card backs), so it
  always takes `currentColor`.
- **Type**: `--display` = Newsreader (serif, headings and card ranks),
  `--ui` = Inter. Utility classes `.display`, `.serif-italic`, `.eyebrow`,
  `.muted`, `.faint`, `.tnum`.
- **Metrics**: `--card-base` is the one number that sizes every card;
  `--card-w` reads from it and `--card-h` is derived. The opponent's fan
  overrides `--card-w` to `calc(var(--card-base) * 0.84)` — the indirection
  exists so that override is not a self-referential var cycle.
- **Motion**: `--ease`, `--ease-out`. In JS, `spring` / `softSpring` at the top of
  `DurakBoard.tsx`.
- A fixed `body::before` overlays an SVG-turbulence grain — that is what stops it
  looking like flat CSS.
- `prefers-reduced-motion` is honoured globally at the bottom of `base.css`.

**CSS ordering gotcha.** `.pcard` sets width/height and lives near the bottom of
`durak.css`. `.pcard--small` is written as `.pcard.pcard--small` on purpose to
beat it on specificity — as a single class it lost on source order and every
"small" card silently rendered full size. Same trap applies to any future modifier.

---

## 9. How to add a new game

Nothing outside these three edits should be necessary. Room codes, invite links,
reconnection, the rematch handshake, emotes, the waiting room, the theme and the
solo bot runner are all game-agnostic.

**Step 1 — the engine.** `shared/games/<id>/index.ts`:

```ts
import type { GameDefinition } from '../types.ts';

export const okey: GameDefinition<OkeyState, OkeyAction, OkeyView> = {
  meta: {
    id: 'okey', title: 'Okey', subtitle: 'Türkiye · two players',
    blurb: '…', glyph: '⬢', duration: '15–30 min',
    available: true, hasBot: false,
  },
  create(seed)             { /* use makeRng(seed) so shuffles are reproducible */ },
  reduce(state, seat, act) { /* validate everything; return {ok:false,error} otherwise */ },
  view(state, seat)        { /* ONLY what this seat may see */ },
  outcome(state)           { /* null while playing */ },
};
```

Put pure legality predicates in a sibling `rules.ts` and make them take a small
context object, so the board can reuse them for hints. Follow Durak's shape.

**Step 2 — register the engine.** In `shared/games/registry.ts`, import it, add it
to `GAMES` and `GAME_LIST`, and remove the matching placeholder from `UPCOMING`.

**Step 3 — the board.** `src/games/<id>/<Id>Board.tsx` exporting a component that
takes `{ session }: BoardProps`, then add it to `GAME_UI` in
`src/games/registry.tsx` with its `howToPlay` copy.

Board checklist:

- Read `session.view`, `session.room.players`, `session.bothPresent`.
- Send with `session.send(action)`; never mutate anything locally.
- Handle `session.view === null` (still dealing) and `view.outcome` (end curtain).
- Import your own CSS file; scope class names to the game.
- Use tokens from `base.css`; do not introduce new colours.

Then run `npm run test:rules` (point `server/simulate.ts` at the new definition)
and play a game in both modes.

---

### Backgammon

`shared/games/backgammon/rules.ts` keeps the board in **one absolute frame**:
`points[0..23]`, positive for seat 0, negative for seat 1. Seat 0 travels 23→0
and bears off past 0; seat 1 travels 0→23. One frame means one set of rules to
get right — `BackgammonBoard` mirrors it for whoever is looking, via
`absOf(visual, you) = you === 0 ? visual : 23 - visual`, which puts each
player's home board bottom-right exactly as on a real board.

**Turkish rules, not international.** Two deliberate differences, both in
`shared/games/backgammon/index.ts`:

- the opening throw only decides *who starts*. The winner then rolls both dice
  fresh on their own turn, rather than playing the two single dice thrown. (The
  international rule plays them, which is what this had at first and what read
  as "broken" to a tavla player.)
- a **mars** — the loser has borne nothing off — counts double, and there is no
  separate triple "backgammon" score. `winMultiplier` returns 1 or 2 only.

Two things worth knowing:

- **Legality is computed, not trusted.** `legalMoves()` enforces the awkward
  real rules — you must play as many dice as you can, and when only one of two
  different dice is playable it must be the higher one — by searching how many
  dice remain usable after each candidate (`maxDiceUsable`). The view ships the
  resulting move list, so the board never reasons about rules and cannot offer
  an illegal move.
- **Dice live in the state.** `reduce` has to stay pure, so the state carries a
  `seed` that each roll advances.

> The bot's move ordering matters more than it looks. `movesForDie` scans points
> 0→23 for both seats, but the seats travel in *opposite* directions, so raw
> order shows one seat its front checkers first and the other its back ones.
> With ties broken by first-seen that made the two bots play visibly different
> games — seat 1 won 63% of 500 bot-vs-bot matches on a provably symmetric
> engine. The bot now sorts candidates rearmost-first in pips, which brings it
> back to ~47%. If you touch the bot, re-run that measurement.

The doubling cube is not implemented.

## 10. How to change Durak

| Change | File and place |
|---|---|
| A rule (what beats what, limits) | `shared/games/durak/rules.ts` |
| Turn order / bout resolution / dealing | `shared/games/durak/index.ts` |
| Make the bot smarter | `durak.bot()` in `shared/games/durak/index.ts` |
| Bot speed | `durak.botDelay` |
| Text on the board ("Lay your attack") | `instruction()` in `DurakBoard.tsx` |
| Card look | `PlayingCard.tsx` + `.pcard*` in `durak.css` |
| Board layout | `durak.css` (`.board`, `.board__felt`, `.tabletop`, `.fan*`, `.corner*`) |
| Rules copy in the lobby | `howToPlay` in `src/games/registry.tsx` |
| Win/lose wording | `resolveBout` in `shared/games/durak/index.ts` (`headline`, `detail`) |

Rules live in `shared/`, so a rule change automatically applies to the server, the
client's legal-move highlighting, and the bot at once. That is the point.

---

## 11. Common tasks, mapped to files

| Task | Where |
|---|---|
| Add a colour / change the palette | `src/styles/base.css` `:root` and `[data-theme='dark']` |
| Change card size everywhere | `--card-w` in `base.css` |
| Add a lobby placeholder game | `UPCOMING` in `shared/games/registry.ts` |
| Add a WebSocket message | `shared/protocol.ts` + the switch in `server/index.ts` |
| Change the reconnect grace period | `GRACE_MS` in `server/rooms.ts` |
| Change room code length/alphabet | `shared/protocol.ts` |
| Add an emote | `EMOTES` in `shared/protocol.ts` — give it `glyph` **or** `text` |
| Change the shuffle/deal timing | `SHUFFLE_MS` / `DEAL_MS` in `src/games/durak/dealing.ts` |
| Change the boat mark | `--taka-mark` in `base.css`, `public/mark.svg`, `public/favicon.svg` |
| Change who the app is by/for | `src/lib/people.ts` |
| Rename the bot | `BOT_NAME` in `src/net/useSoloSession.ts` |
| Add a route | `src/lib/router.ts` `Route`/`parseRoute`/`hrefFor` + `Screen` in `App.tsx` |
| Change the top bar | `src/components/TopBar.tsx` |
| Add an icon | `src/components/icons.tsx` (1.5px stroke, 24-unit grid) |
| Change the app icon / install name | `public/manifest.webmanifest`, `public/*.png`, `index.html` |
| Turn privacy on/off | `TAKA_PASSPHRASE` env var on the host |

---

## 12. Testing

There is no test framework on purpose; there are two scripts that assert the
things that actually break.

**`npm run test:rules`** (`server/simulate.ts`) — plays 400 Durak games and 100
Backgammon games bot-vs-bot. For Durak, after *every single move* it checks:

- all 36 cards are accounted for exactly once across deck, hands, table, discard;
- the engine never rejects a move its own bot produced;
- the idle seat cannot act out of turn;
- every game terminates (step cap 4000).

For Backgammon it checks that each seat always holds exactly fifteen checkers
across board, bar and off; that the engine never rejects its own bot's move;
that the idle seat cannot act; and that every game terminates.

Prints win distribution and average game length. Exits non-zero on any failure.

**`npm run test:net`** (`server/e2e.ts`) — two `ws` clients against the running
server (needs `npm run dev` or `npm start` first; override the target with
`TAKA_URL=ws://host/ws`). Asserts: no hand overlap between players, acting
without a room is refused, out-of-turn is refused, a full game completes with both
clients agreeing on the outcome, a dropped client reclaims its seat, a third
client is refused, the rematch handshake needs both sides, a bad code errors.

Run both plus `npx tsc --noEmit` before considering a change done.

---

## 13. Conventions and gotchas

- **TypeScript is strict**, with `noUnusedLocals` and `noUnusedParameters`. An
  unused import fails `npm run build`. Prefix intentionally-unused params with `_`.
- **`verbatimModuleSyntax`** — type-only imports must say `import type`.
- **Import extensions are required** (`'./rules.ts'`), including in `src/`.
- **Cards are strings**, and those strings are used as React keys. Never
  construct two live DOM nodes for the same card.
- **Reserved heights must include padding.** `box-sizing` is `border-box`
  globally, so a `min-height` that only covers the card leaves the fan short by
  exactly its padding while it is empty during the shuffle — which shifted every
  rule on the board when the cards landed. `.fan` derives its `min-height` from
  `--fan-pad-top`/`--fan-pad-bottom`, the same variables that set its padding.
- **Action buttons are disabled, never unmounted.** Mounting them on
  `canEndBout()` / `canTake()` made them flicker on every view the server
  pushed. Only the transfer chip appears and disappears, and only in response to
  you picking up a card.
- **`.claude/settings.local.json`** exists; do not commit secrets there.
- **`localStorage` keys**: `taka.clientId`, `taka.name`, `taka.theme`,
  `taka.pass`.
- **Emotes are `glyph` or `text`.** A `text` emote ("miu miu") is thrown across
  the board in display serif italic; a `glyph` one renders as-is. `emoteOf(kind)`
  resolves either. The palette is a popover, not a row — twelve do not fit.
- **Icons** in `public/` were generated by screenshotting an HTML swatch with
  headless Chrome (`--headless --screenshot --window-size=512,512`). Chrome
  clamps `--force-device-scale-factor` at 0.5, which is why the "192" icon is
  actually 256px and named accordingly. Regenerate the same way; there is no
  image toolchain in this repo.
- **The server refuses actions unless both players are connected**, so a solo
  reconnect looks frozen until the other side returns — that is intended.
- **Rooms are in memory.** Restarting the server drops every open table. Say so in
  any error copy rather than pretending otherwise.
- **Do not add a build step for the server.** `npm start` runs `tsx` directly;
  `Dockerfile` and `render.yaml` depend on that.
- **`npm ci --include=dev` in deploy configs is deliberate** — Vite and TypeScript
  are devDependencies and hosts that set `NODE_ENV=production` would skip them.
- **iOS viewport**: heights use `100%` chains, not `100vh`, so the URL bar does not
  clip the hand. Keep it that way.

---

## 14. Things deliberately not done

Know these before "fixing" them:

- **No database, no persistence.** Two people, ephemeral games.
- **No accounts.** The four-letter room code is the gate; an optional shared
  passphrase (`TAKA_PASSPHRASE`) adds a door. Per-user auth is out of scope.
- **No spectators, no more than two seats.** `Seat` is `0 | 1` throughout.
- **No drag and drop.** Tap-to-play is more reliable on phones; the Godot original
  used dragging and it does not survive touch well.
- **No sound.** It gets played in bed, late, next to someone asleep.
- **No doubling cube** in backgammon, and no match play — single games only.
- **Negative CSS grid gaps do nothing** — gaps cannot be negative. Overlap by
  making the tracks narrower than the items instead.
- **Do not override `--card-w` on a subtree.** `--card-h` is computed on `:root`
  from `:root`'s `--card-w` and descendants inherit that *already resolved*
  value, so overriding the width lower down shrinks cards horizontally only.
  The Durak table did this and its cards came out at aspect 2.1 against the
  hand's 1.3.
- **`.board` sets `grid-template-columns: minmax(0, 1fr)`.** A grid sizes to its
  widest row, so a hand holding a dozen cards stretched the whole board past the
  viewport — taking the table with it, whose slots then drifted.
- **The attacker cannot interject while the defender thinks** — strict alternation,
  a deliberate simplification of real Durak for on-screen clarity.
- **Single process.** Rooms are a `Map`; horizontal scaling would need a rewrite
  and will never be needed.
- **No test framework.** Two scripts cover the failure modes that matter.
