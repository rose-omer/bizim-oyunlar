// Hafıza Kartları sayfası. Ev sahibi durumu tutar (oyun.js), misafir yalnız niyet yollar.
import { joinRoom } from '../../js/core/room.js';
import { readGameParams, lobbyUrl } from '../../js/core/identity.js';
import { mountShell, waitForPartner, celebrate, toast, confirmDialog } from '../../js/core/ui.js';
import { sfx } from '../../js/core/sound.js';
import { logGame } from '../../js/core/db.js';
import { skorKaydet, toplamSatiri } from '../../js/core/skor.js';
import { THEMES, themeById } from './temalar.js';
import { SIZES, sizeById, initialState, reduce, toAction, schedule, resultOf, winnerOf, bestLayout } from './oyun.js';
import { createSync, sessionStore } from './sync.js';
import { newSeed } from './rng.js';
import { fitToViewport, esc, fmtTime } from './ekran.js';

const NS = 'hafiza';
const GAP = 8;
const OPTIMISTIC_MS = 3000; // onaylanmayan iyimser açılış bu süre sonra geri alınır

const { roomId, hostId, isHost } = readGameParams();
const room = await joinRoom({ roomId, ns: NS });
mountShell({ title: 'Hafıza Kartları', room });

const app = document.getElementById('app');
app.innerHTML = `
  <section class="hf" id="hf" aria-label="Hafıza Kartları">
    <div class="hf-bar" id="hf-bar"></div>
    <div class="hf-stage" id="hf-stage"><p class="muted">Bağlanıyor…</p></div>
    <p class="hf-sr" id="hf-live" aria-live="polite"></p>
    <div class="hf-away hidden" id="hf-away" role="status">
      <div class="card stack center">
        <p class="title">Sevgilin dönünce devam 💞</p>
        <p class="muted">Kartlar olduğu gibi bekliyor.</p>
      </div>
    </div>
  </section>`;
const root = document.getElementById('hf');
const bar = document.getElementById('hf-bar');
const stage = document.getElementById('hf-stage');
const live = document.getElementById('hf-live');
const away = document.getElementById('hf-away');

const mode = await waitForPartner(room, {
  ns: NS,
  text: 'Sevgilin gelince sırayla oynarsınız. İstersen tek başına başla.',
  allowSolo: true,
});
const me = room.me.clientId;
const partner = room.partner();
const solo = !roomId || mode === 'solo' || !partner;
const authority = solo || isHost;
const players = solo ? [me] : [me, partner.clientId];
const names = solo ? { [me]: room.me.name } : { [me]: room.me.name, [partner.clientId]: partner.name };

let board = null; // { key, el, cards[], layout }
let closeCelebrate = null;
let optimistic = new Map(); // misafirin onaysız açtığı kart → geri alma zamanlayıcısı
let lastAnnounce = '';

const sync = createSync({
  room, ns: NS, hostId, isHost: authority, solo,
  reduce, schedule,
  initial: initialState({ players, names }),
  toAction: (intent, by, s) => toAction(intent, by, s, { hostId: me, now: Date.now(), seed: newSeed(), players, names }),
  storage: sessionStore(),
  storeKey: `bizim.hafiza.${roomId || '-'}.${solo ? 'solo' : 'duo'}`,
  accept: (s) => s.v === 1 && s.players?.join() === players.join(),
  onState: render,
  onPeer: (here) => { if (!authority) away.classList.toggle('hidden', here); },
  onSoloPartner: () => toast('Sevgilin şu an tek başına oynuyor. Bitince birlikte oynayın 💞'),
});

if (solo && roomId) {
  let seen = false;
  room.on('presence', (p) => {
    const here = !!p && p.page === NS;
    if (here && !seen) {
      toast(`${p.name || 'Sevgilin'} geldi!`, { action: { label: 'Birlikte oyna', onClick: () => location.reload() }, ms: 8000 });
    }
    seen = here;
  });
}

fitToViewport(root, layoutBoard);
if ('ResizeObserver' in window) new ResizeObserver(() => layoutBoard()).observe(stage);
sync.start();
setInterval(tickClock, 1000);

// ---------- yardımcılar ----------
function nameOf(s, id) {
  if (id === me) return 'Sen';
  return s.names?.[id] || 'Sevgilin';
}
function announce(text) {
  if (!text || text === lastAnnounce) return;
  lastAnnounce = text;
  live.textContent = text;
}
function turnText(s) {
  if (s.players.length < 2) return '';
  return s.players[s.turn] === me ? 'Sıra sende' : `Sıra: ${nameOf(s, s.players[s.turn])}`;
}

// ---------- çizim ----------
function render(s, prev) {
  if (!s) return;
  if (s.phase !== 'end' && closeCelebrate) { try { closeCelebrate(); } catch {} closeCelebrate = null; }
  for (const t of optimistic.values()) clearTimeout(t);
  optimistic.clear();
  if (s.phase === 'setup') {
    board = null;
    bar.innerHTML = '';
    if (authority) renderSetup(s);
    else stage.innerHTML = `<div class="card stack center hf-wait"><p class="title">Sevgilin kartları hazırlıyor…</p><p class="muted">Birazdan başlıyoruz 💭</p></div>`;
    return;
  }
  renderBar(s);
  renderBoard(s);
  effects(s, prev);
}

function renderSetup(s) {
  let theme = s.theme;
  let size = s.size;
  stage.innerHTML = `
    <div class="hf-setup card stack">
      <h2 class="title">Hafıza Kartları</h2>
      <p class="subtitle">Tema ve boyut seç, kartları karıştıralım.</p>
      <p class="hf-label" id="hf-tl">Tema</p>
      <div class="hf-themes" role="group" aria-labelledby="hf-tl">
        ${THEMES.map((t) => `<button type="button" class="btn hf-opt" data-theme="${t.id}" aria-pressed="${t.id === theme}"><span aria-hidden="true">${t.icon}</span> ${esc(t.name)}</button>`).join('')}
      </div>
      <p class="hf-label" id="hf-sl">Boyut</p>
      <div class="seg hf-sizes" role="group" aria-labelledby="hf-sl">
        ${SIZES.map((z) => `<button type="button" data-size="${z.id}" aria-pressed="${z.id === size}">${z.label} <small>${z.pairs} çift</small></button>`).join('')}
      </div>
      <button type="button" class="btn primary" data-act="start">Başla</button>
    </div>`;
  stage.querySelector('.hf-setup').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.theme) {
      theme = b.dataset.theme;
      stage.querySelectorAll('[data-theme]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      sfx('tap');
    } else if (b.dataset.size) {
      size = b.dataset.size;
      stage.querySelectorAll('[data-size]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      sfx('tap');
    } else if (b.dataset.act === 'start') {
      sync.dispatch({ type: 'setup', theme, size });
    }
  });
}

function renderBar(s) {
  const t = themeById(s.theme);
  let left;
  if (s.players.length > 1) {
    left = s.players.map((id, k) => `
      <span class="chip hf-p${s.phase === 'play' && s.turn === k ? ' is-turn' : ''}" data-p="${k}">
        <b>${esc(nameOf(s, id))}</b> <span aria-label="puan">${Number(s.scores[k])}</span>
      </span>`).join('');
    if (s.phase === 'play') left += `<span class="hf-turn" aria-hidden="true">${esc(turnText(s))}</span>`;
  } else {
    const found = Number(s.scores[0]);
    left = `
      <span class="chip">Hamle <b>${Number(s.moves)}</b></span>
      <span class="chip" aria-label="Süre"><span aria-hidden="true">⏱</span> <b id="hf-time">${fmtTime(elapsed(s) / 1000)}</b></span>
      <span class="chip">Eş <b>${found}/${Number(s.deck.length) / 2}</b></span>`;
  }
  const tools = [];
  if (s.phase === 'end') tools.push('<button type="button" class="btn small primary" data-act="again">Tekrar</button>');
  if (authority) tools.push('<button type="button" class="btn small ghost" data-act="menu" aria-label="Yeni oyun: tema ve boyut seç">Yeni oyun</button>');
  bar.innerHTML = `<div class="hf-left"><span class="hf-theme" aria-label="Tema: ${esc(t?.name)}">${t?.icon ?? ''}</span>${left}</div><div class="row hf-tools">${tools.join('')}</div>`;
}

bar.addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-act]');
  if (!b) return;
  if (b.dataset.act === 'again') sync.dispatch({ type: 'again' });
  if (b.dataset.act === 'menu') {
    const s = sync.state;
    if (s?.phase === 'play' && !(await confirmDialog('Bu oyunu bırakıp yeni oyun kuralım mı?', { ok: 'Yeni oyun' }))) return;
    sync.dispatch({ type: 'menu' });
  }
});

function elapsed(s) {
  if (s.startedAt == null) return 0;
  return (s.endedAt ?? sync.hostNow()) - s.startedAt;
}
function tickClock() {
  const s = sync.state;
  const el = document.getElementById('hf-time');
  if (s && el && s.phase === 'play') el.textContent = fmtTime(elapsed(s) / 1000);
}

function renderBoard(s) {
  const key = `${s.game}:${s.seed}`;
  if (!board || board.key !== key) {
    stage.innerHTML = '';
    const el = document.createElement('div');
    el.className = `hf-board${s.players.length < 2 ? ' is-solo' : ''}`;
    el.setAttribute('role', 'group');
    el.setAttribute('aria-label', 'Kartlar');
    const cards = s.deck.map((_, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'hf-card';
      b.dataset.i = String(i);
      b.innerHTML = '<span class="hf-in"><span class="hf-back" aria-hidden="true"></span><span class="hf-face" aria-hidden="true"></span></span>';
      el.appendChild(b);
      return b;
    });
    el.addEventListener('click', onCardClick);
    stage.appendChild(el);
    board = { key, el, cards, size: s.size, layout: null };
    layoutBoard();
  }
  s.deck.forEach((_, i) => paintCard(s, i));
  board.el.classList.toggle('is-locked', s.phase !== 'play' || s.pending || s.players[s.turn] !== me);
}

function paintCard(s, i, forceOpen = false) {
  const b = board.cards[i];
  const owner = s.owner[i];
  const open = forceOpen || owner !== -1 || s.open.includes(i);
  const face = b.querySelector('.hf-face');
  b.classList.toggle('is-open', open);
  b.classList.toggle('is-matched', owner !== -1);
  b.classList.toggle('by-0', owner === 0);
  b.classList.toggle('by-1', owner === 1);
  b.classList.toggle('is-wrong', !!s.pending && s.open.includes(i));
  if (open) {
    face.textContent = s.deck[i];
    clearTimeout(b._hideT);
  } else if (face.textContent) {
    clearTimeout(b._hideT);
    b._hideT = setTimeout(() => { if (!b.classList.contains('is-open')) face.textContent = ''; }, 450);
  }
  b.disabled = owner !== -1;
  b.setAttribute('aria-label', `Kart ${i + 1}: ${open ? s.deck[i] : 'kapalı'}${owner !== -1 ? ', eşleşti' : ''}`);
}

function layoutBoard() {
  if (!board) return;
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  if (!w || !h) return;
  const L = bestLayout(board.size, w, h, GAP);
  const cols = sizeById(board.size).cols;
  const el = board.el;
  el.style.gridTemplateColumns = `repeat(${L.cols}, ${L.w}px)`;
  el.style.gridTemplateRows = `repeat(${L.rows}, ${L.h}px)`;
  el.style.setProperty('--hf-fs', `${Math.floor(Math.min(L.w, L.h) * 0.56)}px`);
  if (board.layout?.transposed === L.transposed && board.layout.placed) return;
  board.cards.forEach((b, i) => {
    const r = Math.floor(i / cols), c = i % cols;
    b.style.gridRow = String((L.transposed ? c : r) + 1);
    b.style.gridColumn = String((L.transposed ? r : c) + 1);
  });
  board.layout = { transposed: L.transposed, placed: true };
}

function onCardClick(e) {
  const b = e.target.closest('.hf-card');
  const s = sync.state;
  if (!b || !s || s.phase !== 'play') return;
  const i = Number(b.dataset.i);
  if (s.players[s.turn] !== me) {
    announce(`Sıra ${nameOf(s, s.players[s.turn])}`);
    b.animate?.([{ transform: 'translateX(0)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(0)' }], { duration: 220 });
    return;
  }
  if (s.pending || s.owner[i] !== -1 || s.open.includes(i) || optimistic.has(i)) return;
  if (s.open.length + optimistic.size >= 2) return;
  sfx('flip');
  if (!authority) {
    optimistic.set(i, setTimeout(() => unflip(i), OPTIMISTIC_MS));
    paintCard(s, i, true);
  }
  if (!sync.dispatch({ type: 'flip', i }) && !authority) unflip(i); // gönderilemedi (ör. yeniden bağlanıyor)
}

// İyimser açılışı geri al: kart durumdaki hâline döner.
function unflip(i) {
  if (!optimistic.has(i)) return;
  clearTimeout(optimistic.get(i));
  optimistic.delete(i);
  const s = sync.state;
  if (board && s && s.phase !== 'setup') paintCard(s, i);
}

// ---------- ses, duyuru, bitiş ----------
function effects(s, prev) {
  const same = prev && prev.phase !== 'setup' && prev.game === s.game;
  if (!same) {
    lastAnnounce = '';
    if (s.phase === 'play') announce(prev ? `Yeni oyun. ${turnText(s) || 'Eşleri bul!'}` : turnText(s));
    return;
  }
  const matchedBefore = prev.scores.reduce((a, b) => a + b, 0);
  const matchedNow = s.scores.reduce((a, b) => a + b, 0);
  const newlyOpen = s.open.filter((i) => !prev.open.includes(i));
  if (newlyOpen.length && prev.players[prev.turn] !== me) sfx('flip');
  if (s.phase === 'end' && prev.phase !== 'end') {
    celebrateEnd(s);
    return;
  }
  if (matchedNow > matchedBefore) {
    sfx('match');
    const who = s.players.length > 1 ? `${nameOf(s, s.players[s.turn])} +1. ` : '';
    announce(`Eşleşti! ${who}${turnText(s)}`.trim());
  } else if (s.pending && !prev.pending) {
    sfx('wrong');
    announce('Eş değil.');
  } else if (s.turn !== prev.turn) {
    announce(turnText(s));
  }
}

function celebrateEnd(s) {
  sfx('win');
  const r = resultOf(s);
  let title;
  let lines;
  if (s.players.length > 1) {
    const w = winnerOf(s);
    title = w === -1 ? 'Berabere! Tam uyum 💞' : s.players[w] === me ? 'Kazandın! 🎉' : `${nameOf(s, s.players[w])} kazandı! 🎉`;
    lines = [s.players.map((id, k) => `${nameOf(s, id)}: ${s.scores[k]}`).join(' · '), `${s.moves} hamle`];
  } else {
    title = 'Bravo, hepsini buldun! 🎉';
    lines = [`${s.moves} hamle`, `Süre: ${fmtTime(r.seconds)}`];
  }
  announce(`${title} ${lines.join('. ')}`);
  if (authority && roomId) logGame(roomId, 'hafiza', r);
  if (s.players.length > 1) {
    const w = winnerOf(s); // puanı yüksek olan kazanır
    const kayit = authority && roomId ? skorKaydet(room, NS, { kazanan: w === -1 ? null : s.players[w] }) : null;
    lines.push(toplamSatiri(room, NS, s.players, s.names, kayit));
  }
  closeCelebrate = celebrate({
    title,
    lines,
    buttons: [
      { label: 'Tekrar', primary: true, onClick: () => { closeCelebrate?.(); closeCelebrate = null; sync.dispatch({ type: 'again' }); } },
      { label: 'Ana sayfaya dön', onClick: () => { location.href = lobbyUrl(); } },
    ],
  });
}
