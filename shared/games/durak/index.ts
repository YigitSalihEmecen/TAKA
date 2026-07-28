/**
 * Durak — the state machine.
 *
 * Ported from my Godot implementation, with two corrections: the end-of-game
 * check now happens only when a bout resolves (the old one could declare a
 * winner mid-bout, while cards were still unbeaten), and hand order is part of
 * the authoritative state so it survives a reconnect.
 */

import {
  buildDeck,
  byRankThenSuit,
  makeRng,
  rankOf,
  shuffle,
  suitOf,
  type Card,
  type Suit,
} from '../cards.ts';
import { otherSeat, type GameDefinition, type GameOutcome, type Seat } from '../types.ts';
import {
  canAttackWith,
  canDefendWith,
  canEndBout,
  canTake,
  canTransferWith,
  cardValue,
  undefendedPairs,
  type Pair,
  type TableContext,
} from './rules.ts';

export const HAND_SIZE = 6;

export interface DurakState {
  deck: Card[]; // index 0 draws next; the last card is the exposed trump
  trump: Card;
  trumpSuit: Suit;
  hands: [Card[], Card[]];
  table: Pair[];
  discardCount: number;
  attacker: Seat;
  defenderTaking: boolean;
  round: number;
  outcome: GameOutcome | null;
  log: LogLine[];
}

export interface LogLine {
  id: number;
  seat: Seat | null;
  text: string;
}

export type DurakAction =
  | { type: 'attack'; card: Card }
  | { type: 'defend'; card: Card; target: Card }
  | { type: 'transfer'; card: Card }
  | { type: 'take' }
  | { type: 'done' }
  | { type: 'sort'; order: Card[] };

export interface DurakView {
  you: Seat;
  /** Whose move it is. Only this seat may act. */
  toAct: Seat;
  hand: Card[];
  opponentCount: number;
  deckCount: number;
  trump: Card;
  trumpSuit: Suit;
  /** True once the exposed trump has been drawn — the deck is spent. */
  trumpTaken: boolean;
  table: Pair[];
  discardCount: number;
  attacker: Seat;
  defenderTaking: boolean;
  round: number;
  outcome: GameOutcome | null;
  log: LogLine[];
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const ctxOf = (s: Pick<DurakState, 'trumpSuit' | 'table' | 'round' | 'defenderTaking'>): TableContext => ({
  trumpSuit: s.trumpSuit,
  table: s.table,
  round: s.round,
  defenderTaking: s.defenderTaking,
});

/** Same context, built from a player's view — used for client-side hints. */
export const ctxOfView = (v: DurakView): TableContext => ({
  trumpSuit: v.trumpSuit,
  table: v.table,
  round: v.round,
  defenderTaking: v.defenderTaking,
});

const clone = (s: DurakState): DurakState => ({
  ...s,
  deck: [...s.deck],
  hands: [[...s.hands[0]], [...s.hands[1]]],
  table: s.table.map((p) => ({ ...p })),
  log: [...s.log],
});

const fail = (error: string) => ({ ok: false as const, error });

/**
 * Whose move it is.
 *
 * Real Durak lets the attacker throw cards in at any moment, but strict
 * alternation reads far better on a screen — you always know whether the table
 * is waiting on you. The defender holds the turn while anything is unbeaten;
 * otherwise it belongs to the attacker.
 */
export function whoseTurn(s: Pick<DurakState, 'table' | 'attacker' | 'defenderTaking'>): Seat {
  if (s.defenderTaking) return s.attacker;
  if (s.table.length === 0) return s.attacker;
  if (undefendedPairs(s.table).length > 0) return otherSeat(s.attacker);
  return s.attacker;
}

function note(s: DurakState, seat: Seat | null, text: string) {
  const id = (s.log[s.log.length - 1]?.id ?? 0) + 1;
  s.log.push({ id, seat, text });
  if (s.log.length > 24) s.log.splice(0, s.log.length - 24);
}

function drawUpTo(s: DurakState, seat: Seat) {
  while (s.hands[seat].length < HAND_SIZE && s.deck.length > 0) {
    s.hands[seat].push(s.deck.shift()!);
  }
}

/** Settle a bout: clear the table, refill both hands, decide if we are done. */
function resolveBout(s: DurakState, taken: boolean) {
  const defender = otherSeat(s.attacker);

  if (taken) {
    for (const p of s.table) {
      s.hands[defender].push(p.attack);
      if (p.defense) s.hands[defender].push(p.defense);
    }
  } else {
    s.discardCount += s.table.reduce((n, p) => n + (p.defense ? 2 : 1), 0);
  }
  s.table = [];

  // The attacker always refills first — with a thin deck this matters.
  drawUpTo(s, s.attacker);
  drawUpTo(s, defender);

  if (s.deck.length === 0) {
    const empty0 = s.hands[0].length === 0;
    const empty1 = s.hands[1].length === 0;
    if (empty0 && empty1) {
      s.outcome = { winner: null, headline: 'A dead heat', detail: 'Nobody is the fool tonight.' };
      return;
    }
    if (empty0 || empty1) {
      const winner: Seat = empty0 ? 0 : 1;
      s.outcome = {
        winner,
        headline: '{loser} is the durak',
        detail: 'Left holding the last cards.',
      };
      return;
    }
  }

  if (!taken) s.attacker = defender; // a beaten bout hands over the attack
  s.defenderTaking = false;
  s.round += 1;
}

// ---------------------------------------------------------------------------
// definition
// ---------------------------------------------------------------------------

export const durak: GameDefinition<DurakState, DurakAction, DurakView> = {
  meta: {
    id: 'durak',
    title: 'Durak',
    subtitle: 'Russia · two players',
    blurb:
      'Дурак — “the fool”. Attack with cards, beat what comes back, and shed your hand before the deck runs dry. Whoever is still holding cards at the end wears the name.',
    glyph: '♠',
    duration: '10–20 min',
    available: true,
    hasBot: true,
  },

  create(seed) {
    const rng = makeRng(seed);
    const deck = shuffle(buildDeck(36), rng);

    const hands: [Card[], Card[]] = [[], []];
    for (let i = 0; i < HAND_SIZE; i++) {
      hands[0].push(deck.shift()!);
      hands[1].push(deck.shift()!);
    }

    const trump = deck[deck.length - 1] ?? hands[0][0];
    const trumpSuit = suitOf(trump);

    hands[0].sort((a, b) => cardValue(a, trumpSuit) - cardValue(b, trumpSuit));
    hands[1].sort((a, b) => cardValue(a, trumpSuit) - cardValue(b, trumpSuit));

    // Lowest trump opens; if neither holds one, seat 0 does.
    const lowestTrump = (h: Card[]) =>
      h.filter((c) => suitOf(c) === trumpSuit).reduce((m, c) => Math.min(m, rankOf(c)), 99);
    const attacker: Seat = lowestTrump(hands[1]) < lowestTrump(hands[0]) ? 1 : 0;

    return {
      deck,
      trump,
      trumpSuit,
      hands,
      table: [],
      discardCount: 0,
      attacker,
      defenderTaking: false,
      round: 1,
      outcome: null,
      log: [{ id: 1, seat: null, text: `${suitOf(trump)} is trump` }],
    };
  },

  reduce(prev, seat, action) {
    if (prev.outcome) return fail('The game is over.');
    const s = clone(prev);
    const hand = s.hands[seat];
    const defender = otherSeat(s.attacker);
    const ctx = ctxOf(s);

    // Tidying your own hand is bookkeeping, not a move — always allowed.
    if (action.type === 'sort') {
      const same = action.order.length === hand.length && action.order.every((c) => hand.includes(c));
      if (!same) return fail('That is not your hand.');
      s.hands[seat] = [...action.order];
      return { ok: true, state: s };
    }

    if (seat !== whoseTurn(s)) return fail('It is not your turn.');

    switch (action.type) {
      case 'attack': {
        if (seat !== s.attacker) return fail('You are defending.');
        if (!hand.includes(action.card)) return fail('You do not hold that card.');
        if (!canAttackWith(ctx, action.card, s.hands[defender].length))
          return fail('That card cannot be played here.');
        s.hands[seat] = hand.filter((c) => c !== action.card);
        s.table.push({ attack: action.card, defense: null });
        note(s, seat, `attacks with ${action.card}`);
        return { ok: true, state: s };
      }

      case 'defend': {
        if (seat !== defender) return fail('You are attacking.');
        if (!hand.includes(action.card)) return fail('You do not hold that card.');
        if (!canDefendWith(ctx, action.card, action.target)) return fail('That will not beat it.');
        s.hands[seat] = hand.filter((c) => c !== action.card);
        const pair = s.table.find((p) => p.attack === action.target)!;
        pair.defense = action.card;
        note(s, seat, `beats ${action.target} with ${action.card}`);
        return { ok: true, state: s };
      }

      case 'transfer': {
        if (seat !== defender) return fail('You are attacking.');
        if (!hand.includes(action.card)) return fail('You do not hold that card.');
        if (!canTransferWith(ctx, action.card, s.hands[s.attacker].length))
          return fail('You cannot pass this bout along.');
        s.hands[seat] = hand.filter((c) => c !== action.card);
        s.table.push({ attack: action.card, defense: null });
        s.attacker = seat; // roles swap: the defender is now the attacker
        note(s, seat, `passes it on with ${action.card}`);
        return { ok: true, state: s };
      }

      case 'take': {
        if (seat !== defender) return fail('You are attacking.');
        if (!canTake(ctx)) return fail('There is nothing to take.');
        s.defenderTaking = true;
        note(s, seat, 'yields — taking the table');
        return { ok: true, state: s };
      }

      case 'done': {
        if (seat !== s.attacker) return fail('Only the attacker ends the bout.');
        if (!canEndBout(ctx)) return fail('Not every card has been answered.');
        const taken = s.defenderTaking;
        note(s, seat, taken ? 'closes the bout' : 'the bout is beaten');
        resolveBout(s, taken);
        return { ok: true, state: s };
      }
    }
  },

  view(s, seat) {
    return {
      you: seat,
      toAct: whoseTurn(s),
      hand: [...s.hands[seat]],
      opponentCount: s.hands[otherSeat(seat)].length,
      deckCount: s.deck.length,
      trump: s.trump,
      trumpSuit: s.trumpSuit,
      trumpTaken: s.deck.length === 0,
      table: s.table.map((p) => ({ ...p })),
      discardCount: s.discardCount,
      attacker: s.attacker,
      defenderTaking: s.defenderTaking,
      round: s.round,
      outcome: s.outcome,
      log: s.log.slice(-8),
    };
  },

  outcome: (s) => s.outcome,

  botDelay: 750,

  bot(v) {
    if (v.outcome || v.toAct !== v.you) return null;
    const ctx = ctxOfView(v);
    const cheapFirst = [...v.hand].sort(
      (a, b) => cardValue(a, v.trumpSuit) - cardValue(b, v.trumpSuit),
    );
    const isTrump = (c: Card) => suitOf(c) === v.trumpSuit;
    const endgame = v.deckCount === 0;

    if (v.attacker === v.you) {
      // ---- attacking -------------------------------------------------------
      const playable = cheapFirst.filter((c) => canAttackWith(ctx, c, v.opponentCount));
      if (playable.length === 0) return v.table.length ? { type: 'done' } : null;

      if (v.table.length === 0) return { type: 'attack', card: playable[0] };

      // Hold back big trumps unless the deck is spent and it is time to commit.
      const modest = playable.filter((c) => !(isTrump(c) && rankOf(c) >= 11));
      const pick = endgame ? playable[0] : modest[0];
      if (!pick) return { type: 'done' };
      return { type: 'attack', card: pick };
    }

    // ---- defending ---------------------------------------------------------
    const open = undefendedPairs(v.table);
    if (open.length === 0) return null;

    // Passing the bout on is free value when it costs a cheap card.
    const passOn = cheapFirst.find(
      (c) => canTransferWith(ctx, c, v.opponentCount) && !(isTrump(c) && rankOf(c) >= 12),
    );
    if (passOn) return { type: 'transfer', card: passOn };

    const target = open[0].attack;
    const answer = cheapFirst.find((c) => canDefendWith(ctx, c, target));
    if (!answer) return canTake(ctx) ? { type: 'take' } : null;

    // Burning a high trump on a low card early is a bad trade — yield instead.
    const wasteful =
      !endgame &&
      isTrump(answer) &&
      !isTrump(target) &&
      rankOf(answer) >= 12 &&
      rankOf(target) <= 9 &&
      v.table.length <= 1;
    if (wasteful && canTake(ctx)) return { type: 'take' };

    return { type: 'defend', card: answer, target };
  },
};

/** Tidy ordering offered by the hand's sort control. */
export const tidyHand = (hand: Card[], trumpSuit: Suit, mode: 'value' | 'suit'): Card[] =>
  mode === 'value'
    ? [...hand].sort((a, b) => cardValue(a, trumpSuit) - cardValue(b, trumpSuit))
    : [...hand].sort((a, b) => {
        const at = suitOf(a) === trumpSuit ? 1 : 0;
        const bt = suitOf(b) === trumpSuit ? 1 : 0;
        if (at !== bt) return at - bt;
        if (suitOf(a) !== suitOf(b)) return suitOf(a) < suitOf(b) ? -1 : 1;
        return byRankThenSuit(a, b);
      });
