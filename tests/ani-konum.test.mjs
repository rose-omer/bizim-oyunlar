// Anı konumu: aniVerisi / aniYamasi / aniDogrula 'konum' alanı ({ lat, lng }, 4 ondalık, isteğe bağlı).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aniVerisi, aniYamasi, aniDogrula } from '../sayfalar/anilar/mantik.js';

const form = { baslik: 'Kordon', tarih: '2025-07-04', yer: '', not: '', fotolar: [], etiketler: [] };

test('aniVerisi: geçerli konum 4 ondalıkla yazılır; yoksa alan yok', () => {
  assert.deepEqual(aniVerisi({ ...form, konum: { lat: 38.423734, lng: 27.142826 } }).konum, { lat: 38.4237, lng: 27.1428 });
  assert.equal('konum' in aniVerisi({ ...form, konum: null }), false);
  assert.equal('konum' in aniVerisi(form), false);
});

test('aniYamasi: konum formdaysa yazılır, null silinir; formda yoksa dokunulmaz', () => {
  assert.deepEqual(aniYamasi({ ...form, konum: { lat: 41.02561, lng: 28.97419 } }, {}).konum, { lat: 41.0256, lng: 28.9742 });
  const sil = aniYamasi({ ...form, konum: null }, {});
  assert.equal(sil.konum, null);
  assert.ok('konum' in sil);
  assert.equal('konum' in aniYamasi(form, {}), false);
});

test('aniDogrula: bozuk konum reddedilir, boş konum serbest', () => {
  assert.equal(aniDogrula({ ...form, konum: { lat: 120, lng: 0 } }), 'Konum geçersiz. Haritadan yeniden seç.');
  assert.equal(aniDogrula({ ...form, konum: null }), null);
  assert.equal(aniDogrula({ ...form, konum: { lat: 41, lng: 29 } }), null);
});
