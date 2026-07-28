import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { getGame } from '@shared/games/registry.ts';
import { getGameUI } from '../games/registry.tsx';
import { navigate } from '../lib/router.ts';
import type { OnlineSession } from '../net/useOnlineSession.ts';
import { useName } from '../lib/identity.ts';
import { partnerOf } from '../lib/people.ts';
import { Check, Copy, Spinner } from './icons.tsx';

interface Props {
  code: string;
  online: OnlineSession<unknown>;
}

/** The room: a waiting card until both chairs are warm, then the game. */
export function Table({ code, online }: Props) {
  const joined = online.room?.code === code;
  const [started, setStarted] = useState(false);
  // The session object is a fresh identity on every view, so ask to sit down
  // exactly once per code rather than on every render.
  const asked = useRef<string | null>(null);

  useEffect(() => {
    if (joined) return;
    // Ask once per code — but if the socket has fallen back to idle (a torn
    // down connection, a failed first attempt), ask again.
    if (asked.current === code && online.status !== 'idle') return;
    asked.current = code;
    online.joinTable(code);
  }, [code, joined, online.status]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (online.bothPresent) setStarted(true);
  }, [online.bothPresent]);

  const gameId = online.room?.gameId;
  const ui = gameId ? getGameUI(gameId) : undefined;

  if (online.error && !online.room) {
    return (
      <div className="page waiting">
        <p className="notice notice--warn">{online.error}</p>
        <button className="btn btn--ghost" onClick={() => navigate({ name: 'home' })}>
          Back to the boat
        </button>
      </div>
    );
  }

  if (!joined || !ui || !gameId) {
    return (
      <div className="page waiting">
        <div className="waiting__spin">
          <Spinner size={22} />
        </div>
        <p className="muted">Rowing over…</p>
      </div>
    );
  }

  if (!started) {
    return <WaitingRoom code={code} online={online} gameId={gameId} />;
  }

  return (
    <>
      {!online.bothPresent && (
        <div className="banner">
          <Spinner size={13} />
          <span>Waiting for them to come back…</span>
        </div>
      )}
      <ui.Board session={online} />
    </>
  );
}

function WaitingRoom({ code, online, gameId }: { code: string; online: OnlineSession<unknown>; gameId: string }) {
  const [copied, setCopied] = useState<'link' | 'code' | null>(null);
  const [name] = useName();
  const partner = partnerOf(name);
  const meta = getGame(gameId)?.meta;
  const link = `${location.origin}${location.pathname}#/t/${code}`;

  const copy = async (what: 'link' | 'code') => {
    try {
      await navigator.clipboard.writeText(what === 'link' ? link : code);
      setCopied(what);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      setCopied(null);
    }
  };

  return (
    <motion.div
      className="page waiting"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
    >
      <p className="eyebrow">{meta?.title ?? 'Table'} · table open</p>

      <div className="codeplate" aria-label={`Room code ${code.split('').join(' ')}`}>
        {code.split('').map((ch, i) => (
          <motion.span
            key={i}
            className="codeplate__ch display"
            initial={{ opacity: 0, y: 16, rotate: -4 }}
            animate={{ opacity: 1, y: 0, rotate: 0 }}
            transition={{ delay: 0.1 + i * 0.07, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          >
            {ch}
          </motion.span>
        ))}
      </div>

      <p className="waiting__lede">
        Send this to {partner}. Tapping the link is enough — the four letters are only
        there for when you would rather say them out loud.
      </p>

      <div className="waiting__actions">
        <button className="btn btn--solid" onClick={() => copy('link')}>
          {copied === 'link' ? <Check /> : <Copy />}
          {copied === 'link' ? 'Link copied' : 'Copy invite link'}
        </button>
        <button className="btn btn--ghost" onClick={() => copy('code')}>
          {copied === 'code' ? 'Code copied' : 'Copy just the code'}
        </button>
      </div>

      <div className="waiting__chairs">
        {[0, 1].map((seat) => {
          const p = online.room?.players.find((x) => x.seat === seat);
          return (
            <div key={seat} className={`chair${p?.online ? ' is-filled' : ''}`}>
              <span className="chair__dot" aria-hidden />
              <span className="chair__name">{p?.online ? p.name : 'empty chair'}</span>
            </div>
          );
        })}
      </div>

      <motion.p
        className="waiting__pulse faint"
        animate={{ opacity: [0.35, 0.9, 0.35] }}
        transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
      >
        waiting for the other chair
      </motion.p>
    </motion.div>
  );
}
