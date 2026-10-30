// Doğruluk mu Cesaret mi — saf durum makinesi.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reduce, initialState, LEVELS, KINDS, cardById, poolFor, winner } from '../games/dogruluk/logic.js';

const P = [{ id: 'h', name: 'Ayşe' }, { id: 'g', name: 'Mehmet' }];
const start = (levels = ['tatli'], seed = 77) =>
  reduce(reduce(initialState({ players: P }), { type: 'config', levels }), { type: 'start', seed });

test('başlangıç: kurulum, varsayılan seviyeler', () => {
  const s = initialState({ players: P });
  assert.equal(s.phase, 'setup');
  assert.deepEqual(s.levels, ['tatli', 'eglenceli']);
  assert.deepEqual(LEVELS, ['tatli', 'eglenceli', 'cesur']);
  assert.deepEqual(KINDS, ['dogruluk', 'cesaret']);
  assert.equal(s.solo, false);
  assert.equal(initialState({ players: P, solo: true }).solo, true);
});

test('config: geçerli seviyeleri sıralı ve tekil tutar; boş liste reddedilir', () => {
  const s = initialState({ players: P });
  const s2 = reduce(s, { type: 'config', levels: ['cesur', 'tatli', 'cesur', 'yok'] });
  assert.deepEqual(s2.levels, ['tatli', 'cesur']);
  assert.equal(reduce(s, { type: 'config', levels: [] }), s);
  assert.equal(reduce(s, { type: 'config', levels: ['yok'] }), s);
  assert.equal(reduce(s, { type: 'config', levels: 'tatli' }), s);
  const g = reduce(s2, { type: 'start', seed: 1 });
  assert.equal(reduce(g, { type: 'config', levels: ['tatli'] }), g);
});

test('start: seçim aşaması, sıra 0 ya da 1, puanlar sıfır', () => {
  const s = start();
  assert.equal(s.phase, 'choose');
  assert.ok(s.turn === 0 || s.turn === 1);
  assert.deepEqual(s.scores, [0, 0]);
  assert.equal(s.card, null);
});

test('yalnız sırası gelen seçer; kart seçilen seviye ve türden', () => {
  let s = start(['eglenceli']);
  const t = s.turn;
  assert.equal(reduce(s, { type: 'choose', by: 1 - t, kind: 'dogruluk' }), s);
  assert.equal(reduce(s, { type: 'choose', by: t, kind: 'yok' }), s);
  s = reduce(s, { type: 'choose', by: t, kind: 'cesaret' });
  assert.equal(s.phase, 'card');
  const c = cardById(s.card);
  assert.equal(c.level, 'eglenceli');
  assert.equal(c.kind, 'cesaret');
  assert.ok(c.text.length > 0);
  assert.equal(reduce(s, { type: 'choose', by: t, kind: 'cesaret' }), s);
});

test('yalnız diğer oyuncu işaretler; yaptı puan verir, sıra değişir', () => {
  let s = start();
  const t = s.turn;
  s = reduce(s, { type: 'choose', by: t, kind: 'dogruluk' });
  assert.equal(reduce(s, { type: 'mark', by: t, result: 'done' }), s);
  assert.equal(reduce(s, { type: 'mark', by: 1 - t, result: 'belki' }), s);
  s = reduce(s, { type: 'mark', by: 1 - t, result: 'done' });
  assert.equal(s.phase, 'choose');
  assert.equal(s.scores[t], 1);
  assert.equal(s.scores[1 - t], 0);
  assert.equal(s.turn, 1 - t);
  assert.equal(s.card, null);
  assert.deepEqual(s.last, { seat: t, result: 'done' });
});

test('pas puan vermez, pas sayılır', () => {
  let s = start();
  const t = s.turn;
  s = reduce(s, { type: 'choose', by: t, kind: 'cesaret' });
  s = reduce(s, { type: 'mark', by: 1 - t, result: 'pass' });
  assert.deepEqual(s.scores, [0, 0]);
  assert.equal(s.passes[t], 1);
  assert.equal(s.turn, 1 - t);
});

test('kartlar havuz bitene kadar tekrar etmez, sonra yeniden başlar', () => {
  let s = start(['tatli']);
  const n = poolFor(['tatli'], 'dogruluk').length;
  assert.ok(n >= 40);
  const seen = new Set();
  for (let i = 0; i < n; i++) {
    s = reduce(s, { type: 'choose', by: s.turn, kind: 'dogruluk' });
    assert.ok(!seen.has(s.card), `tekrar: ${s.card}`);
    seen.add(s.card);
    s = reduce(s, { type: 'mark', by: 1 - s.turn, result: 'pass' });
  }
  assert.equal(seen.size, n);
  s = reduce(s, { type: 'choose', by: s.turn, kind: 'dogruluk' });
  assert.equal(s.phase, 'card');
  assert.ok(seen.has(s.card));
  assert.ok(JSON.stringify(s).length < 100_000);
});

test('karışık seviyede kartlar yalnız seçili seviyelerden', () => {
  let s = start(['tatli', 'cesur'], 3);
  for (let i = 0; i < 60; i++) {
    s = reduce(s, { type: 'choose', by: s.turn, kind: i % 2 ? 'cesaret' : 'dogruluk' });
    assert.ok(['tatli', 'cesur'].includes(cardById(s.card).level));
    s = reduce(s, { type: 'mark', by: 1 - s.turn, result: 'done' });
  }
  assert.equal(s.scores[0] + s.scores[1], 60);
});

test('aynı tohum aynı kartları çeker', () => {
  const run = () => {
    let s = start(['eglenceli'], 42);
    const out = [];
    for (let i = 0; i < 5; i++) {
      s = reduce(s, { type: 'choose', by: s.turn, kind: 'dogruluk' });
      out.push(s.card);
      s = reduce(s, { type: 'mark', by: 1 - s.turn, result: 'done' });
    }
    return out;
  };
  assert.deepEqual(run(), run());
});

test('finish her an bitirir; restart kuruluma döner; winner', () => {
  let s = start();
  const t = s.turn;
  s = reduce(s, { type: 'choose', by: t, kind: 'dogruluk' });
  s = reduce(s, { type: 'mark', by: 1 - t, result: 'done' });
  const e = reduce(s, { type: 'finish' });
  assert.equal(e.phase, 'end');
  assert.equal(winner(e), t);
  assert.equal(reduce(e, { type: 'finish' }), e);
  assert.equal(winner({ scores: [2, 2] }), null);
  const r = reduce(e, { type: 'restart' });
  assert.equal(r.phase, 'setup');
  assert.deepEqual(r.players, P);
  const setup = initialState({ players: P });
  assert.equal(reduce(setup, { type: 'finish' }), setup);
});
