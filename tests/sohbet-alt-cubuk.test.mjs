// Sohbet: yüzen alt çubuk mesaj kutusunu örtmesin.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { altCubukPayi } from '../sayfalar/sohbet/mantik.js';

test('altCubukPayi: yükseklik + ekranın altındaki boşluk', () => {
  assert.equal(altCubukPayi(66, '10px'), 76);
  assert.equal(altCubukPayi(66, '44px'), 110); // 34 px güvenli alanlı telefon
  assert.equal(altCubukPayi(66.5, '10.5px'), 77);
});

test('altCubukPayi: klavye açıkken çubuk gizli, pay 0', () => {
  assert.equal(altCubukPayi(0, '10px'), 0);
});

test('altCubukPayi: boşluk okunamazsa yalnız yükseklik', () => {
  assert.equal(altCubukPayi(66, 'auto'), 66);
  assert.equal(altCubukPayi(66, ''), 66);
});

test('sohbet sayfası payı boşlukla ölçer; ekran dönünce de yeniden ölçer', () => {
  const s = readFileSync(new URL('../sayfalar/sohbet/app.js', import.meta.url), 'utf8');
  assert.match(s, /altCubukPayi\(tabbar\.offsetHeight, getComputedStyle\(tabbar\)\.bottom\)/);
  assert.match(s, /new ResizeObserver\(cubukOlc\)/);
  assert.match(s, /addEventListener\('resize', cubukOlc\)/);
});
