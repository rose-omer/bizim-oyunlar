import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AY_ADLARI, gunYazi, aramaMetni, filtrele, zamanCizelgesi, buGunGecmisYillar, buGunBasligi,
  tumEtiketler, yillar, albumFotolari, etiketTemizle, etiketEkle, aniDogrula, aniVerisi,
  fotoTasi, fotoKaldir, formParametreleri, begeniYamasi, aniYamasi, begeniSayisi, begenGoster, MAX_FOTO, fotoTaslagi,
} from '../sayfalar/anilar/mantik.js';

let seq = 0;
const ani = (data, extra = {}) => ({
  id: `a${++seq}`,
  author: 'omer',
  created_at: `2026-01-01T00:00:${String(seq).padStart(2, '0')}Z`,
  updated_at: '2026-01-01T00:00:00Z',
  data: { fotolar: [], ...data },
  ...extra,
});

test('gunYazi Türkçe ay adıyla yazar; geçersizde boş', () => {
  assert.equal(AY_ADLARI.length, 12);
  assert.equal(gunYazi('2025-10-12'), '12 Ekim 2025');
  assert.equal(gunYazi('2026-02-01', { yil: false }), '1 Şubat');
  assert.equal(gunYazi('2026-13-01'), '');
  assert.equal(gunYazi(undefined), '');
});

test('aramaMetni Türkçe küçük harfe çevirir (İ → i, I → ı)', () => {
  assert.equal(aramaMetni('  İZMİR Işıkları '), 'izmir ışıkları');
});

test('filtrele: etiket, yıl ve arama birlikte çalışır', () => {
  const a = ani({ baslik: 'İzmir gezisi', tarih: '2025-07-04', yer: 'Alsancak', etiketler: ['Tatil', 'deniz'] });
  const b = ani({ baslik: 'İlk sinema', tarih: '2024-02-14', not: 'Patlamış mısır', etiketler: ['ilk'] });
  const c = ani({ baslik: 'Kahvaltı', tarih: '2025-03-01', etiketler: ['tatil'] });
  const docs = [a, b, c];
  assert.deepEqual(filtrele(docs, {}).map((d) => d.id), [a.id, b.id, c.id]);
  assert.deepEqual(filtrele(docs, { etiket: 'TATİL' }).map((d) => d.id), [a.id, c.id]);
  assert.deepEqual(filtrele(docs, { yil: 2025 }).map((d) => d.id), [a.id, c.id]);
  assert.deepEqual(filtrele(docs, { yil: '2024' }).map((d) => d.id), [b.id]);
  assert.deepEqual(filtrele(docs, { ara: 'izmir' }).map((d) => d.id), [a.id]);
  assert.deepEqual(filtrele(docs, { ara: 'alsancak' }).map((d) => d.id), [a.id]);
  assert.deepEqual(filtrele(docs, { ara: 'mısır' }).map((d) => d.id), [b.id]);
  assert.deepEqual(filtrele(docs, { ara: 'deniz' }).map((d) => d.id), [a.id]);
  assert.deepEqual(filtrele(docs, { etiket: 'tatil', yil: 2025, ara: 'kahv' }).map((d) => d.id), [c.id]);
});

test('zamanCizelgesi: yıl → ay, yeniden eskiye; aynı günde son eklenen önce', () => {
  const a = ani({ baslik: 'A', tarih: '2025-07-04' });
  const b = ani({ baslik: 'B', tarih: '2024-02-14' });
  const c = ani({ baslik: 'C', tarih: '2025-07-20' });
  const d = ani({ baslik: 'D', tarih: '2025-01-02' });
  const e = ani({ baslik: 'E', tarih: '2025-07-20' }); // c'den sonra eklendi
  const bozuk = ani({ baslik: 'Tarihsiz' });
  const out = zamanCizelgesi([a, b, c, d, e, bozuk]);
  assert.deepEqual(out.map((y) => y.yil), [2025, 2024]);
  assert.deepEqual(out[0].aylar.map((m) => [m.ay, m.ad]), [[7, 'Temmuz'], [1, 'Ocak']]);
  assert.deepEqual(out[0].aylar[0].anilar.map((x) => x.data.baslik), ['E', 'C', 'A']);
  assert.equal(out[0].sayi, 4);
  assert.deepEqual(out[1].aylar[0].anilar.map((x) => x.data.baslik), ['B']);
  assert.deepEqual(zamanCizelgesi([]), []);
});

test('buGunGecmisYillar: aynı gün-ay, geçmiş yıllar; yakın yıl önce', () => {
  const a = ani({ baslik: 'Geçen yıl', tarih: '2025-10-30' });
  const b = ani({ baslik: 'Üç yıl', tarih: '2023-10-30' });
  const bugunEklenen = ani({ baslik: 'Bugün', tarih: '2026-10-30' });
  const baskaGun = ani({ baslik: 'Dün', tarih: '2025-10-29' });
  const out = buGunGecmisYillar([b, a, bugunEklenen, baskaGun], '2026-10-30');
  assert.deepEqual(out.map((x) => [x.yilOnce, x.ani.data.baslik]), [[1, 'Geçen yıl'], [3, 'Üç yıl']]);
  assert.equal(buGunBasligi(1), 'Geçen yıl bugün');
  assert.equal(buGunBasligi(4), '4 yıl önce bugün');
});

test('buGunGecmisYillar: 29 Şubat anısı artık olmayan yılda 28 Şubat günü gelir', () => {
  const a = ani({ baslik: 'Artık gün', tarih: '2024-02-29' });
  assert.equal(buGunGecmisYillar([a], '2025-02-28').length, 1);
  assert.equal(buGunGecmisYillar([a], '2025-03-01').length, 0);
  assert.equal(buGunGecmisYillar([a], '2028-02-28').length, 0); // 2028 artık: 29'unda gelir
  assert.equal(buGunGecmisYillar([a], '2028-02-29')[0].yilOnce, 4);
  assert.deepEqual(buGunGecmisYillar([a], 'bozuk'), []);
});

test('tumEtiketler ve yillar', () => {
  const docs = [
    ani({ tarih: '2025-01-01', etiketler: ['Tatil', 'deniz'] }),
    ani({ tarih: '2023-05-01', etiketler: ['tatil'] }),
    ani({ tarih: '2025-06-01' }),
  ];
  assert.deepEqual(tumEtiketler(docs), [{ etiket: 'Tatil', sayi: 2 }, { etiket: 'deniz', sayi: 1 }]);
  assert.deepEqual(yillar(docs), [2025, 2023]);
});

test('albumFotolari: yeni anı önce, anı içi sıra korunur', () => {
  const eski = ani({ baslik: 'Eski', tarih: '2024-01-01', fotolar: ['u1', 'u2'] });
  const yeni = ani({ baslik: 'Yeni', tarih: '2025-01-01', fotolar: ['u3'] });
  const out = albumFotolari([eski, yeni]);
  assert.deepEqual(out.map((f) => [f.url, f.aniId, f.sira]), [['u3', yeni.id, 0], ['u1', eski.id, 0], ['u2', eski.id, 1]]);
  assert.equal(out[0].baslik, 'Yeni');
});

test('etiketTemizle ve etiketEkle', () => {
  assert.equal(etiketTemizle('  #Yaz   tatili '), 'Yaz tatili');
  assert.equal(etiketTemizle('#'), '');
  assert.equal(etiketTemizle('a'.repeat(40)).length, 24);
  assert.deepEqual(etiketEkle(['Tatil'], 'TATİL'), ['Tatil']);
  assert.deepEqual(etiketEkle(['Tatil'], ' deniz, '), ['Tatil', 'deniz']);
  assert.deepEqual(etiketEkle([], ''), []);
  const dolu = Array.from({ length: 12 }, (_, i) => `e${i}`);
  assert.equal(etiketEkle(dolu, 'fazla').length, 12);
});

test('aniDogrula: başlık, tarih, fotoğraf sınırı', () => {
  assert.equal(aniDogrula({ baslik: 'Sahil', tarih: '2025-07-04', fotolar: [] }), null);
  assert.match(aniDogrula({ baslik: '  ', tarih: '2025-07-04' }), /başlık/i);
  assert.match(aniDogrula({ baslik: 'x'.repeat(81), tarih: '2025-07-04' }), /başlık/i);
  assert.match(aniDogrula({ baslik: 'Sahil', tarih: '2025-02-30' }), /tarih/i);
  assert.match(aniDogrula({ baslik: 'Sahil', tarih: '2025-07-04', fotolar: Array(MAX_FOTO + 1).fill('u') }), /10/);
  assert.match(aniDogrula({ baslik: 'Sahil', tarih: '2025-07-04', not: 'n'.repeat(2001) }), /not/i);
});

test('aniVerisi: boş alanları atar, beğeniyi ve ilk ekleyeni korur', () => {
  const v = aniVerisi({ baslik: ' Sahil ', tarih: '2025-07-04', yer: ' ', not: ' güzel ', fotolar: ['u'], etiketler: [] }, { begeni: { gul: true } });
  assert.deepEqual(v, { baslik: 'Sahil', tarih: '2025-07-04', not: 'güzel', fotolar: ['u'], begeni: { gul: true } });
  assert.equal(aniVerisi({ baslik: 'a', tarih: '2025-07-04' }, {}, 'omer').ekleyen, 'omer');
  assert.equal(aniVerisi({ baslik: 'a', tarih: '2025-07-04' }, { ekleyen: 'omer' }, 'gul').ekleyen, 'omer');
});

test('fotoTasi ve fotoKaldir yeni dizi döner', () => {
  const l = ['a', 'b', 'c'];
  assert.deepEqual(fotoTasi(l, 0, 1), ['b', 'a', 'c']);
  assert.deepEqual(fotoTasi(l, 2, -1), ['a', 'c', 'b']);
  assert.deepEqual(fotoTasi(l, 0, -1), ['a', 'b', 'c']);
  assert.deepEqual(fotoTasi(l, 2, 1), ['a', 'b', 'c']);
  assert.deepEqual(fotoKaldir(l, 1), ['a', 'c']);
  assert.deepEqual(l, ['a', 'b', 'c']);
});

test('formParametreleri: ?yeni=1&baslik=..&tarih=..', () => {
  assert.deepEqual(formParametreleri('?yeni=1&baslik=Paris%27e%20gittik&tarih=2026-05-01', '2026-10-30'),
    { yeni: true, baslik: "Paris'e gittik", tarih: '2026-05-01' });
  assert.deepEqual(formParametreleri('?yeni=1&tarih=bozuk', '2026-10-30'), { yeni: true, baslik: '', tarih: '2026-10-30' });
  assert.equal(formParametreleri('?yerel=1', '2026-10-30').yeni, false);
  assert.equal(formParametreleri(`?yeni=1&baslik=${'x'.repeat(200)}`, '2026-10-30').baslik.length, 80);
});

test('begeniYamasi aç/kapa yalnız kendi alanım; begeniSayisi', () => {
  assert.deepEqual(begeniYamasi(undefined, 'omer'), { 'begeni.omer': true });
  assert.deepEqual(begeniYamasi({ gul: true }, 'omer'), { 'begeni.omer': true });
  assert.deepEqual(begeniYamasi({ omer: true, gul: true }, 'omer'), { 'begeni.omer': null });
  assert.equal(begeniSayisi({ omer: true, gul: true }), 2);
  assert.equal(begeniSayisi(null), 0);
});

test('begenGoster: kendi anında "Beğen" yok; önceden beğendiysen geri alabilsin; ekleyen bilinmiyorsa var', () => {
  assert.equal(begenGoster({ ekleyen: 'omer' }, 'omer'), false);
  assert.equal(begenGoster({ ekleyen: 'omer', begeni: { gul: true } }, 'omer'), false);
  assert.equal(begenGoster({ ekleyen: 'omer', begeni: { omer: true } }, 'omer'), true);
  assert.equal(begenGoster({ ekleyen: 'gul' }, 'omer'), true);
  assert.equal(begenGoster({}, 'omer'), true);
  assert.equal(begenGoster(null, 'omer'), true);
});

test('aniYamasi: yalnız form alanları, boşlar null, beğeni yok, ekleyen eksikse', () => {
  const form = { baslik: ' Sahil ', tarih: '2025-07-04', yer: ' ', not: ' güzel ', fotolar: ['u'], etiketler: [] };
  assert.deepEqual(aniYamasi(form, { ekleyen: 'omer', begeni: { gul: true } }, 'gul'),
    { baslik: 'Sahil', tarih: '2025-07-04', yer: null, not: 'güzel', fotolar: ['u'], etiketler: null });
  const y = aniYamasi({ ...form, yer: 'Kaş', etiketler: ['tatil'] }, {}, 'gul');
  assert.equal(y.ekleyen, 'gul');
  assert.equal(y.yer, 'Kaş');
  assert.deepEqual(y.etiketler, ['tatil']);
  assert.equal('begeni' in y, false);
});

test('onizlemeBoyu: kısa kenar ya da uzun kenar sınırına oranla küçültür; küçük fotoğraf aynen kalır', async () => {
  const { onizlemeBoyu } = await import('../sayfalar/anilar/mantik.js');
  assert.deepEqual(onizlemeBoyu(2000, 1500, { kisa: 480 }), { en: 640, boy: 480, kucult: true });
  assert.deepEqual(onizlemeBoyu(1500, 2000, { kisa: 480 }), { en: 480, boy: 640, kucult: true });
  assert.deepEqual(onizlemeBoyu(2000, 1500, { uzun: 960 }), { en: 960, boy: 720, kucult: true });
  assert.deepEqual(onizlemeBoyu(2000, 500, { kisa: 480, uzun: 1200 }), { en: 1200, boy: 300, kucult: true });
  // Hedefe yakın (≤ %20 büyük) fotoğraf yeniden kodlanmaz.
  assert.deepEqual(onizlemeBoyu(560, 420, { kisa: 480 }), { en: 560, boy: 420, kucult: false });
  assert.deepEqual(onizlemeBoyu(300, 200, { kisa: 480 }), { en: 300, boy: 200, kucult: false });
  assert.deepEqual(onizlemeBoyu(0, 0, { kisa: 480 }), { en: 0, boy: 0, kucult: false });
});

test('fotoTaslagi: yalnız ?taslak=1 ile; bozuk kayıt ve sınır aşımı güvenli', () => {
  const kayit = JSON.stringify({ fotolar: ['a', 'b', 3, ''], not: 'kahve' });
  assert.deepEqual(fotoTaslagi('?yeni=1&taslak=1', kayit), { fotolar: ['a', 'b'], not: 'kahve' });
  assert.equal(fotoTaslagi('?yeni=1', kayit), null);
  assert.equal(fotoTaslagi('?taslak=1', null), null);
  assert.equal(fotoTaslagi('?taslak=1', '{bozuk'), null);
  assert.equal(fotoTaslagi('?taslak=1', '{"fotolar":"a"}'), null);
  const cok = JSON.stringify({ fotolar: Array.from({ length: MAX_FOTO + 3 }, (_, i) => String(i)) });
  assert.equal(fotoTaslagi('?taslak=1', cok).fotolar.length, MAX_FOTO);
});
