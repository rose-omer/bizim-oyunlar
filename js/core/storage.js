// Fotoğraf ve sesli mesaj depolama. Supabase: herkese açık kova. Yerel mod: IndexedDB (aynı tarayıcının sekmeleri paylaşır).
import { SUPABASE_URL, PHOTO_BUCKET } from '../config.js';
import { isLocalMode, isValidRoomId, uuid } from './identity.js';
import { getSupabase } from './room.js';

const LOCAL_PREFIX = 'local:';
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
 * Saf: loadPhoto yalnız 'local:' kimliği ya da bizim kovanın herkese açık adresini kabul eder.
 * Uzantıya bakmaz: .jpg, .webp (fotoğraf) ve .webm, .m4a (sesli mesaj) aynı kovadadır.
 * Önek, supabase-js getPublicUrl ile aynı kurulur: <url>/storage/v1/object/public/<kova>/
 */
export function isAllowedPhotoUrl(url, supabaseUrl = SUPABASE_URL, bucket = PHOTO_BUCKET) {
  if (typeof url !== 'string' || !url) return false;
  if (url.startsWith(LOCAL_PREFIX)) return true;
  if (!supabaseUrl || !bucket) return false;
  let prefix;
  try {
    const base = String(supabaseUrl).trim().replace(/\/*$/, '/');
    prefix = new URL(`storage/v1/object/public/${bucket}/`, base).href;
  } catch {
    return false;
  }
  if (!url.startsWith(prefix)) return false;
  const rest = url.slice(prefix.length);
  return SAFE_PATH_RE.test(rest) && !rest.includes('..');
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

// Supabase'de geçerli oda şart: depolama politikası (supabase/schema.sql §3) yalnız `<oda>/<uuid>.<uzantı>` yolunu kabul eder.
async function kovayaYukle(blob, roomId, { uzanti, contentType, odaHata, yukHata }) {
  if (isLocalMode()) {
    const id = uuid();
    await withIdb('readwrite', (store) => store.put(blob, id));
    return LOCAL_PREFIX + id;
  }
  if (!isValidRoomId(roomId)) throw new Error(odaHata);
  const client = await getSupabase();
  const bucket = client.storage.from(PHOTO_BUCKET);
  const path = `${roomId}/${uuid()}.${uzanti}`;
  const { error } = await bucket.upload(path, blob, { contentType, upsert: false });
  if (error) throw new Error(yukHata + (error.message || String(error)));
  return bucket.getPublicUrl(path).data.publicUrl;
}

/**
 * → url. Supabase: `<roomId>/<uuid>.webp` (WebP) ya da `.jpg` herkese açık URL. Yerel: 'local:<uuid>'. Hata fırlatabilir.
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

/** url → Blob. 'local:' önekli ise IndexedDB'den; değilse yalnız bizim kovadan. Hata fırlatabilir. */
export async function loadPhoto(url) {
  if (typeof url !== 'string' || !url) throw new TypeError('loadPhoto: URL gerekli.');
  if (!isAllowedPhotoUrl(url)) throw new Error('Bu fotoğraf adresine izin verilmiyor.');
  if (url.startsWith(LOCAL_PREFIX)) {
    const blob = await withIdb('readonly', (store) => store.get(url.slice(LOCAL_PREFIX.length)));
    if (!blob) throw new Error('Fotoğraf bu tarayıcıda bulunamadı.');
    return blob;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fotoğraf indirilemedi (${res.status}).`);
  return res.blob();
}
