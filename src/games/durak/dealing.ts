/**
 * The opening ceremony: a riffle shuffle, then cards flying out of the stock
 * into both hands.
 *
 * Two separate jobs live here. `useDealSequence` decides *when* we are in the
 * ceremony; `flyFromDeck` works out *where each card should start* so that a
 * card entering a hand appears to come out of the deck rather than fading in
 * from nowhere. The second one is used for every draw, not just the first
 * deal — that is what makes replenishment feel dealt rather than granted.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { HAND_SIZE, type DurakView } from '@shared/games/durak/index.ts';

export type DealPhase = 'shuffle' | 'deal' | 'ready';

export const SHUFFLE_MS = 1250;
export const DEAL_MS = 950;

/** The exact state a game is in the instant after it is dealt, and no other. */
function isFreshDeal(view: DurakView | null): boolean {
  return (
    !!view &&
    !view.outcome &&
    view.round === 1 &&
    view.table.length === 0 &&
    view.discardCount === 0 &&
    view.hand.length === HAND_SIZE &&
    view.opponentCount === HAND_SIZE
  );
}

export function useDealSequence(view: DurakView | null): DealPhase {
  // Seeded from the first render, so a freshly dealt game never flashes its
  // cards before the shuffle starts.
  const [phase, setPhase] = useState<DealPhase>(() => (isFreshDeal(view) ? 'shuffle' : 'ready'));
  const armed = useRef(!isFreshDeal(view));
  const timers = useRef<number[]>([]);
  const fresh = isFreshDeal(view);

  /**
   * Both timers are set together and only ever cleared together. An earlier
   * version ran the clock in an effect keyed on `phase`, which meant the
   * shuffle→deal transition re-ran the effect and its cleanup cancelled the
   * deal→ready timer — leaving the board stuck mid-deal with no status line.
   */
  const run = useCallback(() => {
    timers.current.forEach(clearTimeout);
    setPhase('shuffle');
    timers.current = [
      window.setTimeout(() => setPhase('deal'), SHUFFLE_MS),
      window.setTimeout(() => setPhase('ready'), SHUFFLE_MS + DEAL_MS),
    ];
  }, []);

  useEffect(() => {
    if (phase === 'shuffle' && timers.current.length === 0) run();
    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
    // Mount only: the opening shuffle is already in state, it just needs a clock.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-arm between games so a rematch gets its own shuffle.
  useEffect(() => {
    if (!fresh) {
      armed.current = true;
      return;
    }
    if (!armed.current) return;
    armed.current = false;
    run();
  }, [fresh, run]);

  return phase;
}

/**
 * Mirrors `.pcard--small` in durak.css — the deck's cards are drawn at this
 * fraction of a full card, and we read one back to learn the real card width
 * without duplicating the clamp() that defines it.
 */
const DECK_CARD_SCALE = 0.76;

/**
 * Offset, in pixels, that puts a fan slot on top of the deck.
 *
 * Cards are laid out by flexbox, so we cannot know a slot's position before it
 * renders. Instead we measure the fan and the deck, then reconstruct the slot's
 * centre analytically from the same overlap the CSS uses. If anything is not
 * mounted yet we fall back to ""from below", which still reads as an entrance.
 */
export function flyFromDeck(
  deckEl: HTMLElement | null,
  fanEl: HTMLElement | null,
  index: number,
  count: number,
  overlapFraction: number,
  fallbackY = 80,
): { x: number; y: number } {
  if (!deckEl || !fanEl) return { x: 0, y: fallbackY };

  const deck = deckEl.getBoundingClientRect();
  const fan = fanEl.getBoundingClientRect();
  if (!deck.width || !fan.width) return { x: 0, y: fallbackY };

  const probe = deckEl.querySelector('.pcard');
  const cardW = probe
    ? probe.getBoundingClientRect().width / DECK_CARD_SCALE
    : fan.width / Math.max(count, 1);

  const advance = cardW * (1 - 2 * overlapFraction);
  const mid = (count - 1) / 2;
  const slotX = fan.left + fan.width / 2 + (index - mid) * advance;
  const slotY = fan.top + fan.height / 2;

  return {
    x: deck.left + deck.width / 2 - slotX,
    y: deck.top + deck.height / 2 - slotY,
  };
}

/**
 * Delta from one element's centre to another's.
 *
 * Used twice: to send the shuffle stack home to the deck corner, and to start
 * a card the opponent just played up at their end of the table.
 */
export function centreDelta(from: HTMLElement | null, to: HTMLElement | null) {
  if (!from || !to) return { x: 0, y: 0 };
  const a = from.getBoundingClientRect();
  const b = to.getBoundingClientRect();
  if (!a.width || !b.width) return { x: 0, y: 0 };
  return { x: b.left + b.width / 2 - (a.left + a.width / 2), y: b.top + b.height / 2 - (a.top + a.height / 2) };
}

/**
 * Offset that puts a table slot on top of `source` — the hand a card is coming
 * out of.
 *
 * The table is a grid of fixed-width columns, so a slot's centre can be derived
 * exactly, and — crucially — it does not move as more cards are laid down.
 * Reading the used track sizes back out of `gridTemplateColumns` means the
 * geometry never has to be duplicated here.
 */
export function flyOntoSlot(
  tableEl: HTMLElement | null,
  sourceEl: HTMLElement | null,
  column: number,
): { x: number; y: number } {
  if (!tableEl || !sourceEl) return { x: 0, y: -60 };

  const table = tableEl.getBoundingClientRect();
  const src = sourceEl.getBoundingClientRect();
  if (!table.width || !src.width) return { x: 0, y: -60 };

  const srcCx = src.left + src.width / 2;
  const srcCy = src.top + src.height / 2;

  const cs = getComputedStyle(tableEl);
  const cols = cs.gridTemplateColumns.split(' ').map(parseFloat).filter((n) => !Number.isNaN(n));
  const gap = parseFloat(cs.columnGap) || 0;
  if (cols.length === 0) {
    return { x: srcCx - (table.left + table.width / 2), y: srcCy - (table.top + table.height / 2) };
  }

  const total = cols.reduce((a, b) => a + b, 0) + gap * (cols.length - 1);
  const idx = Math.max(0, Math.min(column, cols.length - 1));
  let left = table.left + table.width / 2 - total / 2;
  for (let i = 0; i < idx; i++) left += cols[i] + gap;

  return { x: srcCx - (left + cols[idx] / 2), y: srcCy - (table.top + table.height / 2) };
}

/**
 * Which grid column each bout occupies, in play order.
 *
 * Centre-outwards rather than left-to-right: the table keeps looking centred
 * whatever the count, while every slot stays in a fixed place. A left-to-right
 * row has to be re-centred every time a card is added, and that re-centring is
 * exactly the shuffling-about this replaces.
 */
export const SLOT_COLUMNS = [3, 4, 2, 5, 1, 6];
