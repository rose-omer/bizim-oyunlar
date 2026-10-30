// Çiftin kalıcı verisi: özel günler, mesajlar, anılar, listeler...
// Belge = { id, data, author, deleted, created_at, updated_at }. (oda, tür, id) tekildir; son yazan kazanır.
// Supabase: room_doc tablosu, RPC doc_put / doc_list / doc_page (supabase/schema.sql).
// Yerel mod: localStorage 'bizim.yerelveri.<oda>.<tür>' (aynı tarayıcının sekmeleri paylaşır).
// Canlı güncelleme: yazan taraf odaya { t:'veri', kind, doc } yayar (ns '*'); karşı taraf koleksiyonunu günceller.
import { isLocalMode, readStore, writeStore, uuid } from './identity.js';
import { getSupabase } from './room.js';

export const KIND_RE = /^[a-z]{2,20}$/;
export const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
export const MAX_BYTES = 32 * 1024;
const LIST_PAGE = 500;
const OVERLAP_MS = 5000; // geç kaydedilen yazmaları kaçırmamak için 'since' geriye kaydırılır
const POLL_MS = 60000;
const RETRY_MS = 15000;
const CACHE_RECENT = 200; // sohbet gibi uzun türlerde önbellekte tutulan son belge sayısı

// ---------- Saf yardımcılar (test edilir) ----------

export const timeOf = (s) => {
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : 0;
};

/** JSON'un UTF-8 bayt boyu. */
export function byteSize(data) {
  return new TextEncoder().encode(JSON.stringify(data ?? null)).length;
}

/** Geçerli belge verisi mi? Düz nesne ve MAX_BYTES altı. */
export function checkData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return 'Veri bir nesne olmalı.';
  if (byteSize(data) > MAX_BYTES) return 'Bu kayıt çok uzun.';
  return null;
}

/**
 * Gelen belgeleri Map'e uygular. -> değişti mi
 * Kurallar: bekleyen yerel yazma sunucu sürümüyle ezilmez (sonra gidip kazanır);
 * daha eski sürüm atlanır; aynı sürüm (aynı updated_at) atlanır.
 */
export function mergeDocs(map, docs) {
  let changed = false;
  for (const d of docs || []) {
    if (!d || typeof d.id !== 'string') continue;
    const cur = map.get(d.id);
    if (cur) {
      if (cur.pending && !d.pending) continue;
      if (!cur.pending && !d.pending) {
        if (d.updated_at === cur.updated_at && cur.deleted === !!d.deleted) continue;
        if (timeOf(d.updated_at) < timeOf(cur.updated_at)) continue;
      }
    }
    map.set(d.id, normalizeDoc(d));
    changed = true;
  }
  return changed;
}

export function normalizeDoc(d) {
  const out = {
    id: String(d.id),
    data: d.deleted ? {} : (d.data && typeof d.data === 'object' ? d.data : {}),
    author: d.author || null,
    deleted: !!d.deleted,
    created_at: d.created_at || d.updated_at || new Date(0).toISOString(),
    updated_at: d.updated_at || d.created_at || new Date(0).toISOString(),
  };
  if (d.pending) out.pending = true;
  return out;
}

/** Silinmemiş belgeler, oluşturma zamanına göre eskiden yeniye. */
export function liveDocs(map) {
  return [...map.values()]
    .filter((d) => !d.deleted)
    .sort((a, b) => timeOf(a.created_at) - timeOf(b.created_at) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** En büyük sunucu updated_at (bekleyenler hariç). */
export function maxUpdated(docs, start = null) {
  let best = start;
  for (const d of docs || []) {
    if (d.pending) continue;
    if (!best || timeOf(d.updated_at) > timeOf(best)) best = d.updated_at;
  }
  return best;
}

/** 'since' değerini OVERLAP_MS geriye çeker (ISO). */
export function overlapSince(since, ms = OVERLAP_MS) {
  if (!since) return null;
  return new Date(Math.max(0, timeOf(since) - ms)).toISOString();
}

// ---------- Arka uç: yerel ----------

const localKey = (roomId, kind) => `bizim.yerelveri.${roomId}.${kind}`;
let lastLocalTs = 0;

function localRead(roomId, kind) {
  try {
    const v = JSON.parse(readStore('local', localKey(roomId, kind)) || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

function localNow() {
  lastLocalTs = Math.max(Date.now(), lastLocalTs + 1);
  return new Date(lastLocalTs).toISOString();
}

const localBackend = {
  async put(roomId, kind, id, data, author, deleted) {
    const all = localRead(roomId, kind);
    const now = localNow();
    const prev = all[id];
    const doc = {
      id, data: deleted ? {} : data, author, deleted: !!deleted,
      created_at: prev?.created_at || now, updated_at: now,
    };
    all[id] = doc;
    writeStore('local', localKey(roomId, kind), JSON.stringify(all));
    return doc;
  },
  async list(roomId, kind, since, limit) {
    const s = since ? timeOf(since) : -1;
    return Object.values(localRead(roomId, kind))
      .filter((d) => timeOf(d.updated_at) > s)
      .sort((a, b) => timeOf(a.updated_at) - timeOf(b.updated_at))
      .slice(0, limit);
  },
  async page(roomId, kind, before, limit) {
    const b = before ? timeOf(before) : Infinity;
    return Object.values(localRead(roomId, kind))
      .filter((d) => !d.deleted && timeOf(d.created_at) < b)
      .sort((x, y) => timeOf(y.created_at) - timeOf(x.created_at))
      .slice(0, limit);
  },
};

// ---------- Arka uç: Supabase ----------

function rpcError(error) {
  const msg = String(error?.message || error || '');
  if (/cok fazla/.test(msg)) return new Error('Çok hızlı kaydediyorsunuz. Biraz sonra tekrar deneyin.');
  if (/cok buyuk/.test(msg)) return new Error('Bu kayıt çok uzun.');
  return new Error('Kaydedilemedi. Bağlantını kontrol et.');
}

const supabaseBackend = {
  async put(roomId, kind, id, data, author, deleted) {
    const client = await getSupabase();
    const { data: rows, error } = await client.rpc('doc_put', {
      p_room: roomId, p_kind: kind, p_id: id, p_data: deleted ? {} : data, p_author: author, p_deleted: !!deleted,
    });
    if (error) throw rpcError(error);
    return (Array.isArray(rows) ? rows[0] : rows) || null;
  },
  async list(roomId, kind, since, limit) {
    const client = await getSupabase();
    const { data, error } = await client.rpc('doc_list', { p_room: roomId, p_kind: kind, p_since: since, p_limit: limit });
    if (error) throw rpcError(error);
    return data || [];
  },
  async page(roomId, kind, before, limit) {
    const client = await getSupabase();
    const { data, error } = await client.rpc('doc_page', { p_room: roomId, p_kind: kind, p_before: before, p_limit: limit });
    if (error) throw rpcError(error);
    return data || [];
  },
};

const backend = () => (isLocalMode() ? localBackend : supabaseBackend);

function checkArgs(roomId, kind, id) {
  if (!roomId) throw new Error('Oda yok.');
  if (!KIND_RE.test(kind)) throw new Error('Geçersiz tür: ' + kind);
  if (id != null && !ID_RE.test(id)) throw new Error('Geçersiz id: ' + id);
}

// ---------- Düşük seviye API ----------

/** Belgeyi yazar (ekle ya da güncelle). -> sunucudaki belge */
export async function putDoc(roomId, kind, id, data, author = null) {
  checkArgs(roomId, kind, id);
  const bad = checkData(data);
  if (bad) throw new Error(bad);
  return normalizeDoc(await backend().put(roomId, kind, id, data, author, false));
}

/** Belgeyi siler (iz bırakır: deleted=true). */
export async function removeDoc(roomId, kind, id, author = null) {
  checkArgs(roomId, kind, id);
  return normalizeDoc(await backend().put(roomId, kind, id, {}, author, true));
}

/** 'since'ten sonra değişen belgeler (silinenler dahil), eskiden yeniye. Hepsini sayfalayarak getirir. */
export async function listDocs(roomId, kind, { since = null } = {}) {
  checkArgs(roomId, kind);
  const out = [];
  let cursor = since;
  for (let i = 0; i < 200; i++) {
    const rows = await backend().list(roomId, kind, cursor, LIST_PAGE);
    out.push(...rows.map(normalizeDoc));
    if (rows.length < LIST_PAGE) break;
    cursor = rows[rows.length - 1].updated_at;
  }
  return out;
}

/** Silinmemiş belgeler, yeniden eskiye; 'before' (created_at) öncesi. */
export async function pageDocs(roomId, kind, { before = null, limit = 50 } = {}) {
  checkArgs(roomId, kind);
  const rows = await backend().page(roomId, kind, before, Math.max(1, Math.min(200, limit)));
  return rows.map(normalizeDoc);
}

// ---------- Koleksiyon (sayfalar bunu kullanır) ----------

const cacheKey = (roomId, kind) => `bizim.veri.${roomId}.${kind}`;
const outboxKey = (roomId) => `bizim.veri.giden.${roomId}`;

function readJson(key, fallback) {
  try {
    const v = JSON.parse(readStore('local', key) || 'null');
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * Bir türün canlı koleksiyonu.
 * room: joinRoom sonucu (roomId, me, sendAll, on). recent > 0: yalnız son N belgeyi yükler (sohbet); loadOlder ile geri gider.
 * -> { kind, all(), get(id), put(data, id?), patch(id, partial), remove(id), on('change'|'error', fn), refresh(), loadOlder(n), hasOlder(), close(), ready }
 */
export async function openCollection(room, kind, { recent = 0 } = {}) {
  const roomId = room?.roomId;
  checkArgs(roomId, kind);
  const meId = room.me?.clientId || null;
  const map = new Map();
  const listeners = { change: new Set(), error: new Set() };
  let since = null;
  let older = recent > 0;
  let closed = false;

  const emit = (type, arg) => { for (const fn of listeners[type]) { try { fn(arg); } catch (e) { console.error(e); } } };
  const changed = () => { saveCache(); emit('change', liveDocs(map)); };

  // Önbellek: açılışta anında gösterim ve çevrimdışı okuma.
  const cached = readJson(cacheKey(roomId, kind), null);
  if (cached && Array.isArray(cached.docs)) {
    mergeDocs(map, cached.docs);
    since = cached.since || null;
  }
  function saveCache() {
    let docs = [...map.values()];
    if (recent > 0) docs = liveDocs(map).slice(-CACHE_RECENT);
    try {
      writeStore('local', cacheKey(roomId, kind), JSON.stringify({ since, docs }));
    } catch { /* kota */ }
  }

  // Giden kutusu: çevrimdışıyken yapılan yazmalar sırayla tekrar denenir.
  const outbox = () => readJson(outboxKey(roomId), []);
  const setOutbox = (list) => writeStore('local', outboxKey(roomId), list.length ? JSON.stringify(list) : null);
  for (const o of outbox()) {
    if (o.kind !== kind) continue;
    const cur = map.get(o.id);
    mergeDocs(map, [{ id: o.id, data: o.data, deleted: o.deleted, author: meId,
      created_at: cur?.created_at || o.at, updated_at: o.at, pending: true }]);
  }

  async function send(op) {
    const doc = op.deleted
      ? await removeDoc(roomId, kind, op.id, meId)
      : await putDoc(roomId, kind, op.id, op.data, meId);
    // Aynı belge için daha yeni bir bekleyen yazma yoksa sunucu sürümü yerleşir (saat farkından bağımsız).
    const newer = outbox().some((o) => o.kind === kind && o.id === op.id && o.at !== op.at);
    if (!newer) map.set(doc.id, doc);
    since = maxUpdated([doc], since);
    room.sendAll?.({ t: 'veri', kind, doc });
    return doc;
  }

  let flushing = false;
  async function flush() {
    if (flushing || closed) return;
    flushing = true;
    try {
      for (const op of outbox().filter((o) => o.kind === kind)) {
        try {
          await send(op);
          setOutbox(outbox().filter((o) => !(o.kind === kind && o.id === op.id && o.at === op.at)));
        } catch (e) {
          emit('error', e);
          break;
        }
      }
      changed();
    } finally {
      flushing = false;
    }
  }

  async function write(id, data, deleted) {
    if (!deleted) {
      const bad = checkData(data);
      if (bad) throw new Error(bad);
    }
    const at = new Date().toISOString();
    const cur = map.get(id);
    map.set(id, normalizeDoc({ id, data, deleted, author: meId, created_at: cur?.created_at || at, updated_at: at, pending: true }));
    changed();
    const op = { kind, id, data: deleted ? {} : data, deleted: !!deleted, at };
    setOutbox([...outbox().filter((o) => !(o.kind === kind && o.id === id)), op]);
    try {
      await send(op);
      setOutbox(outbox().filter((o) => !(o.kind === kind && o.id === id && o.at === at)));
      changed();
    } catch (e) {
      emit('error', e);
      // Kalıcı hata (çok uzun / geçersiz) ise tekrar deneme anlamsız: geri al.
      if (/çok uzun|Geçersiz/i.test(e.message)) {
        setOutbox(outbox().filter((o) => !(o.kind === kind && o.id === id && o.at === at)));
        if (cur) map.set(id, cur); else map.delete(id);
        changed();
        throw e;
      }
    }
    return id;
  }

  async function refresh() {
    if (closed) return;
    try {
      const docs = await listDocs(roomId, kind, { since: overlapSince(since) });
      since = maxUpdated(docs, since);
      if (mergeDocs(map, docs)) changed();
      else saveCache();
    } catch (e) {
      emit('error', e);
    }
  }

  async function loadOlder(n = 50) {
    const live = liveDocs(map).filter((d) => !d.pending);
    const before = live.length ? live[0].created_at : null;
    const docs = await pageDocs(roomId, kind, { before, limit: n });
    if (docs.length < n) older = false;
    if (mergeDocs(map, docs)) changed();
    return docs.length;
  }

  // İlk yükleme.
  try {
    if (recent > 0 && !since) {
      const docs = await pageDocs(roomId, kind, { limit: recent });
      if (docs.length < recent) older = false;
      mergeDocs(map, docs);
      since = maxUpdated(docs, since) || new Date(Date.now() - OVERLAP_MS).toISOString();
      saveCache();
    } else {
      await refresh();
    }
  } catch (e) {
    emit('error', e);
  }
  flush();

  // Canlı: karşı tarafın yazmaları.
  const offMsg = room.on?.('message', (msg) => {
    if (!msg || msg.t !== 'veri' || msg.kind !== kind || !msg.doc) return;
    const doc = normalizeDoc(msg.doc);
    if (mergeDocs(map, [doc])) changed();
  });
  // Bağlantı geri gelince ve sekme öne gelince eksikleri çek.
  const offStatus = room.on?.('status', (s) => { if (s === 'online') { refresh(); flush(); } });
  const onVisible = () => { if (document.visibilityState === 'visible') { refresh(); flush(); } };
  const onOnline = () => { refresh(); flush(); };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);
  if (typeof window !== 'undefined') window.addEventListener('online', onOnline);
  const poll = setInterval(() => {
    if (typeof document === 'undefined' || document.visibilityState === 'visible') refresh();
  }, POLL_MS);
  const retry = setInterval(() => { if (outbox().some((o) => o.kind === kind)) flush(); }, RETRY_MS);

  return {
    kind,
    all: () => liveDocs(map),
    get: (id) => { const d = map.get(id); return d && !d.deleted ? d : null; },
    put: (data, id = uuid()) => write(id, data, false),
    patch: (id, partial) => write(id, { ...(map.get(id)?.data || {}), ...partial }, false),
    remove: (id) => write(id, {}, true),
    on(type, fn) {
      listeners[type]?.add(fn);
      return () => listeners[type]?.delete(fn);
    },
    refresh,
    loadOlder,
    hasOlder: () => older,
    close() {
      closed = true;
      offMsg?.(); offStatus?.();
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
      if (typeof window !== 'undefined') window.removeEventListener('online', onOnline);
      clearInterval(poll); clearInterval(retry);
      listeners.change.clear(); listeners.error.clear();
    },
  };
}
