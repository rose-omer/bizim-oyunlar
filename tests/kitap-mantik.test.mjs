// Anı Kitabı: saf hesap (aylara göre anılar, seçilmiş mesajlar, özel günler, kapak/kapanış, yazdırma yolu).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  KITAP_FOTO, UZUN_MESAJ, YILDIZ_SINIRI, kitapAnilari, kitapFotolari, seciliMesajlar, kitapOzelGunleri,
  kapakSatiri, kapanisSatiri, yazdirmaYolu, kitapParametreleri,
} from '../sayfalar/yilimiz/kitap-mantik.js';

const at = (y, mo, d, h = 12) => new Date(y, mo - 1, d, h).toISOString();
const ani = (id, tarih, data = {}, created = at(2026, 1, 1)) => ({ id, data: { baslik: id, tarih, fotolar: [], ...data }, created_at: created });
const mesaj = (id, iso, kimden, data = {}) => ({ id, author: kimden, data: { kimden, ...data }, created_at: iso });
const KISILER = [{ id: 'ali', ad: 'Ömer' }, { id: 'ayse', ad: 'Gül' }];

test('kitapAnilari: yalnız o yıl, aylara göre eskiden yeniye; fotoğraf sınırı', () => {
  const docs = [
    ani('c', '2026-03-10'),
    ani('a', '2026-01-05', { yer: 'Kadıköy', not: 'İlk kahve', fotolar: ['local:1', 'local:2', 'local:3', 'local:4', 'local:5', 42] }),
    ani('b', '2026-03-02', {}, at(2026, 3, 2)),
    ani('b2', '2026-03-02', {}, at(2026, 3, 1)),
    ani('eski', '2025-12-31'),
    ani('bozuk', 'yok'),
  ];
  const aylar = kitapAnilari(docs, 2026);
  assert.deepEqual(aylar.map((m) => [m.ay, m.ad, m.anilar.map((x) => x.id)]), [
    [1, 'Ocak', ['a']],
    [3, 'Mart', ['b2', 'b', 'c']],
  ]);
  const a = aylar[0].anilar[0];
  assert.equal(a.tarihYazi, '5 Ocak');
  assert.equal(a.yer, 'Kadıköy');
  assert.equal(a.not, 'İlk kahve');
  assert.equal(KITAP_FOTO, 4);
  assert.deepEqual(a.fotolar, ['local:1', 'local:2', 'local:3', 'local:4']);
  assert.equal(aylar[1].anilar[0].baslik, 'b2');
  assert.deepEqual(kitapAnilari([], 2026), []);
});

test('kitapAnilari: başlıksız anı', () => {
  const [m] = kitapAnilari([ani('x', '2026-05-01', { baslik: '  ' })], 2026);
  assert.equal(m.anilar[0].baslik, 'Bir anı');
});

test('kitapFotolari: tekil adresler, sırayla', () => {
  const aylar = kitapAnilari([
    ani('a', '2026-01-05', { fotolar: ['local:1', 'local:2'] }),
    ani('b', '2026-02-05', { fotolar: ['local:2', 'local:3'] }),
  ], 2026);
  assert.deepEqual(kitapFotolari(aylar), ['local:1', 'local:2', 'local:3']);
});

test('seciliMesajlar: yıldızlılar varsa onlar, eskiden yeniye; adlar', () => {
  const docs = [
    mesaj('m1', at(2026, 2, 1), 'ali', { metin: 'Çok uzun bir mesaj ama yıldızsız, seçilmemeli.' }),
    mesaj('m2', at(2026, 3, 1), 'ayse', { metin: 'Seni seviyorum', yildiz: { ali: true } }),
    mesaj('m3', at(2026, 1, 9), 'ali', { metin: 'Günaydın', yildiz: { ayse: true, ali: null } }),
    mesaj('m4', at(2026, 4, 1), 'ali', { metin: 'Kaldırıldı', yildiz: { ali: null } }),
    mesaj('m5', at(2025, 4, 1), 'ali', { metin: 'Geçen yıl', yildiz: { ali: true } }),
    mesaj('m6', at(2026, 5, 1), 'ali', { foto: 'local:9', yildiz: { ali: true } }),
  ];
  const r = seciliMesajlar(docs, 2026, { kisiler: KISILER });
  assert.equal(r.tur, 'yildiz');
  assert.deepEqual(r.mesajlar.map((m) => m.id), ['m3', 'm2']);
  assert.deepEqual(r.mesajlar[0], { id: 'm3', metin: 'Günaydın', ad: 'Ömer', tarih: '2026-01-09', tarihYazi: '9 Ocak' });
  assert.equal(r.mesajlar[1].ad, 'Gül');
});

test('seciliMesajlar: yıldız yoksa en uzun 10, eskiden yeniye; boş metin atlanır', () => {
  const docs = [];
  for (let i = 1; i <= 14; i++) docs.push(mesaj(`m${i}`, at(2026, 1, i), i % 2 ? 'ali' : 'ayse', { metin: 'a'.repeat(i) }));
  docs.push(mesaj('bos', at(2026, 2, 1), 'ali', { metin: '   ' }));
  const r = seciliMesajlar(docs, 2026, { kisiler: KISILER });
  assert.equal(UZUN_MESAJ, 10);
  assert.equal(r.tur, 'uzun');
  assert.deepEqual(r.mesajlar.map((m) => m.id), ['m5', 'm6', 'm7', 'm8', 'm9', 'm10', 'm11', 'm12', 'm13', 'm14']);
  assert.deepEqual(seciliMesajlar([], 2026), { tur: null, mesajlar: [] });
});

test('seciliMesajlar: yıldız sınırı, tanınmayan gönderen', () => {
  const docs = [];
  for (let i = 0; i < YILDIZ_SINIRI + 5; i++) docs.push(mesaj(`y${i}`, new Date(2026, 0, 1, 0, i).toISOString(), 'x', { metin: 'hey', yildiz: { x: true } }));
  const r = seciliMesajlar(docs, 2026, { kisiler: KISILER });
  assert.equal(r.mesajlar.length, YILDIZ_SINIRI);
  assert.equal(r.mesajlar[0].id, 'y0');
  assert.equal(r.mesajlar[0].ad, '');
});

test('kitapOzelGunleri: o yılın günleri, doğum günleri ve taşları; ay dönümü yok; bugünden sonrası yok', () => {
  const gunler = [
    { id: 'g1', data: { baslik: 'Tanıştığımız gün', tarih: '2024-06-10', tekrar: 'yil', tur: 'yildonumu', emoji: '💞' } },
    { id: 'g2', data: { baslik: 'Aylık', tarih: '2025-01-03', tekrar: 'ay', tur: 'ozel', emoji: '💗' } },
    { id: 'g3', data: { baslik: 'Konser', tarih: '2026-02-14', tekrar: 'yok', tur: 'plan', emoji: '🎵' } },
    { id: 'g4', data: { baslik: 'Kasım planı', tarih: '2026-11-20', tekrar: 'yok', tur: 'plan', emoji: '📌' } },
  ];
  const kisiler = [{ id: 'ali', data: { ad: 'Ömer', dogum: '1998-04-02' } }];
  const r = kitapOzelGunleri({ gunler, kisiler, baslangic: '2025-03-01', yil: 2026, bugun: '2026-10-31' });
  assert.deepEqual(r.map((x) => [x.date, x.baslik]), [
    ['2026-02-14', 'Konser'],
    ['2026-02-28', '365. günümüz'],
    ['2026-03-01', '1. yıl dönümümüz'],
    ['2026-04-02', "Ömer'in doğum günü"],
    ['2026-04-04', '400. günümüz'],
    ['2026-06-10', 'Tanıştığımız gün'],
    ['2026-07-13', '500. günümüz'],
    ['2026-10-21', '600. günümüz'],
  ]);
  assert.equal(r[2].emoji, '💞');
  assert.equal(r[3].ek, '28. yaş');
  assert.equal(r[5].ek, '2. yıl dönümü');
  assert.equal(r[0].tarihYazi, '14 Şubat');
  assert.ok(r.every((x) => x.key));
});

test('kitapOzelGunleri: geçmiş yıl tümü; gelecek yıl boş', () => {
  const gunler = [{ id: 'g', data: { baslik: 'Yılbaşı', tarih: '2024-12-31', tekrar: 'yil', tur: 'ozel', emoji: '✨' } }];
  assert.deepEqual(kitapOzelGunleri({ gunler, yil: 2025, bugun: '2026-10-31' }).map((x) => x.date), ['2025-12-31']);
  assert.deepEqual(kitapOzelGunleri({ gunler, yil: 2027, bugun: '2026-10-31' }), []);
});

test('kapakSatiri ve kapanisSatiri', () => {
  const ozet = (o = {}) => ({
    buYil: true, birlikteGun: 304,
    ani: { sayi: 12 }, mesaj: { sayi: 3402 }, oyun: { toplam: 0 }, dokunus: { sayi: 5 }, ...o,
  });
  assert.equal(kapakSatiri(ozet()), 'Bu yıl 304 gün birlikte');
  assert.equal(kapakSatiri(ozet({ buYil: false })), '304 gün birlikte');
  assert.equal(kapakSatiri(ozet({ birlikteGun: 0 })), null);
  assert.equal(kapanisSatiri(ozet()), 'Bu yıl 12 anı, 3.402 mesaj ve 5 dokunuş biriktirdiniz.');
  assert.equal(kapanisSatiri(ozet({ buYil: false, mesaj: { sayi: 0 }, dokunus: { sayi: 0 } })), 'O yıl 12 anı biriktirdiniz.');
  assert.equal(kapanisSatiri(ozet({ ani: { sayi: 0 }, mesaj: { sayi: 0 }, dokunus: { sayi: 0 } })), null);
});

test('yazdirmaYolu: uygulamada (WebView) ya da print yoksa dışarı aç', () => {
  assert.equal(yazdirmaYolu({ native: false, printVar: true }), 'yazdir');
  assert.equal(yazdirmaYolu({ native: true, printVar: true }), 'disari');
  assert.equal(yazdirmaYolu({ native: false, printVar: false }), 'disari');
});

test('kitapParametreleri', () => {
  assert.deepEqual(kitapParametreleri('?kitap=1&yil=2025&yerel=1'), { kitap: true, yil: 2025 });
  assert.deepEqual(kitapParametreleri('?yerel=1'), { kitap: false, yil: null });
  assert.deepEqual(kitapParametreleri('?kitap=1&yil=abc'), { kitap: true, yil: null });
});
