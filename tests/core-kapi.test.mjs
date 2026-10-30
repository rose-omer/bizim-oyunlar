// Açılış kapısı (js/core/kapi.js): durum → ekran içeriği; bekleyen davet kodu (sekmeye özel).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kapiIcerigi, bekleyenDavet, davetSakla } from '../js/core/kapi.js';

test('kapiIcerigi: her durumun metni, eylemleri ve yoklama aralığı', () => {
  const b = kapiIcerigi('bekliyor');
  assert.equal(b.baslik, 'Onay bekleniyor');
  // "Ayarlar › Cihazlar" satır sonunda bölünmesin: › iki yanında bölünmez boşluk.
  assert.equal(b.metin, "Bu cihaz odaya katılmak için onay bekliyor. Sevgilin kendi telefonunda Ayarlar › Cihazlar'dan onaylasın.");
  assert.deepEqual(b.eylemler, ['kurtarma', 'cik']);
  assert.equal(b.yokla, 5000);

  assert.equal(kapiIcerigi('reddedildi').metin, 'Bu cihazın katılma isteği reddedildi.');
  assert.deepEqual(kapiIcerigi('reddedildi').eylemler, ['cik']);
  assert.equal(kapiIcerigi('cakisma').metin, "Bu cihaz başka bir anahtarla kayıtlı. Kurtarma kodun varsa gir; yoksa sevgilin Ayarlar\u00a0›\u00a0Cihazlar'dan bu cihazın eski kaydını çıkarsın.");
  assert.deepEqual(kapiIcerigi('cakisma').eylemler, ['kurtarma', 'cik']);
  assert.equal(kapiIcerigi('cakisma').not, undefined);
  assert.equal(kapiIcerigi('yok').metin, 'Bu cihaz odadan çıkarıldı.');
  assert.deepEqual(kapiIcerigi('yok').eylemler, ['yeniden', 'cik']);
  assert.equal(kapiIcerigi('yok').yokla, 0);
  assert.deepEqual(kapiIcerigi('cevrimdisi').eylemler, ['tekrar', 'cik']);
  assert.deepEqual(kapiIcerigi('yukleniyor').eylemler, []);
  assert.equal(kapiIcerigi('bilinmeyen').baslik, kapiIcerigi('cevrimdisi').baslik);
});

test('bekleyen davet: oda başına saklanır, silinir', () => {
  assert.equal(bekleyenDavet('abcdefghij'), null);
  davetSakla('abcdefghij', 'k'.repeat(32));
  assert.equal(bekleyenDavet('abcdefghij'), 'k'.repeat(32));
  assert.equal(bekleyenDavet('baskaoda22'), null);
  davetSakla('abcdefghij', null);
  assert.equal(bekleyenDavet('abcdefghij'), null);
});

test('yoklaMs: çevrimdışında artan bekleme (en çok 60 sn), diğerlerinde sabit', async () => {
  const { yoklaMs } = await import('../js/core/kapi.js');
  assert.equal(typeof yoklaMs, 'function');
  assert.deepEqual([0, 1, 2, 3, 4, 10].map((n) => yoklaMs('cevrimdisi', n)), [5000, 10000, 20000, 40000, 60000, 60000]);
  assert.equal(yoklaMs('bekliyor', 7), 5000);
  assert.equal(yoklaMs('yok', 0), 0);
});
