import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  joinRoom, openLocalRoom, pickPartner, samePartner, acceptEnvelope,
  applyLocalPresence, expirePeers, backoffDelay, partnerGoruyor, alanAl, ALAN_MAX,
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
  assert.deepEqual(pickPartner(state, 'A'), { clientId: 'B', name: 'Ayşe', page: 'yapboz', host: null, gorunur: true });
  assert.deepEqual(pickPartner({ K: [{ name: 'Adsız' }] }, 'A'), { clientId: 'K', name: 'Adsız', page: '', host: null, gorunur: true });
  // host: partnerin oyun sayfasındaki ev sahibi (misafirse başkası)
  assert.deepEqual(pickPartner({ B: [{ clientId: 'B', name: 'Ayşe', page: 'yapboz', host: 'A' }] }, 'A'),
    { clientId: 'B', name: 'Ayşe', page: 'yapboz', host: 'A', gorunur: true });
  assert.equal(pickPartner({ B: [] }, 'A'), null);
  // gorunur: sekme arkadaysa false; eski istemcide alan yoksa true
  assert.equal(pickPartner({ B: [{ clientId: 'B', name: 'Ayşe', page: 'sohbet', gorunur: false }] }, 'A').gorunur, false);
  assert.equal(pickPartner({ B: [{ clientId: 'B', name: 'Ayşe', page: 'sohbet' }] }, 'A').gorunur, true);
});

test('partnerGoruyor: aynı sayfa (ya da herhangi) ve sekme önde', () => {
  const p = { clientId: 'B', name: 'Ayşe', page: 'sohbet', host: null, gorunur: true };
  assert.equal(partnerGoruyor(null, 'sohbet'), false);
  assert.equal(partnerGoruyor(p, 'sohbet'), true);
  assert.equal(partnerGoruyor(p, 'anilar'), false);
  assert.equal(partnerGoruyor(p), true);
  assert.equal(partnerGoruyor({ ...p, gorunur: false }, 'sohbet'), false);
  assert.equal(partnerGoruyor({ ...p, gorunur: false }), false);
  const { gorunur, ...eski } = p;
  assert.equal(partnerGoruyor(eski, 'sohbet'), true); // eski istemci
});

test('samePartner', () => {
  const p = { clientId: 'B', name: 'Ayşe', page: 'lobby' };
  assert.equal(samePartner(null, null), true);
  assert.equal(samePartner(p, null), false);
  assert.equal(samePartner(p, { ...p }), true);
  assert.equal(samePartner(p, { ...p, page: 'ciz' }), false);
  assert.equal(samePartner({ ...p, host: null }, { ...p, host: 'A' }), false);
  assert.equal(samePartner({ ...p, host: 'A' }, { ...p, host: 'A' }), true);
  assert.equal(samePartner({ ...p, gorunur: true }, { ...p, gorunur: false }), false);
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
  assert.equal(peers.get('B').host, null);
  assert.deepEqual(applyLocalPresence(peers, { ...here, page: 'ciz', host: 'A' }, 'A', 2150), { changed: true, reply: false });
  assert.equal(peers.get('B').host, 'A');
  assert.equal(peers.get('B').gorunur, true);
  // sekme arka plana gitti: değişim var, yanıt yok
  assert.deepEqual(applyLocalPresence(peers, { ...here, page: 'ciz', host: 'A', gorunur: false }, 'A', 2160), { changed: true, reply: false });
  assert.equal(peers.get('B').gorunur, false);
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
    assert.deepEqual(a.partner(), { clientId: 'B', name: 'Ayşe', page: 'yapboz', host: null, gorunur: true });
    assert.deepEqual(b.partner(), { clientId: 'A', name: 'Ali', page: 'yapboz', host: null, gorunur: true });

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

test('yerel arka uç: presence host taşır', async () => {
  const lobby = openLocalRoom({ roomId: ROOM + 'h', ns: 'lobby', me: { clientId: 'A', name: 'Ali' } });
  const guest = openLocalRoom({ roomId: ROOM + 'h', ns: 'yapboz', me: { clientId: 'B', name: 'Ayşe' }, host: 'A' });
  try {
    await until(() => lobby.partner() && guest.partner());
    assert.deepEqual(lobby.partner(), { clientId: 'B', name: 'Ayşe', page: 'yapboz', host: 'A', gorunur: true });
    assert.equal(guest.partner().host, null); // lobide host yok
  } finally {
    lobby.leave();
    guest.leave();
  }
});

test("joinRoom: oyun sayfası URL'deki host'u yollar, lobi null yollar", async () => {
  const id = ROOM.slice(0, 8) + 'jr';
  const watcher = openLocalRoom({ roomId: id, ns: 'ciz', me: { clientId: 'W', name: 'İzleyen' } });
  try {
    globalThis.location = { search: `?yerel=1&oda=${id}&host=H1` };
    const game = await joinRoom({ roomId: id, ns: 'yapboz' });
    await until(() => watcher.partner()?.page === 'yapboz');
    assert.equal(watcher.partner().host, 'H1');
    game.leave();
    await until(() => watcher.partner() === null);

    const lobby = await joinRoom({ roomId: id, ns: 'lobby' });
    await until(() => watcher.partner()?.page === 'lobby');
    assert.equal(watcher.partner().host, null);
    lobby.leave();
  } finally {
    delete globalThis.location;
    watcher.leave();
  }
});

test('yerel arka uç: sekme gizlenince hemen gorunur:false yayınlanır', async () => {
  const hadDoc = 'document' in globalThis;
  const oldDoc = globalThis.document;
  const fakeDoc = new EventTarget();
  fakeDoc.visibilityState = 'visible';
  globalThis.document = fakeDoc;
  const id = ROOM + 'v';
  const a = openLocalRoom({ roomId: id, ns: 'sohbet', me: { clientId: 'A', name: 'Ali' }, heartbeatMs: 60000 });
  const raw = new BroadcastChannel('bizim:' + id);
  const got = [];
  raw.onmessage = (e) => { if (e.data?._p === 'here') got.push(e.data.gorunur); };
  try {
    raw.postMessage({ _p: 'here', clientId: 'B', name: 'Ayşe', page: 'sohbet', inst: 'b' }); // A yanıtlar
    await until(() => got.length >= 1);
    assert.equal(got.at(-1), true);
    fakeDoc.visibilityState = 'hidden';
    fakeDoc.dispatchEvent(new Event('visibilitychange'));
    await until(() => got.at(-1) === false);
    fakeDoc.visibilityState = 'visible';
    fakeDoc.dispatchEvent(new Event('visibilitychange'));
    await until(() => got.at(-1) === true);
  } finally {
    raw.close();
    a.leave();
    if (hadDoc) globalThis.document = oldDoc; else delete globalThis.document;
  }
});

test('presence alanı: yalnız doluysa taşınır; eski istemci (alan yok) etkilenmez', () => {
  assert.deepEqual(alanAl('banyo'), { alan: 'banyo' });
  assert.deepEqual(alanAl('  '), {});
  assert.deepEqual(alanAl(null), {});
  assert.deepEqual(alanAl(42), {});
  assert.equal(alanAl('x'.repeat(99)).alan.length, ALAN_MAX);
  assert.deepEqual(pickPartner({ B: [{ clientId: 'B', name: 'Ayşe', page: 'yavru', alan: 'banyo' }] }, 'A'),
    { clientId: 'B', name: 'Ayşe', page: 'yavru', host: null, gorunur: true, alan: 'banyo' });
  assert.equal('alan' in pickPartner({ B: [{ clientId: 'B', name: 'Ayşe', page: 'yavru' }] }, 'A'), false);
  const p = { clientId: 'B', name: 'Ayşe', page: 'yavru', host: null, gorunur: true };
  assert.equal(samePartner(p, { ...p, alan: 'banyo' }), false);
  assert.equal(samePartner({ ...p, alan: 'banyo' }, { ...p, alan: 'banyo' }), true);
  assert.equal(samePartner({ ...p, alan: 'banyo' }, { ...p, alan: 'mutfak' }), false);
  const peers = new Map();
  const here = { _p: 'here', clientId: 'B', name: 'Ayşe', page: 'yavru', inst: 'i1' };
  applyLocalPresence(peers, here, 'A', 1);
  assert.deepEqual(applyLocalPresence(peers, { ...here, alan: 'yatak' }, 'A', 2), { changed: true, reply: false });
  assert.equal(peers.get('B').alan, 'yatak');
  assert.deepEqual(applyLocalPresence(peers, { ...here, alan: 'yatak' }, 'A', 3), { changed: false, reply: false });
  assert.deepEqual(applyLocalPresence(peers, here, 'A', 4), { changed: true, reply: false });
  assert.equal('alan' in peers.get('B'), false);
});

test('yerel arka uç: setAlan presence ile hemen yayılır, null siler', async () => {
  const a = openLocalRoom({ roomId: ROOM + 'al', ns: 'yavru', me: { clientId: 'A', name: 'Ali' }, heartbeatMs: 60000 });
  const b = openLocalRoom({ roomId: ROOM + 'al', ns: 'yavru', me: { clientId: 'B', name: 'Ayşe' }, heartbeatMs: 60000 });
  try {
    await until(() => b.partner());
    assert.equal('alan' in b.partner(), false);
    a.setAlan('banyo');
    await until(() => b.partner()?.alan === 'banyo');
    a.setAlan(null);
    await until(() => b.partner() && !('alan' in b.partner()));
  } finally {
    a.leave();
    b.leave();
  }
});
