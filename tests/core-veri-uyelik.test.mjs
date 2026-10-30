// RPC katmanına kimlik (veri.js, db.js, bildirim.js), 42501 işleme, yedekten içe aktarma (TALIMAT §5.2, §5.4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeStore, me } from '../js/core/identity.js';
import { _testSupabase } from '../js/core/room.js';
import { odaGiris, sonDurum, anahtarim } from '../js/core/uyelik.js';
import { putDoc, listDocs, openCollection, iceAktar, iceAktarBirlestir } from '../js/core/veri.js';
import { logGame, roomStats } from '../js/core/db.js';
import { bildir } from '../js/core/bildirim.js';

globalThis.window = new EventTarget();
const KANAL = 'c'.repeat(32);
const sunucuModu = () => { writeStore('session', 'bizim.yerel', null); writeStore('session', 'bizim.yerel.uyelik', null); };
const flush = () => new Promise((r) => setTimeout(r, 0));

function sahte(yanitlar) {
  const cagrilar = [];
  const c = {
    cagrilar,
    rpc: async (ad, params) => {
      cagrilar.push([ad, params]);
      const fn = yanitlar[ad];
      if (!fn) return { data: null, error: { code: 'PGRST202', message: 'yok' }, status: 404 };
      return fn(params);
    },
  };
  _testSupabase(async () => c);
  return c;
}
const onayli = () => ({ data: { durum: 'onayli', kanal: KANAL }, error: null });
const sessiz = async (fn) => { const w = console.warn; console.warn = () => {}; try { return await fn(); } finally { console.warn = w; } };

function odaNesnesi(roomId) {
  const handlers = { message: new Set(), status: new Set(), presence: new Set() };
  return {
    roomId, me: me(), handlers,
    on(type, fn) { handlers[type].add(fn); return () => handlers[type].delete(fn); },
    sendAll: () => true,
  };
}

test('veri.js: Supabase RPC\'lerine kimlik eklenir; eski sunucuda eklenmez', async () => {
  sunucuModu();
  const R = 'verikimlik';
  const c = sahte({
    oda_katil: onayli,
    doc_put: (p) => ({ data: [{ id: p.p_id, data: p.p_data, author: p.p_author, deleted: false, created_at: 'x', updated_at: '2026-10-01T00:00:00Z' }], error: null }),
    doc_list: () => ({ data: [], error: null }),
  });
  await odaGiris(R);
  await putDoc(R, 'liste', 'a1', { metin: 'süt' }, 'omer');
  await listDocs(R, 'liste');
  const put = c.cagrilar.find((x) => x[0] === 'doc_put')[1];
  const list = c.cagrilar.find((x) => x[0] === 'doc_list')[1];
  for (const p of [put, list]) {
    assert.equal(p.p_cihaz, me().clientId);
    assert.equal(p.p_anahtar, anahtarim(R));
  }

  const R2 = 'eskisunucu';
  const c2 = sahte({ doc_put: (p) => ({ data: [{ id: p.p_id, data: p.p_data }], error: null }) });
  await sessiz(() => odaGiris(R2)); // oda_katil yok → eski sunucu
  await putDoc(R2, 'liste', 'a1', { metin: 'süt' });
  const p2 = c2.cagrilar.find((x) => x[0] === 'doc_put')[1];
  assert.equal('p_cihaz' in p2, false);
  assert.equal('p_anahtar' in p2, false);
});

test('veri.js 42501: yazma giden kutusunda kalır, geri alınmaz; eşitleme durur; onay gelince sürer', async () => {
  sunucuModu();
  const R = 'yetkiyok23';
  let izin = true;
  const yazilan = [];
  const c = sahte({
    oda_katil: onayli,
    doc_list: () => (izin ? { data: [], error: null } : { data: null, error: { code: '42501', message: 'doc_list: yetki yok' } }),
    doc_put: (p) => {
      if (!izin) return { data: null, error: { code: '42501', message: 'doc_put: yetki yok' } };
      yazilan.push(p.p_id);
      return { data: [{ id: p.p_id, data: p.p_data, author: p.p_author, deleted: false, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z' }], error: null };
    },
  });
  await odaGiris(R);
  const col = await openCollection(odaNesnesi(R), 'liste');
  const hatalar = [];
  col.on('error', (e) => hatalar.push(e));
  izin = false;
  const id = await col.put({ metin: 'ekmek' });
  assert.equal(col.get(id).pending, true, 'iyimser yazma durur');
  assert.equal(hatalar.length, 1);
  assert.equal(hatalar[0].yetki, true);
  assert.equal(sonDurum(R).durum, 'yok');

  const once = c.cagrilar.length;
  await col.refresh();
  await col.put({ metin: 'peynir' });
  assert.equal(c.cagrilar.length, once, 'yetki yokken sunucuya gidilmez');

  // Onay geri geldi: bekleyenler gider.
  izin = true;
  await odaGiris(R);
  await flush(); await flush();
  assert.equal(yazilan.length, 2);
  assert.equal(col.get(id).pending, undefined);
  col.close();
});

test('iceAktarBirlestir: yoksa ekler, yalnız daha yeni olan üstüne yazar; sayı döner', () => {
  const hepsi = {
    a: { id: 'a', data: { v: 1 }, author: 'x', deleted: false, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-05T00:00:00Z' },
    b: { id: 'b', data: { v: 1 }, author: 'x', deleted: false, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-05T00:00:00Z' },
  };
  const n = iceAktarBirlestir(hepsi, [
    { kind: 'liste', id: 'a', data: { v: 'eski' }, updated_at: '2026-01-04T00:00:00Z' },
    { kind: 'liste', id: 'b', data: { v: 'yeni' }, author: 'y', updated_at: '2026-01-06T00:00:00Z' },
    { kind: 'liste', id: 'c', data: { v: 'yok' }, created_at: '2025-12-01T00:00:00Z', updated_at: '2025-12-02T00:00:00Z' },
    { kind: 'liste', id: 'd', data: { v: 'tarihsiz' } },
  ], '2026-02-01T00:00:00.000Z');
  assert.equal(n, 3);
  assert.equal(hepsi.a.data.v, 1);
  assert.equal(hepsi.b.data.v, 'yeni');
  assert.equal(hepsi.b.author, 'y');
  assert.equal(hepsi.b.created_at, '2026-01-01T00:00:00Z');
  assert.deepEqual(hepsi.c, { id: 'c', data: { v: 'yok' }, author: null, deleted: false, created_at: '2025-12-01T00:00:00Z', updated_at: '2025-12-02T00:00:00Z' });
  assert.equal(hepsi.d.updated_at, '2026-02-01T00:00:00.000Z');
});

test('iceAktar: Supabase doc_ice_aktar (kimlikli); yerel modda yerel depoya', async () => {
  sunucuModu();
  const R = 'iceaktar23';
  const c = sahte({ oda_katil: onayli, doc_ice_aktar: (p) => ({ data: p.p_belgeler.length, error: null }) });
  await odaGiris(R);
  const belgeler = [{ kind: 'liste', id: 'x1', data: { metin: 'a' } }, { kind: 'mesaj', id: 'm1', data: { metin: 'b' } }];
  assert.equal(await iceAktar(R, belgeler), 2);
  const p = c.cagrilar.find((x) => x[0] === 'doc_ice_aktar')[1];
  assert.deepEqual(p.p_belgeler, belgeler);
  assert.equal(p.p_cihaz, me().clientId);
  await assert.rejects(iceAktar(R, new Array(201).fill(belgeler[0])), /200/);

  writeStore('session', 'bizim.yerel', '1');
  const Y = 'yereliceak';
  await putDoc(Y, 'liste', 'x1', { metin: 'var' });
  assert.equal(await iceAktar(Y, [belgeler[1], { kind: 'liste', id: 'x1', data: { metin: 'eski' }, updated_at: '2020-01-01T00:00:00Z' }]), 1);
  const docs = await listDocs(Y, 'liste');
  assert.equal(docs.find((d) => d.id === 'x1').data.metin, 'var', 'eski kopya atlanır');
  assert.equal((await listDocs(Y, 'mesaj'))[0].data.metin, 'b');
  sunucuModu();
});

test('yerel sıkı modda onaysız cihaz veriye erişemez (42501)', async () => {
  writeStore('session', 'bizim.yerel', '1');
  writeStore('session', 'bizim.yerel.uyelik', '1');
  const R = 'sikiveri23';
  writeStore('session', 'bizim.client', 'kurucu');
  await odaGiris(R);
  await putDoc(R, 'liste', 'k1', { metin: 'kurucu yazdı' });
  writeStore('session', 'bizim.client', 'yabanci');
  writeStore('session', 'bizim.anahtar.' + R, null);
  writeStore('session', 'bizim.uyelik.' + R, null);
  assert.equal((await odaGiris(R)).durum, 'bekliyor');
  await assert.rejects(listDocs(R, 'liste'), (e) => e.yetki === true);
  await assert.rejects(putDoc(R, 'liste', 'y1', { metin: 'x' }), (e) => e.yetki === true);
  sunucuModu();
});

test('db.js: log_game ve room_stats kimlikli; 42501 yetki kaybı', async () => {
  sunucuModu();
  const R = 'dbkimlik23';
  let izin = true;
  const c = sahte({
    oda_katil: onayli,
    log_game: () => (izin ? { data: null, error: null } : { data: null, error: { code: '42501', message: 'log_game: yetki yok' } }),
    room_stats: () => ({ data: [{ game: 'dama', played: 2, last_at: 'x' }], error: null }),
  });
  await odaGiris(R);
  await logGame(R, 'dama', { kazanan: 'a' });
  assert.deepEqual(await roomStats(R), [{ game: 'dama', played: 2, last_at: 'x' }]);
  for (const ad of ['log_game', 'room_stats']) {
    const p = c.cagrilar.find((x) => x[0] === ad)[1];
    assert.equal(p.p_cihaz, me().clientId, ad);
    assert.equal(p.p_anahtar, anahtarim(R), ad);
  }
  izin = false;
  await sessiz(() => logGame(R, 'dama', null));
  assert.equal(sonDurum(R).durum, 'yok');
});

test('bildirim.js: bildir gövdesinde anahtar; eski sunucuda yok', async (t) => {
  sunucuModu();
  const R = 'bxdxrxm234'; // geçerli oda kodu (l, o, 0, 1 yok)
  sahte({ oda_katil: onayli });
  await odaGiris(R);
  const govdeler = [];
  const asil = globalThis.fetch;
  t.after(() => { globalThis.fetch = asil; });
  globalThis.fetch = async (url, init) => { govdeler.push(JSON.parse(init.body)); return new Response('{}', { status: 200 }); };
  assert.equal(await bildir(R, { tur: 'mesaj', baslik: 'a', metin: 'b' }), true);
  assert.equal(govdeler[0].anahtar, anahtarim(R));
  assert.equal(govdeler[0].from, me().clientId);

  const E = 'eskibxdxr2';
  sahte({});
  await sessiz(() => odaGiris(E));
  assert.equal(await bildir(E, { tur: 'mesaj' }), true);
  assert.equal('anahtar' in govdeler[1], false);
});

test('geri yükleme sonrası: refresh({ tam: true }) eski tarihli belgeleri de getirir; önbellek temizlenir', async () => {
  const { onbellekTemizle } = await import('../js/core/veri.js');
  const { readStore } = await import('../js/core/identity.js');
  writeStore('session', 'bizim.yerel', '1');
  const R = 'tamtazele2';
  await putDoc(R, 'liste', 'ilk', { metin: 'yeni' }); // ilk yükleme bunu çeker: 'since' ilerler
  const col = await openCollection(odaNesnesi(R), 'liste');
  try {
    await iceAktar(R, [{ kind: 'liste', id: 'eski1', data: { metin: 'yedekten' }, created_at: '2020-01-01T00:00:00Z', updated_at: '2020-01-01T00:00:00Z' }]);
    await col.refresh();
    assert.equal(col.get('eski1'), null, 'artımlı tazeleme eski tarihi atlar');
    await col.refresh({ tam: true });
    assert.equal(col.get('eski1').data.metin, 'yedekten');
    assert.ok(readStore('local', `bizim.veri.${R}.liste`));
    assert.equal(typeof onbellekTemizle, 'function');
    onbellekTemizle(R, ['liste', 'mesaj']);
    assert.equal(readStore('local', `bizim.veri.${R}.liste`), null);
  } finally {
    col.close();
    sunucuModu();
  }
});
