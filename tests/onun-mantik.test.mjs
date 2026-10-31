import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALANLAR, GRUPLAR, KISA_MAX, UZUN_MAX, alanById, deger, doluSayisi, temizle, alanYamasi, soruYamasi,
  soruMetni, cevapMetni, sorabilirMi, merakEdiyorMu, SORU_ARALIK_MS,
} from '../sayfalar/onun/mantik.js';
import { SAYFALAR } from '../js/core/games.js';
import { YEDEK_TURLERI } from '../sayfalar/ayarlar/mantik.js';

const SIMDI = Date.parse('2026-10-31T12:00:00.000Z');

test('kayıtlar: SAYFALAR "onun" ve yedekte "bilgi"', () => {
  const s = SAYFALAR.find((x) => x.id === 'onun');
  assert.equal(s.path, 'sayfalar/onun/');
  assert.equal(s.title, 'Onun Hakkında');
  assert.equal(s.icon, '💝');
  assert.ok(YEDEK_TURLERI.includes('bilgi'));
});

test('alanlar: 14 alan, kimlikler tekil ve veri anahtarına uygun, her alan bir grupta', () => {
  assert.equal(ALANLAR.length, 14);
  assert.equal(new Set(ALANLAR.map((a) => a.id)).size, 14);
  const gruplar = new Set(GRUPLAR.map((g) => g.id));
  for (const a of ALANLAR) {
    assert.match(a.id, /^[a-z]+$/, a.id);
    assert.ok(a.ad && a.emoji && a.ipucu, a.id);
    assert.ok(gruplar.has(a.grup), a.id);
    if (a.sorulur) assert.ok(a.merak && a.yazdi, a.id);
  }
  assert.equal(alanById('not').sorulur, false); // serbest not sorulmaz
  assert.equal(alanById('ayakkabi').sorulur, true);
  assert.equal(alanById('sorular'), null);
});

test('deger ve doluSayisi: yalnız bilinen ve dolu alanlar sayılır', () => {
  const data = { ayakkabi: '39', renk: '  ', yemek: 'Mantı', sorular: { ust: 'x' }, bilinmeyen: 'a' };
  assert.equal(deger(data, 'ayakkabi'), '39');
  assert.equal(deger(data, 'renk'), '');
  assert.equal(deger(null, 'renk'), '');
  assert.equal(doluSayisi(data), 2);
  assert.equal(doluSayisi(undefined), 0);
});

test('temizle ve alanYamasi: kırpar, sınırlar, boş alanı siler', () => {
  assert.equal(temizle('ayakkabi', '  39 '), '39');
  assert.equal(temizle('ayakkabi', '   '), null);
  assert.equal([...temizle('ayakkabi', 'x'.repeat(KISA_MAX + 9))].length, KISA_MAX);
  assert.equal([...temizle('not', 'y'.repeat(UZUN_MAX + 9))].length, UZUN_MAX);
  assert.equal(temizle('alerji', 'Fıstık\n\n\n\nPolen'), 'Fıstık\n\nPolen');
  assert.deepEqual(alanYamasi('yemek', ' Mantı '), { yemek: 'Mantı' });
  assert.deepEqual(alanYamasi('yemek', ''), { yemek: null });
  assert.throws(() => alanYamasi('sorular', 'x'));
});

test('soruYamasi: kendi belgeme alan düzeyinde "sorular.<alan>"', () => {
  assert.deepEqual(soruYamasi('ayakkabi', SIMDI), { 'sorular.ayakkabi': new Date(SIMDI).toISOString() });
  assert.throws(() => soruYamasi('not', SIMDI)); // sorulmayan alan
});

test('soruMetni ve cevapMetni', () => {
  assert.equal(soruMetni('Ömer', 'ayakkabi'), 'Ömer ayakkabı numaranı merak ediyor 👟');
  assert.equal(soruMetni('', 'ayakkabi'), 'Sevgilin ayakkabı numaranı merak ediyor 👟');
  assert.equal(cevapMetni('Gül', 'ayakkabi'), 'Gül ayakkabı numarasını yazdı 👟');
});

test('sorabilirMi: hiç sorulmadıysa ya da 1 günden eskiyse', () => {
  assert.equal(sorabilirMi(null, SIMDI), true);
  assert.equal(sorabilirMi(new Date(SIMDI - 60_000).toISOString(), SIMDI), false);
  assert.equal(sorabilirMi(new Date(SIMDI - SORU_ARALIK_MS - 1).toISOString(), SIMDI), true);
  assert.equal(sorabilirMi('bozuk', SIMDI), true);
});

test('merakEdiyorMu: partner sordu ve benim alanım boş', () => {
  const partner = { sorular: { ayakkabi: '2026-10-30T10:00:00.000Z', renk: '2026-10-30T10:00:00.000Z' } };
  const ben = { renk: 'Mor' };
  assert.equal(merakEdiyorMu(partner, ben, 'ayakkabi'), true);
  assert.equal(merakEdiyorMu(partner, ben, 'renk'), false); // yazdım
  assert.equal(merakEdiyorMu(partner, ben, 'yemek'), false);
  assert.equal(merakEdiyorMu(null, ben, 'ayakkabi'), false);
});
