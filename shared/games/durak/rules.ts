/**
 * Durak — the rules, as pure functions.
 *
 * Everything here works off a "context" that is deliberately small: the trump
 * suit, what is on the table, and how many cards the *other* player holds.
 * That is exactly the information contained in a player's view, which means
 * the client can light up legal moves using the same code the server uses to
 * enforce them. One source of truth, no drift.
 *
 * Variant implemented: two-handed "podkidnoy durak" with переводной (transfer)
 * — a 36-card deck, six-card hands, and a five-card cap on the opening bout.
 */

import { rankOf, suitOf, type Card, type Suit } from '../cards.ts';

/** One attack card and the card that beat it, if any. */
export interface Pair {
  attack: Card;
  defense: Card | null;
}

/** The slice of game state that legality depends on. */
export interface TableContext {
  trumpSuit: Suit;
  table: Pair[];
  round: number;
  defenderTaking: boolean;
}

/** The opening bout is capped at five cards; every later bout at six. */
export const attackLimit = (round: number): number => (round === 1 ? 5 : 6);

export const undefendedPairs = (table: Pair[]): Pair[] => table.filter((p) => !p.defense);
export const allDefended = (table: Pair[]): boolean => table.every((p) => p.defense !== null);

/** Every rank currently showing on the table — the set you may throw in against. */
export function ranksOnTable(table: Pair[]): Set<number> {
  const s = new Set<number>();
  for (const p of table) {
    s.add(rankOf(p.attack));
    if (p.defense) s.add(rankOf(p.defense));
  }
  return s;
}

/** Can `defense` legally beat `attack`? */
export function beats(attack: Card, defense: Card, trumpSuit: Suit): boolean {
  const as = suitOf(attack);
  const ds = suitOf(defense);
  if (as === ds) return rankOf(defense) > rankOf(attack);
  // A trump beats any non-trump; a non-trump can never beat a trump.
  return ds === trumpSuit && as !== trumpSuit;
}

/**
 * May the attacker throw in `card`?
 * `defenderHandCount` is how many cards the defender is holding right now.
 */
export function canAttackWith(
  ctx: TableContext,
  card: Card,
  defenderHandCount: number,
): boolean {
  if (ctx.table.length >= attackLimit(ctx.round)) return false;

  /*
   * While the defender is still beating cards you may never leave them more to
   * answer than they hold cards. Once they have *yielded*, though, they are
   * picking the whole table up regardless — so only the bout limit applies.
   *
   * An earlier version counted the cards already on the table against the
   * defender's remaining hand, which blocked the throw-in in a fifth of all
   * taking positions: with three pairs down and three cards left in their hand
   * the attacker was frozen out even holding a matching rank.
   */
  if (!ctx.defenderTaking && undefendedPairs(ctx.table).length >= defenderHandCount) {
    return false;
  }

  // The opening card of a bout is free; after that ranks must already be showing.
  if (ctx.table.length === 0) return true;
  return ranksOnTable(ctx.table).has(rankOf(card));
}

/** May the defender beat the open attack `target` with `card`? */
export function canDefendWith(ctx: TableContext, card: Card, target: Card): boolean {
  if (ctx.defenderTaking) return false;
  const pair = ctx.table.find((p) => p.attack === target);
  if (!pair || pair.defense) return false;
  return beats(target, card, ctx.trumpSuit);
}

/**
 * May the defender pass the bout along (переводной) by adding `card`?
 * Only legal while nothing has been beaten yet, and only with a matching rank.
 * `newDefenderHandCount` is the current attacker's hand size — they are about
 * to become the defender, and must be able to cover everything.
 */
export function canTransferWith(
  ctx: TableContext,
  card: Card,
  newDefenderHandCount: number,
): boolean {
  if (ctx.defenderTaking) return false;
  if (ctx.table.length === 0) return false;
  if (ctx.table.some((p) => p.defense !== null)) return false;
  if (rankOf(card) !== rankOf(ctx.table[0].attack)) return false;
  if (ctx.table.length + 1 > newDefenderHandCount) return false;
  if (ctx.table.length + 1 > attackLimit(ctx.round)) return false;
  return true;
}

/** The attacker may close the bout once every attack has been answered. */
export function canEndBout(ctx: TableContext): boolean {
  if (ctx.table.length === 0) return false;
  return ctx.defenderTaking || allDefended(ctx.table);
}

/** The defender may yield only while something is still unbeaten. */
export function canTake(ctx: TableContext): boolean {
  if (ctx.defenderTaking) return false;
  return undefendedPairs(ctx.table).length > 0;
}

/** Ordering used by the bot and the "tidy" button: cheap cards first, trumps last. */
export function cardValue(c: Card, trumpSuit: Suit): number {
  return (suitOf(c) === trumpSuit ? 100 : 0) + rankOf(c);
}
