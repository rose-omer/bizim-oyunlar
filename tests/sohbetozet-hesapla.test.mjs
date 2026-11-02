// Sohbet Özetimiz: özet hesabı. Örnek mesajlar uydurmadır (kısa, nötr).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ayristir } from '../sayfalar/sohbet-ozeti/ayristir.js';
import {
  hesapla, hesaplaParcali, kucult, sade, gulmeMi, muahMi, emojiler, taraflar, boyutaSigdir, BOYUT_SINIRI,
} from '../sayfalar/sohbet-ozeti/hesapla.js';
import { byteSize, MAX_BYTES } from '../js/core/veri.js';
import { YEDEK_TURLERI } from '../sayfalar/ayarlar/mantik.js';

const A = 'id-ali';
const B = 'id-ayse';
const ES = { Ali: A, 'Ayşe': B };
const m = (y, mo, d, h, mi, kim, metin, s = 0) => ({ t: new Date(y, mo - 1, d, h, mi, s), kim, m: metin });
const ayr = (mesajlar, ek = {}) => ({ bicim: 'android', saniye: false, aramalar: [], mesajlar, ...ek });
const SIMDI = new Date('2026-01-01T00:00:00Z');

test('yedek türü kayıtlı', () => {
  assert.ok(YEDEK_TURLERI.includes('sohbetozet'));
});

test('metin yardımcıları: küçültme, uzatma, sadeleştirme', () => {
  assert.equal(kucult('ÇOKKKK GÜZEL'), 'çok güzel');
  assert.equal(kucult('IŞIK İyi'), 'ışık iyi');
  assert.equal(sade('aşkım'), 'askim');
  for (const k of ['hahaha', 'hehe', 'dndjdj', 'sjsj', 'kdkd', 'ahahah', 'jajaja']) assert.ok(gulmeMi(k), k);
  for (const k of ['merhaba', 'tamam', 'kitap', 'hafta']) assert.ok(!gulmeMi(k), k);
  for (const k of ['muah', 'muack', 'muahh', 'muaww', 'muawwh']) assert.ok(muahMi(k), k);
  assert.ok(!muahMi('mutfak'));
  assert.deepEqual(emojiler('😂👍🏽❤️❤'), ['😂', '👍', '❤', '❤']);
});

test('temel sayımlar: mesaj, günler, aylık, saat, haftanın günü, ilk mesaj', () => {
  const o = hesapla(ayr([
    m(2025, 4, 7, 9, 0, 'Ali', 'günaydın'),       // Pazartesi
    m(2025, 4, 7, 9, 1, 'Ayşe', 'günaydın, nasılsın?'),
    m(2025, 4, 8, 23, 0, 'Ali', 'iyi geceler'),
    m(2025, 4, 10, 2, 30, 'Ayşe', 'uyuyamadım'),
    m(2025, 4, 10, 2, 31, 'Biri', 'grup mesajı'), // eşlemede yok: atlanır
  ]), ES, { yukleyen: A, simdi: SIMDI });
  assert.equal(o.v, 1);
  assert.equal(o.yukleyen, A);
  assert.equal(o.at, SIMDI.toISOString());
  assert.deepEqual(o.kaynak, { bicim: 'android', ilk: '2025-04-07', son: '2025-04-10', mesaj: 4, gun: 4, konusulanGun: 3, medyaTuru: false, saniye: false });
  assert.deepEqual(o.ilkMesaj, { kim: A, gun: '2025-04-07' });
  assert.deepEqual(o.gunluk, { '2025-04-07': 2, '2025-04-08': 1, '2025-04-10': 1 });
  assert.deepEqual(o.aylik, { '2025-04': { [A]: 2, [B]: 2 } });
  assert.equal(o.saat[A][9], 1);
  assert.equal(o.saat[B][2], 1);
  assert.equal(o.haftaGunu[A][0], 1); // Pzt
  assert.equal(o.haftaGunu[A][1], 1); // Salı
  assert.deepEqual(o.enYogunGunler[0], ['2025-04-07', 2]);
  assert.equal(o.kisi[B].gece, 1);
  assert.equal(o.kisi[B].soru, 1);
  assert.equal(o.kisi[A].soz.gunaydin, 1);
  assert.equal(o.kisi[A].soz.iyiGeceler, 1);
  assert.equal(o.sessizlik.sessizGun, 1);
  assert.equal(o.arama, null);
});

test('en hızlı sohbet: 30 dakikadan kısa sohbet (tek dakikalık medya yığını) sayılmaz', () => {
  const l = [];
  for (let i = 0; i < 40; i++) l.push(m(2025, 6, 1, 10, 0, 'Ali', '<Media omitted>'));
  for (let i = 0; i < 60; i++) l.push(m(2025, 6, 2, 20, i, i % 2 ? 'Ali' : 'Ayşe', 'selam'));
  const o = hesapla(ayr(l), ES);
  assert.deepEqual(o.sohbet.enHizli, { dk: 59, mesaj: 60, bas: new Date(2025, 5, 2, 20, 0).toISOString() });
});

test('seriler: en uzun ve güncel kesintisiz gün', () => {
  const l = [];
  for (const d of [1, 2, 3, 4, 6, 7]) l.push(m(2025, 5, d, 12, 0, 'Ali', 'selam'));
  const o = hesapla(ayr(l), ES);
  assert.deepEqual(o.seri.enUzun, { gun: 4, bas: '2025-05-01', bit: '2025-05-04' });
  assert.equal(o.seri.guncel, 2);
});

test('sohbetler, sessizlik, sohbet açma', () => {
  const o = hesapla(ayr([
    m(2025, 5, 1, 10, 0, 'Ali', 'a'),
    m(2025, 5, 1, 10, 20, 'Ayşe', 'b'),
    m(2025, 5, 1, 10, 45, 'Ali', 'c'),   // 25 dk: aynı sohbet
    m(2025, 5, 1, 12, 0, 'Ayşe', 'd'),   // 75 dk: yeni sohbet
    m(2025, 5, 1, 18, 0, 'Ayşe', 'e'),   // 6 saat: yeni sohbet, sohbet açma
  ]), ES);
  assert.equal(o.sohbet.sayi, 3);
  assert.deepEqual(o.sohbet.enUzun, { dk: 45, mesaj: 3, bas: new Date(2025, 4, 1, 10, 0).toISOString() });
  assert.equal(o.sohbet.enHizli, null); // 30 mesajdan kısa sohbet sayılmaz
  assert.equal(o.sessizlik.enUzunSaat, 6);
  assert.equal(o.sessizlik.bas, new Date(2025, 4, 1, 12, 0).toISOString());
  assert.equal(o.kisi[B].sohbetAcma, 1);
});

test('cevap süresi, aynı dakika, en uzun bekletme, art arda', () => {
  const o = hesapla(ayr([
    m(2025, 5, 1, 10, 0, 'Ali', 'a'),
    m(2025, 5, 1, 10, 0, 'Ayşe', 'b'),  // aynı dakika, 0 dk
    m(2025, 5, 1, 10, 10, 'Ali', 'c'),  // Ali 10 dk
    m(2025, 5, 1, 10, 40, 'Ali', 'd'),  // art arda (30 dk)
    m(2025, 5, 1, 11, 0, 'Ayşe', 'e'),  // Ayşe 20 dk
    m(2025, 5, 2, 12, 0, 'Ali', 'f'),   // 25 saat: cevap sayılmaz
  ]), ES);
  assert.equal(o.kisi[B].cevapOrtDk, 10);
  assert.equal(o.kisi[B].cevapAyniDk, 50);
  assert.deepEqual(o.kisi[B].enBekletme, { dk: 20, an: new Date(2025, 4, 1, 11, 0).toISOString() });
  assert.equal(o.kisi[A].cevapOrtDk, 10);
  assert.equal(o.kisi[A].artArda, 1);
  assert.equal(o.kisi[A].enUzunSeri.n, 2);
});

test('saniyeli dosyada aynı dakika = 60 sn altı', () => {
  const o = hesapla(ayr([
    m(2025, 5, 1, 10, 0, 'Ali', 'a', 50),
    m(2025, 5, 1, 10, 1, 'Ayşe', 'b', 20), // 30 sn, farklı dakika
  ], { saniye: true }), ES);
  assert.equal(o.kisi[B].cevapAyniDk, 100);
  assert.equal(o.kaynak.saniye, true);
});

test('günün ilki ve sonu 05:00\'te başlar', () => {
  const o = hesapla(ayr([
    m(2025, 5, 1, 8, 0, 'Ali', 'a'),
    m(2025, 5, 1, 23, 0, 'Ayşe', 'b'),
    m(2025, 5, 2, 1, 0, 'Ali', 'c'), // hâlâ 1 Mayıs'ın gecesi
    m(2025, 5, 2, 9, 0, 'Ayşe', 'd'),
  ]), ES);
  assert.equal(o.kisi[A].gununIlk, 1);
  assert.equal(o.kisi[A].gununSon, 1);
  assert.equal(o.kisi[B].gununIlk, 1);
  assert.equal(o.kisi[B].gununSon, 1);
});

test('medya, silinen ve kelimeler; durak ve kısa kelime sıralamaya girmez', () => {
  const o = hesapla(ayr([
    m(2025, 5, 1, 10, 0, 'Ali', '<image omitted>'),
    m(2025, 5, 1, 10, 1, 'Ali', '<sticker omitted>'),
    m(2025, 5, 1, 10, 2, 'Ali', 'This message was deleted'),
    m(2025, 5, 1, 10, 3, 'Ali', 'Kahve içelim mi? Kahve güzel olur ve bu akşam https://ornek.com bakarız'),
    m(2025, 5, 1, 10, 4, 'Ali', 'kahveeee ve kek'),
    m(2025, 5, 1, 10, 5, 'Ayşe', '<Media omitted>'),
  ], { bicim: 'ios' }), ES);
  const a = o.kisi[A];
  assert.deepEqual(a.medya, { foto: 1, cikartma: 1 });
  assert.equal(a.silinen, 1);
  assert.equal(o.kaynak.medyaTuru, true);
  assert.deepEqual(o.kisi[B].medya, { medya: 1 });
  assert.deepEqual(a.kelimeler[0], ['kahve', 3]);
  const sozcukler = a.kelimeler.map((x) => x[0]);
  assert.ok(!sozcukler.includes('ve'));
  assert.ok(!sozcukler.includes('mi'));
  assert.ok(!sozcukler.includes('https'));
  assert.ok(!sozcukler.includes('ornek'));
  assert.ok(sozcukler.includes('kek')); // 3 harf girer
});

test('sayım anahtarı Türkçe harfi sadeleştirir; gösterimde en sık yazım', () => {
  const o = hesapla(ayr([
    m(2025, 5, 1, 10, 0, 'Ali', 'şeker şeker'),
    m(2025, 5, 1, 10, 1, 'Ali', 'seker'),
    m(2025, 5, 1, 10, 2, 'Ali', 'aşkım'),
    m(2025, 5, 1, 10, 3, 'Ali', 'askim'),
  ]), ES);
  assert.deepEqual(o.kisi[A].kelimeler.find((x) => x[1] === 3), ['şeker', 3]);
  assert.equal(o.kisi[A].soz.askim, 2);
});

test('sözler, ilk anları, gülme ve öpücük', () => {
  const o = hesapla(ayr([
    m(2025, 5, 1, 10, 0, 'Ali', 'Seni seviyorummm'),
    m(2025, 5, 1, 10, 1, 'Ayşe', 'ben de sevıyorum 😂😂'),
    m(2025, 5, 2, 10, 0, 'Ayşe', 'özledim canım, muaaah'),
    m(2025, 5, 2, 10, 1, 'Ali', 'dndjdj hahaha muack'),
    m(2025, 5, 2, 10, 2, 'Ali', 'özür dilerim, teşekkür ederim, sağ ol'),
    m(2025, 5, 3, 10, 0, 'Ayşe', 'günoyi bebeğim sevgilim'),
  ]), ES);
  const a = o.kisi[A];
  const b = o.kisi[B];
  assert.equal(a.soz.seviyorum, 1);
  assert.equal(b.soz.seviyorum, 1);
  assert.equal(a.sozIlk.seviyorum, new Date(2025, 4, 1, 10, 0).toISOString());
  assert.equal(b.soz.ozledim, 1);
  assert.equal(b.soz.canim, 1);
  assert.equal(b.soz.muah, 1);
  assert.equal(b.soz.gulme, 2);
  assert.equal(a.soz.gulme, 2);
  assert.equal(a.soz.muah, 1);
  assert.equal(a.soz.ozur, 1);
  assert.equal(a.soz.tesekkur, 2);
  assert.equal(b.soz.gunaydin, 1);
  assert.equal(b.soz.bebegim, 1);
  assert.equal(b.soz.sevgilim, 1);
  assert.equal(b.sozIlk.ozledim, new Date(2025, 4, 2, 10, 0).toISOString());
  assert.equal(a.sozIlk.askim, null);
  assert.ok(!a.kelimeler.some(([k]) => k === 'dndjdj' || k === 'hahaha' || k === 'muack'));
});

test('emoji: mesaj başı en çok 20; ten rengi ayrı sayılmaz; en uzun mesaja sınır yok', () => {
  const kalpler = '❤️'.repeat(13000);
  const o = hesapla(ayr([
    m(2025, 5, 1, 10, 0, 'Ali', kalpler),
    m(2025, 5, 1, 10, 1, 'Ali', '👍🏽 👍 🌸'),
    m(2025, 5, 1, 10, 2, 'Ali', '🌸'),
  ]), ES);
  const e = Object.fromEntries(o.kisi[A].emojiler);
  assert.equal(e['❤'], 20);
  assert.equal(e['👍'], 2);
  assert.equal(e['🌸'], 2);
  assert.equal(o.kisi[A].enUzunMesaj.harf, 26000);
  assert.equal(o.kisi[A].enUzunMesaj.gun, '2025-05-01');
});

test('iPhone: arama sayısı; ayrıştırıcıdan uçtan uca', () => {
  const r = ayristir([
    '[8/9/26, 3:57:40 PM] Ali: selam',
    '[8/9/26, 3:58:00 PM] Ayşe: selam',
    '[8/9/26, 8:06:14 PM] - [Call]',
  ].join('\n'));
  const o = hesapla(r, ES, { yukleyen: B });
  assert.equal(o.arama, 1);
  assert.equal(o.kaynak.bicim, 'ios');
  assert.equal(o.kaynak.mesaj, 2);
});

test('taraflar: bakan kişi önce; özette yoksa yükleyen partnerdir', () => {
  const o = { yukleyen: A, kisi: { [A]: {}, [B]: {} } };
  assert.deepEqual(taraflar(o, A), [A, B]);
  assert.deepEqual(taraflar(o, B), [B, A]);
  const p = { yukleyen: A, kisi: { [A]: {}, partner: {} } };
  assert.deepEqual(taraflar(p, 'yabanci'), ['partner', A]);
});

// 600 günlük, 2 kişilik sentetik veri: belge sınırın altında kalmalı.
function sentetik(gunSayisi, gunlukMesaj = 40) {
  const l = [];
  const sozler = ['bugün işte yoğun bir gün', 'akşam yemekte ne var', 'film izleyelim mi', 'seni seviyorum 😍', 'günaydın ☀️', 'kahve alayım mı', 'yoldayım geliyorum', 'hahaha çok komik 😂', 'iyi geceler 🌙', 'muah'];
  for (let g = 0; g < gunSayisi; g++) {
    for (let i = 0; i < gunlukMesaj; i++) {
      const t = new Date(2024, 0, 1 + g, 7 + Math.floor(i / 3), (i * 7) % 60);
      l.push({ t, kim: i % 2 ? 'Ali' : 'Ayşe', m: `${sozler[(g + i) % sozler.length]} k${(g * 31 + i) % 400}` });
    }
  }
  return ayr(l);
}

test('belge boyu: 600 gün, 2 kişi < 30.000 karakter ve veri.js sınırı altında', () => {
  const uuidA = '0f8fad5b-d9cb-469f-a165-70867728950e';
  const uuidB = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
  const o = hesapla(sentetik(600), { Ali: uuidA, 'Ayşe': uuidB }, { yukleyen: uuidA, simdi: SIMDI });
  const uzunluk = JSON.stringify(o).length;
  console.log(`[sohbetozet] 600 gün belge: ${uzunluk} karakter, ${byteSize(o)} bayt`);
  assert.ok(uzunluk < 30000, `uzunluk ${uzunluk}`);
  assert.ok(byteSize(o) < MAX_BYTES);
  assert.equal(Object.keys(o.gunluk).length, 600);
  assert.equal(o.kaynak.gunlukKesik, undefined);
});

test('çok uzun geçmiş: ısı haritası son günlerle kısalır, sınır aşılmaz', () => {
  const o = hesapla(sentetik(2500, 2), { Ali: 'a'.repeat(36), 'Ayşe': 'b'.repeat(36) });
  assert.ok(JSON.stringify(o).length < BOYUT_SINIRI);
  assert.ok(o.kaynak.gunlukKesik);
  const gunler = Object.keys(o.gunluk);
  assert.equal(gunler[0], o.kaynak.gunlukKesik);
  assert.equal(gunler.at(-1), o.kaynak.son);
  assert.equal(boyutaSigdir({ a: 1, gunluk: {}, kaynak: {} }).a, 1);
});

test('hesaplaParcali: tek seferlik hesapla aynı', async () => {
  const v = sentetik(20);
  const oranlar = [];
  const p = await hesaplaParcali(v, ES, { parca: 100, simdi: SIMDI, ilerleme: (o) => oranlar.push(o), bekle: async () => {} });
  assert.deepEqual(p, hesapla(v, ES, { simdi: SIMDI }));
  assert.equal(oranlar.at(-1), 1);
});

test('hız: 120.000 mesaj hesap 3 sn\'den kısa', () => {
  const v = sentetik(3000, 40);
  const t0 = performance.now();
  hesapla(v, ES);
  const sure = performance.now() - t0;
  assert.ok(sure < 3000, `süre ${sure} ms`);
});
