import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSync } from '../games/hafiza/sync.js';

// İki uçlu sahte oda: mesajlar karşıya mikro görevle gider; presence elle verilir.
function fakeRoom(id) {
  const h = { message: [], presence: [] };
  const room = {
    me: { clientId: id, name: id },
    peer: null,
    present: null,
    sent: [],
    send(msg) {
      room.sent.push(msg);
      if (!room.peer) return false;
      const copy = JSON.parse(JSON.stringify(msg));
      queueMicrotask(() => room.peer._emit('message', copy, room.me));
      return true;
    },
    on(ev, fn) {
      h[ev].push(fn);
      if (ev === 'presence') fn(room.present);
      return () => { h[ev] = h[ev].filter((f) => f !== fn); };
    },
    partner: () => room.present,
    _emit(ev, ...args) { for (const f of h[ev]) f(...args); },
    setPresence(p) { room.present = p; room._emit('presence', p); },
  };
  return room;
}
function pair(ns = 'x') {
  const h = fakeRoom('H'), g = fakeRoom('G');
  h.peer = g; g.peer = h;
  h.present = { clientId: 'G', name: 'G', page: ns };
  g.present = { clientId: 'H', name: 'H', page: ns };
  return { h, g };
}
const tick = () => new Promise((r) => setTimeout(r, 5));

const reduce = (s, a) => {
  if (a.type === 'add' && a.by) return { ...s, n: s.n + a.k, last: a.by };
  if (a.type === 'reset') return { ...s, n: 0 };
  return s;
};
const toAction = (intent, by) => (intent.type === 'add' ? { type: 'add', k: intent.k, by } : null);

test('misafir join gönderir, ev sahibi durumu yollar, niyetler ev sahibinde işlenir', async () => {
  const { h, g } = pair();
  const hs = [], gs = [];
  const host = createSync({ room: h, ns: 'x', isHost: true, solo: false, reduce, toAction, initial: { n: 0 },
    onState: (s) => hs.push(s) });
  const guest = createSync({ room: g, ns: 'x', hostId: 'H', isHost: false, solo: false, reduce, toAction,
    onState: (s) => gs.push(s) });
  host.start();
  guest.start();
  await tick();
  assert.ok(g.sent.some((m) => m.t === 'join'));
  assert.deepEqual(guest.state, { n: 0 });
  guest.dispatch({ type: 'add', k: 2 });
  assert.equal(guest.state.n, 0, 'misafir yerelde uygulamaz');
  await tick();
  assert.equal(host.state.n, 2);
  assert.equal(host.state.last, 'G', 'by gönderenden gelir');
  assert.equal(guest.state.n, 2);
  host.dispatch({ type: 'add', k: 1 });
  assert.equal(host.state.n, 3);
  await tick();
  assert.equal(guest.state.n, 3);
  assert.equal(guest.state.last, 'H');
  host.destroy(); guest.destroy();
});

test('geçersiz niyet yok sayılır; view misafire özel görünüm verir', async () => {
  const { h, g } = pair();
  const host = createSync({ room: h, ns: 'x', isHost: true, reduce, toAction, initial: { n: 0, secret: 'k' },
    view: (s, viewer) => (viewer === 'G' ? { ...s, secret: null } : s) });
  const guest = createSync({ room: g, ns: 'x', hostId: 'H', isHost: false, reduce, toAction });
  host.start(); guest.start();
  await tick();
  assert.equal(guest.state.secret, null);
  guest.dispatch({ type: 'reset' });
  await tick();
  assert.equal(host.state.n, 0);
  assert.equal(host.state.secret, 'k');
  host.destroy(); guest.destroy();
});

test('ev sahibi yoksa misafir onPeer(false) alır; dönünce yeniden join', async () => {
  const { h, g } = pair();
  const peer = [];
  const host = createSync({ room: h, ns: 'x', isHost: true, reduce, toAction, initial: { n: 0 } });
  const guest = createSync({ room: g, ns: 'x', hostId: 'H', isHost: false, reduce, toAction, onPeer: (p) => peer.push(p) });
  host.start(); guest.start();
  await tick();
  g.setPresence(null);
  g.setPresence({ clientId: 'H', name: 'H', page: 'lobi' });
  const joins = g.sent.filter((m) => m.t === 'join').length;
  g.setPresence({ clientId: 'H', name: 'H', page: 'x' });
  await tick();
  assert.deepEqual(peer, [true, false, false, true]);
  assert.equal(g.sent.filter((m) => m.t === 'join').length, joins + 1);
  host.destroy(); guest.destroy();
});

test('zamanlayıcı: ev sahibi plandaki eylemi zamanında uygular', async () => {
  const { h } = pair();
  const red = (s, a) => (a.type === 'go' ? { ...s, done: true, at: a.now } : s);
  const host = createSync({ room: h, ns: 'x', isHost: true, reduce: red, toAction: () => null,
    initial: { done: false }, schedule: (s) => (s.done ? null : { key: 'go', at: Date.now() + 20, action: { type: 'go' } }) });
  host.start();
  assert.equal(host.state.done, false);
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(host.state.done, true);
  assert.equal(typeof host.state.at, 'number');
  host.destroy();
});

test('tek başına: ağa durum göndermez; gelen join\'e solo der; kayıttan geri yükler', async () => {
  const { h } = pair();
  const store = new Map();
  const storage = { get: (k) => store.get(k) ?? null, set: (k, v) => store.set(k, v) };
  const a = createSync({ room: h, ns: 'x', isHost: true, solo: true, reduce, toAction, initial: { n: 0 },
    storage, storeKey: 'k' });
  a.start();
  a.dispatch({ type: 'add', k: 5 });
  assert.equal(a.state.n, 5);
  assert.equal(h.sent.filter((m) => m.t === 'state').length, 0);
  h._emit('message', { t: 'join' }, { clientId: 'G' });
  assert.deepEqual(h.sent.at(-1), { t: 'solo' });
  a.destroy();
  const b = createSync({ room: h, ns: 'x', isHost: true, solo: true, reduce, toAction, initial: { n: 0 },
    storage, storeKey: 'k' });
  assert.equal(b.state.n, 5);
  const c = createSync({ room: h, ns: 'x', isHost: true, solo: true, reduce, toAction, initial: { n: 0 },
    storage, storeKey: 'k', accept: () => false });
  assert.equal(c.state.n, 0, 'accept reddederse initial');
});

test('hostNow: misafir ev sahibi saatine göre düzeltir', async () => {
  const { h, g } = pair();
  let hostClock = 1_000_000;
  const host = createSync({ room: h, ns: 'x', isHost: true, reduce, toAction, initial: { n: 0 }, now: () => hostClock });
  const guest = createSync({ room: g, ns: 'x', hostId: 'H', isHost: false, reduce, toAction, now: () => 5000 });
  host.start(); guest.start();
  await tick();
  assert.equal(guest.hostNow(), 1_000_000);
  host.destroy(); guest.destroy();
});
