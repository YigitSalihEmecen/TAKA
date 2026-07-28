/**
 * A standard deck toolkit, shared by any card game in the collection.
 * Cards are plain strings like "AS" / "10H" / "6D" so they serialise for free
 * and compare with `===`.
 */

export const SUITS = ['S', 'H', 'D', 'C'] as const;
export type Suit = (typeof SUITS)[number];

export const SUIT_SYMBOL: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };
export const SUIT_NAME: Record<Suit, string> = {
  S: 'spades',
  H: 'hearts',
  D: 'diamonds',
  C: 'clubs',
};
export const isRed = (s: Suit): boolean => s === 'H' || s === 'D';

/** 6..14, where 11=J 12=Q 13=K 14=A. Durak uses a 36-card deck (6 and up). */
export type Rank = number;

export const RANK_LABEL: Record<number, string> = {
  2: '2',
  3: '3',
  4: '4',
  5: '5',
  6: '6',
  7: '7',
  8: '8',
  9: '9',
  10: '10',
  11: 'J',
  12: 'Q',
  13: 'K',
  14: 'A',
};

/** Encoded card, e.g. "6S", "10H", "AS" -> we use rank number + suit letter. */
export type Card = string;

export const card = (rank: Rank, suit: Suit): Card => `${rank}${suit}`;
export const rankOf = (c: Card): Rank => parseInt(c.slice(0, -1), 10);
export const suitOf = (c: Card): Suit => c.slice(-1) as Suit;
export const labelOf = (c: Card): string => RANK_LABEL[rankOf(c)] ?? String(rankOf(c));

/** Deck of `36` (ranks 6-14) or `52` (ranks 2-14) cards, in order. */
export function buildDeck(size: 36 | 52 = 36): Card[] {
  const low = size === 36 ? 6 : 2;
  const out: Card[] = [];
  for (const s of SUITS) for (let r = low; r <= 14; r++) out.push(card(r, s));
  return out;
}

/**
 * Deterministic PRNG (mulberry32). Same seed, same shuffle — which makes
 * desync bugs reproducible instead of mysterious.
 */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates, in place, using the supplied RNG. */
export function shuffle<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Sort helper: by suit then rank, for tidying a hand. */
export function bySuitThenRank(a: Card, b: Card): number {
  const si = SUITS.indexOf(suitOf(a)) - SUITS.indexOf(suitOf(b));
  return si !== 0 ? si : rankOf(a) - rankOf(b);
}

/** Sort helper: by rank then suit. */
export function byRankThenSuit(a: Card, b: Card): number {
  const ri = rankOf(a) - rankOf(b);
  return ri !== 0 ? ri : SUITS.indexOf(suitOf(a)) - SUITS.indexOf(suitOf(b));
}
