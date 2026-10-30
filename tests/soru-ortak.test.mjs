// Soru oyunları ortak saf yardımcıları: tohumlu rastgelelik, oyuncu koltuğu, unvan.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32, shuffle, drawOrder, mix } from '../games/_soru/rng.js';
import { seat, tier, percent, isSeat } from '../games/_soru/common.js';

test('mulberry32 aynı tohumla aynı diziyi verir', () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  for (let i = 0; i < 20; i++) {
    const x = a();
    assert.equal(x, b());
    assert.ok(x >= 0 && x < 1);
  }
  assert.notEqual(mulberry32(1)(), mulberry32(2)());
});

test('shuffle permütasyondur, tohuma bağlıdır, girdiyi değiştirmez', () => {
  const ids = Array.from({ length: 30 }, (_, i) => i);
  const copy = ids.slice();
  const s1 = shuffle(ids, 7);
  assert.deepEqual([...s1].sort((x, y) => x - y), ids);
  assert.deepEqual(shuffle(ids, 7), s1);
  assert.notDeepEqual(shuffle(ids, 8), s1);
  assert.deepEqual(ids, copy);
});

test('drawOrder önce görülmemişleri seçer, yetmezse sıfırlar', () => {
  const ids = ['a', 'b', 'c', 'd', 'e'];
  const r1 = drawOrder(ids, 3, 1, []);
  assert.equal(r1.order.length, 3);
  assert.equal(new Set(r1.order).size, 3);
  assert.deepEqual(r1.used, r1.order);

  const r2 = drawOrder(ids, 2, 2, r1.used);
  assert.ok(r2.order.every((id) => !r1.order.includes(id)));
  assert.equal(r2.used.length, 5);

  const r3 = drawOrder(ids, 2, 3, r2.used);
  assert.equal(r3.order.length, 2);
  assert.deepEqual(r3.used, r3.order);
});

test('mix farklı sayaçlar için farklı tohum üretir', () => {
  const seen = new Set();
  for (let n = 0; n < 50; n++) seen.add(mix(12345, n));
  assert.equal(seen.size, 50);
  assert.equal(mix(9, 3), mix(9, 3));
});

test('seat oyuncuyu günceller, değişiklik yoksa aynı nesneyi döner', () => {
  const s = { players: [{ id: 'h', name: 'Ayşe' }, { id: '', name: '' }] };
  const s2 = seat(s, { type: 'seat', idx: 1, id: 'g', name: ' Mehmet ' });
  assert.deepEqual(s2.players[1], { id: 'g', name: 'Mehmet' });
  assert.equal(s.players[1].id, '');
  assert.equal(seat(s2, { idx: 1, id: 'g', name: 'Mehmet' }), s2);
  assert.equal(seat(s2, { idx: 5, id: 'x', name: 'X' }), s2);
  assert.equal(seat(s2, { idx: 1, id: 'g', name: '   ' }).players[1].name, 'Mehmet');
  assert.equal(seat(s2, { idx: 0, name: 'x'.repeat(80) }).players[0].name.length, 24);
});

test('tier, percent, isSeat', () => {
  const T = [[80, 'A'], [50, 'B'], [0, 'C']];
  assert.equal(tier(85, T), 'A');
  assert.equal(tier(80, T), 'A');
  assert.equal(tier(79, T), 'B');
  assert.equal(tier(0, T), 'C');
  assert.equal(percent(1, 3), 33);
  assert.equal(percent(0, 0), 0);
  assert.ok(isSeat(0) && isSeat(1));
  assert.ok(!isSeat(2) && !isSeat('0') && !isSeat(null));
});
