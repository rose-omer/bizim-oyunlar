import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OYUNLAR, JETON_SINIRI, skorJeton, sonucBasligi } from '../sayfalar/yavru/oyunlar/cerceve.js';
import { KAYNAKLAR } from '../sayfalar/yavru/jeton.js';
import * as cee from '../sayfalar/yavru/oyunlar/cee.js';

test('cerceve: yedi oyun kayıtlı, her birinin adı, ipucu ve oranı var', () => {
  assert.deepEqual(Object.keys(OYUNLAR), ['balon', 'top', 'cee', 'ninni', 'giydir', 'tarif', 'salla']);
  for (const o of Object.values(OYUNLAR)) {
    assert.ok(o.ad && o.ozet && o.ipucu.length >= 2);
    assert.ok(o.oran > 0 && o.oran <= 1);
    assert.equal(typeof o.ekran, 'function');
  }
  assert.ok(KAYNAKLAR.includes('oyun'), 'jeton.js oyun kaynağını tanır');
});

test('skorJeton: oran ve aşağı yuvarlama', () => {
  assert.equal(skorJeton('balon', 24), 12);
  assert.equal(skorJeton('top', 25), 12);
  assert.equal(skorJeton('ninni', 41), 20);
  assert.equal(skorJeton('cee', 17), 17);
});

test('skorJeton: üst sınır oyun başı JETON_SINIRI', () => {
  assert.equal(JETON_SINIRI, 30);
  for (const oyun of Object.keys(OYUNLAR)) {
    assert.equal(skorJeton(oyun, 10_000), JETON_SINIRI);
    assert.equal(skorJeton(oyun, Number.MAX_SAFE_INTEGER), JETON_SINIRI);
  }
});

test('skorJeton: pozitif skor en az 1; sıfır, eksi, bozuk ve bilinmeyen 0', () => {
  assert.equal(skorJeton('balon', 1), 1);
  assert.equal(skorJeton('balon', 0), 0);
  assert.equal(skorJeton('balon', -5), 0);
  assert.equal(skorJeton('balon', NaN), 0);
  assert.equal(skorJeton('balon', Infinity), 0);
  assert.equal(skorJeton('balon', '20'), 0);
  assert.equal(skorJeton('yok', 20), 0);
  assert.equal(skorJeton('__proto__', 20), 0);
  assert.equal(skorJeton('toString', 20), 0);
});

test('skorJeton: sonuç jetonKazan için pozitif tam sayı ya da 0', () => {
  for (const oyun of Object.keys(OYUNLAR)) {
    for (let s = 0; s < 200; s += 7) {
      const j = skorJeton(oyun, s + 0.5);
      assert.ok(Number.isInteger(j) && j >= 0 && j <= JETON_SINIRI);
    }
  }
});

test('skorJeton: Ce-e en yüksek skoru sınırı aşmaz ama ona yakın', () => {
  let enCok = 0;
  for (let t = 1; t <= cee.TUR_SAYISI; t++) enCok += cee.turPuan(t);
  assert.equal(skorJeton('cee', enCok), JETON_SINIRI);
  assert.ok(skorJeton('cee', enCok - cee.turPuan(cee.TUR_SAYISI)) >= 20);
});

test('sonucBasligi: jetona göre sıcak başlık', () => {
  assert.equal(sonucBasligi('balon', 30), 'Muhteşem!');
  assert.equal(sonucBasligi('balon', 12), 'Çok güzel!');
  assert.equal(sonucBasligi('balon', 1), 'Yavru bayıldı!');
  assert.equal(sonucBasligi('balon', 0), 'Bir daha deneyelim mi?');
});
