/**
 * Backgammon — the state machine.
 *
 * Nothing is hidden in backgammon, so `view` is nearly the whole state; what it
 * adds is the list of moves the player may legally make, computed by the same
 * code the server enforces with. The board never has to reason about rules.
 *
 * The doubling cube is deliberately left out — see ARCHITECTURE.md §14.
 */

import { otherSeat, type GameDefinition, type GameOutcome, type Seat } from '../types.ts';
import {
  BAR,
  CHECKERS,
  OFF,
  applyMove,
  clonePosition,
  countAt,
  hasWon,
  legalMoves,
  pipCount,
  pipsToOff,
  startingPosition,
  winMultiplier,
  type Move,
  type Position,
} from './rules.ts';

export type Phase = 'opening' | 'roll' | 'move' | 'over';

export interface LogLine {
  id: number;
  seat: Seat | null;
  text: string;
}

export interface BackgammonState extends Position {
  turn: Seat;
  phase: Phase;
  /** Dice still to be spent this turn. */
  dice: number[];
  /** What was thrown, kept for display after the dice are spent. */
  rolled: number[];
  /** Opening throw, one die each, higher starts. */
  opening: [number | null, number | null];
  /** Carried in state so `reduce` stays pure. */
  seed: number;
  outcome: GameOutcome | null;
  log: LogLine[];
}

export type BackgammonAction =
  | { type: 'roll' }
  | { type: 'move'; from: typeof BAR | number; to: typeof OFF | number; die: number }
  | { type: 'pass' };

export interface BackgammonView extends Position {
  you: Seat;
  toAct: Seat;
  turn: Seat;
  phase: Phase;
  dice: number[];
  rolled: number[];
  opening: [number | null, number | null];
  /** Every move you may make right now — empty when it is not your turn. */
  legal: Move[];
  pips: [number, number];
  outcome: GameOutcome | null;
  log: LogLine[];
}

// ---------------------------------------------------------------------------

const fail = (error: string) => ({ ok: false as const, error });

/** Deterministic dice. Advancing the seed in state keeps `reduce` pure. */
function roll(seed: number): { seed: number; die: number } {
  const next = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return { seed: next, die: ((next >>> 16) % 6) + 1 };
}

function note(s: BackgammonState, seat: Seat | null, text: string) {
  const id = (s.log[s.log.length - 1]?.id ?? 0) + 1;
  s.log.push({ id, seat, text });
  if (s.log.length > 24) s.log.splice(0, s.log.length - 24);
}

const clone = (s: BackgammonState): BackgammonState => ({
  ...s,
  ...clonePosition(s),
  dice: [...s.dice],
  rolled: [...s.rolled],
  opening: [...s.opening] as [number | null, number | null],
  log: [...s.log],
});

/** Whose input the game is waiting on. */
export function whoseTurn(s: BackgammonState): Seat {
  if (s.phase === 'opening') return s.opening[0] === null ? 0 : 1;
  return s.turn;
}

/** End the turn and hand over. */
function endTurn(s: BackgammonState) {
  s.dice = [];
  s.turn = otherSeat(s.turn);
  s.phase = 'roll';
}

/** Settle the game if somebody has borne everything off. */
function checkOver(s: BackgammonState): boolean {
  for (const seat of [0, 1] as Seat[]) {
    if (!hasWon(s, seat)) continue;
    const mult = winMultiplier(s, seat);
    s.outcome = {
      winner: seat,
      headline: '{winner} bears off',
      detail:
        mult === 3
          ? 'A backgammon — triple stakes.'
          : mult === 2
            ? 'A gammon — double stakes.'
            : 'All fifteen home.',
    };
    s.phase = 'over';
    return true;
  }
  return false;
}

export const backgammon: GameDefinition<BackgammonState, BackgammonAction, BackgammonView> = {
  meta: {
    id: 'backgammon',
    title: 'Backgammon',
    subtitle: 'Everywhere · two players',
    blurb:
      'Tavla. Twenty-four points, fifteen checkers each, and two dice deciding how far you get. Race your checkers home and bear them off — but leave one alone and it gets sent back to the start.',
    glyph: '⚄',
    duration: '15–30 min',
    available: true,
    hasBot: true,
  },

  create(seed) {
    return {
      ...startingPosition(),
      turn: 0,
      phase: 'opening',
      dice: [],
      rolled: [],
      opening: [null, null],
      seed: seed >>> 0,
      outcome: null,
      log: [{ id: 1, seat: null, text: 'Throw one die each to see who starts' }],
    };
  },

  reduce(prev, seat, action) {
    if (prev.outcome) return fail('The game is over.');
    const s = clone(prev);

    if (seat !== whoseTurn(s)) return fail('It is not your turn.');

    switch (action.type) {
      case 'roll': {
        if (s.phase === 'opening') {
          const a = roll(s.seed);
          s.seed = a.seed;
          s.opening[seat] = a.die;
          note(s, seat, `throws ${a.die}`);

          const [x, y] = s.opening;
          if (x === null || y === null) return { ok: true, state: s };

          if (x === y) {
            s.opening = [null, null];
            note(s, null, 'A tie — throw again');
            return { ok: true, state: s };
          }
          s.turn = x > y ? 0 : 1;
          s.dice = [x, y];
          s.rolled = [x, y];
          s.phase = 'move';
          note(s, s.turn, `starts with ${x} and ${y}`);
          if (legalMoves(s, s.turn, s.dice).length === 0) {
            note(s, s.turn, 'has nothing to play');
            endTurn(s);
          }
          return { ok: true, state: s };
        }

        if (s.phase !== 'roll') return fail('You have already rolled.');
        const a = roll(s.seed);
        const b = roll(a.seed);
        s.seed = b.seed;
        s.rolled = [a.die, b.die];
        s.dice = a.die === b.die ? [a.die, a.die, a.die, a.die] : [a.die, b.die];
        s.phase = 'move';
        note(s, seat, `rolls ${a.die} and ${b.die}${a.die === b.die ? ' — doubles' : ''}`);

        if (legalMoves(s, seat, s.dice).length === 0) {
          note(s, seat, 'is blocked and loses the turn');
          endTurn(s);
        }
        return { ok: true, state: s };
      }

      case 'move': {
        if (s.phase !== 'move') return fail('Roll first.');
        const allowed = legalMoves(s, seat, s.dice);
        const move = allowed.find(
          (m) => m.from === action.from && m.to === action.to && m.die === action.die,
        );
        if (!move) return fail('That move is not available.');

        const after = applyMove(s, seat, move);
        s.points = after.points;
        s.bar = after.bar;
        s.off = after.off;
        s.dice.splice(s.dice.indexOf(move.die), 1);

        if (checkOver(s)) return { ok: true, state: s };
        if (legalMoves(s, seat, s.dice).length === 0) endTurn(s);
        return { ok: true, state: s };
      }

      case 'pass': {
        if (s.phase !== 'move') return fail('Nothing to pass on.');
        if (legalMoves(s, seat, s.dice).length > 0) return fail('You still have a move.');
        endTurn(s);
        return { ok: true, state: s };
      }
    }
  },

  view(s, seat) {
    const acting = whoseTurn(s);
    return {
      points: [...s.points],
      bar: [...s.bar] as [number, number],
      off: [...s.off] as [number, number],
      you: seat,
      toAct: acting,
      turn: s.turn,
      phase: s.phase,
      dice: [...s.dice],
      rolled: [...s.rolled],
      opening: [...s.opening] as [number | null, number | null],
      legal: acting === seat && s.phase === 'move' ? legalMoves(s, seat, s.dice) : [],
      pips: [pipCount(s, 0), pipCount(s, 1)],
      outcome: s.outcome,
      log: s.log.slice(-8),
    };
  },

  outcome: (s) => s.outcome,

  botDelay: 620,

  bot(v) {
    if (v.outcome || v.toAct !== v.you) return null;
    if (v.phase === 'opening' || v.phase === 'roll') return { type: 'roll' };
    if (v.legal.length === 0) return { type: 'pass' };

    /*
     * Consider moves rearmost-first, measured in pips from home.
     *
     * `movesForDie` scans points 0→23 for both seats, but the seats travel in
     * opposite directions — so raw order means one seat sees its front
     * checkers first and the other its back ones. With ties broken by
     * first-seen, that made the two bots play measurably different games: seat
     * 1 was winning 63% of bot-vs-bot matches on a provably symmetric engine.
     */
    const ordered = [...v.legal].sort(
      (a, b) => fromPips(v.you, b.from) - fromPips(v.you, a.from) || b.die - a.die,
    );

    let best: Move = ordered[0];
    let bestScore = -Infinity;
    for (const move of ordered) {
      const score = scorePosition(applyMove(v, v.you, move), v.you);
      if (score > bestScore) {
        bestScore = score;
        best = move;
      }
    }
    return { type: 'move', from: best.from, to: best.to, die: best.die };
  },
};

/** Distance from home for a move's origin; the bar is furthest of all. */
const fromPips = (seat: Seat, from: typeof BAR | number): number =>
  from === BAR ? 99 : pipsToOff(seat, from);

/**
 * A plain positional score for the bot: get checkers off, hit blots, hold
 * points, and don't leave your own checkers alone where they can be hit.
 */
function scorePosition(p: Position, seat: Seat): number {
  const foe: Seat = seat === 0 ? 1 : 0;
  let score = p.off[seat] * 40 - p.bar[seat] * 30 + p.bar[foe] * 22;

  for (let i = 0; i < 24; i++) {
    const mine = countAt(p, i, seat);
    if (mine === 1) score -= 6; // a blot invites a hit
    if (mine >= 2) score += 5; // a made point
    const [lo, hi] = seat === 0 ? [0, 5] : [18, 23];
    if (mine >= 2 && i >= lo && i <= hi) score += 4; // home-board points are worth more
  }

  // Racing ahead is good, all else equal.
  score += (pipCount(p, foe) - pipCount(p, seat)) * 0.4;
  return score;
}

export { CHECKERS, BAR, OFF };
