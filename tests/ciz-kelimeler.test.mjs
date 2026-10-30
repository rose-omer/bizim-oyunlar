import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WORDS } from '../games/ciz/kelimeler.js';
import { normalize } from '../games/ciz/oyun.js';

test('kelime bankası: en az 150 kelime', () => {
  assert.ok(WORDS.length >= 150, `yalnız ${WORDS.length}`);
});

test('kelime bankası: normalize sonrası da tekil', () => {
  const seen = new Map();
  for (const w of WORDS) {
    const n = normalize(w);
    assert.ok(!seen.has(n), `tekrar: "${w}" ~ "${seen.get(n)}"`);
    seen.set(n, w);
  }
});

test('kelime bankası: küçük harf, Türkçe harf ve tek boşluk, makul uzunluk', () => {
  for (const w of WORDS) {
    assert.match(w, /^[a-zçğıöşü]+( [a-zçğıöşü]+)?$/, `biçim: "${w}"`);
    assert.ok(w.length >= 2 && w.length <= 16, `uzunluk: "${w}"`);
    assert.equal(w, w.toLocaleLowerCase('tr-TR'));
  }
});
