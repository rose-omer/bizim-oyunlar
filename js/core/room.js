// Oda: iki kişi arasında gerçek zamanlı mesaj ve "kim burada" (presence).
// Arka uçlar: 'supabase' (Realtime kanalı), 'local' (BroadcastChannel, aynı tarayıcı), 'solo' (no-op).
// Node'da içe aktarılabilir: tarayıcı nesnelerine yalnız fonksiyon içinde, korumalı erişilir.
// Presence yükü: { clientId, name, page: ns, host, gorunur }. host = oyun sayfasının ev sahibi (URL'deki host);
// lobide ya da URL'de yoksa null. Lobi, partnerin oyununa doğru ev sahibiyle katılmak için kullanır.
// gorunur = sekme öndeyse true (document.visibilityState). Eski istemcide alan yoksa true sayılır.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';
import { me as whoAmI, isLocalMode, uuid, readGameParams } from './identity.js';

const VENDOR_URL = new URL('../../vendor/supabase.js', import.meta.url).href;
const WAKE_BEAT_MS = 4000; // uyanınca ikinci kalp atışı: ilki yanıtsızsa kütüphane soketi yeniler

// ---- Saf yardımcılar (test edilir) ----

/** Supabase presenceState() biçimi { key: [meta...] } → kendinden farklı ilk kişi (son meta). */
export function pickPartner(state, myClientId) {
  for (const [key, metas] of Object.entries(state || {})) {
    if (!Array.isArray(metas) || metas.length === 0) continue;
    const meta = metas[metas.length - 1] || {};
    const clientId = String(meta.clientId || key);
    if (clientId === myClientId) continue;
    return {
      clientId,
      name: String(meta.name || ''),
      page: String(meta.page || ''),
      host: meta.host ? String(meta.host) : null,
      gorunur: meta.gorunur !== false,
    };
  }
  return null;
}

export function samePartner(a, b) {
  if (!a || !b) return a === b;
  return a.clientId === b.clientId && a.name === b.name && a.page === b.page && a.host === b.host
    && a.gorunur === b.gorunur;
}

/**
 * Partner şu an bakıyor mu? page verilirse o sayfada, verilmezse herhangi bir sayfada; sekmesi önde.
 * true ise anlık bildirim (push) gereksizdir: uygulama içinden zaten görür.
 */
export function partnerGoruyor(partner, page = null) {
  return !!partner && partner.gorunur !== false && (page == null || partner.page === page);
}

/** Zarf { ns, from, m } bu sayfaya mı? Aynı ns ya da '*'; kendi mesajım değil. */
export function acceptEnvelope(env, ns, myClientId) {
  if (!env || typeof env !== 'object') return false;
  if (env.ns !== ns && env.ns !== '*') return false;
  const id = env.from && env.from.clientId;
  return typeof id === 'string' && id !== '' && id !== myClientId;
}

/**
 * Yerel presence mesajını işler: { _p:'here'|'bye', clientId, name, page, host, gorunur, inst }.
 * peers: Map<clientId, { clientId, name, page, host, gorunur, inst, seen }>. reply = yeni eş: hemen "buradayım" de.
 */
export function applyLocalPresence(peers, d, myClientId, now) {
  const none = { changed: false, reply: false };
  if (!d || typeof d.clientId !== 'string' || !d.clientId || d.clientId === myClientId) return none;
  const prev = peers.get(d.clientId);
  if (d._p === 'bye') {
    // Eski sayfanın geç gelen vedası, aynı kişinin yeni sayfasını silmesin.
    if (!prev || (d.inst && prev.inst !== d.inst)) return none;
    peers.delete(d.clientId);
    return { changed: true, reply: false };
  }
  if (d._p !== 'here') return none;
  const next = {
    clientId: d.clientId,
    name: String(d.name || ''),
    page: String(d.page || ''),
    host: d.host ? String(d.host) : null,
    gorunur: d.gorunur !== false,
    inst: String(d.inst || ''),
    seen: now,
  };
  peers.set(d.clientId, next);
  const isNew = !prev || prev.inst !== next.inst;
  const changed = isNew || prev.name !== next.name || prev.page !== next.page || prev.host !== next.host
    || prev.gorunur !== next.gorunur;
  return { changed, reply: isNew };
}

/** ttl'den uzun sessiz kalan eşleri siler. Değişiklik olduysa true. */
export function expirePeers(peers, now, ttl) {
  let changed = false;
  for (const [id, p] of peers) {
    if (now - p.seen > ttl) {
      peers.delete(id);
      changed = true;
    }
  }
  return changed;
}

/** Yeniden bağlanma beklemesi (ms): 2, 4, 8, 16 sn ... en fazla 30 sn. */
export function backoffDelay(attempt) {
  return Math.min(30000, 2000 * 2 ** Math.max(0, attempt));
}

// ---- Ortak oda iskeleti ----

function createBase({ roomId, ns, me, backend }) {
  const listeners = { message: new Set(), presence: new Set(), status: new Set() };
  let status = 'connecting';
  let detail = '';
  let partner = null;

  const call = (fn, args) => {
    try {
      fn(...args);
    } catch (e) {
      console.error('[oda] dinleyici hatası', e);
    }
  };
  const emit = (event, ...args) => {
    for (const fn of [...listeners[event]]) call(fn, args);
  };

  const room = {
    me: { clientId: me.clientId, name: me.name },
    backend,
    roomId: roomId || null,
    ns,
    send: () => false,
    sendAll: () => false,
    partner: () => partner,
    leave: () => {},
    /** 'message' | 'presence' | 'status'. presence ve status hemen bir kez çağrılır. → abonelikten çık */
    on(event, fn) {
      const set = listeners[event];
      if (!set || typeof fn !== 'function') return () => {};
      set.add(fn);
      if (event === 'presence') call(fn, [partner]);
      else if (event === 'status') call(fn, [status, detail]);
      return () => set.delete(fn);
    },
  };

  return {
    room,
    emit,
    status: () => status,
    setStatus(s, d = '') {
      if (s === status && d === detail) return;
      status = s;
      detail = d;
      emit('status', s, d);
    },
    setPartner(p) {
      if (samePartner(p, partner)) return;
      partner = p;
      emit('presence', p);
    },
    clear() {
      for (const set of Object.values(listeners)) set.clear();
    },
  };
}

function listen(target, type, fn) {
  if (!target || typeof target.addEventListener !== 'function') return () => {};
  target.addEventListener(type, fn);
  return () => target.removeEventListener(type, fn);
}

const win = () => (typeof window !== 'undefined' ? window : null);
const doc = () => (typeof document !== 'undefined' ? document : null);
/** Sekme önde mi? Belge yoksa (Node) true. */
const visible = () => { const d = doc(); return d ? d.visibilityState === 'visible' : true; };

// ---- Yalnız oda ----

function openSoloRoom({ ns, me }) {
  const base = createBase({ roomId: null, ns, me, backend: 'solo' });
  base.setStatus('online');
  base.room.leave = () => base.clear();
  return base.room;
}

// ---- Yerel arka uç (BroadcastChannel) ----

/** Testte doğrudan kullanılır; sayfalar joinRoom çağırır. */
export function openLocalRoom({ roomId, ns, me, host = null, heartbeatMs = 3000, ttlMs = 8000 }) {
  const base = createBase({ roomId, ns, me, backend: 'local' });
  const { room } = base;
  if (typeof globalThis.BroadcastChannel !== 'function') {
    base.setStatus('error', 'Bu tarayıcı yerel modu desteklemiyor.');
    return room;
  }

  const bc = new globalThis.BroadcastChannel('bizim:' + roomId);
  const inst = uuid(); // bu sayfa örneği; aynı kişinin eski/yeni sayfasını ayırır
  const peers = new Map();
  const from = { clientId: me.clientId, name: me.name };
  let left = false;

  const post = (d) => {
    if (left) return false;
    try {
      bc.postMessage(d);
      return true;
    } catch {
      return false;
    }
  };
  const hello = () => post({ _p: 'here', clientId: me.clientId, name: me.name, page: ns, host: host || null, gorunur: visible(), inst });
  const bye = () => post({ _p: 'bye', clientId: me.clientId, inst });
  const recompute = () => {
    const state = Object.fromEntries([...peers].map(([id, p]) => [id, [p]]));
    base.setPartner(pickPartner(state, me.clientId));
  };
  const tick = () => {
    hello();
    if (expirePeers(peers, Date.now(), ttlMs)) recompute();
  };

  bc.addEventListener('message', (e) => {
    const d = e.data;
    if (left || !d || typeof d !== 'object') return;
    if (d._p) {
      const { changed, reply } = applyLocalPresence(peers, d, me.clientId, Date.now());
      if (reply) hello();
      if (changed) recompute();
      return;
    }
    if (!acceptEnvelope(d, ns, me.clientId)) return;
    const peer = peers.get(d.from.clientId);
    if (peer) peer.seen = Date.now();
    base.emit('message', d.m, { clientId: d.from.clientId, name: String(d.from.name || '') });
  });

  // Supabase ile aynı davranış: yalnız JSON taşınır (Date → metin, undefined düşer).
  const sendEnv = (target, m) => {
    if (left) return false;
    let env;
    try {
      env = JSON.parse(JSON.stringify({ ns: target, from, m }));
    } catch {
      return false;
    }
    return post(env);
  };

  const timer = setInterval(tick, heartbeatMs);
  const offs = [
    listen(win(), 'pagehide', bye),
    listen(win(), 'pageshow', (e) => { if (e.persisted) tick(); }),
    // Öne gelince ve arka plana gidince hemen yayın: partner "görünür" bilgisini beklemeden alır.
    listen(doc(), 'visibilitychange', tick),
  ];

  room.send = (m) => sendEnv(ns, m);
  room.sendAll = (m) => sendEnv('*', m);
  room.leave = () => {
    if (left) return;
    bye();
    left = true;
    clearInterval(timer);
    offs.forEach((off) => off());
    bc.close();
    base.clear();
    peers.clear();
    base.setPartner(null);
    base.setStatus('offline');
  };

  base.setStatus('online');
  hello();
  return room;
}

// ---- Supabase arka ucu ----

let libPromise = null;
let clientPromise = null;

function loadLibrary() {
  if (globalThis.supabase?.createClient) return Promise.resolve(globalThis.supabase);
  const d = doc();
  if (!d) return Promise.reject(new Error('Supabase yalnız tarayıcıda yüklenir.'));
  if (!libPromise) {
    libPromise = new Promise((resolve, reject) => {
      const s = d.createElement('script');
      s.src = VENDOR_URL;
      s.async = true;
      s.onload = () => {
        if (globalThis.supabase?.createClient) resolve(globalThis.supabase);
        else reject(new Error('Supabase kütüphanesi açılamadı.'));
      };
      s.onerror = () => {
        s.remove();
        reject(new Error('Supabase kütüphanesi yüklenemedi.'));
      };
      d.head.appendChild(s);
    }).catch((e) => {
      libPromise = null; // sonra yeniden denenebilsin
      throw e;
    });
  }
  return libPromise;
}

/** Tek Supabase istemcisi (storage.js ve db.js de kullanır). */
export function getSupabase() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return Promise.reject(new Error('Supabase ayarı yok (js/config.js).'));
  }
  if (!clientPromise) {
    clientPromise = loadLibrary()
      .then((lib) => lib.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        // 10 sn kalp atışı (varsayılan 25 sn): ölü soket daha çabuk fark edilir.
        realtime: { heartbeatIntervalMs: 10000, params: { eventsPerSecond: 10 } },
      }))
      .catch((e) => {
        clientPromise = null;
        throw e;
      });
  }
  return clientPromise;
}

/** Testte sahte istemciyle kullanılır (getClient). → { room, settled } */
export function openSupabaseRoom({ roomId, ns, me, host = null, getClient = getSupabase }) {
  const base = createBase({ roomId, ns, me, backend: 'supabase' });
  const { room } = base;
  const topic = 'oda:' + roomId;
  const from = { clientId: me.clientId, name: me.name };
  let client = null;
  let ch = null;
  let joined = false;
  let left = false;
  let gen = 0; // her bağlanma denemesi yeni kuşak; eski kanalın geri çağrıları yok sayılır
  let attempt = 0;
  let retryTimer = null;
  let beatTimer = null;

  const updatePresence = () => {
    base.setPartner(joined && ch ? pickPartner(ch.presenceState(), me.clientId) : null);
  };
  const payload = () => ({ clientId: me.clientId, name: me.name, page: ns, host: host || null, gorunur: visible() });
  const track = () => {
    if (!joined || !ch) return;
    try {
      Promise.resolve(ch.track(payload())).catch(() => {});
    } catch { /* kanal kapanıyor */ }
  };

  const scheduleRetry = () => {
    if (left || retryTimer) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      if (!left && !joined) connect();
    }, backoffDelay(attempt++));
  };

  const lost = (status, detail) => {
    joined = false;
    base.setPartner(null);
    base.setStatus(status, detail);
    scheduleRetry(); // kütüphane kendi de yeniden katılır; bu bekçi, olmazsa kanalı baştan kurar
  };

  const removeQuietly = async (c) => {
    try {
      await client.removeChannel(c);
    } catch { /* zaten kapalı */ }
  };

  async function connect() {
    clearTimeout(retryTimer);
    retryTimer = null;
    const my = ++gen;
    const mine = () => my === gen && !left;
    joined = false;
    base.setPartner(null);
    base.setStatus('connecting', 'Bağlanıyor…');

    try {
      client = client || (await getClient());
    } catch {
      if (mine()) lost('error', 'Bağlantı kurulamadı. Yeniden deneniyor…');
      return;
    }
    if (!mine()) return;

    // client.channel() aynı konu için eski kanalı döndürür; önce eskisini kaldır.
    for (const old of client.getChannels().filter((c) => c.topic === 'realtime:' + topic)) {
      await removeQuietly(old);
    }
    if (!mine()) return;

    const channel = client.channel(topic, {
      config: { broadcast: { self: false, ack: false }, presence: { key: me.clientId } },
    });
    ch = channel;
    channel.on('broadcast', { event: 'm' }, (msg) => {
      const env = msg && msg.payload;
      if (!mine() || !acceptEnvelope(env, ns, me.clientId)) return;
      base.emit('message', env.m, { clientId: env.from.clientId, name: String(env.from.name || '') });
    });
    const onPresence = () => { if (mine()) updatePresence(); };
    channel.on('presence', { event: 'sync' }, onPresence);
    channel.on('presence', { event: 'join' }, onPresence);
    channel.on('presence', { event: 'leave' }, onPresence);
    channel.subscribe((s) => {
      if (!mine()) return;
      if (s === 'SUBSCRIBED') {
        joined = true;
        attempt = 0;
        clearTimeout(retryTimer);
        retryTimer = null;
        base.setStatus('online');
        track();
        updatePresence();
      } else if (s === 'CHANNEL_ERROR') {
        lost('error', 'Bağlantıda sorun var. Yeniden deneniyor…');
      } else if (s === 'TIMED_OUT') {
        lost('error', 'Sunucu yanıt vermedi. Yeniden deneniyor…');
      } else if (s === 'CLOSED') {
        lost('offline', 'Bağlantı kapandı. Yeniden bağlanılıyor…');
      }
    });
  }

  // Kütüphane: yanıt beklenirken yeni kalp atışı gelirse zaman aşımı sayar, soketi kapatıp yeniden bağlanır.
  const heartbeat = () => {
    const rt = client && client.realtime;
    if (left || !rt || typeof rt.sendHeartbeat !== 'function') return;
    try {
      rt.sendHeartbeat();
    } catch { /* önemsiz */ }
  };

  // Sekme öne gelince / ağ dönünce durumu tazele.
  const refresh = (force) => {
    if (left) return;
    if (joined) {
      // Telefon uyanınca soket ölü olabilir: hemen bir kalp atışı, ~4 sn sonra bir daha.
      // İlki yanıtsız kaldıysa ikincisi kopukluğu ortaya çıkarır (25 sn beklemeden).
      heartbeat();
      clearTimeout(beatTimer);
      beatTimer = setTimeout(() => {
        beatTimer = null;
        heartbeat();
      }, WAKE_BEAT_MS);
      updatePresence();
      return;
    }
    if (!force && base.status() === 'connecting') return;
    attempt = 0;
    connect();
  };
  const offs = [
    listen(doc(), 'visibilitychange', () => {
      track(); // gorunur değişti: presence yükünü yenile
      if (visible()) refresh(false);
    }),
    listen(win(), 'online', () => refresh(true)),
    listen(win(), 'offline', () => { if (!left) lost('offline', 'İnternet bağlantısı yok.'); }),
    listen(win(), 'pageshow', (e) => { if (e.persisted) refresh(true); }),
  ];

  const sendEnv = (target, m) => {
    if (left || !joined || !ch) return false;
    try {
      Promise.resolve(ch.send({ type: 'broadcast', event: 'm', payload: { ns: target, from, m } })).catch(() => {});
    } catch {
      return false;
    }
    return true;
  };

  room.send = (m) => sendEnv(ns, m);
  room.sendAll = (m) => sendEnv('*', m);
  room.leave = async () => {
    if (left) return;
    left = true;
    gen++;
    clearTimeout(retryTimer);
    clearTimeout(beatTimer);
    offs.forEach((off) => off());
    base.clear();
    joined = false;
    base.setPartner(null);
    base.setStatus('offline');
    const c = ch;
    ch = null;
    if (c && client) await removeQuietly(c);
  };

  connect();
  return { room, settled: settle(room, 5000) };
}

/** İlk 'online' / 'error' / 'offline' durumunu ya da süre dolmasını bekler. */
function settle(room, ms) {
  return new Promise((resolve) => {
    let off = null;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(t);
      if (off) off();
      resolve();
    };
    const t = setTimeout(finish, ms);
    off = room.on('status', (s) => { if (s !== 'connecting') finish(); });
    if (done) off();
  });
}

// ---- Giriş noktası ----

/**
 * Odaya katıl. roomId yoksa yalnız oda (no-op) döner.
 * Supabase'de ilk bağlantıyı en fazla 5 sn bekler; sonra durumu 'status' olayından izle.
 */
export async function joinRoom({ roomId, ns = 'lobby' } = {}) {
  const who = whoAmI();
  const space = String(ns);
  if (!roomId) return openSoloRoom({ ns: space, me: who });
  const id = String(roomId);
  const host = space === 'lobby' ? null : readGameParams().hostId;
  if (isLocalMode()) return openLocalRoom({ roomId: id, ns: space, me: who, host });
  const { room, settled } = openSupabaseRoom({ roomId: id, ns: space, me: who, host });
  await settled;
  return room;
}
