// Yavrumuz: yatak odası ninnisi (sayfalar/yavru/ninni.js). Saf kısım: ezgi, frekans, süre, ifade kararı.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NINNI, BAS, OLCU, VURUS, notaFrekans, ninniSuresi, ninniRuhu, NINNI_UYKULU } from '../sayfalar/yavru/ninni.js';
import { oku } from '../sayfalar/yavru/mantik.js';

const T0 = Date.UTC(2026, 10, 2, 20, 0, 0);
const iso = (t) => new Date(t).toISOString();

test('notaFrekans: eşit tamperaman', () => {
  assert.equal(notaFrekans('A4'), 440);
  assert.ok(Math.abs(notaFrekans('C4') - 261.63) < 0.01);
  assert.ok(Math.abs(notaFrekans('C5') - 2 * notaFrekans('C4')) < 1e-9);
  assert.ok(Math.abs(notaFrekans('F#4') - 369.99) < 0.01);
  assert.ok(Number.isNaN(notaFrekans('H2')));
  assert.ok(Number.isNaN(notaFrekans('')));
});

test('ezgi: 8 ölçü × 3 birim, geçerli notalar, tek oktav, durakta biter', () => {
  let olcu = 0;
  const olculer = [];
  for (const [ad, d] of NINNI) {
    assert.ok(Number.isFinite(notaFrekans(ad)), ad);
    assert.ok(d > 0);
    olcu += d;
    if (olcu >= OLCU) { olculer.push(olcu); olcu = 0; }
  }
  assert.deepEqual(olculer, Array(8).fill(OLCU), 'her ölçü tam 3 birim');
  assert.equal(BAS.length, olculer.length);
  const f = NINNI.map(([ad]) => notaFrekans(ad));
  assert.ok(Math.min(...f) >= notaFrekans('C4') && Math.max(...f) <= notaFrekans('C5'), 'tek oktav');
  assert.equal(NINNI.at(-1)[0], 'C4');
  const ms = ninniSuresi();
  assert.ok(ms >= 8000 && ms <= 15000, String(ms));
  assert.equal(ms, Math.round((24 * VURUS + 0.8) * 1000));
  assert.throws(() => { NINNI[0][1] = 9; }, TypeError, 'donuk');
});

const yavru = (enerji, ek = {}) => oku({
  asama: 'kucuk', ad: 'Pamuk', renk: 2, dogum: iso(T0 - 86400000), catlama: iso(T0 - 3600000),
  ihtiyac: { tokluk: { v: 80, t: iso(T0) }, mutluluk: { v: 80, t: iso(T0) }, temizlik: { v: 80, t: iso(T0) }, enerji: { v: enerji, t: iso(T0) } },
  uyku: null, puan: {}, isitma: {}, son: {}, ...ek,
});

test('ninniRuhu: uyanık ve enerjisi düşükse uykulu; yoksa gerçek ifade kalır', () => {
  assert.equal(ninniRuhu(yavru(NINNI_UYKULU - 10), T0), 'uykulu');
  assert.equal(ninniRuhu(yavru(90), T0), null);
  assert.equal(ninniRuhu(yavru(10, { uyku: { bas: iso(T0 - 1000), bit: iso(T0 + 3600000) } }), T0), null, 'uyurken');
  assert.equal(ninniRuhu(null, T0), null);
  assert.equal(ninniRuhu(yavru(10, { asama: 'yumurta' }), T0), null);
});
