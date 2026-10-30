// Aynı Kafa — saf durum makinesi.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reduce, initialState, COUNTS, PICK_MS, pairOf, result } from '../games/aynikafa/logic.js';

const P = [{ id: 'h', name: 'Ayşe' }, { id: 'g', name: 'Mehmet' }];
const T0 = 1_000_000;
const start = (count = 10, seed = 5) =>
  reduce(initialState({ players: P, count }), { type: 'start', seed, now: T0 });

function both(s, a, b) {
  s = reduce(s, { type: 'pick', by: 0, choice: a });
  return reduce(s, { type: 'pick', by: 1, choice: b });
}

test('başlangıç ve start: süre, sorular', () => {
  const init = initialState({ players: P });
  assert.equal(init.phase, 'setup');
  assert.equal(init.count, 15);
  assert.deepEqual(COUNTS, [10, 15, 25]);
  assert.equal(PICK_MS, 10000);

  const s = start();
  assert.equal(s.phase, 'pick');
  assert.equal(s.deadline, T0 + PICK_MS);
  assert.equal(s.qs.length, 10);
  assert.equal(new Set(s.qs).size, 10);
  assert.ok(s.qs.every((id) => pairOf(id)));
});

test('config yalnız kurulumda ve geçerli sayılarla', () => {
  let s = initialState({ players: P });
  s = reduce(s, { type: 'config', count: 25 });
  assert.equal(s.count, 25);
  assert.equal(reduce(s, { type: 'config', count: 11 }), s);
  const g = reduce(s, { type: 'start', seed: 1, now: T0 });
  assert.equal(g.qs.length, 25);
  assert.equal(reduce(g, { type: 'config', count: 10 }), g);
});

test('aynı seçim eşleşir; tek seçim açılış yapmaz', () => {
  let s = start();
  s = reduce(s, { type: 'pick', by: 0, choice: 'a' });
  assert.equal(s.phase, 'pick');
  assert.equal(reduce(s, { type: 'pick', by: 0, choice: 'b' }), s);
  s = reduce(s, { type: 'pick', by: 1, choice: 'a' });
  assert.equal(s.phase, 'reveal');
  assert.equal(s.matches, 1);
  assert.deepEqual(s.log, [{ q: s.qs[0], p: ['a', 'a'], m: true }]);
});

test('farklı seçim eşleşmez', () => {
  const s = both(start(), 'a', 'b');
  assert.equal(s.phase, 'reveal');
  assert.equal(s.matches, 0);
  assert.equal(s.log[0].m, false);
});

test('geçersiz seçim yok sayılır', () => {
  const s = start();
  assert.equal(reduce(s, { type: 'pick', by: 0, choice: 'c' }), s);
  assert.equal(reduce(s, { type: 'pick', by: 3, choice: 'a' }), s);
  const r = both(s, 'a', 'a');
  assert.equal(reduce(r, { type: 'pick', by: 0, choice: 'b' }), r);
});

test('timeout: süre dolmadan ya da yanlış turda etkisiz; dolunca seçmeyen eşleşmez', () => {
  let s = start();
  s = reduce(s, { type: 'pick', by: 0, choice: 'b' });
  assert.equal(reduce(s, { type: 'timeout', round: 0, now: T0 + 5000 }), s);
  assert.equal(reduce(s, { type: 'timeout', round: 1, now: T0 + PICK_MS }), s);
  s = reduce(s, { type: 'timeout', round: 0, now: T0 + PICK_MS });
  assert.equal(s.phase, 'reveal');
  assert.equal(s.matches, 0);
  assert.deepEqual(s.log[0], { q: s.qs[0], p: ['b', null], m: false });
  assert.equal(reduce(s, { type: 'timeout', round: 0, now: T0 + 2 * PICK_MS }), s);
});

test('timeout: ikisi de seçmezse eşleşme yok', () => {
  const s = reduce(start(), { type: 'timeout', round: 0, now: T0 + PICK_MS + 1 });
  assert.equal(s.phase, 'reveal');
  assert.deepEqual(s.log[0].p, [null, null]);
  assert.equal(s.log[0].m, false);
});

test('next yeni süre başlatır; doğru tur ister; son turdan sonra end', () => {
  let s = both(start(10), 'a', 'a');
  assert.equal(reduce(s, { type: 'next', round: 4, now: T0 + 3000 }), s);
  s = reduce(s, { type: 'next', round: 0, now: T0 + 3000 });
  assert.equal(s.phase, 'pick');
  assert.equal(s.round, 1);
  assert.equal(s.deadline, T0 + 3000 + PICK_MS);
  assert.deepEqual(s.picks, [null, null]);
  for (let r = 1; r < 10; r++) {
    s = both(s, 'a', r < 6 ? 'a' : 'b');
    s = reduce(s, { type: 'next', round: r, now: T0 });
  }
  assert.equal(s.phase, 'end');
  assert.equal(s.matches, 6);
  assert.equal(s.log.length, 10);
  const res = result(s);
  assert.equal(res.percent, 60);
  assert.equal(typeof res.tier, 'string');
});

test('rearm yalnız seçim aşamasında süreyi yeniler', () => {
  const s = start();
  const r = reduce(s, { type: 'rearm', now: T0 + 50000 });
  assert.equal(r.deadline, T0 + 50000 + PICK_MS);
  const rev = both(s, 'a', 'b');
  assert.equal(reduce(rev, { type: 'rearm', now: T0 + 1 }), rev);
});

test('result unvanları yüzdeye göre değişir', () => {
  const full = { phase: 'end', count: 10, matches: 10, log: [] };
  const none = { phase: 'end', count: 10, matches: 0, log: [] };
  assert.equal(result(full).percent, 100);
  assert.notEqual(result(full).tier, result(none).tier);
});

test('restart kurulumu açar; yeni oyun önceki ikilileri tekrar etmez', () => {
  let s = start(25);
  const first = s.qs;
  s = reduce(s, { type: 'restart' });
  assert.equal(s.phase, 'setup');
  s = reduce(s, { type: 'start', seed: 77, now: T0 });
  assert.ok(s.qs.every((id) => !first.includes(id)));
  assert.equal(s.matches, 0);
  assert.deepEqual(s.log, []);
});
