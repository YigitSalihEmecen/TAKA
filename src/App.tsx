import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { getGame } from '@shared/games/registry.ts';
import { Gate } from './components/Gate.tsx';
import { Home } from './components/Home.tsx';
import { Setup } from './components/Setup.tsx';
import { SoloTable } from './components/SoloTable.tsx';
import { Table } from './components/Table.tsx';
import { TopBar } from './components/TopBar.tsx';
import { getGameUI } from './games/registry.tsx';
import { displayName, useName } from './lib/identity.ts';
import { hrefFor, useRoute, type Route } from './lib/router.ts';
import { useTheme } from './lib/theme.ts';
import { useOnlineSession } from './net/useOnlineSession.ts';
import { BOT_NAME } from './net/useSoloSession.ts';

export default function App() {
  const route = useRoute();
  const [theme, toggleTheme] = useTheme();
  const [name] = useName();
  const online = useOnlineSession<unknown>(displayName(name, 'Player'));

  // Keep the server's copy of your name in step with the field.
  useEffect(() => {
    online.setName(displayName(name, 'Player'));
  }, [name]); // eslint-disable-line react-hooks/exhaustive-deps

  const gameId =
    route.name === 'setup' || route.name === 'solo'
      ? route.gameId
      : route.name === 'table'
        ? online.room?.gameId
        : undefined;
  const title = gameId ? getGame(gameId)?.meta.title : undefined;

  const back: Route | undefined =
    route.name === 'home' ? undefined : gameId ? { name: 'setup', gameId } : { name: 'home' };

  const rightSlot =
    route.name === 'table' && online.room ? (
      <span className={`pill${online.status === 'live' ? ' is-live' : ''}`}>
        <span className="pill__dot" aria-hidden />
        {online.room.code}
      </span>
    ) : route.name === 'solo' ? (
      <span className="pill">
        <span className="pill__dot" aria-hidden />
        vs {BOT_NAME}
      </span>
    ) : null;

  return (
    <div className="app">
      <TopBar back={back} crumb={title} theme={theme} onToggleTheme={toggleTheme} right={rightSlot} />

      <main className="app__main">
        <AnimatePresence mode="wait">
          <motion.div
            key={hrefFor(route)}
            className="app__route"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.24 }}
          >
            <Screen route={route} online={online} />
          </motion.div>
        </AnimatePresence>
      </main>

      {/* A private taka asks once, then never again on this device. It sits
          *over* the app rather than replacing it, so whatever she was trying to
          do (open a table, follow an invite) survives and resumes on unlock. */}
      <AnimatePresence>{online.locked && <Gate onUnlock={online.unlock} />}</AnimatePresence>
    </div>
  );
}

function Screen({ route, online }: { route: Route; online: ReturnType<typeof useOnlineSession<unknown>> }) {
  switch (route.name) {
    case 'home':
      return <Home />;
    case 'setup':
      return <Setup gameId={route.gameId} online={online} />;
    case 'solo':
      return getGameUI(route.gameId) ? (
        <SoloTable gameId={route.gameId} />
      ) : (
        <div className="page">
          <p className="muted">That game is not ready yet.</p>
        </div>
      );
    case 'table':
      return <Table code={route.code} online={online} />;
  }
}
