// Günün Sorusu bankası: en az 400, tekil, boş yok, kategoriler dengeli, tanis'ten kopya yok.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SORULAR } from '../sayfalar/gunun-sorusu/sorular.js';
import { KATEGORILER, bankaHatalari, normalize } from '../sayfalar/gunun-sorusu/mantik.js';
import { SORULAR as TANIS } from '../games/tanis/sorular.js';

test('banka doğrulaması hatasız ve en az 400 soru', () => {
  assert.deepEqual(bankaHatalari(SORULAR), []);
  assert.ok(SORULAR.length >= 400, `soru sayısı ${SORULAR.length}`);
});

test('her kategoride en az 70 soru', () => {
  for (const k of Object.keys(KATEGORILER)) {
    const n = SORULAR.filter((q) => q.k === k).length;
    assert.ok(n >= 70, `${k}: ${n}`);
  }
});

test('tanis sorularıyla aynı metin yok', () => {
  const tanis = new Set(TANIS.flatMap((q) => [normalize(q.self), normalize(q.other)]));
  for (const q of SORULAR) assert.ok(!tanis.has(normalize(q.s)), q.s);
});

test('bankaHatalari sorunları yakalar', () => {
  const bad = [
    { id: 'x1', k: 'hafif', s: 'Bir soru mu?' },
    { id: 'x1', k: 'hafif', s: 'Başka soru mu?' },
    { id: 'x2', k: 'yok', s: 'Kategori yanlış mı?' },
    { id: 'x3', k: 'derin', s: '  bir soru mu?  ' },
    { id: 'x4', k: 'derin', s: '' },
    { id: 'x5', k: 'derin', s: 'Soru işareti yok' },
  ];
  const errs = bankaHatalari(bad).join('\n');
  assert.match(errs, /tekrarlanan id x1/);
  assert.match(errs, /x2.*kategori/);
  assert.match(errs, /x3/);
  assert.match(errs, /x4/);
  assert.match(errs, /x5/);
  assert.match(bankaHatalari(bad).join('\n'), /en az 400/);
});
