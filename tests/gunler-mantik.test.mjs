// sayfalar/gunler/mantik.js: birleşik liste, takvim, kilometre taşları, hatırlatmalar, form doğrulama.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  iyelik, dogumGunleri, kacinciYazi, birlesikListe, gecmisPlanlar, olusumlar, takvimOlaylari,
  tasZaman, hatirlatmalar, kutlamaGerekli, gunDogrula, bulusmaIso, isoParcala, bulusmaDogrula,
  tarihYazi, ayBasligi, haftaGunleri, ayKaydir, sureYazi, oneriler, kalanYazi,
} from '../sayfalar/gunler/mantik.js';

const BUGUN = '2026-10-30';
const doc = (id, data) => ({ id, data });
const kisiler = [
  doc('omer-id', { ad: 'Ömer', dogum: '1998-11-02' }),
  doc('gul-id', { ad: 'Gül', dogum: '1999-03-15' }),
];

test('iyelik: Türkçe tamlayan eki', () => {
  assert.equal(iyelik('Ömer'), "Ömer'in");
  assert.equal(iyelik('Gül'), "Gül'ün");
  assert.equal(iyelik('Ayşe'), "Ayşe'nin");
  assert.equal(iyelik('Can'), "Can'ın");
  assert.equal(iyelik('Umut'), "Umut'un");
  assert.equal(iyelik(''), '');
});

test('dogumGunleri: kişi belgelerinden; elle eklenen aynı gün atlanır', () => {
  const d = dogumGunleri(kisiler, []);
  assert.deepEqual(d.map((x) => x.data.baslik), ["Ömer'in doğum günü", "Gül'ün doğum günü"]);
  assert.equal(d[0].data.tekrar, 'yil');
  assert.equal(d[0].id, 'dogum-omer-id');
  const elle = [doc('x', { baslik: 'Ömer doğdu', tarih: '1998-11-02', tur: 'dogumgunu' })];
  assert.equal(dogumGunleri(kisiler, elle).length, 1);
  assert.equal(dogumGunleri([doc('a', { ad: 'A', dogum: 'bozuk' })]).length, 0);
});

test('kacinciYazi', () => {
  assert.equal(kacinciYazi({ kaynak: 'gun', tur: 'yildonumu', tekrar: 'yil', kacinci: 3 }), '3. yıl dönümü');
  assert.equal(kacinciYazi({ kaynak: 'dogum', tur: 'dogumgunu', tekrar: 'yil', kacinci: 25 }), '25. yaş');
  assert.equal(kacinciYazi({ kaynak: 'gun', tur: 'ozel', tekrar: 'ay', kacinci: 4 }), '4. ay');
  assert.equal(kacinciYazi({ kaynak: 'gun', tur: 'plan', tekrar: 'yil', kacinci: 2 }), null);
  assert.equal(kacinciYazi({ kaynak: 'gun', tur: 'yildonumu', tekrar: 'yil', kacinci: 0 }), null);
  assert.equal(kacinciYazi({ kaynak: 'tas', tur: 'tas', kacinci: 5 }), null);
});

test('birlesikListe: özel gün + doğum günü + kilometre taşı, en yakın önce', () => {
  const gunler = [
    doc('g1', { baslik: 'İlk buluşma', tarih: '2023-11-10', tekrar: 'yil', tur: 'yildonumu', emoji: '☕' }),
    doc('g2', { baslik: 'Konser', tarih: '2026-10-30', tekrar: 'yok', tur: 'plan', emoji: '🎵' }),
    doc('g3', { baslik: 'Eski plan', tarih: '2026-01-01', tekrar: 'yok', tur: 'plan' }),
  ];
  const l = birlesikListe({ gunler, kisiler, baslangic: '2026-08-01', bugun: BUGUN });
  assert.equal(l[0].baslik, 'Konser');
  assert.equal(l[0].daysLeft, 0);
  assert.deepEqual([l[1].baslik, l[1].date, l[1].tasTur], ['3. ayımız', '2026-11-01', 'ay']);
  assert.equal(l[2].baslik, "Ömer'in doğum günü");
  assert.equal(l[2].ek, '28. yaş');
  assert.equal(l[2].kaynak, 'dogum');
  const tas = l.find((x) => x.baslik === '100. günümüz');
  assert.equal(tas.kaynak, 'tas');
  assert.equal(tas.date, '2026-11-08');
  const ilk = l.find((x) => x.id === 'g1');
  assert.equal(ilk.ek, '3. yıl dönümü');
  assert.ok(!l.some((x) => x.id === 'g3'));
  assert.ok(l.some((x) => x.kaynak === 'tas' && x.tasTur === 'ay'));
  for (let i = 1; i < l.length; i++) assert.ok(l[i - 1].daysLeft <= l[i].daysLeft);
});

test('birlesikListe: başlangıç yoksa taş yok; aynı gün taş özel günden sonra', () => {
  const gunler = [doc('g', { baslik: 'Zeta', tarih: '2025-11-08', tekrar: 'yil', tur: 'ozel' })];
  assert.ok(!birlesikListe({ gunler, bugun: BUGUN }).some((x) => x.kaynak === 'tas'));
  const l = birlesikListe({ gunler, baslangic: '2026-08-01', bugun: BUGUN }).filter((x) => x.date === '2026-11-08');
  assert.deepEqual(l.map((x) => x.kaynak), ['gun', 'tas']);
  assert.equal(l[0].ek, '1. yıl');
});

test('gecmisPlanlar: yalnız geçmişte kalan tek seferlikler, yeniden eskiye', () => {
  const g = gecmisPlanlar([
    doc('a', { baslik: 'A', tarih: '2026-01-01', tekrar: 'yok' }),
    doc('b', { baslik: 'B', tarih: '2026-05-01', tekrar: 'yok' }),
    doc('c', { baslik: 'C', tarih: '2026-12-01', tekrar: 'yok' }),
    doc('d', { baslik: 'D', tarih: '2020-01-01', tekrar: 'yil' }),
  ], BUGUN);
  assert.deepEqual(g.map((x) => x.id), ['b', 'a']);
});

test('olusumlar: aylık, yıllık, tek seferlik', () => {
  assert.deepEqual(olusumlar('2026-01-31', 'ay', '2026-02-01', '2026-04-30'), ['2026-02-28', '2026-03-31', '2026-04-30']);
  assert.deepEqual(olusumlar('2020-02-29', 'yil', '2026-01-01', '2028-12-31'), ['2026-02-28', '2027-02-28', '2028-02-29']);
  assert.deepEqual(olusumlar('2026-11-05', 'yok', '2026-11-01', '2026-11-30'), ['2026-11-05']);
  assert.deepEqual(olusumlar('2026-12-05', 'yok', '2026-11-01', '2026-11-30'), []);
  assert.deepEqual(olusumlar('2027-01-10', 'yil', '2026-01-01', '2026-12-31'), []);
});

test('takvimOlaylari: ay ızgarası aralığında özel gün, doğum günü, taş ve ilk gün', () => {
  const gunler = [
    doc('aylik', { baslik: 'Ayımız', tarih: '2026-08-15', tekrar: 'ay', tur: 'ozel', emoji: '🌙' }),
    doc('tek', { baslik: 'Sinema', tarih: '2026-11-07', tekrar: 'yok', tur: 'plan' }),
  ];
  const m = takvimOlaylari({ gunler, kisiler, baslangic: '2026-08-01', from: '2026-10-26', to: '2026-12-06', bugun: BUGUN });
  assert.equal(m['2026-11-15'][0].baslik, 'Ayımız');
  assert.equal(m['2026-11-15'][0].ek, '3. ay');
  assert.equal(m['2026-11-07'][0].baslik, 'Sinema');
  assert.equal(m['2026-11-02'][0].baslik, "Ömer'in doğum günü");
  assert.equal(m['2026-11-08'][0].baslik, '100. günümüz');
  assert.ok(m['2026-11-01'].some((x) => x.baslik === '3. ayımız'));
  assert.equal(m['2026-08-01'], undefined); // aralık dışı
  const ilk = takvimOlaylari({ baslangic: '2026-08-01', from: '2026-07-27', to: '2026-09-06', bugun: BUGUN });
  assert.equal(ilk['2026-08-01'][0].baslik, 'İlk günümüz');
  assert.equal(ilk['2026-08-01'][0].daysLeft, -90);
});

test('tasZaman: geçmişler kutlandı, bugün, gelecekten 3 tane', () => {
  const z = tasZaman('2024-01-01', '2026-01-01');
  assert.equal(z[0].baslik, 'İlk günümüz');
  assert.equal(z[0].durum, 'gecti');
  const yil2 = z.find((x) => x.tur === 'yil' && x.n === 2);
  assert.equal(yil2.durum, 'bugun');
  assert.ok(z.some((x) => x.baslik === '100. günümüz' && x.durum === 'gecti'));
  assert.ok(!z.some((x) => x.baslik === '50. günümüz')); // küçük taşlar çizelgede yok
  assert.equal(z.filter((x) => x.durum === 'gelecek').length, 3);
  assert.deepEqual(tasZaman('2027-01-01', BUGUN), []);
  assert.deepEqual(tasZaman(null, BUGUN), []);
});

test('hatirlatmalar: 60 gün, 09:00 yerel, seçilen önceden günler', () => {
  const simdi = new Date(2026, 9, 30, 10, 0); // 30 Ekim 10:00 (bugünün 09:00'ı geçti)
  const gunler = [
    doc('g1', { baslik: 'İlk buluşma', tarih: '2023-11-10', tekrar: 'yil', tur: 'yildonumu', emoji: '☕', hatirlat: [0, 1, 7] }),
    doc('g2', { baslik: 'Bugünkü', tarih: '2026-10-30', tekrar: 'yok', tur: 'plan', hatirlat: [0] }),
    doc('g3', { baslik: 'Uzak', tarih: '2027-06-01', tekrar: 'yok', tur: 'plan', hatirlat: [0] }),
    doc('g4', { baslik: 'Sessiz', tarih: '2026-11-20', tekrar: 'yok', tur: 'plan', hatirlat: [] }),
  ];
  const h = hatirlatmalar({ gunler, kisiler, baslangic: '2026-08-01', simdi });
  const ids = h.map((x) => x.id);
  assert.ok(ids.includes('g1_2026-11-10_0'));
  assert.ok(ids.includes('g1_2026-11-10_1'));
  assert.ok(ids.includes('g1_2026-11-10_7'));
  assert.ok(!ids.some((id) => id.startsWith('g2'))); // bugünün 09:00'ı geçti
  assert.ok(!ids.some((id) => id.startsWith('g3'))); // 60 günden uzak
  assert.ok(!ids.some((id) => id.startsWith('g4'))); // hatırlatma seçilmedi
  assert.ok(ids.includes('dogum-omer-id_2026-11-02_1'));
  assert.ok(ids.includes('tas_2026-11-08'));
  const r = h.find((x) => x.id === 'g1_2026-11-10_1');
  assert.equal(r.zaman, new Date(2026, 10, 9, 9, 0).toISOString());
  assert.equal(r.baslik, 'Yarın: İlk buluşma ☕');
  assert.equal(h.find((x) => x.id === 'g1_2026-11-10_0').metin, '3. yıl dönümü, kutlu olsun 💗');
  for (let i = 1; i < h.length; i++) assert.ok(h[i - 1].zaman <= h[i].zaman);
  assert.ok(h.length <= 64);
});

test('hatirlatmalar: hatirlat alanı yoksa gününde; aylıkta her ay', () => {
  const simdi = new Date(2026, 9, 30, 8, 0);
  const h = hatirlatmalar({ gunler: [doc('m', { baslik: 'Ay', tarih: '2026-01-05', tekrar: 'ay' })], simdi });
  assert.deepEqual(h.map((x) => x.id), ['m_2026-11-05_0', 'm_2026-12-05_0']);
});

test('kutlamaGerekli: günde bir kez', () => {
  assert.equal(kutlamaGerekli(null, BUGUN, 1), true);
  assert.equal(kutlamaGerekli(BUGUN, BUGUN, 2), false);
  assert.equal(kutlamaGerekli('2026-10-29', BUGUN, 1), true);
  assert.equal(kutlamaGerekli(null, BUGUN, 0), false);
});

test('gunDogrula: zorunlu alanlar, sınırlar, tek seferlik geçmiş', () => {
  const bos = gunDogrula({}, { bugun: BUGUN });
  assert.ok(bos.hatalar.baslik);
  assert.ok(bos.hatalar.tarih);
  const uzun = gunDogrula({ baslik: 'x'.repeat(61), tarih: '2026-11-01', not: 'y'.repeat(301) }, { bugun: BUGUN });
  assert.ok(uzun.hatalar.baslik && uzun.hatalar.not);
  const gecmis = gunDogrula({ baslik: 'A', tarih: '2026-10-01', tekrar: 'yok' }, { bugun: BUGUN });
  assert.ok(gecmis.hatalar.tarih);
  assert.deepEqual(gunDogrula({ baslik: 'A', tarih: '2026-10-01', tekrar: 'yok' }, { bugun: BUGUN, yeni: false }).hatalar, {});
  assert.ok(gunDogrula({ baslik: 'A', tarih: '1800-01-01' }, { bugun: BUGUN }).hatalar.tarih);
  const ok = gunDogrula({ baslik: '  İlk   öpücük ', tarih: '2024-02-14', tekrar: 'yil', tur: 'yildonumu', emoji: '💋', hatirlat: [7, 0, 0, 3], not: ' ' }, { bugun: BUGUN });
  assert.deepEqual(ok.hatalar, {});
  assert.deepEqual(ok.data, { baslik: 'İlk öpücük', tarih: '2024-02-14', tekrar: 'yil', tur: 'yildonumu', emoji: '💋', hatirlat: [0, 7] });
  const vars = gunDogrula({ baslik: 'B', tarih: '2027-01-01', tekrar: 'zz', tur: 'qq' }, { bugun: BUGUN }).data;
  assert.deepEqual([vars.tekrar, vars.tur, vars.emoji], ['yil', 'ozel', '💗']);
});

test('buluşma: ISO dönüşümü ve doğrulama', () => {
  const iso = bulusmaIso('2026-11-01', '19:30');
  assert.equal(iso, new Date(2026, 10, 1, 19, 30).toISOString());
  assert.deepEqual(isoParcala(iso), { tarih: '2026-11-01', saat: '19:30' });
  assert.equal(bulusmaIso('2026-11-01', '25:00'), null);
  assert.equal(isoParcala('x'), null);
  const simdi = new Date(2026, 9, 30, 12, 0);
  assert.equal(bulusmaDogrula('', '10:00', simdi).hata, 'Bir tarih seç.');
  assert.ok(bulusmaDogrula('2026-10-30', '11:00', simdi).hata);
  assert.equal(bulusmaDogrula('2026-10-30', '', simdi).iso, new Date(2026, 9, 30, 20, 0).toISOString());
});

test('metin biçimleri (tr-TR)', () => {
  assert.equal(tarihYazi('2026-11-01', BUGUN), '1 Kasım Pazar');
  assert.equal(tarihYazi('2027-02-14', BUGUN), '14 Şubat 2027 Pazar');
  assert.equal(tarihYazi('2027-02-14', BUGUN, { haftaGunu: false }), '14 Şubat 2027');
  assert.equal(ayBasligi(2026, 10), 'Ekim 2026');
  assert.deepEqual(haftaGunleri(), ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']);
  assert.deepEqual(ayKaydir(2026, 12, 1), { y: 2027, m: 1 });
  assert.deepEqual(ayKaydir(2026, 1, -1), { y: 2025, m: 12 });
  assert.equal(sureYazi({ years: 1, months: 0, days: 2 }), '1 yıl, 2 gün');
  assert.equal(sureYazi({}), '');
  assert.equal(oneriler(BUGUN)[3].tarih, '2026-02-14');
  assert.equal(oneriler(BUGUN)[3].etiket, 'Sevgililer Günü (14 Şubat)');
  assert.deepEqual([kalanYazi(0), kalanYazi(1), kalanYazi(5), kalanYazi(-1), kalanYazi(-90)],
    ['Bugün', 'Yarın', '5 gün kaldı', 'Dün', '90 gün önce']);
});
