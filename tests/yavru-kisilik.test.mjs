// Yavrumuz: kişilik (sayfalar/yavru/kisilik.js). Saf mantık, DOM yok.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  KISILIKLER, KISILIK_ADLARI, FAVORI_BONUS, TR_SAAT_FARK,
  kisilikPuanlari, kisilikSec, kisilikCarpan, favoriBonus, kisilikOku,
} from '../sayfalar/yavru/kisilik.js';
import { SAAT, ISITMA_ARALIK, IHTIYACLAR, EYLEMLER, oku, isitmaSayisi } from '../sayfalar/yavru/mantik.js';

const A = 'omer-test-id';
const B = 'gul-test-id';
const ODA = 'testpaka23';
const iso = (ms) => new Date(ms).toISOString();
/** Türkiye saatiyle 30 Ekim 2026, sa:dk. */
const tr = (sa, dk = 0) => Date.UTC(2026, 9, 30, sa, dk) - TR_SAAT_FARK;
/** Isıtma listeleriyle yumurta belgesi (oku ile güvenli biçimde). */
const yumurta = (isitma) => oku({ asama: 'yumurta', ad: '', renk: 1, dogum: iso(tr(0) - 24 * SAAT), isitma });

test('dört kişilik: ad, emoji, açıklama, favori yiyecek, çarpan', () => {
  assert.deepEqual(KISILIK_ADLARI, ['obur', 'uykucu', 'neseli', 'titiz']);
  const yiyecekler = ['mama', 'meyve', 'tatli'];
  for (const ad of KISILIK_ADLARI) {
    const k = KISILIKLER[ad];
    assert.ok(k.ad && k.emoji && k.aciklama, ad);
    assert.ok(k.aciklama.length <= 60, `${ad}: açıklama kısa`);
    assert.ok(yiyecekler.includes(k.favori), `${ad}: favori bir yiyecek`);
    assert.ok(EYLEMLER[k.favori], `${ad}: favori bir eylem`);
    for (const [ihtiyac, c] of Object.entries(k.carpan)) {
      assert.ok(IHTIYACLAR.includes(ihtiyac), `${ad}.${ihtiyac}`);
      assert.ok(c >= 0.8 && c <= 1.25, `${ad}.${ihtiyac} = ${c}`);
    }
  }
  assert.ok(Object.isFrozen(KISILIKLER) && Object.isFrozen(KISILIKLER.obur.carpan), 'değiştirilemez');
});

test('kisilikPuanlari: saat dilimi başına bir puan (Türkiye saati)', () => {
  const y = yumurta({
    [A]: [iso(tr(23)), iso(tr(3))], // gece → uykucu
    [B]: [iso(tr(8)), iso(tr(14)), iso(tr(19)), iso(tr(21, 59))], // sabah, öğle, akşam, akşam
  });
  assert.deepEqual(kisilikPuanlari(y), { obur: 2, uykucu: 2, neseli: 1, titiz: 1 });
  // Sınırlar: 06:00 sabah, 12:00 öğle, 18:00 akşam, 22:00 gece.
  const s = yumurta({ [A]: [iso(tr(6)), iso(tr(12, 30)), iso(tr(18, 40)), iso(tr(22, 50))] });
  assert.deepEqual(kisilikPuanlari(s), { obur: 1, uykucu: 1, neseli: 1, titiz: 1 });
});

test('kisilikPuanlari: 10 dakikadan sık ısıtmalar tek sayılır, bozuk değerler atlanır', () => {
  const y = yumurta({ [A]: [iso(tr(23)), iso(tr(23, 5)), iso(tr(23, 10)), 'x', 5] });
  assert.deepEqual(kisilikPuanlari(y), { obur: 0, uykucu: 2, neseli: 0, titiz: 0 });
  assert.equal(isitmaSayisi(y.isitma[A]), 2, 'mantik.js sayımıyla aynı');
  assert.equal(ISITMA_ARALIK, 10 * 60_000, 'kisilik.js yerel sabitiyle aynı');
  assert.deepEqual(kisilikPuanlari(null), { obur: 0, uykucu: 0, neseli: 0, titiz: 0 });
  assert.deepEqual(kisilikPuanlari({ isitma: { [A]: 'x' } }), { obur: 0, uykucu: 0, neseli: 0, titiz: 0 });
});

test('kisilikSec: en çok puan alan kişilik kazanır', () => {
  const gece = yumurta({ [A]: [iso(tr(1)), iso(tr(2)), iso(tr(23))], [B]: [iso(tr(9))] });
  assert.equal(kisilikSec(gece, ODA), 'uykucu');
  const sabah = yumurta({ [A]: [iso(tr(7)), iso(tr(8))], [B]: [iso(tr(10)), iso(tr(20))] });
  assert.equal(kisilikSec(sabah, ODA), 'titiz');
  const ogle = yumurta({ [A]: [iso(tr(13)), iso(tr(15))], [B]: [iso(tr(17))] });
  assert.equal(kisilikSec(ogle, ODA), 'neseli');
  const aksam = yumurta({ [A]: [iso(tr(19)), iso(tr(20))], [B]: [iso(tr(21))] });
  assert.equal(kisilikSec(aksam, ODA), 'obur');
});

test('kisilikSec: deterministik; anahtar ve liste sırası sonucu değiştirmez (iki cihaz)', () => {
  const l1 = [iso(tr(23)), iso(tr(8))];
  const l2 = [iso(tr(14)), iso(tr(19))];
  const c1 = yumurta({ [A]: l1, [B]: l2 });
  const c2 = yumurta({ [B]: [...l2].reverse(), [A]: [...l1].reverse() });
  assert.equal(kisilikSec(c1, ODA), kisilikSec(c2, ODA));
  assert.equal(kisilikSec(c1, ODA), kisilikSec(JSON.parse(JSON.stringify(c1)), ODA));
});

test('kisilikSec: eşitlikte oda kimliğinden tohum; yalnız eşit olanlar arasından', () => {
  // gece ve öğle 1'er puan: sonuç bu ikisinden biri, oda kimliğiyle kararlı.
  const y = yumurta({ [A]: [iso(tr(2))], [B]: [iso(tr(15))] });
  const gorulen = new Set();
  for (let i = 0; i < 60; i++) {
    const k = kisilikSec(y, `oda${i}xyzab`);
    assert.ok(k === 'uykucu' || k === 'neseli', `${i} -> ${k}`);
    assert.equal(kisilikSec(y, `oda${i}xyzab`), k, 'aynı oda aynı sonuç');
    gorulen.add(k);
  }
  assert.equal(gorulen.size, 2, 'oda değişince iki seçenek de çıkar');
});

test('kisilikSec: hiç ısıtma yoksa dördü de eşit; oda kimliği seçer', () => {
  const gorulen = new Set();
  for (let i = 0; i < 200; i++) {
    const k = kisilikSec(yumurta({}), `oda${i}xyzab`);
    assert.ok(KISILIK_ADLARI.includes(k));
    gorulen.add(k);
  }
  assert.equal(gorulen.size, 4, 'dört kişiliğin hepsi çıkar');
  assert.ok(KISILIK_ADLARI.includes(kisilikSec(null, null)), 'boş girdi de bir kişilik verir');
  assert.equal(kisilikSec(undefined, ''), kisilikSec({}, ''));
});

test('kisilikCarpan: küçük etki; bilinmeyen kişilik ya da ihtiyaç 1', () => {
  assert.equal(kisilikCarpan('obur', 'tokluk'), 1.25, 'obur tokluk daha hızlı düşer');
  assert.ok(kisilikCarpan('uykucu', 'enerji') > 1, 'uykucu enerji hızlı biter');
  assert.ok(kisilikCarpan('neseli', 'mutluluk') < 1, 'neşeli keyfi uzun sürer');
  assert.ok(kisilikCarpan('titiz', 'temizlik') > 1, 'titiz çabuk kirlendiğini düşünür');
  assert.equal(kisilikCarpan('obur', 'temizlik'), 1, 'tanımsız ihtiyaç etkilenmez');
  assert.equal(kisilikCarpan(null, 'tokluk'), 1, 'kişiliksiz eski belge');
  assert.equal(kisilikCarpan('uzayli', 'tokluk'), 1);
  assert.equal(kisilikCarpan('obur', 'yok'), 1);
  assert.equal(kisilikCarpan('__proto__', 'tokluk'), 1);
  for (const k of KISILIK_ADLARI) {
    for (const ad of IHTIYACLAR) {
      const c = kisilikCarpan(k, ad);
      assert.ok(c >= 0.8 && c <= 1.25, `${k}.${ad} = ${c}`);
    }
  }
});

test('favoriBonus: favori yiyecekte ek mutluluk, başka eylemde 0', () => {
  assert.equal(FAVORI_BONUS, 5);
  for (const k of KISILIK_ADLARI) {
    const fav = KISILIKLER[k].favori;
    assert.equal(favoriBonus(k, fav), FAVORI_BONUS, `${k} → ${fav}`);
    for (const e of Object.keys(EYLEMLER)) if (e !== fav) assert.equal(favoriBonus(k, e), 0, `${k} → ${e}`);
  }
  assert.equal(favoriBonus(null, 'mama'), 0);
  assert.equal(favoriBonus('obur', undefined), 0);
  assert.equal(favoriBonus('constructor', 'mama'), 0);
});

test('kisilikOku: geçerli ad döner, bozuk ya da eksik değer null', () => {
  for (const k of KISILIK_ADLARI) assert.equal(kisilikOku(k), k);
  for (const bozuk of [undefined, null, '', 'OBUR', ' obur', 'uzayli', 3, {}, [], 'toString', '__proto__']) {
    assert.equal(kisilikOku(bozuk), null, String(bozuk));
  }
});
