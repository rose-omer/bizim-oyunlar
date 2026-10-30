// supabase/functions/_shared/webpush.js: RFC 8291 örneği, çözme gidiş-dönüş, VAPID JWT imzası.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  b64uKodla, b64uCoz, ecJwk, sifrele, vapidHazirla, vapidBasligi, pushGonder,
} from '../supabase/functions/_shared/webpush.js';

const subtle = globalThis.crypto.subtle;
const enc = new TextEncoder();
const bosluksuz = (s) => s.replace(/\s+/g, '');

// RFC 8291 Ek A (boşluklar kaldırıldı).
const RFC = {
  duz: 'When I grow up, I want to be a watermelon',
  asGenel: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  asOzel: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  uaGenel: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  baslik: bosluksuz('DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z 9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml mlMoZIIgDll6e3vCYLocInmYWAmS6Tlz AC8wEqKK6PBru3jl7A8'),
  sifreli: bosluksuz('8pfeW0KbunFT06SuDKoJH9Ql87S1QUrd irN6GcG7sFz1y1sqLgVi1VhjVkHsUoEs bI_0LpXMuGvnzQ'),
};

async function ecdhCifti(genel, ozel) {
  const jwk = ecJwk(genel, ozel);
  return {
    privateKey: await subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']),
    publicKey: await subtle.importKey('raw', b64uCoz(genel), { name: 'ECDH', namedCurve: 'P-256' }, true, []),
  };
}

// Alıcı tarafı (tarayıcının yaptığı): RFC 8291'e göre çöz. Testte bağımsız doğrulama için.
async function coz(govde, uaCift, uaGenelB64, authB64) {
  const salt = govde.slice(0, 16);
  const rs = new DataView(govde.buffer, govde.byteOffset).getUint32(16);
  const idlen = govde[20];
  const asGenel = govde.slice(21, 21 + idlen);
  const sifreli = govde.slice(21 + idlen);
  const asKey = await subtle.importKey('raw', asGenel, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await subtle.deriveBits({ name: 'ECDH', public: asKey }, uaCift.privateKey, 256));
  const hk = async (s, ikm, info, n) => new Uint8Array(await subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: s, info }, await subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']), n * 8));
  const uaGenel = b64uCoz(uaGenelB64);
  const keyInfo = new Uint8Array([...enc.encode('WebPush: info\0'), ...uaGenel, ...asGenel]);
  const ikm = await hk(b64uCoz(authB64), ecdh, keyInfo, 32);
  const cek = await hk(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hk(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const aes = await subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const duz = new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: nonce }, aes, sifreli));
  assert.equal(duz[duz.length - 1], 2, 'son kayıt ayıracı 0x02');
  return { rs, metin: new TextDecoder().decode(duz.slice(0, -1)) };
}

test('base64url gidiş-dönüş; dolgulu ve standart base64 da çözülür', () => {
  const b = new Uint8Array([0, 251, 255, 62, 63, 1]);
  assert.equal(b64uKodla(b), 'APv_Pj8B');
  assert.deepEqual(b64uCoz('APv_Pj8B'), b);
  assert.deepEqual(b64uCoz('APv/Pj8B'), b);
  assert.deepEqual(b64uCoz('AQ=='), new Uint8Array([1]));
});

test('RFC 8291 Ek A: aynı başlık ve şifreli metin', async () => {
  const govde = await sifrele(RFC.duz, { p256dh: RFC.uaGenel, auth: RFC.auth }, {
    salt: b64uCoz(RFC.salt), asAnahtar: await ecdhCifti(RFC.asGenel, RFC.asOzel),
  });
  assert.equal(govde.length, 86 + b64uCoz(RFC.sifreli).length);
  assert.equal(b64uKodla(govde.slice(0, 86)), RFC.baslik);
  assert.equal(b64uKodla(govde.slice(86)), RFC.sifreli);
});

test('rastgele anahtarlarla şifrele → alıcı çözer (Türkçe ve emoji)', async () => {
  const ua = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const uaGenel = b64uKodla(new Uint8Array(await subtle.exportKey('raw', ua.publicKey)));
  const auth = b64uKodla(globalThis.crypto.getRandomValues(new Uint8Array(16)));
  const yuk = JSON.stringify({ baslik: 'Gül sana kalp gönderdi 💗', metin: 'Şimdi bak, ığüşöç', url: 'sayfalar/sohbet/' });
  const govde = await sifrele(yuk, { p256dh: uaGenel, auth });
  const { rs, metin } = await coz(govde, ua, uaGenel, auth);
  assert.equal(rs, 4096);
  assert.equal(metin, yuk);
  await assert.rejects(sifrele('x', { p256dh: 'kisa', auth }), /p256dh/);
  await assert.rejects(sifrele('x', { p256dh: uaGenel, auth: 'AAAA' }), /auth/);
  await assert.rejects(sifrele('x'.repeat(5000), { p256dh: uaGenel, auth }), /büyük/);
});

async function vapidCifti() {
  const k = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await subtle.exportKey('jwk', k.privateKey);
  const genel = b64uKodla(new Uint8Array(await subtle.exportKey('raw', k.publicKey)));
  return { publicKey: genel, privateKey: jwk.d, dogrula: k.publicKey };
}

test('VAPID başlığı: geçerli ES256 JWT, aud = push servisinin kökeni, 12 saat', async () => {
  const c = await vapidCifti();
  const vapid = await vapidHazirla({ publicKey: c.publicKey, privateKey: c.privateKey, subject: 'https://rose-omer.github.io/bizim-oyunlar/' });
  const simdi = Date.UTC(2026, 9, 30, 6, 0, 0);
  const h = await vapidBasligi('https://fcm.googleapis.com/fcm/send/abc:def', vapid, simdi);
  const m = /^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/.exec(h);
  assert.ok(m, h);
  assert.equal(m[4], c.publicKey);
  assert.deepEqual(JSON.parse(new TextDecoder().decode(b64uCoz(m[1]))), { typ: 'JWT', alg: 'ES256' });
  const govde = JSON.parse(new TextDecoder().decode(b64uCoz(m[2])));
  assert.deepEqual(govde, { aud: 'https://fcm.googleapis.com', exp: simdi / 1000 + 43200, sub: 'https://rose-omer.github.io/bizim-oyunlar/' });
  const imza = b64uCoz(m[3]);
  assert.equal(imza.length, 64);
  assert.ok(await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, c.dogrula, imza, enc.encode(`${m[1]}.${m[2]}`)));
  await assert.rejects(vapidHazirla({ publicKey: c.publicKey, privateKey: c.privateKey, subject: 'kim' }), /subject/);
  await assert.rejects(vapidHazirla({ publicKey: 'AAAA', privateKey: c.privateKey, subject: 'mailto:a@b.c' }), /genel/);
});

test('pushGonder: başlıklar; 201 ok, 410 gone, ağ hatası fırlatmaz', async () => {
  const c = await vapidCifti();
  const vapid = await vapidHazirla({ ...c, subject: 'https://ornek.test/' });
  const ua = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const abone = {
    endpoint: 'https://web.push.apple.com/QAbc',
    p256dh: b64uKodla(new Uint8Array(await subtle.exportKey('raw', ua.publicKey))),
    auth: b64uKodla(new Uint8Array(16)),
  };
  let istek;
  const r1 = await pushGonder(abone, '{"baslik":"x"}', vapid, {
    urgency: 'high',
    fetchFn: async (url, init) => { istek = { url, init }; return new Response(null, { status: 201 }); },
  });
  assert.deepEqual(r1, { endpoint: abone.endpoint, status: 201, ok: true, gone: false });
  assert.equal(istek.url, abone.endpoint);
  assert.equal(istek.init.method, 'POST');
  assert.equal(istek.init.headers['Content-Encoding'], 'aes128gcm');
  assert.equal(istek.init.headers.TTL, '86400');
  assert.equal(istek.init.headers.Urgency, 'high');
  assert.match(istek.init.headers.Authorization, /^vapid t=.+, k=/);
  assert.equal((await coz(istek.init.body, ua, abone.p256dh, abone.auth)).metin, '{"baslik":"x"}');

  const r2 = await pushGonder(abone, 'x', vapid, { fetchFn: async () => new Response('gone', { status: 410 }) });
  assert.equal(r2.gone, true);
  assert.equal(r2.ok, false);
  const r3 = await pushGonder(abone, 'x', vapid, { fetchFn: async () => { throw new Error('ağ yok'); } });
  assert.equal(r3.status, 0);
  assert.equal(r3.gone, false);
  assert.match(r3.hata, /ağ yok/);
});
