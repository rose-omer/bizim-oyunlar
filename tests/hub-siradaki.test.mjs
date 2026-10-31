// Ana sayfa "Bugün" bölümü: Sıradaki kartının seçimi ve özet metinleri (js/hub.js saf dışa aktarımları).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as biz from '../js/hub.js';

const gs = (durum) => ({ tur: 'gs', durum });
const gun = { tur: 'gun', ne: 'yarin' };
const bul = { tur: 'bulusma', mode: 'future' };
const bulYok = { tur: 'bulusma', mode: 'yok' };
const turler = (r) => [r.ana?.tur ?? null, ...r.ozet.map((i) => `${i.tur}${i.durum ? `:${i.durum}` : ''}${i.mode ? `:${i.mode}` : ''}`)];

test('siradakiSec: önce cevaplanmamış soru, sonra bugün/yarın özel gün, sonra buluşma', () => {
  assert.deepEqual(turler(biz.siradakiSec({ gs: gs('yok'), gun, bulusma: bul })), ['gs', 'gun', 'bulusma:future']);
  assert.deepEqual(turler(biz.siradakiSec({ gs: gs('partner'), gun, bulusma: bul })), ['gs', 'gun', 'bulusma:future']);
  assert.deepEqual(turler(biz.siradakiSec({ gs: gs('ben'), gun, bulusma: bul })), ['gun', 'bulusma:future', 'gs:ben']);
  assert.deepEqual(turler(biz.siradakiSec({ gs: gs('ikisi'), gun: null, bulusma: bul })), ['bulusma', 'gs:ikisi']);
});

test('siradakiSec: buluşma yoksa "ekle" en sonda; başka bir şey yoksa cevaplanmış soru öne çıkar', () => {
  assert.deepEqual(turler(biz.siradakiSec({ gs: gs('ikisi'), gun: null, bulusma: bulYok })), ['gs', 'bulusma:yok']);
  assert.deepEqual(turler(biz.siradakiSec({ gs: gs('yok'), gun, bulusma: bulYok })), ['gs', 'gun', 'bulusma:yok']);
  assert.deepEqual(turler(biz.siradakiSec({ gs: null, gun: null, bulusma: bulYok })), ['bulusma']);
  assert.deepEqual(biz.siradakiSec({}), { ana: null, ozet: [] });
});

test('yakinGunler: bugün varsa o; yoksa yarın; liste Sıradaki\'dekini tekrar etmez', () => {
  const y = (baslik, daysLeft) => ({ key: baslik, baslik, emoji: '💗', daysLeft, date: `2026-11-${String(daysLeft + 1).padStart(2, '0')}` });
  const yaklasan = [y('A', 0), y('B', 1), y('C', 5), y('D', 9), y('E', 20)];
  const bugun = [{ emoji: '🎂', baslik: 'A' }];
  const r1 = biz.yakinGunler(bugun, yaklasan);
  assert.equal(r1.siradaki.ne, 'bugun');
  assert.deepEqual(r1.siradaki.items, bugun);
  assert.deepEqual(r1.liste.map((i) => i.baslik), ['B', 'C', 'D']);
  const r2 = biz.yakinGunler([], yaklasan.slice(1));
  assert.equal(r2.siradaki.ne, 'yarin');
  assert.deepEqual(r2.siradaki.items.map((i) => i.baslik), ['B']);
  assert.deepEqual(r2.liste.map((i) => i.baslik), ['C', 'D', 'E']);
  const r3 = biz.yakinGunler([], yaklasan.slice(2), 2);
  assert.equal(r3.siradaki, null);
  assert.deepEqual(r3.liste.map((i) => i.baslik), ['C', 'D']);
  assert.deepEqual(biz.yakinGunler(), { siradaki: null, liste: [] });
});

test('kalanKisa: buluşmaya kalan süre tek kelime', () => {
  assert.equal(biz.kalanKisa({ past: false, days: 3, hours: 4, minutes: 0 }), '3 gün');
  assert.equal(biz.kalanKisa({ past: false, days: 0, hours: 5, minutes: 10 }), '5 saat');
  assert.equal(biz.kalanKisa({ past: false, days: 0, hours: 0, minutes: 12 }), '12 dk');
  assert.equal(biz.kalanKisa({ past: false, days: 0, hours: 0, minutes: 0 }), '1 dk');
  assert.equal(biz.kalanKisa({ past: true }), 'şimdi');
  assert.equal(biz.kalanKisa(null), '');
});

test('momentLabel gunAdi: false: özet satırı için gün adsız', () => {
  const iso = new Date(2026, 10, 3, 18, 0).toISOString();
  assert.equal(biz.momentLabel(iso, new Date(2026, 9, 31), { gunAdi: false }), '3 Kasım 18:00');
  assert.equal(biz.momentLabel(iso, new Date(2026, 9, 31)), '3 Kasım Salı 18:00');
});
