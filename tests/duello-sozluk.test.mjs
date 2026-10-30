import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KELIMELER, kelimeVar, rastgeleKelime } from '../games/duello/sozluk.js';

const TR = /^[abcçdefgğhıijklmnoöprsştuüvyz]{5}$/u;

test('sözlük: en az 2000 kelime', () => {
  assert.ok(KELIMELER.length >= 2000, `yalnız ${KELIMELER.length} kelime`);
});

test('sözlük: hepsi 5 harf, yalnız Türkçe küçük harf, NFC', () => {
  const kotu = KELIMELER.filter((k) => !TR.test(k) || k.normalize('NFC') !== k || [...k].length !== 5);
  assert.deepEqual(kotu, []);
});

test('sözlük: tekrar yok', () => {
  assert.equal(new Set(KELIMELER).size, KELIMELER.length);
});

test('sözlük: değiştirilemez dizi', () => {
  assert.ok(Object.isFrozen(KELIMELER));
});

test('sözlük: yaygın kelimeler var, uygunsuz ve özel adlar yok', () => {
  for (const k of ['kalem', 'kitap', 'çiçek', 'güneş', 'deniz', 'şeker', 'ırmak', 'ılıca', 'öğlen', 'üzgün', 'sevgi', 'düğün']) {
    assert.ok(kelimeVar(k), k);
  }
  for (const k of ['ankara', 'ahmet', 'şarap', 'silah', 'tüfek', 'katil', 'aptal', 'salak', 'sikke', 'kaltak', 'sapık', 'esrar']) {
    assert.equal(kelimeVar(k), false, k);
  }
});

test('kelimeVar: tam eşleşme, büyük harf ve boşluk kabul etmez', () => {
  assert.equal(kelimeVar('kalem'), true);
  assert.equal(kelimeVar('KALEM'), false);
  assert.equal(kelimeVar(' kalem'), false);
  assert.equal(kelimeVar(''), false);
  assert.equal(kelimeVar(null), false);
});

test('rastgeleKelime: tohumlu, sözlükten', () => {
  let i = 0;
  const seq = [0, 0.5, 0.9999];
  const rnd = () => seq[i++ % seq.length];
  const a = rastgeleKelime(rnd);
  assert.equal(a, KELIMELER[0]);
  assert.ok(kelimeVar(rastgeleKelime(rnd)));
  assert.equal(rastgeleKelime(rnd), KELIMELER[KELIMELER.length - 1]);
});
