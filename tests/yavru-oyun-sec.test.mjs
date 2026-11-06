// Yavrumuz Oyunlar alt sayfası: gruplar, çubuk oranı, CSS kuralları (saf; DOM yok).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { oyunGruplari, cubukYuzde, oyunSecKur, CSS } from '../sayfalar/yavru/oyun-sec.js';
import { OYUNLAR } from '../sayfalar/yavru/oyunlar/cerceve.js';
import { OYUN_IKON } from '../sayfalar/yavru/ikonlar.js';

test('gruplar: Birlikte salla; Tek başına giydir ve tarif başta, sonra kayıt sırası', () => {
  assert.deepEqual(oyunGruplari(OYUNLAR), [
    { baslik: 'Birlikte', oyunlar: ['salla'] },
    { baslik: 'Tek başına', oyunlar: ['giydir', 'tarif', 'balon', 'top', 'cee', 'ninni'] },
  ]);
});

test('gruplar: kayıtta olmayan oyun çıkmaz, yeni oyun sona eklenir', () => {
  assert.deepEqual(oyunGruplari({ top: {}, yeni: {}, tarif: {} }), [
    { baslik: 'Birlikte', oyunlar: [] },
    { baslik: 'Tek başına', oyunlar: ['tarif', 'top', 'yeni'] },
  ]);
});

test('gruplar: her oyun bir kez çıkar ve ikonu vardır', () => {
  const idler = oyunGruplari(OYUNLAR).flatMap((g) => g.oyunlar);
  assert.deepEqual([...idler].sort(), Object.keys(OYUNLAR).sort());
  for (const id of idler) assert.ok(OYUN_IKON[id], `${id} ikonu yok`);
});

test('çubuk: oran yüzde, 0..100 arası; bozuk girdi 0', () => {
  assert.equal(cubukYuzde(45, 200), 22.5);
  assert.equal(cubukYuzde(0, 200), 0);
  assert.equal(cubukYuzde(250, 200), 100);
  assert.equal(cubukYuzde(-5, 200), 0);
  assert.equal(cubukYuzde(10, 0), 0);
  assert.equal(cubukYuzde(Number.NaN, 200), 0);
  assert.equal(cubukYuzde(10, undefined), 0);
});

test('modül Node\'da yüklenir; kurucu dışa açık', () => {
  assert.equal(typeof oyunSecKur, 'function');
});

test('CSS: yalnız yvos- sınıfı, sabit renk yok, küçük yazı yok, hareket medya içinde', () => {
  const siniflar = [...CSS.matchAll(/\.(-?[a-zA-Z_][\w-]*)/g)].map((m) => m[1]);
  assert.ok(siniflar.length > 0);
  for (const s of siniflar) assert.ok(s.startsWith('yvos-'), `yabancı sınıf: ${s}`);
  assert.equal(/#[0-9a-fA-F]{3,8}\b/.test(CSS), false, 'sabit renk var');
  for (const m of CSS.matchAll(/font-size:\s*([\d.]+)rem/g)) assert.ok(Number(m[1]) >= 0.75, `küçük yazı: ${m[1]}rem`);
  assert.equal(/font-size:\s*[\d.]+px/.test(CSS), false, 'yazı boyu rem olmalı');
  const ic = CSS.split('@media (prefers-reduced-motion: no-preference)')[0];
  assert.equal(/transition|animation/.test(ic), false, 'hareket medya dışında');
});
