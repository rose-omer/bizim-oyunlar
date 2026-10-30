// js/core/gunler.js'e Günler ajanının eklediği fonksiyonlar: monthGrid, milestonesBetween.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthGrid, milestonesBetween, milestones } from '../js/core/gunler.js';

test('monthGrid: Pazartesi başlar, hep 42 gün', () => {
  const g = monthGrid(2026, 10); // 1 Ekim 2026 Perşembe
  assert.equal(g.length, 42);
  assert.equal(g[0].day, '2026-09-28');
  assert.equal(g[0].inMonth, false);
  assert.equal(g[3].day, '2026-10-01');
  assert.equal(g[3].inMonth, true);
  assert.equal(g.filter((c) => c.inMonth).length, 31);
  assert.equal(g[41].day, '2026-11-08');
});

test('monthGrid: ay Pazartesi başlıyorsa önde boşluk yok; Şubat ve artık yıl', () => {
  const haz = monthGrid(2026, 6); // 1 Haziran 2026 Pazartesi
  assert.equal(haz[0].day, '2026-06-01');
  const sub = monthGrid(2024, 2); // 1 Şubat 2024 Perşembe, 29 gün
  assert.equal(sub.filter((c) => c.inMonth).length, 29);
  assert.equal(sub[0].day, '2024-01-29');
  const pazar = monthGrid(2026, 11); // 1 Kasım 2026 Pazar → 6 boşluk
  assert.equal(pazar[6].day, '2026-11-01');
  assert.deepEqual(monthGrid(2026, 13), []);
});

test('milestonesBetween: geçmiş taşlar, yıl dönümü ve sıralama', () => {
  const m = milestonesBetween('2024-01-01', '2024-01-01', '2026-12-31');
  const basliklar = m.map((x) => x.baslik);
  assert.ok(basliklar.includes('100. günümüz'));
  assert.equal(m.find((x) => x.n === 100 && x.tur === 'gun').date, '2024-04-09');
  assert.equal(m.find((x) => x.tur === 'yil' && x.n === 1).date, '2025-01-01');
  assert.equal(m.find((x) => x.tur === 'yil' && x.n === 2).date, '2026-01-01');
  const tarihler = m.map((x) => x.date);
  assert.deepEqual(tarihler, [...tarihler].sort());
});

test('milestonesBetween: aylık; yıl dönümüne denk gelen ay atlanır, ay sonu kırpılır', () => {
  const m = milestonesBetween('2026-01-31', '2026-02-01', '2027-02-28', { monthly: true }).filter((x) => x.tur === 'ay');
  assert.equal(m[0].date, '2026-02-28');
  assert.equal(m[0].n, 1);
  assert.ok(!m.some((x) => x.n === 12));
  assert.equal(m.length, 12); // 1..13 ay, 12 hariç
});

test('milestonesBetween: aynı güne düşenlerde yıl dönümü kazanır; aralık dışı boş', () => {
  // 2025-01-01 başlangıç → 366. gün = 2026-01-01 değil (365. gün 2025-12-31). Yıl ve 365 ayrı günler.
  const m = milestonesBetween('2025-01-01', '2025-12-31', '2026-01-01', { monthly: true });
  assert.deepEqual(m.map((x) => [x.date, x.tur]), [['2025-12-31', 'gun'], ['2026-01-01', 'yil']]);
  assert.deepEqual(milestonesBetween('2025-01-01', '2026-01-02', '2026-01-01'), []);
  assert.deepEqual(milestonesBetween('bozuk', '2026-01-01', '2026-02-01'), []);
});

test('milestonesBetween milestones() ile aynı gelecek taşları verir', () => {
  const today = '2026-10-30';
  const ileri = milestones('2025-03-10', { today, limit: 3 });
  const aralik = milestonesBetween('2025-03-10', today, ileri[ileri.length - 1].date);
  assert.deepEqual(aralik.map((x) => x.date), ileri.map((x) => x.date));
});
