/**
 * Client-side half of the catalogue: which component draws which game, plus
 * the prose that explains it. The rules engine lives in `shared/`; this file
 * is purely presentation.
 */

import type { ComponentType } from 'react';
import type { Session } from '../net/session.ts';
import { DurakBoard } from './durak/DurakBoard.tsx';

export interface BoardProps {
  session: Session<any>;
}

export interface HowToPlayItem {
  title: string;
  body: string;
}

export interface GameUI {
  Board: ComponentType<BoardProps>;
  howToPlay: HowToPlayItem[];
}

export const GAME_UI: Record<string, GameUI> = {
  durak: {
    Board: DurakBoard,
    howToPlay: [
      {
        title: 'The deck',
        body: 'Thirty-six cards, sixes through aces. The last card of the deck is turned face up — its suit is trump for the whole game, and it is the very last card anyone draws.',
      },
      {
        title: 'A bout',
        body: 'The attacker lays a card. The defender must beat it with a higher card of the same suit, or with any trump. Once a card is beaten, the attacker may throw in more — but only of ranks already showing on the table.',
      },
      {
        title: 'Beat it or take it',
        body: 'Beat everything and the bout is discarded; the defence becomes the attack. Take instead, and the whole table goes into your hand — and your opponent attacks again.',
      },
      {
        title: 'Passing it on',
        body: 'Before you beat anything, you may add a card of the same rank and hand the whole bout to your opponent instead. They now have to defend it.',
      },
      {
        title: 'Losing',
        body: 'Both hands refill to six until the deck is spent. Whoever is still holding cards when the other is empty is the durak — the fool.',
      },
    ],
  },
};

export const getGameUI = (id: string): GameUI | undefined => GAME_UI[id];
