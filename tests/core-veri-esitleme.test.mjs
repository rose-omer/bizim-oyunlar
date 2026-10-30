// veri.js eşitleme düzeltmeleri: alan düzeyinde patch, since yalnız çekilenlerle, recent imleci.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeStore } from '../js/core/identity.js';
import { applyPatch, putDoc, patchDoc, openCollection } from '../js/core/veri.js';

writeStore('session', 'bizim.yerel', '1');

function fakePair(roomId) {
  const make = (clientId) => {
    const handlers = { message: new Set(), status: new Set(), presence: new Set() };
    return {
      roomId, me: { clientId, name: clientId }, handlers,
      on(type, fn) { handlers[type].add(fn); return () => handlers[type].delete(fn); },
      partner: () => null,
      sendAll: null,
      live: true,
    };
  };
  const A = make('ali'); const B = make('ayse');
  A.sendAll = (m) => { if (A.live) for (const fn of B.handlers.message) fn(JSON.parse(JSON.stringify(m)), A.me); return true; };
  B.sendAll = (m) => { if (B.live) for (const fn of A.handlers.message) fn(JSON.parse(JSON.stringify(m)), B.me); return true; };
  return [A, B];
}

test('applyPatch: üst düzey, iç içe ve silme', () => {
  const d = { metin: 'selam', tepki: { ali: '❤️' } };
  assert.deepEqual(applyPatch(d, { 'tepki.ayse': '😂' }), { metin: 'selam', tepki: { ali: '❤️', ayse: '😂' } });
  assert.deepEqual(applyPatch(d, { 'tepki.ali': null, duzenlendi: 'x' }), { metin: 'selam', tepki: {}, duzenlendi: 'x' });
  assert.deepEqual(applyPatch(d, { metin: null }), { tepki: { ali: '❤️' } });
  assert.deepEqual(d, { metin: 'selam', tepki: { ali: '❤️' } }); // girdi değişmez
  assert.throws(() => applyPatch({}, { 'a.b.c': 1 }), /Geçersiz alan/);
  assert.throws(() => applyPatch({}, { '.a': 1 }), /Geçersiz alan/);
});

test('patch: iki kişinin aynı belgeye yazdığı farklı alanlar birbirini ezmez', async () => {
  const room = 'testodapa2';
  await putDoc(room, 'mesaj', 'm1', { metin: 'selam' }, 'ali');
  const [A, B] = fakePair(room);
  const ca = await openCollection(A, 'mesaj');
  const cb = await openCollection(B, 'mesaj');
  // Ayşe'nin kopyası henüz Ali'nin tepkisini görmeden yazıyor (eski kopya).
  B.live = false;
  await ca.patch('m1', { 'tepki.ali': '❤️' });
  await cb.patch('m1', { 'tepki.ayse': '😂' });
  await ca.refresh(); await cb.refresh();
  assert.deepEqual(ca.get('m1').data.tepki, { ali: '❤️', ayse: '😂' });
  assert.deepEqual(cb.get('m1').data.tepki, { ali: '❤️', ayse: '😂' });
  assert.equal(ca.get('m1').data.metin, 'selam');
  ca.close(); cb.close();
});

test('since: kendi yazmam, kaçırdığım partner yazmasını atlatmaz', async () => {
  const room = 'testodasn3';
  const [A, B] = fakePair(room);
  const ca = await openCollection(A, 'mesaj');
  const cb = await openCollection(B, 'mesaj');
  B.live = false; // Ayşe'nin yayını Ali'ye ulaşmıyor
  const x = await cb.put({ metin: 'kaçan' });
  await new Promise((r) => setTimeout(r, 30));
  await ca.put({ metin: 'benim' });
  assert.equal(ca.get(x), null);
  await ca.refresh();
  assert.equal(ca.get(x).data.metin, 'kaçan');
  ca.close(); cb.close();
});

test('recent: pencere dışındaki eski belgeye gelen güncelleme sayfalamayı bozmaz', async () => {
  const room = 'testodark4';
  for (let i = 0; i < 12; i++) await putDoc(room, 'mesaj', 'm' + String(i).padStart(2, '0'), { metin: String(i) }, 'ali');
  const [A] = fakePair(room);
  const c = await openCollection(A, 'mesaj', { recent: 4 });
  assert.deepEqual(c.all().map((d) => d.id), ['m08', 'm09', 'm10', 'm11']);
  // Eski m01'e tepki geldi (yayınla).
  const doc = await patchDoc(room, 'mesaj', 'm01', { 'tepki.ayse': '❤️' }, 'ayse');
  for (const fn of A.handlers.message) fn({ t: 'veri', kind: 'mesaj', doc }, { clientId: 'ayse' });
  assert.deepEqual(c.all().map((d) => d.id), ['m08', 'm09', 'm10', 'm11']); // başıboş belge gizli
  await c.loadOlder(4);
  assert.deepEqual(c.all().map((d) => d.id), ['m04', 'm05', 'm06', 'm07', 'm08', 'm09', 'm10', 'm11']);
  await c.loadOlder(4);
  await c.loadOlder(4);
  assert.equal(c.all().length, 12);
  assert.deepEqual(c.get('m01').data.tepki, { ayse: '❤️' });
  assert.equal(c.hasOlder(), false);
  c.close();
});
