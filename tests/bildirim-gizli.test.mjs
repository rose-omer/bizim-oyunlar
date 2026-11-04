// Bildirimde içerik gizleme (js/core/bildirim.js): ayar alıcının kisi.bildirimGizli alanında; gönderen uyar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { writeStore, me } from '../js/core/identity.js';
import { _testSupabase } from '../js/core/room.js';
import { bildir, bildirimGizliMi, bildirimIcerigi, partnerKisisi } from '../js/core/bildirim.js';

const ICERIK = { baslik: 'Ömer', metin: 'Akşama sürpriz var' };
const GIZLI = { metin: 'Yeni mesaj' };
const belge = (id, data, updated_at = '2026-10-01T00:00:00Z', deleted = false) => ({ id, data, updated_at, deleted });

test('bildirimGizliMi: yalnız açıkça false ise içerik gider', () => {
  assert.equal(bildirimGizliMi({ bildirimGizli: false }), false);
  for (const k of [{ bildirimGizli: true }, {}, null, undefined, { bildirimGizli: 'false' }, { bildirimGizli: 0 }, { bildirimGizli: null }]) {
    assert.equal(bildirimGizliMi(k), true, JSON.stringify(k));
  }
});

test('bildirimIcerigi: gizliyse metin (ve verilmişse başlık) değişir', () => {
  assert.deepEqual(bildirimIcerigi(ICERIK, { bildirimGizli: true }, GIZLI), { baslik: 'Ömer', metin: 'Yeni mesaj' });
  assert.deepEqual(bildirimIcerigi(ICERIK, null, GIZLI), { baslik: 'Ömer', metin: 'Yeni mesaj' }, 'profil bilinmiyor: gizli');
  assert.deepEqual(bildirimIcerigi(ICERIK, {}, GIZLI), { baslik: 'Ömer', metin: 'Yeni mesaj' }, 'alan yok: gizli');
  assert.deepEqual(bildirimIcerigi(ICERIK, { bildirimGizli: false }, GIZLI), ICERIK);
  assert.deepEqual(bildirimIcerigi(ICERIK, {}, { baslik: 'Kumbara', metin: 'Yenilik var' }), { baslik: 'Kumbara', metin: 'Yenilik var' });
});

test('partnerKisisi: ben ve silinen sayılmaz; en son güncellenen seçilir', () => {
  assert.equal(partnerKisisi([], 'ben'), null);
  assert.equal(partnerKisisi([belge('ben', { bildirimGizli: false })], 'ben'), null);
  assert.equal(partnerKisisi([belge('o', { bildirimGizli: false }, undefined, true)], 'ben'), null);
  assert.deepEqual(partnerKisisi([
    belge('eski', { ad: 'eski' }, '2026-01-01T00:00:00Z'),
    belge('ben', { ad: 'ben' }, '2026-12-01T00:00:00Z'),
    belge('yeni', { ad: 'yeni' }, '2026-06-01T00:00:00Z'),
  ], 'ben'), { ad: 'yeni' });
});

function kur(t, docList) {
  writeStore('session', 'bizim.yerel', null);
  const giden = [];
  const asil = globalThis.fetch;
  t.after(() => { globalThis.fetch = asil; });
  globalThis.fetch = async (url, init) => { giden.push(JSON.parse(init.body)); return new Response('{}', { status: 200 }); };
  const cagri = [];
  _testSupabase(async () => ({
    rpc: async (ad, p) => { cagri.push([ad, p]); return ad === 'doc_list' ? docList(p) : { data: null, error: null }; },
  }));
  return { giden, cagri };
}
const hepsi = (...docs) => () => ({ data: docs, error: null });

test('bildir: partner gizli istemiş ya da alan yoksa içerik gitmez', async (t) => {
  for (const [oda, data] of [['gxzxx22222', { bildirimGizli: true }], ['gxzxx33333', { ad: 'Gül' }]]) {
    const { giden, cagri } = kur(t, hepsi(belge('partner', data)));
    assert.equal(await bildir(oda, { tur: 'mesaj', ...ICERIK, url: 'sayfalar/sohbet/', gizli: GIZLI }), true);
    assert.equal(giden[0].metin, 'Yeni mesaj');
    assert.equal(giden[0].baslik, 'Ömer');
    assert.equal('gizli' in giden[0], false);
    assert.equal(cagri.find(([ad]) => ad === 'doc_list')[1].p_kind, 'kisi');
  }
});

test('bildir: partner açıkça izin verdiyse içerik gider', async (t) => {
  const { giden } = kur(t, hepsi(belge('partner', { bildirimGizli: false }), belge(me().clientId, { bildirimGizli: true })));
  await bildir('gxzxx44444', { tur: 'mesaj', ...ICERIK, gizli: GIZLI });
  assert.equal(giden[0].metin, ICERIK.metin);
});

test('bildir: partner profili bilinmiyor ya da okunamıyorsa gizli', async (t) => {
  const a = kur(t, hepsi());
  await bildir('gxzxx55555', { tur: 'mesaj', ...ICERIK, gizli: GIZLI });
  assert.equal(a.giden[0].metin, 'Yeni mesaj');
  const b = kur(t, () => ({ data: null, error: { message: 'ağ' } }));
  await bildir('gxzxx66666', { tur: 'mesaj', ...ICERIK, gizli: GIZLI });
  assert.equal(b.giden[0].metin, 'Yeni mesaj');
});

test('bildir: gizli verilmeyen (sabit metinli) çağrı profil okumaz; kısıtlı çağrı da okumaz', async (t) => {
  const { giden, cagri } = kur(t, hepsi());
  const say = () => cagri.filter(([ad]) => ad === 'doc_list').length;
  await bildir('gxzxx77777', { tur: 'oyun', baslik: 'Sıra sende', metin: 'sabit' });
  assert.equal(giden[0].metin, 'sabit');
  assert.equal(say(), 0);
  await bildir('gxzxx77777', { tur: 'mesaj', ...ICERIK, gizli: GIZLI });
  const n = say();
  assert.equal(await bildir('gxzxx77777', { tur: 'mesaj', ...ICERIK, gizli: GIZLI }), false);
  assert.equal(say(), n);
});

test('içerik taşıyan bildirim çağrıları gizli seçeneği verir', () => {
  for (const yol of ['sohbet/app.js', 'anilar/app.js', 'gunler/app.js', 'harcama/app.js', 'harcama/kumbara.js',
    'kupon/app.js', 'listeler/app.js', 'mektup/app.js', 'not/app.js']) {
    const s = readFileSync(new URL(`../sayfalar/${yol}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
    const i = s.indexOf('bildir(roomId, {');
    assert.ok(i >= 0, yol);
    assert.match(s.slice(i, s.indexOf('\n}', i)), /gizli: /, yol);
  }
});
