// supabase/schema.sql 4. bölüm: silme veriyi yok etmez (çöp kutusu, geri al). PGlite: sunucu-pglite.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kur, ATLA, ODA } from './sunucu-pglite.mjs';

const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

function belgeler(q) {
  const put = async (id, data, yazar, sil = false) =>
    (await q('select * from public.doc_put($1, $2, $3, $4::jsonb, $5, $6)', [ODA, 'liste', id, JSON.stringify(data), yazar, sil]))[0];
  const patch = async (id, yama, yazar) =>
    (await q('select * from public.doc_patch($1, $2, $3, $4::jsonb, $5)', [ODA, 'liste', id, JSON.stringify(yama), yazar]))[0];
  const satir = async (id) => (await q('select * from public.room_doc where room = $1 and id = $2', [ODA, id]))[0];
  return { put, patch, satir };
}

test('doc_put silme: var olan belgenin verisi kalır; yalnız deleted, author ve updated_at değişir', ATLA, async () => {
  const { q } = await kur({ gecis: true });
  const { put, satir } = belgeler(q);
  const ilk = await put('a', { metin: 'Kapadokya', not: 'balon' }, 'omer');
  await bekle(3);
  const sil = await put('a', {}, 'gul', true);
  assert.deepEqual([sil.deleted, sil.data, sil.author], [true, { metin: 'Kapadokya', not: 'balon' }, 'gul'], 'dönen satır');
  const s = await satir('a');
  assert.deepEqual([s.deleted, s.data, s.author], [true, { metin: 'Kapadokya', not: 'balon' }, 'gul'], 'tablodaki satır');
  assert.ok(s.updated_at > ilk.updated_at, 'updated_at ilerler (karşı cihaz artımlı eşitlemede görür)');
  assert.equal(s.created_at.getTime(), ilk.created_at.getTime(), 'created_at değişmez');
  // İstemcinin silmede gönderdiği veri yok sayılır; ikinci silme de veriyi korur.
  await put('a', { baska: 'veri' }, 'omer', true);
  assert.deepEqual((await satir('a')).data, { metin: 'Kapadokya', not: 'balon' });
});

test('doc_put silme: hiç olmayan belge {} ile silinmiş olarak oluşur', ATLA, async () => {
  const { q } = await kur({ gecis: true });
  const { put, satir } = belgeler(q);
  await put('yok', { metin: 'gönderilen' }, 'omer', true);
  const s = await satir('yok');
  assert.deepEqual([s.deleted, s.data, s.author], [true, {}, 'omer']);
});

test('doc_put: silinmiş belgeye deleted=false ile yazmak onu gönderilen veriyle geri getirir', ATLA, async () => {
  const { q } = await kur({ gecis: true });
  const { put, satir } = belgeler(q);
  await put('a', { metin: 'süt' }, 'omer');
  await put('a', {}, 'omer', true);
  const geri = await put('a', { metin: 'süt', yapildi: '2026-10-30' }, 'gul');
  assert.deepEqual([geri.deleted, geri.data, geri.author], [false, { metin: 'süt', yapildi: '2026-10-30' }, 'gul']);
  assert.deepEqual((await satir('a')).data, { metin: 'süt', yapildi: '2026-10-30' });
});

test('doc_patch silinmiş belgeye: korunan verinin üstüne kurulur ve geri gelir (içerik kaybolmaz)', ATLA, async () => {
  const { q } = await kur({ gecis: true });
  const { put, patch, satir } = belgeler(q);
  await put('a', { metin: 'Kapadokya', not: 'balon' }, 'omer');
  await put('a', {}, 'gul', true);
  const p = await patch('a', { 'tepki.omer': '❤️' }, 'omer');
  const beklenen = { metin: 'Kapadokya', not: 'balon', tepki: { omer: '❤️' } };
  assert.deepEqual([p.deleted, p.data], [false, beklenen]);
  assert.deepEqual((await satir('a')).data, beklenen);
});

test('doc_list silinen belgeyi verisiyle döner; doc_page silineni döndürmez', ATLA, async () => {
  const { q } = await kur({ gecis: true });
  const { put } = belgeler(q);
  await put('a', { metin: 'bir' }, 'omer');
  await put('b', { metin: 'iki' }, 'omer');
  await put('a', {}, 'gul', true);
  const liste = await q('select * from public.doc_list($1, $2)', [ODA, 'liste']);
  assert.deepEqual(liste.map((d) => [d.id, d.deleted, d.data]), [['b', false, { metin: 'iki' }], ['a', true, { metin: 'bir' }]]);
  assert.deepEqual((await q('select id from public.doc_page($1, $2)', [ODA, 'liste'])).map((d) => d.id), ['b']);
});

test('doc_put silme: oran sınırı bir yazma, bayt bütçesi {} (2 bayt) sayar', ATLA, async () => {
  const { q } = await kur({ gecis: true });
  const { put } = belgeler(q);
  const sayac = async (tablo) => (await q(`select coalesce(sum(${tablo === 'room_rate' ? 'n' : 'bytes'}), 0)::int as n from public.${tablo} where room = $1`, [ODA]))[0].n;
  await put('a', { metin: 'uzun bir metin' }, 'omer');
  const [n0, b0] = [await sayac('room_rate'), await sayac('room_byte')];
  await put('a', {}, 'omer', true);
  assert.equal(await sayac('room_rate'), n0 + 1);
  assert.equal(await sayac('room_byte'), b0 + 2);
});
