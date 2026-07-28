/**
 * Taka game server.
 *
 * One process does both jobs: it serves the built front end as static files
 * and runs the WebSocket referee at /ws. That means one deploy, one URL, and
 * no CORS to think about.
 */

import express from 'express';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';

import {
  WS_PATH,
  decode,
  encode,
  type ClientMessage,
  type ServerMessage,
} from '../shared/protocol.ts';
import {
  broadcast,
  createRoom,
  findRoom,
  markOffline,
  playerList,
  removeOccupant,
  restart,
  roomCount,
  seatClient,
  sweep,
  type Room,
} from './rooms.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT ?? 8787);
const PRODUCTION = process.env.NODE_ENV === 'production';

/**
 * Optional shared passphrase. Unset (the default) means anyone with the URL can
 * open a table — which is usually fine, since you still need a room code to join
 * someone's game. Set it and the app asks once per device, then remembers.
 */
const PASSPHRASE = process.env.TAKA_PASSPHRASE?.trim() || null;

const app = express();
app.disable('x-powered-by');

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    rooms: roomCount(),
    uptime: Math.round(process.uptime()),
    locked: PASSPHRASE !== null,
  });
});

if (PRODUCTION) {
  const dist = path.join(ROOT, 'dist');
  app.use(
    express.static(dist, {
      setHeaders: (res, filePath) => {
        // Hashed assets are immutable; index.html must never be cached.
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else {
          res.setHeader('Cache-Control', 'no-cache');
        }
      },
    }),
  );
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

const server = createServer(app);
const wss = new WebSocketServer({ server, path: WS_PATH });

// ---------------------------------------------------------------------------
// connection state
// ---------------------------------------------------------------------------

interface Session {
  ws: WebSocket;
  clientId: string;
  name: string;
  room: Room | null;
  alive: boolean;
  /** True once the passphrase has been accepted (or if none is configured). */
  authed: boolean;
}

const sessions = new Map<WebSocket, Session>();

const send = (ws: WebSocket, msg: ServerMessage) => {
  if (ws.readyState === ws.OPEN) ws.send(encode(msg));
};

const sendError = (ws: WebSocket, message: string, fatal = false, code?: 'auth') =>
  send(ws, { t: 'error', message, fatal, code });

/** Push every occupant their own private view. */
function pushViews(room: Room) {
  for (const occ of room.occupants) {
    if (!occ.send) continue;
    occ.send(encode({ t: 'view', rev: room.rev, view: room.def.view(room.state, occ.seat) }));
  }
}

function pushRoom(room: Room) {
  for (const occ of room.occupants) {
    if (!occ.send) continue;
    occ.send(
      encode({
        t: 'room',
        code: room.code,
        gameId: room.gameId,
        seat: occ.seat,
        players: playerList(room),
      }),
    );
  }
}

function leaveRoom(session: Session, permanent: boolean) {
  const room = session.room;
  if (!room) return;
  session.room = null;
  if (permanent) removeOccupant(room, session.clientId);
  else markOffline(room, session.clientId);
  pushRoom(room);
}

// ---------------------------------------------------------------------------
// message handling
// ---------------------------------------------------------------------------

function handle(session: Session, msg: ClientMessage) {
  const { ws } = session;

  // Everything except the handshake itself requires a seat at the door.
  if (!session.authed && msg.t !== 'hello' && msg.t !== 'ping') {
    return sendError(ws, 'This taka is private.', true, 'auth');
  }

  switch (msg.t) {
    case 'ping':
      send(ws, { t: 'pong' });
      return;

    case 'hello': {
      if (PASSPHRASE && msg.pass !== PASSPHRASE) {
        sendError(ws, 'This taka is private.', true, 'auth');
        ws.close();
        return;
      }
      session.authed = true;
      session.clientId = msg.clientId || randomUUID();
      session.name = (msg.name || 'Player').slice(0, 24);
      send(ws, { t: 'welcome', clientId: session.clientId });
      return;
    }

    case 'rename': {
      session.name = (msg.name || 'Player').slice(0, 24);
      if (session.room) {
        const occ = session.room.occupants.find((o) => o.clientId === session.clientId);
        if (occ) occ.name = session.name;
        pushRoom(session.room);
      }
      return;
    }

    case 'create': {
      leaveRoom(session, true);
      const room = createRoom(msg.gameId);
      if (!room) return sendError(ws, 'That game is not ready to play yet.');
      const seated = seatClient(room, session.clientId, session.name, (d) => ws.send(d));
      if ('error' in seated) return sendError(ws, seated.error);
      session.room = room;
      pushRoom(room);
      pushViews(room);
      return;
    }

    case 'join': {
      const room = findRoom(msg.code ?? '');
      if (!room) return sendError(ws, 'No room with that code. Check the letters?');
      if (session.room && session.room !== room) leaveRoom(session, true);
      const seated = seatClient(room, session.clientId, session.name, (d) => ws.send(d));
      if ('error' in seated) return sendError(ws, seated.error);
      session.room = room;
      pushRoom(room);
      pushViews(room);
      return;
    }

    case 'leave': {
      leaveRoom(session, true);
      send(ws, { t: 'left' });
      return;
    }

    case 'action': {
      const room = session.room;
      if (!room) return sendError(ws, 'You are not in a room.');
      const occ = room.occupants.find((o) => o.clientId === session.clientId);
      if (!occ) return sendError(ws, 'You have lost your seat.');
      if (room.occupants.filter((o) => o.send).length < 2) {
        return sendError(ws, 'Waiting for the other player.');
      }

      const result = room.def.reduce(room.state, occ.seat, msg.action);
      if (!result.ok) return sendError(ws, result.error);

      room.state = result.state;
      room.rev += 1;
      room.lastActivity = Date.now();
      pushViews(room);

      // Some games can advance on their own after a move.
      const auto = room.def.autoplay;
      if (auto) {
        for (const other of room.occupants) {
          const act = auto(room.state, other.seat);
          if (!act) continue;
          const step = room.def.reduce(room.state, other.seat, act);
          if (step.ok) {
            room.state = step.state;
            room.rev += 1;
            pushViews(room);
          }
        }
      }
      return;
    }

    case 'rematch': {
      const room = session.room;
      if (!room) return sendError(ws, 'You are not in a room.');
      const occ = room.occupants.find((o) => o.clientId === session.clientId);
      if (!occ) return;

      if (room.rematchBy === null) {
        room.rematchBy = occ.seat;
        broadcast(room, encode({ t: 'rematch', by: occ.seat, pending: occ.seat }));
      } else if (room.rematchBy !== occ.seat) {
        restart(room);
        broadcast(room, encode({ t: 'rematch', by: occ.seat, pending: null }));
        pushViews(room);
      }
      return;
    }

    case 'emote': {
      const room = session.room;
      if (!room) return;
      const occ = room.occupants.find((o) => o.clientId === session.clientId);
      if (!occ) return;
      broadcast(room, encode({ t: 'emote', from: occ.seat, kind: msg.kind }));
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// socket lifecycle
// ---------------------------------------------------------------------------

wss.on('connection', (ws) => {
  const session: Session = {
    ws,
    clientId: randomUUID(),
    name: 'Player',
    room: null,
    alive: true,
    authed: PASSPHRASE === null,
  };
  sessions.set(ws, session);

  ws.on('pong', () => {
    session.alive = true;
  });

  ws.on('message', (raw) => {
    const msg = decode<ClientMessage>(String(raw));
    if (!msg || typeof msg.t !== 'string') return;
    try {
      handle(session, msg);
    } catch (err) {
      console.error('[taka] handler error', err);
      sendError(ws, 'Something went wrong on the server.');
    }
  });

  ws.on('close', () => {
    leaveRoom(session, false);
    sessions.delete(ws);
  });

  ws.on('error', () => {
    leaveRoom(session, false);
    sessions.delete(ws);
  });
});

// Drop sockets that stop answering, so seats do not sit "online" forever.
const heartbeat = setInterval(() => {
  for (const [ws, session] of sessions) {
    if (!session.alive) {
      ws.terminate();
      continue;
    }
    session.alive = false;
    try {
      ws.ping();
    } catch {
      /* socket already gone */
    }
  }
  sweep();
}, 30_000);

server.on('close', () => clearInterval(heartbeat));

server.listen(PORT, () => {
  console.log(
    `[taka] ${PRODUCTION ? 'serving app + websocket' : 'websocket only (vite serves the app)'} on :${PORT}` +
      (PASSPHRASE ? ' · passphrase required' : ''),
  );
});
