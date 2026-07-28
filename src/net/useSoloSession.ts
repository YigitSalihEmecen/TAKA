/**
 * Solo backend — the same referee, running in your tab, with a bot in seat 1.
 *
 * It deliberately reuses the game definition's `reduce` and `view`, so the bot
 * only ever sees what a remote opponent would see. No peeking at the deck.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getGame } from '@shared/games/registry.ts';
import type { Seat } from '@shared/games/types.ts';
import type { EmoteKind } from '@shared/protocol.ts';
import type { EmoteEvent, Session } from './session.ts';

const YOU: Seat = 0;
const BOT: Seat = 1;

export const BOT_NAME = 'Zoya';

export function useSoloSession<V>(gameId: string, yourName: string): Session<V> {
  const def = getGame(gameId)!;
  // Boxed so React never mistakes a state object for an updater function.
  const [box, setBox] = useState<{ s: unknown }>(() => ({ s: def.create(Math.floor(Math.random() * 2 ** 31)) }));
  const state = box.s;
  const [rev, setRev] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [emotes, setEmotes] = useState<EmoteEvent[]>([]);
  const timer = useRef<number | null>(null);

  const view = useMemo(() => def.view(state, YOU) as V, [def, state, rev]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = useCallback(
    (action: unknown) => {
      setBox((prev) => {
        const res = def.reduce(prev.s, YOU, action);
        if (!res.ok) {
          setError(res.error);
          return prev;
        }
        setRev((r) => r + 1);
        return { s: res.state };
      });
    },
    [def],
  );

  // Let the bot take its turn — repeatedly, since it may attack, then close.
  useEffect(() => {
    if (!def.bot) return;
    if (def.outcome(state)) return;
    const botView = def.view(state, BOT);
    const move = def.bot(botView);
    if (!move) return;

    timer.current = window.setTimeout(
      () => {
        setBox((prev) => {
          const res = def.reduce(prev.s, BOT, move);
          if (!res.ok) return prev;
          setRev((r) => r + 1);
          return { s: res.state };
        });
      },
      def.botDelay ?? 700,
    );

    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [def, state, rev]);

  const rematch = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    setBox({ s: def.create(Math.floor(Math.random() * 2 ** 31)) });
    setRev((r) => r + 1);
  }, [def]);

  return useMemo<Session<V>>(
    () => ({
      kind: 'solo',
      status: 'live',
      room: {
        code: 'SOLO',
        gameId,
        seat: YOU,
        players: [
          { seat: YOU, name: yourName || 'You', online: true },
          { seat: BOT, name: BOT_NAME, online: true },
        ],
      },
      view,
      rev,
      error,
      dismissError: () => setError(null),
      locked: false,
      bothPresent: true,
      send,
      rematch,
      rematchPending: null,
      emote: (kind: EmoteKind) =>
        setEmotes((l) => [...l.slice(-6), { id: Date.now() + Math.random(), from: YOU, kind }]),
      emotes,
      leave: () => {},
    }),
    [gameId, yourName, view, rev, error, send, rematch, emotes],
  );
}
