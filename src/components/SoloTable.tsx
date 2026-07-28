import { getGameUI } from '../games/registry.tsx';
import { useName } from '../lib/identity.ts';
import { useSoloSession } from '../net/useSoloSession.ts';

/** Same board, referee running locally, bot in the other chair. */
export function SoloTable({ gameId }: { gameId: string }) {
  const [name] = useName();
  const session = useSoloSession(gameId, name);
  const ui = getGameUI(gameId);

  if (!ui) return <div className="page">Unknown game.</div>;
  return <ui.Board session={session} />;
}
