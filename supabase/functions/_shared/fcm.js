// FCM HTTP v1 gönderimi (Android uygulaması; js/core/mobil.js belirteci kaydeder).
// Yalnız Web Crypto + fetch: Supabase Edge (Deno) ve Node'da aynı çalışır; npm paketi yok.
// Hizmet hesabı: FCM_SERVICE_ACCOUNT secret'ı = Firebase konsolu > Proje ayarları > Hizmet hesapları >
// "Yeni özel anahtar oluştur" JSON'unun tam metni. Yoksa FCM atlanır (Web Push sürer).
// Erişim belirteci: RS256 imzalı JWT → OAuth2 jwt-bearer; süresi dolmadan 1 dk önceye dek önbellekte.
import { b64uKodla, b64uCoz } from './webpush.js';

export const TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
// Uygulamadaki karşılıkları: kanal js/core/mobil.js FCM_KANAL; ikon ve renk mobil/android-ek/res.
export const FCM_KANAL = 'biz-ikimiz';
export const FCM_IKON = 'ic_stat_kalp';
export const FCM_RENK = '#C2375C';
const PAY_MS = 60_000;
const TTL = '86400s'; // Web Push ile aynı: 1 günden eski bildirim gönderilmez

const enc = new TextEncoder();

/**
 * env('FCM_SERVICE_ACCOUNT') → { projectId, email, kid, pem } | null (tanımlı değil).
 * Tanımlı ama bozuksa hata fırlatır (çağıran günlüğe yazar ve FCM'yi atlar).
 */
export function fcmHesabi(env) {
  const ham = String(env('FCM_SERVICE_ACCOUNT') ?? '').trim();
  if (!ham) return null;
  let j;
  try {
    j = JSON.parse(ham);
  } catch {
    throw new Error('FCM_SERVICE_ACCOUNT JSON değil');
  }
  const projectId = j?.project_id;
  const email = j?.client_email;
  const pem = j?.private_key;
  if (typeof projectId !== 'string' || !/^[a-z0-9-]{4,64}$/.test(projectId)) throw new Error('FCM_SERVICE_ACCOUNT: project_id geçersiz');
  if (typeof email !== 'string' || !email.includes('@')) throw new Error('FCM_SERVICE_ACCOUNT: client_email yok');
  if (typeof pem !== 'string' || !pem.includes('PRIVATE KEY')) throw new Error('FCM_SERVICE_ACCOUNT: private_key yok');
  return { projectId, email, kid: typeof j.private_key_id === 'string' ? j.private_key_id : '', pem };
}

/** PEM (PKCS#8) → DER baytları. Secret'a kaçışlı "\n" ile yapıştırılmış anahtarı da okur. */
function pemDer(pem) {
  return b64uCoz(pem.replace(/\\n/g, '\n').replace(/-----[A-Z ]+-----/g, ''));
}

const anahtarlar = new Map(); // pem → Promise<CryptoKey>
function imzaAnahtari(pem) {
  if (!anahtarlar.has(pem)) {
    const p = crypto.subtle.importKey('pkcs8', pemDer(pem), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
    p.catch(() => anahtarlar.delete(pem));
    anahtarlar.set(pem, p);
  }
  return anahtarlar.get(pem);
}

/** Google OAuth2 için RS256 imzalı JWT (1 saat geçerli). */
export async function fcmJwt(hesap, simdi = Date.now()) {
  const iat = Math.floor(simdi / 1000);
  const baslik = { alg: 'RS256', typ: 'JWT', ...(hesap.kid ? { kid: hesap.kid } : {}) };
  const govde = { iss: hesap.email, scope: FCM_SCOPE, aud: TOKEN_URL, iat, exp: iat + 3600 };
  const girdi = `${b64uKodla(enc.encode(JSON.stringify(baslik)))}.${b64uKodla(enc.encode(JSON.stringify(govde)))}`;
  const imza = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', await imzaAnahtari(hesap.pem), enc.encode(girdi));
  return `${girdi}.${b64uKodla(new Uint8Array(imza))}`;
}

const belirtecler = new Map(); // hesap → { deger, son }

/** Erişim belirteci (önbellekten ya da OAuth2'den). Alınamazsa hata fırlatır. */
export async function erisimBelirteci(hesap, { fetchFn = fetch, simdi = Date.now() } = {}) {
  const k = `${hesap.email}\n${hesap.pem}`;
  const b = belirtecler.get(k);
  if (b && b.son > simdi) return b.deger;
  const res = await fetchFn(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: await fcmJwt(hesap, simdi) }).toString(),
  });
  const veri = await res.json().catch(() => null);
  if (!res.ok || typeof veri?.access_token !== 'string') {
    throw new Error(`FCM erişim belirteci alınamadı: HTTP ${res.status} ${veri?.error || ''}`.trim());
  }
  const sure = Number(veri.expires_in) > 0 ? Number(veri.expires_in) * 1000 : 3_600_000;
  belirtecler.set(k, { deger: veri.access_token, son: simdi + sure - PAY_MS });
  return veri.access_token;
}

/** FCM HTTP v1 istek gövdesi. mesaj = { tur, baslik, metin, url } (bildir/hatirlat doğrulamış ve kısaltmış). */
export function fcmGovdesi(token, { tur, baslik, metin, url }) {
  const notification = { title: baslik || 'Biz İkimiz' };
  if (metin) notification.body = metin;
  return {
    message: {
      token,
      notification,
      data: { url: url || '', tur: tur || '' }, // uygulama dokununca data.url'yi açar
      android: {
        priority: 'high',
        ttl: TTL,
        // tag: aynı türün yenisi eskisinin yerine geçer (sw.js 'biz-<tur>' gibi).
        notification: { channel_id: FCM_KANAL, icon: FCM_IKON, color: FCM_RENK, ...(tur ? { tag: tur } : {}) },
      },
    },
  };
}

/** FCM hata yanıtı belirtecin kalıcı olarak geçersiz olduğunu mu söylüyor? (silinmeli) */
export function belirtecGecersiz(status, hata) {
  if (status === 404) return true; // NOT_FOUND / UNREGISTERED: uygulama kaldırıldı ya da belirteç silindi
  const ayrinti = Array.isArray(hata?.details) ? hata.details : [];
  const kodlar = ayrinti.map((d) => d?.errorCode);
  if (kodlar.includes('UNREGISTERED') || kodlar.includes('SENDER_ID_MISMATCH')) return true;
  if (status !== 400) return false;
  // INVALID_ARGUMENT yalnız belirteçle ilgiliyse: aksi hâlde gövde hatası tüm belirteçleri sildirirdi.
  const alanlar = ayrinti.flatMap((d) => (Array.isArray(d?.fieldViolations) ? d.fieldViolations : [])).map((f) => f?.field);
  return alanlar.includes('message.token') || /registration token/i.test(String(hata?.message || ''));
}

/**
 * Tek belirtece gönderir. Hata fırlatmaz.
 * -> { token, status, ok, gone, yetki, hata? }  gone: belirteç silinmeli; yetki: 401/403 (sunucu ayarı sorunu,
 *    belirtecin suçu değil; sonuç yazılmaz). 401'de erişim belirteci önbellekten atılır.
 */
export async function fcmGonder(token, mesaj, { hesap, erisim, fetchFn = fetch }) {
  try {
    const res = await fetchFn(`https://fcm.googleapis.com/v1/projects/${hesap.projectId}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${erisim}`, 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(fcmGovdesi(token, mesaj)),
    });
    const status = res.status;
    const ok = status >= 200 && status < 300;
    const hata = ok ? null : (await res.json().catch(() => null))?.error || null;
    if (ok) await res.body?.cancel?.().catch(() => {});
    if (status === 401) belirtecler.delete(`${hesap.email}\n${hesap.pem}`);
    const gone = !ok && belirtecGecersiz(status, hata);
    const sonuc = { token, status, ok, gone, yetki: !gone && (status === 401 || status === 403) };
    if (hata) sonuc.hata = hata.status || hata.message || String(status);
    return sonuc;
  } catch (e) {
    return { token, status: 0, ok: false, gone: false, yetki: false, hata: String(e?.message || e) };
  }
}
