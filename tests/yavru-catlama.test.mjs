// Yavrumuz: çatlama anı (sahne kararı, metinler, sahne çizimi). DOM yok.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { oku, yeniYumurta, catlamaYamasi, catlamaSahnesiGerekli, catlamaMetinleri, DK, GUN } from '../sayfalar/yavru/mantik.js';
import { yavruSvg, catlamaSvg, CIZIM_CSS } from '../sayfalar/yavru/cizim.js';
import { applyPatch } from '../js/core/veri.js';

const T0 = Date.UTC(2026, 9, 30, 9, 0, 0);
const iso = (ms) => new Date(ms).toISOString();

test('catlamaSahnesiGerekli: yavru çıkmış ve bu cihaz görmemişse bir kez', () => {
  const yum = oku(yeniYumurta({ roomId: 'testpaka23', simdi: T0 }));
  const kucuk = oku(applyPatch(yum, catlamaYamasi(yum, { roomId: 'testpaka23', simdi: T0 + GUN })));
  const sonra = T0 + GUN + 10 * DK;
  assert.equal(catlamaSahnesiGerekli(kucuk, false, sonra), true, 'çatladı, görülmedi');
  assert.equal(catlamaSahnesiGerekli(kucuk, true, sonra), false, 'bu cihazda görüldü');
  assert.equal(catlamaSahnesiGerekli(yum, false, sonra), false, 'henüz yumurta');
  assert.equal(catlamaSahnesiGerekli(oku({ ...kucuk, asama: 'buyuk' }), false, sonra), false, 'büyümüşse çatlama sahnesi yok');
  assert.equal(catlamaSahnesiGerekli(null, false, sonra), false, 'belge yok');
  // Yama sevgiliden gelse de (catlama alanı onun saati) karar aynı.
  const sevgiliden = oku({ ...kucuk, catlama: iso(T0 + 5 * DK) });
  assert.equal(catlamaSahnesiGerekli(sevgiliden, false, sonra), true);
});

test('catlamaSahnesiGerekli: günler önce çatlamış yavruda (özellikten önce çatlamış) oynamaz', () => {
  const yum = oku(yeniYumurta({ roomId: 'testpaka23', simdi: T0 }));
  const kucuk = oku(applyPatch(yum, catlamaYamasi(yum, { roomId: 'testpaka23', simdi: T0 + GUN })));
  assert.equal(catlamaSahnesiGerekli(kucuk, false, T0 + 3 * GUN), true, '2 gün sonra hâlâ oynar');
  assert.equal(catlamaSahnesiGerekli(kucuk, false, T0 + 5 * GUN), false, '4 gün sonra oynamaz');
  assert.equal(catlamaSahnesiGerekli(oku({ ...kucuk, catlama: null }), false, T0 + GUN), false, 'çatlama zamanı yok');
});

test('catlamaMetinleri: ad yoksa ad sorar; varsa (sevgili koyduysa) adı gösterir', () => {
  const yok = catlamaMetinleri('');
  assert.equal(yok.adSor, true);
  assert.equal(yok.dugme, 'Ona bir ad koyalım');
  assert.equal(yok.baslik, 'Yavrumuz dünyaya geldi!');
  assert.ok(yok.catliyor && yok.geldi && yok.satir);
  const var_ = catlamaMetinleri('  Pamuk ');
  assert.equal(var_.adSor, false);
  assert.equal(var_.dugme, 'Merhaba Pamuk');
  assert.equal(var_.satir, 'Adı Pamuk 💛');
  assert.deepEqual(catlamaMetinleri(null), yok);
  assert.deepEqual(catlamaMetinleri(), yok);
});

test('catlamaSvg: üst kabuk, alt kabuk, yavru, çatlaklar, kırıntılar; dış kaynak yok', () => {
  const s = catlamaSvg({ renk: 3 });
  assert.match(s, /^<svg [^>]*class="yv-svg yv-cs-svg"/);
  assert.match(s, /<\/svg>$/);
  assert.match(s, /--yv-govde:var\(--yv-r3\)/);
  assert.match(s, /aria-hidden="true"/);
  for (const parca of ['yv-cs-yavru', 'yv-cs-yumurta', 'yv-cs-ust', 'yv-cs-alt']) assert.match(s, new RegExp(`class="${parca}"`), parca);
  assert.ok((s.match(/class="yv-cs-catlak"/g) || []).length >= 3, 'en az üç çatlak');
  assert.ok((s.match(/class="yv-cs-kirinti"/g) || []).length >= 3, 'kırıntılar');
  assert.ok((s.match(/class="yv-cs-yildiz"/g) || []).length >= 4, 'parıltılar');
  assert.doesNotMatch(s, /https?:|href|<script|url\(/i);
  // Sıra: yavru kabuğun arkasında (önce çizilir), üst kabuk en önde.
  assert.ok(s.indexOf('yv-cs-yavru') < s.indexOf('yv-cs-alt'));
  assert.ok(s.indexOf('yv-cs-alt') < s.indexOf('yv-cs-ust'));
  // Boşta hareketi (nefes, salla) sahneye karışmasın.
  assert.doesNotMatch(s, /yv-beden/);
  assert.equal(catlamaSvg({ renk: 99 }), catlamaSvg({ renk: 1 }));
  assert.equal(catlamaSvg({ ruh: '<x>' }), catlamaSvg({ ruh: 'mutlu' }));
});

test('catlamaSvg: son kare küçük yavru çizimiyle aynı (geçişte sıçrama yok)', () => {
  const sahne = catlamaSvg({ renk: 2, ruh: 'mutlu' });
  const kucuk = yavruSvg({ asama: 'kucuk', ruh: 'mutlu', renk: 2 });
  const govde = kucuk.match(/<g class="yv-beden">([\s\S]*)<\/g><\/svg>$/)[1];
  const kabukBas = govde.indexOf('<path class="yv-kabuk"');
  assert.ok(kabukBas > 0);
  assert.ok(sahne.includes(govde.slice(0, kabukBas)), 'yavru gövdesi ve yüzü aynı');
  assert.ok(sahne.includes(govde.slice(kabukBas)), 'alt kabuk aynı');
  assert.ok(sahne.includes('<ellipse class="yv-zemin" cx="100" cy="182" rx="48" ry="6.5"/>'), 'zemin aynı');
});

test('CIZIM_CSS: sahne katmanı, hareket yalnız no-preference altında', () => {
  assert.match(CIZIM_CSS, /\.yv-cs\s*\{/);
  assert.match(CIZIM_CSS, /\.yv-cs-metin/);
  // Sahne kuralları: önce durağan kurallar, sonra yalnız hareket isteyene açılan blok.
  const sahne = CIZIM_CSS.slice(CIZIM_CSS.indexOf('.yv-cs {'));
  const [duragan, ...kalan] = sahne.split('@media (prefers-reduced-motion: no-preference)');
  const hareketli = kalan.join('');
  for (const ad of ['yv-cs-gir', 'yv-cs-salla', 'yv-cs-ust', 'yv-cs-cik', 'yv-cs-catlak', 'yv-cs-hale']) {
    assert.match(hareketli, new RegExp(`animation:[^;]*${ad}`), ad);
  }
  assert.doesNotMatch(duragan, /animation/, 'hareket azaltmada sahne kıpırdamaz');
});
