import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSaver, resumeSeat, handedTo, saveOp, readSaved, UNKNOWN, KIND, SAVE_MS } from '../games/dama/kayit.js';
import { createSync } from '../games/hafiza/sync.js';
import * as D from '../games/dama/oyun.js';
import { bulunma, tamlayan, agoText } from '../games/dama/dil.js';

test('createSaver: ilk değer hemen, sonrakiler en çok 3 sn’de bir; son değer kaçmaz', () => {
  let t = 0;
  const timers = [];
  const writes = [];
  const sv = createSaver((v) => writes.push([t, v]), {
    now: () => t,
    setTimer: (fn, ms) => { const o = { at: t + ms, fn }; timers.push(o); return o; },
    clearTimer: (o) => { const i = timers.indexOf(o); if (i >= 0) timers.splice(i, 1); },
  });
  const run = (to) => { t = to; for (const o of timers.splice(0).filter((x) => x.at <= t)) o.fn(); };
  assert.equal(SAVE_MS, 3000);
  assert.equal(KIND, 'oyunkayit');
  sv.push(1);
  assert.deepEqual(writes, [[0, 1]]);
  t = 500; sv.push(2);
  t = 900; sv.push(3);
  assert.equal(writes.length, 1, 'bekliyor');
  assert.equal(sv.waiting, true);
  run(3000);
  assert.deepEqual(writes[1], [3000, 3], 'yalnız son değer yazıldı');
  t = 3100; sv.push(4);
  sv.flush();
  assert.deepEqual(writes[2], [3100, 4], 'flush beklemeden yazar');
  sv.flush();
  assert.equal(writes.length, 3, 'boş flush yazmaz');
});

test('resumeSeat: kendim, bilinen partner, yer tutucu ve yabancı kayıt', () => {
  assert.deepEqual(resumeSeat({ players: ['a', 'b'] }, 'a', null), { partner: 'b' });
  assert.deepEqual(resumeSeat({ players: ['a', 'b'] }, 'yeni', 'b'), { partner: 'b' }, 'yeni cihaz, partner biliniyor');
  assert.deepEqual(resumeSeat({ players: ['a', UNKNOWN] }, 'b', null), { partner: 'a' });
  assert.equal(resumeSeat({ players: ['x', 'y'] }, 'a', 'b'), null);
  assert.equal(resumeSeat(null, 'a', 'b'), null);
  assert.equal(resumeSeat({ players: ['a'] }, 'a', 'b'), null);
});

test('saveOp: süren oyun yazılır, biten oyunun kaydı silinir (bir kez)', () => {
  const s = { seq: 1 };
  assert.equal(saveOp(s, false, false), 'put');
  assert.equal(saveOp(s, false, true), 'put');
  assert.equal(saveOp(s, true, true), 'remove');
  assert.equal(saveOp(s, true, false), null, 'zaten silinmiş');
  assert.equal(saveOp(null, false, true), null);
});

test('handedTo: sıra değişince yeni sıradaki kişi; aynı kişi aynı evrede null', () => {
  const a = { seq: 1, players: ['x', 'y'], turn: 0, phase: 'play' };
  assert.equal(handedTo(a, { ...a, seq: 2, turn: 1 }), 'y');
  assert.equal(handedTo(a, { ...a, seq: 2 }), null);
  assert.equal(handedTo(a, a), null);
  assert.equal(handedTo(null, a), null);
  assert.equal(handedTo({ ...a, phase: 'roll' }, { ...a, seq: 2, phase: 'move' }), 'x');
});

// ---- Ev sahibi otoritesi: gerçek dama reducer'ı ile iki uçlu sahte oda ----
function fakeRoom(id) {
  const hs = { message: [], presence: [] };
  const room = {
    me: { clientId: id, name: id },
    roomId: 'oda',
    peer: null,
    present: null,
    send(msg) {
      if (!room.peer) return false;
      const copy = JSON.parse(JSON.stringify(msg));
      queueMicrotask(() => room.peer._emit('message', copy, room.me));
      return true;
    },
    on(ev, fn) {
      hs[ev].push(fn);
      if (ev === 'presence') fn(room.present);
      return () => { hs[ev] = hs[ev].filter((f) => f !== fn); };
    },
    partner: () => room.present,
    _emit(ev, ...args) { for (const f of hs[ev]) f(...args); },
  };
  return room;
}
const tick = () => new Promise((r) => setTimeout(r, 5));

test('dama senkron: misafir hamlesi ev sahibinde doğrulanır; sırasız hamle reddedilir', async () => {
  const H = 'host', G = 'guest';
  const h = fakeRoom(H), g = fakeRoom(G);
  h.peer = g; g.peer = h;
  h.present = { clientId: G, name: G, page: 'dama' };
  g.present = { clientId: H, name: H, page: 'dama' };
  const toAction = (i, by, s) => D.toAction(i, by, s, { hostId: H, now: 1 });
  const host = createSync({ room: h, ns: 'dama', isHost: true, reduce: D.reduce, toAction,
    initial: D.initialState({ players: [H, UNKNOWN], names: {} }) });
  const guest = createSync({ room: g, ns: 'dama', hostId: H, isHost: false, reduce: D.reduce, toAction });
  host.start(); guest.start();
  host.dispatch({ type: 'seat', ids: [H, G], names: { [G]: 'Gül' } });
  await tick();
  assert.deepEqual(host.state.players, [H, G]);
  assert.deepEqual(guest.state.players, [H, G]);
  // Sıra beyazda (ev sahibi): misafirin hamlesi reddedilir
  guest.dispatch({ type: 'move', from: D.sqOf(2, 0), path: [D.sqOf(3, 0)] });
  await tick();
  assert.equal(host.state.ply, 0);
  host.dispatch({ type: 'move', from: D.sqOf(5, 0), path: [D.sqOf(4, 0)] });
  await tick();
  assert.equal(guest.state.ply, 1);
  guest.dispatch({ type: 'move', from: D.sqOf(2, 0), path: [D.sqOf(3, 0)] });
  await tick();
  assert.equal(host.state.ply, 2);
  assert.equal(guest.state.board, host.state.board);
  // Misafir seat/load gönderemez
  guest.dispatch({ type: 'load', s: { ...host.state, seq: 999, board: '.'.repeat(64) } });
  await tick();
  assert.notEqual(host.state.seq, 999);
  // Geri alma isteği ve onay iki uç arasında
  guest.dispatch({ type: 'undoAsk' });
  await tick();
  assert.equal(host.state.undoReq, G);
  host.dispatch({ type: 'undoReply', ok: true });
  await tick();
  assert.equal(guest.state.ply, 1);
  host.destroy(); guest.destroy();
});

test('Türkçe ekler: bulunma ve tamlayan; kısa süre metni', () => {
  assert.equal(bulunma('Gül'), "Gül'de");
  assert.equal(bulunma('Ömer'), "Ömer'de");
  assert.equal(bulunma('Burak'), "Burak'ta");
  assert.equal(bulunma('Ayşe'), "Ayşe'de");
  assert.equal(bulunma('Aysu'), "Aysu'da");
  assert.equal(bulunma('Can'), "Can'da");
  assert.equal(tamlayan('Ömer'), "Ömer'in");
  assert.equal(tamlayan('Gül'), "Gül'ün");
  assert.equal(tamlayan('Ayşe'), "Ayşe'nin");
  assert.equal(tamlayan('Burak'), "Burak'ın");
  assert.equal(tamlayan('Oya'), "Oya'nın");
  assert.equal(tamlayan('Umut'), "Umut'un");
  assert.equal(tamlayan(''), '');
  assert.equal(agoText(10_000), 'az önce');
  assert.equal(agoText(5 * 60_000), '5 dk önce');
  assert.equal(agoText(3 * 3600_000), '3 saat önce');
  assert.equal(agoText(26 * 3600_000), 'dün');
  assert.equal(agoText(4 * 86400_000), '4 gün önce');
});

// ---- İnceleme 3 düzeltmeleri ----

// Sahte koleksiyon: önbellekte `cached`, sunucuda `server`; refresh `ms` sonra sunucuyu yerleştirir.
function fakeCol(cached, server, ms) {
  let doc = cached;
  return {
    get: (id) => (doc && doc.id === id && !doc.deleted ? doc : null),
    refresh: () => (ms == null ? new Promise(() => {}) : new Promise((r) => setTimeout(() => { doc = server; r(); }, ms))),
  };
}
const durum = (extra = {}) => ({ v: 1, kind: 'dama', seq: 5, players: ['a', 'b'], phase: 'play', ...extra });

test('readSaved: önbellekteki kayıt sunucuda silinmişse sürdürülmez (tazeleme beklenir)', async () => {
  const cached = { id: 'dama', data: durum(), deleted: false };
  const gone = { id: 'dama', data: {}, deleted: true };
  assert.deepEqual(await readSaved(fakeCol(cached, gone, 5), 'dama', { wait: 1000 }), { saved: null, done: false });
  // Sunucu yanıt vermezse en çok `wait` beklenir; önbellek kullanılır (sonra 'change' ile düzelir)
  const t0 = Date.now();
  const r = await readSaved(fakeCol(cached, gone, null), 'dama', { wait: 30 });
  assert.equal(r.saved.seq, 5);
  assert.ok(Date.now() - t0 < 1000);
  // Bitmiş kayıt: sürdürülmez, silinmesi istenir
  const fin = { id: 'dama', data: durum({ phase: 'end' }), deleted: false };
  assert.deepEqual(await readSaved(fakeCol(fin, fin, 1), 'dama', { finished: (d) => d.phase === 'end', wait: 100 }), { saved: null, done: true });
  // Başka oyunun ya da geçersiz kayıt
  assert.equal((await readSaved(fakeCol(cached, cached, 1), 'tavla', { wait: 100 })).saved, null);
  assert.equal((await readSaved(fakeCol(cached, cached, 1), 'dama', { valid: () => false, wait: 100 })).saved, null);
});

test('dama senkron: iki taraf aynı anda Rövanş derse tek yeni oyun açılır', async () => {
  const H = 'host', G = 'guest';
  const h = fakeRoom(H), g = fakeRoom(G);
  h.peer = g; g.peer = h;
  h.present = { clientId: G, name: G, page: 'dama' };
  g.present = { clientId: H, name: H, page: 'dama' };
  const toAction = (i, by, s) => D.toAction(i, by, s, { hostId: H, now: 1 });
  const host = createSync({ room: h, ns: 'dama', isHost: true, reduce: D.reduce, toAction,
    initial: { ...D.initialState({ players: [H, G], names: {} }), phase: 'end', result: { winner: 0, reason: 'tas' } } });
  const guest = createSync({ room: g, ns: 'dama', hostId: H, isHost: false, reduce: D.reduce, toAction });
  host.start(); guest.start();
  await tick();
  const no = guest.state.no;
  guest.dispatch({ type: 'new', no });
  host.dispatch({ type: 'new', no });
  await tick();
  assert.equal(host.state.no, no + 1);
  assert.equal(guest.state.no, no + 1);
  assert.deepEqual(host.state.players, [G, H], 'renk bir kez döndü');
  host.destroy(); guest.destroy();
});
