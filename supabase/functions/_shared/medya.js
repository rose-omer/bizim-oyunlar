// Edge Function 'medya': kovaya tek kapı. Ortam (env) ve fetch dışarıdan verilir (bkz. isleyici.js).
// POST ?islem=imzala  { room, cihaz, anahtar, yollar: [en çok 100] } → { adresler: { yol: url }, eksik: [yol], sure }
// POST ?islem=yukle   ham dosya; başlık x-oda, x-cihaz, x-anahtar, Content-Type, isteğe bağlı x-yol (geri yükleme) → { yol, tur, bayt }
// POST ?islem=temizle başlık x-hatirlat-anahtar (pg_cron) → { silinen }
// Cihaz yetkisi ve sınırlar SQL'de (schema.sql 9. bölüm); kova işlemleri servis anahtarıyla.
import { kokIzinli, esitMi, publishableAnahtarlar, servisAnahtari, restBasliklari } from './mantik.js';
import { rpcIstemcisi, anahtarKaynagi } from './isleyici.js';

export const KOVA = 'photos';
export const IMZA_SURE = 3600; // sn: çıkarılan cihazın elindeki adres en çok bu kadar çalışır
const YOL_RE = /^[a-z2-9]{10}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|webp|webm|m4a)$/;
const ODA_RE = /^[a-z2-9]{10}$/;
const CIHAZ_RE = /^[A-Za-z0-9_-]{1,64}$/;
const ANAHTAR_RE = /^[A-Za-z0-9_-]{43}$/;
const YOL_MAX = 100;
const GOVDE_MAX = 16 * 1024;
const FOTO_MAX = 5 * 1024 * 1024;
const SES_MAX = 2 * 1024 * 1024;
const TEMIZLE_PARTI = 200;
const TEMIZLE_TUR = 5;
// Ev sunucusu yerel ağdan http ile açılır. Yetki cihaz anahtarında; köken yalnız ikinci bir süzgeçtir.
const YEREL_AG_RE = /^http:\/\/(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d{1,5})?$/;

export const yolGecerli = (y) => typeof y === 'string' && YOL_RE.test(y);
const kokUygun = (origin) => kokIzinli(origin) || YEREL_AG_RE.test(String(origin));

const ayni = (b, s, o = 0) => [...s].every((c, i) => b[o + i] === c.charCodeAt(0));
const TURLER = {
  'image/jpeg': { uzanti: 'jpg', tur: 'foto', imza: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  // WebP yazamayan tarayıcının çizimi PNG olur; yol uzantısı istemciyle aynı kalır (.jpg, gerçek tür Content-Type'ta).
  'image/png': { uzanti: 'jpg', tur: 'foto', imza: (b) => b[0] === 0x89 && ayni(b, 'PNG', 1) },
  'image/webp': { uzanti: 'webp', tur: 'foto', imza: (b) => ayni(b, 'RIFF') && ayni(b, 'WEBP', 8) },
  'audio/webm': { uzanti: 'webm', tur: 'ses', imza: (b) => b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3 },
  'audio/mp4': { uzanti: 'm4a', tur: 'ses', imza: (b) => ayni(b, 'ftyp', 4) },
};

/** Beyan edilen tür + dosyanın ilk baytları → { mime, uzanti, tur } | null. Kova yalnız bunları kabul eder. */
export function turCoz(beyan, baytlar) {
  const mime = String(beyan || '').split(';')[0].trim().toLowerCase();
  const t = TURLER[mime];
  return t && t.imza(baytlar) ? { mime, uzanti: t.uzanti, tur: t.tur } : null;
}

function corsBasliklari(origin) {
  const h = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'apikey, authorization, content-type, x-client-info, x-oda, x-cihaz, x-anahtar, x-yol',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (kokUygun(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

/** Gövdeyi en çok max bayt okur. Fazlaysa null (okumayı keser). */
async function govdeOku(req, max) {
  if (Number(req.headers.get('content-length') || 0) > max) return null;
  if (!req.body) return new Uint8Array(0);
  const parcalar = [];
  let n = 0;
  const okuyucu = req.body.getReader();
  for (;;) {
    const { done, value } = await okuyucu.read();
    if (done) break;
    n += value.length;
    if (n > max) {
      await okuyucu.cancel().catch(() => {});
      return null;
    }
    parcalar.push(value);
  }
  const out = new Uint8Array(n);
  let i = 0;
  for (const p of parcalar) {
    out.set(p, i);
    i += p.length;
  }
  return out;
}

function kovaIstemcisi(env, fetchFn) {
  const url = String(env('SUPABASE_URL') || '').replace(/\/+$/, '');
  const anahtar = servisAnahtari(env);
  if (!url || !anahtar) throw new Error('SUPABASE_URL ya da servis anahtarı yok');
  return { url, depo: (yol, init) => fetchFn(`${url}/storage/v1/${yol}`, { ...init, headers: { ...restBasliklari(anahtar), ...init.headers } }) };
}

const kimlikGecerli = (room, cihaz, anahtar) => ODA_RE.test(room || '') && CIHAZ_RE.test(cihaz || '') && ANAHTAR_RE.test(anahtar || '');

export function medyaIsleyici({ env, fetchFn = fetch }) {
  const temizlikAnahtari = anahtarKaynagi(env, fetchFn);

  const rpcHatasi = (e, yanit, etiket) => {
    if (e.code === '42501') return yanit(403, { hata: 'yetki yok' });
    if (e.code === '22023') return yanit(400, { hata: 'geçersiz istek' });
    if (e.code === '54000') {
      const dolu = /dolu/.test(e.message || '');
      return yanit(429, { hata: dolu ? 'depolama dolu' : 'çok fazla yükleme', neden: dolu ? 'dolu' : 'hiz' });
    }
    console.error(`[medya] ${etiket}`, e.message);
    return yanit(502, { hata: 'veritabanına ulaşılamadı' });
  };

  async function imzala(req, yanit) {
    const metin = await govdeOku(req, GOVDE_MAX);
    if (!metin) return yanit(413, { hata: 'istek çok büyük' });
    let g;
    try { g = JSON.parse(new TextDecoder().decode(metin)); } catch { return yanit(400, { hata: 'JSON değil' }); }
    const { room, cihaz, anahtar, yollar } = g || {};
    if (!kimlikGecerli(room, cihaz, anahtar)) return yanit(400, { hata: 'geçersiz kimlik' });
    if (!Array.isArray(yollar) || !yollar.length || yollar.length > YOL_MAX) return yanit(400, { hata: 'geçersiz liste' });
    if (!yollar.every((y) => yolGecerli(y) && y.startsWith(`${room}/`))) return yanit(400, { hata: 'geçersiz yol' });
    try {
      await rpcIstemcisi(env, fetchFn)('medya_imza_izni', { p_room: room, p_cihaz: cihaz, p_anahtar: anahtar });
    } catch (e) {
      return rpcHatasi(e, yanit, 'imza izni');
    }
    const { url, depo } = kovaIstemcisi(env, fetchFn);
    const res = await depo(`object/sign/${KOVA}`, {
      method: 'POST', body: JSON.stringify({ expiresIn: IMZA_SURE, paths: [...new Set(yollar)] }),
    });
    if (!res.ok) {
      console.error('[medya] imza', res.status);
      return yanit(502, { hata: 'depoya ulaşılamadı' });
    }
    const adresler = {};
    const eksik = [];
    for (const s of await res.json()) {
      if (s.signedURL) adresler[s.path] = `${url}/storage/v1${s.signedURL}`;
      else eksik.push(s.path);
    }
    return yanit(200, { adresler, eksik, sure: IMZA_SURE });
  }

  async function yukle(req, yanit) {
    const room = req.headers.get('x-oda');
    const cihaz = req.headers.get('x-cihaz');
    const anahtar = req.headers.get('x-anahtar');
    if (!kimlikGecerli(room, cihaz, anahtar)) return yanit(400, { hata: 'geçersiz kimlik' });
    const beyan = req.headers.get('content-type');
    const sesMi = /^audio\//i.test(beyan || '');
    const baytlar = await govdeOku(req, sesMi ? SES_MAX : FOTO_MAX);
    if (!baytlar) return yanit(413, { hata: 'dosya çok büyük' });
    if (!baytlar.length) return yanit(400, { hata: 'dosya boş' });
    const t = turCoz(beyan, baytlar);
    if (!t) return yanit(415, { hata: 'bu dosya türü kabul edilmiyor' });
    const verilen = req.headers.get('x-yol');
    if (verilen && !(yolGecerli(verilen) && verilen.startsWith(`${room}/`) && verilen.endsWith(`.${t.uzanti}`))) {
      return yanit(400, { hata: 'geçersiz yol' });
    }
    try {
      await rpcIstemcisi(env, fetchFn)('medya_yukleme_izni', {
        p_room: room, p_cihaz: cihaz, p_anahtar: anahtar, p_bayt: baytlar.length, p_tur: t.tur,
      });
    } catch (e) {
      return rpcHatasi(e, yanit, 'yükleme izni');
    }
    const yol = verilen || `${room}/${globalThis.crypto.randomUUID()}.${t.uzanti}`;
    const { depo } = kovaIstemcisi(env, fetchFn);
    const res = await depo(`object/${KOVA}/${yol}`, {
      method: 'POST', body: baytlar, headers: { 'Content-Type': t.mime, 'x-upsert': 'false', 'cache-control': 'max-age=3600' },
    });
    if (!res.ok) {
      const ayrinti = await res.json().catch(() => ({}));
      if (res.status === 409 || String(ayrinti?.statusCode) === '409') return yanit(409, { var: true, yol });
      console.error('[medya] yükleme', res.status);
      return yanit(502, { hata: 'depoya ulaşılamadı' });
    }
    return yanit(200, { yol, tur: t.tur, bayt: baytlar.length });
  }

  async function temizle(req, yanit) {
    const beklenen = await temizlikAnahtari();
    if (!beklenen) return yanit(500, { hata: 'anahtar yok' });
    if (!esitMi(req.headers.get('x-hatirlat-anahtar'), beklenen)) return yanit(401, { hata: 'geçersiz anahtar' });
    const rpc = rpcIstemcisi(env, fetchFn);
    const { depo } = kovaIstemcisi(env, fetchFn);
    let silinen = 0;
    for (let i = 0; i < TEMIZLE_TUR; i++) {
      const parti = ((await rpc('medya_silinecekler', { p_limit: TEMIZLE_PARTI })) || []);
      const gecerli = parti.filter(yolGecerli);
      if (!parti.length) break;
      if (gecerli.length) {
        const res = await depo(`object/${KOVA}`, { method: 'DELETE', body: JSON.stringify({ prefixes: gecerli }) });
        if (!res.ok) {
          console.error('[medya] silme', res.status);
          return yanit(502, { hata: 'depoya ulaşılamadı', silinen });
        }
      }
      await rpc('medya_silindi', { p_yollar: parti });
      silinen += gecerli.length;
    }
    console.log('[medya] temizlik', silinen);
    return yanit(200, { silinen });
  }

  return async (req) => {
    const origin = req.headers.get('origin');
    const cors = corsBasliklari(origin);
    const yanit = (status, veri) => new Response(JSON.stringify(veri), {
      status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' },
    });
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (req.method !== 'POST') return yanit(405, { hata: 'yalnız POST' });
    if (origin && !kokUygun(origin)) return yanit(403, { hata: 'bu adresten izin yok' });
    const islem = new URL(req.url).searchParams.get('islem');
    try {
      if (islem === 'temizle') return await temizle(req, yanit);
      const anahtarlar = publishableAnahtarlar(env);
      if (!anahtarlar.length) return yanit(500, { hata: 'sunucu ayarı eksik' });
      const verilen = req.headers.get('apikey') || '';
      if (!anahtarlar.some((a) => esitMi(a, verilen))) return yanit(401, { hata: 'geçersiz anahtar' });
      if (islem === 'imzala') return await imzala(req, yanit);
      if (islem === 'yukle') return await yukle(req, yanit);
      return yanit(404, { hata: 'bilinmeyen işlem' });
    } catch (e) {
      console.error('[medya]', e?.message || e);
      return yanit(500, { hata: 'sunucu hatası' });
    }
  };
}
