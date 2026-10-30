// supabase/functions/_shared/fcm.js + isleyici.js FCM yolu: OAuth2 JWT, mesaj gövdesi, belirteç silme,
// ortam değişkeni yokken atlama. Sahte fetch; RSA anahtarı testte üretilir (gerçek hizmet hesabı yok).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import {
  fcmHesabi, fcmJwt, erisimBelirteci, fcmGovdesi, belirtecGecersiz, fcmGonder, TOKEN_URL, FCM_SCOPE, FCM_KANAL,
} from '../supabase/functions/_shared/fcm.js';
import { bildirIsleyici, hatirlatIsleyici, sonucOzeti } from '../supabase/functions/_shared/isleyici.js';
import { b64uKodla, b64uCoz } from '../supabase/functions/_shared/webpush.js';

const ODA = 'abcdefgh23';
const PUB = 'sb_publishable_deneme';
const PROJE = 'biz-ikimiz-deneme';
const subtle = globalThis.crypto.subtle;
const dec = new TextDecoder();

let anahtar; // { publicKey, pem }
let sayac = 0;

before(async () => {
  const k = await subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const der = new Uint8Array(await subtle.exportKey('pkcs8', k.privateKey));
  const b64 = btoa(String.fromCharCode(...der)).match(/.{1,64}/g).join('\n');
  anahtar = { publicKey: k.publicKey, pem: `-----BEGIN PRIVATE KEY-----\n${b64}\n-----END PRIVATE KEY-----\n` };
});

/** Firebase'in verdiği JSON biçiminde sahte hizmet hesabı. Her çağrı başka e-posta: önbellek testler arası paylaşılmaz. */
function hesapJson(ek = {}) {
  return JSON.stringify({
    type: 'service_account', project_id: PROJE, private_key_id: 'kid123', private_key: anahtar.pem,
    client_email: `fcm-${++sayac}@${PROJE}.iam.gserviceaccount.com`, token_uri: TOKEN_URL, ...ek,
  });
}

const jwtCoz = (jwt) => jwt.split('.').slice(0, 2).map((p) => JSON.parse(dec.decode(b64uCoz(p))));

test('fcmHesabi: yoksa null; alanlar; bozuksa anlaşılır hata', () => {
  assert.equal(fcmHesabi(() => undefined), null);
  assert.equal(fcmHesabi(() => '  '), null);
  const h = fcmHesabi(() => hesapJson());
  assert.equal(h.projectId, PROJE);
  assert.equal(h.kid, 'kid123');
  assert.match(h.email, /@biz-ikimiz-deneme\.iam\.gserviceaccount\.com$/);
  assert.throws(() => fcmHesabi(() => '{bozuk'), /JSON değil/);
  assert.throws(() => fcmHesabi(() => hesapJson({ project_id: '../x' })), /project_id/);
  assert.throws(() => fcmHesabi(() => hesapJson({ client_email: '' })), /client_email/);
  assert.throws(() => fcmHesabi(() => hesapJson({ private_key: 'yok' })), /private_key/);
});

test('fcmJwt: RS256, Google OAuth2 alanları, imza genel anahtarla doğrulanır', async () => {
  const h = fcmHesabi(() => hesapJson());
  const simdi = Date.parse('2026-10-31T10:00:00Z');
  const jwt = await fcmJwt(h, simdi);
  const [baslik, govde] = jwtCoz(jwt);
  assert.deepEqual(baslik, { alg: 'RS256', typ: 'JWT', kid: 'kid123' });
  assert.deepEqual(govde, { iss: h.email, scope: FCM_SCOPE, aud: TOKEN_URL, iat: simdi / 1000, exp: simdi / 1000 + 3600 });
  const [b, g, imza] = jwt.split('.');
  assert.ok(await subtle.verify('RSASSA-PKCS1-v1_5', anahtar.publicKey, b64uCoz(imza), new TextEncoder().encode(`${b}.${g}`)));
  // Secret'a kaçışlı "\n" ile yapıştırılmış anahtar da okunur.
  const kacisli = fcmHesabi(() => hesapJson({ private_key: anahtar.pem.replace(/\n/g, '\\n') }));
  assert.ok((await fcmJwt(kacisli, simdi)).split('.').length === 3);
});

/** Sahte Google/Supabase/push: rpcYanit ad → (args) => veri | { hata, status }; fcmDurum token → [status, error?]. */
function sahteFetch({ rpcYanit = {}, fcmDurum = {}, tokenDurum = 200 } = {}) {
  const cagri = { rpc: [], token: [], fcm: [], push: [] };
  const fn = async (url, init) => {
    const m = /^https:\/\/test\.supabase\.co\/rest\/v1\/rpc\/(\w+)$/.exec(url);
    if (m) {
      const args = JSON.parse(init.body);
      cagri.rpc.push([m[1], args]);
      const v = rpcYanit[m[1]] ? rpcYanit[m[1]](args) : null;
      if (v?.hata) return new Response(JSON.stringify(v.hata), { status: v.status || 400 });
      return new Response(JSON.stringify(v), { status: 200 });
    }
    if (url === TOKEN_URL) {
      const form = new URLSearchParams(init.body);
      cagri.token.push(form);
      if (tokenDurum !== 200) return new Response(JSON.stringify({ error: 'invalid_grant' }), { status: tokenDurum });
      return new Response(JSON.stringify({ access_token: `erisim-${cagri.token.length}`, expires_in: 3599, token_type: 'Bearer' }));
    }
    if (url.startsWith('https://fcm.googleapis.com/v1/')) {
      const govde = JSON.parse(init.body);
      cagri.fcm.push({ url, init, govde });
      const [status, error] = fcmDurum[govde.message.token] || [200];
      return new Response(JSON.stringify(status === 200 ? { name: `projects/${PROJE}/messages/1` } : { error }), { status });
    }
    cagri.push.push({ url, init });
    return new Response(null, { status: 201 });
  };
  return { fn, cagri };
}

test('erisimBelirteci: jwt-bearer ile alır, süresine dek önbellekte; hata fırlatır', async () => {
  const h = fcmHesabi(() => hesapJson());
  const { fn, cagri } = sahteFetch();
  const t0 = Date.parse('2026-10-31T10:00:00Z');
  assert.equal(await erisimBelirteci(h, { fetchFn: fn, simdi: t0 }), 'erisim-1');
  assert.equal(cagri.token[0].get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer');
  assert.equal(jwtCoz(cagri.token[0].get('assertion'))[1].iss, h.email);
  assert.equal(await erisimBelirteci(h, { fetchFn: fn, simdi: t0 + 50 * 60_000 }), 'erisim-1');
  assert.equal(cagri.token.length, 1);
  assert.equal(await erisimBelirteci(h, { fetchFn: fn, simdi: t0 + 59 * 60_000 }), 'erisim-2', 'bitmeden 1 dk önce yenilenir');

  const kotu = sahteFetch({ tokenDurum: 400 });
  await assert.rejects(() => erisimBelirteci(fcmHesabi(() => hesapJson()), { fetchFn: kotu.fn }), /HTTP 400 invalid_grant/);
});

test('fcmGovdesi: bildirim, data.url, Android kanal/ikon/renk/etiket', () => {
  assert.deepEqual(fcmGovdesi('tok', { tur: 'mesaj', baslik: 'Ömer', metin: 'Selam', url: 'sayfalar/sohbet/' }), {
    message: {
      token: 'tok',
      notification: { title: 'Ömer', body: 'Selam' },
      data: { url: 'sayfalar/sohbet/', tur: 'mesaj' },
      android: {
        priority: 'high',
        ttl: '86400s',
        notification: { channel_id: FCM_KANAL, icon: 'ic_stat_kalp', color: '#C2375C', tag: 'mesaj' },
      },
    },
  });
  const bos = fcmGovdesi('tok', { tur: 'gun', baslik: '', metin: '', url: '' }).message;
  assert.deepEqual(bos.notification, { title: 'Biz İkimiz' });
  assert.deepEqual(bos.data, { url: '', tur: 'gun' });
});

const HATA = {
  kayitsiz: { code: 404, status: 'NOT_FOUND', message: 'Requested entity was not found.',
    details: [{ '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError', errorCode: 'UNREGISTERED' }] },
  gecersiz: { code: 400, status: 'INVALID_ARGUMENT', message: 'The registration token is not a valid FCM registration token',
    details: [{ errorCode: 'INVALID_ARGUMENT' }, { '@type': 'type.googleapis.com/google.rpc.BadRequest', fieldViolations: [{ field: 'message.token' }] }] },
  govde: { code: 400, status: 'INVALID_ARGUMENT', message: 'Invalid value at message.android.notification.color',
    details: [{ fieldViolations: [{ field: 'message.android.notification.color' }] }] },
  baskaProje: { code: 403, status: 'PERMISSION_DENIED', message: 'SenderId mismatch', details: [{ errorCode: 'SENDER_ID_MISMATCH' }] },
  yetki: { code: 403, status: 'PERMISSION_DENIED', message: 'Permission denied' },
  sunucu: { code: 503, status: 'UNAVAILABLE', message: 'try later' },
};

test('belirtecGecersiz: yalnız belirteçle ilgili kalıcı hatalar', () => {
  assert.equal(belirtecGecersiz(404, HATA.kayitsiz), true);
  assert.equal(belirtecGecersiz(404, null), true);
  assert.equal(belirtecGecersiz(400, HATA.gecersiz), true);
  assert.equal(belirtecGecersiz(403, HATA.baskaProje), true);
  assert.equal(belirtecGecersiz(400, HATA.govde), false, 'gövde hatası belirteçleri sildirmemeli');
  assert.equal(belirtecGecersiz(403, HATA.yetki), false);
  assert.equal(belirtecGecersiz(503, HATA.sunucu), false);
  assert.equal(belirtecGecersiz(500, null), false);
});

test('fcmGonder: 401 yetki sorunu (sonuç yazılmaz), ağ hatası hatalı sayılır', async () => {
  const h = fcmHesabi(() => hesapJson());
  const yetkisiz = async () => new Response(JSON.stringify({ error: { code: 401, status: 'UNAUTHENTICATED' } }), { status: 401 });
  const r = await fcmGonder('t1', { tur: 'mesaj', baslik: 'x' }, { hesap: h, erisim: 'e', fetchFn: yetkisiz });
  assert.deepEqual(r, { token: 't1', status: 401, ok: false, gone: false, yetki: true, hata: 'UNAUTHENTICATED' });
  const agYok = await fcmGonder('t2', { tur: 'mesaj' }, { hesap: h, erisim: 'e', fetchFn: async () => { throw new TypeError('ağ yok'); } });
  assert.equal(agYok.status, 0);
  assert.equal(agYok.yetki, false);
  assert.deepEqual(sonucOzeti([r, agYok, { token: 't3', ok: true }], [], 'token'), { p_ok: ['t3'], p_gone: [], p_fail: ['t2'] });
});

// ---------- İşleyiciler ----------

async function ortam(ek = {}) {
  const k = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
  const jwk = await subtle.exportKey('jwk', k.privateKey);
  const vars = {
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_SECRET_KEYS: '{"default":"sb_secret_deneme"}',
    SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: PUB }),
    VAPID_PUBLIC_KEY: b64uKodla(new Uint8Array(await subtle.exportKey('raw', k.publicKey))),
    VAPID_PRIVATE_KEY: jwk.d,
    HATIRLAT_ANAHTAR: 'gizli-hatirlat',
    FCM_SERVICE_ACCOUNT: hesapJson(),
    ...ek,
  };
  return (ad) => vars[ad];
}

const istek = (govde) => new Request('https://test.supabase.co/functions/v1/bildir', {
  method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://rose-omer.github.io', apikey: PUB }, body: JSON.stringify(govde),
});
const GOVDE = { room: ODA, from: 'omer', tur: 'mesaj', baslik: 'Ömer', metin: 'Akşam ne yapıyoruz?', url: 'sayfalar/sohbet/' };

test('bildir: FCM belirteçlerine gönderir; geçersizler silinir, gövde/sunucu hatası sayılır', async () => {
  const fcmDurum = { t2: [404, HATA.kayitsiz], t3: [400, HATA.gecersiz], t4: [400, HATA.govde], t5: [503, HATA.sunucu] };
  const { fn, cagri } = sahteFetch({
    rpcYanit: { push_hedef: () => [], fcm_hedef: () => ['t1', 't2', 't3', 't4', 't5'].map((token) => ({ token })), fcm_sonuc: () => null },
    fcmDurum,
  });
  const res = await bildirIsleyici({ env: await ortam(), fetchFn: fn })(istek(GOVDE));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, gonderilen: 1, silinen: 2, hatali: 2 });
  assert.deepEqual(cagri.rpc.map((c) => c[0]), ['push_hedef', 'fcm_hedef', 'fcm_sonuc']);
  assert.deepEqual(cagri.rpc[1][1], { p_room: ODA, p_from: 'omer' });
  assert.deepEqual(cagri.rpc[2][1], { p_ok: ['t1'], p_gone: ['t2', 't3'], p_fail: ['t4', 't5'] });
  assert.equal(cagri.token.length, 1, 'tek erişim belirteci');

  const ilk = cagri.fcm.find((x) => x.govde.message.token === 't1');
  assert.equal(ilk.url, `https://fcm.googleapis.com/v1/projects/${PROJE}/messages:send`);
  assert.equal(ilk.init.headers.Authorization, 'Bearer erisim-1');
  assert.deepEqual(ilk.govde, fcmGovdesi('t1', { tur: 'mesaj', baslik: 'Ömer', metin: 'Akşam ne yapıyoruz?', url: 'sayfalar/sohbet/' }));
});

test('bildir: Web Push ve FCM birlikte; sayılar toplanır', async () => {
  const ua = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const web = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/web-1',
    p256dh: b64uKodla(new Uint8Array(await subtle.exportKey('raw', ua.publicKey))),
    auth: b64uKodla(crypto.getRandomValues(new Uint8Array(16))),
  };
  const { fn, cagri } = sahteFetch({
    rpcYanit: { push_hedef: () => [web], fcm_hedef: () => [{ token: 't1' }], push_sonuc: () => null, fcm_sonuc: () => null },
  });
  const j = await (await bildirIsleyici({ env: await ortam(), fetchFn: fn })(istek(GOVDE))).json();
  assert.deepEqual(j, { ok: true, gonderilen: 2, silinen: 0, hatali: 0 });
  assert.deepEqual(cagri.push.map((p) => p.url), [web.endpoint]);
  assert.deepEqual(cagri.rpc.map((c) => c[0]).sort(), ['fcm_hedef', 'fcm_sonuc', 'push_hedef', 'push_sonuc']);
});

test('bildir: FCM ayarı yok ya da bozuksa FCM atlanır, Web Push sürer', async (t) => {
  const hata = t.mock.method(console, 'error', () => {});
  for (const [ek, gunluk] of [[{ FCM_SERVICE_ACCOUNT: undefined }, 0], [{ FCM_SERVICE_ACCOUNT: '{bozuk' }, 1]]) {
    const { fn, cagri } = sahteFetch({ rpcYanit: { push_hedef: () => [], fcm_hedef: () => assert.fail('çağrılmamalı') } });
    const res = await bildirIsleyici({ env: await ortam(ek), fetchFn: fn })(istek(GOVDE));
    assert.equal(res.status, 200);
    assert.deepEqual(cagri.rpc.map((c) => c[0]), ['push_hedef']);
    assert.equal(cagri.token.length + cagri.fcm.length, 0);
    assert.equal(hata.mock.callCount(), gunluk);
  }
});

test('bildir: fcm_hedef sınırı 429; başka veritabanı hatasında Web Push yine gider; erişim belirteci yoksa sonuç yazılmaz', async (t) => {
  t.mock.method(console, 'error', () => {});
  const env = await ortam();
  const sinir = sahteFetch({ rpcYanit: { push_hedef: () => [], fcm_hedef: () => ({ hata: { code: '54000', message: 'cok' } }) } });
  assert.equal((await bildirIsleyici({ env, fetchFn: sinir.fn })(istek(GOVDE))).status, 429);

  const yok = sahteFetch({ rpcYanit: { push_hedef: () => [], fcm_hedef: () => ({ hata: { code: 'PGRST202', message: 'fonksiyon yok' }, status: 404 }) } });
  const r = await bildirIsleyici({ env, fetchFn: yok.fn })(istek(GOVDE));
  assert.equal(r.status, 200, 'şema 8. bölüm henüz kurulmamış olabilir');

  const google = sahteFetch({ rpcYanit: { push_hedef: () => [], fcm_hedef: () => [{ token: 't1' }] }, tokenDurum: 401 });
  const j = await (await bildirIsleyici({ env: await ortam(), fetchFn: google.fn })(istek(GOVDE))).json();
  assert.deepEqual(j, { ok: true, gonderilen: 0, silinen: 0, hatali: 0 });
  assert.equal(google.cagri.fcm.length, 0);
  assert.ok(!google.cagri.rpc.some((c) => c[0] === 'fcm_sonuc'), 'ayar hatası belirteç sayacını artırmaz');
});

test('bildir: cihaz anahtarı fcm_hedef\'e de p_anahtar olarak gider; fcm_hedef yetki yoksa 403', async (t) => {
  t.mock.method(console, 'error', () => {});
  const ANAHTAR = 'A'.repeat(43);
  const env = await ortam();
  const ok = sahteFetch({ rpcYanit: { push_hedef: () => [], fcm_hedef: () => [{ token: 't1' }], fcm_sonuc: () => null } });
  assert.equal((await bildirIsleyici({ env, fetchFn: ok.fn })(istek({ ...GOVDE, anahtar: ANAHTAR }))).status, 200);
  const args = { p_room: ODA, p_from: 'omer', p_anahtar: ANAHTAR };
  assert.deepEqual(ok.cagri.rpc.slice(0, 2), [['push_hedef', args], ['fcm_hedef', args]]);

  const yetkisiz = sahteFetch({ rpcYanit: { push_hedef: () => [], fcm_hedef: () => ({ hata: { code: '42501', message: 'fcm_hedef: yetki yok' }, status: 403 }) } });
  const r = await bildirIsleyici({ env, fetchFn: yetkisiz.fn })(istek({ ...GOVDE, anahtar: ANAHTAR }));
  assert.equal(r.status, 403);
  assert.deepEqual(await r.json(), { hata: 'yetki yok' });
  assert.equal(yetkisiz.cagri.fcm.length, 0, 'yetkisiz istekte FCM gönderilmez');
});

test('hatirlat: FCM belirteçleri sayfalı okunur, plana göre gönderilir', async () => {
  const fcmSatir = [
    { room: ODA, client: 'omer', token: 'tok-omer' },
    { room: ODA, client: 'gul', token: 'tok-gul' },
  ];
  const { fn, cagri } = sahteFetch({
    rpcYanit: {
      hatirlat_anahtar: () => 'vault-anahtar',
      push_abonelikler: () => [],
      fcm_abonelikler: ({ p_after }) => (p_after ? [] : fcmSatir),
      hatirlat_belgeler: () => [{ room: ODA, kind: 'kisi', id: 'omer', data: { ad: 'Ömer', dogum: '1998-10-31' } }],
      hatirlat_isaretle: ({ p_rooms }) => p_rooms,
      fcm_sonuc: () => null,
    },
    fcmDurum: { 'tok-gul': [404, HATA.kayitsiz] },
  });
  const h = hatirlatIsleyici({ env: await ortam(), fetchFn: fn, simdi: () => new Date('2026-10-31T06:00:05Z') });
  const res = await h(new Request('https://test.supabase.co/functions/v1/hatirlat', {
    method: 'POST', headers: { 'x-hatirlat-anahtar': 'vault-anahtar' }, body: JSON.stringify({ slot: 'sabah' }),
  }));
  assert.deepEqual(await res.json(), { ok: true, slot: 'sabah', bugun: '2026-10-31', oda: 1, gonderilen: 1, silinen: 1, hatali: 0 });
  assert.deepEqual(cagri.rpc.find((c) => c[0] === 'fcm_abonelikler')[1], { p_limit: 500 });
  const giden = Object.fromEntries(cagri.fcm.map((x) => [x.govde.message.token, x.govde.message]));
  assert.equal(giden['tok-omer'].notification.title, 'İyi ki doğdun, Ömer! 🎂');
  assert.equal(giden['tok-gul'].notification.title, 'Bugün sevgilinin doğum günü 🎂');
  assert.equal(giden['tok-gul'].data.url, 'sayfalar/gunler/');
  assert.deepEqual(cagri.rpc.find((c) => c[0] === 'fcm_sonuc')[1], { p_ok: ['tok-omer'], p_gone: ['tok-gul'], p_fail: [] });
  assert.equal(cagri.push.length, 0);
});
