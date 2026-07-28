/** Two fake browsers play a full game against the real server. */
import WebSocket from 'ws';
import { durak, type DurakView } from '../shared/games/durak/index.ts';

const URL = process.env.TAKA_URL ?? 'ws://localhost:8787/ws';

interface Client {
  ws: WebSocket;
  id: string;
  seat: number | null;
  view: DurakView | null;
  code: string | null;
  errors: string[];
}

const mk = (id: string): Promise<Client> =>
  new Promise((resolve) => {
    const c: Client = { ws: new WebSocket(URL), id, seat: null, view: null, code: null, errors: [] };
    c.ws.on('open', () => {
      c.ws.send(JSON.stringify({ t: 'hello', clientId: id, name: id }));
      resolve(c);
    });
    c.ws.on('message', (raw) => {
      const m = JSON.parse(String(raw));
      if (m.t === 'room') {
        c.seat = m.seat;
        c.code = m.code;
      }
      if (m.t === 'view') c.view = m.view;
      if (m.t === 'error') c.errors.push(m.message);
    });
  });

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const a = await mk('alice');
const b = await mk('bob');

a.ws.send(JSON.stringify({ t: 'create', gameId: 'durak' }));
await wait(200);
console.log('room code:', a.code, '| alice seat', a.seat);

// Bob tries to act before joining.
b.ws.send(JSON.stringify({ t: 'action', action: { type: 'done' } }));
await wait(100);
console.log('bob acting with no room ->', JSON.stringify(b.errors));
b.errors = [];

b.ws.send(JSON.stringify({ t: 'join', code: a.code }));
await wait(200);
console.log('bob seat', b.seat, '| both views present:', !!a.view, !!b.view);

// Hidden information check.
const handsOverlap = a.view!.hand.filter((c) => b.view!.hand.includes(c));
console.log('hand overlap between players (must be 0):', handsOverlap.length);
console.log('alice sees bob card count:', a.view!.opponentCount, '(never his cards)');

// Someone tries to move out of turn.
const idle = a.view!.toAct === a.seat ? b : a;
idle.ws.send(JSON.stringify({ t: 'action', action: { type: 'done' } }));
await wait(120);
console.log('out-of-turn move ->', JSON.stringify(idle.errors));
idle.errors = [];

// Play the whole thing with the bot driving both chairs.
let steps = 0;
while (!a.view?.outcome && steps < 500) {
  const actor = a.view!.toAct === a.seat ? a : b;
  const move = durak.bot!(actor.view!);
  if (!move) {
    console.log('no move available — stuck at step', steps);
    break;
  }
  actor.ws.send(JSON.stringify({ t: 'action', action: move }));
  await wait(8);
  steps++;
}

console.log('finished in', steps, 'moves | outcome:', JSON.stringify(a.view?.outcome));
console.log('both clients agree on outcome:', JSON.stringify(a.view?.outcome) === JSON.stringify(b.view?.outcome));

// Reconnect: alice drops and comes back with the same client id.
a.ws.close();
await wait(150);
const a2 = await mk('alice');
a2.ws.send(JSON.stringify({ t: 'join', code: b.code }));
await wait(250);
console.log('alice reclaimed seat', a2.seat, '| view restored:', !!a2.view);

// A third person tries to squeeze in.
const c = await mk('carol');
c.ws.send(JSON.stringify({ t: 'join', code: b.code }));
await wait(200);
console.log('carol ->', JSON.stringify(c.errors));

// Rematch handshake.
a2.ws.send(JSON.stringify({ t: 'rematch' }));
await wait(120);
console.log('after one rematch request, game over still:', !!a2.view?.outcome);
b.ws.send(JSON.stringify({ t: 'rematch' }));
await wait(200);
console.log('after both requested, fresh deal:', a2.view?.hand.length === 6, '| outcome cleared:', !a2.view?.outcome);

// Bad code.
const d = await mk('dave');
d.ws.send(JSON.stringify({ t: 'join', code: 'ZZZZ' }));
await wait(150);
console.log('bad code ->', JSON.stringify(d.errors));

[a2, b, c, d].forEach((x) => x.ws.close());
await wait(100);
process.exit(0);
