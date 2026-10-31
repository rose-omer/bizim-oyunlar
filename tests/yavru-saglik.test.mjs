// Yavrumuz: keyifsizlik (sayfalar/yavru/saglik.js). Saf mantık, DOM yok.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DK, SAAT, GUN, DUSUK, IHTIYACLAR, oku, ihtiyaclar } from '../sayfalar/yavru/mantik.js';
import {
  KEYIFSIZ_SURE, KEYIFSIZ_SAYI, BITKIN, ILAC_TABAN, KEYIFSIZ_PUAN, ILAC,
  dusukBaslangic, keyifsizMi, ilacKalan, ilacEylemi, puanArtisi,
} from '../sayfalar/yavru/saglik.js';
import { applyPatch } from '../js/core/veri.js';

const A = 'omer-test-id';
const B = 'gul-test-id';
const T0 = Date.UTC(2026, 9, 30, 9, 0, 0);
const iso = (ms) => new Date(ms).toISOString();
const sonra = (dk) => T0 + dk * DK;
const kayit = (v, ms = T0) => ({ v, t: iso(ms) });

/** Çatlamış yavru. ihtiyac: { ad: v } (T0'da) ya da { ad: { v, t } }. */
function kucuk(ihtiyac = {}, ek = {}) {
  const ih = {};
  for (const ad of IHTIYACLAR) {
    const x = ihtiyac[ad] ?? 100;
    ih[ad] = typeof x === 'number' ? kayit(x) : x;
  }
  return oku({
    asama: 'kucuk', ad: 'Pamuk', renk: 3, dogum: iso(T0 - 2 * GUN), catlama: iso(T0 - GUN),
    ihtiyac: ih, uyku: null, puan: {}, isitma: {}, son: {}, ...ek,
  });
}
const uygula = (y, yama) => oku(applyPatch(y, yama));

/** tokluk 49 → 6. saatte 25'in altı; temizlik 45 → 10. saatte. Diğerleri 34. saatte tazelenmiş. */
function ikiDusuk() {
  return kucuk({ tokluk: 49, temizlik: 45, mutluluk: kayit(100, sonra(34 * 60)), enerji: kayit(100, sonra(34 * 60)) });
}

test('sabitler ve ILAC tanımı', () => {
  assert.equal(KEYIFSIZ_SURE, 24 * SAAT);
  assert.equal(KEYIFSIZ_SAYI, 2);
  assert.equal(BITKIN, 5);
  assert.equal(ILAC_TABAN, 50);
  assert.equal(KEYIFSIZ_PUAN, 0.5);
  assert.deepEqual(ILAC, { ad: 'İlaç', emoji: '💊', bekleme: 60 * DK, fiil: ['ilaç verdi', 'ilaç verdin'], tok: null });
});

test('dusukBaslangic: eşiğin altına iniş anı (hesaplı değerden), üstündeyse null', () => {
  assert.equal(dusukBaslangic(kayit(49), 'tokluk', null, sonra(5 * 60)), null);
  assert.equal(dusukBaslangic(kayit(49), 'tokluk', null, sonra(7 * 60)), sonra(6 * 60));
  assert.equal(dusukBaslangic(kayit(20), 'mutluluk', null, sonra(60)), T0, 'kayıt zaten düşükse kayıt anı');
  assert.equal(dusukBaslangic(kayit(0), 'temizlik', null, sonra(60)), T0);
  assert.equal(dusukBaslangic({ v: 0, t: null }, 'tokluk', null, T0), null, 'zamanı bilinmeyen kayıt sayılmaz');
});

test('dusukBaslangic: uyku aralığı hesaba katılır', () => {
  // tokluk uykuda yarı hız: 49 −16 (8 sa uyku) = 33 → 2 sa sonra 25.
  const uyku = { bas: iso(T0), bit: iso(sonra(8 * 60)) };
  assert.equal(dusukBaslangic(kayit(49), 'tokluk', uyku, sonra(12 * 60)), sonra(10 * 60));
  // enerji uykuda dolar: 30 → 1 sa 40 dk'da 25 altı; uyku (2.–10. sa) 100'e çıkarır; uyanınca 25 saatte 25.
  const uyku2 = { bas: iso(sonra(2 * 60)), bit: iso(sonra(10 * 60)) };
  assert.equal(dusukBaslangic(kayit(30), 'enerji', uyku2, sonra(9 * 60)), null, 'uykuda düzeldi');
  assert.equal(dusukBaslangic(kayit(30), 'enerji', uyku2, sonra(36 * 60)), sonra(35 * 60));
  // Kısa uyku yetmezse: 0 → +12 → hep 25 altında, kayıt anından beri.
  const kisa = { bas: iso(sonra(2 * 60)), bit: iso(sonra(3 * 60)) };
  assert.equal(dusukBaslangic(kayit(0), 'enerji', kisa, sonra(5 * 60)), T0);
});

test('keyifsizMi: iki ihtiyaç 24 saatten uzun süredir düşük', () => {
  const y = ikiDusuk();
  assert.equal(keyifsizMi(y, sonra(34 * 60) - 1), false, '24 saati dolmadı');
  assert.equal(keyifsizMi(y, sonra(34 * 60)), true);
  // Tek ihtiyaç ne kadar uzun düşük kalsa da yetmez.
  const tek = kucuk({ tokluk: 0, temizlik: kayit(100, sonra(48 * 60)), mutluluk: kayit(100, sonra(48 * 60)), enerji: kayit(100, sonra(48 * 60)) });
  assert.equal(keyifsizMi(tek, sonra(48 * 60)), false);
  assert.equal(keyifsizMi(kucuk(), sonra(10 * 60)), false);
});

test('keyifsizMi: hepsi sıfıra yakınsa hemen', () => {
  assert.equal(keyifsizMi(kucuk({ tokluk: 5, mutluluk: 3, temizlik: 0, enerji: 4 }), T0), true);
  assert.equal(keyifsizMi(kucuk({ tokluk: 6, mutluluk: 3, temizlik: 0, enerji: 4 }), T0), false);
});

test('keyifsizMi: yumurta, boş belge ve bakım', () => {
  assert.equal(keyifsizMi(null, T0), false);
  assert.equal(keyifsizMi(oku({ asama: 'yumurta' }), T0), false);
  // Biri beslerse tokluğun düşüklük süresi sıfırlanır: tek ihtiyaç kalır, keyifsiz değil.
  const y = ikiDusuk();
  const beslendi = uygula(y, { 'ihtiyac.tokluk': kayit(55, sonra(33 * 60)) });
  assert.equal(keyifsizMi(beslendi, sonra(34 * 60)), false);
});

test('ilacEylemi: yalnız keyifsizken; yumurta ve uykuda hata', () => {
  assert.deepEqual(ilacEylemi(kucuk(), { kim: A, simdi: T0 }), { hata: 'iyi' });
  assert.deepEqual(ilacEylemi(oku({ asama: 'yumurta' }), { kim: A, simdi: T0 }), { hata: 'yumurta' });
  const uyuyan = kucuk({ tokluk: 0, mutluluk: 0, temizlik: 0, enerji: 0 }, { uyku: { bas: iso(T0), bit: iso(sonra(8 * 60)) } });
  assert.deepEqual(ilacEylemi(uyuyan, { kim: A, simdi: sonra(1) }), { hata: 'uyuyor' });
});

test('ilacEylemi: ihtiyaçlar tabana çıkar, puan, kayıt; iyileşme kalıcı', () => {
  const y = ikiDusuk();
  const simdi = sonra(34 * 60);
  const once = ihtiyaclar(y, simdi);
  const r = ilacEylemi(y, { kim: A, simdi });
  assert.equal(r.hata, undefined);
  assert.equal(r.puan, true);
  assert.equal(r.mesaj, null);
  assert.deepEqual(r.kayit, { eylem: 'ilac', kim: A, at: iso(simdi) });
  assert.deepEqual(r.yama['ihtiyac.tokluk'], { v: ILAC_TABAN, t: iso(simdi) });
  assert.deepEqual(r.yama['ihtiyac.temizlik'], { v: ILAC_TABAN, t: iso(simdi) });
  assert.deepEqual(r.yama['ihtiyac.mutluluk'], { v: once.mutluluk, t: iso(simdi) }, 'tabanın üstü korunur');
  assert.deepEqual(r.yama[`son.${A}`], { ilac: iso(simdi) });
  assert.equal(r.yama[`puan.${A}`], 1);
  assert.doesNotThrow(() => applyPatch({}, r.yama), 'anahtarlar en çok iki düzey');

  const y2 = uygula(y, r.yama);
  assert.equal(keyifsizMi(y2, simdi), false);
  // Bakım olmasa da en az 24 + 6 saat keyifsiz olmaz (taban 50, tokluk 4/sa).
  assert.equal(keyifsizMi(y2, simdi + 30 * SAAT), false);
  assert.deepEqual(ilacEylemi(y2, { kim: B, simdi: simdi + DK }), { hata: 'iyi' });
});

test('ilacEylemi: kişi başı bekleme, eski son kayıtları korunur', () => {
  const simdi = sonra(34 * 60);
  const y = ikiDusuk();
  const son = { [A]: { mama: iso(T0), ilac: iso(simdi - 20 * DK) } };
  const y2 = uygula(y, { son });
  assert.equal(ilacKalan(y2, A, simdi), 40 * DK);
  assert.deepEqual(ilacEylemi(y2, { kim: A, simdi }), { hata: 'bekle', kalan: 40 * DK });
  assert.equal(ilacKalan(y2, B, simdi), 0);
  const r = ilacEylemi(y2, { kim: B, simdi });
  assert.equal(r.hata, undefined, 'bekleme kişi başına');
  const r2 = ilacEylemi(y2, { kim: A, simdi: simdi + 40 * DK });
  assert.deepEqual(r2.yama[`son.${A}`], { mama: iso(T0), ilac: iso(simdi + 40 * DK) });
});

test('puanArtisi: keyifsizken yarım puan', () => {
  assert.equal(puanArtisi(kucuk(), T0), 1);
  assert.equal(puanArtisi(ikiDusuk(), sonra(34 * 60)), KEYIFSIZ_PUAN);
  assert.ok(DUSUK === 25, 'eşik mantik.js DUSUK');
});
