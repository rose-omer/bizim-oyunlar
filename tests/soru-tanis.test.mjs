// Beni Ne Kadar Tanıyorsun? — saf durum makinesi.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reduce, initialState, COUNTS, subjectOf, questionById, result } from '../games/tanis/logic.js';

const P = [{ id: 'h', name: 'Ayşe' }, { id: 'g', name: 'Mehmet' }];
const start = (count = 6, seed = 123) =>
  reduce(initialState({ players: P, count }), { type: 'start', seed });

/** Bir turu oynar: özne `answer`, tahminci `guess` seçer, sonra sonraki. */
function play(s, answer, guess) {
  const subj = subjectOf(s);
  s = reduce(s, { type: 'pick', by: subj, choice: answer });
  s = reduce(s, { type: 'pick', by: 1 - subj, choice: guess });
  return reduce(s, { type: 'next', round: s.round });
}

test('başlangıç: kurulum aşaması, varsayılan 10 soru', () => {
  const s = initialState({ players: P });
  assert.equal(s.game, 'tanis');
  assert.equal(s.phase, 'setup');
  assert.equal(s.count, 10);
  assert.deepEqual(s.players, P);
  assert.deepEqual(COUNTS, [6, 10, 16]);
});

test('config yalnız kurulumda ve geçerli sayılarla', () => {
  let s = initialState({ players: P });
  s = reduce(s, { type: 'config', count: 16 });
  assert.equal(s.count, 16);
  assert.equal(reduce(s, { type: 'config', count: 7 }), s);
  const g = reduce(s, { type: 'start', seed: 1 });
  assert.equal(reduce(g, { type: 'config', count: 6 }), g);
});

test('start: count kadar farklı ve geçerli soru seçer', () => {
  for (const c of COUNTS) {
    const s = start(c);
    assert.equal(s.phase, 'pick');
    assert.equal(s.round, 0);
    assert.equal(s.qs.length, c);
    assert.equal(new Set(s.qs).size, c);
    assert.ok(s.qs.every((id) => questionById(id)));
    assert.deepEqual(s.picks, [null, null]);
    assert.deepEqual(s.scores, [0, 0]);
  }
  assert.deepEqual(start(10, 5).qs, start(10, 5).qs);
});

test('start yalnız kurulumdan', () => {
  const s = start();
  assert.equal(reduce(s, { type: 'start', seed: 9 }), s);
});

test('tek seçim açılış yapmaz; seçim kilitlenir; ikisi seçince açılır', () => {
  let s = start();
  const subj = subjectOf(s);
  const g = 1 - subj;
  s = reduce(s, { type: 'pick', by: subj, choice: 2 });
  assert.equal(s.phase, 'pick');
  assert.equal(s.picks[subj], 2);
  assert.equal(s.picks[g], null);
  assert.equal(reduce(s, { type: 'pick', by: subj, choice: 1 }), s);

  s = reduce(s, { type: 'pick', by: g, choice: 2 });
  assert.equal(s.phase, 'reveal');
  assert.equal(s.scores[g], 1);
  assert.equal(s.asked[g], 1);
  assert.equal(s.scores[subj], 0);
  assert.equal(s.asked[subj], 0);
  assert.equal(reduce(s, { type: 'pick', by: g, choice: 3 }), s);
});

test('yanlış tahmin puan vermez ama sayılır', () => {
  let s = start();
  const subj = subjectOf(s);
  s = reduce(s, { type: 'pick', by: 1 - subj, choice: 0 });
  s = reduce(s, { type: 'pick', by: subj, choice: 3 });
  assert.equal(s.phase, 'reveal');
  assert.deepEqual(s.scores, [0, 0]);
  assert.equal(s.asked[1 - subj], 1);
});

test('geçersiz seçimler yok sayılır', () => {
  const s = start();
  assert.equal(reduce(s, { type: 'pick', by: 2, choice: 1 }), s);
  assert.equal(reduce(s, { type: 'pick', by: 0, choice: 4 }), s);
  assert.equal(reduce(s, { type: 'pick', by: 0, choice: -1 }), s);
  assert.equal(reduce(s, { type: 'pick', by: 0, choice: '1' }), s);
  assert.equal(reduce(s, { type: 'pick', by: 0 }), s);
  const setup = initialState({ players: P });
  assert.equal(reduce(setup, { type: 'pick', by: 0, choice: 1 }), setup);
});

test('next: yalnız açılışta ve doğru turda; özne sırayla değişir', () => {
  let s = start();
  const subj0 = subjectOf(s);
  assert.equal(reduce(s, { type: 'next', round: 0 }), s);
  s = reduce(s, { type: 'pick', by: 0, choice: 1 });
  s = reduce(s, { type: 'pick', by: 1, choice: 1 });
  assert.equal(reduce(s, { type: 'next', round: 5 }), s);
  s = reduce(s, { type: 'next', round: 0 });
  assert.equal(s.phase, 'pick');
  assert.equal(s.round, 1);
  assert.equal(subjectOf(s), 1 - subj0);
  assert.deepEqual(s.picks, [null, null]);
  assert.equal(reduce(s, { type: 'next', round: 0 }), s);
});

test('oyun sonu: count tur sonra end; herkes yarı yarıya tahmin eder', () => {
  let s = start(10);
  for (let r = 0; r < 10; r++) s = play(s, 0, r % 2 === 0 ? 0 : 1);
  assert.equal(s.phase, 'end');
  assert.deepEqual(s.asked, [5, 5]);
  assert.equal(s.scores[0] + s.scores[1], 5);
  const res = result(s);
  assert.equal(res.percent, 50);
  assert.equal(typeof res.tier, 'string');
  assert.ok(res.tier.length > 0);
  assert.equal(reduce(s, { type: 'next', round: 9 }), s);
});

test('result: tam puan en yüksek unvanı verir', () => {
  let s = start(6);
  for (let r = 0; r < 6; r++) s = play(s, 2, 2);
  const res = result(s);
  assert.equal(res.percent, 100);
  assert.deepEqual(res.per, [{ correct: 3, of: 3 }, { correct: 3, of: 3 }]);
  let z = start(6);
  for (let r = 0; r < 6; r++) z = play(z, 2, 1);
  assert.notEqual(result(z).tier, res.tier);
});

test('restart kurulumu açar; yeni oyun önceki soruları tekrar etmez', () => {
  let s = start(16);
  const first = s.qs;
  s = reduce(s, { type: 'restart' });
  assert.equal(s.phase, 'setup');
  assert.equal(s.count, 16);
  assert.deepEqual(s.players, P);
  s = reduce(s, { type: 'start', seed: 999 });
  assert.ok(s.qs.every((id) => !first.includes(id)));
  const setup = initialState({ players: P });
  assert.equal(reduce(setup, { type: 'restart' }), setup);
});

test('seat partner adını günceller; bilinmeyen eylem ve boş durum', () => {
  const s = start();
  const s2 = reduce(s, { type: 'seat', idx: 1, id: 'g2', name: 'Memo' });
  assert.deepEqual(s2.players[1], { id: 'g2', name: 'Memo' });
  assert.equal(reduce(s, { type: 'uç' }), s);
  assert.equal(reduce(null, { type: 'start', seed: 1 }), null);
});
