// Ortak arayüz: üst şerit, bildirim, kutlama, partner bekleme, onay, davet paylaşımı.
// Sözleşme §9. Ek dışa aktarımlar (h, icon, pairEl, muteButton, copyInvite, …) ana sayfa içindir;
// oyunlar da kullanabilir ama sözleşmenin parçası değildir.
import { me, currentRoom, inviteUrl, lobbyUrl, gameUrl, readGameParams } from './identity.js';
import { gameById } from './games.js';
import { sfx, isMuted, setMuted } from './sound.js';

// ---------- Küçük yardımcılar ----------

/** Eleman kurucu. Metin çocuklar textContent olur (ad gibi dış veri güvenle basılır). */
export function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v; // yalnız sabit SVG için
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'style' && typeof v === 'object') {
      for (const [p, val] of Object.entries(v)) {
        if (p.startsWith('--')) el.style.setProperty(p, val);
        else el.style[p] = val;
      }
    } else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : String(kid));
  }
  return el;
}

const HEART_D =
  'M12 20.7c-.27 0-.53-.09-.75-.27C6.6 16.6 3 13.5 3 9.45 3 6.68 5.13 4.5 7.8 4.5c1.68 0 3.2.83 4.2 2.15 1-1.32 2.52-2.15 4.2-2.15 2.67 0 4.8 2.18 4.8 4.95 0 4.05-3.6 7.15-8.25 10.98-.22.18-.48.27-.75.27z';
const STROKE = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

export const ICONS = {
  heart: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${HEART_D}"/></svg>`,
  mark: `<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><rect width="32" height="32" rx="10" style="fill:var(--accent)"/><path transform="translate(5 5.2) scale(.92)" d="${HEART_D}" style="fill:var(--accent-ink)"/></svg>`,
  back: `<svg viewBox="0 0 24 24" ${STROKE} aria-hidden="true" focusable="false"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg>`,
  soundOn: `<svg viewBox="0 0 24 24" ${STROKE} aria-hidden="true" focusable="false"><path d="M4 9.5v5h3.5l4.5 4v-13l-4.5 4z"/><path d="M15.5 9.2a4 4 0 0 1 0 5.6M18.2 6.5a7.8 7.8 0 0 1 0 11"/></svg>`,
  soundOff: `<svg viewBox="0 0 24 24" ${STROKE} aria-hidden="true" focusable="false"><path d="M4 9.5v5h3.5l4.5 4v-13l-4.5 4z"/><path d="m16 9.5 5 5m0-5-5 5"/></svg>`,
  share: `<svg viewBox="0 0 24 24" ${STROKE} aria-hidden="true" focusable="false"><path d="M12 14.5V4M8 7.5 12 3.5l4 4"/><path d="M5.5 11.5v7A1.5 1.5 0 0 0 7 20h10a1.5 1.5 0 0 0 1.5-1.5v-7"/></svg>`,
  copy: `<svg viewBox="0 0 24 24" ${STROKE} aria-hidden="true" focusable="false"><rect x="8.5" y="8.5" width="11" height="11" rx="2.5"/><path d="M15.5 8.5V6.2A1.7 1.7 0 0 0 13.8 4.5H6.2A1.7 1.7 0 0 0 4.5 6.2v7.6a1.7 1.7 0 0 0 1.7 1.7h2.3"/></svg>`,
  settings: `<svg viewBox="0 0 24 24" ${STROKE} aria-hidden="true" focusable="false"><path d="M4 7h9m4 0h3M4 17h3m4 0h9"/><circle cx="15" cy="7" r="2.2"/><circle cx="9" cy="17" r="2.2"/></svg>`,
  close: `<svg viewBox="0 0 24 24" ${STROKE} aria-hidden="true" focusable="false"><path d="M6.5 6.5l11 11m0-11-11 11"/></svg>`,
};

export function icon(name) {
  const t = document.createElement('template');
  t.innerHTML = ICONS[name] || '';
  return t.content.firstElementChild;
}

/** Adın ilk harfi (Türkçe büyük harf: i → İ). */
export function initial(name) {
  const s = String(name || '').trim();
  if (!s) return '?';
  let first = [...s][0];
  try {
    if (typeof Intl.Segmenter === 'function') {
      first = new Intl.Segmenter('tr', { granularity: 'grapheme' }).segment(s)[Symbol.iterator]().next().value.segment;
    }
  } catch { /* eski tarayıcı */ }
  return first.toLocaleUpperCase('tr');
}

/** Türkçe bulunma eki: "Yapboz" → "Yapboz'da", "Hafıza Kartları" → "Hafıza Kartları'nda". */
export function locative(title) {
  const t = String(title || '').trim();
  if (!t) return '';
  if (/[?!.…]$/.test(t)) return `${t} oyununda`;
  const low = t.toLocaleLowerCase('tr');
  const vowels = low.match(/[aeıioöuü]/g);
  const lastVowel = vowels ? vowels[vowels.length - 1] : 'a';
  const front = 'eiöü'.includes(lastVowel);
  const end = low[low.length - 1];
  let c;
  if ('aeıioöuü'.includes(end)) c = /(lar|ler)[ıi]$|s[ıiuü]$/.test(low) ? 'nd' : 'd'; // iyelik → n kaynaştırma
  else c = 'fstkçşhp'.includes(end) ? 't' : 'd';
  return `${t}'${c}${front ? 'e' : 'a'}`;
}

/** Türkçe gün: "bugün", "dün", "3 gün önce", "12 Ekim", "12 Ekim 2025". */
export function formatDay(value, now = new Date()) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
  const diff = Math.round((day(now) - day(d)) / 864e5);
  if (diff === 0) return 'bugün';
  if (diff === 1) return 'dün';
  if (diff > 1 && diff < 7) return `${diff} gün önce`;
  const opts = { day: 'numeric', month: 'long' };
  if (d.getFullYear() !== now.getFullYear()) opts.year = 'numeric';
  return new Intl.DateTimeFormat('tr-TR', opts).format(d);
}

function pageNs() {
  if (typeof document === 'undefined') return null;
  const d = document.body?.dataset?.game;
  if (d) return d;
  const m = location.pathname.match(/\/games\/([^/]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

function gameParams() {
  try { return readGameParams() || {}; } catch { return {}; }
}

function activeRoomId() {
  return gameParams().roomId || currentRoom();
}

function myName() {
  try { return me().name || ''; } catch { return ''; }
}

// Son görülen partner (çevrimdışıyken adını göstermek için).
// Anahtar kendi clientId'mi de içerir: yerel modda iki sekme aynı localStorage'ı paylaşır.
function partnerKey(roomId) {
  let mine = '';
  try { mine = me().clientId; } catch { /* yok */ }
  return `bizim.partner.${roomId}.${mine}`;
}

export function knownPartner(roomId) {
  if (!roomId) return null;
  try { return JSON.parse(localStorage.getItem(partnerKey(roomId))) || null; } catch { return null; }
}

export function rememberPartner(roomId, p) {
  if (!roomId || !p?.clientId) return;
  const prev = knownPartner(roomId);
  if (prev && prev.clientId === p.clientId && prev.name === (p.name || '')) return;
  try {
    localStorage.setItem(partnerKey(roomId), JSON.stringify({ clientId: p.clientId, name: p.name || '', at: Date.now() }));
  } catch { /* gizli sekme */ }
}

/** Partner nerede? -> { kind: 'off'|'on'|'here'|'away', text, game? } */
export function partnerWhere(p, ns = pageNs()) {
  if (!p) return { kind: 'off', text: 'çevrimdışı' };
  const g = gameById(p.page);
  if (g && p.page === ns) return { kind: 'here', text: 'burada', game: g };
  if (g) return { kind: 'away', text: locative(g.title), game: g };
  return { kind: 'on', text: 'çevrimiçi' };
}

/** İki avatar ve aralarında kalp. link: 'on' | 'off' | 'wait'. */
export function pairEl({ meName = '', partnerName = '', online = false, link = 'off', lg = false, names = false, state = null } = {}) {
  const meAv = h('span', { class: 'avatar me', 'aria-hidden': 'true' }, initial(meName));
  const pCls = !partnerName ? 'empty' : online ? 'partner' : 'partner away';
  const pAv = h('span', { class: `avatar ${pCls}`, 'aria-hidden': 'true' }, partnerName ? initial(partnerName) : '?');
  const st = state
    ? h('span', { class: 'person-state', dataset: { state: state.kind } },
        h('span', { class: 'dot', 'aria-hidden': 'true' }), h('span', {}, state.text))
    : null;
  return h('div', { class: `pair${lg ? ' lg' : ''}`, dataset: { link } },
    h('div', { class: 'person' }, meAv, names ? h('span', { class: 'person-name' }, 'Sen') : null),
    h('span', { class: 'pair-heart', 'aria-hidden': 'true', html: ICONS.heart }),
    h('div', { class: 'person' }, pAv, names ? h('span', { class: 'person-name' }, partnerName || 'Sevgilin') : null, st));
}

// Kaplamalar açıkken arka planı etkisiz kıl (sayaçlı; iç içe açılabilir).
const locks = new Map();
function lock(ids, on) {
  for (const id of ids) {
    const el = id === 'html' ? document.documentElement : document.getElementById(id);
    if (!el) continue;
    const n = Math.max(0, (locks.get(id) || 0) + (on ? 1 : -1));
    locks.set(id, n);
    if (id === 'html') el.classList.toggle('ui-locked', n > 0);
    else el.inert = n > 0;
  }
}

// ---------- Ses düğmesi ----------
export function muteButton() {
  const btn = h('button', { type: 'button', class: 'icon-btn' });
  const paint = () => {
    const m = isMuted();
    btn.replaceChildren(icon(m ? 'soundOff' : 'soundOn'));
    btn.setAttribute('aria-label', m ? 'Sesi aç' : 'Sesi kapat');
    btn.title = m ? 'Ses kapalı' : 'Ses açık';
  };
  btn.addEventListener('click', () => {
    setMuted(!isMuted());
    sfx('tap');
  });
  window.addEventListener('bizim:mute', () => { if (btn.isConnected) paint(); });
  paint();
  return btn;
}

// ---------- Üst şerit ----------
let shellCleanup = null;

export function mountShell({ title = '', room = null } = {}) {
  shellCleanup?.();
  let header = document.getElementById('shell');
  if (!header) {
    header = h('header', { id: 'shell' });
    document.body.prepend(header);
  }
  const ns = room?.ns || pageNs();
  const roomId = room?.roomId || activeRoomId();
  const live = !!room && room.backend !== 'solo';

  const tools = h('div', { class: 'shell-tools' });
  if (room?.backend === 'local') {
    tools.append(h('span', { class: 'chip shell-local', title: 'Yerel test modu: aynı tarayıcının sekmeleri konuşur' }, 'Yerel'));
  }
  const chip = live ? h('span', { class: 'shell-partner', role: 'status' }) : null;
  if (chip) tools.append(chip);
  tools.append(muteButton());

  header.replaceChildren(h('div', { class: 'shell-bar' },
    h('a', { class: 'shell-back', href: lobbyUrl(), 'aria-label': 'Odamıza dön' }, icon('back'), h('span', {}, 'Odamız')),
    h('h1', { class: 'shell-title' }, title),
    tools));

  let partner = null;
  let status = 'online';
  const paint = () => {
    if (!chip) return;
    const name = partner?.name || knownPartner(roomId)?.name || 'Sevgilin';
    let w = partnerWhere(partner, ns);
    if (status === 'connecting') w = { kind: 'off', text: 'bağlanıyor…' };
    else if (status === 'offline' || status === 'error') w = { kind: 'off', text: 'bağlantı yok' };
    chip.dataset.state = w.kind;
    chip.title = `${name}: ${w.text}`;
    chip.replaceChildren(
      h('span', { class: 'dot', 'aria-hidden': 'true' }),
      h('span', { class: 'shell-partner-name' }, name),
      h('span', { class: 'shell-partner-state' }, w.text));
  };

  const onMessage = (msg, from) => {
    if (!msg || msg.t !== 'go') return;
    const g = gameById(msg.game);
    if (!g) return;
    if (g.id === ns && msg.host && msg.host === gameParams().hostId) return; // zaten bu oyundayız
    const name = from?.name || partner?.name || 'Sevgilin';
    sfx('pop');
    toast(`${name} ${g.title} oyununu açtı`, {
      ms: 9000,
      action: { label: 'Git', onClick: () => { location.href = gameUrl(g.id, { roomId, host: msg.host }); } },
    });
  };

  const subs = [];
  if (live) {
    subs.push(room.on('presence', (p) => {
      partner = p || null;
      if (p) rememberPartner(roomId, p);
      paint();
    }));
    subs.push(room.on('status', (s) => { status = s; paint(); }));
    subs.push(room.on('message', onMessage));
  }
  paint();
  const untrack = trackShellHeight(header);

  shellCleanup = () => {
    for (const off of subs) if (typeof off === 'function') off();
    untrack();
    shellCleanup = null;
  };
  return shellCleanup;
}

/** Üst şeridin gerçek yüksekliğini :root --shell-h'ye yazar ve izler. -> durdur() */
export function trackShellHeight(header = document.getElementById('shell')) {
  if (!header) return () => {};
  const setH = () => {
    document.documentElement.style.setProperty('--shell-h', `${header.getBoundingClientRect().height}px`);
  };
  setH();
  if (typeof ResizeObserver === 'function') {
    const ro = new ResizeObserver(setH);
    ro.observe(header);
    return () => ro.disconnect();
  }
  window.addEventListener('resize', setH);
  return () => window.removeEventListener('resize', setH);
}

// ---------- Bildirim ----------
const MAX_TOASTS = 3;

function toastRegion() {
  // Açık bir modal <dialog> varsa bildirimi onun içine koy; yoksa arkada kalır ve tıklanamaz.
  const dialogs = document.querySelectorAll('dialog[open]');
  const host = dialogs.length ? dialogs[dialogs.length - 1] : document.body;
  let region = host.querySelector(':scope > .toasts');
  let created = false;
  if (!region) {
    region = h('div', { class: 'toasts', 'aria-live': 'polite', 'aria-relevant': 'additions' });
    host.append(region);
    created = true;
  }
  return { region, created };
}

export function toast(text, { action, ms } = {}) {
  const dur = ms ?? (action ? 6000 : 2800);
  const node = h('div', { class: 'toast', style: { '--ms': `${dur}ms` } }, h('span', { class: 'toast-text' }, text));
  let timer = 0;
  const close = () => {
    if (node.classList.contains('leaving')) return;
    clearTimeout(timer);
    node.classList.add('leaving');
    setTimeout(() => node.remove(), 220);
  };
  if (action) {
    node.append(
      h('button', {
        type: 'button',
        class: 'toast-action',
        onclick: () => { close(); action.onClick?.(); },
      }, action.label || 'Tamam'),
      h('span', { class: 'toast-timer', 'aria-hidden': 'true' }));
  }
  const { region, created } = toastRegion();
  const add = () => {
    region.append(node);
    while (region.children.length > MAX_TOASTS) region.firstElementChild.remove();
  };
  // Yeni kurulan canlı bölgeye içerik bir kare sonra eklenir ki ekran okuyucu duyursun.
  if (created) requestAnimationFrame(add);
  else add();
  if (dur > 0 && Number.isFinite(dur)) timer = setTimeout(close, dur);
  return close;
}

// ---------- Onay ----------
let dialogSeq = 0;

export function confirmDialog(text, { ok = 'Evet', cancel = 'Vazgeç' } = {}) {
  return new Promise((resolve) => {
    if (typeof HTMLDialogElement !== 'function') {
      resolve(window.confirm(text));
      return;
    }
    const id = `ui-dlg-${++dialogSeq}`;
    let result = false;
    const dlg = h('dialog', { class: 'ui-dialog', 'aria-labelledby': id });
    const no = h('button', { type: 'button', class: 'btn ghost', onclick: () => dlg.close() }, cancel);
    const yes = h('button', { type: 'button', class: 'btn primary', onclick: () => { result = true; dlg.close(); } }, ok);
    dlg.append(h('div', { class: 'dialog-card stack' },
      h('p', { class: 'dialog-text', id }, text),
      h('div', { class: 'dialog-actions' }, no, yes)));
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); }); // dışına dokununca vazgeç
    dlg.addEventListener('close', () => {
      dlg.remove();
      resolve(result);
    });
    document.body.append(dlg);
    dlg.showModal();
  });
}

// ---------- Kutlama ----------
const HEART_COLORS = ['var(--accent)', 'var(--plum)', 'var(--accent-strong)', 'var(--tint-1)'];

export function celebrate({ title, lines = [], buttons = [] } = {}) {
  const prevFocus = document.activeElement;
  const id = `ui-cel-${++dialogSeq}`;
  const rnd = (a, b) => a + Math.random() * (b - a);

  const hearts = h('div', { class: 'celebrate-hearts', 'aria-hidden': 'true' });
  for (let i = 0; i < 22; i++) {
    hearts.append(h('span', {
      class: 'heart',
      html: ICONS.heart,
      style: {
        '--x': `${rnd(2, 94).toFixed(1)}%`,
        '--y': `${rnd(4, 88).toFixed(1)}%`,
        '--s': `${Math.round(rnd(14, 40))}px`,
        '--d': `${rnd(4.2, 7).toFixed(2)}s`,
        '--delay': `${rnd(0, 2.6).toFixed(2)}s`,
        '--drift': `${Math.round(rnd(-70, 70))}px`,
        '--r': `${Math.round(rnd(-25, 25))}deg`,
        '--c': HEART_COLORS[i % HEART_COLORS.length],
      },
    }));
  }

  let closed = false;
  const root = h('div', { class: 'celebrate' });
  const close = () => {
    if (closed) return;
    closed = true;
    lock(['shell', 'app', 'html'], false);
    root.classList.add('leaving');
    setTimeout(() => root.remove(), 260);
    if (prevFocus && prevFocus.isConnected && typeof prevFocus.focus === 'function') prevFocus.focus({ preventScroll: true });
  };

  const list = buttons.length ? buttons : [{ label: 'Kapat', primary: true }];
  const actions = h('div', { class: 'celebrate-actions' },
    list.map((b) => h('button', {
      type: 'button',
      class: `btn${b.primary ? ' primary' : ''}`,
      onclick: () => { close(); b.onClick?.(); }, // düğme kaplamayı kapatır, sonra işini yapar
    }, b.label)));

  const card = h('div', { class: 'celebrate-card card stack', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': id },
    h('div', { class: 'celebrate-mark', 'aria-hidden': 'true', html: ICONS.heart }),
    h('h2', { class: 'celebrate-title', id }, title || 'Harika!'),
    lines.map((line) => h('p', { class: 'celebrate-line' }, line)),
    actions);

  root.append(hearts, card);
  document.body.append(root);
  lock(['shell', 'app', 'html'], true);
  const first = actions.querySelector('.primary') || actions.firstElementChild;
  first?.focus({ preventScroll: true });
  return close;
}

// ---------- Davet ----------
async function copyText(s) {
  try {
    await navigator.clipboard.writeText(s);
    return true;
  } catch { /* izin yok ya da güvensiz bağlam */ }
  try {
    const ta = h('textarea', { readonly: true, style: { position: 'fixed', top: '0', left: '0', opacity: '0' } });
    ta.value = s;
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

/** Davet linkini panoya kopyalar, bildirim gösterir. -> 'copied' | 'failed' | 'none' */
export async function copyInvite(roomId) {
  const id = roomId || activeRoomId();
  if (!id) {
    toast('Önce odanızı kurun.');
    return 'none';
  }
  const ok = await copyText(inviteUrl(id));
  if (ok) sfx('pop');
  toast(ok ? 'Link kopyalandı' : 'Kopyalanamadı. Linki seçip elle kopyala.');
  return ok ? 'copied' : 'failed';
}

/** -> 'shared' | 'cancelled' | 'copied' | 'failed' | 'none' */
export async function shareInvite(roomId) {
  const id = roomId || activeRoomId();
  if (!id) {
    toast('Önce odanızı kurun.');
    return 'none';
  }
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: 'Bizim Oyunlar', text: 'Odamıza gel, birlikte oynayalım.', url: inviteUrl(id) });
      return 'shared';
    } catch (e) {
      if (e?.name === 'AbortError') return 'cancelled';
      // paylaşım yapılamadı: kopyalamaya düş
    }
  }
  return copyInvite(id);
}

// ---------- Partner bekleme ----------
function overlay(content, { lockIds = ['app', 'html'] } = {}) {
  const root = h('div', { class: 'waiting', role: 'dialog', 'aria-modal': 'false' }, content);
  document.body.append(root);
  lock(lockIds, true);
  let closed = false;
  return {
    root,
    close() {
      if (closed) return;
      closed = true;
      lock(lockIds, false);
      root.classList.add('leaving');
      setTimeout(() => root.remove(), 220);
    },
  };
}

function needsRoomOverlay() {
  const id = `ui-wait-${++dialogSeq}`;
  const card = h('div', { class: 'waiting-card stack' },
    pairEl({ meName: myName(), link: 'wait', lg: true }),
    h('h2', { class: 'title', id }, 'Bu oyun iki kişilik'),
    h('p', { class: 'subtitle' }, currentRoom()
      ? 'Oyunu odanızdan aç; sevgilin de seninle gelsin.'
      : 'Önce odanızı kur ve linki sevgiline gönder. O gelince birlikte oynarsınız.'),
    h('div', { class: 'waiting-actions' },
      h('a', { class: 'btn primary', href: lobbyUrl() }, currentRoom() ? 'Odamıza git' : 'Odamızı kur')));
  const o = overlay(card);
  o.root.setAttribute('aria-labelledby', id);
  return o;
}

export function waitForPartner(room, { text, allowSolo = false, ns } = {}) {
  // Sayfa ns'si: verilen > room.ns (çekirdek sağlıyor) > body[data-game] > /games/<id>/ yolu.
  const page = ns || room?.ns || pageNs();
  return new Promise((resolve) => {
    if (!room || room.backend === 'solo') {
      if (allowSolo) resolve('solo');
      else needsRoomOverlay(); // bekler; çözülmez
      return;
    }

    const roomId = room.roomId || activeRoomId();
    const titleId = `ui-wait-${++dialogSeq}`;
    let done = false;
    let unsub = null;
    let view = null;
    let showTimer = 0;
    let last = null;

    const finish = (how) => {
      if (done) return;
      done = true;
      clearTimeout(showTimer);
      if (typeof unsub === 'function') unsub();
      view?.close();
      resolve(how);
    };

    const build = () => {
      const pairBox = h('div');
      const status = h('p', { class: 'subtitle', role: 'status' });
      const actions = h('div', { class: 'waiting-actions' });
      const card = h('div', { class: 'waiting-card stack' },
        pairBox,
        h('h2', { class: 'title', id: titleId }, text || 'Sevgilini bekliyoruz'),
        status,
        actions);
      const o = overlay(card);
      o.root.setAttribute('aria-labelledby', titleId);

      let called = false;
      const update = (p) => {
        const name = p?.name || knownPartner(roomId)?.name || '';
        pairBox.replaceChildren(pairEl({ meName: myName(), partnerName: name, online: !!p, link: 'wait', lg: true }));
        const g = p ? gameById(p.page) : null;
        if (p) {
          const where = g ? `şu an ${locative(g.title)}` : p.page === 'lobby' ? 'odanızda, lobide' : 'çevrimiçi';
          status.textContent = `${name || 'Sevgilin'} ${where}. Çağırırsan bu oyuna gelir.`;
        } else if (name) {
          status.textContent = `${name} şu an çevrimdışı. Gelince oyun başlar; istersen linki yeniden gönder.`;
        } else {
          status.textContent = 'Sevgilin henüz odaya gelmedi. Davet linkini gönder; açınca oyun başlar.';
        }

        const btns = [];
        if (p && gameById(page)) {
          btns.push(h('button', {
            type: 'button',
            class: 'btn primary',
            disabled: called,
            onclick: (e) => {
              const host = gameParams().hostId || me().clientId;
              const sent = room.sendAll({ t: 'go', game: page, host });
              sfx('pop');
              if (sent === false) {
                toast('Bağlantı yok; biraz sonra yeniden dene.');
                return;
              }
              called = true;
              e.currentTarget.disabled = true;
              toast('Haber gönderildi');
              setTimeout(() => { called = false; if (!done) update(last); }, 5000);
            },
          }, 'Buraya çağır'));
        } else {
          btns.push(h('button', { type: 'button', class: 'btn primary', onclick: () => shareInvite(roomId) }, icon('share'), 'Linki paylaş'));
          btns.push(h('button', { type: 'button', class: 'btn ghost', onclick: () => copyInvite(roomId) }, icon('copy'), 'Linki kopyala'));
        }
        if (allowSolo) {
          btns.push(h('button', { type: 'button', class: 'btn ghost', onclick: () => finish('solo') }, 'Tek başıma oyna'));
        }
        actions.replaceChildren(...btns);
      };
      return { close: o.close, update };
    };

    const onPresence = (p) => {
      last = p || null;
      if (p && p.page === page) {
        finish('partner');
        return;
      }
      if (done) return;
      if (view) {
        view.update(last);
      } else if (!showTimer) {
        // Bağlantı kurulurken kısa bir an partner görünmeyebilir: kaplamayı hemen açma.
        showTimer = setTimeout(() => {
          if (done) return;
          view = build();
          view.update(last);
        }, 500);
      }
    };

    unsub = room.on('presence', onPresence);
    if (done && typeof unsub === 'function') unsub(); // abone olurken hemen çözüldüyse
  });
}
