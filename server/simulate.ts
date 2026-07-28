/**
 * A referee for the referee.
 *
 * Runs the bot against itself over many deals and checks the invariants that
 * actually matter: every card is accounted for at all times, no move the
 * engine accepts was illegal, and every game ends. Run it with:
 *
 *     npx tsx server/simulate.ts [games]
 */

import { durak, whoseTurn, type DurakState } from '../shared/games/durak/index.ts';
import { otherSeat, type Seat } from '../shared/games/types.ts';

const GAMES = Number(process.argv[2] ?? 400);
const MAX_STEPS = 4000;

let failures = 0;
const fail = (msg: string) => {
  failures++;
  console.error(`  ✗ ${msg}`);
};

/** Every one of the 36 cards must be somewhere, exactly once. */
function auditCards(s: DurakState, where: string) {
  const seen = new Set<string>();
  let count = 0;
  const add = (c: string) => {
    if (seen.has(c)) fail(`${where}: duplicate card ${c}`);
    seen.add(c);
    count++;
  };
  s.deck.forEach(add);
  s.hands[0].forEach(add);
  s.hands[1].forEach(add);
  for (const p of s.table) {
    add(p.attack);
    if (p.defense) add(p.defense);
  }
  count += s.discardCount;
  if (count !== 36) fail(`${where}: ${count} cards accounted for, expected 36`);
}

const outcomes = { seat0: 0, seat1: 0, draw: 0 };
const lengths: number[] = [];

for (let g = 0; g < GAMES; g++) {
  let state = durak.create(g * 7919 + 13);
  let steps = 0;

  auditCards(state, `game ${g} deal`);

  while (!state.outcome && steps < MAX_STEPS) {
    const turn: Seat = whoseTurn(state);
    const view = durak.view(state, turn);
    const move = durak.bot!(view);

    if (!move) {
      fail(`game ${g}: seat ${turn} had no move at step ${steps} (table ${state.table.length}, hand ${state.hands[turn].length})`);
      break;
    }

    const res = durak.reduce(state, turn, move);
    if (!res.ok) {
      fail(`game ${g}: engine rejected its own bot's ${move.type} — ${res.error}`);
      break;
    }

    // The other seat must never be able to act out of turn.
    const idle = otherSeat(turn);
    const stolen = durak.reduce(res.state, idle, { type: 'done' });
    if (stolen.ok && whoseTurn(res.state) !== idle) {
      fail(`game ${g}: seat ${idle} closed a bout that was not theirs`);
    }

    state = res.state;
    auditCards(state, `game ${g} step ${steps}`);
    steps++;
  }

  if (!state.outcome) fail(`game ${g}: no result after ${steps} steps`);
  else {
    lengths.push(steps);
    if (state.outcome.winner === 0) outcomes.seat0++;
    else if (state.outcome.winner === 1) outcomes.seat1++;
    else outcomes.draw++;
  }
}

const avg = lengths.reduce((a, b) => a + b, 0) / Math.max(lengths.length, 1);
console.log(`\n${GAMES} games simulated`);
console.log(`  seat 0 wins: ${outcomes.seat0}   seat 1 wins: ${outcomes.seat1}   draws: ${outcomes.draw}`);
console.log(`  moves per game: avg ${avg.toFixed(1)}, max ${Math.max(...lengths)}`);
console.log(failures === 0 ? '\n✓ all invariants held\n' : `\n✗ ${failures} failures\n`);
process.exit(failures === 0 ? 0 : 1);
