// Yavrumuz: odalar ve sürükle-bırak bakımın saf parçaları (sayfalar/yavru/odalar.js), oda çizimleri. DOM yok.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ODALAR, ODA_IDLERI, VARSAYILAN_ODA, odaOku, odaTanimi, eylemOdasi, komsuOda, kaydirmaYonu, KAYDIRMA_ESIK,
  odaNoktalari, surukleBasladi, SURUKLE_ESIK, vbNokta, AGIZ, agizUzaklik, agizIsabet, agizYakin, kutuIsabet,
  kopukBaslat, kopukIlerle, kopukOrani, kopukTamam, KOPUK_YOL, KABARCIK_ARALIK, KOPUK_ADIM,
  partnerOdaMetni, yemekSurukleKarar, BASILI_TUT,
} from '../sayfalar/yavru/odalar.js';
import { odaSvg, KUVET_SVG, LAZIMLIK_SVG, SABUN_SVG } from '../sayfalar/yavru/oda-cizim.js';
import { EYLEMLER, DUSUK } from '../sayfalar/yavru/mantik.js';
import { bebekSvg, BEBEK_CSS } from '../sayfalar/yavru/bebek.js';
import { bolgeBul } from '../sayfalar/yavru/dokunma.js';

test('ODALAR: beş oda, sıra ve emoji; her bakım eylemi tek odada', () => {
  assert.deepEqual(ODA_IDLERI, ['mutfak', 'banyo', 'tuvalet', 'yatak', 'oyun']);
  assert.deepEqual(ODALAR.map((o) => o.emoji), ['🍼', '🫧', '🚽', '🌙', '⚽']);
  assert.equal(odaTanimi('yatak').ad, 'Yatak odası');
  const hepsi = ODALAR.flatMap((o) => o.eylemler);
  assert.equal(new Set(hepsi).size, hepsi.length, 'eylem iki odada olmaz');
  for (const e of [...Object.keys(EYLEMLER).filter((x) => x !== 'uyandir'), 'lazimlik']) assert.ok(hepsi.includes(e), e);
  assert.throws(() => { ODALAR[0].eylemler.push('x'); }, TypeError, 'donuk');
});

test('odaOku: kayıtlı değer geçerliyse o, değilse varsayılan', () => {
  assert.equal(odaOku('banyo'), 'banyo');
  assert.equal(odaOku(null), VARSAYILAN_ODA);
  assert.equal(odaOku('salon'), VARSAYILAN_ODA);
  assert.equal(odaOku('__proto__'), VARSAYILAN_ODA);
  assert.equal(odaOku(3), VARSAYILAN_ODA);
});

test('eylemOdasi: uyandır yatakta; ilaç her odada (null)', () => {
  assert.equal(eylemOdasi('mama'), 'mutfak');
  assert.equal(eylemOdasi('yika'), 'banyo');
  assert.equal(eylemOdasi('lazimlik'), 'tuvalet');
  assert.equal(eylemOdasi('uyut'), 'yatak');
  assert.equal(eylemOdasi('uyandir'), 'yatak');
  assert.equal(eylemOdasi('sev'), 'oyun');
  assert.equal(eylemOdasi('ilac'), null);
});

test('komsuOda: uçlarda dolanmaz', () => {
  assert.equal(komsuOda('mutfak', 1), 'banyo');
  assert.equal(komsuOda('banyo', -1), 'mutfak');
  assert.equal(komsuOda('mutfak', -1), null);
  assert.equal(komsuOda('oyun', 1), null);
  assert.equal(komsuOda('oyun', 0), 'oyun');
});

test('kaydirmaYonu: sola kaydır sonraki, sağa önceki; kısa ya da dikey kaydırma 0', () => {
  assert.equal(kaydirmaYonu(-80, 10), 1);
  assert.equal(kaydirmaYonu(80, -10), -1);
  assert.equal(kaydirmaYonu(-(KAYDIRMA_ESIK - 1), 0), 0, 'eşik altı');
  assert.equal(kaydirmaYonu(-KAYDIRMA_ESIK, 0), 1, 'eşik dahil');
  assert.equal(kaydirmaYonu(-80, 60), 0, 'çapraz: sayfa kaydırması');
  assert.equal(kaydirmaYonu(NaN, 0), 0);
});

test('odaNoktalari: düşük ihtiyaç odası; uyurken yalnız yemek ve temizlik', () => {
  const tam = { tokluk: 80, mutluluk: 80, temizlik: 80, enerji: 80 };
  assert.deepEqual(odaNoktalari({ ihtiyac: tam }), []);
  assert.deepEqual(odaNoktalari({ ihtiyac: { ...tam, tokluk: DUSUK - 1 } }), ['mutfak']);
  assert.deepEqual(odaNoktalari({ ihtiyac: { ...tam, tokluk: DUSUK } }), [], 'DUSUK sınırı dahil değil');
  const hepsi = { tokluk: 1, mutluluk: 1, temizlik: 1, enerji: 1 };
  assert.deepEqual(odaNoktalari({ ihtiyac: hepsi, cisVar: true }), ['mutfak', 'banyo', 'tuvalet', 'yatak', 'oyun']);
  assert.deepEqual(odaNoktalari({ ihtiyac: hepsi, cisVar: true, uyuyor: true }), ['mutfak', 'banyo']);
  assert.deepEqual(odaNoktalari(), []);
  assert.deepEqual(odaNoktalari({ ihtiyac: { tokluk: 'az' } }), [], 'bozuk değer');
});

test('surukleBasladi: eşik altı dokunuş', () => {
  assert.equal(surukleBasladi(3, 4), false);
  assert.equal(surukleBasladi(SURUKLE_ESIK, 0), true);
  assert.equal(surukleBasladi(-6, 6), true);
});

test('vbNokta: istemci → viewBox 0..200; bozuk kutu null', () => {
  const kutu = { left: 100, top: 50, width: 196, height: 196 };
  assert.deepEqual(vbNokta(100, 50, kutu), { x: 0, y: 0 });
  assert.deepEqual(vbNokta(198, 148, kutu), { x: 100, y: 100 });
  assert.equal(vbNokta(1, 1, null), null);
  assert.equal(vbNokta(1, 1, { left: 0, top: 0, width: 0, height: 10 }), null);
});

test('ağız isabeti: merkez isabet, yanak yakın ama isabet değil, uzak hiçbiri; bilinmeyen aşama', () => {
  for (const asama of ['buyuk', 'kucuk']) {
    const a = AGIZ[asama];
    assert.equal(agizIsabet({ x: a.x, y: a.y }, asama), true, asama);
    assert.equal(agizIsabet({ x: a.x + a.r, y: a.y }, asama), true, `${asama}: kenar dahil`);
    const yakin = { x: a.x + a.r * 1.8, y: a.y };
    assert.equal(agizIsabet(yakin, asama), false);
    assert.equal(agizYakin(yakin, asama), true, `${asama}: ağız açılır`);
    assert.equal(agizYakin({ x: 5, y: 5 }, asama), false);
    // Ağız yüzün içinde: dokunma bölgesi baş, burun ya da yanak (bebeğin üstünde)
    assert.notEqual(bolgeBul(a.x, a.y, asama), null, `${asama}: ağız bebeğin üstünde`);
  }
  assert.equal(agizUzaklik({ x: 100, y: 100 }, 'yumurta'), Infinity);
  assert.equal(agizIsabet(null, 'buyuk'), false);
});

test('kutuIsabet: pay ile genişler', () => {
  const k = { left: 10, top: 20, width: 30, height: 40 };
  assert.equal(kutuIsabet(10, 20, k), true);
  assert.equal(kutuIsabet(40, 60, k), true);
  assert.equal(kutuIsabet(41, 60, k), false);
  assert.equal(kutuIsabet(41, 60, k, 2), true);
  assert.equal(kutuIsabet(5, 5, null), false);
  assert.equal(kutuIsabet(NaN, 30, k), false);
});

test('köpük: yalnız bebeğin üstünde gezince birikir; kabarcık aralıkla; sıçrama sınırlı; tamam', () => {
  let k = kopukBaslat();
  assert.equal(kopukOrani(k), 0);
  // İlk temas yol saymaz
  let r = kopukIlerle(k, { x: 100, y: 100 }, true);
  assert.equal(r.k.yol, 0);
  assert.equal(r.yeni, 0);
  k = r.k;
  r = kopukIlerle(k, { x: 130, y: 100 }, true);
  assert.equal(r.k.yol, 30);
  assert.equal(r.yeni, 0);
  k = r.k;
  r = kopukIlerle(k, { x: 150, y: 100 }, true);
  assert.equal(r.k.yol, 50);
  assert.equal(r.yeni, 1, `${KABARCIK_ARALIK} birimde bir kabarcık`);
  k = r.k;
  // Bebeğin dışında yol saymaz ve dönüşte ilk temas da saymaz
  r = kopukIlerle(k, { x: 300, y: 100 }, false);
  assert.equal(r.k.yol, 50);
  assert.equal(r.k.son, null);
  k = r.k;
  r = kopukIlerle(k, { x: 150, y: 100 }, true);
  assert.equal(r.k.yol, 50);
  k = r.k;
  // Sıçrama en çok KOPUK_ADIM
  r = kopukIlerle(k, { x: 150, y: 190 }, true);
  assert.equal(r.k.yol, 50 + KOPUK_ADIM);
  // Gezdirmeye devam: tamamlanır, üst sınır KOPUK_YOL
  k = r.k;
  let toplamKabarcik = 2;
  for (let i = 0; i < 60; i++) {
    r = kopukIlerle(k, { x: i % 2 ? 100 : 140, y: 100 }, true);
    toplamKabarcik += r.yeni;
    k = r.k;
  }
  assert.equal(k.yol, KOPUK_YOL);
  assert.equal(kopukTamam(k), true);
  assert.equal(kopukOrani(k), 1);
  assert.equal(toplamKabarcik, Math.floor(KOPUK_YOL / KABARCIK_ARALIK));
  assert.equal(kopukIlerle(null, null, true).yeni, 0, 'bozuk girdi');
});

test('oda çizimleri: her oda SVG, gizli, sabit renk yok; bilinmeyen oda boş', () => {
  for (const id of ODA_IDLERI) {
    const s = odaSvg(id);
    assert.match(s, /^<svg [^>]*class="yvo-svg"[^>]*aria-hidden="true"/, id);
    assert.match(s, new RegExp(`data-oda="${id}"`));
    assert.doesNotMatch(s, /#[0-9a-f]{3,8}\b(?![-\w])/i, `${id}: renk jetonla`);
    assert.doesNotMatch(s, /NaN|undefined/, id);
  }
  assert.equal(odaSvg('salon'), '');
  for (const s of [KUVET_SVG, LAZIMLIK_SVG, SABUN_SVG]) {
    assert.match(s, /aria-hidden="true"/);
    assert.doesNotMatch(s, /NaN|undefined|#[0-9a-f]{6}/i);
  }
});

test('bebek konuşma ağzı: her ruhta ağız katmanında gizli öğe; stil [data-konusuyor] ile açar', () => {
  for (const asama of ['kucuk', 'buyuk']) {
    for (const ruh of ['normal', 'mutlu', 'uyuyor', 'aglama']) {
      assert.match(bebekSvg({ asama, ruh }), /<g class="yvb-agiz">.*<ellipse class="yvb-agiz-konus"[^>]*\/><\/g>/, `${asama} ${ruh}`);
    }
  }
  assert.match(BEBEK_CSS, /\.yvb-agiz-konus \{ display: none;/);
  assert.match(BEBEK_CSS, /\[data-konusuyor\] \.yvb-agiz-konus \{ display: inline; \}/);
  assert.match(BEBEK_CSS, /scaleY\(var\(--yvb-konus/);
});

test('partnerOdaMetni: geçerli oda → "Gül şu an banyoda 🫧"; değilse null', () => {
  assert.equal(partnerOdaMetni('Gül', 'banyo'), 'Gül şu an banyoda 🫧');
  assert.equal(partnerOdaMetni('Gül', 'yatak'), 'Gül şu an yatak odasında 🌙');
  assert.equal(partnerOdaMetni('', 'mutfak'), 'Sevgilin şu an mutfakta 🍼');
  assert.equal(partnerOdaMetni('Gül', null), null, 'eski istemci: alan yok');
  assert.equal(partnerOdaMetni('Gül', 'salon'), null);
  assert.equal(partnerOdaMetni('Gül', '__proto__'), null);
  for (const o of ODALAR) assert.ok(o.bulunma && o.yonelme, o.id);
});

test('yemekSurukleKarar: dikey kaydırma tarayıcıya; yatay, yukarı-çapraz ve basılı tutma sürükler', () => {
  assert.ok(BASILI_TUT >= 200 && BASILI_TUT <= 500);
  assert.equal(yemekSurukleKarar(2, 3), null, 'eşik altı: karar yok');
  assert.equal(yemekSurukleKarar(0, 30), 'kaydir', 'aşağı');
  assert.equal(yemekSurukleKarar(0, -30), 'kaydir', 'düz yukarı (sayfa kaydırması)');
  assert.equal(yemekSurukleKarar(5, -30), 'kaydir', 'yukarıya yakın dik');
  assert.equal(yemekSurukleKarar(30, 2), 'surukle', 'yatay');
  assert.equal(yemekSurukleKarar(-20, -30), 'surukle', 'yukarı-çapraz (ağza doğru)');
  assert.equal(yemekSurukleKarar(-20, 30), 'kaydir', 'aşağı-çapraz');
  assert.equal(yemekSurukleKarar(-11, -30), 'surukle', 'yan düğmeden ağza (~20°)');
  assert.equal(yemekSurukleKarar(-7, -30), 'kaydir', 'dike yakın (~13°)');
  assert.equal(yemekSurukleKarar(0, 0, true), 'surukle', 'basılı tutma');
  assert.equal(yemekSurukleKarar(NaN, 0), null);
});
