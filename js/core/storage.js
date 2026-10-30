// Fotoğraf depolama. Supabase: herkese açık kova. Yerel mod: IndexedDB (aynı tarayıcının sekmeleri paylaşır).
import { PHOTO_BUCKET } from '../config.js';
import { isLocalMode, uuid } from './identity.js';
import { getSupabase } from './room.js';

const LOCAL_PREFIX = 'local:';
const IDB_NAME = 'bizim-local';
const IDB_STORE = 'photos';

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

/** → url. Supabase: `<roomId>/<uuid>.jpg` herkese açık URL. Yerel: 'local:<uuid>'. Hata fırlatabilir. */
export async function uploadPhoto(blob, roomId) {
  if (typeof Blob === 'undefined' || !(blob instanceof Blob)) throw new TypeError('uploadPhoto: Blob gerekli.');
  if (isLocalMode()) {
    const id = uuid();
    await withIdb('readwrite', (store) => store.put(blob, id));
    return LOCAL_PREFIX + id;
  }
  const client = await getSupabase();
  const bucket = client.storage.from(PHOTO_BUCKET);
  const path = `${roomId || 'solo'}/${uuid()}.jpg`;
  const { error } = await bucket.upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: false });
  if (error) throw new Error('Fotoğraf yüklenemedi: ' + (error.message || String(error)));
  return bucket.getPublicUrl(path).data.publicUrl;
}

/** url → Blob. 'local:' önekli ise IndexedDB'den. Hata fırlatabilir. */
export async function loadPhoto(url) {
  if (typeof url !== 'string' || !url) throw new TypeError('loadPhoto: URL gerekli.');
  if (url.startsWith(LOCAL_PREFIX)) {
    const blob = await withIdb('readonly', (store) => store.get(url.slice(LOCAL_PREFIX.length)));
    if (!blob) throw new Error('Fotoğraf bu tarayıcıda bulunamadı.');
    return blob;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fotoğraf indirilemedi (${res.status}).`);
  return res.blob();
}
