import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { SUIT_SYMBOL, type Card } from '@shared/games/cards.ts';
import { otherSeat, type Seat } from '@shared/games/types.ts';
import { ctxOfView, tidyHand, type DurakAction, type DurakView } from '@shared/games/durak/index.ts';
import {
  canAttackWith,
  canDefendWith,
  canEndBout,
  canTake,
  canTransferWith,
  undefendedPairs,
} from '@shared/games/durak/rules.ts';
import { EMOTES, emoteOf } from '@shared/protocol.ts';
import type { BoardProps } from '../registry.tsx';
import { PlayingCard } from './PlayingCard.tsx';
import {
  SHUFFLE_MS,
  SLOT_COLUMNS,
  centreDelta,
  flyFromDeck,
  flyOntoSlot,
  useDealSequence,
} from './dealing.ts';
import './durak.css';

const spring = { type: 'spring' as const, stiffness: 460, damping: 38, mass: 0.9 };
const softSpring = { type: 'spring' as const, stiffness: 260, damping: 30 };

/**
 * How much each card tucks under the next, as a fraction of card width.
 * Hands swell past a dozen cards when someone keeps taking the table, so the
 * fan has to tighten rather than run off the edge of the screen.
 */
const overlap = (n: number, base: number) => Math.min(0.36, base + Math.max(0, n - 6) * 0.045);

export function DurakBoard({ session }: BoardProps) {
  const view = session.view as DurakView | null;
  const [selected, setSelected] = useState<Card | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  // Measured at animation time so cards can fly out of the actual deck.
  const deckRef = useRef<HTMLDivElement>(null);
  const feltRef = useRef<HTMLDivElement>(null);
  const selfFanRef = useRef<HTMLDivElement>(null);
  const oppFanRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const phase = useDealSequence(view);

  /**
   * The board as it was one view ago.
   *
   * Every card that appears is given an explicit place to come *from*, worked
   * out by comparing against this. We deliberately do not use framer's
   * `layoutId` shared-element transition for that: the hand is a fan, so each
   * card sits inside a rotated slot, and layout projection cannot survive a
   * rotated ancestor — it measured wrong and the card jumped to the table
   * before snapping into place. An explicit origin is immune to that.
   */
  const prev = useRef({
    hand: new Set<Card>(),
    table: new Set<Card>(),
    handSize: 0,
    oppCount: 0,
    discard: 0,
  });

  // A new view means the board moved on; nothing stays picked up.
  useEffect(() => setSelected(null), [session.rev]);

  useEffect(() => {
    if (!view) return;
    prev.current = {
      hand: new Set(view.hand),
      table: new Set(view.table.flatMap((p) => (p.defense ? [p.attack, p.defense] : [p.attack]))),
      handSize: view.hand.length,
      oppCount: view.opponentCount,
      discard: view.discardCount,
    };
  }, [session.rev]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!session.error) return;
    setFlash(session.error);
    const t = setTimeout(() => {
      setFlash(null);
      session.dismissError();
    }, 2200);
    return () => clearTimeout(t);
  }, [session.error]); // eslint-disable-line react-hooks/exhaustive-deps

  const nameOf = (seat: Seat) =>
    session.room?.players.find((p) => p.seat === seat)?.name || (seat === view?.you ? 'You' : 'Them');

  const ctx = useMemo(() => (view ? ctxOfView(view) : null), [view]);

  if (!view || !ctx) {
    return (
      <div className="board board--empty">
        <p className="muted">Dealing…</p>
      </div>
    );
  }

  const me = view.you;
  const them = otherSeat(me);
  const myTurn = view.toAct === me && !view.outcome;
  const iAttack = view.attacker === me;
  const open = undefendedPairs(view.table);

  const send = (a: DurakAction) => session.send(a);

  // --- where does a card that just appeared come from? ---------------------

  const was = prev.current;
  /** The table emptied into somebody's hand rather than into the discard. */
  const tableWasTaken =
    was.table.size > 0 && view.table.length === 0 && view.discardCount === was.discard;

  /** A card landing on the table flies out of whichever hand played it, into
   *  the fixed slot it will occupy for the rest of the bout. */
  const ontoTable = (card: Card, index: number) => ({
    ...flyOntoSlot(
      tableRef.current,
      was.hand.has(card) ? selfFanRef.current : oppFanRef.current,
      SLOT_COLUMNS[index] - 1,
    ),
    scale: 0.84,
  });

  /** A card landing in a hand comes from the table if it was just scooped up,
   *  and out of the stock otherwise. */
  const intoHand = (card: Card, index: number, count: number, lap: number) =>
    tableWasTaken && was.table.has(card)
      ? { ...centreDelta(selfFanRef.current, tableRef.current), scale: 0.9, rotate: 0 }
      : { ...flyFromDeck(deckRef.current, selfFanRef.current, index, count, lap), scale: 0.7, rotate: 14 };

  // --- what can this card do right now? ------------------------------------

  const targetsFor = (card: Card): Card[] =>
    myTurn && !iAttack ? open.filter((p) => canDefendWith(ctx, card, p.attack)).map((p) => p.attack) : [];

  const canTransfer = (card: Card): boolean =>
    myTurn && !iAttack && canTransferWith(ctx, card, view.opponentCount);

  const isPlayable = (card: Card): boolean => {
    if (!myTurn) return false;
    if (iAttack) return canAttackWith(ctx, card, view.opponentCount);
    return targetsFor(card).length > 0 || canTransfer(card);
  };

  const highlightTargets = selected ? targetsFor(selected) : [];
  const selectedCanTransfer = selected ? canTransfer(selected) : false;

  const onHandCard = (card: Card) => {
    if (!myTurn) return;

    if (iAttack) {
      if (canAttackWith(ctx, card, view.opponentCount)) send({ type: 'attack', card });
      return;
    }

    const targets = targetsFor(card);
    const transfer = canTransfer(card);

    // Only one sensible thing to do with it — just do it.
    if (targets.length === 1 && !transfer) {
      send({ type: 'defend', card, target: targets[0] });
      return;
    }
    if (targets.length === 0 && transfer) {
      send({ type: 'transfer', card });
      return;
    }
    if (targets.length === 0 && !transfer) return;

    setSelected((cur) => (cur === card ? null : card));
  };

  const onTableCard = (attack: Card) => {
    if (!selected) return;
    if (!highlightTargets.includes(attack)) return;
    send({ type: 'defend', card: selected, target: attack });
  };

  // --- prose for the status line -------------------------------------------

  const instruction = (): string => {
    if (view.outcome) return '';
    if (!myTurn) {
      if (view.defenderTaking && view.attacker === them) return `${nameOf(them)} may throw in more…`;
      return view.attacker === them ? `${nameOf(them)} is choosing an attack…` : `${nameOf(them)} is thinking…`;
    }
    if (iAttack) {
      if (view.defenderTaking) return `${nameOf(them)} is taking. Throw in more, or close the bout.`;
      if (view.table.length === 0) return 'Lay your attack.';
      return 'Throw in a matching rank, or end the bout.';
    }
    if (view.defenderTaking) return 'You are taking the table.';
    if (selected) return highlightTargets.length ? 'Now pick the card to beat.' : 'Pass the bout along?';
    return open.length > 1 ? 'Beat both cards, or take them.' : 'Beat it, pass it on, or take it.';
  };

  const endLabel = view.defenderTaking ? 'Close the bout' : 'Bout beaten';

  return (
    <div className={`board${myTurn ? ' is-myturn' : ''}`} data-phase={phase}>
      {/* ---------------------------------------------------------------- */}
      <div className="board__opponent">
        <SeatPlate
          name={nameOf(them)}
          role={view.attacker === them ? 'attacking' : 'defending'}
          active={view.toAct === them && !view.outcome}
          count={view.opponentCount}
          online={session.room?.players.find((p) => p.seat === them)?.online ?? true}
        />
        <div className="fan fan--opponent" ref={oppFanRef}>
          <AnimatePresence initial={false}>
            {(phase === 'shuffle' ? [] : Array.from({ length: view.opponentCount })).map((_, i) => {
              const n = view.opponentCount;
              const lap = overlap(n, 0.04);
              const from = flyFromDeck(deckRef.current, oppFanRef.current, i, n, lap, -70);
              return (
                <motion.div
                  key={`b${i}`}
                  className="fan__slot"
                  style={{ zIndex: i, marginInline: `calc(var(--card-w) * ${-lap})` }}
                  initial={{ opacity: 0, x: from.x, y: from.y, scale: 0.7, rotate: -14 }}
                  // Held flat rather than fanned — a squared-off row of backs.
                  animate={{ opacity: 1, x: 0, y: 0, rotate: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.18 } }}
                  transition={{ ...softSpring, delay: phase === 'deal' ? 0.04 + i * 0.075 : 0 }}
                >
                  <PlayingCard card="6S" faceDown />
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      <div className="board__felt" ref={feltRef}>
        <DeckCorner view={view} deckRef={deckRef} />

        <AnimatePresence>
          {phase === 'shuffle' && (
            <ShuffleIntro home={() => centreDelta(feltRef.current, deckRef.current)} />
          )}
        </AnimatePresence>

        <div className="statusline">
          <AnimatePresence mode="wait">
            {phase === 'ready' && (
            <motion.p
              key={instruction()}
              className={`statusline__text${myTurn ? ' is-mine' : ''}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.3 }}
            >
              {instruction()}
            </motion.p>
            )}
          </AnimatePresence>
        </div>

        <div className={`tabletop${view.table.length === 0 ? ' is-empty' : ''}`} ref={tableRef}>
          <AnimatePresence>
            {view.table.length === 0 && !view.outcome && phase === 'ready' && (
              <motion.span
                className="tabletop__hint"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                {iAttack ? 'your attack' : 'waiting'}
              </motion.span>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {view.table.map((pair, i) => {
              const isTarget = highlightTargets.includes(pair.attack);
              return (
                <motion.div
                  key={pair.attack}
                  className={`bout${isTarget ? ' is-target' : ''}`}
                  // `gridRow` is not optional: with only a column set, grid
                  // auto-placement refuses to move backwards along a row, so a
                  // centre-outwards order (3, 4, 2, 5 …) spilled onto new rows
                  // and the table came out as a staircase.
                  style={{ gridColumn: SLOT_COLUMNS[i] ?? i + 1, gridRow: 1 }}
                  exit={{ opacity: 0, y: 40, scale: 0.85, transition: { duration: 0.32, delay: i * 0.04 } }}
                  transition={spring}
                >
                  <PlayingCard
                    card={pair.attack}
                    trumpSuit={view.trumpSuit}
                    target={isTarget}
                    transition={spring}
                    initial={ontoTable(pair.attack, i)}
                    animate={{ x: 0, y: 0, scale: 1, rotate: i % 2 === 0 ? -2.5 : 2.5 }}
                    onClick={() => onTableCard(pair.attack)}
                  />
                  <AnimatePresence>
                    {pair.defense && (
                      <PlayingCard
                        key={pair.defense}
                        card={pair.defense}
                        trumpSuit={view.trumpSuit}
                        className="bout__defense"
                        transition={spring}
                        initial={ontoTable(pair.defense, i)}
                        animate={{ x: 0, y: 0, scale: 1, rotate: 7 }}
                      />
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        <DiscardCorner count={view.discardCount} />

        <AnimatePresence>
          {flash && (
            <motion.div
              className="flash"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
            >
              {flash}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ---------------------------------------------------------------- */}
      <div className="board__self">
        <div className="actionbar">
          <SeatPlate
            name={nameOf(me)}
            role={iAttack ? 'attacking' : 'defending'}
            active={myTurn}
            count={view.hand.length}
            online
            self
          />

          <div className="actionbar__buttons">
            <EmotePalette session={session} />

            {/* Only this one appears and disappears, and only because *you*
                picked up a card — never because the game state twitched. */}
            <AnimatePresence mode="popLayout">
              {selectedCanTransfer && selected && (
                <motion.button
                  key="transfer"
                  layout
                  className="btn btn--clay"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  onClick={() => send({ type: 'transfer', card: selected })}
                >
                  Pass it on ↷
                </motion.button>
              )}
            </AnimatePresence>

            {/* The bout action stays put for the whole bout and greys out when
                it is not available. Mounting it on `canEndBout`/`canTake` made
                it flicker on every single view the server pushed. */}
            {iAttack ? (
              <button
                className="btn btn--solid btn--action"
                disabled={!myTurn || !canEndBout(ctx)}
                onClick={() => send({ type: 'done' })}
              >
                {endLabel}
              </button>
            ) : (
              <button
                className="btn btn--outline btn--action"
                disabled={!myTurn || !canTake(ctx)}
                onClick={() => send({ type: 'take' })}
              >
                Take the table
              </button>
            )}

            <button
              className="btn btn--quiet"
              onClick={() => send({ type: 'sort', order: tidyHand(view.hand, view.trumpSuit, 'suit') })}
              title="Tidy your hand"
            >
              Tidy
            </button>
          </div>
        </div>

        <div className="fan fan--self" ref={selfFanRef}>
          <AnimatePresence initial={false}>
            {(phase === 'shuffle' ? [] : view.hand).map((card, i) => {
              const n = view.hand.length;
              const mid = (n - 1) / 2;
              const spread = Math.min(3.2, 24 / Math.max(n, 1));
              const playable = isPlayable(card);
              const lap = overlap(n, 0.14);
              const from = intoHand(card, i, n, lap);
              return (
                <motion.div
                  key={card}
                  className="fan__slot"
                  initial={{ opacity: 0, ...from }}
                  animate={{
                    opacity: 1,
                    x: 0,
                    y: Math.abs(i - mid) * 2.2 + (selected === card ? -26 : 0),
                    rotate: (i - mid) * spread,
                    scale: 1,
                  }}
                  exit={{ opacity: 0, transition: { duration: 0 } }}
                  transition={{ ...softSpring, delay: phase === 'deal' ? i * 0.075 : 0 }}
                  style={{
                    zIndex: selected === card ? 99 : i,
                    marginInline: `calc(var(--card-w) * ${-lap})`,
                  }}
                  whileHover={playable ? { y: -18 } : { y: -6 }}
                >
                  <PlayingCard
                    card={card}
                    trumpSuit={view.trumpSuit}
                    live={playable}
                    muted={myTurn && !playable}
                    selected={selected === card}
                    transition={spring}
                    onClick={() => onHandCard(card)}
                  />
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>

      <EmoteLayer session={session} />

      <AnimatePresence>
        {view.outcome && (
          <Curtain
            headline={view.outcome.headline
              .replace('{winner}', nameOf(view.outcome.winner ?? me))
              .replace('{loser}', nameOf(view.outcome.winner === null ? them : otherSeat(view.outcome.winner)))}
            detail={view.outcome.detail}
            won={view.outcome.winner === me}
            draw={view.outcome.winner === null}
            session={session}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * A riffle shuffle. Eight backs split into two halves, arc apart, and
 * interleave twice — then the whole stack flies off to the deck corner, so the
 * cards that get dealt visibly come from the pile you just watched being
 * shuffled.
 */
function ShuffleIntro({ home }: { home: () => { x: number; y: number } }) {
  const cards = Array.from({ length: 8 });
  const seconds = SHUFFLE_MS / 1000;

  return (
    <motion.div
      className="shuffle"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ ...home(), opacity: 0, scale: 0.3, transition: { duration: 0.45, ease: [0.5, 0, 0.75, 0] } }}
      transition={{ duration: 0.3 }}
    >
      <div className="shuffle__stack">
        {cards.map((_, i) => {
          const left = i % 2 === 0;
          const reach = left ? -1 : 1;
          return (
            <motion.div
              key={i}
              className="shuffle__card"
              style={{ zIndex: i }}
              animate={{
                x: [0, reach * 62, reach * 30, 0, reach * 52, reach * 24, 0],
                y: [-i * 1.6, -i * 1.6 - 14, -i * 1.6 + 6, -i * 1.6, -i * 1.6 - 12, -i * 1.6 + 4, -i * 1.6],
                rotate: [0, reach * 11, reach * 4, 0, reach * 9, reach * 3, 0],
              }}
              transition={{
                duration: seconds,
                times: [0, 0.14, 0.28, 0.45, 0.62, 0.78, 1],
                ease: 'easeInOut',
                delay: i * 0.012,
              }}
            >
              <PlayingCard card="6S" faceDown />
            </motion.div>
          );
        })}
      </div>
      <motion.p
        className="shuffle__caption"
        animate={{ opacity: [0, 1, 1, 0.4] }}
        transition={{ duration: seconds, times: [0, 0.2, 0.7, 1] }}
      >
        shuffling
      </motion.p>
    </motion.div>
  );
}

function SeatPlate({
  name,
  role,
  active,
  count,
  online,
  self,
}: {
  name: string;
  role: string;
  active: boolean;
  count: number;
  online: boolean;
  self?: boolean;
}) {
  return (
    <div className={`seatplate${active ? ' is-active' : ''}${self ? ' is-self' : ''}`}>
      <span className="seatplate__dot" aria-hidden />
      <span className="seatplate__name">{name}</span>
      <span className="seatplate__role">{role}</span>
      <span className="seatplate__count tnum" title={`${count} cards`}>
        {count}
      </span>
      {!online && <span className="seatplate__away">away</span>}
    </div>
  );
}

function DeckCorner({ view, deckRef }: { view: DurakView; deckRef: React.Ref<HTMLDivElement> }) {
  const shown = Math.min(view.deckCount, 5);
  return (
    <div className="corner corner--deck">
      <div className={`deckstack${view.deckCount === 0 ? ' is-spent' : ''}`} ref={deckRef}>
        <div className="deckstack__trump">
          <PlayingCard card={view.trump} trumpSuit={view.trumpSuit} size="small" />
        </div>
        {view.deckCount > 0 &&
          Array.from({ length: shown }).map((_, i) => (
            <div key={i} className="deckstack__back" style={{ transform: `translate(${i * 1.5}px, ${-i * 1.5}px)` }}>
              <PlayingCard card="6S" faceDown size="small" />
            </div>
          ))}
      </div>
      <div className="corner__meta">
        <span className="corner__num tnum">{view.deckCount}</span>
        <span className="corner__label">
          {view.deckCount === 0 ? 'deck spent' : 'in the deck'}
        </span>
        <span className="corner__trumpsuit" data-red={view.trumpSuit === 'H' || view.trumpSuit === 'D'}>
          {SUIT_SYMBOL[view.trumpSuit]} trump
        </span>
      </div>
    </div>
  );
}

function DiscardCorner({ count }: { count: number }) {
  return (
    <div className="corner corner--discard">
      <div className={`discardpile${count === 0 ? ' is-empty' : ''}`}>
        {Array.from({ length: Math.min(count, 4) }).map((_, i) => (
          <span key={i} className="discardpile__slab" style={{ transform: `rotate(${(i - 1.5) * 4}deg)` }} />
        ))}
      </div>
      <div className="corner__meta corner__meta--right">
        <span className="corner__num tnum">{count}</span>
        <span className="corner__label">discarded</span>
      </div>
    </div>
  );
}

/** A trigger plus a popover grid — twelve things do not fit in a row. */
function EmotePalette({ session }: BoardProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="emotes">
      <AnimatePresence>
        {open && (
          <>
            <div className="emotes__catch" onClick={() => setOpen(false)} />
            <motion.div
              className="emotes__grid"
              initial={{ opacity: 0, y: 8, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.94 }}
              transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            >
              {EMOTES.map((e) => (
                <button
                  key={e.kind}
                  className={`emotes__btn${e.text ? ' is-text' : ''}`}
                  title={e.label}
                  aria-label={e.label}
                  onClick={() => {
                    session.emote(e.kind);
                    setOpen(false);
                  }}
                >
                  {e.text ?? e.glyph}
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <button
        className={`emotes__trigger${open ? ' is-open' : ''}`}
        aria-label="Throw something across the table"
        onClick={() => setOpen((o) => !o)}
      >
        ♥
      </button>
    </div>
  );
}

function EmoteLayer({ session }: BoardProps) {
  const view = session.view as DurakView | null;
  return (
    <div className="emotelayer" aria-hidden>
      <AnimatePresence>
        {session.emotes.slice(-8).map((e) => {
          const emote = emoteOf(e.kind);
          const mine = e.from === view?.you;
          const drift = (Math.random() - 0.5) * 260;
          return (
            <motion.span
              key={e.id}
              className={`emote${mine ? ' is-mine' : ''}${emote.text ? ' is-text' : ''}`}
              initial={{ opacity: 0, y: mine ? 70 : -70, scale: 0.4, x: drift, rotate: drift / 26 }}
              animate={{
                opacity: [0, 1, 1, 0],
                y: mine ? -190 : 190,
                scale: [0.4, 1.3, 1.05, 0.95],
                rotate: [drift / 26, -drift / 40, drift / 60],
              }}
              exit={{ opacity: 0 }}
              transition={{ duration: 2.6, ease: 'easeOut' }}
            >
              {emote.text ?? emote.glyph}
            </motion.span>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

function Curtain({
  headline,
  detail,
  won,
  draw,
  session,
}: {
  headline: string;
  detail?: string;
  won: boolean;
  draw: boolean;
  session: BoardProps['session'];
}) {
  const waiting = session.rematchPending !== null;
  const iAsked = session.rematchPending === (session.view as DurakView).you;
  return (
    <motion.div
      className="curtain"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      <motion.div
        className="curtain__panel"
        initial={{ y: 26, opacity: 0, scale: 0.97 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.12 }}
      >
        <p className="eyebrow">{draw ? 'no fool tonight' : won ? 'you are clean' : 'the fool'}</p>
        <h2 className="curtain__headline display">{headline}</h2>
        {detail && <p className="curtain__detail muted">{detail}</p>}
        <div className="curtain__actions">
          <button className="btn btn--solid" onClick={() => session.rematch()} disabled={iAsked}>
            {iAsked ? 'Waiting for them…' : waiting ? 'They want another — deal' : 'Deal again'}
          </button>
          <a className="btn btn--quiet" href="#/">
            Back to the boat
          </a>
        </div>
      </motion.div>
    </motion.div>
  );
}
