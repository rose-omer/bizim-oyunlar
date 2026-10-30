// Gizli seçim oyunları: Kim Daha Çok? ve Hiç … Yaptın mı? — saf durum makineleri.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as kd from '../games/kimdaha/logic.js';
import * as hy from '../games/hicyaptin/logic.js';
import { COUNTS, DEFAULT_COUNT } from '../games/kimdaha/secim.js';

const P = [{ id: 'omer', name: 'Ömer' }, { id: 'gul', name: 'Gül' }];

const kdStart = (count = 10, seed = 7, cats) => {
  let s = kd.initialState({ players: P });
  if (count !== s.count) s = kd.reduce(s, { type: 'config', count });
  if (cats) s = kd.reduce(s, { type: 'config', cats });
  return kd.reduce(s, { type: 'start', seed });
};
const both = (L, s, a, b) => L.reduce(L.reduce(s, { type: 'pick', by: 0, choice: a }), { type: 'pick', by: 1, choice: b });

test('kimdaha: kurulum varsayılanları ve config', () => {
  assert.deepEqual(COUNTS, [10, 20, 30]);
  assert.equal(DEFAULT_COUNT, 10);
  const s = kd.initialState({ players: P });
  assert.equal(s.game, 'kimdaha');
  assert.equal(s.phase, 'setup');
  assert.equal(s.count, 10);
  assert.deepEqual(s.cats, ['eglenceli', 'romantik', 'gunluk']);
  assert.deepEqual(s.players, P);

  const c = kd.reduce(s, { type: 'config', count: 30 });
  assert.equal(c.count, 30);
  assert.equal(kd.reduce(s, { type: 'config', count: 15 }), s, 'geçersiz sayı');
  assert.equal(kd.reduce(s, { type: 'config', cats: [] }), s, 'boş kategori olmaz');
  assert.equal(kd.reduce(s, { type: 'config', cats: ['yok'] }), s);
  const k = kd.reduce(s, { type: 'config', cats: ['cesur', 'romantik'] });
  assert.deepEqual(k.cats, ['romantik', 'cesur'], 'kategori sırası sabit');
  assert.equal(kd.reduce(k, { type: 'config', cats: ['romantik', 'cesur'] }), k, 'değişiklik yoksa aynı nesne');
});

test('kimdaha: start yalnız seçili kategorilerden tekil ifade çeker', () => {
  const s = kdStart(30, 3, ['cesur']);
  assert.equal(s.phase, 'pick');
  assert.equal(s.qs.length, 30);
  assert.equal(new Set(s.qs).size, 30);
  for (const id of s.qs) assert.equal(kd.itemById(id)?.cat, 'cesur');
  assert.equal(kd.reduce(s, { type: 'config', count: 10 }), s, 'oyunda config yok');
  assert.equal(kd.reduce(s, { type: 'start', seed: 9 }), s, 'oyunda start yok');
});

test('kimdaha: "Ben" + "Sen" anlaşmadır; ikisi de "Ben" anlaşma değildir', () => {
  assert.equal(kd.target(0, 'ben'), 0);
  assert.equal(kd.target(0, 'sen'), 1);
  assert.equal(kd.target(1, 'ben'), 1);
  assert.equal(kd.target(1, 'sen'), 0);

  let s = kdStart();
  s = kd.reduce(s, { type: 'pick', by: 0, choice: 'ben' });
  assert.equal(s.phase, 'pick', 'tek seçim açılış yapmaz');
  assert.equal(kd.reduce(s, { type: 'pick', by: 0, choice: 'sen' }), s, 'seçim değişmez');
  s = kd.reduce(s, { type: 'pick', by: 1, choice: 'sen' });
  assert.equal(s.phase, 'reveal');
  assert.equal(s.matches, 1);
  assert.deepEqual(s.log, [{ q: s.qs[0], p: ['ben', 'sen'], m: true }]);

  const d = both(kd, kdStart(), 'ben', 'ben');
  assert.equal(d.matches, 0);
  assert.equal(d.log[0].m, false);
  const e = both(kd, kdStart(), 'sen', 'ben');
  assert.equal(e.log[0].m, true, 'ikisi de Gül dedi');
});

test('kimdaha: geçersiz seçim ve koltuk yok sayılır', () => {
  const s = kdStart();
  assert.equal(kd.reduce(s, { type: 'pick', by: 0, choice: 'a' }), s);
  assert.equal(kd.reduce(s, { type: 'pick', by: 2, choice: 'ben' }), s);
  assert.equal(kd.reduce(s, { type: 'pick', choice: 'ben' }), s);
});

test('kimdaha: next doğru tur ister; son turdan sonra end; result oyları sayar', () => {
  let s = kdStart(10);
  for (let r = 0; r < 10; r++) {
    // 0–5: ikisi de Ömer (anlaşma), 6–7: ikisi de Gül (anlaşma), 8–9: ikisi de "Ben" (anlaşmazlık)
    if (r < 6) s = both(kd, s, 'ben', 'sen');
    else if (r < 8) s = both(kd, s, 'sen', 'ben');
    else s = both(kd, s, 'ben', 'ben');
    assert.equal(kd.reduce(s, { type: 'next', round: r + 1 }), s, 'yanlış tur');
    s = kd.reduce(s, { type: 'next', round: r });
  }
  assert.equal(s.phase, 'end');
  const r = kd.result(s);
  assert.equal(r.played, 10);
  assert.equal(r.matches, 8);
  assert.equal(r.percent, 80);
  assert.deepEqual(r.agreed, [6, 2]);
  assert.deepEqual(r.votes, [6 * 2 + 2, 2 * 2 + 2]);
  assert.equal(typeof r.tier, 'string');
  assert.notEqual(kd.result({ ...s, matches: 0 }).tier, r.tier);
});

test('kimdaha: finish erken bitirir; hiç tur oynanmadıysa kuruluma döner', () => {
  const s0 = kdStart();
  const back = kd.reduce(s0, { type: 'finish' });
  assert.equal(back.phase, 'setup');
  let s = both(kd, kdStart(), 'ben', 'sen');
  s = kd.reduce(s, { type: 'next', round: 0 });
  s = kd.reduce(s, { type: 'pick', by: 0, choice: 'ben' });
  const end = kd.reduce(s, { type: 'finish' });
  assert.equal(end.phase, 'end');
  assert.equal(kd.result(end).played, 1);
  assert.equal(kd.result(end).percent, 100);
  assert.equal(kd.reduce(end, { type: 'finish' }), end);
});

test('kimdaha: restart kurulumu açar; yeni oyun önceki ifadeleri tekrar etmez', () => {
  let s = kdStart(20, 11);
  const first = s.qs;
  s = kd.reduce(s, { type: 'restart' });
  assert.equal(s.phase, 'setup');
  assert.equal(s.count, 20);
  s = kd.reduce(s, { type: 'start', seed: 12 });
  assert.ok(s.qs.every((id) => !first.includes(id)));
  assert.equal(s.matches, 0);
  assert.deepEqual(s.log, []);
  assert.equal(kd.reduce(kd.initialState({ players: P }), { type: 'restart' }).phase, 'setup');
});

test('kimdaha: seat ikinci koltuğu doldurur', () => {
  const s = kd.initialState({ players: [P[0]] });
  const t = kd.reduce(s, { type: 'seat', idx: 1, id: 'gul', name: 'Gül' });
  assert.deepEqual(t.players[1], { id: 'gul', name: 'Gül' });
});

// ---- Hiç … Yaptın mı? ----

const hyStart = (count = 10, seed = 5, cats) => {
  let s = hy.initialState({ players: P });
  if (count !== s.count) s = hy.reduce(s, { type: 'config', count });
  if (cats) s = hy.reduce(s, { type: 'config', cats });
  return hy.reduce(s, { type: 'start', seed });
};

test('hicyaptin: varsayılan seviyeler ve seçim', () => {
  const s = hy.initialState({ players: P });
  assert.equal(s.game, 'hicyaptin');
  assert.deepEqual(s.cats, ['tatli', 'eglenceli']);
  assert.deepEqual(s.ask, [false, false]);
  const g = hyStart(30, 1, ['cesur']);
  assert.ok(g.qs.every((id) => hy.itemById(id)?.cat === 'cesur'));
  assert.equal(hy.reduce(g, { type: 'pick', by: 0, choice: 'ben' }), g, 'kimdaha seçimi geçmez');
  const r = both(hy, g, 'yaptim', 'yaptim');
  assert.equal(r.phase, 'reveal');
  assert.equal(r.log[0].m, true);
  const d = both(hy, hyStart(), 'yaptim', 'yapmadim');
  assert.equal(d.log[0].m, false);
});

test('hicyaptin: "Anlat!" yalnız açılışta, yalnız "Yaptım" diyen karşı tarafa', () => {
  let s = hyStart();
  assert.equal(hy.reduce(s, { type: 'ask', by: 0 }), s, 'seçimde istenmez');
  s = both(hy, s, 'yapmadim', 'yaptim');
  assert.equal(hy.reduce(s, { type: 'ask', by: 1 }), s, 'Ömer yapmadı; ondan istenmez');
  const a = hy.reduce(s, { type: 'ask', by: 0 });
  assert.deepEqual(a.ask, [false, true]);
  assert.equal(hy.reduce(a, { type: 'ask', by: 0 }), a, 'bir kez');
  assert.equal(hy.reduce(a, { type: 'ask', by: 5 }), a);
  const n = hy.reduce(a, { type: 'next', round: 0 });
  assert.equal(n.phase, 'pick');
  assert.deepEqual(n.ask, [false, false], 'yeni turda sıfırlanır');
});

test('hicyaptin: result kim kaç "Yaptım", sürpriz eşleşmeler', () => {
  let s = hyStart(10);
  const plan = [
    ['yaptim', 'yaptim'], ['yaptim', 'yaptim'], ['yaptim', 'yapmadim'], ['yapmadim', 'yaptim'],
    ['yapmadim', 'yaptim'], ['yapmadim', 'yapmadim'], ['yapmadim', 'yapmadim'], ['yaptim', 'yaptim'],
    ['yapmadim', 'yaptim'], ['yapmadim', 'yapmadim'],
  ];
  plan.forEach(([a, b], r) => {
    s = both(hy, s, a, b);
    s = hy.reduce(s, { type: 'next', round: r });
  });
  assert.equal(s.phase, 'end');
  const r = hy.result(s);
  assert.equal(r.played, 10);
  assert.deepEqual(r.did, [4, 6]);
  assert.equal(r.both, 3);
  assert.equal(r.none, 3);
  assert.equal(r.same, 6);
  assert.equal(r.percent, 60);
});
