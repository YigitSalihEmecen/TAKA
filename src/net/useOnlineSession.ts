/**
 * WebSocket backend.
 *
 * Connects lazily (nothing opens until you actually create or join a table),
 * reconnects with a backoff, and replays the last intent — create or join —
 * so a dropped train tunnel does not cost you the game.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  WS_PATH,
  decode,
  encode,
  type ClientMessage,
  type EmoteKind,
  type ServerMessage,
} from '@shared/protocol.ts';
import type { Seat } from '@shared/games/types.ts';
import {
  getClientId,
  getStoredPass,
  storePass,
  type ConnectionStatus,
  type EmoteEvent,
  type RoomInfo,
  type Session,
} from './session.ts';

type Intent = { kind: 'create'; gameId: string } | { kind: 'join'; code: string } | null;

function socketUrl(): string {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}${WS_PATH}`;
}

export interface OnlineSession<V> extends Session<V> {
  createTable(gameId: string): void;
  joinTable(code: string): void;
  setName(name: string): void;
  /** Save a passphrase and try the door again. */
  unlock(pass: string): void;
}

export function useOnlineSession<V>(name: string): OnlineSession<V> {
  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [view, setView] = useState<V | null>(null);
  const [rev, setRev] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [rematchPending, setRematchPending] = useState<Seat | null>(null);
  const [emotes, setEmotes] = useState<EmoteEvent[]>([]);
  const [locked, setLocked] = useState(false);

  const ws = useRef<WebSocket | null>(null);
  const intent = useRef<Intent>(null);
  const attempts = useRef(0);
  const retryTimer = useRef<number | null>(null);
  const closing = useRef(false);
  const nameRef = useRef(name);
  nameRef.current = name;

  const push = useCallback((msg: ClientMessage) => {
    const sock = ws.current;
    if (sock && sock.readyState === WebSocket.OPEN) sock.send(encode(msg));
  }, []);

  const connect = useCallback(() => {
    if (ws.current && ws.current.readyState <= WebSocket.OPEN) return;
    setStatus((s) => (s === 'live' ? 'reconnecting' : 'connecting'));

    const sock = new WebSocket(socketUrl());
    ws.current = sock;

    sock.onopen = () => {
      attempts.current = 0;
      sock.send(
        encode({ t: 'hello', clientId: getClientId(), name: nameRef.current, pass: getStoredPass() }),
      );
      // Re-state what we were doing. The server hands back the same seat.
      const want = intent.current;
      if (want?.kind === 'create') {
        // A reconnect must not deal a brand new table — rejoin the old one.
        sock.send(encode({ t: 'create', gameId: want.gameId }));
      } else if (want?.kind === 'join') {
        sock.send(encode({ t: 'join', code: want.code }));
      }
      setStatus('live');
    };

    sock.onmessage = (ev) => {
      const msg = decode<ServerMessage>(String(ev.data));
      if (!msg) return;
      switch (msg.t) {
        case 'room':
          setRoom({ code: msg.code, gameId: msg.gameId, seat: msg.seat, players: msg.players });
          // Once we hold a code, reconnects should rejoin rather than recreate.
          intent.current = { kind: 'join', code: msg.code };
          break;
        case 'view':
          setView(msg.view as V);
          setRev(msg.rev);
          break;
        case 'rematch':
          setRematchPending(msg.pending);
          break;
        case 'emote':
          setEmotes((list) => [...list.slice(-6), { id: Date.now() + Math.random(), from: msg.from, kind: msg.kind }]);
          break;
        case 'left':
          setRoom(null);
          setView(null);
          break;
        case 'error':
          if (msg.code === 'auth') {
            // Do not drop the intent — once unlocked we carry straight on to
            // the table she was trying to reach.
            setLocked(true);
            setStatus('idle');
            break;
          }
          setError(msg.message);
          if (msg.fatal) intent.current = null;
          break;
      }
    };

    const bail = () => {
      if (closing.current) return;
      ws.current = null;
      if (!intent.current) {
        setStatus('idle');
        return;
      }
      setStatus('reconnecting');
      const delay = Math.min(800 * 2 ** attempts.current, 8000);
      attempts.current += 1;
      retryTimer.current = window.setTimeout(connect, delay);
    };

    sock.onclose = bail;
    sock.onerror = () => sock.close();
  }, []);

  useEffect(() => {
    // Reset on every mount: React 18's double-invoked effects would otherwise
    // leave this latched on and silently disable reconnection for the session.
    closing.current = false;
    return () => {
      closing.current = true;
      if (retryTimer.current) window.clearTimeout(retryTimer.current);
      ws.current?.close();
    };
  }, []);

  // A phone that has been asleep reports "open" on a dead socket. Nudge it.
  useEffect(() => {
    const wake = () => {
      if (document.visibilityState !== 'visible') return;
      if (!intent.current) return;
      if (!ws.current || ws.current.readyState > WebSocket.OPEN) connect();
      else push({ t: 'ping' });
    };
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('online', wake);
    return () => {
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('online', wake);
    };
  }, [connect, push]);

  const createTable = useCallback(
    (gameId: string) => {
      setError(null);
      setView(null);
      setRoom(null);
      intent.current = { kind: 'create', gameId };
      if (ws.current?.readyState === WebSocket.OPEN) push({ t: 'create', gameId });
      else connect();
    },
    [connect, push],
  );

  const joinTable = useCallback(
    (code: string) => {
      setError(null);
      setView(null);
      intent.current = { kind: 'join', code: code.toUpperCase() };
      if (ws.current?.readyState === WebSocket.OPEN) push({ t: 'join', code: code.toUpperCase() });
      else connect();
    },
    [connect, push],
  );

  const leave = useCallback(() => {
    intent.current = null;
    push({ t: 'leave' });
    setRoom(null);
    setView(null);
    setRematchPending(null);
    setError(null);
    ws.current?.close();
    ws.current = null;
    setStatus('idle');
  }, [push]);

  const unlock = useCallback(
    (pass: string) => {
      storePass(pass.trim());
      setLocked(false);
      setError(null);
      connect();
    },
    [connect],
  );

  const bothPresent = !!room && room.players.filter((p) => p.online).length >= 2;

  return useMemo<OnlineSession<V>>(
    () => ({
      kind: 'online',
      status,
      room,
      view,
      rev,
      error,
      dismissError: () => setError(null),
      locked,
      bothPresent,
      send: (action) => push({ t: 'action', action }),
      rematch: () => push({ t: 'rematch' }),
      rematchPending,
      emote: (kind: EmoteKind) => push({ t: 'emote', kind }),
      emotes,
      leave,
      createTable,
      joinTable,
      setName: (n: string) => push({ t: 'rename', name: n }),
      unlock,
    }),
    [status, room, view, rev, error, locked, bothPresent, rematchPending, emotes, push, leave, createTable, joinTable, unlock],
  );
}
