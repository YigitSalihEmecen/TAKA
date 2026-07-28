/**
 * Backgammon — the rules, as pure functions.
 *
 * Board representation: 24 points, index 0–23, in a single absolute frame.
 * `points[i]` is positive for seat 0's checkers and negative for seat 1's, so
 * one number carries both owner and count.
 *
 *   seat 0 moves downwards, 23 → 0, and bears off past 0.  Home is 0–5.
 *   seat 1 moves upwards,   0 → 23, and bears off past 23. Home is 18–23.
 *
 * Keeping one absolute frame (rather than each player's own) means there is
 * exactly one set of rules to get right; the board component mirrors it for
 * whoever is looking.
 */

import type { Seat } from '../types.ts';

export const CHECKERS = 15;
export const POINTS = 24;

/** `from`/`to` use these sentinels rather than magic numbers. */
export const BAR = 'bar' as const;
export const OFF = 'off' as const;

export interface Move {
  from: typeof BAR | number;
  to: typeof OFF | number;
  /** The die this move spends. */
  die: number;
}

export interface Position {
  points: number[];
  bar: [number, number];
  off: [number, number];
}

export const clonePosition = (p: Position): Position => ({
  points: [...p.points],
  bar: [...p.bar] as [number, number],
  off: [...p.off] as [number, number],
});

/** +1 for seat 0 (its checkers count up), -1 for seat 1. */
export const sign = (seat: Seat): number => (seat === 0 ? 1 : -1);

/** Direction of travel along the index. */
export const step = (seat: Seat): number => (seat === 0 ? -1 : 1);

export const countAt = (p: Position, i: number, seat: Seat): number => {
  const v = p.points[i];
  return seat === 0 ? Math.max(0, v) : Math.max(0, -v);
};

const opponentCountAt = (p: Position, i: number, seat: Seat): number =>
  countAt(p, i, seat === 0 ? 1 : 0);

/** Home board indices for a seat. */
export const homeRange = (seat: Seat): [number, number] => (seat === 0 ? [0, 5] : [18, 23]);

/** Pips from a point to bearing off. */
export const pipsToOff = (seat: Seat, i: number): number => (seat === 0 ? i + 1 : POINTS - i);

/** Total pip count — the standard measure of who is ahead. */
export function pipCount(p: Position, seat: Seat): number {
  let total = p.bar[seat] * (POINTS + 1);
  for (let i = 0; i < POINTS; i++) total += countAt(p, i, seat) * pipsToOff(seat, i);
  return total;
}

/** Every checker in the home board (or already off)? */
export function allHome(p: Position, seat: Seat): boolean {
  if (p.bar[seat] > 0) return false;
  const [lo, hi] = homeRange(seat);
  for (let i = 0; i < POINTS; i++) {
    if (i >= lo && i <= hi) continue;
    if (countAt(p, i, seat) > 0) return false;
  }
  return true;
}

/** Where a checker coming off the bar lands for `die`. */
export const entryPoint = (seat: Seat, die: number): number => (seat === 0 ? POINTS - die : die - 1);

const canLand = (p: Position, i: number, seat: Seat): boolean =>
  i >= 0 && i < POINTS && opponentCountAt(p, i, seat) <= 1;

/** Is there a checker further from home than `i`, still on the board? */
function anyBehind(p: Position, seat: Seat, i: number): boolean {
  if (seat === 0) {
    for (let j = i + 1; j <= 5; j++) if (countAt(p, j, seat) > 0) return true;
  } else {
    for (let j = 18; j < i; j++) if (countAt(p, j, seat) > 0) return true;
  }
  return false;
}

/** Every legal move for one die value, in the given position. */
export function movesForDie(p: Position, seat: Seat, die: number): Move[] {
  const out: Move[] = [];

  // The bar must be cleared before anything else may move.
  if (p.bar[seat] > 0) {
    const entry = entryPoint(seat, die);
    if (canLand(p, entry, seat)) out.push({ from: BAR, to: entry, die });
    return out;
  }

  const home = allHome(p, seat);
  for (let i = 0; i < POINTS; i++) {
    if (countAt(p, i, seat) === 0) continue;
    const dest = i + step(seat) * die;

    if (dest >= 0 && dest < POINTS) {
      if (canLand(p, dest, seat)) out.push({ from: i, to: dest, die });
      continue;
    }

    // Past the edge: only legal as a bear-off, and only once fully home.
    if (!home) continue;
    const need = pipsToOff(seat, i);
    if (die === need) out.push({ from: i, to: OFF, die });
    else if (die > need && !anyBehind(p, seat, i)) out.push({ from: i, to: OFF, die });
  }
  return out;
}

/** Apply a move. Assumes it is legal; hitting sends the blot to the bar. */
export function applyMove(p: Position, seat: Seat, move: Move): Position {
  const next = clonePosition(p);
  const s = sign(seat);
  const foe: Seat = seat === 0 ? 1 : 0;

  if (move.from === BAR) next.bar[seat] -= 1;
  else next.points[move.from] -= s;

  if (move.to === OFF) {
    next.off[seat] += 1;
    return next;
  }

  if (opponentCountAt(next, move.to, seat) === 1) {
    next.points[move.to] = 0;
    next.bar[foe] += 1;
  }
  next.points[move.to] += s;
  return next;
}

/**
 * The most dice that can still be spent from here.
 *
 * Backgammon requires you to play as many dice as you legally can, so this
 * drives legality: a move is only allowed if it keeps the maximum reachable.
 * Depth is at most four (doubles), so plain search is quick enough.
 */
export function maxDiceUsable(p: Position, seat: Seat, dice: number[]): number {
  if (dice.length === 0) return 0;
  let best = 0;
  const tried = new Set<number>();
  for (let d = 0; d < dice.length; d++) {
    const die = dice[d];
    if (tried.has(die)) continue;
    tried.add(die);
    for (const move of movesForDie(p, seat, die)) {
      const rest = dice.slice();
      rest.splice(d, 1);
      const used = 1 + maxDiceUsable(applyMove(p, seat, move), seat, rest);
      if (used > best) best = used;
      if (best === dice.length) return best;
    }
  }
  return best;
}

/**
 * The moves a player is actually allowed to make right now.
 *
 * Two standard restrictions are enforced here: you must play as many dice as
 * possible, and when only one of two different dice can be played, it must be
 * the higher one.
 */
export function legalMoves(p: Position, seat: Seat, dice: number[]): Move[] {
  if (dice.length === 0) return [];
  const best = maxDiceUsable(p, seat, dice);
  if (best === 0) return [];

  const distinct = [...new Set(dice)];
  let allowed = dice;
  if (best === 1 && distinct.length === 2) {
    // Only one die is playable — it has to be the larger, if that one works.
    const higher = Math.max(...distinct);
    if (movesForDie(p, seat, higher).length > 0) allowed = [higher];
  }

  const out: Move[] = [];
  for (const die of new Set(allowed)) {
    for (const move of movesForDie(p, seat, die)) {
      const rest = dice.slice();
      rest.splice(rest.indexOf(die), 1);
      if (1 + maxDiceUsable(applyMove(p, seat, move), seat, rest) === best) out.push(move);
    }
  }
  return out;
}

/** Has `seat` borne every checker off? */
export const hasWon = (p: Position, seat: Seat): boolean => p.off[seat] === CHECKERS;

/**
 * Turkish scoring: 2 for a mars — the loser has borne nothing off — and 1
 * otherwise. Tavla has no separate triple "backgammon" score.
 */
export function winMultiplier(p: Position, winner: Seat): 1 | 2 {
  const loser: Seat = winner === 0 ? 1 : 0;
  return p.off[loser] > 0 ? 1 : 2;
}

/** The opening position. */
export function startingPosition(): Position {
  const points = new Array(POINTS).fill(0);
  points[23] = 2;
  points[12] = 5;
  points[7] = 3;
  points[5] = 5;
  points[0] = -2;
  points[11] = -5;
  points[16] = -3;
  points[18] = -5;
  return { points, bar: [0, 0], off: [0, 0] };
}
