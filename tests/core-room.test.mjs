import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  joinRoom, openLocalRoom, pickPartner, samePartner, acceptEnvelope,
  applyLocalPresence, expirePeers, backoffDelay,
} from '../js/core/room.js';

const ROOM = 'test123456';

async function until(fn, ms = 2000) {
  const end = Date.now() + ms;
  while (!fn()) {
    if (Date.now() > end) throw new Error('zaman aşımı');
    await new Promise((r) => setTimeout(r, 10));
  }
}

test('pickPartner: kendini atlar, ilk farklı kişiyi ve son meta\'yı alır', () => {
  assert.equal(pickPartner({}, 'A'), null);
  assert.equal(pickPartner(null, 'A'), null);
  assert.equal(pickPartner({ A: [{ clientId: 'A', name: 'Ben', page: 'lobby' }] }, 'A'), null);
  const state = {
    A: [{ clientId: 'A', name: 'Ben', page: 'lobby' }],
    B: [
      { clientId: 'B', name: 'Eski', page: 'lobby', presence_ref: '1' },
      { clientId: 'B', name: 'Ayşe', page: 'yapboz', presence_ref: '2' },
    ],
    C: [{ clientId: 'C', name: 'Üçüncü', page: 'lobby' }],
  };
  assert.deepEqual(pickPartner(state, 'A'), { clientId: 'B', name: 'Ayşe', page: 'yapboz' });
  assert.deepEqual(pickPartner({ K: [{ name: 'Adsız' }] }, 'A'), { clientId: 'K', name: 'Adsız', page: '' });
  assert.equal(pickPartner({ B: [] }, 'A'), null);
});

test('samePartner', () => {
  const p = { clientId: 'B', name: 'Ayşe', page: 'lobby' };
  assert.equal(samePartner(null, null), true);
  assert.equal(samePartner(p, null), false);
  assert.equal(samePartner(p, { ...p }), true);
  assert.equal(samePartner(p, { ...p, page: 'ciz' }), false);
});

test('acceptEnvelope: aynı ns ya da *, kendi mesajın değil', () => {
  const from = { clientId: 'B', name: 'Ayşe' };
  assert.equal(acceptEnvelope({ ns: 'yapboz', from, m: {} }, 'yapboz', 'A'), true);
  assert.equal(acceptEnvelope({ ns: '*', from, m: {} }, 'yapboz', 'A'), true);
  assert.equal(acceptEnvelope({ ns: 'ciz', from, m: {} }, 'yapboz', 'A'), false);
  assert.equal(acceptEnvelope({ ns: 'yapboz', from: { clientId: 'A' }, m: {} }, 'yapboz', 'A'), false);
  assert.equal(acceptEnvelope({ ns: 'yapboz', m: {} }, 'yapboz', 'A'), false);
  assert.equal(acceptEnvelope(null, 'yapboz', 'A'), false);
  assert.equal(acceptEnvelope('x', 'yapboz', 'A'), false);
});

test('applyLocalPresence: yeni eşe hemen yanıt, bilinen eşe yanıt yok', () => {
  const peers = new Map();
  const here = { _p: 'here', clientId: 'B', name: 'Ayşe', page: 'lobby', inst: 'i1' };
  assert.deepEqual(applyLocalPresence(peers, here, 'A', 1000), { changed: true, reply: true });
  assert.equal(peers.get('B').seen, 1000);
  assert.deepEqual(applyLocalPresence(peers, here, 'A', 2000), { changed: false, reply: false });
  assert.equal(peers.get('B').seen, 2000);
  assert.deepEqual(applyLocalPresence(peers, { ...here, page: 'ciz' }, 'A', 2100), { changed: true, reply: false });
  // aynı kişi yeni sayfada (yeni inst): yeni eş gibi
  assert.deepEqual(applyLocalPresence(peers, { ...here, inst: 'i2' }, 'A', 2200), { changed: true, reply: true });
  // eski sayfanın geç gelen 'bye'ı yeni sayfayı silmez
  assert.deepEqual(applyLocalPresence(peers, { _p: 'bye', clientId: 'B', inst: 'i1' }, 'A', 2300), { changed: false, reply: false });
  assert.ok(peers.has('B'));
  assert.deepEqual(applyLocalPresence(peers, { _p: 'bye', clientId: 'B', inst: 'i2' }, 'A', 2400), { changed: true, reply: false });
  assert.equal(peers.has('B'), false);
  // kendi mesajım ve bozuk mesaj yok sayılır
  assert.deepEqual(applyLocalPresence(peers, { ...here, clientId: 'A' }, 'A', 2500), { changed: false, reply: false });
  assert.deepEqual(applyLocalPresence(peers, { _p: 'here' }, 'A', 2500), { changed: false, reply: false });
  assert.equal(peers.size, 0);
});

test('expirePeers: 8 sn sessiz eş silinir', () => {
  const peers = new Map([
    ['B', { clientId: 'B', seen: 1000 }],
    ['C', { clientId: 'C', seen: 5000 }],
  ]);
  assert.equal(expirePeers(peers, 9000, 8000), false);
  assert.equal(expirePeers(peers, 9001, 8000), true);
  assert.deepEqual([...peers.keys()], ['C']);
});

test('backoffDelay: artar, 30 sn tavan', () => {
  assert.equal(backoffDelay(0), 2000);
  assert.equal(backoffDelay(1), 4000);
  assert.equal(backoffDelay(2), 8000);
  assert.equal(backoffDelay(10), 30000);
});

test('joinRoom({ roomId: null }): yalnız oda', async () => {
  const room = await joinRoom({ roomId: null, ns: 'yapboz' });
  assert.equal(room.backend, 'solo');
  assert.equal(room.roomId, null);
  assert.equal(room.ns, 'yapboz');
  assert.match(room.me.clientId, /^[0-9a-f-]{36}$/);
  assert.equal(room.send({ t: 'x' }), false);
  assert.equal(room.sendAll({ t: 'x' }), false);
  assert.equal(room.partner(), null);
  const calls = [];
  const off = room.on('presence', (p) => calls.push(p));
  room.on('status', (s) => calls.push(s));
  assert.deepEqual(calls, [null, 'online']);
  assert.equal(typeof off, 'function');
  off();
  room.leave();
});

test('joinRoom: ?yerel=1 → yerel arka uç (config dolu olsa da)', async () => {
  globalThis.location = { search: '?yerel=1' };
  try {
    const room = await joinRoom({ roomId: ROOM, ns: 'lobby' });
    assert.equal(room.backend, 'local');
    const st = [];
    room.on('status', (s) => st.push(s));
    assert.deepEqual(st, ['online']);
    room.leave();
  } finally {
    delete globalThis.location;
  }
});

test('yerel arka uç: presence, ns süzme, *, kendi mesajın gelmez, ayrılma', async () => {
  const a = openLocalRoom({ roomId: ROOM, ns: 'yapboz', me: { clientId: 'A', name: 'Ali' }, heartbeatMs: 100 });
  const b = openLocalRoom({ roomId: ROOM, ns: 'yapboz', me: { clientId: 'B', name: 'Ayşe' }, heartbeatMs: 100 });
  let a2 = null;
  let a3 = null;
  try {
    await until(() => a.partner() && b.partner());
    assert.deepEqual(a.partner(), { clientId: 'B', name: 'Ayşe', page: 'yapboz' });
    assert.deepEqual(b.partner(), { clientId: 'A', name: 'Ali', page: 'yapboz' });

    const seen = [];
    b.on('presence', (p) => seen.push(p && p.clientId));
    assert.deepEqual(seen, ['A']); // abone olunca hemen

    const gotB = [];
    const gotA = [];
    b.on('message', (m, from) => gotB.push([m, from]));
    a.on('message', (m) => gotA.push(m));

    assert.equal(a.send({ t: 'join', n: 1 }), true);
    await until(() => gotB.length === 1);
    assert.deepEqual(gotB[0], [{ t: 'join', n: 1 }, { clientId: 'A', name: 'Ali' }]);

    // lobideki üçüncü sekme: ns 'lobby' → B almaz; '*' → alır
    a2 = openLocalRoom({ roomId: ROOM, ns: 'lobby', me: { clientId: 'A2', name: 'Ali' } });
    a2.send({ t: 'lobi' });
    a2.sendAll({ t: 'go', game: 'ciz' });
    await until(() => gotB.length === 2 && gotA.length === 1);
    assert.deepEqual(gotB[1][0], { t: 'go', game: 'ciz' });
    assert.deepEqual(gotA, [{ t: 'go', game: 'ciz' }]);
    gotA.length = 0;
    a2.leave();

    // aynı clientId'li başka örnek: kendi mesajı sayılır, gelmez
    a3 = openLocalRoom({ roomId: ROOM, ns: 'yapboz', me: { clientId: 'A', name: 'Ali' } });
    const gotA3 = [];
    a3.on('message', (m) => gotA3.push(m));
    a.send({ t: 'kendim' });
    b.send({ t: 'sana' });
    await until(() => gotA.length === 1 && gotA3.length === 1);
    assert.deepEqual(gotA, [{ t: 'sana' }]);
    assert.deepEqual(gotA3, [{ t: 'sana' }]);
    a3.leave();

    // JSON gidiş-dönüşü: Supabase ile aynı davranış
    b.send({ t: 'tarih', d: new Date(0), u: undefined });
    await until(() => gotA.length === 2);
    assert.deepEqual(gotA[1], { t: 'tarih', d: '1970-01-01T00:00:00.000Z' });

    // a3 ayrıldı; A'nın kalp atışı B'ye kendini yeniden tanıtır
    await until(() => b.partner()?.clientId === 'A');
    a.leave();
    await until(() => b.partner() === null);
    assert.equal(a.send({ t: 'x' }), false);
  } finally {
    for (const r of [a, b, a2, a3]) r?.leave();
  }
});

test('yerel arka uç: sessiz eş süre dolunca düşer', async () => {
  const b = openLocalRoom({ roomId: ROOM + 'x', ns: 'lobby', me: { clientId: 'B', name: 'Ayşe' }, heartbeatMs: 50, ttlMs: 200 });
  const raw = new BroadcastChannel('bizim:' + ROOM + 'x');
  try {
    raw.postMessage({ _p: 'here', clientId: 'Z', name: 'Sessiz', page: 'lobby', inst: 'z' });
    await until(() => b.partner()?.clientId === 'Z');
    await until(() => b.partner() === null, 1000);
  } finally {
    raw.close();
    b.leave();
  }
});
