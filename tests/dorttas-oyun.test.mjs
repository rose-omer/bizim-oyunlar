import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MODLAR, modBul, bosTahta, inecegiSatir, kazananCizgi, kazananBul,
  initialState, reduce, toAction, resultOf, yeniTaslar, seat,
} from '../games/dorttas/oyun.js';
import { createSync } from '../games/hafiza/sync.js';

const A = 'aaa', B = 'bbb';
const yeni = (mod = 'dort') => initialState({ players: [A, B], names: {}, mod });
// Sırayla oynatır: x dizisi; her hamleyi sırası gelen oyuncu yapar.
function oyna(s, xs) {
  for (const x of xs) s = reduce(s, { type: 'hamle', by: s.players[s.sira], x });
  return s;
}

test('modlar: Dört Taş 7×6 k=4, XOX 3×3 k=3', () => {
  assert.deepEqual([MODLAR.dort.cols, MODLAR.dort.rows, MODLAR.dort.k], [7, 6, 4]);
  assert.deepEqual([MODLAR.xox.cols, MODLAR.xox.rows, MODLAR.xox.k], [3, 3, 3]);
  assert.equal(modBul('yok'), null);
  assert.equal(modBul('toString'), null);
  assert.equal(bosTahta('dort').length, 42);
  assert.ok(bosTahta('xox').every((x) => x === -1));
});

test('inecegiSatir: alttan doldurur, dolu ve geçersiz sütunda -1', () => {
  const t = bosTahta('dort');
  assert.equal(inecegiSatir(t, 7, 6, 3), 5);
  t[5 * 7 + 3] = 0;
  assert.equal(inecegiSatir(t, 7, 6, 3), 4);
  for (let r = 0; r < 6; r++) t[r * 7 + 0] = 1;
  assert.equal(inecegiSatir(t, 7, 6, 0), -1);
  assert.equal(inecegiSatir(t, 7, 6, 7), -1);
  assert.equal(inecegiSatir(t, 7, 6, -1), -1);
  assert.equal(inecegiSatir(t, 7, 6, 1.5), -1);
});

test('kazananCizgi: yatay, dikey, iki çapraz; 3 yetmez', () => {
  const kur = (hucreler) => {
    const t = bosTahta('dort');
    for (const [r, c] of hucreler) t[r * 7 + c] = 0;
    return t;
  };
  const yatay = kur([[5, 1], [5, 2], [5, 3], [5, 4]]);
  assert.deepEqual(kazananCizgi(yatay, 7, 6, 4, 5 * 7 + 2), [36, 37, 38, 39]);
  const dikey = kur([[2, 6], [3, 6], [4, 6], [5, 6]]);
  assert.deepEqual(kazananCizgi(dikey, 7, 6, 4, 2 * 7 + 6), [20, 27, 34, 41]);
  const capraz = kur([[5, 0], [4, 1], [3, 2], [2, 3]]);
  assert.deepEqual(kazananCizgi(capraz, 7, 6, 4, 35), [17, 23, 29, 35]);
  const ters = kur([[2, 0], [3, 1], [4, 2], [5, 3]]);
  assert.deepEqual(kazananCizgi(ters, 7, 6, 4, 14), [14, 22, 30, 38]);
  const uc = kur([[5, 0], [5, 1], [5, 2]]);
  assert.equal(kazananCizgi(uc, 7, 6, 4, 35), null);
  assert.equal(kazananCizgi(uc, 7, 6, 4, 0), null, 'boş hücre');
  // kenar sarmaz: satır sonu + sonraki satır başı dörtlü değildir
  const sarma = kur([[4, 5], [4, 6], [5, 0], [5, 1]]);
  assert.equal(kazananBul(sarma, 7, 6, 4), null);
});

test('kazananCizgi: aynı taş iki çizgiyi tamamlarsa ikisi de vurgulanır, 5\'li tümüyle', () => {
  const t = bosTahta('dort');
  for (const c of [0, 1, 2, 3, 4]) t[5 * 7 + c] = 1;
  assert.equal(kazananCizgi(t, 7, 6, 4, 37).length, 5);
  const x = bosTahta('xox');
  for (const i of [0, 1, 2, 4, 6]) x[i] = 0; // üst satır + çapraz (2,4,6)
  assert.deepEqual(kazananCizgi(x, 3, 3, 3, 2), [0, 1, 2, 4, 6]);
});

test('Dört Taş: dikey dörtlü ile kazanma, skor ve kilit', () => {
  let s = yeni();
  assert.equal(s.sira, 0);
  assert.equal(s.faz, 'oyun');
  s = oyna(s, [0, 1, 0, 1, 0, 1]);
  assert.equal(s.faz, 'oyun');
  s = oyna(s, [0]);
  assert.equal(s.faz, 'bitti');
  assert.equal(s.kazanan, 0);
  assert.deepEqual(s.cizgi, [14, 21, 28, 35]);
  assert.deepEqual(s.skor.dort, [1, 0, 0]);
  assert.equal(s.son, 14);
  assert.equal(reduce(s, { type: 'hamle', by: B, x: 3 }), s, 'bitince hamle yok');
});

test('hamle kuralları: sıra dışı, dolu sütun, geçersiz x yok sayılır', () => {
  let s = yeni();
  assert.equal(reduce(s, { type: 'hamle', by: B, x: 0 }), s, 'sıra A\'da');
  assert.equal(reduce(s, { type: 'hamle', by: 'yabanci', x: 0 }), s);
  assert.equal(reduce(s, { type: 'hamle', by: A, x: 9 }), s);
  s = oyna(s, [2, 2, 2, 2, 2, 2]);
  assert.equal(inecegiSatir(s.tahta, 7, 6, 2), -1);
  assert.equal(reduce(s, { type: 'hamle', by: A, x: 2 }), s, 'dolu sütun');
  assert.equal(s.hamle, 6);
});

test('beraberlik: dolu tahta, kazanan yok', () => {
  let s = yeni('xox');
  // X O X / X O O / O X X  → kazanan yok
  s = oyna(s, [0, 1, 2, 4, 3, 5, 7, 6, 8]);
  assert.equal(s.faz, 'bitti');
  assert.equal(s.kazanan, -1);
  assert.deepEqual(s.cizgi, []);
  assert.deepEqual(s.skor.xox, [0, 0, 1]);
});

test('Dört Taş beraberlik: 42 taş, dörtlü yok', () => {
  const t = '0101010/0101010/1010101/1010101/0101010/0101010'.replaceAll('/', '').split('').map(Number);
  assert.equal(kazananBul(t, 7, 6, 4), null, 'deneme tahtası dörtlüsüz olmalı');
  // Tahtayı sol üst hücre eksik kur; son taşı sırası gelen bıraksın
  const p = t[0];
  const eksik = t.slice();
  eksik[0] = -1;
  let s = { ...yeni(), tahta: eksik, sira: p, hamle: 41 };
  s = reduce(s, { type: 'hamle', by: s.players[p], x: 0 });
  assert.equal(s.faz, 'bitti');
  assert.equal(s.kazanan, -1);
  assert.deepEqual(s.skor.dort, [0, 0, 1]);
});

test('XOX: çapraz kazanma, hücre doluysa yok sayılır', () => {
  let s = yeni('xox');
  s = oyna(s, [0, 1, 4]);
  assert.equal(reduce(s, { type: 'hamle', by: s.players[s.sira], x: 4 }), s, 'dolu hücre');
  s = oyna(s, [2, 8]);
  assert.equal(s.kazanan, 0);
  assert.deepEqual(s.cizgi, [0, 4, 8]);
  assert.deepEqual(s.skor.xox, [1, 0, 0]);
  assert.deepEqual(s.skor.dort, [0, 0, 0], 'skorlar mod başına ayrı');
});

test('kim başlar her oyunda değişir; skor oturum boyunca korunur', () => {
  let s = yeni();
  assert.equal(s.baslayan, 0);
  s = oyna(s, [0, 1, 0, 1, 0, 1, 0]);
  s = reduce(s, { type: 'yeni', oyun: s.oyun });
  assert.equal(s.oyun, 2);
  assert.equal(s.baslayan, 1);
  assert.equal(s.sira, 1);
  assert.equal(s.faz, 'oyun');
  assert.equal(s.hamle, 0);
  assert.deepEqual(s.skor.dort, [1, 0, 0]);
  s = reduce(s, { type: 'yeni', oyun: s.oyun });
  assert.equal(s.baslayan, 0);
});

test('mod değişimi yeni oyun açar; aynı mod ya da bilinmeyen mod yok sayılır', () => {
  let s = yeni();
  s = oyna(s, [3]);
  const x = reduce(s, { type: 'mod', mod: 'xox' });
  assert.equal(x.mod, 'xox');
  assert.equal(x.tahta.length, 9);
  assert.equal(x.hamle, 0);
  assert.equal(x.oyun, 2);
  assert.equal(reduce(x, { type: 'mod', mod: 'xox' }), x);
  assert.equal(reduce(x, { type: 'mod', mod: 'satranc' }), x);
});

test('toAction: by gönderenden; geçersiz niyet null', () => {
  assert.deepEqual(toAction({ type: 'hamle', x: 3 }, B), { type: 'hamle', by: B, x: 3 });
  assert.equal(toAction({ type: 'hamle', x: '3' }, B), null);
  assert.deepEqual(toAction({ type: 'yeni', oyun: 4 }, B), { type: 'yeni', oyun: 4 });
  assert.deepEqual(toAction({ type: 'mod', mod: 'xox' }, A), { type: 'mod', mod: 'xox' });
  assert.equal(toAction({ type: 'mod', mod: 'q' }, A), null);
  assert.equal(toAction({ type: 'hile' }, A), null);
  assert.equal(toAction(null, A), null);
});

test('resultOf ve yeniTaslar', () => {
  let s = yeni();
  const once = s;
  s = oyna(s, [3, 3]);
  assert.deepEqual(yeniTaslar(once, s), [31, 38]);
  assert.deepEqual(yeniTaslar(s, reduce(s, { type: 'yeni', oyun: s.oyun })), [], 'yeni oyunda animasyon yok');
  s = oyna(s, [0, 1, 0, 1, 0, 1, 0]);
  assert.deepEqual(resultOf(s), { mod: 'dort', kazanan: 0, hamle: 9, skor: [1, 0, 0] });
});

test('misafir tahmini: aynı eylem iki tarafta aynı durumu verir (deterministik)', () => {
  const s = oyna(yeni(), [3, 4]);
  const a = reduce(s, { type: 'hamle', by: A, x: 5 });
  const b = reduce(JSON.parse(JSON.stringify(s)), { type: 'hamle', by: A, x: 5 });
  assert.deepEqual(a, b);
});

// ---- İnceleme 3 düzeltmeleri ----

test('tekrar: aynı oyun numarasıyla iki istek tek oyun açar; başlayan bir kez değişir', () => {
  let s = oyna(yeni(), [0, 1, 0, 1, 0, 1, 0]);
  assert.equal(s.faz, 'bitti');
  const a = reduce(s, toAction({ type: 'yeni', oyun: s.oyun }, A));
  const b = reduce(a, toAction({ type: 'yeni', oyun: s.oyun }, B));
  assert.equal(b, a, 'ikinci Tekrar yok sayıldı');
  assert.equal(a.oyun, 2);
  assert.equal(a.baslayan, 1);
  assert.equal(reduce(s, { type: 'yeni' }), s, 'numarasız istek yok sayılır');
});

test('seat: başka cihazdan dönen partner koltuğuna oturur; skor kalır; yalnız ev sahibi isteyebilir', () => {
  let s = oyna(yeni(), [0, 1, 0, 1, 0, 1, 0]);
  const t = reduce(s, toAction({ type: 'seat', ids: [A, 'yeni-cihaz'], names: { 'yeni-cihaz': 'Gül' } }, A, s, { hostId: A }));
  assert.deepEqual(t.players, [A, 'yeni-cihaz']);
  assert.equal(t.names['yeni-cihaz'], 'Gül');
  assert.deepEqual(t.skor, s.skor);
  assert.equal(toAction({ type: 'seat', ids: [B, 'x'] }, B, s, { hostId: A }), null, 'misafir koltuk değiştiremez');
  assert.equal(toAction({ type: 'seat', ids: [A, 'x'] }, A, s), null, 'ev sahibi bilinmiyorsa yok');
  assert.equal(seat(t, [A, 'yeni-cihaz'], { 'yeni-cihaz': 'Gül' }), t, 'değişiklik yok');
  assert.equal(seat(t, ['x', 'y']), t, 'ev sahibi oturmuyorsa dokunmaz');
  const p = seat(initialState({ players: [A, 'sevgilim'] }), [A, B], { [B]: 'Gül' });
  assert.deepEqual(p.players, [A, B], 'yer tutucu');
});

// ---- iki uçlu sahte oda ----
function fakeRoom(id) {
  const hs = { message: [], presence: [] };
  const room = {
    me: { clientId: id, name: id }, roomId: 'oda', peer: null, present: null,
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

test('senkron: yeni cihazdan katılan misafir ev sahibinin join üzerine koltuğa oturur ve oynar', async () => {
  const H = 'host', G2 = 'gul-ikinci';
  const h = fakeRoom(H), g = fakeRoom(G2);
  g.me.name = 'Gül';
  h.peer = g; g.peer = h;
  h.present = { clientId: G2, name: 'Gül', page: 'dorttas' };
  g.present = { clientId: H, name: H, page: 'dorttas' };
  let host = null;
  const fillSeat = (p) => { if (p?.clientId && p.clientId !== H) host.dispatch({ type: 'seat', ids: [H, p.clientId], names: { [p.clientId]: p.name } }); };
  const s0 = oyna(initialState({ players: [H, 'gul-eski'], names: {} }), [3]); // oyun sürüyor, sıra misafirde
  host = createSync({ room: h, ns: 'dorttas', isHost: true, reduce, toAction: (i, by, s) => toAction(i, by, s, { hostId: H }),
    initial: s0, onJoin: fillSeat });
  const guest = createSync({ room: g, ns: 'dorttas', hostId: H, isHost: false, reduce, toAction });
  host.start(); guest.start();
  await tick();
  assert.deepEqual(guest.state.players, [H, G2]);
  assert.equal(guest.state.names[G2], 'Gül');
  guest.dispatch({ type: 'hamle', x: 4 });
  await tick();
  assert.equal(host.state.hamle, 2, 'yeni cihaz hamlesi kabul edildi');
  host.destroy(); guest.destroy();
});
