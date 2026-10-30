// Edge Function'ların saf mantığı (Deno ve Node'da aynı; G/Ç yok, Node'da test edilir).
import { parseDay, daysBetween, nextOccurrence, upcoming, milestones } from './gunler.js';

export const ROOM_RE = /^[a-z2-9]{10}$/;
export const CLIENT_RE = /^[A-Za-z0-9_-]{1,64}$/;
export const TURLER = ['dokunus', 'mesaj', 'mektup', 'ani', 'gun', 'oyun', 'soru', 'liste', 'izle'];
export const BASLIK_MAX = 60;
export const METIN_MAX = 140;
export const URL_MAX = 200;
export const GS_BASLANGIC = '2026-01-01';

// Yalnız bilinen push servisleri (schema.sql push_kaydet ile aynı liste).
const PUSH_HOST_RE = /^(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9.-]+\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)$/;
const IZINLI_KOKLER = new Set(['https://rose-omer.github.io']);
const YEREL_KOK_RE = /^(https?:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?|capacitor:\/\/localhost)$/;

// ---------- Metin ve girdi ----------

/** Kontrol karakterlerini atar, boşlukları sadeleştirir, en çok `max` karakter (emoji bölünmez). */
export function kisalt(s, max) {
  const t = String(s ?? '').replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, ' ').replace(/\s+/g, ' ').trim();
  const harfler = [...t];
  return harfler.length <= max ? t : harfler.slice(0, max - 1).join('').trimEnd() + '…';
}

/** Site köküne göre göreli, site içi adres; değilse ''. Örn. 'sayfalar/sohbet/?id=x#son'. */
export function goreliUrl(u) {
  const s = String(u ?? '').trim();
  if (!s || s.length > URL_MAX) return '';
  if (!/^[A-Za-z0-9_\-./?=&%#]+$/.test(s)) return '';
  if (s.startsWith('/') || s.includes('..') || s.includes('//')) return '';
  return s;
}

/** bildir isteğinin gövdesi → { deger } | { hata } */
export function istegiDogrula(govde) {
  if (!govde || typeof govde !== 'object' || Array.isArray(govde)) return { hata: 'gövde nesne olmalı' };
  const { room, from, tur } = govde;
  if (typeof room !== 'string' || !ROOM_RE.test(room)) return { hata: 'geçersiz oda' };
  if (typeof from !== 'string' || !CLIENT_RE.test(from)) return { hata: 'geçersiz gönderen' };
  if (!TURLER.includes(tur)) return { hata: 'geçersiz tür' };
  const baslik = kisalt(govde.baslik, BASLIK_MAX) || 'Biz İkimiz';
  const metin = kisalt(govde.metin, METIN_MAX);
  return { deger: { room, from, tur, baslik, metin, url: goreliUrl(govde.url) } };
}

/** sw.js'in okuduğu yük (JSON). */
export function pushYuku({ tur, baslik, metin, url }) {
  return JSON.stringify({ tur, baslik, metin: metin || '', url: url || '' });
}

export function endpointIzinli(endpoint) {
  try {
    const u = new URL(endpoint);
    return u.protocol === 'https:' && !u.port && PUSH_HOST_RE.test(u.hostname);
  } catch {
    return false;
  }
}

// ---------- CORS ve anahtarlar ----------

export function kokIzinli(origin) {
  return typeof origin === 'string' && (IZINLI_KOKLER.has(origin) || YEREL_KOK_RE.test(origin));
}

export function corsBasliklari(origin) {
  const h = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'apikey, authorization, content-type, x-client-info',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (kokIzinli(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

/** Sabit süreli karşılaştırma (anahtar tahmini için süre ölçümüne karşı). */
export function esitMi(a, b) {
  const x = String(a ?? '');
  const y = String(b ?? '');
  let fark = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) fark |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
  return fark === 0 && x.length > 0;
}

function jsonDegerleri(s) {
  try {
    const v = JSON.parse(s || '');
    if (typeof v === 'string') return [v];
    return v && typeof v === 'object' ? Object.values(v).filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** bildir'e gelen `apikey` başlığının kabul edildiği değerler (publishable / anon). env: ad → değer. */
export function publishableAnahtarlar(env) {
  return [
    env('PUBLISHABLE_KEY'),
    env('SUPABASE_ANON_KEY'),
    ...jsonDegerleri(env('SUPABASE_PUBLISHABLE_KEYS')),
  ].filter((x) => typeof x === 'string' && x.length > 0);
}

/** Sunucu (RLS'yi aşan) anahtar: yeni secret anahtar (eski anahtarlar kapatılmış olabilir), yoksa service_role. */
export function servisAnahtari(env) {
  return jsonDegerleri(env('SUPABASE_SECRET_KEYS'))[0] || env('SUPABASE_SERVICE_ROLE_KEY') || '';
}

/** PostgREST istek başlıkları. Eski JWT anahtarı Bearer olarak da gider; sb_secret_ gitmez. */
export function restBasliklari(anahtar) {
  const h = { apikey: anahtar, 'Content-Type': 'application/json' };
  if (anahtar.startsWith('eyJ')) h.Authorization = `Bearer ${anahtar}`;
  return h;
}

// ---------- Tarih ----------

/** Verilen andaki Türkiye günü 'YYYY-MM-DD' (Edge sunucusu UTC'de çalışır). */
export function istanbulGunu(an = new Date()) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(an);
  const g = (t) => p.find((x) => x.type === t).value;
  return `${g('year')}-${g('month')}-${g('day')}`;
}

/** Günün sorusu numarası: 2026-01-01 = 0. gün. gs belge id'si `<gunNo>-<clientId>`. */
export function gunNo(gun) {
  return daysBetween(GS_BASLANGIC, gun);
}

// ---------- Hatırlatma içerikleri ----------
// Olay: { baslik, metin, url, tur, kime?: clientId (yalnız o), haric?: clientId (o hariç herkes), sira }

const GUN_URL = 'sayfalar/gunler/';
const SORU_URL = 'sayfalar/gunun-sorusu/';

function onceBaslik(n, baslik, emoji) {
  const e = emoji ? ` ${emoji}` : '';
  if (n === 0) return `Bugün: ${baslik}${e}`;
  if (n === 1) return `Yarın: ${baslik}${e}`;
  return `${n} gün kaldı: ${baslik}${e}`;
}

function onceMetin(n, ek) {
  if (n === 0) return ek ? `${ek}, kutlu olsun 💗` : 'Birlikte güzel bir gün geçirin 💗';
  if (n === 1) return 'Unutma, yarın sizin için özel.';
  return 'Küçük bir sürpriz için tam zamanı.';
}

function kacinciEk({ tur, tekrar, kacinci }) {
  if (!(kacinci > 0) || tekrar === 'yok') return null;
  if (tekrar === 'ay') return `${kacinci}. ay`;
  if (tur === 'dogumgunu') return `${kacinci}. yaş`;
  if (tur === 'yildonumu') return `${kacinci}. yıl dönümü`;
  return null;
}

const temizHatirlat = (h, varsayilan) =>
  (Array.isArray(h) ? [...new Set(h)].filter((x) => x === 0 || x === 1 || x === 7) : varsayilan);

/**
 * Sabah 09:00 hatırlatmaları (bir oda).
 * gunler: 'gun' belgeleri ([{ id, data }]); kisiler: 'kisi' belgeleri (id = clientId); cift: 'cift' data | null.
 * Özel gün: kendi `hatirlat` listesi (yoksa yalnız gününde). Doğum günü: gününde ve 1 gün önce
 * (aynı ay-güne elle eklenmiş doğum günü varsa atlanır). Kilometre taşları: gününde.
 */
export function sabahOlaylari({ bugun, gunler = [], kisiler = [], cift = null }) {
  const out = [];
  const hatirlatlar = new Map(gunler.map((g) => [g.id, temizHatirlat(g?.data?.hatirlat, [0])]));
  for (const u of upcoming(gunler, { today: bugun, limit: 200, within: 7 })) {
    const liste = hatirlatlar.get(u.id) || [0];
    if (!liste.includes(u.daysLeft)) continue;
    out.push({
      baslik: onceBaslik(u.daysLeft, u.baslik, u.emoji),
      metin: onceMetin(u.daysLeft, kacinciEk(u)),
      url: GUN_URL, tur: 'gun', sira: u.daysLeft,
    });
  }

  const elleDogum = new Set(gunler
    .filter((g) => g?.data?.tur === 'dogumgunu' && parseDay(g.data.tarih))
    .map((g) => g.data.tarih.slice(5)));
  for (const k of kisiler) {
    const dogum = k?.data?.dogum;
    if (!parseDay(dogum) || elleDogum.has(dogum.slice(5))) continue;
    const date = nextOccurrence(dogum, 'yil', bugun);
    const n = date ? daysBetween(bugun, date) : NaN;
    if (n !== 0 && n !== 1) continue;
    const ad = kisalt(k.data.ad, 24);
    if (n === 0) {
      out.push({ baslik: ad ? `İyi ki doğdun, ${ad}! 🎂` : 'İyi ki doğdun! 🎂', metin: 'Bugün senin günün. Nice mutlu yıllara 💗', url: '', tur: 'gun', kime: k.id, sira: 0 });
      out.push({ baslik: 'Bugün sevgilinin doğum günü 🎂', metin: ad ? `${ad} için güzel bir gün yapalım 💗` : 'Güzel bir gün yapalım 💗', url: GUN_URL, tur: 'gun', haric: k.id, sira: 0 });
    } else {
      out.push({ baslik: 'Yarın sevgilinin doğum günü 🎁', metin: 'Hazırlık için son gün 😉', url: GUN_URL, tur: 'gun', haric: k.id, sira: 1 });
    }
  }

  if (cift?.baslangic && parseDay(cift.baslangic)) {
    for (const m of milestones(cift.baslangic, { today: bugun, limit: 6, monthly: true })) {
      if (m.daysLeft !== 0) continue;
      out.push({ baslik: `Bugün ${m.baslik} 💞`, metin: 'Birlikte nice günlere 💗', url: GUN_URL, tur: 'gun', sira: 0 });
    }
  }
  return out.sort((a, b) => a.sira - b.sira);
}

/**
 * Akşam 20:00: günün sorusu. gs: bugünün 'gs' belgeleri (id `<gunNo>-<clientId>`).
 * İkiniz de cevapladıysanız yok; biri cevapladıysa diğerine "sıra sende"; hiç cevap yoksa ikinize.
 */
export function aksamOlaylari({ bugun, gs = [] }) {
  const onek = `${gunNo(bugun)}-`;
  const cevaplayan = new Set(gs
    .filter((d) => typeof d?.id === 'string' && d.id.startsWith(onek) && String(d?.data?.cevap ?? '').trim())
    .map((d) => d.id.slice(onek.length)));
  if (cevaplayan.size >= 2) return { olaylar: [], cevaplayan };
  const olay = cevaplayan.size === 1
    ? { baslik: 'Sevgilin günün sorusunu cevapladı 💌', metin: 'Sıra sende; cevabını merak ediyor.', url: SORU_URL, tur: 'soru', sira: 0 }
    : { baslik: 'Günün sorusu seni bekliyor 💭', metin: 'İkinizin cevabını görmek için bir dakikan yeter.', url: SORU_URL, tur: 'soru', sira: 0 };
  return { olaylar: [olay], cevaplayan };
}

/** Bir cihaz için olayları tek bildirimde birleştirir. -> { tur, baslik, metin, url } | null */
export function cihazMesaji(olaylar, clientId) {
  const benim = olaylar.filter((o) => (o.kime ? o.kime === clientId : o.haric !== clientId));
  if (!benim.length) return null;
  const [ilk, ...diger] = benim;
  const metin = diger.length ? `${ilk.metin} · Ayrıca: ${diger.map((o) => o.baslik).join(' · ')}` : ilk.metin;
  return { tur: ilk.tur, baslik: kisalt(ilk.baslik, BASLIK_MAX), metin: kisalt(metin, METIN_MAX), url: ilk.url };
}

/**
 * Bir odanın gönderim planı.
 * belgeler: [{ kind, id, data }] (bu odanın), aboneler: [{ client, ... }] (Web Push aboneliği ya da FCM belirteci).
 * -> [{ abone, mesaj }]
 */
export function odaPlani({ slot, bugun, belgeler = [], aboneler = [] }) {
  const tur = (k) => belgeler.filter((d) => d.kind === k);
  if (slot === 'sabah') {
    const olaylar = sabahOlaylari({
      bugun, gunler: tur('gun'), kisiler: tur('kisi'), cift: tur('cift').find((d) => d.id === 'cift')?.data || null,
    });
    return aboneler.map((abone) => ({ abone, mesaj: cihazMesaji(olaylar, abone.client) })).filter((x) => x.mesaj);
  }
  if (slot === 'aksam') {
    const { olaylar, cevaplayan } = aksamOlaylari({ bugun, gs: tur('gs') });
    return aboneler
      .filter((a) => !cevaplayan.has(a.client))
      .map((abone) => ({ abone, mesaj: cihazMesaji(olaylar, abone.client) }))
      .filter((x) => x.mesaj);
  }
  return [];
}

/** Satırları odaya göre gruplar: [{ room, ... }] → Map(room → satırlar). */
export function odayaGore(satirlar) {
  const m = new Map();
  for (const s of satirlar || []) {
    if (!m.has(s.room)) m.set(s.room, []);
    m.get(s.room).push(s);
  }
  return m;
}
