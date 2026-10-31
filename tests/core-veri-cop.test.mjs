// veri.js: silme veriyi yok etmez (çöp kutusu). Yerel arka uç sunucudaki doc_put ile aynı kurala uyar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readStore, writeStore } from '../js/core/identity.js';
import {
  normalizeDoc, putDoc, patchDoc, removeDoc, listDocs, pageDocs, openCollection, iceAktarBirlestir,
} from '../js/core/veri.js';

writeStore('session', 'bizim.yerel', '1'); // yerel arka uç (bellek)

const sahteOda = (roomId, clientId = 'ali') => ({
  roomId, me: { clientId, name: clientId }, on: () => () => {}, partner: () => null, sendAll: () => true,
});

test('normalizeDoc: silinmiş belgenin verisi korunur', () => {
  const d = normalizeDoc({ id: 'x', data: { metin: 'selam' }, deleted: true, updated_at: '2026-01-01T00:00:00Z' });
  assert.deepEqual([d.deleted, d.data], [true, { metin: 'selam' }]);
});

test('yerel arka uç: silme veriyi korur; olmayan belge {} ile silinir; putDoc geri getirir', async () => {
  const R = 'copyerel22';
  const ilk = await putDoc(R, 'liste', 'a', { metin: 'süt' }, 'ali');
  const sil = await removeDoc(R, 'liste', 'a', 'ayse');
  assert.deepEqual([sil.deleted, sil.data, sil.author], [true, { metin: 'süt' }, 'ayse']);
  assert.ok(sil.updated_at > ilk.updated_at);
  assert.equal(sil.created_at, ilk.created_at);
  await removeDoc(R, 'liste', 'a', 'ali'); // ikinci silme de korur
  const liste = await listDocs(R, 'liste');
  assert.deepEqual(liste.map((d) => [d.id, d.deleted, d.data]), [['a', true, { metin: 'süt' }]]);
  assert.deepEqual(await pageDocs(R, 'liste'), []);

  const yok = await removeDoc(R, 'liste', 'yok', 'ali');
  assert.deepEqual([yok.deleted, yok.data], [true, {}]);

  const geri = await putDoc(R, 'liste', 'a', { metin: 'süt' }, 'ayse');
  assert.deepEqual([geri.deleted, geri.data], [false, { metin: 'süt' }]);
});

test('yerel arka uç: silinmiş belgeye yama korunan verinin üstüne kurulur (içerik kaybolmaz)', async () => {
  const R = 'copyerel23';
  await putDoc(R, 'mesaj', 'm', { metin: 'selam' }, 'ali');
  await removeDoc(R, 'mesaj', 'm', 'ali');
  const p = await patchDoc(R, 'mesaj', 'm', { 'tepki.ayse': '❤️' }, 'ayse');
  assert.deepEqual([p.deleted, p.data], [false, { metin: 'selam', tepki: { ayse: '❤️' } }]);
});

test('openCollection: silinen belge veri taşısa da görünmez; önbellek silinenin verisini tutmaz', async () => {
  const R = 'copkoleks2';
  const c = await openCollection(sahteOda(R), 'ani');
  const c2 = await openCollection(sahteOda(R, 'ayse'), 'ani');
  try {
    const id = await c.put({ baslik: 'Kapadokya', fotolar: ['local:x'] });
    await c.remove(id);
    assert.equal(c.get(id), null);
    assert.deepEqual(c.all(), []);
    const onbellek = JSON.parse(readStore('local', `bizim.veri.${R}.ani`));
    const kayit = onbellek.docs.find((d) => d.id === id);
    assert.deepEqual([kayit.deleted, kayit.data], [true, {}]);
    // Diğer kişinin koleksiyonu da göstermez; sunucu (yerel depo) veriyi korur.
    await c2.refresh({ tam: true });
    assert.deepEqual(c2.all(), []);
    assert.equal(c2.get(id), null);
    assert.equal((await listDocs(R, 'ani'))[0].data.baslik, 'Kapadokya');
  } finally {
    c.close(); c2.close();
  }
});

test('iceAktarBirlestir: yedekteki silinmiş kopya var olan belgeyi silmez (sunucudaki doc_ice_aktar gibi)', () => {
  const S = '2026-02-01T00:00:00.000Z';
  const hepsi = {
    canli: { id: 'canli', data: { v: 1 }, author: 'x', deleted: false, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-05T00:00:00Z' },
    cop: { id: 'cop', data: { v: 2 }, author: 'x', deleted: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-05T00:00:00Z' },
  };
  const n = iceAktarBirlestir(hepsi, [
    { kind: 'liste', id: 'canli', data: {}, deleted: true, updated_at: '2030-01-01T00:00:00Z' },
    { kind: 'liste', id: 'cop', data: {}, deleted: true, updated_at: '2030-01-01T00:00:00Z' },
    { kind: 'liste', id: 'yeni', data: {}, deleted: true },
  ], S);
  assert.equal(n, 1);
  assert.deepEqual([hepsi.canli.deleted, hepsi.canli.data], [false, { v: 1 }]);
  assert.deepEqual([hepsi.cop.deleted, hepsi.cop.data], [true, { v: 2 }]);
  assert.deepEqual([hepsi.yeni.deleted, hepsi.yeni.data], [true, {}]);
});
