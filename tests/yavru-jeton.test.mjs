// Yavrumuz: jeton ekonomisi (sayfalar/yavru/jeton.js). Saf mantık, DOM yok.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DK, GUN, IHTIYACLAR, oku } from '../sayfalar/yavru/mantik.js';
import {
  GUNLUK_SINIR, KAYNAKLAR, URUNLER, jetonKaydi, jetonBakiye, gunlukKalan, jetonKazan, dolaptaMi, satinAl,
} from '../sayfalar/yavru/jeton.js';
import { ESIK } from '../sayfalar/yavru/tuvalet.js';
import { applyPatch } from '../js/core/veri.js';

const A = 'omer-test-id';
const B = 'gul-test-id';
// Yerel öğle: gün sınırı testi saat diliminden bağımsız olsun.
const T0 = new Date(2026, 9, 30, 12, 0).getTime();
const iso = (ms) => new Date(ms).toISOString();

function veri(ek = {}) {
  const ihtiyac = {};
  for (const ad of IHTIYACLAR) ihtiyac[ad] = { v: 50, t: iso(T0) };
  return {
    asama: 'kucuk', ad: 'Pamuk', renk: 3, dogum: iso(T0 - 2 * GUN), catlama: iso(T0 - GUN),
    ihtiyac, uyku: null, puan: {}, isitma: {}, son: {}, ...ek,
  };
}
const yv = (d) => ({ ...oku(d), jeton: d.jeton, dolap: d.dolap, tuvalet: d.tuvalet });
const kazan = (d, kim, miktar, simdi = T0) => applyPatch(d, jetonKazan(yv(d), { kim, kaynak: 'oyun', miktar, simdi }).yama);

test('katalog: 10–150 fiyat, tür, yiyecekte etki ve tuvalet artışı', () => {
  assert.equal(GUNLUK_SINIR, 200);
  assert.ok(KAYNAKLAR.includes('oyun') && KAYNAKLAR.includes('gorev'));
  const ids = Object.keys(URUNLER);
  assert.ok(ids.some((id) => URUNLER[id].tur === 'yiyecek') && ids.some((id) => URUNLER[id].tur === 'kiyafet'));
  for (const id of ids) {
    const u = URUNLER[id];
    assert.match(id, /^[a-z]+$/);
    assert.ok(Number.isInteger(u.fiyat) && u.fiyat >= 10 && u.fiyat <= 150, id);
    assert.ok(u.ad && u.emoji, id);
    if (u.tur === 'yiyecek') {
      assert.ok(Object.keys(u.etki).every((ad) => IHTIYACLAR.includes(ad)), id);
      assert.ok(Number.isFinite(u.tuvalet) && u.tuvalet >= 0, id);
    } else assert.equal(u.tur, 'kiyafet', id);
  }
});

test('eski belge: bakiye 0, sayaç boş', () => {
  const y = yv(veri());
  assert.equal(jetonBakiye(y), 0);
  assert.deepEqual(jetonKaydi(y, A), { kazanc: 0, harcama: 0, gun: null, bugun: 0 });
  assert.equal(gunlukKalan(y, A, T0), GUNLUK_SINIR);
  assert.equal(jetonBakiye(null), 0);
  assert.equal(jetonBakiye({ jeton: { [A]: { kazanc: 'x', harcama: -5 } }, dolap: { tac: 'bozuk' } }), 0);
});

test('kazanç: kişi başı sayaç, ortak bakiye', () => {
  const r = jetonKazan(yv(veri()), { kim: A, kaynak: 'oyun', miktar: 30, simdi: T0 });
  assert.equal(r.eklenen, 30);
  assert.deepEqual(Object.keys(r.yama), [`jeton.${A}`]);
  let d = applyPatch(veri(), r.yama);
  d = kazan(d, B, 20);
  assert.equal(jetonBakiye(yv(d)), 50);
  assert.deepEqual(jetonKaydi(yv(d), A), { kazanc: 30, harcama: 0, gun: '2026-10-30', bugun: 30 });
});

test('kazanç geçersiz girdi', () => {
  const y = yv(veri());
  for (const g of [
    { kim: A, kaynak: 'hile', miktar: 5 }, { kim: '', kaynak: 'oyun', miktar: 5 },
    { kim: A, kaynak: 'oyun', miktar: 0 }, { kim: A, kaynak: 'oyun', miktar: 2.5 }, { kim: A, kaynak: 'oyun', miktar: -3 },
  ]) assert.deepEqual(jetonKazan(y, { ...g, simdi: T0 }), { hata: 'gecersiz' }, JSON.stringify(g));
});

test('günlük üst sınır kişi başı; ertesi gün sıfırlanır', () => {
  let d = kazan(veri(), A, 150);
  const r = jetonKazan(yv(d), { kim: A, kaynak: 'gorev', miktar: 80, simdi: T0 + DK });
  assert.equal(r.eklenen, 50, 'aşan kısım kesilir');
  d = applyPatch(d, r.yama);
  assert.equal(gunlukKalan(yv(d), A, T0), 0);
  assert.deepEqual(jetonKazan(yv(d), { kim: A, kaynak: 'oyun', miktar: 1, simdi: T0 }), { hata: 'sinir' });
  assert.equal(gunlukKalan(yv(d), B, T0), GUNLUK_SINIR, 'partnerin sınırı ayrı');
  const yarin = T0 + GUN;
  assert.equal(gunlukKalan(yv(d), A, yarin), GUNLUK_SINIR);
  d = kazan(d, A, 10, yarin);
  assert.deepEqual(jetonKaydi(yv(d), A), { kazanc: 210, harcama: 0, gun: '2026-10-31', bugun: 10 });
});

test('iki cihaz yarışı: iki kişinin eşzamanlı kazancı kaybolmaz', () => {
  const taban = kazan(veri(), A, 10);
  const ra = jetonKazan(yv(taban), { kim: A, kaynak: 'oyun', miktar: 5, simdi: T0 });
  const rb = jetonKazan(yv(taban), { kim: B, kaynak: 'oyun', miktar: 7, simdi: T0 });
  const ab = applyPatch(applyPatch(taban, ra.yama), rb.yama);
  const ba = applyPatch(applyPatch(taban, rb.yama), ra.yama);
  assert.deepEqual(ab, ba, 'sıra bağımsız');
  assert.equal(jetonBakiye(yv(ab)), 22);
});

test('satın alma: bilinmiyor, yetersiz', () => {
  const d = kazan(veri(), A, 30);
  assert.deepEqual(satinAl(yv(d), { kim: A, urun: 'roket', simdi: T0 }), { hata: 'bilinmiyor' });
  assert.deepEqual(satinAl(yv(d), { kim: A, urun: 'toString', simdi: T0 }), { hata: 'bilinmiyor' });
  assert.deepEqual(satinAl(yv(d), { kim: A, urun: 'pijama', simdi: T0 }), { hata: 'yetersiz', eksik: 40 });
});

test('kıyafet: dolaba kalıcı girer, bedeli bir kez sayılır, ikinci kez "zaten"', () => {
  let d = kazan(kazan(veri(), A, 50), B, 30);
  const r = satinAl(yv(d), { kim: B, urun: 'sapka', simdi: T0 });
  assert.deepEqual(r.yama, { 'dolap.sapka': { at: iso(T0), kim: B, fiyat: 60 } });
  assert.deepEqual(r.kayit, { eylem: 'satinal', kim: B, at: iso(T0), deger: 'sapka' });
  d = applyPatch(d, r.yama);
  assert.equal(jetonBakiye(yv(d)), 20);
  assert.equal(dolaptaMi(yv(d), 'sapka'), true);
  assert.deepEqual(satinAl(yv(d), { kim: A, urun: 'sapka', simdi: T0 }), { hata: 'zaten' });
});

test('kıyafet yarışı: ikisi aynı anda alırsa tek kayıt, bir kez ödenir', () => {
  const taban = kazan(veri(), A, 100);
  const ra = satinAl(yv(taban), { kim: A, urun: 'fiyonk', simdi: T0 });
  const rb = satinAl(yv(taban), { kim: B, urun: 'fiyonk', simdi: T0 + 1000 });
  const son = applyPatch(applyPatch(taban, ra.yama), rb.yama);
  assert.equal(jetonBakiye(yv(son)), 60);
});

test('yiyecek: tüketilir (etki + tuvalet), harcama alıcının sayacına, puan yok', () => {
  let d = kazan(veri({ tuvalet: { v: 60, t: iso(T0) } }), A, 40);
  d = kazan(d, B, 10);
  const r = satinAl(yv(d), { kim: B, urun: 'pizza', simdi: T0 });
  assert.deepEqual(r.yama[`jeton.${B}`], { kazanc: 10, harcama: 30, gun: '2026-10-30', bugun: 10 });
  assert.deepEqual(r.yama['ihtiyac.tokluk'], { v: 85, t: iso(T0) });
  assert.deepEqual(r.yama['ihtiyac.mutluluk'], { v: 60, t: iso(T0) });
  assert.deepEqual(r.yama.tuvalet, { v: 80, t: iso(T0) });
  assert.ok(!Object.keys(r.yama).some((k) => k.startsWith('puan.') || k.startsWith('son.')));
  for (const k of Object.keys(r.yama)) assert.ok(k.split('.').length <= 2, k);
  d = applyPatch(d, r.yama);
  assert.equal(jetonBakiye(yv(d)), 20);
  assert.ok(d.tuvalet.v >= ESIK);
  // yiyecek tekrar alınabilir
  assert.ok(satinAl(yv(d), { kim: A, urun: 'cilek', simdi: T0 }).yama);
});

test('yiyecek yumurtada ve uykuda verilmez; kıyafet yumurtada da alınır', () => {
  const yum = { asama: 'yumurta', dogum: iso(T0), jeton: { [A]: { kazanc: 100, harcama: 0 } } };
  assert.deepEqual(satinAl(yum, { kim: A, urun: 'cilek', simdi: T0 }), { hata: 'yumurta' });
  assert.ok(satinAl(yum, { kim: A, urun: 'fiyonk', simdi: T0 }).yama);
  const uyku = { bas: iso(T0), bit: iso(T0 + 8 * 60 * DK) };
  const d = kazan(veri({ uyku }), A, 50);
  assert.deepEqual(satinAl(yv(d), { kim: A, urun: 'cilek', simdi: T0 + DK }), { hata: 'uyuyor' });
});

test('eşzamanlı harcama: bakiye eksiye inebilir, jeton çoğalmaz; eksikken alım engelli', () => {
  const taban = kazan(kazan(veri(), A, 30), B, 10);
  const ra = satinAl(yv(taban), { kim: A, urun: 'pasta', simdi: T0 });
  const rb = satinAl(yv(taban), { kim: B, urun: 'fiyonk', simdi: T0 });
  const son = applyPatch(applyPatch(taban, ra.yama), rb.yama);
  assert.equal(jetonBakiye(yv(son)), -40);
  assert.equal(satinAl(yv(son), { kim: A, urun: 'cilek', simdi: T0 }).hata, 'yetersiz');
  const sonra = kazan(son, A, 50, T0 + DK);
  assert.equal(jetonBakiye(yv(sonra)), 10);
});
