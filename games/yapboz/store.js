// Yapboz kaydı (yalnız ev sahibi / tek kişi): IndexedDB 'bizim-yapboz'.
// Anahtar `yapboz:<roomId|'solo'>`. Fotoğraf ayrı depoda tutulur; aynı Blob tekrar yazılmaz.
// Kayıt: { roomId, photoBlob, photoUrl, cols, rows, seed, count, note, elapsed, state, done, savedAt }
// Hiçbir fonksiyon hata fırlatmaz: okuma hatasında null, yazma hatasında false döner.

const DB_NAME = 'bizim-yapboz';
const DB_VERSION = 1;
const GAMES = 'games';
const PHOTOS = 'photos';

export function storeKey(roomId) {
  return `yapboz:${roomId || 'solo'}`;
}

let opening = null;
const writtenPhoto = new Map(); // anahtar -> son yazılan Blob

function openDb() {
  if (opening) return opening;
  opening = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB yok'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(GAMES)) db.createObjectStore(GAMES);
      if (!db.objectStoreNames.contains(PHOTOS)) db.createObjectStore(PHOTOS);
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => {
        db.close();
        opening = null;
      };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB meşgul'));
  });
  opening.catch(() => {
    opening = null;
  });
  return opening;
}

function run(db, mode, body) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([GAMES, PHOTOS], mode);
    const out = body(tx);
    tx.oncomplete = () => resolve(out);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('IndexedDB işlemi iptal'));
  });
}

export async function loadGame(roomId) {
  const key = storeKey(roomId);
  try {
    const db = await openDb();
    const [metaReq, photoReq] = await run(db, 'readonly', (tx) => [
      tx.objectStore(GAMES).get(key),
      tx.objectStore(PHOTOS).get(key),
    ]);
    const meta = metaReq.result;
    const photo = photoReq.result || null;
    if (!meta || typeof meta !== 'object') return null;
    if (photo) writtenPhoto.set(key, photo);
    return { ...meta, photoBlob: photo };
  } catch (err) {
    console.warn('Yapboz kaydı okunamadı', err);
    return null;
  }
}

export async function saveGame(roomId, record) {
  const key = storeKey(roomId);
  const { photoBlob = null, ...meta } = record || {};
  try {
    const db = await openDb();
    const writePhoto = Boolean(photoBlob) && writtenPhoto.get(key) !== photoBlob;
    await run(db, 'readwrite', (tx) => {
      tx.objectStore(GAMES).put({ ...meta, roomId: roomId || null, savedAt: Date.now() }, key);
      if (writePhoto) tx.objectStore(PHOTOS).put(photoBlob, key);
    });
    if (writePhoto) writtenPhoto.set(key, photoBlob);
    return true;
  } catch (err) {
    console.warn('Yapboz kaydedilemedi', err);
    return false;
  }
}
