// Ayarlar › Verilerimiz › Son silinenler: süzme, sıralama, önizleme, kim/ne zaman sildi.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COP_TURLERI, copListesi, copOnizleme, copKimZaman } from '../sayfalar/ayarlar/mantik.js';

const belge = (id, updated_at, extra = {}) => ({
  id, data: { metin: id }, author: 'omer', deleted: true, created_at: '2026-01-01T00:00:00Z', updated_at, ...extra,
});

test('COP_TURLERI: içerik türleri', () => {
  assert.deepEqual(COP_TURLERI, ['mesaj', 'ani', 'mektup', 'gun', 'liste', 'randevu', 'harcama', 'kupon', 'gunfoto', 'kumbara', 'not']);
});

test('copListesi: yalnız silinmiş ve verisi dolu olanlar; en yeni önce; en çok 50; türü taşır', () => {
  const sonuclar = {
    mesaj: [
      belge('m1', '2026-10-01T10:00:00Z'),
      belge('m2', '2026-10-03T10:00:00Z'),
      belge('canli', '2026-10-09T10:00:00Z', { deleted: false }),
      belge('bos', '2026-10-09T10:00:00Z', { data: {} }), // eski silme: veri yok
    ],
    liste: [belge('l1', '2026-10-02T10:00:00Z')],
    kisi: [belge('k1', '2026-10-09T10:00:00Z')], // içerik türü değil
  };
  const l = copListesi(sonuclar);
  assert.deepEqual(l.map((x) => [x.tur, x.id]), [['mesaj', 'm2'], ['liste', 'l1'], ['mesaj', 'm1']]);
  assert.deepEqual(l[0].data, { metin: 'm2' });
  assert.equal(l[0].author, 'omer');

  const cok = { gun: Array.from({ length: 60 }, (_, i) => belge(`g${i}`, new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString())) };
  const k = copListesi(cok);
  assert.equal(k.length, 50);
  assert.equal(k[0].id, 'g59');
  assert.equal(copListesi(cok, { enCok: 3 }).length, 3);
  assert.deepEqual(copListesi({}), []);
});

test('copOnizleme: tür adı, kısa metin ve varsa fotoğraf', () => {
  assert.deepEqual(copOnizleme('mesaj', { metin: '  Seni   çok\nözledim ' }), { tur: 'Mesaj', metin: 'Seni çok özledim', foto: null });
  assert.deepEqual(copOnizleme('mesaj', { foto: 'https://x/a.jpg' }), { tur: 'Mesaj', metin: 'Fotoğraf', foto: 'https://x/a.jpg' });
  assert.equal(copOnizleme('mesaj', { ses: { url: 'u', sure: 3 } }).metin, 'Sesli mesaj');
  assert.deepEqual(copOnizleme('ani', { baslik: 'Kapadokya', fotolar: ['f1', 'f2'] }), { tur: 'Anı', metin: 'Kapadokya', foto: 'f1' });
  assert.equal(copOnizleme('mektup', { baslik: '', metin: 'Sevgili Gül' }).metin, 'Sevgili Gül');
  assert.equal(copOnizleme('gun', { baslik: 'Yıldönümü', emoji: '💍' }).metin, '💍 Yıldönümü');
  assert.deepEqual(copOnizleme('liste', { metin: 'Süt al' }), { tur: 'Liste öğesi', metin: 'Süt al', foto: null });
  assert.equal(copOnizleme('randevu', { metin: 'Piknik' }).tur, 'Randevu fikri');
  assert.equal(copOnizleme('harcama', { baslik: 'Market', tutar: 12550 }).metin, 'Market · 125,50 ₺');
  assert.equal(copOnizleme('kupon', { baslik: 'Kahvaltı', emoji: '🍰' }).metin, '🍰 Kahvaltı');
  assert.deepEqual(copOnizleme('gunfoto', { foto: 'g.jpg' }), { tur: 'Günün fotoğrafı', metin: 'Günün fotoğrafı', foto: 'g.jpg' });
  // Uzun metin kısalır; bozuk veri çökertmez.
  const uzun = copOnizleme('liste', { metin: 'a'.repeat(200) }).metin;
  assert.equal([...uzun].length, 80);
  assert.ok(uzun.endsWith('…'));
  assert.deepEqual(copOnizleme('mesaj', { metin: 5, foto: 7 }), { tur: 'Mesaj', metin: 'Mesaj', foto: null });
  assert.deepEqual(copOnizleme('ani', { fotolar: 'x' }), { tur: 'Anı', metin: 'Anı', foto: null });
});

test('copKimZaman: "Dün sildin" / "Gül dün sildi"; eski tarih bulunma ekiyle', () => {
  const simdi = new Date(2026, 9, 31, 12, 0);
  const adlar = { omer: 'Ömer', gul: 'Gül' };
  const o = { benId: 'omer', adlar, simdi };
  assert.equal(copKimZaman('omer', new Date(2026, 9, 30, 22, 0).toISOString(), o), 'Dün sildin');
  assert.equal(copKimZaman('gul', new Date(2026, 9, 30, 22, 0).toISOString(), o), 'Gül dün sildi');
  assert.equal(copKimZaman('omer', new Date(2026, 9, 31, 9, 0).toISOString(), o), 'Bugün sildin');
  assert.equal(copKimZaman('gul', new Date(2026, 9, 28, 9, 0).toISOString(), o), 'Gül 3 gün önce sildi');
  assert.equal(copKimZaman('gul', new Date(2026, 9, 12, 9, 0).toISOString(), o), "Gül 12 Ekim'de sildi");
  assert.equal(copKimZaman('omer', new Date(2026, 2, 3, 9, 0).toISOString(), o), "3 Mart'ta sildin");
  assert.equal(copKimZaman('gul', new Date(2025, 9, 12, 9, 0).toISOString(), o), 'Gül 12 Ekim 2025 tarihinde sildi');
  // Adı bilinmeyen ya da yazarsız: "Sevgilin".
  assert.equal(copKimZaman('baska', new Date(2026, 9, 30, 22, 0).toISOString(), o), 'Sevgilin dün sildi');
  assert.equal(copKimZaman(null, new Date(2026, 9, 30, 22, 0).toISOString(), { benId: 'omer', simdi }), 'Sevgilin dün sildi');
});
