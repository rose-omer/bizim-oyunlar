// js/core/uyelik.js: anahtar, kimlik, oda_katil / oda_durum (sahte istemci), önbellek, olaylar, yerel öykünme.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readStore, writeStore, me } from '../js/core/identity.js';
import {
  anahtarim, kimlik, odaGiris, sonDurum, durumTazele, yetkiKaybedildi, cihazlar, cihazOnayla, cihazReddet,
  cihazCikar, davetOlustur, kurtarmaOlustur, yerelVeriYetkisi, _testIstemci,
} from '../js/core/uyelik.js';
import { ANAHTAR_RE } from '../js/core/uyelik-mantik.js';

globalThis.window = new EventTarget();
const olaylar = [];
window.addEventListener('bizim:uyelik', (e) => olaylar.push(e.detail));

const KANAL = 'a'.repeat(32);
const KANAL2 = 'b'.repeat(32);

/** Sahte Supabase istemcisi: yanitlar[ad] = (params) => { data, error, status } ya da fırlatır. */
function sahte(yanitlar) {
  const cagrilar = [];
  return {
    cagrilar,
    rpc: async (ad, params) => {
      cagrilar.push([ad, params]);
      const fn = yanitlar[ad];
      if (!fn) return { data: null, error: { code: 'PGRST202', message: 'yok' }, status: 404 };
      return fn(params);
    },
  };
}
const kur = (yanitlar) => { const c = sahte(yanitlar); _testIstemci(async () => c); return c; };
const sunucuModu = () => { writeStore('session', 'bizim.yerel', null); writeStore('session', 'bizim.yerel.uyelik', null); };

test('anahtarim: 43 karakter base64url, kalıcı; bozuk kayıt yenilenir', () => {
  sunucuModu();
  const a = anahtarim('odaanahtar');
  assert.match(a, ANAHTAR_RE);
  assert.equal(anahtarim('odaanahtar'), a);
  assert.equal(readStore('local', 'bizim.anahtar.odaanahtar'), a);
  writeStore('local', 'bizim.anahtar.odaanahtar', 'bozuk');
  const b = anahtarim('odaanahtar');
  assert.match(b, ANAHTAR_RE);
  assert.notEqual(b, a);
  assert.notEqual(anahtarim('baskaoda22'), b, 'oda başına ayrı anahtar');
});

test('odaGiris: oda_katil parametreleri, önbellek, olay; kimlik eklenir', async () => {
  sunucuModu();
  const R = 'odagiris22';
  const c = kur({ oda_katil: () => ({ data: { durum: 'onayli', kanal: KANAL, zorunlu: '2026-10-01T10:00:00.000Z', ilk: true }, error: null }) });
  assert.equal(sonDurum(R), null);
  olaylar.length = 0;
  const s = await odaGiris(R);
  assert.deepEqual(s, { durum: 'onayli', kanal: KANAL, zorunlu: '2026-10-01T10:00:00.000Z', ilk: true });
  const [ad, p] = c.cagrilar[0];
  assert.equal(ad, 'oda_katil');
  assert.equal(p.p_room, R);
  assert.equal(p.p_cihaz, me().clientId);
  assert.equal(p.p_anahtar, anahtarim(R));
  assert.equal(typeof p.p_ad, 'string');
  assert.equal(p.p_davet, null);
  assert.equal(p.p_kurtarma, null);
  assert.deepEqual(sonDurum(R), s);
  assert.deepEqual(olaylar, [{ roomId: R, ...s }]);
  assert.deepEqual(kimlik(R), { p_cihaz: me().clientId, p_anahtar: anahtarim(R) });

  await odaGiris(R, { davet: 'k'.repeat(32), kurtarma: ' abcd-efgh-jkmn-pqrs ' });
  assert.equal(c.cagrilar[1][1].p_davet, 'k'.repeat(32));
  assert.equal(c.cagrilar[1][1].p_kurtarma, 'ABCDEFGHJKMNPQRS');
  await odaGiris(R, { davet: '<bozuk>' });
  assert.equal(c.cagrilar[2][1].p_davet, null);
  assert.equal(olaylar.length, 1, 'durum değişmedikçe olay yok');
});

test("odaGiris: eski sunucu (PGRST202) → 'eski-sunucu', kanal oda kodu, kimlik boş", async () => {
  sunucuModu();
  const R = 'eskisunucu';
  kur({});
  const s = await odaGiris(R);
  assert.equal(s.durum, 'eski-sunucu');
  assert.equal(s.kanal, R);
  assert.deepEqual(kimlik(R), {});
  assert.equal(sonDurum(R).durum, 'eski-sunucu');
});

test("odaGiris: ağ hatası → 'cevrimdisi' + önbellekteki son durum; önbellek bozulmaz", async () => {
  sunucuModu();
  const R = 'cevrimdisi';
  kur({ oda_katil: () => ({ data: { durum: 'onayli', kanal: KANAL }, error: null }) });
  await odaGiris(R);
  _testIstemci(async () => { throw new TypeError('Failed to fetch'); });
  const s = await odaGiris(R);
  assert.equal(s.durum, 'cevrimdisi');
  assert.equal(s.onceki, 'onayli');
  assert.equal(s.kanal, KANAL);
  assert.equal(sonDurum(R).durum, 'onayli');
  const bos = await odaGiris('hicgorulme');
  assert.equal(bos.durum, 'cevrimdisi');
  assert.equal(bos.onceki, null);
  assert.equal(sonDurum('hicgorulme'), null);
});

test('durumTazele: kanal değişince olay; aynıysa sessiz; eski sunucudan yükselince kayıt olur', async () => {
  sunucuModu();
  const R = 'tazele2345';
  let kanal = KANAL;
  const c = kur({
    oda_katil: () => ({ data: { durum: 'onayli', kanal }, error: null }),
    oda_durum: () => ({ data: { durum: 'onayli', kanal }, error: null }),
  });
  await odaGiris(R);
  olaylar.length = 0;
  await durumTazele(R);
  assert.equal(olaylar.length, 0);
  kanal = KANAL2;
  const s = await durumTazele(R);
  assert.equal(s.kanal, KANAL2);
  assert.deepEqual(olaylar.map((o) => [o.roomId, o.kanal]), [[R, KANAL2]]);
  assert.deepEqual(c.cagrilar.at(-1)[1], { p_room: R, ...kimlik(R) });

  // Eski sunucu önbellekteyken sunucu güncellendi: 'yok' çıkarma sayılmaz, oda_katil ile kayıt olunur.
  const R2 = 'yukselen22';
  kur({});
  await odaGiris(R2);
  const c2 = kur({
    oda_durum: () => ({ data: { durum: 'yok' }, error: null }),
    oda_katil: () => ({ data: { durum: 'onayli', kanal }, error: null }),
  });
  const s2 = await durumTazele(R2);
  assert.equal(s2.durum, 'onayli');
  assert.deepEqual(c2.cagrilar.map((x) => x[0]), ['oda_durum', 'oda_katil']);
});

test("yetkiKaybedildi: önbellek 'yok', olay bir kez", async () => {
  sunucuModu();
  const R = 'yetkikayip';
  kur({ oda_katil: () => ({ data: { durum: 'onayli', kanal: KANAL }, error: null }) });
  await odaGiris(R);
  olaylar.length = 0;
  yetkiKaybedildi(R);
  yetkiKaybedildi(R);
  assert.equal(sonDurum(R).durum, 'yok');
  assert.deepEqual(olaylar.map((o) => o.durum), ['yok']);
});

test('cihaz RPC\'leri: liste (ben), onay/ret/çıkar, davet, kurtarma; çıkarınca kanal tazelenir', async () => {
  sunucuModu();
  const R = 'cihazrpc23';
  let kanal = KANAL;
  const c = kur({
    oda_katil: () => ({ data: { durum: 'onayli', kanal }, error: null }),
    oda_durum: () => ({ data: { durum: 'onayli', kanal }, error: null }),
    cihaz_listele: () => ({ data: [
      { cihaz: me().clientId, ad: 'Ömer · iPhone', durum: 'onayli', olusturma: '2026-10-01T00:00:00Z', son_gorulme: null },
      { cihaz: 'gul', ad: 'Gül', durum: 'bekliyor', olusturma: '2026-10-02T00:00:00Z', son_gorulme: null },
    ], error: null }),
    cihaz_onayla: (p) => ({ data: p.p_hedef === 'gul', error: null }),
    cihaz_reddet: () => ({ data: false, error: null }),
    cihaz_cikar: () => { kanal = KANAL2; return { data: true, error: null }; },
    davet_olustur: () => ({ data: 'k'.repeat(32), error: null }),
    kurtarma_olustur: () => ({ data: 'ABCD-EFGH-JKLM-NPQR', error: null }),
  });
  await odaGiris(R);
  const l = await cihazlar(R);
  assert.deepEqual(l.map((x) => [x.cihaz, x.durum, x.ben]), [[me().clientId, 'onayli', true], ['gul', 'bekliyor', false]]);
  assert.equal(await cihazOnayla(R, 'gul'), true);
  assert.deepEqual(c.cagrilar.at(-1), ['cihaz_onayla', { p_room: R, ...kimlik(R), p_hedef: 'gul' }]);
  assert.equal(await cihazReddet(R, 'gul'), false);
  assert.equal(await davetOlustur(R), 'k'.repeat(32));
  assert.equal(await kurtarmaOlustur(R), 'ABCD-EFGH-JKLM-NPQR');
  olaylar.length = 0;
  assert.equal(await cihazCikar(R, 'gul'), true);
  assert.equal(sonDurum(R).kanal, KANAL2);
  assert.equal(olaylar.at(-1).kanal, KANAL2);
});

test('cihaz RPC hatası: 42501 → yetki kaybı; diğer hata → false / null', async () => {
  sunucuModu();
  const R = 'rpchata234';
  kur({ oda_katil: () => ({ data: { durum: 'onayli', kanal: KANAL }, error: null }) });
  await odaGiris(R);
  kur({ cihaz_onayla: () => ({ data: null, error: { code: '42501', message: 'yetki yok' } }) });
  assert.equal(await cihazOnayla(R, 'x'), false);
  assert.equal(sonDurum(R).durum, 'yok');
  kur({ davet_olustur: () => ({ data: null, error: { code: '54000', message: 'cok fazla' } }) });
  assert.equal(await davetOlustur(R), null);
  await assert.rejects(kurtarmaOlustur(R));
  kur({});
  await odaGiris('eskioda234');
  assert.equal(await davetOlustur('eskioda234'), null, 'eski sunucu: davet yok');
});

// ---------- Yerel mod ----------

/** Node'da iki sekmeyi taklit eder: sekmeye özel depo (session) kişiye göre takas edilir. */
let aktif = null;
const kayitlar = new Map();
function sekme(id, R) {
  const keys = ['bizim.client', 'bizim.name', 'bizim.anahtar.' + R, 'bizim.uyelik.' + R];
  if (aktif) kayitlar.set(aktif, Object.fromEntries(keys.map((k) => [k, readStore('session', k)])));
  const k = kayitlar.get(id) || {};
  for (const key of keys) writeStore('session', key, k[key] ?? null);
  writeStore('session', 'bizim.client', id);
  writeStore('session', 'bizim.name', id);
  aktif = id;
}

test('yerel gevşek mod: herkes onaylı, kanal oda kodu, davet yok, kimlik boş', async () => {
  writeStore('session', 'bizim.yerel', '1');
  writeStore('session', 'bizim.yerel.uyelik', null);
  const R = 'gevsekoda2';
  const s = await odaGiris(R);
  assert.equal(s.durum, 'onayli');
  assert.equal(s.kanal, R);
  assert.deepEqual(kimlik(R), {});
  assert.equal(await davetOlustur(R), null);
  assert.doesNotThrow(() => yerelVeriYetkisi(R));
  assert.deepEqual((await cihazlar(R)).map((x) => [x.cihaz, x.ben]), [[me().clientId, true]]);
});

test('yerel sıkı mod: kurucu → bekleyen → onay → davet → kurtarma → çıkarma (sekmeler arası depo)', async () => {
  writeStore('session', 'bizim.yerel', '1');
  writeStore('session', 'bizim.yerel.uyelik', '1');
  const R = 'sikioda234';
  sekme('omer', R);
  const s1 = await odaGiris(R);
  assert.equal(s1.durum, 'onayli');
  assert.equal(s1.ilk, true);
  assert.deepEqual(kimlik(R), {}, 'yerel modda RPC kimliği gerekmez');

  sekme('gul', R);
  assert.equal((await odaGiris(R)).durum, 'bekliyor');
  assert.throws(() => yerelVeriYetkisi(R), (e) => e.code === '42501');
  assert.deepEqual(await cihazlar(R), [], 'onaysız cihaz listeyi göremez');

  sekme('omer', R);
  assert.deepEqual((await cihazlar(R)).map((x) => [x.cihaz, x.durum, x.ben]), [['omer', 'onayli', true], ['gul', 'bekliyor', false]]);
  assert.equal(await cihazOnayla(R, 'gul'), true);
  const kod = await davetOlustur(R);
  assert.match(kod, /^[a-z2-9]{32}$/);
  const kurtar = await kurtarmaOlustur(R);

  sekme('gul', R);
  olaylar.length = 0;
  assert.equal((await durumTazele(R)).durum, 'onayli');
  assert.equal(olaylar.at(-1).durum, 'onayli');
  assert.doesNotThrow(() => yerelVeriYetkisi(R));

  sekme('tablet', R);
  assert.equal((await odaGiris(R, { davet: kod })).durum, 'onayli');
  sekme('yeni', R);
  assert.equal((await odaGiris(R, { kurtarma: kurtar })).durum, 'onayli');

  sekme('omer', R);
  assert.equal(await cihazCikar(R, 'gul'), true);
  sekme('gul', R);
  assert.equal((await durumTazele(R)).durum, 'yok');
  assert.throws(() => yerelVeriYetkisi(R), (e) => e.code === '42501');
  sekme('omer', R);
  assert.equal(await cihazReddet(R, 'tablet'), false, 'onaylıyı reddetmek olmaz');
});

test('yetkiKaybedildi: kimliksiz istekte (eski sunucu önbelleği) ya da kayıtsızken çıkarma sayılmaz; bir kez kayıt olunur', async () => {
  sunucuModu();
  const R = 'kimliksiz2';
  let katil = 0;
  kur({});
  await odaGiris(R); // eski sunucu
  let bitir;
  const bekle = new Promise((r) => { bitir = r; });
  kur({ oda_katil: async () => { katil++; await bekle; return { data: { durum: 'onayli', kanal: KANAL }, error: null }; } });
  olaylar.length = 0;
  yetkiKaybedildi(R, { kimlikli: false });
  yetkiKaybedildi(R, { kimlikli: false }); // ikinci 42501: kayıt sürerken yok sayılır
  yetkiKaybedildi(R); // önbellek boş ama kayıt sürüyor: 'yok' yazılmaz
  bitir();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(katil, 1);
  assert.equal(sonDurum(R).durum, 'onayli');
  assert.deepEqual(olaylar.map((o) => o.durum), ['onayli']);
});

test("yerel sıkı: geçiş yalnız kisi belgesi id'siyle (author sayılmaz)", async () => {
  writeStore('session', 'bizim.yerel', '1');
  writeStore('session', 'bizim.yerel.uyelik', '1');
  const R = 'gecisoda23';
  const m = new Map(Object.entries({
    [`bizim.yerelveri.${R}.kisi`]: JSON.stringify({ gecmis: { id: 'gecmis', data: { ad: 'G' }, author: 'gecmis', created_at: '2020-01-01T00:00:00Z' } }),
    [`bizim.yerelveri.${R}.mesaj`]: JSON.stringify({ m1: { id: 'm1', data: { metin: 'x' }, author: 'yazar', created_at: '2020-01-01T00:00:00Z' } }),
  }));
  window.localStorage = {
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
  try {
    writeStore('session', 'bizim.client', 'yazar');
    assert.equal((await odaGiris(R)).durum, 'bekliyor', 'yalnız yazar olmak yetmez');
    writeStore('session', 'bizim.client', 'gecmis');
    writeStore('session', 'bizim.anahtar.' + R, null);
    writeStore('session', 'bizim.uyelik.' + R, null);
    assert.equal((await odaGiris(R)).durum, 'onayli', 'kendi kisi belgesi olan cihaz geçişle onaylı');
  } finally {
    delete window.localStorage;
    writeStore('session', 'bizim.client', null);
    sunucuModu();
  }
});
