/**
 * The catalogue. Adding a game = implementing `GameDefinition`, importing it
 * here, and adding a board component to `src/games/registry.tsx`.
 */

import type { AnyGameDefinition, GameMeta } from './types.ts';
import { durak } from './durak/index.ts';

export const GAMES: Record<string, AnyGameDefinition> = {
  [durak.meta.id]: durak,
};

/** Games that exist as playable definitions, in lobby order. */
export const GAME_LIST: AnyGameDefinition[] = [durak];

/**
 * Placeholders for the lobby — things I want to build next. They render as
 * quiet, un-clickable cards so the shelf never looks empty.
 */
export const UPCOMING: GameMeta[] = [
  {
    id: 'okey',
    title: 'Okey',
    subtitle: 'Türkiye · two players',
    blurb: 'Tiles, runs and sets, and one joker that changes every hand.',
    glyph: '⬢',
    duration: '15–30 min',
    available: false,
    hasBot: false,
  },
  {
    id: 'backgammon',
    title: 'Backgammon',
    subtitle: 'Everywhere · two players',
    blurb: 'Twenty-four points, thirty checkers, and a doubling cube to argue over.',
    glyph: '⚄',
    duration: '20–40 min',
    available: false,
    hasBot: false,
  },
  {
    id: 'batak',
    title: 'Batak',
    subtitle: 'Türkiye · two players',
    blurb: 'Bid what you can win, then live with it.',
    glyph: '♣',
    duration: '15–25 min',
    available: false,
    hasBot: false,
  },
];

export const getGame = (id: string): AnyGameDefinition | undefined => GAMES[id];
