// Fotoğraf ve sesli mesaj depolama. Supabase: kova, Edge Function 'medya' üstünden (cihaz yetkisi, imzalı adres).
// Belgede duran başvuru adres değil konum bilgisidir: eski herkese açık adres ya da 'kova:<oda>/<uuid>.<uzantı>'.
// <img src> için medyaAdresi kullan. İşlev yoksa (geçiş) kova açıkken açık adrese düşülür. Yerel mod: IndexedDB.
import { SUPABASE_URL, SUPABASE_ANON_KEY, PHOTO_BUCKET, MEDYA_KOVA_BICIMI } from '../config.js';
import { isLocalMode, isValidRoomId, uuid } from './identity.js';
import { getSupabase } from './room.js';
import { kimlik } from './uyelik.js';
import { imzaDeposu } from './medya-imza.js';

const LOCAL_PREFIX = 'local:';
export const KOVA_ONEK = 'kova:';
const YOL_RE = /^[a-z2-9]{10}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|webp|webm|m4a)$/;
const K_IMZA = 'bizim.imza';
const IMZA_BEKLE_MS = 10_000;
const IDB_NAME = 'bizim-local';
const IDB_STORE = 'photos';
const SAFE_PATH_RE = /^[A-Za-z0-9._/-]+$/; // %, \, ?, # yok: kodlanmış '..' ile kovadan çıkılamaz
export const SES_MAX_BAYT = 2 * 1024 * 1024;
const SES_UZANTI = { 'audio/webm': 'webm', 'audio/mp4': 'm4a' }; // kova yalnız bunları kabul eder (schema.sql §3)

/** Saf: kayıt türü → { mime (parametresiz, kovaya giden), uzanti } | null. */
export function sesTuru(mime) {
  const t = String(mime || '').split(';')[0].trim().toLowerCase();
  return SES_UZANTI[t] ? { mime: t, uzanti: SES_UZANTI[t] } : null;
}

/** Saf: fotoğraf yolu uzantısı. WebP → 'webp'; JPEG (ve eski davranış) → 'jpg'. */
export function fotoUzantisi(mime) {
  return /^image\/webp(;|$)/i.test(String(mime || '').trim()) ? 'webp' : 'jpg';
}

/**
 * Saf: yalnız 'local:' kimliği, 'kova:<yol>' ya da bizim kovanın eski herkese açık adresi.
 * Eski adreste uzantıya bakmaz: .jpg, .webp (fotoğraf) ve .webm, .m4a (sesli mesaj) aynı kovadadır.
 * İmzalı adres kabul edilmez: kısa ömürlüdür, belgeye yazılmaz.
 * Önek, supabase-js getPublicUrl ile aynı kurulur: <url>/storage/v1/object/public/<kova>/
 */
export function isAllowedPhotoUrl(url, supabaseUrl = SUPABASE_URL, bucket = PHOTO_BUCKET) {
  if (typeof url !== 'string' || !url) return false;
  if (url.startsWith(LOCAL_PREFIX)) return true;
  if (url.startsWith(KOVA_ONEK)) return YOL_RE.test(url.slice(KOVA_ONEK.length));
  const prefix = acikOnek(supabaseUrl, bucket);
  if (!prefix || !url.startsWith(prefix)) return false;
  const rest = url.slice(prefix.length);
  return SAFE_PATH_RE.test(rest) && !rest.includes('..');
}

function acikOnek(supabaseUrl = SUPABASE_URL, bucket = PHOTO_BUCKET) {
  if (!supabaseUrl || !bucket) return null;
  try {
    const base = String(supabaseUrl).trim().replace(/\/*$/, '/');
    return new URL(`storage/v1/object/public/${bucket}/`, base).href;
  } catch {
    return null;
  }
}

/** Saf: başvuru → kovadaki yol `<oda>/<uuid>.<uzantı>` | null (imza yalnız bu biçime istenir). */
export function medyaYolu(url) {
  if (typeof url !== 'string') return null;
  let y = null;
  if (url.startsWith(KOVA_ONEK)) y = url.slice(KOVA_ONEK.length);
  else {
    const prefix = acikOnek();
    if (prefix && url.startsWith(prefix)) y = url.slice(prefix.length);
  }
  return y && YOL_RE.test(y) ? y : null;
}

/** Saf: belgeye yazılacak başvuru. */
const baslangicAdresi = (yol) => (MEDYA_KOVA_BICIMI ? KOVA_ONEK + yol : acikOnek() + yol);

/** Başvurunun herkese açık adresi (kova açıkken çalışır; geçiş ve geri alma için). */
function acikAdres(url) {
  return url.startsWith(KOVA_ONEK) ? acikOnek() + url.slice(KOVA_ONEK.length) : url;
}

// ---------- Edge Function 'medya' ----------

const medyaUcu = (islem) => `${String(SUPABASE_URL).replace(/\/+$/, '')}/functions/v1/medya?islem=${islem}`;

function anahtarBasliklari() {
  const h = { apikey: SUPABASE_ANON_KEY };
  if (String(SUPABASE_ANON_KEY).startsWith('eyJ')) h.Authorization = `Bearer ${SUPABASE_ANON_KEY}`;
  return h;
}

async function imzaIste(oda, yollar) {
  const k = kimlik(oda);
  if (!k.p_cihaz) throw new Error('kimlik yok');
  const res = await fetch(medyaUcu('imzala'), {
    method: 'POST',
    headers: { ...anahtarBasliklari(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ room: oda, cihaz: k.p_cihaz, anahtar: k.p_anahtar, yollar }),
    signal: AbortSignal.timeout(IMZA_BEKLE_MS), // takılırsa fotoğraflar beklemesin: açık adrese düşülür
  });
  if (!res.ok) throw new Error(`imza ${res.status}`);
  return res.json();
}

function imzaDepoNesnesi() {
  const depo = globalThis.sessionStorage;
  if (!depo) return null;
  return {
    oku: () => JSON.parse(depo.getItem(K_IMZA) || '{}'),
    yaz: (v) => depo.setItem(K_IMZA, JSON.stringify(v)),
  };
}

let imza = imzaDeposu({ iste: imzaIste, depo: imzaDepoNesnesi() });

/** Test: önbelleği ve hata beklemesini sıfırlar. */
export function _testMedyaSifirla() {
  imza = imzaDeposu({ iste: imzaIste });
}

/** Başvurunun şu an kullanılabilir imzalı adresi | null (eşzamanlı: iPhone'da dokunma anında ses çalabilsin). */
export function medyaHazir(url) {
  const y = medyaYolu(url);
  return y ? imza.hazir(y) : null;
}

/** Adres açılmadıysa (süre doldu): önbellekten düşer; sonraki istek yeni imza alır. */
export function medyaUnut(url) {
  const y = medyaYolu(url);
  if (y) imza.unut(y);
}

const yerelAdres = new Map(); // 'local:<id>' → Promise<object URL>

/**
 * Başvuru → <img>/<audio> kaynağı | null (izin dışı). İmzalı adres; imza alınamazsa açık adres
 * (kova kapalıyken o adres açılmaz, görüntü hatası gösterilir). Hata fırlatmaz (yerel okuma hatası: null).
 */
export async function medyaAdresi(url) {
  if (!isAllowedPhotoUrl(url)) return null;
  if (url.startsWith(LOCAL_PREFIX)) {
    if (!yerelAdres.has(url)) {
      const p = loadPhoto(url).then((blob) => URL.createObjectURL(blob));
      p.catch(() => yerelAdres.delete(url));
      yerelAdres.set(url, p);
    }
    return yerelAdres.get(url).catch(() => null);
  }
  const y = medyaYolu(url);
  const a = y ? await imza.al(y) : null;
  return a || acikAdres(url);
}

/** Geri yükleme: bu odadaki yolların kovada olup olmadığı. -> { var: [yol], eksik: [yol] }. Ağ hatasında fırlatır. */
export async function medyaVarMi(roomId, yollar) {
  const bu = yollar.filter((y) => y.startsWith(`${roomId}/`));
  const out = { var: [], eksik: [] };
  for (let i = 0; i < bu.length; i += 100) {
    const r = await imzaIste(roomId, bu.slice(i, i + 100));
    out.var.push(...Object.keys(r.adresler || {}));
    out.eksik.push(...(r.eksik || []));
  }
  return out;
}

const YUKLEME_HATASI = {
  403: 'bu cihazın yükleme yetkisi yok.',
  413: 'dosya çok büyük.',
  415: 'bu dosya türü desteklenmiyor.',
};

/** İşlevle yükler. -> { yol, zatenVar } | null (işlev yok ya da geçici hata: eski yola düşülür). Kalıcı ret: Error. */
async function islevleYukle(blob, roomId, contentType, yol) {
  const k = kimlik(roomId);
  if (!k.p_cihaz) return null;
  let res;
  try {
    res = await fetch(medyaUcu('yukle'), {
      method: 'POST',
      headers: {
        ...anahtarBasliklari(), 'Content-Type': contentType, 'x-oda': roomId, 'x-cihaz': k.p_cihaz, 'x-anahtar': k.p_anahtar,
        ...(yol ? { 'x-yol': yol } : {}),
      },
      body: blob,
    });
  } catch {
    return null;
  }
  if (res.ok) return { yol: (await res.json()).yol, zatenVar: false };
  if (res.status === 409) return { yol, zatenVar: true };
  if (res.status === 429) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j?.neden === 'dolu'
      ? "depolama alanınız doldu. Ayarlar › Verilerimiz'den bakabilirsin."
      : 'çok hızlı yüklüyorsunuz. Biraz sonra tekrar deneyin.');
  }
  if (YUKLEME_HATASI[res.status]) throw new Error(YUKLEME_HATASI[res.status]);
  return null;
}

function openIdb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('Bu tarayıcıda yerel fotoğraf deposu yok.'));
      return;
    }
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IDB_STORE)) req.result.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Yerel fotoğraf deposu açılamadı.'));
  });
}

/** fn(store) bir IDBRequest döner; işlem bitince sonucu verir. */
async function withIdb(mode, fn) {
  const db = await openIdb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, mode);
      const req = fn(tx.objectStore(IDB_STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error || new Error('Yerel fotoğraf deposu hatası.'));
      tx.onabort = () => reject(tx.error || new Error('Yerel fotoğraf deposu hatası.'));
    });
  } finally {
    db.close();
  }
}

// Supabase'de geçerli oda şart: yol yalnız `<oda>/<uuid>.<uzantı>`. Önce işlev; yayında değilse eski politika (kova kapanınca düşer).
async function kovayaYukle(blob, roomId, { uzanti, contentType, odaHata, yukHata }) {
  if (isLocalMode()) {
    const id = uuid();
    await withIdb('readwrite', (store) => store.put(blob, id));
    return LOCAL_PREFIX + id;
  }
  if (!isValidRoomId(roomId)) throw new Error(odaHata);
  let sonuc;
  try {
    sonuc = await islevleYukle(blob, roomId, contentType);
  } catch (e) {
    throw new Error(yukHata + e.message);
  }
  if (sonuc) return baslangicAdresi(sonuc.yol);
  const client = await getSupabase();
  const bucket = client.storage.from(PHOTO_BUCKET);
  const path = `${roomId}/${uuid()}.${uzanti}`;
  const { error } = await bucket.upload(path, blob, { contentType, upsert: false });
  if (error) throw new Error(yukHata + (error.message || String(error)));
  return baslangicAdresi(path);
}

/**
 * Yedekten geri yükleme: dosyayı verilen yola yazar. -> 'yuklendi' | 'vardi'. Bu odanın yolu olmalı.
 * Kalıcı ret ya da işlev yoksa Error. Yerel modda kullanılmaz.
 */
export async function medyaGeriYukle(blob, roomId, yol) {
  if (!YOL_RE.test(yol) || !yol.startsWith(`${roomId}/`)) throw new Error('Geçersiz yol.');
  const r = await islevleYukle(blob, roomId, blob.type || 'image/jpeg', yol);
  if (!r) throw new Error('Dosya şu an yüklenemedi. Biraz sonra tekrar dene.');
  return r.zatenVar ? 'vardi' : 'yuklendi';
}

/**
 * → başvuru (belgeye yazılır). Supabase: `<roomId>/<uuid>.webp` (WebP) ya da `.jpg`. Yerel: 'local:<uuid>'. Hata fırlatabilir.
 */
export async function uploadPhoto(blob, roomId) {
  if (typeof Blob === 'undefined' || !(blob instanceof Blob)) throw new TypeError('uploadPhoto: Blob gerekli.');
  return kovayaYukle(blob, roomId, {
    uzanti: fotoUzantisi(blob.type),
    contentType: blob.type || 'image/jpeg',
    odaHata: 'Fotoğrafı paylaşmak için geçerli bir oda gerekli.',
    yukHata: 'Fotoğraf yüklenemedi: ',
  });
}

/**
 * Sesli mesaj → url. Supabase: `<roomId>/<uuid>.webm` (Chrome/Android) ya da `.m4a` (iPhone Safari, audio/mp4).
 * Yerel: 'local:<uuid>' (IndexedDB, fotoğraflarla aynı depo). En çok SES_MAX_BAYT. Hata fırlatabilir.
 */
export async function uploadAudio(blob, roomId) {
  if (typeof Blob === 'undefined' || !(blob instanceof Blob)) throw new TypeError('uploadAudio: Blob gerekli.');
  if (blob.size > SES_MAX_BAYT) throw new Error('Ses kaydı çok büyük (en çok 2 MB).');
  const tur = sesTuru(blob.type);
  if (!tur) throw new Error('Bu ses biçimi desteklenmiyor.');
  return kovayaYukle(blob, roomId, {
    uzanti: tur.uzanti,
    contentType: tur.mime,
    odaHata: 'Sesi paylaşmak için geçerli bir oda gerekli.',
    yukHata: 'Ses kaydı yüklenemedi: ',
  });
}

/** Başvuru → Blob. 'local:' önekli ise IndexedDB'den; değilse yalnız bizim kovadan (imzalı adresle). Hata fırlatabilir. */
export async function loadPhoto(url) {
  if (typeof url !== 'string' || !url) throw new TypeError('loadPhoto: URL gerekli.');
  if (!isAllowedPhotoUrl(url)) throw new Error('Bu fotoğraf adresine izin verilmiyor.');
  if (url.startsWith(LOCAL_PREFIX)) {
    const blob = await withIdb('readonly', (store) => store.get(url.slice(LOCAL_PREFIX.length)));
    if (!blob) throw new Error('Fotoğraf bu tarayıcıda bulunamadı.');
    return blob;
  }
  let res = await fetch(await medyaAdresi(url));
  if (!res.ok && medyaYolu(url)) {
    medyaUnut(url); // süresi dolmuş imza: bir kez yenile
    res = await fetch(await medyaAdresi(url));
  }
  if (!res.ok) throw new Error(`Fotoğraf indirilemedi (${res.status}).`);
  return res.blob();
}
