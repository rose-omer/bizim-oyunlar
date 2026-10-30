// Ana sayfa "Biz": saf yardımcılar (DOM yok; hub.js Node'da yalnız dışa aktarımlarını verir).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as biz from '../js/hub.js';

test('durationText: sıfırları atlar', () => {
  assert.equal(biz.durationText({ years: 1, months: 4, days: 2 }), '1 yıl, 4 ay, 2 gün');
  assert.equal(biz.durationText({ years: 0, months: 3, days: 0 }), '3 ay');
  assert.equal(biz.durationText({ years: 2, months: 0, days: 5 }), '2 yıl, 5 gün');
  assert.equal(biz.durationText({ years: 0, months: 0, days: 0 }), '');
  assert.equal(biz.durationText(), '');
});

test('ablativeNum ve sinceText: sayının okunuşuna göre ek', () => {
  const cases = { 1: 'den', 3: 'ten', 6: 'dan', 9: 'dan', 10: 'dan', 20: 'den', 40: 'tan', 60: 'tan', 70: 'ten', 100: 'den', 2000: 'den', 2020: 'den', 2024: 'ten', 2025: 'ten', 2026: 'dan', 2030: 'dan' };
  for (const [n, ek] of Object.entries(cases)) assert.equal(biz.ablativeNum(Number(n)), ek, String(n));
  assert.equal(biz.sinceText('2025-02-14'), "14 Şubat 2025'ten beri");
  assert.equal(biz.sinceText('2019-08-01'), "1 Ağustos 2019'dan beri");
  assert.equal(biz.sinceText('2020-12-31'), "31 Aralık 2020'den beri");
  assert.equal(biz.sinceText('bozuk'), '');
});

test('dayLabel ve momentLabel: Türkçe gün adı, başka yılda yıl', () => {
  assert.equal(biz.dayLabel('2026-11-12', '2026-10-30'), '12 Kasım Perşembe');
  assert.equal(biz.dayLabel('2027-02-14', '2026-10-30'), '14 Şubat 2027 Pazar');
  assert.equal(biz.dayLabel('yok', '2026-10-30'), '');
  assert.equal(biz.momentLabel(new Date(2026, 10, 12, 18, 0).toISOString(), new Date(2026, 9, 30)), '12 Kasım Perşembe 18:00');
});

test('agoText: dakika, saat, gün', () => {
  const now = new Date(2026, 9, 30, 21, 0);
  const ago = (ms) => new Date(now.getTime() - ms).toISOString();
  assert.equal(biz.agoText(ago(20e3), now), 'az önce');
  assert.equal(biz.agoText(ago(5 * 60e3), now), '5 dk önce');
  assert.equal(biz.agoText(ago(3 * 3600e3), now), '3 sa önce');
  assert.equal(biz.agoText(ago(30 * 3600e3), now), 'dün');
  assert.equal(biz.agoText('bozuk', now), '');
});

const kisiler = [
  { id: 'omer', data: { ad: 'Ömer', dogum: '1995-11-02' } },
  { id: 'gul', data: { ad: 'Gül', dogum: '1997-11-12' } },
  { id: 'adsiz', data: { dogum: 'bozuk' } },
];

test('birthdayDocs: tamlayan eki, kendi doğum günüm, Günler sayfasıyla çift kayıt yok', () => {
  const docs = biz.birthdayDocs(kisiler, 'omer');
  assert.deepEqual(docs.map((d) => d.data.baslik), ['Doğum günün', "Gül'ün doğum günü"]);
  assert.equal(docs[1].data.tekrar, 'yil');
  const gun = [{ id: 'g1', data: { baslik: 'Gül doğdu', tarih: '1997-11-12', tekrar: 'yil', tur: 'dogumgunu', emoji: '🎈' } }];
  assert.deepEqual(biz.birthdayDocs(kisiler, 'omer', gun).map((d) => d.id), ['dogum-omer']);
});

test('yaklasanlar: gün + doğum günü + kilometre taşı, en yakın 3, yıl dönümü tekrarı yok', () => {
  const gun = [
    { id: 'a', data: { baslik: 'Tanıştığımız gün', tarih: '2024-11-20', tekrar: 'yil', tur: 'yildonumu', emoji: '💐' } },
    { id: 'b', data: { baslik: 'Konser', tarih: '2026-12-25', tekrar: 'yok', tur: 'plan', emoji: '🎵' } },
  ];
  const items = biz.yaklasanlar({ gunDocs: gun, kisiDocs: kisiler, myId: 'omer', baslangic: '2025-08-01', today: '2026-10-30', limit: 3 });
  assert.deepEqual(items.map((i) => i.baslik), ['Doğum günün', "Gül'ün doğum günü", 'Tanıştığımız gün · 2. yıl']);
  assert.deepEqual(items.map((i) => i.daysLeft), [3, 13, 21]);
  // Başlangıç tarihiyle aynı günde 'yildonumu' belgesi varsa kilometre taşı "N. yıl dönümümüz" eklenmez.
  const dup = biz.yaklasanlar({
    gunDocs: [{ id: 'y', data: { baslik: 'Yıl dönümümüz', tarih: '2025-11-01', tekrar: 'yil', tur: 'yildonumu', emoji: '💍' } }],
    baslangic: '2025-11-01', today: '2026-10-30', limit: 5,
  });
  assert.equal(dup.filter((i) => i.date === '2026-11-01').length, 1);
  assert.equal(biz.yaklasanlar({ today: '2026-10-30' }).length, 0);
});

test('bugunkuler: kilometre taşı, ay dönümü ve doğum günü', () => {
  assert.deepEqual(biz.bugunkuler({ baslangic: '2025-06-30', today: '2026-10-30' }).map((e) => e.baslik), ['16. ayımız']);
  const day500 = biz.bugunkuler({ baslangic: '2025-06-18', today: '2026-10-30' });
  assert.ok(day500.some((e) => e.baslik === '500. günümüz'));
  assert.deepEqual(biz.bugunkuler({ kisiDocs: kisiler, myId: 'gul', today: '2026-11-02' }).map((e) => e.baslik), ["Ömer'in doğum günü"]);
  assert.deepEqual(biz.bugunkuler({ today: '2026-10-30' }), []);
});

test('touchSummary ve touchSummaryText: yalnız bana, son ziyaretten sonra', () => {
  const at = (m) => new Date(Date.UTC(2026, 9, 30, 12, m)).toISOString();
  const docs = [
    { id: '1', author: 'gul', data: { tur: 'kalp', kime: 'omer', at: at(1) } },
    { id: '2', author: 'gul', data: { tur: 'kalp', kime: 'omer', at: at(2) } },
    { id: '3', author: 'gul', data: { tur: 'sarilma', kime: 'omer', at: at(3) } },
    { id: '4', author: 'omer', data: { tur: 'kalp', kime: 'gul', at: at(4) } },
    { id: '5', author: 'gul', data: { tur: 'kalp', kime: 'omer', at: at(0) } },
    { id: '6', author: 'gul', data: { tur: 'yok', kime: 'omer', at: at(5) } },
  ];
  const since = Date.parse(at(0));
  const s = biz.touchSummary(docs, 'omer', since);
  assert.deepEqual(s, [{ tur: 'kalp', emoji: '💗', n: 2 }, { tur: 'sarilma', emoji: '🤗', n: 1 }]);
  assert.equal(biz.touchSummaryText('Gül', s), 'Gül sana 2 💗 ve 1 🤗 gönderdi');
  assert.equal(biz.touchSummaryText('Gül', s.slice(0, 1)), 'Gül sana 2 💗 gönderdi');
  assert.equal(biz.touchSummaryText('Gül', []), '');
  assert.equal(biz.touchSummary(docs, 'gul', 0).length, 1);
});

test('haversineKm ve distanceText', () => {
  const ist = { lat: 41.01, lng: 28.98 };
  const ank = { lat: 39.93, lng: 32.86 };
  const km = biz.haversineKm(ist, ank);
  assert.ok(km > 340 && km < 360, String(km));
  assert.equal(biz.distanceText(km), `Aramızda ${Math.round(km)} km`);
  assert.equal(biz.distanceText(1234.4), 'Aramızda 1.234 km');
  assert.equal(biz.distanceText(0.4), 'Aynı yerdesiniz');
  assert.equal(biz.distanceText(NaN), '');
  assert.equal(biz.validCoord(ist), true);
  assert.equal(biz.validCoord({ lat: 'x', lng: 1 }), false);
  assert.equal(biz.validCoord({ lat: 91, lng: 0 }), false);
  assert.equal(biz.validCoord(null), false);
});

test('MOODS: 6 seçenek, tekil emoji; cleanNote kırpar', () => {
  assert.equal(biz.MOODS.length, 6);
  assert.equal(new Set(biz.MOODS.map((m) => m.emoji)).size, 6);
  assert.equal(biz.moodByEmoji('🥰').ad, 'Aşık');
  assert.equal(biz.moodByEmoji('x'), null);
  assert.equal(biz.cleanNote('  çok   özledim  '), 'çok özledim');
  assert.equal(biz.cleanNote('a'.repeat(200)).length, 80);
});
