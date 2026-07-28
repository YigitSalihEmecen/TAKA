/**
 * Wire protocol between browser and server.
 *
 * The server is the referee: it holds the real game state and only ever sends
 * each player their own redacted view. Clients send *intent* ("I want to play
 * the 7 of hearts"), never state. A tampered client can lie about what it
 * wants, but not about what is true.
 */

import type { Seat } from './games/types.ts';

export const WS_PATH = '/ws';

/** Rooms are named with an unambiguous alphabet — no O/0, no I/1. */
export const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 4;

export type EmoteKind =
  | 'heart'
  | 'miu'
  | 'cat'
  | 'kiss'
  | 'laugh'
  | 'wow'
  | 'think'
  | 'taunt'
  | 'oops'
  | 'flower'
  | 'bravo'
  | 'sleepy';

/**
 * Things you can throw across the table. `glyph` renders as a symbol; `text`
 * renders as a thrown word in the display serif — which is how "miu miu" works.
 */
export interface Emote {
  kind: EmoteKind;
  label: string;
  glyph?: string;
  text?: string;
}

export const EMOTES: Emote[] = [
  { kind: 'heart', glyph: '♥', label: 'Love' },
  { kind: 'miu', text: 'miu miu', label: 'Miu miu' },
  { kind: 'cat', glyph: '🐱', label: 'Cat' },
  { kind: 'kiss', glyph: '😘', label: 'Kiss' },
  { kind: 'laugh', text: 'ha ha', label: 'Ha ha' },
  { kind: 'wow', glyph: '✧', label: 'Wow' },
  { kind: 'think', glyph: '⋯', label: 'Hmm' },
  { kind: 'taunt', glyph: '☞', label: 'Come on' },
  { kind: 'oops', text: 'oops', label: 'Oops' },
  { kind: 'flower', glyph: '🌷', label: 'Flower' },
  { kind: 'bravo', glyph: '👏', label: 'Bravo' },
  { kind: 'sleepy', glyph: '🥱', label: 'Sleepy' },
];

export const emoteOf = (kind: EmoteKind): Emote =>
  EMOTES.find((e) => e.kind === kind) ?? EMOTES[0];

/** A player as seen by the room. */
export interface PlayerInfo {
  seat: Seat;
  name: string;
  online: boolean;
}

// --- client -> server ------------------------------------------------------

export type ClientMessage =
  /** `pass` is only needed when the server was started with TAKA_PASSPHRASE. */
  | { t: 'hello'; clientId: string; name: string; pass?: string }
  | { t: 'create'; gameId: string }
  | { t: 'join'; code: string }
  | { t: 'leave' }
  | { t: 'rename'; name: string }
  | { t: 'action'; action: unknown }
  | { t: 'rematch' }
  | { t: 'emote'; kind: EmoteKind }
  | { t: 'ping' };

// --- server -> client ------------------------------------------------------

export type ServerMessage =
  | { t: 'welcome'; clientId: string }
  /** Room membership changed (or you just joined one). */
  | { t: 'room'; code: string; gameId: string; seat: Seat; players: PlayerInfo[] }
  /** Your private view of the game. `rev` increments on every change. */
  | { t: 'view'; rev: number; view: unknown }
  /** Both players agreed to play again; a fresh game has been dealt. */
  | { t: 'rematch'; by: Seat | null; pending: Seat | null }
  | { t: 'emote'; from: Seat; kind: EmoteKind }
  | { t: 'left' }
  | { t: 'error'; message: string; fatal?: boolean; code?: 'auth' }
  | { t: 'pong' };

export const encode = (m: ClientMessage | ServerMessage): string => JSON.stringify(m);

export function decode<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
