import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { getGame } from '@shared/games/registry.ts';
import { ROOM_CODE_LENGTH } from '@shared/protocol.ts';
import { getGameUI } from '../games/registry.tsx';
import { navigate } from '../lib/router.ts';
import type { OnlineSession } from '../net/useOnlineSession.ts';
import { BOT_NAME } from '../net/useSoloSession.ts';
import { useName } from '../lib/identity.ts';
import { partnerOf } from '../lib/people.ts';
import { Bot, Spinner, Users } from './icons.tsx';

interface Props {
  gameId: string;
  online: OnlineSession<unknown>;
}

export function Setup({ gameId, online }: Props) {
  const def = getGame(gameId);
  const ui = getGameUI(gameId);
  const [creating, setCreating] = useState(false);
  const [code, setCode] = useState('');
  const [open, setOpen] = useState<number | null>(0);
  const [name] = useName();
  const partner = partnerOf(name);

  // Once the server hands back a room, walk into it.
  useEffect(() => {
    if (creating && online.room) navigate({ name: 'table', code: online.room.code });
  }, [creating, online.room]);

  if (!def || !ui) {
    return (
      <div className="page">
        <p className="muted">That game does not exist yet.</p>
      </div>
    );
  }

  const submitJoin = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = code.trim().toUpperCase();
    if (clean.length !== ROOM_CODE_LENGTH) return;
    navigate({ name: 'table', code: clean });
  };

  return (
    <motion.div
      className="page setup"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="setup__head">
        <span className="setup__glyph" aria-hidden>
          {def.meta.glyph}
        </span>
        <div>
          <p className="eyebrow">{def.meta.subtitle}</p>
          <h1 className="setup__title display">{def.meta.title}</h1>
        </div>
      </div>

      <p className="setup__blurb">{def.meta.blurb}</p>

      <div className="choices">
        <button
          className="choice choice--primary"
          disabled={creating}
          onClick={() => {
            setCreating(true);
            online.createTable(gameId);
          }}
        >
          <span className="choice__icon">{creating ? <Spinner /> : <Users />}</span>
          <span className="choice__text">
            <span className="choice__title">{creating ? 'Setting the table…' : 'Open a table'}</span>
            <span className="choice__sub">Four letters to send {partner}. Then wait for the chair to fill.</span>
          </span>
          <span className="choice__arrow" aria-hidden>
            →
          </span>
        </button>

        {def.meta.hasBot && (
          <button className="choice" onClick={() => navigate({ name: 'solo', gameId })}>
            <span className="choice__icon">
              <Bot />
            </span>
            <span className="choice__text">
              <span className="choice__title">Play {BOT_NAME}</span>
              <span className="choice__sub">A patient opponent, for when the other chair is empty.</span>
            </span>
            <span className="choice__arrow" aria-hidden>
              →
            </span>
          </button>
        )}
      </div>

      <form className="joinrow" onSubmit={submitJoin}>
        <span className="joinrow__label eyebrow">Got four letters?</span>
        <input
          className="codeinput"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
          maxLength={ROOM_CODE_LENGTH}
          placeholder="····"
          aria-label="Room code"
          spellCheck={false}
          autoComplete="off"
        />
        <button className="btn btn--ghost" type="submit" disabled={code.length !== ROOM_CODE_LENGTH}>
          Sit down
        </button>
      </form>

      {online.error && <p className="notice notice--warn">{online.error}</p>}

      <section className="rules">
        <div className="shelf__head">
          <h2 className="eyebrow">How it plays</h2>
          <hr className="rule" />
        </div>
        <ul className="rules__list">
          {ui.howToPlay.map((item, i) => (
            <li key={item.title} className={`rules__item${open === i ? ' is-open' : ''}`}>
              <button className="rules__trigger" onClick={() => setOpen(open === i ? null : i)}>
                <span className="rules__no tnum">{String(i + 1).padStart(2, '0')}</span>
                <span className="rules__title">{item.title}</span>
                <span className="rules__chev" aria-hidden>
                  {open === i ? '−' : '+'}
                </span>
              </button>
              <AnimatePresence initial={false}>
                {open === i && (
                  <motion.div
                    className="rules__bodywrap"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <p className="rules__body">{item.body}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </li>
          ))}
        </ul>
      </section>
    </motion.div>
  );
}
