// Pişti sayfası. Kurallar oyun.js'te; ev sahibi uygular, misafir niyet yollar (dama/masa.js).
// Gizli el: misafire view(s, id) gider (yalnız kendi eli); kayda (oyunkayit) tam durum yazılır.
import { celebrate, toast, confirmDialog, h, ICONS } from '../../js/core/ui.js';
import { lobbyUrl } from '../../js/core/identity.js';
import { sfx } from '../../js/core/sound.js';
import { logGame } from '../../js/core/db.js';
import { newSeed } from '../hafiza/rng.js';
import { fitToViewport } from '../hafiza/ekran.js';
import { bootMasa, agoText, bulunma, mountAway, resumeCard } from '../dama/masa.js';
import * as P from './oyun.js';

const NS = 'pisti';
const PENDING_MS = 3000;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)');
const RANK_TXT = { T: '10', J: 'J', Q: 'Q', K: 'K', A: 'A' };
const RANK_TR = { A: 'As', T: '10', J: 'Vale', Q: 'Kız', K: 'Papaz' };
const SUIT_TR = { s: 'Maça', h: 'Kupa', d: 'Karo', c: 'Sinek' };
const SUIT_SVG = {
  h: '<path d="M12 21.2s-8.6-5.3-9.6-10.6C1.7 6.8 4.2 4 7.3 4c2 0 3.6 1.1 4.7 2.9C13.1 5.1 14.7 4 16.7 4c3.1 0 5.6 2.8 4.9 6.6-1 5.3-9.6 10.6-9.6 10.6z"/>',
  d: '<path d="M12 2.2 20.3 12 12 21.8 3.7 12z"/>',
  s: '<path d="M12 2.4S3.4 8.7 3.4 13.6c0 2.7 2 4.6 4.5 4.6 1.4 0 2.6-.6 3.3-1.6-.3 2-1.1 3.4-2.6 4.9h6.8c-1.5-1.5-2.3-2.9-2.6-4.9.7 1 1.9 1.6 3.3 1.6 2.5 0 4.5-1.9 4.5-4.6C20.6 8.7 12 2.4 12 2.4z"/>',
  c: '<circle cx="12" cy="7.3" r="4.3"/><circle cx="7" cy="13.4" r="4.3"/><circle cx="17" cy="13.4" r="4.3"/><path d="M11 12.5h2l1.4 8.9H9.6z"/>',
};
const HEDEF_TXT = { 0: 'Tek el', 51: '51', 151: '151' };

const app = document.getElementById('app');
app.innerHTML = `
  <section class="ps" id="ps" aria-label="Pişti">
    <div class="ps-plate is-opp" id="ps-opp"></div>
    <div class="ps-table" id="ps-table">
      <div class="ps-deck" id="ps-deck"></div>
      <div class="ps-pile" id="ps-pile" role="img"></div>
      <p class="ps-flash" id="ps-flash" aria-hidden="true"></p>
      <div class="masa-cover ps-cover hidden" id="ps-cover"></div>
    </div>
    <div class="ps-hand" id="ps-hand" role="group" aria-label="Elindeki kartlar"></div>
    <div class="ps-plate is-me" id="ps-me"></div>
    <div class="ps-foot" id="ps-foot">
      <p class="ps-status" id="ps-status" role="status">Bağlanıyor…</p>
      <div class="ps-tools" id="ps-tools"></div>
    </div>
    <p class="sr-only" id="ps-live" aria-live="polite"></p>
  </section>`;
const root = document.getElementById('ps');
const tableEl = document.getElementById('ps-table');
const deckEl = document.getElementById('ps-deck');
const pileEl = document.getElementById('ps-pile');
const flashEl = document.getElementById('ps-flash');
const cover = document.getElementById('ps-cover');
const handEl = document.getElementById('ps-hand');
const oppEl = document.getElementById('ps-opp');
const meEl = document.getElementById('ps-me');
const statusEl = document.getElementById('ps-status');
const toolsEl = document.getElementById('ps-tools');
const footEl = document.getElementById('ps-foot');
const live = document.getElementById('ps-live');

const M = await bootMasa({
  ns: NS,
  title: 'Pişti',
  game: {
    reduce: P.reduce, toAction: P.toAction, seat: P.seat, isNewer: P.isNewer,
    view: P.view, save: (s) => s,
    finished: (s) => s.phase === 'end',
    fresh: (players, names) => P.initialState({ players, names, now: Date.now(), seed: newSeed() }),
  },
  valid: (d) => Array.isArray(d.players) && Array.isArray(d.deck) && Array.isArray(d.hands)
    && d.hands.every(Array.isArray) && Array.isArray(d.pile) && Array.isArray(d.total),
});
const me = M.meId;

let sel = null; // seçili kart
let pending = null; // misafir: { card, timer } ev sahibi onaylayana dek
let closeCelebrate = null;
let resumeOpen = false;
let closeResume = null;
let quiet = false;
let lastAnnounce = '';
let flashTimer = 0;
let shownCover = '';
const away = mountAway(root, { isGuest: !M.authority, onHost: () => M.becomeHost() });

// ---------- yardımcılar ----------
const state = () => M.sync.state;
function seatOf(s) {
  const i = s.players.indexOf(me);
  return i < 0 ? 0 : i;
}
function nameOf(s, id) {
  return id === me ? 'Sen' : M.nameOf(id, s);
}
const oppSeat = (s) => 1 - seatOf(s);
function myTurn(s) {
  return !!s && s.phase === 'play' && s.players[s.turn] === me && !resumeOpen && !pending;
}
function myHand(s) {
  if (!s.players.includes(me)) return []; // bu cihaz oyunda değil: hiçbir el gösterilmez
  const hd = s.hands[seatOf(s)];
  return Array.isArray(hd) ? hd.filter((c) => c !== pending?.card) : [];
}
function announce(text) {
  if (!text || text === lastAnnounce) return;
  lastAnnounce = text;
  live.textContent = text;
}
const cardName = (c) => `${SUIT_TR[P.suitOf(c)]} ${RANK_TR[P.rankOf(c)] || P.rankOf(c)}`;
const suitSvg = (c, cls) => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${SUIT_SVG[P.suitOf(c)]}</svg>`;
const isRed = (c) => P.suitOf(c) === 'h' || P.suitOf(c) === 'd';

/** Kart yüzü (c) ya da arkası (c = null). */
const CARD_RE = /^[A2-9TJQK][shdc]$/;
function cardEl(c, { tag = 'span', cls = '', ...props } = {}) {
  if (!c || !CARD_RE.test(c)) return h(tag, { class: `ps-card is-back ${cls}`, html: `<span class="ps-back-mark">${ICONS.heart}</span>`, ...props });
  const r = P.rankOf(c);
  const rt = RANK_TXT[r] || r;
  const face = 'JQK'.includes(r);
  const html = `
    <span class="ps-corner"><b>${rt}</b>${suitSvg(c, 'ps-suit')}</span>
    <span class="ps-center${face ? ' is-face' : ''}">${face ? `<b>${rt}</b>` : ''}${suitSvg(c, 'ps-pip')}</span>
    <span class="ps-corner is-end"><b>${rt}</b>${suitSvg(c, 'ps-suit')}</span>`;
  return h(tag, { class: `ps-card ${isRed(c) ? 'red' : 'black'} ${cls}`, html, ...props });
}

// Yerdeki kartlar hafif dağınık dursun (konuma göre sabit açı).
const tilt = (i) => (((i * 37) % 11) - 5) * 1.3;
const shift = (i) => (((i * 53) % 9) - 4) * 1.5;

function layout() {
  const cs = getComputedStyle(root);
  const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
  const w = Math.min(root.clientWidth - padX, 560);
  const gap = 10;
  let cw = Math.min(88, Math.floor((w - gap * 3) / 4));
  const fixed = [oppEl, meEl, footEl].reduce((n, el) => n + el.offsetHeight, 0) + (parseFloat(cs.rowGap) || 8) * 4
    + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
  const avail = root.clientHeight - fixed; // el + masa
  if (avail > 0) cw = Math.min(cw, Math.floor((avail - 96) / 3.05)); // el + yerdeki (1,18 kat) kart
  cw = Math.max(52, cw);
  root.style.setProperty('--cw', `${cw}px`);
  root.style.setProperty('--pw', `${Math.round(cw * 1.18)}px`);
}

// ---------- çizim ----------
function render() {
  const s = state();
  if (!s) return;
  const seat = seatOf(s);
  const mine = myTurn(s);
  root.classList.toggle('is-mine', mine);
  renderPlate(oppEl, s, oppSeat(s), true);
  renderPlate(meEl, s, seat, false);
  renderDeck(s);
  renderPile(s);
  renderHand(s, mine);
  renderStatus(s, mine);
  renderTools(s);
  renderCover(s);
}

function renderPlate(el, s, p, opp) {
  const id = s.players[p];
  const active = s.phase === 'play' && s.turn === p;
  const n = P.handSize(s, p);
  const pistis = Math.round((s.pp?.[p] || 0) / 10);
  const wins = s.tally?.[id] || 0;
  el.classList.toggle('is-turn', active);
  const sub = `${s.taken[p]} kart${pistis ? ` · ${s.pp[p]} pişti puanı` : ''}`;
  el.replaceChildren(...[
    h('span', { class: 'ps-who' },
      h('span', { class: 'ps-name' }, nameOf(s, id)),
      h('span', { class: 'ps-sub' }, sub)),
    opp ? h('span', { class: 'ps-fan', 'aria-label': `Elinde ${n} kart` },
      Array.from({ length: n }, (_, i) => cardEl(null, { cls: 'ps-mini', style: { '--i': String(i), '--n': String(n) } }))) : null,
    h('span', { class: 'ps-score', 'aria-label': `${s.total[p]} puan${wins ? `, ${wins} galibiyet` : ''}` },
      h('b', {}, String(s.total[p])),
      wins ? h('small', {}, `${wins} galibiyet`) : null),
  ].filter(Boolean));
}

function renderDeck(s) {
  const n = P.deckLeft(s);
  deckEl.replaceChildren(
    n ? h('span', { class: 'ps-deck-stack' }, cardEl(null), n > 4 ? cardEl(null) : null) : h('span', { class: 'ps-deck-empty' }),
    h('span', { class: 'ps-count' }, n ? `Destede ${n}` : 'Deste bitti'));
}

function renderPile(s) {
  const cards = s.pile.slice();
  if (pending) cards.push(pending.card);
  const from = Math.max(0, cards.length - 6); // en çok son 6 kart çizilir
  const kids = cards.slice(from).map((c, k) => {
    const i = from + k;
    const top = i === cards.length - 1;
    return cardEl(c, {
      cls: `ps-in-pile${top ? ' is-top' : ''}${top && pending ? ' is-pending' : ''}${top && s.last && !pending && s.last.card === c && !s.last.took ? (s.last.by === seatOf(s) ? ' from-me' : ' from-opp') : ''}`,
      style: { '--r': `${tilt(i)}deg`, '--x': `${shift(i)}px`, '--y': `${shift(i + 3) * 0.6}px` },
    });
  });
  pileEl.classList.toggle('is-empty', !cards.length);
  pileEl.setAttribute('aria-label', cards.length
    ? `Yerde ${cards.length} kart${cards[cards.length - 1] ? `, üstte ${cardName(cards[cards.length - 1])}` : ''}`
    : 'Yer boş');
  const label = h('span', { class: 'ps-count ps-pile-count' }, cards.length ? `Yerde ${cards.length}` : 'Yer boş');
  pileEl.replaceChildren(h('span', { class: 'ps-pile-cards' }, kids), label);
}

function renderHand(s, mine) {
  const cards = myHand(s);
  if (sel && !cards.includes(sel)) sel = null;
  handEl.classList.toggle('is-mine', mine);
  handEl.replaceChildren(...cards.map((c) => cardEl(c, {
    tag: 'button',
    cls: `ps-hand-card${c === sel ? ' is-sel' : ''}`,
    type: 'button',
    'aria-pressed': String(c === sel),
    'aria-label': `${cardName(c)}${c === sel ? ', seçili: atmak için yeniden dokun' : ''}`,
    dataset: { c },
  })));
  if (!cards.length && s.phase === 'play') handEl.append(h('span', { class: 'ps-hand-empty' }, 'Kartlar dağıtılıyor…'));
}

function renderStatus(s, mine) {
  statusEl.classList.remove('is-turn', 'is-alert');
  if (s.phase === 'end') {
    const w = s.result?.winner;
    statusEl.textContent = w === -1 ? 'Berabere bitti.' : s.players[w] === me ? 'Kazandın!' : `${nameOf(s, s.players[w])} kazandı.`;
    return;
  }
  if (s.phase === 'elsonu') {
    statusEl.textContent = `${s.el}. el bitti`;
    return;
  }
  if (pending) {
    statusEl.textContent = 'Kart atılıyor…';
    return;
  }
  if (s.players[s.turn] === me) {
    statusEl.classList.add('is-turn');
    statusEl.textContent = !mine ? 'Sıra sende' : sel ? 'Atmak için karta yeniden dokun' : 'Sıra sende · bir kart seç';
    return;
  }
  const other = nameOf(s, s.players[s.turn]);
  statusEl.textContent = M.partnerHere() ? `${other} düşünüyor…` : `Sıra ${bulunma(other)} · gelince görecek`;
}

function renderTools(s) {
  const fresh = s.phase === 'play' && s.el === 1 && s.plays === 0;
  const seg = h('div', { class: 'seg ps-hedef', role: 'group', 'aria-label': 'Oyun kaç puana' },
    P.HEDEFLER.map((v) => h('button', {
      type: 'button',
      'aria-pressed': String(s.hedef === v),
      disabled: !fresh && s.hedef !== v,
      title: fresh ? '' : 'Oyun başladı; yeni oyunda değiştirebilirsin',
      onclick: () => { if (fresh && s.hedef !== v) { sfx('tap'); M.sync.dispatch({ type: 'hedef', hedef: v }); } },
    }, HEDEF_TXT[v])));
  const btn = s.phase === 'end'
    ? h('button', { type: 'button', class: 'btn small primary', onclick: () => M.sync.dispatch({ type: 'new', no: s.no }) }, 'Rövanş')
    : h('button', { type: 'button', class: 'btn small ghost', onclick: newGame }, 'Yeni oyun');
  toolsEl.replaceChildren(seg, btn);
}

async function newGame() {
  const s = state();
  if (!s) return;
  const started = s.el > 1 || s.plays > 0;
  if (started && !(await confirmDialog('Bu oyunu bırakıp yeni oyuna başlayalım mı?', { ok: 'Yeni oyun' }))) return;
  sel = null;
  M.sync.dispatch({ type: 'new', no: s.no });
}

// El arası ve oyun sonu: puan tablosu.
function renderCover(s) {
  if (resumeOpen) return;
  const key = s.phase === 'play' ? '' : `${s.no}:${s.el}:${s.phase}`;
  if (key === shownCover) return;
  shownCover = key;
  if (!key) { cover.classList.add('hidden'); cover.replaceChildren(); return; }
  const e = s.elSonu;
  const mi = seatOf(s);
  const oi = 1 - mi;
  const col = (arr, i) => String(arr[i]);
  const row = (label, a, b) => h('tr', {}, h('th', { scope: 'row' }, label), h('td', {}, a), h('td', {}, b));
  const end = s.phase === 'end';
  const btn = end
    ? h('button', { type: 'button', class: 'btn primary', onclick: () => M.sync.dispatch({ type: 'new', no: s.no }) }, 'Rövanş')
    : h('button', { type: 'button', class: 'btn primary', onclick: () => { sfx('flip'); M.sync.dispatch({ type: 'next', el: s.el }); } }, 'Sonraki el');
  cover.replaceChildren(h('div', { class: 'card stack masa-card ps-sum', role: 'dialog', 'aria-labelledby': 'ps-sum-t' },
    h('h2', { class: 'masa-card-title', id: 'ps-sum-t' }, end ? 'Oyun bitti' : `${s.el}. el bitti`),
    h('table', { class: 'ps-sum-table' },
      h('thead', {}, h('tr', {}, h('td', {}), h('th', { scope: 'col' }, nameOf(s, s.players[mi])), h('th', { scope: 'col' }, nameOf(s, s.players[oi])))),
      h('tbody', {},
        row('Kart', col(e.taken, mi), col(e.taken, oi)),
        row('Çoğunluk', e.cogunluk === mi ? '+3' : '–', e.cogunluk === oi ? '+3' : '–'),
        row('Kart puanı', col(e.kart, mi), col(e.kart, oi)),
        row('Pişti', col(e.pisti, mi), col(e.pisti, oi)),
        row('Bu el', col(e.toplam, mi), col(e.toplam, oi))),
      h('tfoot', {}, row(s.hedef ? `Toplam (${s.hedef})` : 'Toplam', col(s.total, mi), col(s.total, oi)))),
    h('p', { class: 'ps-sum-note' }, "Kart puanı: as ve vale 1, sinek 2'si 2, karo 10'u 3."),
    h('div', { class: 'masa-card-actions' }, btn)));
  cover.classList.remove('hidden');
}

// ---------- oynama ----------
function play(card) {
  const s = state();
  if (!myTurn(s)) return;
  sel = null;
  sfx('flip');
  const ok = M.sync.dispatch({ type: 'play', card });
  if (!M.authority) {
    if (ok === false) toast('Bağlantı yok; kart atılamadı.');
    else pending = { card, timer: setTimeout(() => { pending = null; render(); }, PENDING_MS) };
  }
  render();
}

handEl.addEventListener('click', (e) => {
  const b = e.target.closest('.ps-hand-card');
  const s = state();
  if (!b || !s) return;
  const c = b.dataset.c;
  if (!myTurn(s)) {
    if (s.phase === 'play' && !pending) {
      announce(`Sıra ${bulunma(nameOf(s, s.players[s.turn]))}`);
      b.animate?.([{ transform: 'translateX(0)' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(3px)' }, { transform: 'translateX(0)' }], { duration: 200 });
    }
    return;
  }
  if (sel === c) { play(c); return; }
  sel = c;
  sfx('tap');
  render();
  handEl.querySelector(`[data-c="${c}"]`)?.focus({ preventScroll: true });
});

pileEl.addEventListener('click', () => {
  const s = state();
  if (sel && myTurn(s)) play(sel);
});

// ---------- ses, duyuru, efekt ----------
function flash(text) {
  clearTimeout(flashTimer);
  flashEl.textContent = text;
  flashEl.classList.remove('is-on');
  void flashEl.offsetWidth;
  flashEl.classList.add('is-on');
  flashTimer = setTimeout(() => flashEl.classList.remove('is-on'), 1600);
}

// Alınan kartlar yerden alanın tarafına süzülür.
function sweep(cards, toMe) {
  if (REDUCED.matches || !cards.length) return;
  const el = h('span', { class: 'ps-sweep', 'aria-hidden': 'true' },
    cards.slice(-3).map((c, k) => cardEl(c, { cls: 'ps-in-pile', style: { '--r': `${tilt(k + 1)}deg`, '--x': `${k * 6}px`, '--y': '0px' } })));
  pileEl.appendChild(el);
  const dy = toMe ? 1 : -1;
  const a = el.animate?.([
    { transform: 'translate(0, 0) scale(1)', opacity: 1, offset: 0 },
    { transform: 'translate(0, 0) scale(1)', opacity: 1, offset: 0.4 },
    { transform: `translate(0, ${dy * 170}px) scale(.55)`, opacity: 0 },
  ], { duration: 950, easing: 'cubic-bezier(.55,0,.8,.3)' });
  if (a) a.onfinish = () => el.remove();
  else el.remove();
}

function effects(s, prev, info) {
  if (!prev) {
    announce(s.phase === 'play' ? (s.players[s.turn] === me ? 'Sıra sende' : `Sıra ${bulunma(nameOf(s, s.players[s.turn]))}`) : '');
    return;
  }
  const seat = seatOf(s);
  if (s.no !== prev.no) {
    if (closeCelebrate) { try { closeCelebrate(); } catch { /* kapalı */ } closeCelebrate = null; }
    sfx('flip');
    const first = s.players[s.turn] === me ? 'sen başlıyorsun' : `${nameOf(s, s.players[s.turn])} başlıyor`;
    announce(`Yeni oyun, ${first}.`);
    toast(`Yeni oyun · ${first}`);
    return;
  }
  if (s.el !== prev.el) {
    sfx('flip');
    announce(`${s.el}. el başladı. ${s.players[s.turn] === me ? 'Sıra sende.' : ''}`);
    return;
  }
  if (s.plays > prev.plays && s.last) {
    const l = s.last;
    const mineCard = l.by === seat;
    const who = mineCard ? 'Sen' : nameOf(s, s.players[l.by]);
    if (!mineCard && !l.took) sfx('snap');
    if (l.took) {
      sweep([...prev.pile, l.card], mineCard);
      sfx(l.pisti ? 'match' : 'pop');
      if (l.pisti) flash(`${l.pisti === 20 ? 'Vale piştisi' : 'Pişti'}! +${l.pisti}`);
    }
    let text = `${who} ${cardName(l.card)} attı`;
    if (l.pisti) text += `: pişti, ${l.pisti} puan`;
    else if (l.took) text += `, ${l.took} kart aldı`;
    if (P.handSize(s, seat) === 4 && P.handSize(prev, seat) === 0) {
      text += '. Yeni kartlar dağıtıldı';
      if (!l.took) sfx('flip');
    }
    announce(`${text}.`);
  }
  if (s.phase === 'elsonu' && prev.phase !== 'elsonu') {
    sfx('pop');
    announce(`${s.el}. el bitti. Sen ${s.total[seat]}, ${nameOf(s, s.players[1 - seat])} ${s.total[1 - seat]}.`);
  }
  if (s.phase === 'end' && prev.phase !== 'end') celebrateEnd(s, info);
}

function celebrateEnd(s, info) {
  const seat = seatOf(s);
  const w = s.result?.winner;
  const won = w === seat;
  if (won || w === -1) sfx('win');
  else sfx('pop');
  const opp = nameOf(s, s.players[1 - seat]);
  const title = w === -1 ? 'Berabere' : won ? 'Kazandın!' : `${opp} kazandı`;
  const lines = [`Sen ${s.total[seat]} – ${s.total[1 - seat]} ${opp}`];
  const pistiTotal = s.pp?.[seat] || 0;
  if (pistiTotal) lines.push(`Son elde ${pistiTotal} pişti puanı`);
  announce(`${title}. ${lines.join('. ')}`);
  if (M.authority && !info?.adopted) logGame(M.roomId, NS, P.resultOf(s));
  closeCelebrate = celebrate({
    title,
    lines,
    buttons: [
      { label: 'Rövanş', primary: true, onClick: () => { closeCelebrate = null; M.sync.dispatch({ type: 'new', no: s.no }); } },
      { label: 'Puan tablosu', onClick: () => { closeCelebrate = null; } },
      { label: 'Ana sayfaya dön', onClick: () => { location.href = lobbyUrl(); } },
    ],
  });
}

// ---------- başlat ----------
fitToViewport(root, layout);
if ('ResizeObserver' in window) {
  const ro = new ResizeObserver(() => layout());
  ro.observe(root);
  ro.observe(footEl);
}

function dropResume() {
  if (!resumeOpen) return;
  resumeOpen = false;
  closeResume?.();
  closeResume = null;
  shownCover = '-';
}

M.start({
  onState(s, prev, info) {
    if (pending) { clearTimeout(pending.timer); pending = null; }
    if (s.phase !== 'play') dropResume();
    render();
    if (!quiet) effects(s, prev, info);
  },
  onPeer(here) { away.set(here); render(); },
  notify: (s, prev) => P.notice(prev, s, { by: me, ad: (id) => M.nameOf(id, s) }),
  onGone() {
    if (!resumeOpen) return;
    dropResume();
    quiet = true;
    try { M.fresh(); } finally { quiet = false; }
    toast('Bu oyun bitmiş. Yeni oyun hazır.');
  },
});

if (M.authority && M.resumed && M.sync.state?.phase === 'play' && (M.sync.state.plays > 0 || M.sync.state.el > 1)) {
  const s = M.sync.state;
  const seat = seatOf(s);
  resumeOpen = true;
  const turnTxt = s.players[s.turn] === me ? 'Sıra sende' : `Sıra ${bulunma(M.nameOf(s.players[s.turn], s))}`;
  closeResume = resumeCard(cover, {
    title: 'Kaldığımız yerden devam?',
    detail: `${s.el}. el · Sen ${s.total[seat]} – ${s.total[1 - seat]} · ${turnTxt}${s.at ? ` · ${agoText(Date.now() - s.at)}` : ''}`,
    onContinue: () => { resumeOpen = false; closeResume = null; shownCover = '-'; render(); },
    onNew: () => { resumeOpen = false; closeResume = null; shownCover = '-'; M.sync.dispatch({ type: 'new', no: M.sync.state.no }); },
  });
}
render();
