import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeStore } from '../js/core/identity.js';
import {
  mergeDocs, liveDocs, maxUpdated, overlapSince, checkData, byteSize, MAX_BYTES,
  putDoc, removeDoc, listDocs, pageDocs, openCollection,
} from '../js/core/veri.js';

writeStore('session', 'bizim.yerel', '1'); // yerel arka uç (localStorage yerine bellek)

const doc = (id, updated_at, extra = {}) => ({ id, data: { v: id }, author: 'a', deleted: false, created_at: updated_at, updated_at, ...extra });

test('mergeDocs: yeni sürüm kazanır, eski ve aynı sürüm atlanır', () => {
  const m = new Map();
  assert.equal(mergeDocs(m, [doc('x', '2026-01-01T00:00:01.000Z')]), true);
  assert.equal(mergeDocs(m, [doc('x', '2026-01-01T00:00:00.000Z', { data: { v: 'eski' } })]), false);
  assert.equal(m.get('x').data.v, 'x');
  assert.equal(mergeDocs(m, [doc('x', '2026-01-01T00:00:01.000Z')]), false);
  assert.equal(mergeDocs(m, [doc('x', '2026-01-01T00:00:02.000Z', { data: { v: 'yeni' } })]), true);
  assert.equal(m.get('x').data.v, 'yeni');
});

test('mergeDocs: bekleyen yerel yazma sunucu sürümüyle ezilmez', () => {
  const m = new Map();
  mergeDocs(m, [doc('x', '2026-01-01T00:00:05.000Z', { pending: true, data: { v: 'benim' } })]);
  assert.equal(mergeDocs(m, [doc('x', '2026-01-01T00:00:09.000Z', { data: { v: 'onun' } })]), false);
  assert.equal(m.get('x').data.v, 'benim');
});

test('liveDocs: silinenleri atar, oluşturma zamanına göre sıralar', () => {
  const m = new Map();
  mergeDocs(m, [doc('b', '2026-01-02T00:00:00Z'), doc('a', '2026-01-01T00:00:00Z'), doc('c', '2026-01-03T00:00:00Z', { deleted: true })]);
  assert.deepEqual(liveDocs(m).map((d) => d.id), ['a', 'b']);
  assert.deepEqual(liveDocs(m).map((d) => d.data), [{ v: 'a' }, { v: 'b' }]);
});

test('maxUpdated ve overlapSince', () => {
  assert.equal(maxUpdated([doc('a', '2026-01-01T00:00:00Z'), doc('b', '2026-01-02T00:00:00Z'), doc('c', '2026-01-09T00:00:00Z', { pending: true })]), '2026-01-02T00:00:00Z');
  assert.equal(overlapSince('2026-01-01T00:00:10.000Z', 5000), '2026-01-01T00:00:05.000Z');
  assert.equal(overlapSince(null), null);
});

test('checkData: nesne olmalı ve boyut sınırı', () => {
  assert.ok(checkData(null));
  assert.ok(checkData([1]));
  assert.equal(checkData({ a: 1 }), null);
  assert.ok(checkData({ s: 'x'.repeat(MAX_BYTES) }));
  assert.equal(byteSize({ s: 'ğ' }), JSON.stringify({ s: 'ğ' }).length + 1);
});

test('yerel arka uç: put, list (since), page, remove', async () => {
  const room = 'testodaab1';
  const a = await putDoc(room, 'gun', 'g1', { baslik: 'Bir' }, 'ben');
  const b = await putDoc(room, 'gun', 'g2', { baslik: 'İki' }, 'ben');
  assert.ok(b.updated_at > a.updated_at);
  assert.deepEqual((await listDocs(room, 'gun')).map((d) => d.id), ['g1', 'g2']);
  assert.deepEqual((await listDocs(room, 'gun', { since: a.updated_at })).map((d) => d.id), ['g2']);
  await removeDoc(room, 'gun', 'g1', 'ben');
  const all = await listDocs(room, 'gun', { since: b.updated_at });
  assert.equal(all.length, 1);
  assert.equal(all[0].deleted, true);
  assert.deepEqual((await pageDocs(room, 'gun')).map((d) => d.id), ['g2']);
  await assert.rejects(putDoc(room, 'Gun!', 'x', {}), /Geçersiz tür/);
  await assert.rejects(putDoc(room, 'gun', 'x', { s: 'x'.repeat(MAX_BYTES) }), /çok uzun/);
});

// İki "cihaz": birinin sendAll'u diğerinin 'message' dinleyicisine gider.
function fakePair(roomId) {
  const make = (clientId) => {
    const handlers = { message: new Set(), status: new Set(), presence: new Set() };
    return {
      roomId, me: { clientId, name: clientId }, handlers,
      on(type, fn) { handlers[type].add(fn); return () => handlers[type].delete(fn); },
      partner: () => null,
      sendAll: null,
    };
  };
  const A = make('ali'); const B = make('ayse');
  A.sendAll = (m) => { for (const fn of B.handlers.message) fn(JSON.parse(JSON.stringify(m)), A.me); return true; };
  B.sendAll = (m) => { for (const fn of A.handlers.message) fn(JSON.parse(JSON.stringify(m)), B.me); return true; };
  return [A, B];
}

test('openCollection: yazma karşı tarafa canlı ulaşır; patch ve remove', async () => {
  const [A, B] = fakePair('testodacd2');
  const ca = await openCollection(A, 'liste');
  const cb = await openCollection(B, 'liste');
  let seen = null;
  cb.on('change', (docs) => { seen = docs; });
  const id = await ca.put({ metin: 'Kapadokya' });
  assert.equal(ca.get(id).data.metin, 'Kapadokya');
  assert.equal(ca.get(id).pending, undefined);
  assert.equal(seen.length, 1);
  assert.equal(cb.get(id).author, 'ali');
  await cb.patch(id, { yapildi: '2026-10-30' });
  assert.deepEqual(ca.get(id).data, { metin: 'Kapadokya', yapildi: '2026-10-30' });
  await ca.remove(id);
  assert.equal(cb.get(id), null);
  assert.equal(cb.all().length, 0);
  // Yeni açılan koleksiyon sunucudan (yerel depo) aynı durumu görür.
  const cc = await openCollection(B, 'liste');
  assert.equal(cc.all().length, 0);
  ca.close(); cb.close(); cc.close();
});

test('openCollection: recent ile son N belge ve loadOlder', async () => {
  const [A] = fakePair('testodaef3');
  for (let i = 0; i < 7; i++) await putDoc('testodaef3', 'mesaj', 'm' + i, { metin: String(i) }, 'ali');
  const c = await openCollection(A, 'mesaj', { recent: 3 });
  assert.deepEqual(c.all().map((d) => d.id), ['m4', 'm5', 'm6']);
  assert.equal(c.hasOlder(), true);
  assert.equal(await c.loadOlder(3), 3);
  assert.deepEqual(c.all().map((d) => d.id), ['m1', 'm2', 'm3', 'm4', 'm5', 'm6']);
  assert.equal(await c.loadOlder(3), 1);
  assert.equal(c.hasOlder(), false);
  c.close();
});

test('openCollection: çok uzun veri reddedilir ve geri alınır', async () => {
  const [A] = fakePair('testodagh4');
  const c = await openCollection(A, 'mektup');
  await assert.rejects(c.put({ metin: 'x'.repeat(MAX_BYTES) }), /çok uzun/);
  assert.equal(c.all().length, 0);
  c.close();
});
