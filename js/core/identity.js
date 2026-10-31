// Kimlik, oda ve adres yardımcıları.
// Node'da da içe aktarılabilir: tarayıcı nesnelerine yalnız fonksiyon içinde, korumalı erişilir.
import { SUPABASE_URL } from '../config.js';

/** Site kökü (alt klasörde de doğru): js/core/ → iki üst. */
export const SITE_ROOT = new URL('../../', import.meta.url).href;

const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789'; // 32 harf: l, o, 0, 1 yok
const ROOM_RE = new RegExp(`^[${ALPHABET}]{10}$`);
const PARAM_RE = /^[A-Za-z0-9_-]{1,64}$/;

const K_CLIENT = 'bizim.client';
const K_NAME = 'bizim.name';
const K_ROOM = 'bizim.room';
const K_LOCAL = 'bizim.yerel';

// ---- Depolama (localStorage / sessionStorage; yoksa bellek) ----

// Yazılamayan anahtarların bellekteki kopyası (null = silindi). Depoya yazılabilenler burada tutulmaz.
const memory = new Map();

function getStore(kind) {
  if (typeof window === 'undefined') return null; // Node: yalnız bellek
  try {
    return (kind === 'session' ? window.sessionStorage : window.localStorage) || null;
  } catch {
    return null; // gizli mod, engellenmiş çerez vb.
  }
}

/** kind: 'local' | 'session'. */
export function readStore(kind, key) {
  const mk = `${kind}:${key}`;
  if (memory.has(mk)) return memory.get(mk);
  const s = getStore(kind);
  if (!s) return null;
  try {
    return s.getItem(key);
  } catch {
    return null;
  }
}

/** value null ise siler. Depo yazılamazsa değer bellekte tutulur. */
export function writeStore(kind, key, value) {
  const mk = `${kind}:${key}`;
  const v = value == null ? null : String(value);
  const s = getStore(kind);
  if (s) {
    try {
      if (v === null) s.removeItem(key);
      else s.setItem(key, v);
      memory.delete(mk);
      return;
    } catch { /* kota dolu / eski Safari gizli mod: belleğe yaz */ }
  }
  memory.set(mk, v);
}

// ---- Rastgele kimlikler ----

function randomBytes(n) {
  const b = new Uint8Array(n);
  globalThis.crypto.getRandomValues(b);
  return b;
}

/** UUID v4. randomUUID güvenli bağlam ister (http://192.168.. olmaz); yedek yol var. */
export function uuid() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    try { return globalThis.crypto.randomUUID(); } catch { /* yedek yola düş */ }
  }
  const b = randomBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** 10 karakter, [a-z2-9], l/o/0/1 yok. 32 harf → bayt & 31 yansız. */
export function newRoomId() {
  return [...randomBytes(10)].map((x) => ALPHABET[x & 31]).join('');
}

export function isValidRoomId(id) {
  return typeof id === 'string' && ROOM_RE.test(id);
}

// ---- Yerel mod ----

/** Saf karar: config boş, URL'de yerel=1 ya da sekmede bayrak var. */
export function computeLocalMode(supabaseUrl, search, sessionFlag) {
  if (!supabaseUrl) return true;
  if (new URLSearchParams(search || '').get('yerel') === '1') return true;
  return sessionFlag === '1';
}

export function isLocalMode() {
  const search = globalThis.location?.search || '';
  if (new URLSearchParams(search).get('yerel') === '1') {
    writeStore('session', K_LOCAL, '1'); // sekme içinde sayfa geçişlerinde korunur
  }
  return computeLocalMode(SUPABASE_URL, search, readStore('session', K_LOCAL));
}

// ---- Kişi ve oda ----

// Yerel modda iki sekme iki ayrı kişi olmalı: kimlik ve ad sekmeye özel (sessionStorage).
function idKind() {
  return isLocalMode() ? 'session' : 'local';
}

export function me() {
  const kind = idKind();
  let clientId = readStore(kind, K_CLIENT);
  if (!clientId) {
    clientId = uuid();
    writeStore(kind, K_CLIENT, clientId);
  }
  return { clientId, name: readStore(kind, K_NAME) || '' };
}

export function setName(name) {
  const clean = String(name ?? '').trim().slice(0, 40);
  writeStore(idKind(), K_NAME, clean || null);
}

const KIM_RE = /^[A-Za-z0-9_-]{8,64}$/;

/** Taşıma: bu cihaz o kişinin kimliğini alır (yalnız odasız ekranda elle yapıştırılan linkle; hub.js). */
export function setClientId(id) {
  if (KIM_RE.test(id || '')) writeStore(idKind(), K_CLIENT, id);
}

export function currentRoom() {
  return readStore('local', K_ROOM) || null;
}

export function setRoom(roomId) {
  writeStore('local', K_ROOM, roomId || null);
}

export function clearRoom() {
  writeStore('local', K_ROOM, null);
}

// ---- Adresler (saf hâlleri test edilir; base enjekte edilir) ----

const DAVET_RE = /^[a-z2-9]{32}$/;

/** Davet linki. davet = tek kullanımlık kod (uyelik.js davetOlustur); geçersizse eklenmez. */
export function buildInviteUrl(root, roomId, local, davet = null) {
  const u = new URL(root);
  u.search = local ? '?yerel=1' : '';
  u.hash = 'oda=' + encodeURIComponent(roomId) + (DAVET_RE.test(davet || '') ? '&davet=' + davet : '');
  return u.href;
}

/** Saf: '#oda=<id>' ya da '#oda=<id>&davet=<kod>' → { oda, davet|null } | null. */
export function parseInviteHash(hash) {
  const m = /^#oda=([a-z0-9]{4,40})(?:&davet=([^&]*))?$/i.exec(String(hash || ''));
  if (!m) return null;
  return { oda: m[1].toLowerCase(), davet: DAVET_RE.test(m[2] || '') ? m[2] : null };
}

/**
 * Saf: yapıştırılan metindeki davet ya da taşıma linki → { oda, davet, kim, ad } | null.
 * APK linki kendisi açamaz; odasız ekrandaki alana yapıştırılır. kim/ad: cihaz o kişi olarak devam eder.
 */
export function parseYapistirilanLink(metin) {
  const s = String(metin || '').trim();
  const i = s.indexOf('#oda=');
  if (i < 0) return null;
  const p = new URLSearchParams(s.slice(i + 1).split(/\s/)[0]);
  const oda = (p.get('oda') || '').toLowerCase();
  if (!/^[a-z0-9]{4,40}$/.test(oda)) return null;
  const al = (ad, re) => (re.test(p.get(ad) || '') ? p.get(ad) : null);
  return { oda, davet: al('davet', DAVET_RE), kim: al('kim', KIM_RE), ad: (p.get('ad') || '').trim().slice(0, 40) || null };
}

export function buildLobbyUrl(root, local) {
  const u = new URL(root);
  u.search = local ? '?yerel=1' : '';
  u.hash = '';
  return u.href;
}

export function buildGameUrl(root, gameId, { roomId, host } = {}, local = false) {
  const u = new URL(`games/${encodeURIComponent(gameId)}/`, root);
  const p = new URLSearchParams();
  if (roomId) p.set('oda', roomId);
  if (host) p.set('host', host);
  if (local) p.set('yerel', '1');
  u.search = p.toString();
  return u.href;
}

/** Site köküne göre sayfa adresi (ör. 'sayfalar/sohbet/'). Yerel modda yerel=1 ekler. */
export function buildPageUrl(root, path, params = {}, local = false) {
  const u = new URL(path, root);
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) if (v != null && v !== '') p.set(k, String(v));
  if (local) p.set('yerel', '1');
  u.search = p.toString();
  return u.href;
}

export function pageUrl(path, params = {}) {
  return buildPageUrl(SITE_ROOT, path, params, isLocalMode());
}

export function inviteUrl(roomId, davet = null) {
  return buildInviteUrl(SITE_ROOT, roomId, isLocalMode(), davet);
}

export function lobbyUrl() {
  return buildLobbyUrl(SITE_ROOT, isLocalMode());
}

export function gameUrl(gameId, { roomId, host } = {}) {
  return buildGameUrl(SITE_ROOT, gameId, { roomId, host }, isLocalMode());
}

function cleanParam(v) {
  return typeof v === 'string' && PARAM_RE.test(v) ? v : null;
}

/** Saf: sorgu dizesi + kendi kimliğim → oyun parametreleri. */
export function parseGameParams(search, myClientId) {
  const p = new URLSearchParams(search || '');
  const roomId = cleanParam(p.get('oda'));
  const hostId = cleanParam(p.get('host'));
  const solo = !roomId;
  return { roomId, hostId, isHost: solo || !hostId || hostId === myClientId, solo };
}

export function readGameParams() {
  return parseGameParams(globalThis.location?.search || '', me().clientId);
}
