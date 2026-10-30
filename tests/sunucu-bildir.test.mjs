// Edge Function işleyicileri (supabase/functions/_shared/isleyici.js) sahte ortam ve sahte fetch ile.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  istegiDogrula, goreliUrl, kisalt, kokIzinli, corsBasliklari, endpointIzinli, esitMi,
  publishableAnahtarlar, servisAnahtari, restBasliklari, gunNo, pushYuku,
} from '../supabase/functions/_shared/mantik.js';
import { bildirIsleyici, hatirlatIsleyici, sonucOzeti, sayfala, SAYFA } from '../supabase/functions/_shared/isleyici.js';
import { b64uKodla } from '../supabase/functions/_shared/webpush.js';

const ODA = 'abcdefgh23';
const PUB = 'sb_publishable_deneme';

test('istegiDogrula: alanlar, kısaltma, varsayılan başlık', () => {
  const ok = istegiDogrula({ room: ODA, from: 'omer-1', tur: 'mesaj', baslik: ' Ömer ', metin: 'a\n\tb', url: 'sayfalar/sohbet/' });
  assert.deepEqual(ok.deger, { room: ODA, from: 'omer-1', tur: 'mesaj', baslik: 'Ömer', metin: 'a b', url: 'sayfalar/sohbet/' });
  const uzun = istegiDogrula({ room: ODA, from: 'x', tur: 'ani', baslik: '💗'.repeat(80), metin: 'ş'.repeat(300) }).deger;
  assert.equal([...uzun.baslik].length, 60);
  assert.ok(uzun.baslik.endsWith('…') && uzun.baslik.startsWith('💗'));
  assert.equal([...uzun.metin].length, 140);
  assert.equal(istegiDogrula({ room: ODA, from: 'x', tur: 'gun' }).deger.baslik, 'Biz İkimiz');
  for (const kotu of [null, [], 'x', { room: 'KOTU', from: 'x', tur: 'mesaj' }, { room: ODA, from: 'a b', tur: 'mesaj' },
    { room: ODA, from: 'x', tur: 'reklam' }, { room: ODA, tur: 'mesaj' }]) {
    assert.ok(istegiDogrula(kotu).hata, JSON.stringify(kotu));
  }
});

const ANAHTAR = 'A'.repeat(41) + '-_';

test('istegiDogrula: isteğe bağlı cihaz anahtarı (43 karakter base64url); yüke girmez', () => {
  const temel = { room: ODA, from: 'omer', tur: 'gun' };
  assert.equal(istegiDogrula({ ...temel, anahtar: ANAHTAR }).deger.anahtar, ANAHTAR);
  assert.ok(!('anahtar' in istegiDogrula(temel).deger));
  assert.ok(!('anahtar' in istegiDogrula({ ...temel, anahtar: null }).deger));
  for (const kotu of ['', 'kisa', ANAHTAR + 'x', 'A'.repeat(42) + '=', 'A'.repeat(42) + ' ', 42, {}, true]) {
    assert.equal(istegiDogrula({ ...temel, anahtar: kotu }).hata, 'geçersiz anahtar', JSON.stringify(kotu));
  }
  assert.ok(!pushYuku(istegiDogrula({ ...temel, anahtar: ANAHTAR }).deger).includes(ANAHTAR));
});

test('goreliUrl: yalnız site içi göreli adres', () => {
  for (const iyi of ['sayfalar/sohbet/', 'sayfalar/mektup/?id=ab-1', 'games/dama/?oda=x#son', './', '']) {
    assert.equal(goreliUrl(iyi), iyi);
  }
  for (const kotu of ['https://kotu.com', '//kotu.com', '/bizim-oyunlar/', '../x', 'javascript:alert(1)', 'a b', 'a\\b', 'x'.repeat(201)]) {
    assert.equal(goreliUrl(kotu), '', kotu);
  }
  assert.equal(kisalt('  a  ', 10), 'a');
  assert.equal(kisalt(null, 5), '');
});

test('köken, CORS, push adresi, anahtarlar', () => {
  for (const k of ['https://rose-omer.github.io', 'http://localhost:5173', 'http://127.0.0.1:8080', 'https://localhost', 'capacitor://localhost']) {
    assert.ok(kokIzinli(k), k);
  }
  for (const k of ['https://rose-omer.github.io.kotu.com', 'https://kotu.github.io', 'http://localhost.kotu.com', null, '']) {
    assert.ok(!kokIzinli(k), k);
  }
  assert.equal(corsBasliklari('http://localhost:5173')['Access-Control-Allow-Origin'], 'http://localhost:5173');
  assert.equal(corsBasliklari('https://kotu.com')['Access-Control-Allow-Origin'], undefined);
  assert.match(corsBasliklari(null)['Access-Control-Allow-Headers'], /apikey/);

  assert.ok(endpointIzinli('https://fcm.googleapis.com/fcm/send/x'));
  assert.ok(endpointIzinli('https://wns2-par02p.notify.windows.com/w/?token=x'));
  assert.ok(!endpointIzinli('https://fcm.googleapis.com:8443/x'));
  assert.ok(!endpointIzinli('http://fcm.googleapis.com/x'));
  assert.ok(!endpointIzinli('https://169.254.169.254/latest'));
  assert.ok(!endpointIzinli('bozuk'));

  assert.ok(esitMi('abc', 'abc'));
  assert.ok(!esitMi('abc', 'abd'));
  assert.ok(!esitMi('abc', 'abcd'));
  assert.ok(!esitMi('', ''));
  const env = (m) => (k) => m[k];
  assert.deepEqual(publishableAnahtarlar(env({ SUPABASE_PUBLISHABLE_KEYS: '{"default":"sb_publishable_a"}', SUPABASE_ANON_KEY: 'eyJ.x' })), ['eyJ.x', 'sb_publishable_a']);
  assert.deepEqual(publishableAnahtarlar(env({ SUPABASE_PUBLISHABLE_KEYS: 'bozuk' })), []);
  assert.equal(servisAnahtari(env({ SUPABASE_SECRET_KEYS: '{"default":"sb_secret_a"}', SUPABASE_SERVICE_ROLE_KEY: 'eyJ.s' })), 'sb_secret_a');
  assert.equal(servisAnahtari(env({ SUPABASE_SERVICE_ROLE_KEY: 'eyJ.s' })), 'eyJ.s');
  assert.equal(restBasliklari('eyJ.s').Authorization, 'Bearer eyJ.s');
  assert.equal(restBasliklari('sb_secret_a').Authorization, undefined);
});

test('sonucOzeti', () => {
  const s = sonucOzeti([
    { endpoint: 'a', ok: true, gone: false }, { endpoint: 'b', ok: false, gone: true }, { endpoint: 'c', ok: false, gone: false },
  ], ['d']);
  assert.deepEqual(s, { p_ok: ['a'], p_gone: ['b', 'd'], p_fail: ['c'] });
});

// ---------- Sahte Supabase + push servisi ----------

async function ortam(ek = {}) {
  const k = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
  const jwk = await crypto.subtle.exportKey('jwk', k.privateKey);
  const vars = {
    SUPABASE_URL: 'https://test.supabase.co/',
    SUPABASE_SECRET_KEYS: '{"default":"sb_secret_deneme"}',
    SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: PUB }),
    VAPID_PUBLIC_KEY: b64uKodla(new Uint8Array(await crypto.subtle.exportKey('raw', k.publicKey))),
    VAPID_PRIVATE_KEY: jwk.d,
    VAPID_SUBJECT: 'https://rose-omer.github.io/bizim-oyunlar/',
    HATIRLAT_ANAHTAR: 'gizli-hatirlat',
    ...ek,
  };
  return (ad) => vars[ad];
}

async function abone(endpoint, client = 'gul', room = ODA) {
  const ua = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  return {
    room, client, endpoint,
    p256dh: b64uKodla(new Uint8Array(await crypto.subtle.exportKey('raw', ua.publicKey))),
    auth: b64uKodla(crypto.getRandomValues(new Uint8Array(16))),
  };
}

/** rpcYanit: ad → (args) => veri | { hata: { code, message }, status } ; pushDurum: endpoint → status */
function sahteFetch({ rpcYanit = {}, pushDurum = {} } = {}) {
  const cagri = { rpc: [], push: [] };
  const fn = async (url, init) => {
    const m = /^https:\/\/test\.supabase\.co\/rest\/v1\/rpc\/(\w+)$/.exec(url);
    if (m) {
      assert.equal(init.headers.apikey, 'sb_secret_deneme');
      const args = JSON.parse(init.body);
      cagri.rpc.push([m[1], args]);
      const v = rpcYanit[m[1]] ? rpcYanit[m[1]](args) : null;
      if (v?.hata) return new Response(JSON.stringify(v.hata), { status: v.status || 400 });
      return new Response(JSON.stringify(v), { status: 200 });
    }
    cagri.push.push({ url, init });
    return new Response(null, { status: pushDurum[url] ?? 201 });
  };
  return { fn, cagri };
}

const istek = (govde, { origin = 'https://rose-omer.github.io', apikey = PUB, method = 'POST', basliklar = {} } = {}) =>
  new Request('https://test.supabase.co/functions/v1/bildir', {
    method,
    headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}), ...(apikey ? { apikey } : {}), ...basliklar },
    body: method === 'POST' ? (typeof govde === 'string' ? govde : JSON.stringify(govde)) : undefined,
  });

const GOVDE = { room: ODA, from: 'omer', tur: 'dokunus', baslik: 'Ömer sana sarıldı 🤗', metin: '', url: 'sayfalar/' };

test('bildir: OPTIONS, yöntem, köken ve anahtar denetimi', async () => {
  const { fn, cagri } = sahteFetch();
  const h = bildirIsleyici({ env: await ortam(), fetchFn: fn });
  const pre = await h(new Request('https://x/', { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173' } }));
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  assert.equal((await h(istek(null, { method: 'GET' }))).status, 405);
  assert.equal((await h(istek(GOVDE, { origin: 'https://kotu.com' }))).status, 403);
  assert.equal((await h(istek(GOVDE, { apikey: 'sb_publishable_baska' }))).status, 401);
  assert.equal((await h(istek(GOVDE, { apikey: null }))).status, 401);
  assert.equal((await h(istek('{bozuk'))).status, 400);
  assert.equal((await h(istek({ ...GOVDE, tur: 'reklam' }))).status, 400);
  assert.equal((await h(istek({ ...GOVDE, metin: 'x'.repeat(5000) }))).status, 413);
  assert.equal(cagri.rpc.length + cagri.push.length, 0, 'reddedilen istek dışarı çağrı yapmaz');

  const ayarsiz = bildirIsleyici({ env: () => undefined, fetchFn: fn });
  assert.equal((await ayarsiz(istek(GOVDE))).status, 500);
});

test('bildir: hedeflere şifreli push; 410 silinir, izinsiz adres silinir, hata sayılır', async () => {
  const gul = await abone('https://web.push.apple.com/gul');
  const eski = await abone('https://fcm.googleapis.com/fcm/send/eski');
  const bozuk = await abone('https://fcm.googleapis.com/fcm/send/bozuk');
  const kotu = await abone('https://kotu.example.com/push');
  const { fn, cagri } = sahteFetch({
    rpcYanit: { push_hedef: () => [gul, eski, bozuk, kotu], push_sonuc: () => null },
    pushDurum: { [eski.endpoint]: 410, [bozuk.endpoint]: 500 },
  });
  const h = bildirIsleyici({ env: await ortam(), fetchFn: fn });
  const res = await h(istek(GOVDE, { origin: null }));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, gonderilen: 1, silinen: 2, hatali: 1 });
  assert.deepEqual(cagri.rpc[0], ['push_hedef', { p_room: ODA, p_from: 'omer' }]);
  assert.deepEqual(cagri.rpc[1], ['push_sonuc', { p_ok: [gul.endpoint], p_gone: [eski.endpoint, kotu.endpoint], p_fail: [bozuk.endpoint] }]);
  assert.deepEqual(cagri.push.map((p) => p.url).sort(), [bozuk.endpoint, eski.endpoint, gul.endpoint].sort());
  const p = cagri.push.find((x) => x.url === gul.endpoint).init;
  assert.equal(p.headers.Urgency, 'high');
  assert.equal(p.headers['Content-Encoding'], 'aes128gcm');
  assert.ok(p.body.length > 86 + 16);
});

test('bildir: hız sınırı 429, veritabanı hatası 502, hedef yoksa 200', async () => {
  const env = await ortam();
  const sinir = sahteFetch({ rpcYanit: { push_hedef: () => ({ hata: { code: '54000', message: 'cok' }, status: 400 }) } });
  assert.equal((await bildirIsleyici({ env, fetchFn: sinir.fn })(istek(GOVDE))).status, 429);
  const hata = sahteFetch({ rpcYanit: { push_hedef: () => ({ hata: { message: 'yok' }, status: 503 }) } });
  assert.equal((await bildirIsleyici({ env, fetchFn: hata.fn })(istek(GOVDE))).status, 502);
  const bos = sahteFetch({ rpcYanit: { push_hedef: () => [] } });
  const r = await bildirIsleyici({ env, fetchFn: bos.fn })(istek(GOVDE));
  assert.deepEqual(await r.json(), { ok: true, gonderilen: 0, silinen: 0, hatali: 0 });
  assert.deepEqual(bos.cagri.rpc.map((c) => c[0]), ['push_hedef'], 'sonuç yoksa push_sonuc çağrılmaz');
});

test('bildir: cihaz anahtarı push_hedef\'e p_anahtar olarak gider; yetki yoksa 403; bozuk anahtar 400', async () => {
  const env = await ortam();
  const gul = await abone('https://web.push.apple.com/gul');
  const ok = sahteFetch({ rpcYanit: { push_hedef: () => [gul], push_sonuc: () => null } });
  const r = await bildirIsleyici({ env, fetchFn: ok.fn })(istek({ ...GOVDE, anahtar: ANAHTAR }));
  assert.equal(r.status, 200);
  assert.deepEqual(ok.cagri.rpc[0], ['push_hedef', { p_room: ODA, p_from: 'omer', p_anahtar: ANAHTAR }]);

  const yetkisiz = sahteFetch({ rpcYanit: { push_hedef: () => ({ hata: { code: '42501', message: 'push_hedef: yetki yok' }, status: 403 }) } });
  const r2 = await bildirIsleyici({ env, fetchFn: yetkisiz.fn })(istek(GOVDE));
  assert.equal(r2.status, 403);
  assert.deepEqual(await r2.json(), { hata: 'yetki yok' });
  assert.equal(r2.headers.get('access-control-allow-origin'), 'https://rose-omer.github.io');
  assert.equal(yetkisiz.cagri.push.length, 0);
  assert.deepEqual(yetkisiz.cagri.rpc.map((c) => c[0]), ['push_hedef']);

  const bozuk = sahteFetch();
  const r3 = await bildirIsleyici({ env, fetchFn: bozuk.fn })(istek({ ...GOVDE, anahtar: 'kisa' }));
  assert.equal(r3.status, 400);
  assert.equal(bozuk.cagri.rpc.length + bozuk.cagri.push.length, 0);
});

const hIstek = (govde, anahtar = 'gizli-hatirlat') => new Request('https://test.supabase.co/functions/v1/hatirlat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(anahtar ? { 'x-hatirlat-anahtar': anahtar } : {}) },
  body: JSON.stringify(govde),
});

test('hatirlat: anahtar; sabah planı; oda bir kez işaretlenir', async () => {
  const omer = await abone('https://fcm.googleapis.com/fcm/send/omer', 'omer');
  const gul = await abone('https://web.push.apple.com/gul', 'gul');
  const baska = await abone('https://fcm.googleapis.com/fcm/send/baska', 'x', 'zzzzzzzz22');
  const isaretli = new Set();
  const { fn, cagri } = sahteFetch({
    rpcYanit: {
      push_abonelikler: () => [omer, gul, baska],
      hatirlat_belgeler: () => [
        { room: ODA, kind: 'kisi', id: 'omer', data: { ad: 'Ömer', dogum: '1998-10-30' } },
        { room: ODA, kind: 'cift', id: 'cift', data: { baslangic: '2020-01-01' } },
      ],
      hatirlat_isaretle: ({ p_rooms, p_gun, p_slot }) => p_rooms.filter((room) => {
        const k = `${room}/${p_gun}/${p_slot}`;
        if (isaretli.has(k)) return false;
        isaretli.add(k);
        return true;
      }),
      push_sonuc: () => null,
    },
  });
  const h = hatirlatIsleyici({ env: await ortam(), fetchFn: fn, simdi: () => new Date('2026-10-30T06:00:05Z') });
  assert.equal((await h(hIstek({ slot: 'sabah' }, 'yanlis'))).status, 401);
  assert.equal((await h(hIstek({ slot: 'sabah' }, null))).status, 401);
  assert.equal((await hatirlatIsleyici({ env: () => undefined, fetchFn: fn })(hIstek({}))).status, 500);

  const r = await h(hIstek({ slot: 'sabah' }));
  assert.deepEqual(await r.json(), { ok: true, slot: 'sabah', bugun: '2026-10-30', oda: 1, gonderilen: 2, silinen: 0, hatali: 0 });
  assert.deepEqual(cagri.rpc.find((c) => c[0] === 'push_abonelikler')[1], { p_limit: SAYFA });
  assert.deepEqual(cagri.rpc.find((c) => c[0] === 'hatirlat_belgeler')[1], { p_kinds: ['gun', 'kisi', 'cift'], p_limit: SAYFA });
  assert.deepEqual(cagri.rpc.filter((c) => c[0] === 'hatirlat_isaretle').map((c) => c[1]), [{ p_rooms: [ODA], p_gun: '2026-10-30', p_slot: 'sabah' }],
    'olaysız oda işaretlenmez; tek toplu çağrı');
  assert.deepEqual(cagri.push.map((p) => p.url).sort(), [gul.endpoint, omer.endpoint].sort());

  // Tekrar çalışırsa aynı gün ikinci kez gönderilmez.
  const r2 = await h(hIstek({ slot: 'sabah' }));
  assert.equal((await r2.json()).gonderilen, 0);
  assert.equal(cagri.push.length, 2);
});

test('hatirlat: akşam günün sorusu; vakit ve gün gövdeden ya da saatten', async () => {
  const omer = await abone('https://fcm.googleapis.com/fcm/send/omer', 'omer');
  const gul = await abone('https://web.push.apple.com/gul', 'gul');
  const { fn, cagri } = sahteFetch({
    rpcYanit: {
      push_abonelikler: () => [omer, gul],
      hatirlat_belgeler: ({ p_gs_gun }) => [{ room: ODA, kind: 'gs', id: `${p_gs_gun}-omer`, data: { gun: p_gs_gun, cevap: 'evet' } }],
      hatirlat_isaretle: ({ p_rooms }) => p_rooms,
      push_sonuc: () => null,
    },
  });
  // 17:00 UTC = 20:00 Türkiye; gövdede vakit yok → akşam.
  const h = hatirlatIsleyici({ env: await ortam(), fetchFn: fn, simdi: () => new Date('2026-10-30T17:00:03Z') });
  const r = await h(hIstek({}));
  const j = await r.json();
  assert.equal(j.slot, 'aksam');
  assert.equal(j.gonderilen, 1);
  assert.deepEqual(cagri.rpc.find((c) => c[0] === 'hatirlat_belgeler')[1], { p_kinds: ['gs'], p_gs_gun: gunNo('2026-10-30'), p_limit: SAYFA });
  assert.deepEqual(cagri.push.map((p) => p.url), [gul.endpoint], 'cevaplayan Ömer\'e gitmez');

  const r2 = await h(hIstek({ slot: 'aksam', bugun: '2026-11-02' }));
  assert.equal((await r2.json()).bugun, '2026-11-02');
});

test('hatirlat: abonelik yoksa belge okunmaz', async () => {
  const { fn, cagri } = sahteFetch({ rpcYanit: { push_abonelikler: () => [] } });
  const h = hatirlatIsleyici({ env: await ortam(), fetchFn: fn, simdi: () => new Date('2026-10-30T06:00:00Z') });
  const j = await (await h(hIstek({ slot: 'sabah' }))).json();
  assert.equal(j.oda, 0);
  assert.deepEqual(cagri.rpc.map((c) => c[0]), ['hatirlat_anahtar', 'push_abonelikler']);
});

test('hatirlat: anahtar vault\'tan (RPC hatirlat_anahtar, 5 dk önbellek); okunamazsa HATIRLAT_ANAHTAR', async (t) => {
  t.mock.method(console, 'error', () => {});
  let dbAnahtar = 'vault-anahtar';
  let dbHata = false;
  const { fn, cagri } = sahteFetch({
    rpcYanit: {
      hatirlat_anahtar: () => (dbHata ? { hata: { message: 'yok' }, status: 503 } : dbAnahtar),
      push_abonelikler: () => [],
    },
  });
  let an = new Date('2026-10-30T06:00:00Z');
  const h = hatirlatIsleyici({ env: await ortam(), fetchFn: fn, simdi: () => an });
  const kac = () => cagri.rpc.filter((c) => c[0] === 'hatirlat_anahtar').length;

  assert.equal((await h(hIstek({ slot: 'sabah' }, 'vault-anahtar'))).status, 200);
  assert.equal((await h(hIstek({ slot: 'sabah' }, 'gizli-hatirlat'))).status, 401, 'veritabanı anahtarı varken secret geçmez');
  assert.equal(kac(), 1, 'önbellekten');

  dbAnahtar = 'yenilendi';
  an = new Date(an.getTime() + 4 * 60_000);
  assert.equal((await h(hIstek({ slot: 'sabah' }, 'yenilendi'))).status, 401, '5 dk dolmadan eski anahtar geçerli');
  an = new Date(an.getTime() + 2 * 60_000);
  assert.equal((await h(hIstek({ slot: 'sabah' }, 'yenilendi'))).status, 200);
  assert.equal(kac(), 2);

  // Veritabanı okunamaz ya da anahtar yoksa secret'a düşer; önbelleğe alınmaz.
  dbHata = true;
  an = new Date(an.getTime() + 6 * 60_000);
  assert.equal((await h(hIstek({ slot: 'sabah' }, 'gizli-hatirlat'))).status, 200);
  dbHata = false;
  dbAnahtar = null;
  assert.equal((await h(hIstek({ slot: 'sabah' }, 'gizli-hatirlat'))).status, 200);
  assert.equal(kac(), 4);
  const secretsiz = hatirlatIsleyici({ env: await ortam({ HATIRLAT_ANAHTAR: undefined }), fetchFn: fn });
  assert.equal((await secretsiz(hIstek({ slot: 'sabah' }, ''))).status, 500);
});

test('sayfala: imleçle tüm sayfalar; kısa sayfada biter; imleç ilerlemezse hata', async () => {
  const satirlar = Array.from({ length: 7 }, (_, i) => ({ k: `s${i}` }));
  const cagrilar = [];
  const rpc = async (ad, args) => {
    cagrilar.push(args);
    return satirlar.filter((s) => !args.p_after || s.k > args.p_after).slice(0, args.p_limit);
  };
  assert.deepEqual(await sayfala(rpc, 'x', { a: 1 }, (s) => ({ p_after: s.k }), 3), satirlar);
  assert.deepEqual(cagrilar, [{ a: 1, p_limit: 3 }, { a: 1, p_after: 's2', p_limit: 3 }, { a: 1, p_after: 's5', p_limit: 3 }]);
  cagrilar.length = 0;
  assert.deepEqual(await sayfala(rpc, 'x', {}, (s) => ({ p_after: s.k }), 7), satirlar);
  assert.equal(cagrilar.length, 2, 'tam dolu sayfadan sonra boş sayfa istenir');
  await assert.rejects(() => sayfala(async () => [{ k: 'a' }], 'x', {}, () => ({}), 1), /sayfa sınırı/);
});

test('hatirlat: 500 üstü abonelik sayfalarla okunur; belgeler imleçle', async () => {
  const omer = await abone('https://fcm.googleapis.com/fcm/send/zz-omer', 'omer');
  // 500 olaysız oda (bildirim gitmez) + son sırada ODA (doğum günü): ODA yalnız 2. sayfada gelir.
  const bos = Array.from({ length: SAYFA }, (_, i) => ({
    room: `oda${String(i).padStart(7, '0')}`, client: 'c', endpoint: `https://fcm.googleapis.com/fcm/send/a${String(i).padStart(4, '0')}`, p256dh: 'x', auth: 'y',
  }));
  const hepsi = [...bos, omer];
  const belge = { room: ODA, kind: 'kisi', id: 'omer', data: { ad: 'Ömer', dogum: '1998-10-30' } };
  const { fn, cagri } = sahteFetch({
    rpcYanit: {
      push_abonelikler: ({ p_after, p_limit }) => hepsi.filter((s) => !p_after || s.endpoint > p_after).slice(0, p_limit),
      hatirlat_belgeler: ({ p_after }) => (p_after ? [] : [belge]),
      hatirlat_isaretle: ({ p_rooms }) => p_rooms,
      push_sonuc: () => null,
    },
  });
  const h = hatirlatIsleyici({ env: await ortam(), fetchFn: fn, simdi: () => new Date('2026-10-30T06:00:05Z') });
  const j = await (await h(hIstek({ slot: 'sabah' }))).json();
  assert.equal(j.oda, 1);
  assert.equal(j.gonderilen, 1);
  const ab = cagri.rpc.filter((c) => c[0] === 'push_abonelikler').map((c) => c[1]);
  assert.deepEqual(ab, [{ p_limit: SAYFA }, { p_after: bos[SAYFA - 1].endpoint, p_limit: SAYFA }]);
  assert.equal(cagri.rpc.filter((c) => c[0] === 'hatirlat_belgeler').length, 1, 'kısa sayfadan sonra istenmez');
  assert.deepEqual(cagri.push.map((p) => p.url), [omer.endpoint]);
});
