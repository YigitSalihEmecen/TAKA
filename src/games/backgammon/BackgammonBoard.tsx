import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { otherSeat, type Seat } from '@shared/games/types.ts';
import type { BackgammonAction, BackgammonView } from '@shared/games/backgammon/index.ts';
import { BAR, OFF, type Move } from '@shared/games/backgammon/rules.ts';
import { EMOTES, emoteOf } from '@shared/protocol.ts';
import type { BoardProps } from '../registry.tsx';
import './backgammon.css';

const spring = { type: 'spring' as const, stiffness: 420, damping: 34 };

/**
 * The board is stored in one absolute frame; each player should see their own
 * home board bottom-right. Mirroring the index for seat 1 means one layout
 * serves both, and the direction of travel looks the same to both players.
 */
const absOf = (visual: number, you: Seat) => (you === 0 ? visual : 23 - visual);

/**
 * Screen layout, in visual indices.
 *   top row, left to right:    12 … 17 | bar | 18 … 23
 *   bottom row, left to right: 11 …  6 | bar |  5 …  0
 * which puts the viewer's home board bottom-right, as on a real board.
 */
const TOP_ROW = [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];
const BOTTOM_ROW = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0];

type Spot = typeof BAR | number;

export function BackgammonBoard({ session }: BoardProps) {
  const view = session.view as BackgammonView | null;
  const [picked, setPicked] = useState<Spot | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => setPicked(null), [session.rev]);

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

  // With a checker on the bar nothing else may move, so pick it up for them.
  const forcedBar = !!view && view.legal.some((m) => m.from === BAR);
  const from: Spot | null = forcedBar ? BAR : picked;

  const targets = useMemo(
    () => (view && from !== null ? view.legal.filter((m) => m.from === from) : []),
    [view, from],
  );

  if (!view) {
    return (
      <div className="bg bg--empty">
        <p className="muted">Setting out…</p>
      </div>
    );
  }

  const me = view.you;
  const them = otherSeat(me);
  const myTurn = view.toAct === me && !view.outcome;
  // Changes only when a fresh throw lands, which is what makes the dice tumble.
  const rollKey = `${view.turn}:${view.rolled.join(',')}:${view.phase}`;
  const send = (a: BackgammonAction) => session.send(a);

  const sources = new Set(view.legal.map((m) => String(m.from)));

  const play = (move: Move) => {
    send({ type: 'move', from: move.from, to: move.to, die: move.die });
    setPicked(null);
  };

  const onSpot = (spot: Spot) => {
    if (!myTurn) return;
    if (from !== null) {
      const hit = targets.find((m) => String(m.to) === String(spot));
      if (hit) return play(hit);
    }
    if (!sources.has(String(spot))) return;
    const mine = view.legal.filter((m) => String(m.from) === String(spot));
    if (mine.length === 1) return play(mine[0]);
    setPicked((cur) => (String(cur) === String(spot) ? null : spot));
  };

  const status = (): string => {
    if (view.outcome) return '';
    if (view.phase === 'opening') {
      if (view.opening[me] === null) return 'Throw a die to see who starts.';
      return `Waiting for ${nameOf(them)} to throw…`;
    }
    if (!myTurn) return `${nameOf(them)} is playing…`;
    if (view.phase === 'roll') return 'Your turn — roll.';
    if (view.legal.length === 0) return 'Nothing to play.';
    if (forcedBar) return 'You are on the bar — come back in.';
    if (from !== null) return 'Now pick where it goes.';
    return `${view.dice.length} to play.`;
  };

  const countAt = (abs: number, seat: Seat) => {
    const v = view.points[abs];
    return seat === 0 ? Math.max(0, v) : Math.max(0, -v);
  };

  const renderPoint = (vis: number, row: 'top' | 'bottom') => {
    const abs = absOf(vis, me);
    const mine = countAt(abs, me);
    const theirs = countAt(abs, them);
    const isTarget = targets.some((m) => m.to === abs);
    const isPicked = from === abs;
    const canPick = myTurn && sources.has(String(abs));

    return (
      <button
        key={vis}
        className={`pt pt--${row}${vis % 2 === 0 ? ' pt--dark' : ''}${isTarget ? ' is-target' : ''}${
          isPicked ? ' is-picked' : ''
        }${canPick ? ' is-source' : ''}`}
        onClick={() => onSpot(abs)}
        aria-label={`point ${abs + 1}`}
      >
        <span className="pt__wedge" aria-hidden />
        <span className="pt__stack">
          <Checkers count={mine} owner="me" />
          <Checkers count={theirs} owner="them" />
        </span>
      </button>
    );
  };

  const offTargets = targets.some((m) => m.to === OFF);

  return (
    <div className={`bg${myTurn ? ' is-myturn' : ''}`}>
      <div className="bg__rail">
        <SeatPlate name={nameOf(them)} pips={view.pips[them]} off={view.off[them]} active={view.toAct === them && !view.outcome} />
      </div>

      <div className="bg__statusline">
        <AnimatePresence mode="wait">
          <motion.p
            key={status()}
            className={`bg__status${myTurn ? ' is-mine' : ''}`}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.25 }}
          >
            {status()}
          </motion.p>
        </AnimatePresence>
      </div>

      <div className="bg__board">
        <div className="bg__row bg__row--top">
          {TOP_ROW.slice(0, 6).map((v) => renderPoint(v, 'top'))}
          <span className="bg__gap" aria-hidden />
          {TOP_ROW.slice(6).map((v) => renderPoint(v, 'top'))}
        </div>

        <div className="bg__mid">
          <button
            className={`bg__bar${forcedBar ? ' is-picked' : ''}`}
            onClick={() => onSpot(BAR)}
            aria-label="the bar"
          >
            <span className="bg__barlabel">bar</span>
            <span className="bg__barstack">
              <Checkers count={view.bar[them]} owner="them" />
              <Checkers count={view.bar[me]} owner="me" />
            </span>
          </button>

          <div className="bg__dice">
            {view.rolled.map((d, i) => {
              // A die still to be played is one of the values left in `dice`.
              const spent = view.dice.filter((x) => x === d).length;
              const shownBefore = view.rolled.slice(0, i).filter((x) => x === d).length;
              return <Die key={i} value={d} used={shownBefore >= spent} rollKey={rollKey} />;
            })}
          </div>
        </div>

        <div className="bg__row bg__row--bottom">
          {BOTTOM_ROW.slice(0, 6).map((v) => renderPoint(v, 'bottom'))}
          <span className="bg__gap" aria-hidden />
          {BOTTOM_ROW.slice(6).map((v) => renderPoint(v, 'bottom'))}
        </div>

      </div>

      <div className="bg__rail bg__rail--self">
        <SeatPlate name={nameOf(me)} pips={view.pips[me]} off={view.off[me]} active={myTurn} self />

        <div className="bg__actions">
          <button
            className={`bg__off${offTargets ? ' is-target' : ''}`}
            disabled={!offTargets}
            onClick={() => {
              const hit = targets.find((m) => m.to === OFF);
              if (hit) play(hit);
            }}
            aria-label="bear off"
          >
            <span className="bg__offcount tnum">{view.off[me]}</span>
            <span className="bg__offlabel">off</span>
          </button>
          <EmotePalette session={session} />
          <button
            className="btn btn--solid btn--action"
            disabled={!myTurn || (view.phase !== 'roll' && view.phase !== 'opening')}
            onClick={() => send({ type: 'roll' })}
          >
            {view.phase === 'opening' ? 'Throw' : 'Roll'}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {flash && (
          <motion.div className="flash" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {flash}
          </motion.div>
        )}
      </AnimatePresence>

      <EmoteLayer session={session} />

      <AnimatePresence>
        {view.outcome && (
          <Curtain
            headline={view.outcome.headline
              .replace('{winner}', nameOf(view.outcome.winner ?? me))
              .replace('{loser}', nameOf(view.outcome.winner === null ? them : otherSeat(view.outcome.winner)))}
            detail={view.outcome.detail}
            won={view.outcome.winner === me}
            session={session}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------

/** Up to five checkers are drawn; beyond that the top one carries a count. */
function Checkers({ count, owner }: { count: number; owner: 'me' | 'them' }) {
  if (count === 0) return null;
  const shown = Math.min(count, 5);
  return (
    <>
      {Array.from({ length: shown }).map((_, i) => (
        <motion.span
          key={i}
          className={`chk chk--${owner}`}
          layout
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={spring}
        >
          {i === shown - 1 && count > 5 ? <span className="chk__more tnum">{count}</span> : null}
        </motion.span>
      ))}
    </>
  );
}

/**
 * One die.
 *
 * The element is keyed by position, never by value, so a new throw animates in
 * place instead of unmounting and remounting — that swap was the flicker. On a
 * fresh throw it tumbles through a few random faces before settling on the
 * real one.
 */
function Die({ value, used, rollKey }: { value: number; used: boolean; rollKey: string }) {
  const [face, setFace] = useState(value);
  const [tumbling, setTumbling] = useState(false);

  useEffect(() => {
    let n = 0;
    setTumbling(true);
    const id = setInterval(() => {
      n += 1;
      if (n >= 6) {
        clearInterval(id);
        setFace(value);
        setTumbling(false);
      } else {
        setFace(1 + Math.floor(Math.random() * 6));
      }
    }, 55);
    return () => {
      clearInterval(id);
      setFace(value);
      setTumbling(false);
    };
  }, [rollKey, value]);

  return (
    <motion.span
      className={`die${used ? ' is-used' : ''}`}
      animate={
        tumbling
          ? { rotate: [0, -14, 12, -8, 0], scale: [1, 1.14, 0.96, 1.06, 1], y: [0, -7, 2, -3, 0] }
          : { rotate: 0, scale: 1, y: 0 }
      }
      transition={tumbling ? { duration: 0.34, ease: 'easeInOut' } : spring}
    >
      <Pips value={face} />
    </motion.span>
  );
}

function Pips({ value }: { value: number }) {
  const layout: Record<number, number[]> = {
    1: [4],
    2: [0, 8],
    3: [0, 4, 8],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8],
  };
  const on = new Set(layout[value] ?? []);
  return (
    <span className="die__face" aria-label={String(value)}>
      {Array.from({ length: 9 }).map((_, i) => (
        <span key={i} className={on.has(i) ? 'die__pip' : 'die__pip is-off'} />
      ))}
    </span>
  );
}

function SeatPlate({
  name,
  pips,
  off,
  active,
  self,
}: {
  name: string;
  pips: number;
  off: number;
  active: boolean;
  self?: boolean;
}) {
  return (
    <div className={`seatplate${active ? ' is-active' : ''}${self ? ' is-self' : ''}`}>
      <span className="seatplate__dot" aria-hidden />
      <span className="seatplate__name">{name}</span>
      <span className="seatplate__role">{pips} pips</span>
      <span className="seatplate__count tnum" title="borne off">
        {off}/15
      </span>
    </div>
  );
}

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
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            >
              {EMOTES.map((e) => (
                <button
                  key={e.kind}
                  className={`emotes__btn${e.text ? ' is-text' : ''}`}
                  title={e.label}
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
        aria-label="Throw something across the board"
        onClick={() => setOpen((o) => !o)}
      >
        ♥
      </button>
    </div>
  );
}

function EmoteLayer({ session }: BoardProps) {
  const view = session.view as BackgammonView | null;
  return (
    <div className="emotelayer" aria-hidden>
      <AnimatePresence>
        {session.emotes.slice(-8).map((e) => {
          const emote = emoteOf(e.kind);
          const mine = e.from === view?.you;
          const drift = (Math.random() - 0.5) * 240;
          return (
            <motion.span
              key={e.id}
              className={`emote${mine ? ' is-mine' : ''}${emote.text ? ' is-text' : ''}`}
              initial={{ opacity: 0, y: mine ? 60 : -60, scale: 0.4, x: drift }}
              animate={{ opacity: [0, 1, 1, 0], y: mine ? -170 : 170, scale: [0.4, 1.25, 1, 0.9] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 2.4, ease: 'easeOut' }}
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
  session,
}: {
  headline: string;
  detail?: string;
  won: boolean;
  session: BoardProps['session'];
}) {
  const view = session.view as BackgammonView;
  const iAsked = session.rematchPending === view.you;
  const waiting = session.rematchPending !== null;
  return (
    <motion.div className="curtain" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div
        className="curtain__panel"
        initial={{ y: 24, opacity: 0, scale: 0.97 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
      >
        <p className="eyebrow">{won ? 'all fifteen home' : 'not this time'}</p>
        <h2 className="curtain__headline display">{headline}</h2>
        {detail && <p className="curtain__detail muted">{detail}</p>}
        <div className="curtain__actions">
          <button className="btn btn--solid" onClick={() => session.rematch()} disabled={iAsked}>
            {iAsked ? 'Waiting for them…' : waiting ? 'They want another — set out' : 'Set out again'}
          </button>
          <a className="btn btn--quiet" href="#/">
            Back to the boat
          </a>
        </div>
      </motion.div>
    </motion.div>
  );
}
