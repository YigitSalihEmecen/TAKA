/**
 * Room bookkeeping. A room is two chairs, one game definition, and one
 * authoritative state object. Nothing here knows what Durak is.
 */

import { randomUUID } from 'node:crypto';
import { getGame } from '../shared/games/registry.ts';
import type { AnyGameDefinition, Seat } from '../shared/games/types.ts';
import { ROOM_ALPHABET, ROOM_CODE_LENGTH, type PlayerInfo } from '../shared/protocol.ts';

/** A connected (or recently disconnected) player. */
export interface Occupant {
  clientId: string;
  name: string;
  seat: Seat;
  send: ((data: string) => void) | null;
  /** Set when they drop; the chair is held for them until it expires. */
  droppedAt: number | null;
}

export interface Room {
  code: string;
  gameId: string;
  def: AnyGameDefinition;
  state: unknown;
  rev: number;
  occupants: Occupant[];
  /** Seat that has asked for a rematch, if the other has not yet agreed. */
  rematchBy: Seat | null;
  createdAt: number;
  lastActivity: number;
}

/** How long a chair is held open for someone who dropped, in ms. */
export const GRACE_MS = 10 * 60 * 1000;
/** Empty rooms are swept after this long. */
export const ROOM_TTL_MS = 6 * 60 * 60 * 1000;

const rooms = new Map<string, Room>();

function newCode(): string {
  for (let attempt = 0; attempt < 200; attempt++) {
    let code = '';
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
      code += ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)];
    }
    if (!rooms.has(code)) return code;
  }
  return randomUUID().slice(0, ROOM_CODE_LENGTH).toUpperCase();
}

export function createRoom(gameId: string): Room | null {
  const def = getGame(gameId);
  if (!def || !def.meta.available) return null;

  const room: Room = {
    code: newCode(),
    gameId,
    def,
    state: def.create(Math.floor(Math.random() * 2 ** 31)),
    rev: 1,
    occupants: [],
    rematchBy: null,
    createdAt: Date.now(),
    lastActivity: Date.now(),
  };
  rooms.set(room.code, room);
  return room;
}

export const findRoom = (code: string): Room | undefined => rooms.get(code.toUpperCase().trim());

export function roomCount(): number {
  return rooms.size;
}

/** Seat a client, reclaiming their old chair if they are coming back. */
export function seatClient(
  room: Room,
  clientId: string,
  name: string,
  send: (data: string) => void,
): Occupant | { error: string } {
  const existing = room.occupants.find((o) => o.clientId === clientId);
  if (existing) {
    // Same person on a new tab or after a reconnect — hand them their chair back.
    existing.send = send;
    existing.droppedAt = null;
    if (name) existing.name = name;
    room.lastActivity = Date.now();
    return existing;
  }

  const taken = new Set(
    room.occupants.filter((o) => o.send || isHeld(o)).map((o) => o.seat),
  );
  const free = ([0, 1] as Seat[]).find((s) => !taken.has(s));
  if (free === undefined) return { error: 'That room is full.' };

  // Drop any long-expired ghost sitting in this chair.
  room.occupants = room.occupants.filter((o) => o.seat !== free);

  const occ: Occupant = { clientId, name, seat: free, send, droppedAt: null };
  room.occupants.push(occ);
  room.occupants.sort((a, b) => a.seat - b.seat);
  room.lastActivity = Date.now();
  return occ;
}

const isHeld = (o: Occupant): boolean =>
  o.droppedAt !== null && Date.now() - o.droppedAt < GRACE_MS;

export function markOffline(room: Room, clientId: string) {
  const occ = room.occupants.find((o) => o.clientId === clientId);
  if (!occ) return;
  occ.send = null;
  occ.droppedAt = Date.now();
  room.lastActivity = Date.now();
}

export function removeOccupant(room: Room, clientId: string) {
  room.occupants = room.occupants.filter((o) => o.clientId !== clientId);
  room.lastActivity = Date.now();
  if (room.occupants.length === 0) rooms.delete(room.code);
}

export const playerList = (room: Room): PlayerInfo[] =>
  room.occupants.map((o) => ({ seat: o.seat, name: o.name, online: o.send !== null }));

export function broadcast(room: Room, message: string) {
  for (const o of room.occupants) o.send?.(message);
}

/** Fresh deal in the same room, same chairs. */
export function restart(room: Room) {
  room.state = room.def.create(Math.floor(Math.random() * 2 ** 31));
  room.rev += 1;
  room.rematchBy = null;
  room.lastActivity = Date.now();
}

/** Periodic cleanup so long-running servers do not leak rooms. */
export function sweep() {
  const now = Date.now();
  for (const [code, room] of rooms) {
    room.occupants = room.occupants.filter((o) => o.send !== null || isHeld(o));
    const idle = now - room.lastActivity;
    if (room.occupants.length === 0 && idle > 60_000) rooms.delete(code);
    else if (idle > ROOM_TTL_MS) rooms.delete(code);
  }
}
