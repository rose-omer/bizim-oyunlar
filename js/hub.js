// Ana sayfa ("Odamız"): ad sorma, oda kurma, davet, lobi. Sözleşme §11.
import { GAMES, gameById } from './core/games.js';
import { me, setName, currentRoom, setRoom, clearRoom, newRoomId, inviteUrl, gameUrl, isLocalMode } from './core/identity.js';
import { joinRoom } from './core/room.js';
import { roomStats } from './core/db.js';
import {
  h, icon, toast, confirmDialog, shareInvite, copyInvite, muteButton, pairEl,
  knownPartner, rememberPartner, partnerWhere, locative, trackShellHeight, formatDay,
} from './core/ui.js';
import { sfx } from './core/sound.js';

const NAME_MAX = 24;
const GO_DELAY_MS = 1500; // partner oyun açınca otomatik geçiş süresi
const SEND_GRACE_MS = 160; // 'go' mesajı yola çıksın diye sayfadan çıkmadan önce bekleme
const PRESENCE_WAIT_MS = 2500; // partnerin yeri belli olana dek kartlar kapalı (en fazla bu kadar)

const shell = document.getElementById('shell');
const app = document.getElementById('app');

const state = {
  room: null, // lobi Room nesnesi
  roomId: null, // bağlanılan oda
  joining: null, // bekleyen joinRoom sözü
  subs: [],
  partner: null,
  status: 'connecting',
  statusDetail: '',
  fresh: false, // oda yeni kuruldu: davet ekranı
  goTimer: 0,
  goToastClose: null,
  leaving: false, // sayfadan çıkılıyor: ikinci tıklamayı yok say
  waiting: false, // partnerin hangi oyunda olduğu henüz bilinmiyor: kart açma ikinci ev sahibi yaratabilir
  waitTimer: 0,
  view: null, // lobi ekranının boyanacak parçaları
  settingsBtn: null,
};

// ---------- Saf yardımcılar ----------
function cleanName(v) {
  return String(v || '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
}

function tintOf(g) {
  return String((GAMES.indexOf(g) % 6) + 1);
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
  return true;
}

// ---------- Oda bağlantısı ----------
function leaveRoom() {
  clearGo();
  endWait();
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
    paintCouple();
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
    paintCouple();
  }, PRESENCE_WAIT_MS);
  state.subs = [
    room.on('status', onStatus),
    room.on('message', onMessage),
    room.on('presence', onPresence),
  ];
  paintCouple();
}

function onStatus(status, detail) {
  state.status = status;
  state.statusDetail = detail || '';
  paintCouple();
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
        render({ focus: true });
        return;
      }
    }
  }
  paintCouple();
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
        toast('Lobide kaldın');
      },
    },
  });
  state.goTimer = setTimeout(() => {
    state.goTimer = 0;
    state.leaving = true;
    location.href = url;
  }, GO_DELAY_MS);
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
        ? 'Sevgilin seni odasına çağırdı. Seni bu adla görecek.'
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
      h('p', { class: 'subtitle' }, 'İkinize özel bir oyun odası. Odanı kur, linki sevgiline gönder; uzakta olsanız da birlikte oynayın.'),
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
            sfx('tap');
            render({ focus: true });
          },
        }, 'Odamıza gir'))));
  return { el };
}

function lobbyScreen(roomId) {
  const cards = GAMES.map((g) => gameCard(g, openGame));
  const heading = h('h1', { class: 'sr-only', tabindex: '-1' }, 'Odamız');
  const pairBox = h('div');
  const noteBox = h('div', { class: 'couple-note stack' });
  const statsSec = h('section', { class: 'hub-section stack', 'aria-labelledby': 'stats-h', hidden: true });
  const waitChip = h('span', { class: 'chip', hidden: true }, 'Bağlanıyor…');
  const grid = h('div', { class: 'game-grid' }, cards.map((c) => c.card));

  const el = h('div', { class: 'hub-wrap' },
    h('section', { class: 'couple stack' }, heading, pairBox, noteBox),
    h('section', { class: 'hub-section stack', 'aria-labelledby': 'games-h' },
      h('div', { class: 'hub-section-head' }, h('h2', { id: 'games-h' }, 'Ne oynayalım?'), waitChip),
      grid),
    statsSec);

  const view = { roomId, heading, pairBox, noteBox, cards, grid, waitChip, noteKey: '' };
  loadStats(roomId, statsSec);
  return { el, view };
}

function paintCouple(view = state.view) {
  if (!view || view.roomId !== state.roomId) return;
  const p = state.partner;
  const pname = p?.name || knownPartner(view.roomId)?.name || '';
  const broken = state.status === 'offline' || state.status === 'error';

  let st;
  if (broken) st = { kind: 'off', text: 'bağlantı yok' };
  else if (!state.room) st = { kind: 'off', text: 'bağlanıyor…' };
  else if (p) st = partnerWhere(p, 'lobby');
  else st = pname ? { kind: 'off', text: 'çevrimdışı' } : null;

  view.heading.textContent = pname ? `Odamız: sen ve ${pname}` : 'Odamız';
  view.pairBox.replaceChildren(pairEl({
    meName: me().name, partnerName: pname, online: !!p,
    link: p ? 'on' : pname ? 'off' : 'wait', lg: true, names: true, state: st,
  }));

  // Not kutusu: yalnız durum değişince yeniden kur (link kutusundaki seçim kaybolmasın).
  const g = p ? gameById(p.page) : null;
  const key = broken ? `broken:${state.statusDetail}`
    : !state.room ? 'connecting'
    : p ? (g ? `game:${g.id}:${pname}` : 'together')
    : pname ? `away:${pname}` : 'invite';
  if (key !== view.noteKey) {
    view.noteKey = key;
    view.noteBox.replaceChildren(...coupleNote(view.roomId, p, pname, g, broken));
  }

  // Partnerin yeri belli olana dek kartlar kapalı: hızlı dokunuş ikinci ev sahibi yaratmasın.
  const wait = state.waiting;
  view.waitChip.hidden = !wait;
  view.grid.setAttribute('aria-busy', String(wait));
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
  if (!state.room) return [line('Odaya bağlanıyor…')];
  if (p && g) {
    return [
      line(`${pname} şu an ${locative(g.title)}.`),
      h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn primary', onclick: () => joinPartner(p) }, 'Yanına git')),
    ];
  }
  if (p) return [line('İkiniz de buradasınız. Bir oyun seç; o da seninle gelir.')];
  if (pname) return [line(`${pname} şu an burada değil. Bir oyun açarsan, gelince seni orada görür.`)];
  return [h('div', { class: 'card invite-card stack' },
    h('h2', {}, 'Sevgilin henüz gelmedi'),
    h('p', { class: 'muted' }, 'Bu linki gönder. Açınca burada belirir; link bir kez yeter.'),
    linkBox(roomId),
    h('div', { class: 'row' }, shareButton(roomId)))];
}

async function loadStats(roomId, section) {
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
  if (!rows.length) {
    section.hidden = true;
    return;
  }
  const total = rows.reduce((sum, r) => sum + Number(r.played), 0);
  section.replaceChildren(
    h('div', { class: 'hub-section-head' },
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

// ---------- Ayarlar ----------
function openSettings() {
  const roomId = currentRoom();
  const dlg = h('dialog', { class: 'ui-dialog sheet', 'aria-labelledby': 'set-h' });
  const close = () => dlg.close();

  const nameInput = h('input', {
    class: 'input', id: 'set-name', type: 'text', value: me().name || '',
    maxlength: NAME_MAX, autocomplete: 'nickname', autocapitalize: 'words',
  });
  const nameForm = h('form', {
    novalidate: true,
    onsubmit: (e) => {
      e.preventDefault();
      const v = cleanName(nameInput.value);
      if (!v) {
        nameInput.setAttribute('aria-invalid', 'true');
        nameInput.focus();
        return;
      }
      const changed = v !== me().name;
      setName(v);
      close();
      if (changed) {
        leaveRoom(); // yeni adla yeniden katıl: partner yeni adı görsün
        render();
        toast('Adın güncellendi');
      }
    },
  }, nameInput, h('button', { type: 'submit', class: 'btn' }, 'Kaydet'));

  const groups = [
    h('div', { class: 'settings-group stack' },
      h('label', { class: 'hub-label', for: 'set-name' }, 'Adın'),
      nameForm),
  ];
  if (roomId) {
    groups.push(
      h('div', { class: 'settings-group stack' },
        h('span', { class: 'hub-label' }, 'Davet linki'),
        linkBox(roomId),
        h('div', { class: 'row' }, shareButton(roomId, 'btn'))),
      h('div', { class: 'settings-group stack' },
        h('p', { class: 'muted' }, 'Odadan çıkarsan bu cihaz odayı unutur. Davet linkini yeniden açarak dönebilirsin.'),
        h('div', { class: 'row' }, h('button', {
          type: 'button',
          class: 'btn danger',
          onclick: async () => {
            close();
            const ok = await confirmDialog('Odadan çıkılsın mı? Bu cihaz odayı unutacak.', { ok: 'Odadan çık' });
            if (!ok) return;
            leaveRoom();
            clearRoom();
            state.fresh = false;
            render({ focus: true });
            toast('Odadan çıktın');
          },
        }, 'Odadan çık'))));
  }

  dlg.append(h('div', { class: 'dialog-card settings stack' },
    h('div', { class: 'settings-head' },
      h('h2', { id: 'set-h' }, 'Ayarlar'),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Kapat', autofocus: true, onclick: close }, icon('close'))),
    groups));
  dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
}

// ---------- Üst şerit ----------
function buildHeader() {
  const local = isLocalMode();
  document.body.classList.toggle('is-local', local);
  state.settingsBtn = h('button', {
    type: 'button', class: 'icon-btn', 'aria-label': 'Ayarlar', title: 'Ayarlar', onclick: openSettings,
  }, icon('settings'));
  shell.replaceChildren(h('div', { class: 'shell-bar' },
    h('span', { class: 'hub-brand' }, icon('mark'), h('span', { class: 'hub-brand-text' }, 'Bizim Oyunlar')),
    local ? h('span', { class: 'chip shell-local', title: 'Aynı tarayıcının sekmeleri birbiriyle konuşur' }, 'Yerel test modu') : null,
    muteButton(),
    state.settingsBtn));
  trackShellHeight(shell);
}

// ---------- Çizim ----------
function render({ focus = false } = {}) {
  const name = cleanName(me().name);
  const roomId = currentRoom();
  state.settingsBtn.hidden = !name;

  let screen;
  if (!name) {
    screen = nameScreen(roomId);
  } else if (!roomId) {
    leaveRoom();
    screen = welcomeScreen(name);
  } else {
    ensureRoom(roomId);
    screen = state.fresh ? inviteScreen(roomId, name) : lobbyScreen(roomId);
  }
  state.view = screen.view || null;
  app.replaceChildren(screen.el);
  paintCouple();

  if (focus) {
    window.scrollTo(0, 0);
    const target = screen.el.querySelector('[data-autofocus]') || screen.el.querySelector('h1');
    target?.focus({ preventScroll: true });
  }
}

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

buildHeader();
const arrived = takeHashRoom();
render();
if (arrived && cleanName(me().name)) toast('Odanıza hoş geldin');
