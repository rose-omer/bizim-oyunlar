// Ortak kabuk (ui.js): üst çubuk adı ve geri düğmesi kararı (saf).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ilkAd, geriGidilebilir } from '../js/core/ui.js';

test('ilkAd: yalnız ilk ad, boşluklar temizlenir', () => {
  assert.equal(ilkAd('Gül'), 'Gül');
  assert.equal(ilkAd('  Ayşe Gül  Yılmaz '), 'Ayşe');
  assert.equal(ilkAd('Ömer\tFaruk'), 'Ömer');
  assert.equal(ilkAd(''), '');
  assert.equal(ilkAd(null), '');
});

test('geriGidilebilir: aynı siteden gelindiyse ve önceki sayfa varsa', () => {
  const kok = 'https://rose-omer.github.io/bizim-oyunlar/';
  const simdiki = `${kok}sayfalar/ayarlar/`;
  const o = (ek) => ({ kok, simdiki, gecmis: 3, ...ek });
  assert.equal(geriGidilebilir(o({ referrer: `${kok}sayfalar/daha/` })), true);
  assert.equal(geriGidilebilir(o({ referrer: `${kok}?yerel=1` })), true);
  // Dış site, aynı alan adında başka depo, boş referrer, geçmiş yok, aynı sayfa: hayır.
  assert.equal(geriGidilebilir(o({ referrer: 'https://www.google.com/' })), false);
  assert.equal(geriGidilebilir(o({ referrer: 'https://rose-omer.github.io/baska/' })), false);
  assert.equal(geriGidilebilir(o({ referrer: '' })), false);
  assert.equal(geriGidilebilir(o({ referrer: `${kok}sayfalar/daha/`, gecmis: 1 })), false);
  assert.equal(geriGidilebilir(o({ referrer: `${simdiki}?yerel=1` })), false);
  assert.equal(geriGidilebilir(o({ referrer: 'bozuk adres' })), false);
  assert.equal(geriGidilebilir({}), false);
});
