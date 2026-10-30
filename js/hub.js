// Ana sayfa "Biz". İlk açılış: ad → oda kur ya da davetle gel → davet → "Ne zamandan beri birlikteyiz?".
// Biz ekranı: çift başlığı, gün sayacı, bugün, yaklaşanlar, buluşma, günün sorusu, dokunuş, ruh hâli, oyunlar.
// Sözleşme §11 ve v2 §14–§18. Saf yardımcılar dışa aktarılır (tests/hub-biz.test.mjs); DOM yalnız tarayıcıda kurulur.
import { GAMES, gameById } from './core/games.js';
import { me, setName, currentRoom, setRoom, newRoomId, inviteUrl, gameUrl, pageUrl, isLocalMode } from './core/identity.js';
import { joinRoom, partnerGoruyor } from './core/room.js';
import { roomStats } from './core/db.js';
import { openCollection } from './core/veri.js';
import { openProfil, pickPartnerDoc } from './core/profil.js';
import {
  parseDay, toDay, daysBetween, daysTogether, durationParts, upcoming, milestones, todaysEvents, countdown, leftText,
} from './core/gunler.js';
import {
  h, icon, ICONS, avatarEl, toast, celebrate, shareInvite, copyInvite, muteButton, pairEl, knownPartner, rememberPartner,
  partnerWhere, locative, genitive, trackShellHeight, formatDay, startAppServices, mountTabBar, removeTabBar,
  listenTouches, TOUCHES, touchByTur,
} from './core/ui.js';
import { sfx } from './core/sound.js';

const NAME_MAX = 24;
const GO_DELAY_MS = 1500; // partner oyun açınca otomatik geçiş süresi
const SEND_GRACE_MS = 160; // 'go' mesajı yola çıksın diye sayfadan çıkmadan önce bekleme
const PRESENCE_WAIT_MS = 2500; // partnerin yeri belli olana dek kartlar kapalı (en fazla bu kadar)
const TOUCH_GAP_MS = 2000; // dokunuş: en çok 2 sn'de bir
const MOOD_NOTE_MAX = 80;
const PROFIL_WAIT_MS = 4000; // ilk açılışta tarih sorusundan önce profili en fazla bu kadar bekle
const PAGES = { gunler: 'sayfalar/gunler/', gunsorusu: 'sayfalar/gunun-sorusu/', ayarlar: 'sayfalar/ayarlar/' };

// ====================================================================================
// Saf yardımcılar (Node'da test edilir)
// ====================================================================================

/** Ruh hâli seçenekleri (veri türü 'ruh', alan emoji). Eski belgedeki başka emoji yine gösterilir. */
export const MOODS = [
  { emoji: '🥰', ad: 'Aşık' },
  { emoji: '😊', ad: 'Mutlu' },
  { emoji: '😌', ad: 'Huzurlu' },
  { emoji: '🤩', ad: 'Heyecanlı' },
  { emoji: '😴', ad: 'Yorgun' },
  { emoji: '😔', ad: 'Hüzünlü' },
];

export function moodByEmoji(emoji) {
  return MOODS.find((m) => m.emoji === emoji) || null;
}

export function cleanName(v) {
  return String(v || '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
}

export function cleanNote(v) {
  return String(v || '').replace(/\s+/g, ' ').trim().slice(0, MOOD_NOTE_MAX);
}

/** { years, months, days } → "1 yıl, 4 ay, 2 gün" (sıfırlar atlanır; hepsi sıfırsa ''). */
export function durationText({ years = 0, months = 0, days = 0 } = {}) {
  const out = [];
  if (years) out.push(`${years} yıl`);
  if (months) out.push(`${months} ay`);
  if (days) out.push(`${days} gün`);
  return out.join(', ');
}

// Sayının okunuşuna göre ayrılma eki: 3 → üç'ten, 6 → altı'dan, 20 → yirmi'den, 2000 → bin'den.
const ABL_ONES = ['', 'den', 'den', 'ten', 'ten', 'ten', 'dan', 'den', 'den', 'dan'];
const ABL_TENS = ['', 'dan', 'den', 'dan', 'tan', 'den', 'tan', 'ten', 'den', 'dan'];
export function ablativeNum(n) {
  const x = Math.abs(Math.trunc(Number(n) || 0));
  if (x === 0) return 'dan';
  if (x % 10) return ABL_ONES[x % 10];
  if (x % 100) return ABL_TENS[(x % 100) / 10];
  return 'den'; // yüz, bin
}

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

/** '2025-02-14' → "14 Şubat 2025'ten beri". */
export function sinceText(day) {
  const p = parseDay(day);
  if (!p) return '';
  return `${p.d} ${MONTHS[p.m - 1]} ${p.y}'${ablativeNum(p.y)} beri`;
}

function asDay(v) {
  return typeof v === 'string' ? v : toDay(v);
}

/** '2026-11-12' → "12 Kasım Perşembe" (başka yılsa yıl da yazılır). */
export function dayLabel(day, today = new Date()) {
  const p = parseDay(day);
  if (!p) return '';
  const t = parseDay(asDay(today));
  const opts = { day: 'numeric', month: 'long', weekday: 'long' };
  if (t && t.y !== p.y) opts.year = 'numeric';
  return new Intl.DateTimeFormat('tr-TR', opts).format(new Date(p.y, p.m - 1, p.d, 12));
}

/** ISO an → "12 Kasım Perşembe 18:00". */
export function momentLabel(iso, now = new Date()) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const opts = { day: 'numeric', month: 'long', weekday: 'long', hour: '2-digit', minute: '2-digit' };
  if (d.getFullYear() !== new Date(now).getFullYear()) opts.year = 'numeric';
  return new Intl.DateTimeFormat('tr-TR', opts).format(d);
}

/** "az önce" / "5 dk önce" / "3 sa önce" / formatDay (dün, 3 gün önce, 12 Ekim). */
export function agoText(iso, now = new Date()) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, (new Date(now).getTime() - t) / 1000);
  if (s < 60) return 'az önce';
  if (s < 3600) return `${Math.floor(s / 60)} dk önce`;
  if (s < 86400) return `${Math.floor(s / 3600)} sa önce`;
  return formatDay(t, new Date(now));
}

/**
 * Kişi belgelerindeki doğum günleri → gun belgesi biçiminde (upcoming/todaysEvents bunları okur).
 * Aynı ay-günde zaten 'dogumgunu' türünde bir gun belgesi varsa eklenmez (Günler sayfası da eklemiş olabilir).
 */
export function birthdayDocs(kisiDocs, myId, gunDocs = []) {
  const taken = new Set((gunDocs || [])
    .filter((g) => g?.data?.tur === 'dogumgunu' && parseDay(g.data.tarih))
    .map((g) => g.data.tarih.slice(5)));
  const out = [];
  for (const k of kisiDocs || []) {
    const d = k?.data || {};
    if (!parseDay(d.dogum) || taken.has(d.dogum.slice(5))) continue;
    const ad = cleanName(d.ad);
    const baslik = k.id === myId ? 'Doğum günün' : ad ? `${genitive(ad)} doğum günü` : 'Sevgilinin doğum günü';
    out.push({ id: `dogum-${k.id}`, data: { baslik, tarih: d.dogum, tekrar: 'yil', tur: 'dogumgunu', emoji: '🎂' } });
  }
  return out;
}

const milestoneEmoji = (m) => (m.tur === 'yil' ? '🥂' : m.tur === 'ay' ? '🌙' : '💞');

/**
 * Yaklaşanlar: özel günler (gun) + doğum günleri (kisi) + birlikteliğin kilometre taşları. En yakın `limit` tane.
 * -> [{ key, emoji, baslik, date, daysLeft, tur }]
 */
export function yaklasanlar({ gunDocs = [], kisiDocs = [], myId = null, baslangic = null, today = new Date(), limit = 3 } = {}) {
  const t = asDay(today);
  const docs = [...(gunDocs || []), ...birthdayDocs(kisiDocs, myId, gunDocs)];
  const items = upcoming(docs, { today: t, limit: limit + 6 }).map((u) => ({
    key: `g:${u.id}:${u.date}`,
    emoji: u.emoji,
    baslik: u.tur === 'yildonumu' && u.kacinci > 0 ? `${u.baslik} · ${u.kacinci}. yıl` : u.baslik,
    date: u.date,
    daysLeft: u.daysLeft,
    tur: u.tur,
  }));
  const anniversaries = new Set(items.filter((i) => i.tur === 'yildonumu').map((i) => i.date));
  if (parseDay(baslangic)) {
    for (const m of milestones(baslangic, { today: t, limit: limit + 2 })) {
      if (m.tur === 'yil' && anniversaries.has(m.date)) continue;
      items.push({ key: `m:${m.date}`, emoji: milestoneEmoji(m), baslik: m.baslik, date: m.date, daysLeft: m.daysLeft, tur: m.tur });
    }
  }
  return items.sort((a, b) => a.daysLeft - b.daysLeft).slice(0, limit);
}

/** Bugün kutlananlar (özel gün, doğum günü, gün/ay/yıl dönümü). -> [{ emoji, baslik }] */
export function bugunkuler({ gunDocs = [], kisiDocs = [], myId = null, baslangic = null, today = new Date() } = {}) {
  const docs = [...(gunDocs || []), ...birthdayDocs(kisiDocs, myId, gunDocs)];
  const events = todaysEvents(docs, parseDay(baslangic) ? baslangic : null, asDay(today));
  const anniversary = events.some((e) => e.tur === 'yildonumu');
  return events
    .filter((e) => !(anniversary && e.tur === 'yil'))
    .map((e) => ({ emoji: e.emoji || milestoneEmoji(e), baslik: e.baslik }));
}

/** Bana gelen dokunuşlar (since ms'den sonra), türe göre sayılı. -> [{ tur, emoji, n }] TOUCHES sırasıyla. */
export function touchSummary(docs, myId, since = 0) {
  const counts = new Map();
  for (const d of docs || []) {
    const x = d?.data || {};
    if (!myId || x.kime !== myId || d.author === myId) continue;
    const at = Date.parse(x.at || d.created_at);
    if (!(at > since)) continue;
    const t = touchByTur(x.tur);
    if (t) counts.set(t.tur, (counts.get(t.tur) || 0) + 1);
  }
  return TOUCHES.filter((t) => counts.has(t.tur)).map((t) => ({ tur: t.tur, emoji: t.emoji, n: counts.get(t.tur) }));
}

/** "Gül sana 3 💗 ve 1 🤗 gönderdi" ('' boşsa). */
export function touchSummaryText(name, items) {
  if (!items?.length) return '';
  const parts = items.map((i) => `${i.n} ${i.emoji}`);
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} ve ${parts[parts.length - 1]}` : parts[0];
  return `${name || 'Sevgilin'} sana ${list} gönderdi`;
}

export function validCoord(c) {
  return !!c && Number.isFinite(c.lat) && Number.isFinite(c.lng)
    && Math.abs(c.lat) <= 90 && Math.abs(c.lng) <= 180;
}

/** İki nokta arası büyük çember uzaklığı (km). */
export function haversineKm(a, b) {
  const R = 6371;
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** "Aramızda 412 km" / "Aynı yerdesiniz" ('' geçersizse). */
export function distanceText(km) {
  if (!Number.isFinite(km) || km < 0) return '';
  if (km < 1) return 'Aynı yerdesiniz';
  return `Aramızda ${Math.round(km).toLocaleString('tr-TR')} km`;
}

// ====================================================================================
// Tarayıcı
// ====================================================================================

let shell = null;
let app = null;

const emptyData = () => ({ profil: null, gun: null, dokunus: null, ruh: null, konum: null, oyunkayit: null });

const state = {
  room: null, // ana sayfa Room nesnesi (ns 'lobby')
  roomId: null, // bağlanılan oda
  joining: null, // bekleyen joinRoom sözü
  subs: [],
  partner: null,
  status: 'connecting',
  statusDetail: '',
  fresh: false, // oda yeni kuruldu: davet ekranı
  onboard: false, // ilk açılış: başlangıç tarihi sorulacak
  goTimer: 0,
  goToastClose: null,
  leaving: false, // sayfadan çıkılıyor: ikinci tıklamayı yok say
  waiting: false, // partnerin hangi oyunda olduğu henüz bilinmiyor: kart açma ikinci ev sahibi yaratabilir
  waitTimer: 0,
  view: null, // Biz ekranının boyanacak parçaları
  dateView: null, // ilk açılış tarih ekranı
  settingsLink: null,
  data: emptyData(), // profil + koleksiyonlar (gun, dokunus, ruh, konum, oyunkayit)
  dataSubs: [],
  lastTouch: 0,
  lastWrite: 0,
  lastErrToast: 0,
  savingStart: false,
  today: '',
};

// ---------- Küçük yardımcılar ----------
function lsGet(k) {
  try { return localStorage.getItem(k); } catch { return null; }
}
function lsSet(k, v) {
  try { localStorage.setItem(k, v); } catch { /* gizli sekme */ }
}
const myId = () => me().clientId;
const skipKey = (roomId) => `bizim.baslangicGec.${roomId}`;
const seenKey = (roomId) => `bizim.dokunusGordu.${roomId}.${myId()}`;
const partyKey = (roomId) => `bizim.kutlama.${roomId}.${myId()}`;

function tintOf(g) {
  return String((GAMES.indexOf(g) % 6) + 1);
}

/** Değişmediyse boyama: aynı anahtar → false. */
function changed(view, part, key) {
  if (view.keys[part] === key) return false;
  view.keys[part] = key;
  return true;
}

function section(id, title, { action = null } = {}, ...body) {
  return h('section', { class: 'biz-sec', 'aria-labelledby': id },
    h('div', { class: 'biz-sec-head' }, h('h2', { id }, title), action),
    ...body);
}

/** Partner kimliği: presence > profil > son görülen. */
function partnerInfo() {
  const p = state.partner;
  const prof = state.data.profil?.partner?.() || null;
  const known = state.roomId ? knownPartner(state.roomId) : null;
  const id = p?.clientId || prof?.clientId || known?.clientId || null;
  const name = cleanName(p?.name || prof?.ad || known?.name || '');
  const foto = prof && prof.clientId === id ? prof.foto || null : null;
  return { id, name, foto };
}

function docOf(col, id) {
  if (!col) return null;
  return (id ? col.get(id) : pickPartnerDoc(col.all(), myId())) || null;
}

// ---------- Davet linki: #oda=<id> ----------
function takeHashRoom() {
  const m = location.hash.match(/^#oda=([a-z0-9]{4,40})$/i);
  if (!location.hash.startsWith('#oda=')) return false;
  history.replaceState(null, '', location.pathname + location.search);
  if (!m) return false;
  const id = m[1].toLowerCase();
  if (id === currentRoom()) return false;
  leaveRoom();
  setRoom(id);
  state.fresh = false;
  state.onboard = true;
  return true;
}

// ---------- Oda bağlantısı ----------
function leaveRoom() {
  clearGo();
  endWait();
  closeData();
  for (const off of state.subs) if (typeof off === 'function') off();
  state.subs = [];
  try { state.room?.leave?.(); } catch { /* zaten kopuk */ }
  state.room = null;
  state.roomId = null;
  state.joining = null;
  state.partner = null;
  state.status = 'connecting';
  state.statusDetail = '';
}

async function ensureRoom(roomId) {
  if (state.roomId === roomId && (state.room || state.joining)) return;
  leaveRoom();
  state.roomId = roomId;
  state.waiting = true;
  const pending = joinRoom({ roomId, ns: 'lobby' });
  state.joining = pending;
  let room;
  try {
    room = await pending;
  } catch {
    if (state.joining !== pending) return;
    state.joining = null;
    endWait();
    state.status = 'error';
    state.statusDetail = 'Odaya bağlanılamadı. Sayfayı yenileyip yeniden dene.';
    paintAll();
    return;
  }
  if (state.joining !== pending) {
    try { room?.leave?.(); } catch { /* yok say */ }
    return;
  }
  state.joining = null;
  state.room = room;
  state.status = 'online';
  // İlk presence (partner görünür) ya da 2,5 sn: hangisi önce gelirse kartlar açılır.
  state.waitTimer = setTimeout(() => {
    endWait();
    paintAll();
  }, PRESENCE_WAIT_MS);
  state.subs = [
    room.on('status', onStatus),
    room.on('message', onMessage),
    room.on('presence', onPresence),
    listenTouches(room),
  ];
  openData(room);
  mountGs(state.view);
  paintAll();
}

function onStatus(status, detail) {
  state.status = status;
  state.statusDetail = detail || '';
  paintAll();
}

function endWait() {
  clearTimeout(state.waitTimer);
  state.waitTimer = 0;
  state.waiting = false;
}

function onPresence(p) {
  const roomId = state.roomId;
  const before = knownPartner(roomId);
  state.partner = p || null;
  if (p) {
    endWait(); // partnerin yeri belli
    rememberPartner(roomId, p);
    if (!before) {
      sfx('match');
      toast(`${p.name || 'Sevgilin'} ile aynı odadasınız`);
      if (state.fresh) {
        state.fresh = false;
        state.onboard = true;
        render({ focus: true });
        return;
      }
    }
  }
  paintAll();
}

function clearGo() {
  clearTimeout(state.goTimer);
  state.goTimer = 0;
  state.goToastClose?.();
  state.goToastClose = null;
}

function onMessage(msg, from) {
  if (!msg || msg.t !== 'go' || state.leaving) return;
  const g = gameById(msg.game);
  const roomId = currentRoom();
  if (!g || !roomId || !msg.host) return;
  const name = from?.name || state.partner?.name || 'Sevgilin';
  const url = gameUrl(g.id, { roomId, host: msg.host });
  clearGo();
  sfx('pop');
  state.goToastClose = toast(`${name} ${g.title} oyununu açtı`, {
    ms: GO_DELAY_MS,
    action: {
      label: 'Vazgeç',
      onClick: () => {
        state.goToastClose = null;
        clearGo();
        toast('Ana sayfada kaldın');
      },
    },
  });
  state.goTimer = setTimeout(() => {
    state.goTimer = 0;
    state.leaving = true;
    location.href = url;
  }, GO_DELAY_MS);
}

// ---------- Çift verisi ----------
function openData(room) {
  const open = (key, promise) => {
    promise.then((v) => {
      if (state.room !== room) { v?.close?.(); return; }
      state.data[key] = v;
      state.dataSubs.push(v.on('change', () => onData(key)));
      if (key !== 'profil') state.dataSubs.push(v.on('error', onDataError));
      onData(key);
    }).catch((e) => console.warn('[biz] veri açılamadı:', key, e));
  };
  open('profil', openProfil(room));
  open('gun', openCollection(room, 'gun'));
  open('dokunus', openCollection(room, 'dokunus', { recent: 60 }));
  open('ruh', openCollection(room, 'ruh'));
  open('konum', openCollection(room, 'konum'));
  open('oyunkayit', openCollection(room, 'oyunkayit'));
}

function closeData() {
  for (const off of state.dataSubs) {
    try { if (typeof off === 'function') off(); } catch { /* yok say */ }
  }
  state.dataSubs = [];
  for (const v of Object.values(state.data)) {
    try { v?.close?.(); } catch { /* yok say */ }
  }
  state.data = emptyData();
}

function onData() {
  paintAll();
}

// Ağ hataları yalnız kendi yazmamızdan hemen sonra gösterilir (arka plan tazelemesi sessiz).
function onDataError(err) {
  const now = Date.now();
  if (now - state.lastWrite > 8000 || now - state.lastErrToast < 8000) return;
  state.lastErrToast = now;
  toast(err?.message || 'Kaydedilemedi. Bağlantını kontrol et.');
}

// ---------- Oyun açma ----------
function openSolo(g) {
  if (state.leaving) return;
  state.leaving = true;
  sfx('tap');
  location.href = gameUrl(g.id, {});
}

function openGame(g) {
  const roomId = currentRoom();
  if (!roomId) return openSolo(g);
  if (state.leaving || state.waiting) return;
  state.leaving = true;
  clearGo();
  sfx('tap');
  const p = state.partner;
  if (p && p.page === g.id) {
    // Sevgilin zaten o oyunda: o oyunun ev sahibine katıl (sevgilin misafirse ev sahibi başkası, belki sensin).
    location.href = gameUrl(g.id, { roomId, host: p.host || p.clientId });
    return;
  }
  const host = me().clientId;
  try { state.room?.sendAll({ t: 'go', game: g.id, host }); } catch { /* bağlantı yoksa da oyun açılır */ }
  setTimeout(() => { location.href = gameUrl(g.id, { roomId, host }); }, SEND_GRACE_MS);
}

function joinPartner(p) {
  const roomId = currentRoom();
  if (!roomId || !p || !gameById(p.page) || state.leaving) return;
  state.leaving = true;
  sfx('tap');
  location.href = gameUrl(p.page, { roomId, host: p.host || p.clientId });
}

// ---------- Parçalar ----------
function gameCard(g, onOpen) {
  const badge = h('span', { class: 'chip accent', hidden: true });
  const card = h('button', { type: 'button', class: 'game-card', dataset: { game: g.id }, onclick: () => onOpen(g) },
    h('span', { class: 'game-tile', dataset: { tint: tintOf(g) }, 'aria-hidden': 'true' }, g.emoji),
    h('span', { class: 'game-body' },
      h('span', { class: 'game-title' }, g.title),
      h('span', { class: 'game-desc' }, g.desc),
      h('span', { class: 'game-meta' },
        h('span', { class: 'chip' }, `${g.players} kişi`),
        h('span', { class: 'chip' }, g.minutes),
        badge)));
  return { card, badge };
}

function linkBox(roomId) {
  const select = (e) => e.currentTarget.select();
  return h('div', { class: 'linkbox' },
    h('input', {
      class: 'input', type: 'text', readonly: true, value: inviteUrl(roomId),
      'aria-label': 'Davet linki', onfocus: select, onclick: select,
    }),
    h('button', { type: 'button', class: 'btn small', onclick: () => copyInvite(roomId) }, icon('copy'), 'Kopyala'));
}

function shareButton(roomId, cls = 'btn primary') {
  return h('button', { type: 'button', class: cls, onclick: () => shareInvite(roomId) }, icon('share'), 'Linki paylaş');
}

/** Başlangıç tarihi formu (ilk açılış ve sayaç kartı). */
function startForm({ submitLabel = 'Kaydet', onSaved } = {}) {
  const today = toDay(new Date());
  const input = h('input', {
    class: 'input', id: 'biz-start', name: 'baslangic', type: 'date', min: '1950-01-01', max: today, required: true,
  });
  const preview = h('p', { class: 'biz-date-preview', 'aria-live': 'polite' });
  const err = h('p', { class: 'hub-error', id: 'biz-start-err', hidden: true });
  const save = h('button', { type: 'submit', class: 'btn primary' }, submitLabel);
  input.addEventListener('input', () => {
    const d = input.value;
    const n = parseDay(d) ? daysTogether(d, toDay(new Date())) : 0;
    preview.textContent = n > 0 ? `Bugün ${n}. gününüz 💞` : '';
    err.hidden = true;
    input.removeAttribute('aria-invalid');
  });
  const form = h('form', {
    class: 'stack biz-start-form',
    novalidate: true,
    onsubmit: async (e) => {
      e.preventDefault();
      const d = input.value;
      const now = toDay(new Date());
      const bad = !parseDay(d) ? 'Bir tarih seç.'
        : daysBetween(d, now) < 0 ? 'Bu tarih henüz gelmedi; bugünü ya da geçmiş bir günü seç.' : '';
      if (bad) {
        err.textContent = bad;
        err.hidden = false;
        input.setAttribute('aria-invalid', 'true');
        input.setAttribute('aria-describedby', 'biz-start-err');
        input.focus();
        sfx('wrong');
        return;
      }
      const prof = state.data.profil;
      if (!prof) {
        toast('Bağlanıyor; bir saniye sonra tekrar dene.');
        return;
      }
      save.disabled = true;
      state.lastWrite = Date.now();
      state.savingStart = true;
      try {
        await prof.setCift({ baslangic: d });
      } catch (e2) {
        save.disabled = false;
        toast(e2?.message || 'Kaydedilemedi.');
        return;
      } finally {
        state.savingStart = false;
      }
      sfx('match');
      onSaved?.(d);
    },
  },
    h('label', { class: 'hub-label', for: 'biz-start' }, 'Başlangıç tarihi'),
    h('div', { class: 'biz-start-row' }, input, save),
    preview,
    err);
  return form;
}

// ---------- Ekranlar ----------
function nameScreen(roomId) {
  const known = roomId ? knownPartner(roomId) : null;
  const preview = h('div', { class: 'hub-preview' });
  const paintPreview = (v) => {
    preview.replaceChildren(pairEl({ meName: v, partnerName: known?.name || '', link: 'wait', lg: true }));
  };
  paintPreview(me().name || '');

  const input = h('input', {
    class: 'input', id: 'hub-name', name: 'name', type: 'text', maxlength: NAME_MAX,
    autocomplete: 'nickname', autocapitalize: 'words', spellcheck: 'false', enterkeyhint: 'done',
    placeholder: 'Örn. Deniz', value: me().name || '', 'data-autofocus': true,
  });
  const err = h('p', { class: 'hub-error', id: 'hub-name-err', hidden: true }, 'Bir ad yaz; kısa olsa da olur.');
  input.addEventListener('input', () => {
    paintPreview(input.value);
    if (!err.hidden && input.value.trim()) {
      err.hidden = true;
      input.removeAttribute('aria-invalid');
    }
  });
  const form = h('form', {
    class: 'hub-form',
    novalidate: true,
    onsubmit: (e) => {
      e.preventDefault();
      const v = cleanName(input.value);
      if (!v) {
        err.hidden = false;
        input.setAttribute('aria-invalid', 'true');
        input.setAttribute('aria-describedby', 'hub-name-err');
        input.focus();
        sfx('wrong');
        return;
      }
      setName(v);
      sfx('tap');
      render({ focus: true });
    },
  },
    h('label', { class: 'sr-only', for: 'hub-name' }, 'Adın'),
    input,
    err,
    h('button', { type: 'submit', class: 'btn primary wide' }, 'Devam'));

  const el = h('section', { class: 'screen center' },
    h('div', { class: 'hub-narrow stack center' },
      preview,
      h('h1', { class: 'title', tabindex: '-1' }, 'Adın ne?'),
      h('p', { class: 'subtitle' }, roomId
        ? 'Sevgilin seni Biz İkimiz\'e çağırdı. Seni bu adla görecek.'
        : 'Sevgilin seni bu adla görecek.'),
      form));
  return { el };
}

function welcomeScreen(name) {
  const solo = GAMES.filter((g) => String(g.players).startsWith('1'));
  const create = h('button', {
    type: 'button',
    class: 'btn primary wide',
    onclick: () => {
      setRoom(newRoomId());
      state.fresh = true;
      sfx('pop');
      render({ focus: true });
    },
  }, 'Odamızı kur');

  const el = h('div', { class: 'hub-wrap' },
    h('section', { class: 'hub-hero hub-narrow stack center' },
      pairEl({ meName: name, link: 'wait', lg: true }),
      h('h1', { class: 'title', tabindex: '-1' }, `Hoş geldin, ${name}`),
      h('p', { class: 'subtitle' }, 'Biz İkimiz, ikinize özel küçük bir dünya. Odanızı kur, linki sevgiline gönder; günlerinizi sayın, anılarınızı biriktirin, birlikte oynayın.'),
      create,
      h('p', { class: 'hub-note' }, 'Sevgilin sana link gönderdiyse onu aç; oda kendiliğinden açılır.')),
    solo.length
      ? h('section', { class: 'hub-section stack', 'aria-labelledby': 'solo-h' },
          h('div', { class: 'hub-section-head' },
            h('h2', { id: 'solo-h' }, 'Şimdilik tek başına dene'),
            h('span', { class: 'chip' }, 'odasız açılır')),
          h('div', { class: 'game-grid' }, solo.map((g) => gameCard(g, openSolo).card)))
      : null);
  return { el };
}

function inviteScreen(roomId, name) {
  const el = h('section', { class: 'screen center' },
    h('div', { class: 'hub-narrow stack center' },
      pairEl({ meName: name, link: 'wait', lg: true }),
      h('h1', { class: 'title', tabindex: '-1' }, 'Odanız hazır'),
      h('p', { class: 'subtitle' }, 'Bu linki sevgiline gönder. Açınca ikiniz aynı odada olursunuz; link bir kez yeter.'),
      linkBox(roomId),
      h('div', { class: 'hub-actions stack' },
        shareButton(roomId, 'btn primary wide'),
        h('button', {
          type: 'button',
          class: 'btn ghost wide',
          onclick: () => {
            state.fresh = false;
            state.onboard = true;
            sfx('tap');
            render({ focus: true });
          },
        }, 'Odamıza gir'))));
  return { el };
}

/** İlk açılış: "Ne zamandan beri birlikteyiz?" Profil gelene dek kısa bekler; tarih varsa sormaz. */
function dateScreen(roomId, name) {
  const body = h('div', { class: 'hub-narrow stack center' },
    pairEl({ meName: name, partnerName: knownPartner(roomId)?.name || '', link: 'wait', lg: true }),
    h('p', { class: 'subtitle', role: 'status' }, 'Bir saniye…'));
  const el = h('section', { class: 'screen center' }, body);
  const dv = { roomId, body, shown: false, timedOut: false, timer: 0 };
  dv.timer = setTimeout(() => {
    dv.timedOut = true;
    paintDate();
  }, PROFIL_WAIT_MS);
  return { el, dateView: dv };
}

function finishOnboard() {
  if (!state.onboard) return;
  state.onboard = false;
  if (state.dateView) clearTimeout(state.dateView.timer);
  state.dateView = null;
  render({ focus: true });
}

function paintDate() {
  const dv = state.dateView;
  if (!dv || dv.roomId !== state.roomId) return;
  const prof = state.data.profil;
  if (prof?.cift().baslangic) {
    const byPartner = dv.shown && !state.savingStart;
    const who = partnerInfo().name || 'Sevgilin';
    finishOnboard();
    if (byPartner) toast(`${who} başlangıç tarihinizi ekledi 💞`);
    return;
  }
  if (dv.shown || (!prof && !dv.timedOut)) return;
  dv.shown = true;
  clearTimeout(dv.timer);
  const heading = h('h1', { class: 'title', tabindex: '-1' }, 'Ne zamandan beri birlikteyiz?');
  dv.body.replaceChildren(
    pairEl({ meName: cleanName(me().name), partnerName: partnerInfo().name, link: 'wait', lg: true }),
    heading,
    h('p', { class: 'subtitle' }, 'Gün sayacımız bu tarihten başlar. Sonra Ayarlar\'dan değiştirebilirsin.'),
    h('div', { class: 'card biz-start' },
      startForm({
        submitLabel: 'Kaydet',
        onSaved: () => {
          finishOnboard();
          toast('Sayacımız başladı 💞');
        },
      })),
    h('button', {
      type: 'button',
      class: 'btn ghost wide',
      onclick: () => {
        lsSet(skipKey(dv.roomId), '1');
        sfx('tap');
        finishOnboard();
      },
    }, 'Şimdilik geç'));
  heading.focus({ preventScroll: true });
}

// ---------- Biz ekranı ----------
// Sıra: sayaç kartı → şu an (partner durumu + ruh hâlim) → dokunuş → yaklaşanlar → buluşma → günün sorusu → oyunlar.
function bizScreen(roomId) {
  const view = { roomId, keys: {}, seenAt: Number(lsGet(seenKey(roomId))) || 0, cd: null, gsMounted: false, gsCleanup: null, lastPlayed: null };
  view.heading = h('h1', { class: 'sr-only', id: 'biz-h', tabindex: '-1' }, 'Biz');
  view.thread = h('div', { class: 'biz-thread' });
  view.counterBox = h('div', { class: 'biz-counter' });
  view.noteBox = h('div', { class: 'couple-note stack' });
  view.todayBox = h('div', { hidden: true });
  view.upBox = h('div');
  view.meetTitle = h('h2', { id: 'meet-h' }, 'Buluşma');
  view.meetBox = h('div');
  view.gsBox = h('div', { class: 'biz-gs' });

  view.cards = GAMES.map((g) => gameCard(g, openGame));
  view.grid = h('div', { class: 'game-grid' }, view.cards.map((c) => c.card));
  view.waitChip = h('span', { class: 'chip', hidden: true }, 'Bağlanıyor…');
  view.gamesHint = h('p', { class: 'biz-sec-hint', hidden: true });
  view.resumeBox = h('div', { hidden: true });
  const statsSec = h('section', { class: 'biz-sec', 'aria-labelledby': 'stats-h', hidden: true });

  const el = h('div', { class: 'hub-wrap biz' },
    h('section', { class: 'biz-hero', 'aria-labelledby': 'biz-h' }, view.heading, view.thread, view.counterBox),
    view.noteBox,
    view.todayBox,
    nowSection(view),
    touchSection(view),
    section('up-h', 'Yaklaşanlar', {
      action: h('a', { class: 'biz-link', href: pageUrl(PAGES.gunler), 'aria-label': 'Tüm özel günler' }, 'Tümü', icon('chevron')),
    }, view.upBox),
    h('section', { class: 'biz-sec', 'aria-labelledby': 'meet-h' }, h('div', { class: 'biz-sec-head' }, view.meetTitle), view.meetBox),
    h('section', { class: 'biz-sec', 'aria-label': 'Günün Sorusu' }, view.gsBox),
    Object.assign(section('games-h', 'Ne oynayalım?', { action: view.waitChip }, view.gamesHint, view.resumeBox, view.grid), { id: 'oyunlar' }), // Daha → #oyunlar
    statsSec);

  loadStats(roomId, statsSec, view);
  return { el, view };
}

/** Şu an: partnerin durumu ve ruh hâli + benim ruh hâlim (6 emoji) ve kısa notum. */
function nowSection(view) {
  view.nowPartner = h('div', { class: 'biz-now-partner' });
  view.nowQuote = h('p', { class: 'biz-now-quote' });
  view.moodLabel = h('span', { class: 'biz-mood-current' });
  view.moodBtns = MOODS.map((m) => h('button', {
    type: 'button',
    class: 'biz-mood-btn',
    'aria-pressed': 'false',
    'aria-label': m.ad,
    title: m.ad,
    dataset: { emoji: m.emoji },
    onclick: () => setMood(m, view),
  }, h('span', { 'aria-hidden': 'true' }, m.emoji)));
  view.moodNote = h('input', {
    class: 'input', id: 'biz-mood-note', type: 'text', maxlength: MOOD_NOTE_MAX, autocomplete: 'off',
    enterkeyhint: 'done', placeholder: 'Kısa bir not (isteğe bağlı)',
  });
  const form = h('form', {
    class: 'biz-mood-form',
    novalidate: true,
    onsubmit: (e) => {
      e.preventDefault();
      saveMoodNote(view);
    },
  },
    h('label', { class: 'sr-only', for: 'biz-mood-note' }, 'Ruh hâli notu'),
    view.moodNote,
    h('button', { type: 'submit', class: 'btn' }, 'Kaydet'));
  const card = h('div', { class: 'card biz-now stack' },
    view.nowPartner,
    view.nowQuote,
    h('div', { class: 'biz-now-me stack' },
      h('p', { class: 'biz-mood-me', id: 'mood-me' }, 'Senin ruh hâlin', view.moodLabel),
      h('div', { class: 'biz-mood-row', role: 'group', 'aria-labelledby': 'mood-me' }, view.moodBtns),
      form));
  return section('now-h', 'Bugün nasılız?', {}, card);
}

function touchSection(view) {
  view.touchInbox = h('div', { class: 'biz-inbox', role: 'status', hidden: true });
  view.touchStatus = h('p', { class: 'biz-touch-status', role: 'status' });
  view.touchBtns = TOUCHES.map((t) => h('button', {
    type: 'button',
    class: 'biz-touch',
    dataset: { tur: t.tur },
    'aria-label': `${t.label} gönder`,
    onclick: (e) => sendTouch(t, e.currentTarget, view),
  },
    h('span', { class: 'biz-touch-emoji', 'aria-hidden': 'true' }, t.emoji),
    h('span', { class: 'biz-touch-label', 'aria-hidden': 'true' }, t.label)));
  view.touchRow = h('div', { class: 'biz-touch-row', role: 'group', 'aria-labelledby': 'touch-h' }, view.touchBtns);
  return section('touch-h', 'Seni düşünüyorum', {}, view.touchInbox, view.touchRow, view.touchStatus);
}

// ---------- Eylemler ----------
function sendTouch(t, btn, view) {
  const room = state.room;
  const pi = partnerInfo();
  if (!room || !pi.id) {
    sfx('wrong');
    view.touchStatus.textContent = 'Sevgilin odaya gelince dokunuş gönderebilirsin.';
    return;
  }
  const now = Date.now();
  if (now - state.lastTouch < TOUCH_GAP_MS) return; // spam önle
  state.lastTouch = now;

  for (const b of view.touchBtns) b.classList.toggle('sent', b === btn);
  view.touchRow.dataset.cool = '1';
  const fly = h('span', {
    class: 'biz-touch-fly', 'aria-hidden': 'true',
    style: { '--dx': `${Math.round(Math.random() * 40 - 20)}px` },
  }, t.emoji);
  btn.append(fly);
  setTimeout(() => fly.remove(), 1200);
  clearTimeout(view.coolTimer);
  view.coolTimer = setTimeout(() => {
    delete view.touchRow.dataset.cool;
    btn.classList.remove('sent');
  }, TOUCH_GAP_MS);
  sfx('pop');
  import('./core/mobil.js').then((m) => m.titret?.(20)).catch(() => {});

  try { room.sendAll({ t: 'dokunus', tur: t.tur }); } catch { /* belge yine yazılır */ }
  state.lastWrite = now;
  state.data.dokunus?.put({ tur: t.tur, kime: pi.id, at: new Date(now).toISOString() })
    .catch((e) => toast(e?.message || 'Gönderilemedi.'));
  // Partner herhangi bir sayfada ve sekmesi öndeyse push yok: uygulama içi patlama zaten gidiyor.
  if (!partnerGoruyor(state.partner)) {
    const myName = cleanName(me().name) || 'Sevgilin';
    import('./core/bildirim.js')
      .then((m) => m.bildir(state.roomId, { tur: 'dokunus', baslik: 'Biz İkimiz', metin: t.cumle(myName), url: '' }))
      .catch(() => {});
  }
  const who = pi.name || 'Sevgilin';
  view.touchStatus.textContent = state.partner
    ? `${t.emoji} gönderildi`
    : `${t.emoji} gönderildi · ${who} gelince görecek`;
}

function setMood(m, view) {
  const col = state.data.ruh;
  if (!col) {
    toast('Bağlanıyor; bir saniye sonra tekrar dene.');
    return;
  }
  const not = cleanNote(view.moodNote.value);
  state.lastWrite = Date.now();
  sfx('tap');
  col.put({ emoji: m.emoji, ...(not ? { not } : {}), at: new Date().toISOString() }, myId())
    .catch((e) => toast(e?.message || 'Kaydedilemedi.'));
}

function saveMoodNote(view) {
  const col = state.data.ruh;
  const cur = col?.get(myId())?.data;
  if (!cur?.emoji) {
    sfx('wrong');
    toast('Önce bir ruh hâli seç.');
    return;
  }
  const not = cleanNote(view.moodNote.value);
  const data = { emoji: cur.emoji, at: new Date().toISOString() };
  if (not) data.not = not;
  state.lastWrite = Date.now();
  view.keys.moodNote = not;
  col.put(data, myId()).then(() => toast(not ? 'Notun kaydedildi' : 'Not kaldırıldı'))
    .catch((e) => toast(e?.message || 'Kaydedilemedi.'));
  view.moodNote.blur();
}

function celebrateToday(items) {
  if (!items?.length) return;
  sfx('win');
  celebrate({
    title: items[0].baslik,
    lines: ['Bugün sizin gününüz. İyi ki birliktesiniz 💞', ...items.slice(1).map((i) => `${i.emoji} ${i.baslik}`)],
    buttons: [{ label: 'Teşekkürler', primary: true }],
  });
}

// ---------- Günün Sorusu kartı (Günün Sorusu ajanının modülü; yoksa basit kart) ----------
function gsFallback() {
  return h('a', { class: 'card biz-gs-card', href: pageUrl(PAGES.gunsorusu) },
    h('span', { class: 'card-row-tile', 'aria-hidden': 'true' }, '❓'),
    h('span', { class: 'stack', style: { '--stack-gap': '2px' } },
      h('h2', {}, 'Günün Sorusu'),
      h('p', {}, 'Bugünün sorusu sizi bekliyor. İkiniz de cevaplayınca açılır.')),
    icon('chevron'));
}

async function mountGs(view) {
  if (!view || view.gsMounted || !state.room || state.view !== view) return;
  view.gsMounted = true;
  const room = state.room;
  const box = view.gsBox;
  box.replaceChildren(gsFallback());
  let mod;
  try {
    mod = await import('../sayfalar/gunun-sorusu/kart.js');
  } catch {
    return; // modül henüz yok: basit kart kalır
  }
  if (state.view !== view || state.room !== room || typeof mod?.mountGununSorusuKart !== 'function') return;
  try {
    box.replaceChildren();
    const res = await mod.mountGununSorusuKart(box, { room });
    const off = typeof res === 'function' ? res : typeof res?.close === 'function' ? () => res.close() : null;
    if (state.view !== view) off?.();
    else view.gsCleanup = off;
  } catch (e) {
    console.warn('[biz] Günün Sorusu kartı açılamadı', e);
    box.replaceChildren(gsFallback());
  }
}

// ---------- Boyama ----------
function paintAll() {
  const v = state.view;
  if (v && v.roomId === state.roomId) {
    paintCouple(v);
    paintCounter(v);
    paintToday(v);
    paintNow(v);
    paintTouches(v);
    paintUpcoming(v);
    paintMeet(v);
    paintResume(v);
  }
  paintDate();
}

/** Partnerin presence durumu metni. */
function presenceState(pname) {
  const p = state.partner;
  if (state.status === 'offline' || state.status === 'error') return { kind: 'off', text: 'bağlantı yok' };
  if (!state.room) return { kind: 'off', text: 'bağlanıyor…' };
  if (p) return partnerWhere(p, 'lobby');
  return pname ? { kind: 'off', text: 'çevrimdışı' } : null;
}

function paintCouple(view) {
  const p = state.partner;
  const pi = partnerInfo();
  const pname = pi.name;
  const meName = cleanName(me().name);
  const broken = state.status === 'offline' || state.status === 'error';

  // Sayaç kartının üstündeki "Ö – kalp – G" ipliği.
  const meFoto = state.data.profil?.ben?.()?.foto || null;
  const link = p ? 'on' : pname ? 'off' : 'wait';
  if (changed(view, 'pair', JSON.stringify([meName, pname, !!p, link, meFoto, pi.foto]))) {
    view.heading.textContent = pname ? `Biz: ${meName} ve ${pname}` : 'Biz';
    view.thread.replaceChildren(pairEl({
      meName, partnerName: pname, online: !!p, link, meFoto, partnerFoto: pi.foto,
    }));
  }

  // Not kutusu: yalnız durum değişince yeniden kur (link kutusundaki seçim kaybolmasın).
  const g = p ? gameById(p.page) : null;
  const key = broken ? `broken:${state.statusDetail}`
    : !state.room ? 'connecting'
    : p ? (g ? `game:${g.id}:${pname}` : 'together')
    : pname ? 'away' : 'invite';
  if (changed(view, 'note', key)) {
    const kids = coupleNote(view.roomId, p, pname, g, broken);
    view.noteBox.replaceChildren(...kids);
    view.noteBox.hidden = !kids.length;
  }

  const hint = !state.room || broken || (p && g) ? ''
    : p ? `Bir oyun seç; ${pname} de seninle gelir.`
    : pname ? `Bir oyun açarsan ${pname} gelince seni orada görür.` : '';
  view.gamesHint.textContent = hint;
  view.gamesHint.hidden = !hint;

  // Partnerin yeri belli olana dek kartlar kapalı: hızlı dokunuş ikinci ev sahibi yaratmasın.
  const wait = state.waiting;
  view.waitChip.hidden = !wait;
  view.grid.setAttribute('aria-busy', String(wait));
  if (view.resumeBtn) view.resumeBtn.disabled = wait;
  for (const { card, badge } of view.cards) {
    card.disabled = wait;
    card.style.opacity = wait ? '0.6' : '';
    const here = !!p && p.page === card.dataset.game;
    card.dataset.partner = String(here);
    badge.hidden = !here;
    badge.textContent = here ? `${pname || 'Sevgilin'} burada` : '';
  }
}

function coupleNote(roomId, p, pname, g, broken) {
  const line = (text) => h('p', {}, text);
  if (broken) return [line(state.statusDetail || 'Bağlantı koptu; yeniden bağlanmaya çalışıyoruz.')];
  if (!state.room) return [];
  if (p && g) {
    return [
      line(`${pname} şu an ${locative(g.title)}.`),
      h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn primary', onclick: () => joinPartner(p) }, 'Yanına git')),
    ];
  }
  if (p || pname) return [];
  return [h('div', { class: 'card invite-card stack' },
    h('h2', {}, 'Sevgilin henüz gelmedi'),
    h('p', { class: 'muted' }, 'Bu linki gönder. Açınca burada belirir; link bir kez yeter.'),
    linkBox(roomId),
    h('div', { class: 'row' }, shareButton(roomId)))];
}

function paintCounter(view) {
  const prof = state.data.profil;
  const b = prof?.cift().baslangic || '';
  const today = toDay(new Date());
  if (!changed(view, 'counter', prof ? `${b}|${today}` : 'loading')) return;
  if (!prof) {
    view.counterBox.replaceChildren(h('p', { class: 'biz-count-since' }, 'Bir saniye…'));
    return;
  }
  if (!parseDay(b)) {
    view.counterBox.replaceChildren(h('div', { class: 'biz-start stack' },
      h('h2', {}, 'Başlangıç tarihinizi ekleyin'),
      h('p', { class: 'biz-count-since' }, 'Kaç gündür birlikte olduğunuzu burada sayalım.'),
      startForm({ onSaved: () => toast('Sayacımız başladı 💞') })));
    return;
  }
  const n = daysTogether(b, today);
  if (n < 1) {
    view.counterBox.replaceChildren(h('p', { class: 'biz-count-sub' }, `Sayacımız ${dayLabel(b, today)} başlıyor 💞`));
    return;
  }
  view.counterBox.replaceChildren(
    h('p', { class: 'biz-count' },
      h('span', { class: 'biz-count-n' }, `${n.toLocaleString('tr-TR')}.`),
      h('span', { class: 'biz-count-w' }, 'günümüz')),
    h('p', { class: 'biz-count-sub' }, durationText(durationParts(b, today)) || 'Bugün ilk günümüz 💞'),
    h('p', { class: 'biz-count-since' }, sinceText(b)));
}

function dataInputs(today) {
  const prof = state.data.profil;
  return {
    gunDocs: state.data.gun?.all() || [],
    kisiDocs: prof?.kisiler?.all?.() || [],
    myId: myId(),
    baslangic: prof?.cift().baslangic || null,
    today,
  };
}

function paintToday(view) {
  const prof = state.data.profil;
  const gun = state.data.gun;
  if (!prof && !gun) return;
  const today = toDay(new Date());
  const items = bugunkuler(dataInputs(today));
  if (changed(view, 'today', JSON.stringify(items) + today)) {
    view.todayBox.hidden = !items.length;
    view.todayBox.replaceChildren(...(items.length ? [h('div', { class: 'biz-today', role: 'status' },
      h('span', { class: 'biz-today-emoji', 'aria-hidden': 'true' }, items[0].emoji),
      h('div', {},
        h('p', { class: 'biz-today-title' }, `Bugün: ${items[0].baslik}`),
        items.length > 1 ? h('p', { class: 'biz-today-more' }, items.slice(1).map((i) => i.baslik).join(' · ')) : null),
      h('button', { type: 'button', class: 'btn small', onclick: () => celebrateToday(items) }, 'Kutla'))] : []));
  }
  // Günde bir kez kendiliğinden kutla (veriler gelince).
  if (items.length && prof && gun && lsGet(partyKey(view.roomId)) !== today) {
    lsSet(partyKey(view.roomId), today);
    setTimeout(() => { if (state.view === view) celebrateToday(items); }, 700);
  }
}

function paintUpcoming(view) {
  const prof = state.data.profil;
  const gun = state.data.gun;
  if (!prof && !gun) return;
  const today = toDay(new Date());
  const items = yaklasanlar({ ...dataInputs(today), limit: 3 });
  if (!changed(view, 'up', JSON.stringify(items) + today)) return;
  const href = pageUrl(PAGES.gunler);
  if (!items.length) {
    view.upBox.replaceChildren(h('div', { class: 'card biz-empty' },
      h('p', {}, 'Henüz özel gün yok. Yıl dönümünüzü ekleyelim mi?'),
      h('a', { class: 'btn small', href }, 'Özel gün ekle')));
    return;
  }
  view.upBox.replaceChildren(h('div', { class: 'card card-list' }, items.map((i) => {
    const chipCls = i.daysLeft <= 1 ? 'chip strong' : i.daysLeft <= 7 ? 'chip accent' : 'chip';
    return h('a', { class: 'card-row', href },
      h('span', { class: 'card-row-tile', 'aria-hidden': 'true' }, i.emoji),
      h('span', {},
        h('span', { class: 'card-row-title' }, i.baslik),
        h('span', { class: 'card-row-sub' }, dayLabel(i.date, today))),
      h('span', { class: chipCls }, leftText(i.daysLeft)));
  })));
}

const pad2 = (n) => String(n).padStart(2, '0');

function paintMeet(view) {
  const prof = state.data.profil;
  if (!prof) return;
  const { bulusma = '', bulusmaNotu = '' } = prof.cift();
  const cd = bulusma ? countdown(bulusma, Date.now()) : null;
  const mode = !cd ? 'none' : !cd.past ? 'future' : cd.total > -12 * 3600e3 ? 'now' : 'none';
  if (!changed(view, 'meet', `${mode}|${bulusma}|${bulusmaNotu}`)) return;
  view.cd = null;
  const href = pageUrl(PAGES.gunler);
  const note = bulusmaNotu ? h('p', { class: 'biz-meet-note' }, bulusmaNotu) : null;
  if (mode === 'future') {
    view.meetTitle.textContent = 'Buluşmamıza';
    const cell = (label) => {
      const n = h('span', { class: 'stat-big' }, '0');
      return { n, el: h('div', { class: 'biz-cd-cell' }, n, h('span', { class: 'biz-cd-l' }, label)) };
    };
    const cells = { days: cell('gün'), hours: cell('saat'), minutes: cell('dakika'), seconds: cell('saniye') };
    view.cd = { iso: bulusma, cells };
    view.meetBox.replaceChildren(h('div', { class: 'biz-meet' },
      h('div', { class: 'biz-cd', role: 'timer' }, Object.values(cells).map((c) => c.el)),
      h('div', { class: 'biz-meet-head' },
        h('p', { class: 'biz-meet-when' }, momentLabel(bulusma)),
        note)));
    tickMeet(view);
    return;
  }
  if (mode === 'now') {
    view.meetTitle.textContent = 'Buluşma';
    view.meetBox.replaceChildren(h('div', { class: 'biz-meet' },
      h('div', { class: 'biz-meet-head' },
        h('p', { class: 'biz-today-title' }, 'Kavuşma zamanı! 💞'),
        h('p', { class: 'biz-meet-when' }, momentLabel(bulusma)),
        note),
      h('div', { class: 'biz-meet-actions' }, h('a', { class: 'btn ghost small', href }, 'Sonrakini ekle'))));
    return;
  }
  view.meetTitle.textContent = 'Buluşma';
  view.meetBox.replaceChildren(h('div', { class: 'biz-meet' },
    h('div', { class: 'biz-meet-head' },
      h('p', { class: 'biz-meet-when' }, 'Bir sonraki buluşmanız ne zaman?'),
      h('p', { class: 'biz-meet-note' }, 'Tarihi ekleyin; geri sayım burada başlasın.')),
    h('div', { class: 'biz-meet-actions' }, h('a', { class: 'btn primary small', href }, 'Buluşma tarihi ekle'))));
}

function tickMeet(view) {
  if (!view?.cd) return;
  const cd = countdown(view.cd.iso, Date.now());
  if (!cd || cd.past) {
    view.keys.meet = null;
    paintMeet(view);
    return;
  }
  const { cells } = view.cd;
  const set = (c, v) => { if (c.n.textContent !== v) c.n.textContent = v; };
  set(cells.days, String(cd.days));
  set(cells.hours, pad2(cd.hours));
  set(cells.minutes, pad2(cd.minutes));
  set(cells.seconds, pad2(cd.seconds));
}

function paintTouches(view) {
  const pi = partnerInfo();
  const off = !state.room || !pi.id;
  for (const b of view.touchBtns) b.setAttribute('aria-disabled', String(off));
  const hint = 'Sevgilin odaya gelince dokunuş gönderebilirsin.';
  if (off && state.room && !view.touchStatus.textContent) view.touchStatus.textContent = hint;
  if (!off && view.touchStatus.textContent === hint) view.touchStatus.textContent = '';

  const col = state.data.dokunus;
  const items = col ? touchSummary(col.all(), myId(), view.seenAt) : [];
  const text = touchSummaryText(pi.name || 'Sevgilin', items);
  if (!changed(view, 'inbox', text)) return;
  view.touchInbox.hidden = !text;
  view.touchInbox.replaceChildren(
    h('span', { class: 'biz-inbox-mark', 'aria-hidden': 'true', html: ICONS.heart }),
    h('span', {}, text));
}

function paintNow(view) {
  const col = state.data.ruh;
  const mine = col?.get(myId())?.data || null;
  for (const b of view.moodBtns) b.setAttribute('aria-pressed', String(!!mine && mine.emoji === b.dataset.emoji));
  const myMood = mine?.emoji ? moodByEmoji(mine.emoji) : null;
  view.moodLabel.textContent = mine?.emoji ? `: ${myMood ? myMood.ad : mine.emoji}` : '';
  const myNote = mine?.not || '';
  if (document.activeElement !== view.moodNote && view.keys.moodNote !== myNote) {
    view.moodNote.value = myNote;
    view.keys.moodNote = myNote;
  }

  const p = state.partner;
  const pi = partnerInfo();
  const name = pi.name || 'Sevgilin';
  const st = presenceState(pi.name);
  const pd = docOf(col, pi.id)?.data || null;
  const mood = pd?.emoji ? pd : null;
  const m = mood ? moodByEmoji(mood.emoji) : null;
  const ago = mood ? agoText(mood.at) : '';

  // Mesafe (iki konum belgesi varsa; Ayarlar'dan açılır).
  const kol = state.data.konum;
  const here = kol?.get(myId())?.data;
  const there = docOf(kol, pi.id)?.data;
  const dist = validCoord(here) && validCoord(there) ? distanceText(haversineKm(here, there)) : '';
  const cities = here?.sehir && there?.sehir ? `${here.sehir} – ${there.sehir}` : '';

  const key = JSON.stringify([name, !!pi.id, !!p, pi.foto, st?.kind, st?.text, mood?.emoji, mood?.not, ago, dist, cities]);
  if (!changed(view, 'now', key)) return;
  const cls = p ? 'partner' : pi.id ? 'partner away' : 'empty';
  // replaceChildren null'u "null" metni yapar: boşları ayıkla.
  view.nowPartner.replaceChildren(...[
    avatarEl(pi.id ? name : '', cls, pi.foto, null),
    h('div', { class: 'biz-now-who' },
      h('p', { class: 'biz-now-name' }, name),
      h('p', { class: 'biz-now-state' },
        st ? h('span', { class: 'person-state', dataset: { state: st.kind } },
          h('span', { class: 'dot', 'aria-hidden': 'true' }), h('span', {}, st.text)) : null,
        dist ? h('span', { class: 'biz-now-dist', title: cities || null }, icon('pin'), h('span', {}, dist)) : null)),
    mood ? h('span', { class: 'biz-now-mood', role: 'img', 'aria-label': `${name}: ${m ? m.ad : mood.emoji}` }, mood.emoji) : null,
  ].filter(Boolean));
  if (mood) {
    view.nowQuote.replaceChildren(...[
      h('span', { class: 'biz-now-feel' }, m ? `${name} bugün ${m.ad.toLocaleLowerCase('tr')}` : `${name} ${mood.emoji}`),
      mood.not ? h('span', { class: 'biz-now-note' }, `“${mood.not}”`) : null,
      ago ? h('span', { class: 'biz-now-ago' }, ago) : null,
    ].filter(Boolean));
  } else {
    view.nowQuote.replaceChildren(h('span', { class: 'biz-now-ago' }, pi.id
      ? `${name} henüz ruh hâlini paylaşmadı.`
      : 'Sevgilin gelince ruh hâlini burada görürsün.'));
  }
}

/** "Kaldığınız yerden" kartı: kayıtlı oyun (oyunkayit) ya da son oynanan oyun. */
function paintResume(view) {
  const saved = (state.data.oyunkayit?.all() || [])
    .filter((d) => gameById(d.id))
    .sort((a, b) => (Date.parse(b.updated_at) || 0) - (Date.parse(a.updated_at) || 0))[0];
  let item = null;
  if (saved) {
    item = { g: gameById(saved.id), sub: `Kaldığınız yerden devam · ${formatDay(saved.updated_at)}`, cta: 'Devam et' };
  } else if (view.lastPlayed && gameById(view.lastPlayed.game)) {
    const when = formatDay(view.lastPlayed.last_at);
    item = { g: gameById(view.lastPlayed.game), sub: when ? `Son oyununuz · ${when}` : 'Son oyununuz', cta: 'Yine oyna' };
  }
  if (!changed(view, 'resume', item ? `${item.g.id}|${item.sub}` : '')) return;
  view.resumeBox.hidden = !item;
  view.resumeBtn = null;
  if (!item) {
    view.resumeBox.replaceChildren();
    return;
  }
  view.resumeBtn = h('button', {
    type: 'button', class: 'card biz-resume', disabled: state.waiting, onclick: () => openGame(item.g),
  },
    h('span', { class: 'game-tile', dataset: { tint: tintOf(item.g) }, 'aria-hidden': 'true' }, item.g.emoji),
    h('span', { class: 'biz-resume-body' },
      h('span', { class: 'biz-resume-title' }, item.g.title),
      h('span', { class: 'biz-resume-sub' }, item.sub)),
    h('span', { class: 'biz-resume-go', 'aria-hidden': 'true' }, item.cta));
  view.resumeBox.replaceChildren(view.resumeBtn);
}

async function loadStats(roomId, section, view = null) {
  let rows;
  try {
    rows = await roomStats(roomId);
  } catch {
    rows = [];
  }
  if (!section.isConnected || currentRoom() !== roomId) return;
  rows = (Array.isArray(rows) ? rows : [])
    .filter((r) => r && gameById(r.game) && Number(r.played) > 0)
    .sort((a, b) => (Date.parse(b.last_at) || 0) - (Date.parse(a.last_at) || 0));
  if (view) {
    view.lastPlayed = rows[0] || null;
    if (state.view === view) paintResume(view);
  }
  if (!rows.length) {
    section.hidden = true;
    return;
  }
  const total = rows.reduce((sum, r) => sum + Number(r.played), 0);
  section.replaceChildren(
    h('div', { class: 'biz-sec-head' },
      h('h2', { id: 'stats-h' }, 'Birlikte oynadıklarımız'),
      h('span', { class: 'chip' }, `${total} oyun`)),
    h('div', { class: 'card stats' },
      h('ul', { class: 'stats-list' }, rows.map((r) => {
        const g = gameById(r.game);
        const when = formatDay(r.last_at);
        return h('li', {},
          h('span', { class: 'game-tile', dataset: { tint: tintOf(g) }, 'aria-hidden': 'true' }, g.emoji),
          h('span', {},
            h('span', { class: 'stats-name' }, g.title),
            when ? h('span', { class: 'stats-when' }, `Son: ${when}`) : null),
          h('span', { class: 'stats-count' }, String(Number(r.played)), h('small', {}, 'kez')));
      }))));
  section.hidden = false;
}

// ---------- Üst şerit ----------
function buildHeader() {
  const local = isLocalMode();
  document.body.classList.toggle('is-local', local);
  state.settingsLink = h('a', {
    class: 'icon-btn', href: pageUrl(PAGES.ayarlar), 'aria-label': 'Ayarlar', title: 'Ayarlar',
  }, icon('settings'));
  shell.replaceChildren(h('div', { class: 'shell-bar' },
    h('span', { class: 'hub-brand' }, icon('mark'), h('span', { class: 'hub-brand-text' }, 'Biz İkimiz')),
    local ? h('span', { class: 'chip shell-local', title: 'Aynı tarayıcının sekmeleri birbiriyle konuşur' }, 'Yerel test modu') : null,
    muteButton(),
    state.settingsLink));
  trackShellHeight(shell);
}

// ---------- Çizim ----------
function cleanupView() {
  const v = state.view;
  if (!v) return;
  try { v.gsCleanup?.(); } catch { /* yok say */ }
  clearTimeout(v.coolTimer);
}

function render({ focus = false } = {}) {
  cleanupView();
  if (state.dateView) clearTimeout(state.dateView.timer);
  const name = cleanName(me().name);
  const roomId = currentRoom();
  if (roomId && state.onboard && lsGet(skipKey(roomId)) === '1') state.onboard = false;

  let screen;
  let tabs = false;
  if (!name) {
    screen = nameScreen(roomId);
  } else if (!roomId) {
    leaveRoom();
    screen = welcomeScreen(name);
  } else {
    ensureRoom(roomId);
    if (state.fresh) screen = inviteScreen(roomId, name);
    else if (state.onboard) screen = dateScreen(roomId, name);
    else {
      screen = bizScreen(roomId);
      tabs = true;
    }
  }
  state.settingsLink.hidden = !tabs;
  state.view = screen.view || null;
  state.dateView = screen.dateView || null;
  app.replaceChildren(screen.el);
  if (tabs) mountTabBar('biz');
  else removeTabBar();
  mountGs(state.view);
  paintAll();

  if (focus) {
    window.scrollTo(0, 0);
    const target = screen.el.querySelector('[data-autofocus]') || screen.el.querySelector('h1');
    target?.focus({ preventScroll: true });
  }
}

function tick() {
  if (document.visibilityState !== 'visible') return;
  const v = state.view;
  if (v?.cd) tickMeet(v);
  const today = toDay(new Date());
  const minute = Math.floor(Date.now() / 60000);
  if (today !== state.today || minute !== state.minute) {
    state.today = today;
    state.minute = minute;
    paintAll(); // gün dönümü, "5 dk önce" gibi metinler
  }
}

function main() {
  shell = document.getElementById('shell');
  app = document.getElementById('app');
  startAppServices();
  buildHeader();

  window.addEventListener('hashchange', () => {
    if (takeHashRoom()) {
      render({ focus: true });
      if (cleanName(me().name)) toast('Odanıza hoş geldin');
    }
  });

  // Geri tuşuyla önbellekten dönülürse bağlantıyı tazele.
  window.addEventListener('pageshow', (e) => {
    if (!e.persisted) return;
    state.leaving = false;
    leaveRoom();
    render();
  });

  // Dokunuş özeti "son ziyaretten beri" sayar: sayfadan ayrılınca görüldü say.
  const saveSeen = () => { if (state.view && state.roomId) lsSet(seenKey(state.roomId), String(Date.now())); };
  window.addEventListener('pagehide', saveSeen);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveSeen();
    else paintAll();
  });
  setInterval(tick, 1000);

  const arrived = takeHashRoom();
  render();
  if (arrived && cleanName(me().name)) toast('Odanıza hoş geldin');
}

if (typeof document !== 'undefined' && document.getElementById('app')) main();
