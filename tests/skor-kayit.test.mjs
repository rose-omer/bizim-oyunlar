// Skor tablosu: skorKaydet (ev sahibi yazar, yalnız ilgili alan) ve skorlar (okuma), yerel arka uç.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeStore } from '../js/core/identity.js';
import { putDoc } from '../js/core/veri.js';
import { skorKaydet, skorlar, skorKapat } from '../js/core/skor.js';

writeStore('session', 'bizim.yerel', '1');

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

const Y = `y${new Date().getFullYear()}`;

test('skorKaydet: galibiyet ve beraberlik birikir; karşı taraf skorlar ile görür', async () => {
  const [A, B] = fakePair('testskora1');
  const d1 = await skorKaydet(A, 'dama', { kazanan: 'ali' });
  assert.equal(d1.ali, 1);
  await skorKaydet(A, 'dama', { kazanan: 'ali' });
  await skorKaydet(A, 'dama', { kazanan: 'ayse' });
  const d4 = await skorKaydet(A, 'dama', { kazanan: null });
  assert.equal(d4.ali, 2);
  assert.equal(d4.ayse, 1);
  assert.equal(d4.berabere, 1);
  assert.deepEqual(d4[Y], { ali: 2, ayse: 1, berabere: 1 });
  assert.equal(d4.son.kazanan, null);
  await skorKaydet(A, 'tavla', { kazanan: 'ayse' });
  const h = await skorlar(B);
  assert.equal(h.dama.ali, 2);
  assert.equal(h.tavla.ayse, 1);
  skorKapat(A); skorKapat(B);
});

test('skorKaydet: sunucudaki güncel değerin üstüne yazar (önbellek eski olsa da)', async () => {
  const [A] = fakePair('testskorb2');
  await skorKaydet(A, 'amiral', { kazanan: 'ali' });
  // Başka cihaz arada yazdı (bu koleksiyon henüz görmedi).
  await putDoc('testskorb2', 'skor', 'amiral', { ali: 7, ayse: 3 }, 'ayse');
  const d = await skorKaydet(A, 'amiral', { kazanan: 'ali' });
  assert.equal(d.ali, 8);
  assert.equal(d.ayse, 3);
  skorKapat(A);
});

test('skorKaydet: geçersiz oyun ya da kazanan yazmaz, hata fırlatmaz; odasız null', async () => {
  const [A] = fakePair('testskorc3');
  assert.equal(await skorKaydet(A, 'Dama!', { kazanan: 'ali' }), null);
  assert.equal(await skorKaydet(A, 'dama', { kazanan: 'son' }), null);
  assert.equal(await skorKaydet({ roomId: null, me: { clientId: 'x' } }, 'dama', { kazanan: 'x' }), null);
  assert.deepEqual(await skorlar(A), {});
  assert.deepEqual(await skorlar({ roomId: null }), {});
  skorKapat(A);
});
