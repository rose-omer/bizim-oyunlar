import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateLog, logGame, roomStats, ping } from '../js/core/db.js';
import { uploadPhoto, loadPhoto, isAllowedPhotoUrl } from '../js/core/storage.js';
import { writeStore } from '../js/core/identity.js';
import { SUPABASE_URL } from '../js/config.js';

test('isAllowedPhotoUrl: yalnız local: ve bizim kovanın herkese açık adresi', () => {
  const base = 'https://abcd.supabase.co';
  const pub = `${base}/storage/v1/object/public/photos/`;
  const ok = (u, b = base) => isAllowedPhotoUrl(u, b, 'photos');
  assert.equal(ok('local:1234'), true);
  assert.equal(ok('local:1234', ''), true); // yerel modda da
  assert.equal(ok(pub + 'abcdefghij/0f8e2a1c-1b2d-4c3e-8f9a-0123456789ab.jpg'), true);
  assert.equal(ok(pub + 'abcdefghij/x.jpg', base + '/'), true); // sondaki / fark etmez
  // başka sunucu, kova ya da yol
  assert.equal(ok('https://evil.example/x.jpg'), false);
  assert.equal(ok('https://abcd.supabase.co.evil.example/storage/v1/object/public/photos/a.jpg'), false);
  assert.equal(ok('https://abcd.supabase.co@evil.example/storage/v1/object/public/photos/a.jpg'), false);
  assert.equal(ok(`${base}/storage/v1/object/public/diger/a.jpg`), false);
  assert.equal(ok(`${base}/rest/v1/game_log`), false);
  assert.equal(ok('http://abcd.supabase.co/storage/v1/object/public/photos/a.jpg'), false);
  // kovadan çıkma denemeleri
  assert.equal(ok(pub + '../diger/a.jpg'), false);
  assert.equal(ok(pub + 'a/../../diger/a.jpg'), false);
  assert.equal(ok(pub + '%2e%2e/diger/a.jpg'), false);
  assert.equal(ok(pub + '..%2fdiger'), false);
  assert.equal(ok(pub + 'a\\..\\b.jpg'), false);
  assert.equal(ok(pub + 'a.jpg?x=1'), false);
  assert.equal(ok(pub), false); // yol boş
  // bozuk girdi
  assert.equal(ok(''), false);
  assert.equal(ok(null), false);
  assert.equal(ok(pub + 'a.jpg', ''), false); // ayar yoksa yalnız local:
  assert.equal(ok('data:image/png;base64,AAAA'), false);
  assert.equal(ok('javascript:alert(1)'), false);
});

test('loadPhoto: izin verilmeyen adres ağa çıkmadan reddedilir', async () => {
  const orig = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => { called = true; throw new Error('çağrılmamalı'); };
  try {
    await assert.rejects(loadPhoto('https://evil.example/x.jpg'), /izin verilmiyor/);
    await assert.rejects(loadPhoto(`${SUPABASE_URL}/storage/v1/object/public/photos/../x`), /izin verilmiyor/);
    assert.equal(called, false);
  } finally {
    globalThis.fetch = orig;
  }
});

test('uploadPhoto (Supabase): geçerli oda yoksa ağa çıkmadan hata', { skip: !SUPABASE_URL }, async () => {
  writeStore('session', 'bizim.yerel', null); // önceki yerel mod bayrağını temizle
  const blob = new Blob(['x'], { type: 'image/jpeg' });
  await assert.rejects(uploadPhoto(blob, null), /geçerli bir oda/);
  await assert.rejects(uploadPhoto(blob, 'solo'), /geçerli bir oda/);
  await assert.rejects(uploadPhoto(blob, '../abcdefgh'), /geçerli bir oda/);
});

const quiet = async (fn) => {
  const warn = console.warn;
  console.warn = () => {};
  try {
    return await fn();
  } finally {
    console.warn = warn;
  }
};

test('aggregateLog: oyuna göre sayar, en son oynanan önce', () => {
  assert.deepEqual(aggregateLog([]), []);
  assert.deepEqual(aggregateLog([
    { game: 'yapboz', at: '2026-10-01T10:00:00.000Z' },
    { game: 'ciz', at: '2026-10-03T10:00:00.000Z' },
    { game: 'yapboz', at: '2026-10-02T10:00:00.000Z' },
    null,
    { game: 5 },
  ]), [
    { game: 'ciz', played: 1, last_at: '2026-10-03T10:00:00.000Z' },
    { game: 'yapboz', played: 2, last_at: '2026-10-02T10:00:00.000Z' },
  ]);
});

test('oda yoksa: no-op / boş', async () => {
  await logGame(null, 'yapboz', {});
  assert.deepEqual(await roomStats(null), []);
});

test('Supabase yüklenemezse (Node): hata fırlatmaz, boş / false döner', { skip: !SUPABASE_URL }, async () => {
  await quiet(async () => {
    await logGame('abcdefghij', 'yapboz', { p: 1 });
    assert.deepEqual(await roomStats('abcdefghij'), []);
    assert.equal(await ping(), false);
  });
});

test('yerel mod: localStorage günlüğü, ping true', async () => {
  globalThis.location = { search: '?yerel=1' };
  try {
    assert.equal(await ping(), true);
    await logGame('abcdefghij', 'yapboz', { parca: 100 });
    await logGame('abcdefghij', 'ciz', null);
    await logGame('abcdefghij', 'yapboz', { parca: 200 });
    await logGame('baskaodaxx', 'hafiza', null);
    const stats = await roomStats('abcdefghij');
    assert.deepEqual(stats.map((s) => [s.game, s.played]), [['yapboz', 2], ['ciz', 1]]);
    assert.match(stats[0].last_at, /^\d{4}-\d\d-\d\dT/);
    // JSON'a çevrilemeyen sonuç da hata fırlatmaz
    const loop = {};
    loop.self = loop;
    await quiet(() => logGame('abcdefghij', 'yapboz', loop));
  } finally {
    delete globalThis.location;
  }
});

test('storage: Node\'da IndexedDB yok → anlaşılır hata, takılmaz', async () => {
  globalThis.location = { search: '?yerel=1' };
  try {
    await assert.rejects(uploadPhoto(new Blob(['x'], { type: 'image/jpeg' }), 'abcdefghij'), /yerel fotoğraf deposu/);
    await assert.rejects(loadPhoto('local:yok'), /yerel fotoğraf deposu/);
    await assert.rejects(uploadPhoto('blob değil', 'abcdefghij'), TypeError);
  } finally {
    delete globalThis.location;
  }
});
