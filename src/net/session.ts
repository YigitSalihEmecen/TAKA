/**
 * The shape every board component programs against.
 *
 * A board never knows whether it is talking to a WebSocket or to a bot running
 * in the same tab — both backends satisfy this one interface. That is what
 * makes "play together" and "play alone" the same code path.
 */

import type { Seat } from '@shared/games/types.ts';
import type { EmoteKind, PlayerInfo } from '@shared/protocol.ts';

export type ConnectionStatus = 'idle' | 'connecting' | 'live' | 'reconnecting' | 'error';

export interface RoomInfo {
  code: string;
  gameId: string;
  seat: Seat;
  players: PlayerInfo[];
}

export interface EmoteEvent {
  id: number;
  from: Seat;
  kind: EmoteKind;
}

export interface Session<V = unknown> {
  kind: 'online' | 'solo';
  status: ConnectionStatus;
  room: RoomInfo | null;
  view: V | null;
  /** Bumped whenever a new view lands — handy as an animation key. */
  rev: number;
  error: string | null;
  dismissError(): void;
  /** The server wants a passphrase we do not have (or ours was wrong). */
  locked: boolean;
  /** Both chairs are filled and connected. */
  bothPresent: boolean;
  send(action: unknown): void;
  rematch(): void;
  rematchPending: Seat | null;
  emote(kind: EmoteKind): void;
  emotes: EmoteEvent[];
  leave(): void;
}

/** A stable per-browser id, so a refresh gets your seat back. */
export function getClientId(): string {
  const KEY = 'taka.clientId';
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}

export function getStoredName(): string {
  return localStorage.getItem('taka.name') ?? '';
}

export function storeName(name: string) {
  localStorage.setItem('taka.name', name);
}

/** Shared passphrase, if this taka is a private one. Asked once per device. */
export const getStoredPass = (): string => localStorage.getItem('taka.pass') ?? '';
export const storePass = (pass: string) => localStorage.setItem('taka.pass', pass);
