import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateLog, logGame, roomStats, ping } from '../js/core/db.js';
import { uploadPhoto, loadPhoto } from '../js/core/storage.js';
import { SUPABASE_URL } from '../js/config.js';

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
