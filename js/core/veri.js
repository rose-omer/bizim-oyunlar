// Çiftin kalıcı verisi: özel günler, mesajlar, anılar, listeler...
// Belge = { id, data, author, deleted, created_at, updated_at }. (oda, tür, id) tekildir; son yazan kazanır.
// Supabase: room_doc tablosu, RPC doc_put / doc_list / doc_page (supabase/schema.sql).
// Yerel mod: localStorage 'bizim.yerelveri.<oda>.<tür>' (aynı tarayıcının sekmeleri paylaşır).
// Canlı güncelleme: yazan taraf odaya { t:'veri', kind, doc } yayar (ns '*'); karşı taraf koleksiyonunu günceller.
// Cihaz üyeliği (uyelik.js): her RPC'ye kimlik eklenir. 42501 (yetki yok): yazma giden kutusunda kalır,
// eşitleme durur, yetkiKaybedildi çağrılır; onay geri gelince ('bizim:uyelik') eşitleme sürer.
import { isLocalMode, readStore, writeStore, uuid } from './identity.js';
import { getSupabase } from './room.js';
import { kimlik, yetkiKaybedildi, yerelVeriYetkisi } from './uyelik.js';
import { yetkiHatasiMi, girisAcikMi } from './uyelik-mantik.js';

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

/** Silinmiş belgenin verisi de korunur (Son silinenler); ekranlar silineni deleted bayrağıyla eler. */
export function normalizeDoc(d) {
  const out = {
    id: String(d.id),
    data: d.data && typeof d.data === 'object' ? d.data : {},
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

/**
 * Alan düzeyinde birleştirme (sunucudaki doc_patch ile aynı kural):
 * üst düzey anahtar tek tek yazılır; 'ana.alt' iç içe tek alanı yazar; null alanı siler.
 */
export function applyPatch(data, patch) {
  const out = { ...(data && typeof data === 'object' ? data : {}) };
  for (const [key, val] of Object.entries(patch || {})) {
    const parts = key.split('.');
    if (parts.length > 2 || parts.some((x) => !x)) throw new Error('Geçersiz alan: ' + key);
    if (parts.length === 2) {
      const [a, b] = parts;
      const inner = out[a] && typeof out[a] === 'object' && !Array.isArray(out[a]) ? { ...out[a] } : {};
      if (val === null) delete inner[b]; else inner[b] = val;
      out[a] = inner;
    } else if (val === null) {
      delete out[key];
    } else {
      out[key] = val;
    }
  }
  return out;
}

/**
 * Yedekten içe aktarma kuralı (sunucudaki doc_ice_aktar ile aynı): belge yoksa eklenir; varsa yalnız yedekteki
 * updated_at daha yeniyse ya da var olan belge silinmişse üstüne yazılır (silinenler geri gelir).
 * Yazılan belgenin updated_at'i simdi olur (karşı cihazlar artımlı eşitlemede görsün); created_at yedekten
 * (yoksa simdi; gelecek tarih simdi'ye çekilir), var olanınki korunur. hepsi = { id: belge } yerinde değişir.
 * -> yazılan belge sayısı
 */
export function iceAktarBirlestir(hepsi, belgeler, simdi) {
  const kirp = (v) => (v && timeOf(v) > timeOf(simdi) ? simdi : v);
  let n = 0;
  for (const b of belgeler || []) {
    if (!b || typeof b.id !== 'string') continue;
    const updated = kirp(b.updated_at) || null;
    const cur = hepsi[b.id];
    if (cur && b.deleted) continue; // yedekteki silinmiş kopya var olanı silmez
    if (cur && !cur.deleted && !(updated && timeOf(updated) > timeOf(cur.updated_at))) continue;
    hepsi[b.id] = {
      id: b.id, data: b.deleted ? {} : b.data, author: b.author ?? null, deleted: !!b.deleted,
      created_at: cur?.created_at || kirp(b.created_at) || simdi, updated_at: simdi,
    };
    n++;
  }
  return n;
}

// ---------- Yetki (cihaz üyeliği) ----------

const YETKI_MESAJ = 'Bu cihazın odaya erişimi yok.';
const durdu = new Set(); // yetkisi giden odalar: eşitleme durur
const devam = new Map(); // roomId → Set<() => void>: onay geri gelince eşitlemeyi sürdürenler
let uyelikDinleniyor = false;

function uyelikDinle() {
  if (uyelikDinleniyor || typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
  uyelikDinleniyor = true;
  window.addEventListener('bizim:uyelik', (e) => {
    const d = e?.detail;
    if (!d || !durdu.has(d.roomId) || !girisAcikMi(d)) return;
    durdu.delete(d.roomId);
    for (const fn of devam.get(d.roomId) || []) fn();
  });
}

/** Yerel SIKI modda onaysız cihazın yerel veriye erişimi de reddedilir (sunucu gibi). */
function yerelYetki(roomId) {
  try {
    yerelVeriYetkisi(roomId);
  } catch (e) {
    throw rpcError(e, roomId);
  }
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
    yerelYetki(roomId);
    const all = localRead(roomId, kind);
    const now = localNow();
    const prev = all[id];
    // Silme var olan verisi korur (sunucudaki doc_put gibi); olmayan belge {} ile silinir.
    const doc = {
      id, data: deleted ? (prev?.data || {}) : data, author, deleted: !!deleted,
      created_at: prev?.created_at || now, updated_at: now,
    };
    all[id] = doc;
    writeStore('local', localKey(roomId, kind), JSON.stringify(all));
    return doc;
  },
  async patch(roomId, kind, id, patch, author) {
    yerelYetki(roomId);
    const prev = localRead(roomId, kind)[id];
    const base = prev && !prev.deleted ? prev.data : {};
    return localBackend.put(roomId, kind, id, applyPatch(base, patch), author, false);
  },
  async list(roomId, kind, since, limit) {
    yerelYetki(roomId);
    const s = since ? timeOf(since) : -1;
    return Object.values(localRead(roomId, kind))
      .filter((d) => timeOf(d.updated_at) > s)
      .sort((a, b) => timeOf(a.updated_at) - timeOf(b.updated_at))
      .slice(0, limit);
  },
  async page(roomId, kind, before, limit) {
    yerelYetki(roomId);
    const b = before ? timeOf(before) : Infinity;
    return Object.values(localRead(roomId, kind))
      .filter((d) => !d.deleted && timeOf(d.created_at) < b)
      .sort((x, y) => timeOf(y.created_at) - timeOf(x.created_at))
      .slice(0, limit);
  },
  async iceAktar(roomId, belgeler) {
    yerelYetki(roomId);
    const turler = new Map();
    for (const b of belgeler) {
      if (!turler.has(b.kind)) turler.set(b.kind, []);
      turler.get(b.kind).push(b);
    }
    let n = 0;
    for (const [kind, list] of turler) {
      const all = localRead(roomId, kind);
      n += iceAktarBirlestir(all, list, localNow());
      writeStore('local', localKey(roomId, kind), JSON.stringify(all));
    }
    return n;
  },
};

// ---------- Arka uç: Supabase ----------

/** kimlikli: istek cihaz kimliği taşıdı mı (eski sunucu önbelleğinde taşımaz; o zaman 42501 çıkarma sayılmaz). */
function rpcError(error, roomId, kimlikli = true) {
  if (yetkiHatasiMi(error)) {
    durdu.add(roomId);
    yetkiKaybedildi(roomId, { kimlikli });
    return Object.assign(new Error(YETKI_MESAJ), { yetki: true, code: '42501' });
  }
  if (error?.code === 'PGRST202') return new Error('Sunucu bu işlemi henüz desteklemiyor.');
  const msg = String(error?.message || error || '');
  if (/cok fazla/.test(msg)) return new Error('Çok hızlı kaydediyorsunuz. Biraz sonra tekrar deneyin.');
  if (/cok buyuk/.test(msg)) return new Error('Bu kayıt çok uzun.');
  if (/gecersiz/.test(msg)) return new Error('Geçersiz kayıt.');
  return new Error('Kaydedilemedi. Bağlantını kontrol et.');
}

const supabaseBackend = {
  async put(roomId, kind, id, data, author, deleted) {
    const client = await getSupabase();
    const k = kimlik(roomId);
    const { data: rows, error } = await client.rpc('doc_put', {
      p_room: roomId, p_kind: kind, p_id: id, p_data: deleted ? {} : data, p_author: author, p_deleted: !!deleted, ...k,
    });
    if (error) throw rpcError(error, roomId, !!k.p_cihaz);
    return (Array.isArray(rows) ? rows[0] : rows) || null;
  },
  async patch(roomId, kind, id, patch, author) {
    const client = await getSupabase();
    const k = kimlik(roomId);
    const { data: rows, error } = await client.rpc('doc_patch', {
      p_room: roomId, p_kind: kind, p_id: id, p_patch: patch, p_author: author, ...k,
    });
    if (error) throw rpcError(error, roomId, !!k.p_cihaz);
    return (Array.isArray(rows) ? rows[0] : rows) || null;
  },
  async list(roomId, kind, since, limit) {
    const client = await getSupabase();
    const k = kimlik(roomId);
    const { data, error } = await client.rpc('doc_list', {
      p_room: roomId, p_kind: kind, p_since: since, p_limit: limit, ...k,
    });
    if (error) throw rpcError(error, roomId, !!k.p_cihaz);
    return data || [];
  },
  async page(roomId, kind, before, limit) {
    const client = await getSupabase();
    const k = kimlik(roomId);
    const { data, error } = await client.rpc('doc_page', {
      p_room: roomId, p_kind: kind, p_before: before, p_limit: limit, ...k,
    });
    if (error) throw rpcError(error, roomId, !!k.p_cihaz);
    return data || [];
  },
  async iceAktar(roomId, belgeler) {
    const client = await getSupabase();
    const k = kimlik(roomId);
    const { data, error } = await client.rpc('doc_ice_aktar', { p_room: roomId, p_belgeler: belgeler, ...k });
    if (error) throw rpcError(error, roomId, !!k.p_cihaz);
    return Number(data) || 0;
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

/** Alanları sunucuda birleştirerek yazar (applyPatch kuralı). -> sunucudaki belge */
export async function patchDoc(roomId, kind, id, patch, author = null) {
  checkArgs(roomId, kind, id);
  const bad = checkData(patch);
  if (bad) throw new Error(bad);
  applyPatch({}, patch); // anahtar biçimini erken doğrula
  return normalizeDoc(await backend().patch(roomId, kind, id, patch, author));
}

/** Belgeyi siler: deleted=true; var olan veri korunur, putDoc ile geri alınır. */
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

/**
 * Yedekten geri yükleme: en çok 200 belge { kind, id, data, author?, deleted?, created_at?, updated_at? }.
 * Var olan belge silinmez; yalnız yedekteki daha yeni kopya üstüne yazılır. -> yazılan sayısı
 */
export async function iceAktar(roomId, belgeler) {
  if (!roomId) throw new Error('Oda yok.');
  if (!Array.isArray(belgeler) || belgeler.length > 200) throw new Error('Tek seferde en çok 200 kayıt.');
  for (const b of belgeler) {
    checkArgs(roomId, b?.kind, b?.id);
    const bad = b.deleted ? null : checkData(b.data);
    if (bad) throw new Error(bad);
  }
  if (!belgeler.length) return 0;
  return backend().iceAktar(roomId, belgeler);
}

/** Silinmemiş belgeler, yeniden eskiye; 'before' (created_at) öncesi. */
export async function pageDocs(roomId, kind, { before = null, limit = 50 } = {}) {
  checkArgs(roomId, kind);
  const rows = await backend().page(roomId, kind, before, Math.max(1, Math.min(200, limit)));
  return rows.map(normalizeDoc);
}

// ---------- Koleksiyon (sayfalar bunu kullanır) ----------

const cacheKey = (roomId, kind) => `bizim.veri.${roomId}.${kind}`;
// Giden kutusu kişiye özel: yerel modda iki sekme (iki kişi) aynı localStorage'ı paylaşır.
const outboxKey = (roomId, clientId) => `bizim.veri.giden.${roomId}.${clientId || '-'}`;

/** Türlerin önbelleğini siler (geri yüklemeden sonra sayfalar baştan yüklesin). Giden kutusuna dokunmaz. */
export function onbellekTemizle(roomId, kinds) {
  for (const kind of kinds || []) writeStore('local', cacheKey(roomId, kind), null);
}

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
 * -> { kind, all(), get(id), put(data, id?), patch(id, kismi), remove(id), on('change'|'error', fn), refresh(), loadOlder(n), hasOlder(), close() }
 */
export async function openCollection(room, kind, { recent = 0 } = {}) {
  const roomId = room?.roomId;
  checkArgs(roomId, kind);
  const meId = room.me?.clientId || null;
  const map = new Map();
  const listeners = { change: new Set(), error: new Set() };
  let since = null; // yalnız sunucudan ÇEKİLEN belgelerle ilerler (kendi yazmalarımızla değil)
  let older = recent > 0;
  let cursor = null; // recent: sayfalanarak yüklenmiş en eski created_at; daha eskiler loadOlder ile gelir
  let ilkHata = null; // ilk yükleme hatası: sonradan bağlanan 'error' dinleyicisine de iletilir
  let closed = false;

  // recent modunda imleçten eski "başıboş" belgeler (eski mesaja gelen tepki vb.) imlece ulaşılana dek gizli.
  const visible = () => {
    const docs = liveDocs(map);
    if (!(recent > 0 && older && cursor)) return docs;
    const c = timeOf(cursor);
    return docs.filter((d) => d.pending || timeOf(d.created_at) >= c);
  };
  const emit = (type, arg) => { for (const fn of listeners[type]) { try { fn(arg); } catch (e) { console.error(e); } } };
  const changed = () => { saveCache(); emit('change', visible()); };
  const fail = (e) => { emit('error', e); };

  // Önbellekte yalnız sunucuda onaylı belgeler durur; bekleyenler giden kutusundan kurulur.
  const cached = readJson(cacheKey(roomId, kind), null);
  const hadCache = !!(cached && Array.isArray(cached.docs));
  if (hadCache) {
    mergeDocs(map, cached.docs.filter((d) => d && !d.pending));
    since = cached.since || null;
    cursor = cached.cursor || null;
    if (recent > 0 && !cursor) cursor = liveDocs(map)[0]?.created_at || null;
  }
  function saveCache() {
    // Silinenin verisi önbelleğe girmez (yer kaplamasın); Son silinenler sunucudan okunur.
    let docs = [...map.values()].filter((d) => !d.pending).map((d) => (d.deleted ? { ...d, data: {} } : d));
    let cur = cursor;
    if (recent > 0) {
      const c = cursor && older ? timeOf(cursor) : -Infinity;
      const tum = docs.filter((d) => !d.deleted && timeOf(d.created_at) >= c)
        .sort((a, b) => timeOf(a.created_at) - timeOf(b.created_at));
      docs = tum.slice(-CACHE_RECENT);
      // Kırpılınca imleç de kayar; hepsi yüklenmiş olsa bile (önbellek aradakileri tutmaz, sonra yeniden yüklenir).
      if ((older || tum.length > docs.length) && docs.length) cur = docs[0].created_at;
    }
    try {
      writeStore('local', cacheKey(roomId, kind), JSON.stringify({ since, cursor: cur, docs }));
    } catch { /* kota */ }
  }

  // Giden kutusu: çevrimdışıyken yapılan yazmalar sırayla tekrar denenir.
  // İşlem: { n, kind, id, at, data?, deleted?, patch? }. put/remove öncekileri geçersiz kılar; patch'ler sırayla birikir.
  const outbox = () => readJson(outboxKey(roomId, meId), []);
  const setOutbox = (list) => writeStore('local', outboxKey(roomId, meId), list.length ? JSON.stringify(list) : null);
  const dropOp = (op) => setOutbox(outbox().filter((o) => o.n !== op.n));
  const optimistic = (op, cur) => normalizeDoc({
    id: op.id,
    data: op.patch ? applyPatch(cur && !cur.deleted ? cur.data : {}, op.patch) : op.data,
    deleted: !!op.deleted, author: meId,
    created_at: cur?.created_at || op.at, updated_at: op.at, pending: true,
  });
  for (const o of outbox()) {
    if (o.kind !== kind || !o.n) continue;
    map.set(o.id, optimistic(o, map.get(o.id)));
  }

  async function send(op) {
    const doc = op.patch
      ? await patchDoc(roomId, kind, op.id, op.patch, meId)
      : op.deleted
        ? await removeDoc(roomId, kind, op.id, meId)
        : await putDoc(roomId, kind, op.id, op.data, meId);
    // Aynı belge için daha yeni bir bekleyen yazma yoksa sunucu sürümü yerleşir (saat farkından bağımsız).
    const newer = outbox().some((o) => o.kind === kind && o.id === op.id && o.n !== op.n);
    if (!newer) map.set(doc.id, doc);
    room.sendAll?.({ t: 'veri', kind, doc });
    return doc;
  }

  let flushing = false;
  async function flush() {
    if (flushing || closed || durdu.has(roomId)) return;
    flushing = true;
    try {
      for (const op of outbox().filter((o) => o.kind === kind && o.n)) {
        try {
          await send(op);
          dropOp(op);
        } catch (e) {
          fail(e);
          break;
        }
      }
      changed();
    } finally {
      flushing = false;
    }
  }

  async function write(op) {
    if (op.patch) {
      const bad = checkData(op.patch);
      if (bad) throw new Error(bad);
      applyPatch({}, op.patch); // biçim hatası hemen
    } else if (!op.deleted) {
      const bad = checkData(op.data);
      if (bad) throw new Error(bad);
    }
    const cur = map.get(op.id);
    map.set(op.id, optimistic(op, cur));
    changed();
    const rest = op.patch ? outbox() : outbox().filter((o) => !(o.kind === kind && o.id === op.id));
    setOutbox([...rest, op]);
    if (durdu.has(roomId)) return op.id; // yetki yok: giden kutusunda bekler
    try {
      await send(op);
      dropOp(op);
      changed();
    } catch (e) {
      fail(e);
      // Kalıcı hata (çok uzun / geçersiz) ise tekrar deneme anlamsız: geri al.
      if (/çok uzun|Geçersiz/i.test(e.message)) {
        dropOp(op);
        if (cur) map.set(op.id, cur); else map.delete(op.id);
        changed();
        throw e;
      }
    }
    return op.id;
  }
  const newOp = (id, extra) => ({ n: uuid(), kind, id, at: new Date().toISOString(), ...extra });

  /** tam: 'since' yok sayılır, hepsi çekilir (geri yüklenen eski tarihli belgeler için). */
  async function refresh(tam = false) {
    if (closed || durdu.has(roomId)) return;
    try {
      const docs = await listDocs(roomId, kind, { since: tam ? null : overlapSince(since) });
      since = maxUpdated(docs, since);
      ilkHata = null;
      if (mergeDocs(map, docs)) changed();
      else saveCache();
    } catch (e) {
      fail(e);
      throw e;
    }
  }

  async function loadOlder(n = 50) {
    const before = cursor || liveDocs(map).filter((d) => !d.pending)[0]?.created_at || null;
    const docs = await pageDocs(roomId, kind, { before, limit: n });
    if (docs.length < n) older = false;
    if (docs.length) cursor = docs[docs.length - 1].created_at; // yeniden eskiye: son eleman en eski
    mergeDocs(map, docs);
    changed();
    return docs.length;
  }

  // İlk yükleme. Önbellek varsa hemen döner, sunucudan tazeleme arkada sürer (değişince 'change' gelir).
  try {
    if (durdu.has(roomId)) {
      // yetki yok: yalnız önbellek
    } else if (recent > 0 && !since) {
      const docs = await pageDocs(roomId, kind, { limit: recent });
      if (docs.length < recent) older = false;
      mergeDocs(map, docs);
      cursor = docs.length ? docs[docs.length - 1].created_at : null;
      since = maxUpdated(docs, null); // boşsa null kalır (istemci saati kullanılmaz)
      saveCache();
    } else if (hadCache) {
      refresh().catch((e) => { ilkHata = e; });
    } else {
      await refresh();
    }
  } catch (e) {
    ilkHata = e;
  }
  flush();

  // Canlı: karşı tarafın yazmaları.
  const offMsg = room.on?.('message', (msg) => {
    if (!msg || msg.t !== 'veri' || msg.kind !== kind || !msg.doc) return;
    const doc = normalizeDoc(msg.doc);
    if (mergeDocs(map, [doc])) changed();
  });
  // Bağlantı geri gelince ve sekme öne gelince eksikleri çek.
  const quiet = () => { refresh().catch(() => {}); flush(); };
  uyelikDinle();
  if (!devam.has(roomId)) devam.set(roomId, new Set());
  devam.get(roomId).add(quiet);
  const offStatus = room.on?.('status', (st) => { if (st === 'online') quiet(); });
  const onVisible = () => { if (document.visibilityState === 'visible') quiet(); };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);
  if (typeof window !== 'undefined') window.addEventListener('online', quiet);
  const poll = setInterval(() => {
    if (typeof document === 'undefined' || document.visibilityState === 'visible') refresh().catch(() => {});
  }, POLL_MS);
  const retry = setInterval(() => { if (outbox().some((o) => o.kind === kind)) flush(); }, RETRY_MS);

  return {
    kind,
    all: visible,
    get: (id) => { const d = map.get(id); return d && !d.deleted ? d : null; },
    put: (data, id = uuid()) => write(newOp(id, { data })),
    /** Alan düzeyinde birleştirir (sunucuda): { a: 1 }, { 'ana.alt': x }; null alanı siler. */
    patch: (id, partial) => write(newOp(id, { patch: partial })),
    remove: (id) => write(newOp(id, { deleted: true, data: {} })),
    on(type, fn) {
      listeners[type]?.add(fn);
      if (type === 'error' && ilkHata) { const e = ilkHata; queueMicrotask(() => fn(e)); }
      return () => listeners[type]?.delete(fn);
    },
    /** Sunucudan eksikleri çeker ({ tam: true } hepsini). Hata fırlatmaz (error olayı gelir). */
    refresh: (o) => refresh(!!o?.tam).catch(() => {}),
    loadOlder,
    hasOlder: () => older,
    close() {
      closed = true;
      offMsg?.(); offStatus?.();
      devam.get(roomId)?.delete(quiet);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
      if (typeof window !== 'undefined') window.removeEventListener('online', quiet);
      clearInterval(poll); clearInterval(retry);
      listeners.change.clear(); listeners.error.clear();
    },
  };
}
