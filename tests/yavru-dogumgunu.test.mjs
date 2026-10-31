// Yavrumuz doğum günü: çatlama günü = doğum günü (sayfalar/yavru/mantik.js). Yerel takvim günü; DOM yok.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  oku, yeniYumurta, catlamaYamasi, DOGUM_GUNU_METNI, dogumGunu, dogumGunuMu, dogumGunuOlayi,
} from '../sayfalar/yavru/mantik.js';

/** Yerel saat (testler saat diliminden bağımsız kalsın). */
const L = (y, m, d, sa = 12, dk = 0) => new Date(y, m - 1, d, sa, dk).getTime();
const iso = (ms) => new Date(ms).toISOString();
/** Çatlamış yavru: çatlama zamanı yerel saatle. */
const catlamis = (ms) => oku({ asama: 'kucuk', ad: 'Pamuk', renk: 2, dogum: iso(ms - 86400000), catlama: iso(ms) });

test('dogumGunu: çatlama zamanının yerel günü; yumurtada ve çatlama yoksa null', () => {
  assert.equal(dogumGunu(catlamis(L(2026, 10, 30, 15))), '2026-10-30');
  assert.equal(dogumGunu(catlamis(L(2026, 10, 30, 23, 50))), '2026-10-30', 'gece yarısına yakın: yerel gün');
  assert.equal(dogumGunu(oku(yeniYumurta({ roomId: 'x', simdi: L(2026, 10, 30) }))), null);
  assert.equal(dogumGunu(oku({ asama: 'kucuk', ad: 'Eski' })), null, 'eski belge bozulmaz');
  assert.equal(dogumGunu(null), null);
  // catlamaYamasi'nin yazdığı alan okunur.
  const yum = oku(yeniYumurta({ roomId: 'x', simdi: L(2026, 10, 29) }));
  const t = L(2026, 10, 30, 9);
  assert.equal(dogumGunu(oku({ ...yum, ...catlamaYamasi(yum, { roomId: 'x', simdi: t }) })), '2026-10-30');
});

test('dogumGunuMu: yıl dönümünde true; çatladığı gün ve öbür günler false', () => {
  const y = catlamis(L(2026, 10, 30, 15));
  assert.equal(dogumGunuMu(y, L(2026, 10, 30, 18)), false, 'çatladığı gün "Yeni doğdu"');
  assert.equal(dogumGunuMu(y, L(2026, 10, 31)), false);
  assert.equal(dogumGunuMu(y, L(2027, 10, 29, 23, 59)), false);
  assert.equal(dogumGunuMu(y, L(2027, 10, 30, 0, 1)), true);
  assert.equal(dogumGunuMu(y, L(2027, 10, 30, 23, 59)), true);
  assert.equal(dogumGunuMu(y, L(2027, 10, 31, 0, 1)), false);
  assert.equal(dogumGunuMu(y, L(2029, 10, 30)), true, '3 yaş');
  assert.equal(dogumGunuMu(oku(yeniYumurta({ roomId: 'x', simdi: L(2025, 10, 30) })), L(2026, 10, 30)), false);
  assert.equal(dogumGunuMu(null, L(2026, 10, 30)), false);
  assert.equal(DOGUM_GUNU_METNI, 'Bugün doğum günü! 🎂');
});

test('dogumGunuMu: 29 Şubat doğumlu artık olmayan yılda 28 Şubat kutlar', () => {
  const y = catlamis(L(2028, 2, 29, 12));
  assert.equal(dogumGunuMu(y, L(2029, 2, 28)), true);
  assert.equal(dogumGunuMu(y, L(2029, 3, 1)), false);
  assert.equal(dogumGunuMu(y, L(2032, 2, 28)), false, 'artık yılda 29 Şubat');
  assert.equal(dogumGunuMu(y, L(2032, 2, 29)), true);
});

test('dogumGunuOlayi: sıradaki doğum günü o gün 10:00, "N yaşında"', () => {
  const y = catlamis(L(2026, 10, 30, 15));
  const olay = (ms, n) => ({ id: 'dogumgunu', baslik: 'Yavrumuz', metin: `Yavrumuz bugün ${n} yaşında 🎂`, zaman: iso(ms) });
  // Çatladığı gün: ilk yıl dönümü.
  assert.deepEqual(dogumGunuOlayi(y, L(2026, 10, 30, 18)), olay(L(2027, 10, 30, 10), 1));
  assert.deepEqual(dogumGunuOlayi(y, L(2027, 3, 1)), olay(L(2027, 10, 30, 10), 1));
  // Doğum günü sabahı 10:00'dan önce: bugün; sonra: gelecek yıl.
  assert.deepEqual(dogumGunuOlayi(y, L(2027, 10, 30, 9, 59)), olay(L(2027, 10, 30, 10), 1));
  assert.deepEqual(dogumGunuOlayi(y, L(2027, 10, 30, 10)), olay(L(2028, 10, 30, 10), 2));
  assert.deepEqual(dogumGunuOlayi(y, L(2027, 10, 30, 11)), olay(L(2028, 10, 30, 10), 2));
  // Çatlama 10:00'dan önceyse de ilk olay gelecek yıl (çatladığı gün sayılmaz).
  assert.deepEqual(dogumGunuOlayi(catlamis(L(2026, 10, 30, 8)), L(2026, 10, 30, 8, 5)), olay(L(2027, 10, 30, 10), 1));
  // 29 Şubat.
  assert.deepEqual(dogumGunuOlayi(catlamis(L(2028, 2, 29)), L(2028, 6, 1)), olay(L(2029, 2, 28, 10), 1));
  assert.equal(dogumGunuOlayi(oku(yeniYumurta({ roomId: 'x', simdi: L(2026, 10, 30) })), L(2026, 10, 31)), null);
  assert.equal(dogumGunuOlayi(null, L(2026, 10, 31)), null);
});
