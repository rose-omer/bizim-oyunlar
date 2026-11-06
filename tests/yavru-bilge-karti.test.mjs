// Yavrumuz kartı (sayfalar/yavru/bilge-karti.js): büyüme adımları, sıradaki evre, CSS sözleşmesi. Saf; DOM yok.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buyumeAdimlari, siradakiMetin, siradakiSatir, CSS } from '../sayfalar/yavru/bilge-karti.js';
import { evreYamasi } from '../sayfalar/yavru/evre.js';

const L = (y, m, d, sa = 12) => new Date(y, m - 1, d, sa).getTime();
const iso = (ms) => new Date(ms).toISOString();
const CATLAMA = L(2026, 3, 15, 9);
const buyuk = (ek = {}) => ({ asama: 'buyuk', catlama: iso(CATLAMA), ...ek });
const yazili = (...idler) => Object.fromEntries(idler.map((id) => [id, { at: iso(CATLAMA) }]));
const durumlar = (y) => buyumeAdimlari(y).map((a) => a.durum);

test('büyüme adımları: yedi adım, sabit sıra ve ad', () => {
  const a = buyumeAdimlari(buyuk());
  assert.deepEqual(a.map((x) => x.ad), ['Yumurta', 'Küçük', 'Büyük', '1 ay', '3 ay', '6 ay', '1 yaş']);
  assert.deepEqual(a.map((x) => x.id), ['yumurta', 'kucuk', 'buyuk', 'ay1', 'ay3', 'ay6', 'yas1']);
});

test('büyüme adımları: durum aşamadan gelir', () => {
  assert.deepEqual(durumlar({ asama: 'yumurta' }), ['simdi', 'sonra', 'sonra', 'sonra', 'sonra', 'sonra', 'sonra']);
  assert.deepEqual(durumlar({ asama: 'kucuk' }), ['gecti', 'simdi', 'sonra', 'sonra', 'sonra', 'sonra', 'sonra']);
  assert.deepEqual(durumlar(buyuk()), ['gecti', 'gecti', 'simdi', 'sonra', 'sonra', 'sonra', 'sonra']);
});

test('büyüme adımları: yazılmış evre aşamayı geçer', () => {
  assert.deepEqual(durumlar(buyuk({ evre: yazili('ay1') })), ['gecti', 'gecti', 'gecti', 'simdi', 'sonra', 'sonra', 'sonra']);
  assert.deepEqual(durumlar(buyuk({ evre: yazili('ay1', 'ay3') })), ['gecti', 'gecti', 'gecti', 'gecti', 'simdi', 'sonra', 'sonra']);
  assert.deepEqual(durumlar(buyuk({ evre: yazili('ay1', 'ay3', 'ay6', 'yas1') })), ['gecti', 'gecti', 'gecti', 'gecti', 'gecti', 'gecti', 'simdi']);
});

test('büyüme adımları: boş ya da bozuk girdi yumurta sayılır', () => {
  for (const y of [null, undefined, {}, { asama: 'yok' }]) {
    assert.deepEqual(durumlar(y), ['simdi', 'sonra', 'sonra', 'sonra', 'sonra', 'sonra', 'sonra']);
  }
});

test('sıradaki: yalnız büyük aşamada', () => {
  assert.equal(siradakiMetin(null, CATLAMA), null);
  assert.equal(siradakiMetin({ asama: 'yumurta' }, CATLAMA), null);
  assert.equal(siradakiMetin({ asama: 'kucuk', catlama: iso(CATLAMA) }, CATLAMA), null);
  assert.equal(siradakiMetin({ asama: 'buyuk' }, CATLAMA), null, 'çatlama zamanı yoksa null');
});

test('sıradaki: ilk evre ve kalan gün', () => {
  assert.deepEqual(siradakiMetin(buyuk(), L(2026, 3, 22)), { unvan: 'Meraklı minik', kalanGun: 24 });
});

test('sıradaki: yazılmış evreden sonrakine geçer', () => {
  const y = buyuk({ evre: yazili('ay1') });
  assert.deepEqual(siradakiMetin(y, L(2026, 4, 24)), { unvan: 'Küçük kâşif', kalanGun: 52 });
});

test('sıradaki: günü geçmiş ama yazılmamış evre atlanır, 0 gün göstermez', () => {
  assert.deepEqual(siradakiMetin(buyuk(), L(2026, 5, 20)), { unvan: 'Küçük kâşif', kalanGun: 26 });
  assert.deepEqual(siradakiMetin(buyuk(), L(2026, 4, 15)), { unvan: 'Küçük kâşif', kalanGun: 61 }, 'ay dönümü günü');
});

test('sıradaki: bitince null', () => {
  assert.equal(siradakiMetin(buyuk({ evre: yazili('ay1', 'ay3', 'ay6', 'yas1') }), L(2026, 5, 1)), null);
  assert.equal(siradakiMetin(buyuk(), L(2027, 3, 15)), null, '1 yaş günü geldi');
  assert.equal(siradakiMetin(buyuk(), L(2029, 1, 1)), null);
  assert.ok(siradakiMetin(buyuk({ evre: yazili('ay1', 'ay3', 'ay6') }), L(2027, 3, 14)), '1 yaştan bir gün önce');
});

test('sıradaki: ay sonu kırpılır', () => {
  const y = { asama: 'buyuk', catlama: iso(L(2027, 1, 31, 9)) };
  assert.deepEqual(siradakiMetin(y, L(2027, 2, 1)), { unvan: 'Meraklı minik', kalanGun: 27 });
});

test('sıradaki: kalan gün evre.js evreYamasi ile aynı günü bulur', () => {
  for (const bas of [[2026, 3, 15], [2027, 1, 31], [2028, 2, 29], [2026, 8, 31]]) {
    const gun = (k) => new Date(bas[0], bas[1] - 1, bas[2] + k, 12).getTime();
    const y = { asama: 'buyuk', catlama: iso(new Date(bas[0], bas[1] - 1, bas[2], 9).getTime()) };
    for (let k = 0; k < 370; k += 1) {
      const s = siradakiMetin(y, gun(k));
      if (!s) continue;
      assert.ok(s.kalanGun >= 1, `gün ${k}`);
      assert.equal(evreYamasi(y, { kim: 'a', simdi: gun(k + s.kalanGun) })?.evre.unvan, s.unvan, `gün ${k}`);
      assert.notEqual(evreYamasi(y, { kim: 'a', simdi: gun(k + s.kalanGun - 1) })?.evre.unvan, s.unvan, `gün ${k}`);
    }
  }
});

test('sıradaki satırı: yaş biçimi ve kalan metni', () => {
  assert.deepEqual(siradakiSatir(buyuk(), L(2026, 3, 22)), { ne: '1 aylıkken Meraklı minik', kalan: '24 gün kaldı' });
  assert.deepEqual(siradakiSatir(buyuk(), L(2026, 4, 14)), { ne: '1 aylıkken Meraklı minik', kalan: 'Yarın' });
  assert.equal(siradakiSatir(buyuk({ evre: yazili('ay1', 'ay3', 'ay6') }), L(2026, 10, 1)).ne, '1 yaşındayken Evimizin neşesi');
  assert.equal(siradakiSatir({ asama: 'kucuk' }, CATLAMA), null);
});

const ISTENEN = ['yv-bilgi', 'yv-ad-satir', 'yv-ad', 'yv-ad-btn', 'yv-adform', 'yv-adform-baslik', 'yv-adform-dugmeler', 'yv-ad-oneri',
  'yv-buyume', 'yv-ihtiyaclar', 'yv-ihtiyac', 'yv-ihtiyac-bas', 'yv-ihtiyac-ikon', 'yv-ihtiyac-ad', 'yv-ihtiyac-deger', 'yv-cubuk', 'yv-cubuk-dolu',
  'yv-tuvalet', 'yv-son', 'yv-bakimlar', 'yv-bakim', 'yv-bakim-metin', 'yv-bakim-zaman', 'yv-bos', 'yv-yukleniyor'];
const siniflar = () => new Set([...CSS.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]));

test('CSS: istenen sınıflar var; başka sınıf yalnız yvk- önekli', () => {
  const s = siniflar();
  for (const ad of ISTENEN) assert.ok(s.has(ad), ad);
  // btn, primary, yv-ikon: dış sınıf; yalnız bağlam seçicisinde geçer, tanımlanmaz.
  const izinli = new Set([...ISTENEN, 'btn', 'primary', 'yv-ikon']);
  for (const ad of s) assert.ok(ad.startsWith('yvk-') || izinli.has(ad), ad);
});

test('CSS: gizli durumlar korunur', () => {
  for (const ad of ['yv-ad-satir', 'yv-ad-btn', 'yv-adform', 'yv-ad-oneri', 'yv-ihtiyaclar', 'yv-bakimlar', 'yv-bos', 'yv-buyume']) {
    assert.ok(CSS.includes(`.${ad}[hidden]`), ad);
  }
  assert.ok(CSS.includes('.yv-adform-dugmeler .btn[hidden]'));
});

test('CSS: sabit renk yok, emoji yok, yazı 0.75rem altına inmez', () => {
  assert.doesNotMatch(CSS, /#[0-9a-fA-F]{3,8}\b/);
  assert.doesNotMatch(CSS, /\brgba?\(|\bhsla?\(/);
  assert.doesNotMatch(CSS, /\p{Extended_Pictographic}/u);
  const boylar = [...CSS.matchAll(/font-size:\s*([^;}]+)/g)].map((m) => m[1].trim());
  assert.ok(boylar.length > 0);
  for (const b of boylar) {
    const m = /^([\d.]+)rem$/.exec(b);
    assert.ok(m, b);
    assert.ok(Number(m[1]) >= 0.75, b);
  }
});

test('CSS: hareket yalnız prefers-reduced-motion: no-preference içinde', () => {
  const i = CSS.indexOf('@media (prefers-reduced-motion: no-preference)');
  assert.ok(i > 0);
  assert.doesNotMatch(CSS.slice(0, i), /transition|animation/);
});

test('CSS: düşük ihtiyaç vurgu rengiyle, ihtiyaçlar çerçevesiz', () => {
  assert.match(CSS, /\.yv-ihtiyac\[data-dusuk\] \.yv-cubuk-dolu\s*\{[^}]*var\(--accent\)/);
  assert.doesNotMatch(/\.yv-ihtiyaclar\s*\{[^}]*\}/.exec(CSS)[0], /border|background/);
  assert.doesNotMatch(CSS, /--yvo-duvar|--yv-sicak/);
});
