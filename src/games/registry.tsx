/**
 * Client-side half of the catalogue: which component draws which game, plus
 * the prose that explains it. The rules engine lives in `shared/`; this file
 * is purely presentation.
 */

import type { ComponentType } from 'react';
import type { Session } from '../net/session.ts';
import { BackgammonBoard } from './backgammon/BackgammonBoard.tsx';
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

  backgammon: {
    Board: BackgammonBoard,
    howToPlay: [
      {
        title: 'The race',
        body: 'Tavla, Turkish rules. Fifteen checkers each, moving in opposite directions around twenty-four points. Yours travel towards the home board at the bottom right of your screen. First to bring all fifteen home and off the board wins.',
      },
      {
        title: 'The dice',
        body: 'Throw one die each to see who starts — the higher throw wins, and then rolls both dice properly for the first turn. Each turn you move one checker per die, or make two moves with the same checker. Roll a double and you get that number four times.',
      },
      {
        title: 'Points and blots',
        body: 'Two or more of your checkers make a point, and your opponent cannot land there. A single checker is a blot: land on it and it goes to the bar, and has to re-enter from the very start before anything else may move.',
      },
      {
        title: 'Using both dice',
        body: 'You must play as many dice as you legally can. If only one of the two can be played, it has to be the higher one. The board only offers you moves that obey this, so you cannot get it wrong.',
      },
      {
        title: 'Bearing off',
        body: 'Once all fifteen are in your home board you can start taking them off. An exact roll bears a checker off; a higher roll bears off from your furthest point when nothing sits behind it. Bear off all fifteen before your opponent has taken a single one off and it is a mars — worth double.',
      },
    ],
  },
};

export const getGameUI = (id: string): GameUI | undefined => GAME_UI[id];
