// Web Push gönderimi: RFC 8291 (aes128gcm şifreleme) + RFC 8292 (VAPID).
// Yalnız Web Crypto kullanır: Supabase Edge (Deno) ve Node'da aynı çalışır; npm paketi yok.
// Anahtar biçimi web-push ile aynı: genel = 65 bayt sıkıştırılmamış P-256 noktası, özel = 32 bayt d (base64url).

const enc = new TextEncoder();
const subtle = () => globalThis.crypto.subtle;

export function b64uKodla(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** base64url (ya da base64; dolgu ve boşluk olabilir) → Uint8Array. */
export function b64uCoz(s) {
  const t = String(s ?? '').replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  const bin = atob(t + '='.repeat((4 - (t.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function birlestir(...parcalar) {
  const out = new Uint8Array(parcalar.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of parcalar) {
    out.set(p, i);
    i += p.length;
  }
  return out;
}

async function hkdf(salt, ikm, info, uzunluk) {
  const key = await subtle().importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await subtle().deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, uzunluk * 8));
}

function noktaCoz(b64u, ad) {
  const p = b64uCoz(b64u);
  if (p.length !== 65 || p[0] !== 4) throw new Error(`${ad} geçersiz`);
  return p;
}

/** Genel nokta + özel d → JWK (ECDSA imza ya da ECDH için içe aktarılır). */
export function ecJwk(genelB64u, ozelB64u) {
  const p = noktaCoz(genelB64u, 'genel anahtar');
  const d = b64uCoz(ozelB64u);
  if (d.length !== 32) throw new Error('özel anahtar geçersiz');
  return { kty: 'EC', crv: 'P-256', x: b64uKodla(p.slice(1, 33)), y: b64uKodla(p.slice(33)), d: b64uKodla(d) };
}

/**
 * RFC 8291: yükü aboneliğin anahtarlarıyla şifreler → istek gövdesi (başlık + şifreli metin).
 * abone = { p256dh, auth }. secenek.salt ve secenek.asAnahtar yalnız test içindir (RFC örneği).
 */
export async function sifrele(yuk, { p256dh, auth }, { salt, asAnahtar, rs = 4096 } = {}) {
  const uaGenel = noktaCoz(p256dh, 'p256dh');
  const authSecret = b64uCoz(auth);
  if (authSecret.length !== 16) throw new Error('auth geçersiz');
  const duz = typeof yuk === 'string' ? enc.encode(yuk) : new Uint8Array(yuk);
  if (duz.length + 17 > rs) throw new Error('yük çok büyük');

  const as = asAnahtar || await subtle().generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asGenel = new Uint8Array(await subtle().exportKey('raw', as.publicKey));
  const uaKey = await subtle().importKey('raw', uaGenel, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await subtle().deriveBits({ name: 'ECDH', public: uaKey }, as.privateKey, 256));

  const ikm = await hkdf(authSecret, ecdh, birlestir(enc.encode('WebPush: info\0'), uaGenel, asGenel), 32);
  const tuz = salt || globalThis.crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(tuz, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(tuz, ikm, enc.encode('Content-Encoding: nonce\0'), 12);

  const aes = await subtle().importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const sifreli = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv: nonce }, aes, birlestir(duz, new Uint8Array([2]))));

  const baslik = new Uint8Array(16 + 4 + 1 + asGenel.length);
  baslik.set(tuz, 0);
  new DataView(baslik.buffer).setUint32(16, rs);
  baslik[20] = asGenel.length;
  baslik.set(asGenel, 21);
  return birlestir(baslik, sifreli);
}

/** VAPID anahtarlarını bir kez içe aktarır. -> { key, publicKey, subject } */
export async function vapidHazirla({ publicKey, privateKey, subject }) {
  const jwk = ecJwk(publicKey, privateKey);
  const key = await subtle().importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  if (!/^(mailto:|https:)/.test(String(subject || ''))) throw new Error('VAPID subject mailto: ya da https: olmalı');
  return { key, publicKey: b64uKodla(noktaCoz(publicKey, 'genel anahtar')), subject };
}

/** RFC 8292 Authorization başlığı: `vapid t=<JWT>, k=<genel anahtar>`. JWT 12 saat geçerli. */
export async function vapidBasligi(endpoint, vapid, simdi = Date.now()) {
  const aud = new URL(endpoint).origin;
  const exp = Math.floor(simdi / 1000) + 12 * 3600;
  const h = b64uKodla(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const p = b64uKodla(enc.encode(JSON.stringify({ aud, exp, sub: vapid.subject })));
  // Web Crypto ECDSA imzası zaten JWS'in istediği ham r||s (64 bayt) biçimindedir.
  const imza = await subtle().sign({ name: 'ECDSA', hash: 'SHA-256' }, vapid.key, enc.encode(`${h}.${p}`));
  return `vapid t=${h}.${p}.${b64uKodla(new Uint8Array(imza))}, k=${vapid.publicKey}`;
}

/**
 * Tek aboneliğe gönderir. Hata fırlatmaz.
 * abone = { endpoint, p256dh, auth }. -> { endpoint, status, ok, gone } (gone: 404/410, abonelik silinmeli)
 */
export async function pushGonder(abone, yuk, vapid, { fetchFn = fetch, ttl = 86400, urgency = 'normal' } = {}) {
  try {
    const govde = await sifrele(yuk, abone);
    const res = await fetchFn(abone.endpoint, {
      method: 'POST',
      headers: {
        Authorization: await vapidBasligi(abone.endpoint, vapid),
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: String(ttl),
        Urgency: urgency,
      },
      body: govde,
    });
    await res.body?.cancel?.().catch(() => {});
    const status = res.status;
    return { endpoint: abone.endpoint, status, ok: status >= 200 && status < 300, gone: status === 404 || status === 410 };
  } catch (e) {
    return { endpoint: abone.endpoint, status: 0, ok: false, gone: false, hata: String(e?.message || e) };
  }
}
