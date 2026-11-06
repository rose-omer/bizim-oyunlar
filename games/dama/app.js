// Dama sayfası. Kurallar oyun.js'te; ev sahibi uygular, misafir niyet yollar (masa.js + hafiza/sync.js).
import { celebrate, toast, confirmDialog, h } from '../../js/core/ui.js';
import { lobbyUrl } from '../../js/core/identity.js';
import { sfx } from '../../js/core/sound.js';
import { logGame } from '../../js/core/db.js';
import { skorKaydet, toplamSatiri } from '../../js/core/skor.js';
import { oyunOdulu } from '../../js/core/oyun-odul.js';
import { fitToViewport } from '../hafiza/ekran.js';
import { bootMasa, agoText, bulunma, tamlayan, mountAway, resumeCard, boardSpace } from './masa.js';
import { UNKNOWN } from './kayit.js';
import * as D from './oyun.js';

const NS = 'dama';
const OPTIMISTIC_MS = 3000;
const CROWN = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3.5 8.5 7.8 12 12 5.5l4.2 6.5 4.3-3.5-1.8 9.5H5.3z"/><path d="M5.6 19.6h12.8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

const app = document.getElementById('app');
app.innerHTML = `
  <section class="dm" id="dm" aria-label="Dama">
    <div class="dm-plate is-opp" id="dm-opp"></div>
    <div class="dm-stage" id="dm-stage">
      <div class="dm-board is-loading" id="dm-board" role="group" aria-label="Dama tahtası"></div>
      <div class="masa-cover dm-cover hidden" id="dm-cover"></div>
    </div>
    <div class="dm-plate is-me" id="dm-me"></div>
    <div class="dm-foot" id="dm-foot">
      <p class="dm-status" id="dm-status" role="status">Bağlanıyor…</p>
      <div class="dm-tools" id="dm-tools"></div>
    </div>
    <p class="sr-only" id="dm-live" aria-live="polite"></p>
  </section>`;
const root = document.getElementById('dm');
const boardEl = document.getElementById('dm-board');
const stage = document.getElementById('dm-stage');
const cover = document.getElementById('dm-cover');
const oppEl = document.getElementById('dm-opp');
const meEl = document.getElementById('dm-me');
const statusEl = document.getElementById('dm-status');
const toolsEl = document.getElementById('dm-tools');
const footEl = document.getElementById('dm-foot');
const live = document.getElementById('dm-live');

const M = await bootMasa({
  ns: NS,
  title: 'Dama',
  game: {
    reduce: D.reduce, toAction: D.toAction, seat: D.seat, isNewer: D.isNewer,
    finished: (s) => s.phase === 'end',
    fresh: (players, names) => D.initialState({ players, names, now: Date.now() }),
  },
  valid: (d) => typeof d.board === 'string' && d.board.length === 64 && Array.isArray(d.players),
});
const me = M.meId;

// ---------- tahta iskeleti ----------
const cells = [];
for (let d = 0; d < 64; d++) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'dm-sq';
  b.dataset.d = String(d);
  b.innerHTML = '<span class="dm-mark" aria-hidden="true"></span><span class="dm-pc" aria-hidden="true"></span><span class="dm-coord" aria-hidden="true"></span>';
  boardEl.appendChild(b);
  cells.push(b);
}

let sel = null; // { from, prefix: [] }
let optimistic = null; // { s, timer }
let closeCelebrate = null;
let resumeOpen = false;
let closeResume = null;
let quiet = false; // bayat kayıt bırakılırken ses/duyuru yok
let lastAnnounce = '';
const away = mountAway(root, {
  isGuest: !M.authority,
  onHost: () => M.becomeHost(),
});

// ---------- yardımcılar ----------
function state() {
  return optimistic?.s || M.sync.state;
}
function seatOf(s) {
  const i = s.players.indexOf(me);
  return i < 0 ? 0 : i;
}
const flipOf = (s) => seatOf(s) === 1;
const toSq = (d, flip) => (flip ? 63 - d : d);
function nameOf(s, id) {
  return id === me ? 'Sen' : M.nameOf(id, s);
}
function myTurn(s) {
  return !!s && s.phase === 'play' && s.players[s.turn] === me && !resumeOpen;
}
function announce(text) {
  if (!text || text === lastAnnounce) return;
  lastAnnounce = text;
  live.textContent = text;
}
function clearOptimistic() {
  if (!optimistic) return;
  clearTimeout(optimistic.timer);
  optimistic = null;
}

function layout() {
  const { w, h: hgt } = boardSpace(root, stage, [oppEl, meEl, footEl]);
  if (!w || !hgt) return;
  const cell = Math.max(30, Math.floor((Math.min(w, hgt) - 10) / 8)); // 10 = tahta çerçevesi
  boardEl.style.setProperty('--dm-cell', `${cell}px`);
}

// Seçili taş için aday hamleler (önek yola uyanlar).
function candidates(s) {
  if (!sel || !myTurn(s)) return [];
  return D.legalMoves(s.board, s.turn).filter((m) => m.from === sel.from && sel.prefix.every((x, i) => m.path[i] === x));
}

// ---------- çizim ----------
function render() {
  const s = state();
  if (!s) return;
  boardEl.classList.remove('is-loading');
  const flip = flipOf(s);
  const seat = seatOf(s);
  const mine = myTurn(s);
  const moves = mine ? D.legalMoves(s.board, s.turn) : [];
  const must = moves.length > 0 && moves[0].caps.length > 0;
  const movable = new Set(moves.map((m) => m.from));
  const cands = candidates(s);
  const step = sel ? sel.prefix.length : 0;
  const next = new Set(cands.map((m) => m.path[step]));
  const finals = new Set(cands.map((m) => m.path[m.path.length - 1]));

  // Zincir önizlemesi: seçili taş öneğin sonunda, yenenler soluk.
  let board = s.board;
  const taken = new Set();
  if (sel && sel.prefix.length && cands.length) {
    const b = board.split('');
    const ch = b[sel.from];
    b[sel.from] = '.';
    for (let i = 0; i < sel.prefix.length; i++) taken.add(cands[0].caps[i]);
    b[sel.prefix[sel.prefix.length - 1]] = ch;
    board = b.join('');
  }
  const selAt = sel ? (sel.prefix.length ? sel.prefix[sel.prefix.length - 1] : sel.from) : -1;

  const last = s.last;
  const lastPath = new Set(last ? last.path : []);
  const lastCaps = new Set(last ? last.caps : []);
  const lastTo = last ? last.path[last.path.length - 1] : -1;

  for (let d = 0; d < 64; d++) {
    const sq = toSq(d, flip);
    const b = cells[d];
    const r = D.rowOf(sq), c = D.colOf(sq);
    const ch = taken.has(sq) ? s.board[sq] : board[sq];
    const own = D.ownerOf(ch);
    b.classList.toggle('alt', (r + c) % 2 === 1);
    b.classList.toggle('is-last-from', !!last && sq === last.from && !sel);
    b.classList.toggle('is-last-path', lastPath.has(sq) && sq !== lastTo && !sel);
    b.classList.toggle('is-last-to', sq === lastTo && !sel);
    b.classList.toggle('is-last-cap', lastCaps.has(sq) && !sel && own < 0);
    b.classList.toggle('is-sel', sq === selAt);
    b.classList.toggle('is-next', next.has(sq));
    b.classList.toggle('is-final', finals.has(sq) && !next.has(sq));
    b.classList.toggle('is-capture-land', next.has(sq) && must);
    b.classList.toggle('is-can', !sel && movable.has(sq));
    b.classList.toggle('is-must', must && !sel && movable.has(sq));
    const pc = b.children[1];
    pc.className = 'dm-pc';
    if (own >= 0) {
      pc.classList.add(own === 0 ? 'p0' : 'p1');
      if (D.isKing(ch)) pc.classList.add('king');
      if (taken.has(sq)) pc.classList.add('taken');
      pc.innerHTML = D.isKing(ch) ? CROWN : '';
    } else {
      pc.innerHTML = '';
    }
    // kenar koordinatları: alt sıra harf, sol sütun rakam (bakan oyuncuya göre)
    const coord = b.children[2];
    const showFile = d >= 56, showRank = d % 8 === 0;
    coord.textContent = showFile && showRank ? D.squareName(sq) : showFile ? D.squareName(sq)[0] : showRank ? D.squareName(sq).slice(1) : '';
    b.setAttribute('aria-label', cellLabel(s, sq, ch, { next: next.has(sq), sel: sq === selAt, can: movable.has(sq) }));
  }
  boardEl.classList.toggle('is-mine', mine);
  boardEl.classList.toggle('is-locked', !mine);

  renderPlate(oppEl, s, 1 - seat);
  renderPlate(meEl, s, seat);
  renderStatus(s, { mine, must });
  renderTools(s);
}

function cellLabel(s, sq, ch, f) {
  const own = D.ownerOf(ch);
  let t = D.squareName(sq);
  if (own >= 0) {
    const king = D.isKing(ch);
    t += s.players[own] === me
      ? `: senin ${king ? 'daman' : 'taşın'}`
      : `: ${tamlayan(nameOf(s, s.players[own]))} ${king ? 'daması' : 'taşı'}`;
  } else t += ': boş';
  if (f.sel) t += ', seçili';
  if (f.next) t += ', buraya gidebilirsin';
  else if (f.can) t += ', oynayabilir';
  return t;
}

function renderPlate(el, s, p) {
  const id = s.players[p];
  const n = D.countPieces(s.board)[p];
  const left = n.men + n.kings;
  const active = s.phase === 'play' && s.turn === p;
  const wins = s.tally?.[id] || 0;
  el.classList.toggle('is-turn', active);
  el.replaceChildren(
    h('span', { class: `dm-swatch ${p === 0 ? 'p0' : 'p1'}`, 'aria-hidden': 'true' }),
    h('span', { class: 'dm-name' }, nameOf(s, id)),
    h('span', { class: 'dm-count' }, `${left} taş${n.kings ? ` · ${n.kings} dama` : ''}`),
    h('span', { class: 'dm-wins', title: 'Galibiyet', 'aria-label': `${wins} galibiyet` }, String(wins)),
  );
}

function renderStatus(s, { mine, must }) {
  statusEl.classList.remove('is-alert', 'is-turn');
  if (s.phase === 'end') {
    const w = s.result?.winner;
    statusEl.textContent = w === -1 ? 'Berabere bitti.' : s.players[w] === me ? 'Kazandın!' : `${nameOf(s, s.players[w])} kazandı.`;
    return;
  }
  if (s.undoReq && s.undoReq !== me) {
    statusEl.classList.add('is-alert');
    statusEl.replaceChildren(
      h('span', {}, `${nameOf(s, s.undoReq)} son hamlesini geri almak istiyor.`),
      h('span', { class: 'dm-ask' },
        h('button', { type: 'button', class: 'btn small primary', onclick: () => M.sync.dispatch({ type: 'undoReply', ok: true }) }, 'Olur'),
        h('button', { type: 'button', class: 'btn small ghost', onclick: () => M.sync.dispatch({ type: 'undoReply', ok: false }) }, 'Hayır')));
    return;
  }
  if (s.undoReq === me) {
    statusEl.textContent = 'Geri alma isteğin bekliyor…';
    return;
  }
  if (mine) {
    statusEl.classList.add('is-turn');
    if (sel && sel.prefix.length) statusEl.textContent = 'Yemeye devam: sıradaki kareye dokun.';
    else statusEl.textContent = must ? 'Sıra sende · yeme zorunlu (en çok taş alan yol)' : 'Sıra sende';
    if (must) statusEl.classList.add('is-alert');
    return;
  }
  const other = s.players[s.turn];
  const otherName = nameOf(s, other);
  statusEl.textContent = M.partnerHere() ? `Sıra ${bulunma(otherName)}` : `Sıra ${bulunma(otherName)} · gelince görecek`;
}

function renderTools(s) {
  const btns = [];
  const canAsk = s.phase === 'play' && s.prev?.by === me && !s.undoReq && s.players[s.turn] !== me;
  if (canAsk) {
    btns.push(h('button', { type: 'button', class: 'btn small ghost', onclick: askUndo }, 'Geri al'));
  }
  if (sel && sel.prefix.length) {
    btns.push(h('button', { type: 'button', class: 'btn small ghost', onclick: () => { sel = null; render(); } }, 'Vazgeç'));
  }
  if (s.phase === 'end') {
    btns.push(h('button', { type: 'button', class: 'btn small primary', onclick: () => M.sync.dispatch({ type: 'new', no: s.no }) }, 'Rövanş'));
  } else {
    btns.push(h('button', { type: 'button', class: 'btn small ghost', onclick: newGame }, 'Yeni oyun'));
  }
  toolsEl.replaceChildren(...btns);
}

async function newGame() {
  const s = M.sync.state;
  if (!s) return;
  if (s.phase === 'play' && s.ply > 0 && !(await confirmDialog('Bu oyunu bırakıp yeni oyuna başlayalım mı?', { ok: 'Yeni oyun' }))) return;
  sel = null;
  M.sync.dispatch({ type: 'new', no: s.no });
}

function askUndo() {
  if (M.sync.dispatch({ type: 'undoAsk' }) === false) toast('Bağlantı yok; biraz sonra yeniden dene.');
  else toast(M.partnerHere() ? 'Geri alma isteği gönderildi' : 'İstek kaydedildi; sevgilin girince görecek');
}

// ---------- oynama ----------
function submit(move) {
  const s = M.sync.state;
  sel = null;
  sfx(move.caps.length ? 'pop' : 'snap');
  const ok = M.sync.dispatch({ type: 'move', from: move.from, path: move.path });
  if (!M.authority) {
    if (ok === false) {
      toast('Bağlantı yok; hamle gönderilemedi.');
    } else {
      const preview = D.reduce(s, { type: 'move', by: me, from: move.from, path: move.path, now: s.at });
      if (preview !== s) optimistic = { s: preview, timer: setTimeout(() => { optimistic = null; render(); }, OPTIMISTIC_MS) };
    }
  }
  render();
}

// Hedef kareye git: zincirde sıradaki kare ya da tek yolun son karesi. -> işlendi mi
function goTo(sq) {
  const s = state();
  const cands = candidates(s);
  if (!cands.length) return false;
  const step = sel.prefix.length;
  if (cands.some((m) => m.path[step] === sq)) {
    sel.prefix.push(sq);
    const done = cands.filter((m) => m.path.length === sel.prefix.length && m.path[step] === sq);
    if (done.length) { submit(done[0]); return true; }
    sfx('tap');
    render();
    return true;
  }
  const ends = cands.filter((m) => m.path[m.path.length - 1] === sq);
  if (ends.length === 1) { submit(ends[0]); return true; }
  return false;
}

function tap(sq) {
  const s = state();
  if (!s || resumeOpen) return;
  if (!myTurn(s)) {
    if (s.phase === 'play') {
      announce(`Sıra ${bulunma(nameOf(s, s.players[s.turn]))}`);
      nudge(sq);
    }
    return;
  }
  if (sel && goTo(sq)) return;
  if (sel && sel.prefix.length) { nudge(sq); return; } // zincir ortasında başka taşa geçilmez
  const moves = D.legalMoves(s.board, s.turn);
  if (moves.some((m) => m.from === sq)) {
    sel = sel && sel.from === sq ? null : { from: sq, prefix: [] };
    sfx('tap');
    render();
    return;
  }
  if (D.ownerOf(s.board[sq]) === s.turn && moves.length && moves[0].caps.length) {
    sfx('wrong');
    toast('Yeme zorunlu: parlayan taşlardan biriyle ye.');
  }
  if (sel) { sel = null; render(); }
}

function nudge(sq) {
  const d = cells.findIndex((c, i) => toSq(i, flipOf(state())) === sq);
  cells[d]?.animate?.([{ transform: 'translateX(0)' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(3px)' }, { transform: 'translateX(0)' }], { duration: 200 });
}

// Dokun-seç-dokun-git (click) ve sürükle-bırak (pointer).
let drag = null;
let suppressClick = false;
boardEl.addEventListener('click', (e) => {
  const b = e.target.closest('.dm-sq');
  if (!b) return;
  if (suppressClick) { suppressClick = false; return; }
  const s = state();
  if (!s) return;
  tap(toSq(Number(b.dataset.d), flipOf(s)));
});

boardEl.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  const b = e.target.closest('.dm-sq');
  const s = state();
  if (!b || !s || !myTurn(s)) return;
  const sq = toSq(Number(b.dataset.d), flipOf(s));
  const atSel = sel && (sel.prefix.length ? sel.prefix[sel.prefix.length - 1] : sel.from) === sq;
  const canStart = atSel || (!sel?.prefix.length && D.legalMoves(s.board, s.turn).some((m) => m.from === sq));
  if (!canStart) return;
  drag = { id: e.pointerId, sq, x: e.clientX, y: e.clientY, on: false, ghost: null, cell: b };
});

boardEl.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  if (!drag.on) {
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 8) return;
    drag.on = true;
    if (!sel || (sel.from !== drag.sq && !sel.prefix.includes(drag.sq))) sel = { from: drag.sq, prefix: [] };
    render();
    const pc = drag.cell.querySelector('.dm-pc');
    const r = pc.getBoundingClientRect();
    drag.ghost = pc.cloneNode(true);
    drag.ghost.classList.add('dm-ghost');
    drag.ghost.style.width = `${r.width}px`;
    drag.ghost.style.height = `${r.height}px`;
    drag.w = r.width;
    document.body.appendChild(drag.ghost);
    pc.classList.add('lifted');
    try { boardEl.setPointerCapture(e.pointerId); } catch { /* yok */ }
  }
  drag.ghost.style.transform = `translate(${e.clientX - drag.w / 2}px, ${e.clientY - drag.w / 2}px)`;
  e.preventDefault();
});

function endDrag(e, cancel) {
  if (!drag || e.pointerId !== drag.id) return;
  const d = drag;
  drag = null;
  if (!d.on) return;
  suppressClick = true;
  setTimeout(() => { suppressClick = false; }, 0);
  d.ghost?.remove();
  d.cell.querySelector('.dm-pc')?.classList.remove('lifted');
  if (cancel) { render(); return; }
  const el = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.dm-sq');
  const s = state();
  if (el && s && sel) {
    const sq = toSq(Number(el.dataset.d), flipOf(s));
    if (goTo(sq)) return;
  }
  render();
}
boardEl.addEventListener('pointerup', (e) => endDrag(e, false));
boardEl.addEventListener('pointercancel', (e) => endDrag(e, true));

// ---------- ses, duyuru, bitiş ----------
function effects(s, prev, info) {
  if (!prev) {
    announce(s.phase === 'play' ? (s.players[s.turn] === me ? 'Sıra sende' : `Sıra ${bulunma(nameOf(s, s.players[s.turn]))}`) : '');
    return;
  }
  if (s.no !== prev.no) {
    if (closeCelebrate) { try { closeCelebrate(); } catch { /* kapalı */ } closeCelebrate = null; }
    sfx('flip');
    const first = s.players[0] === me ? 'Sen başlıyorsun' : `${nameOf(s, s.players[0])} başlıyor`;
    announce(`Yeni oyun. ${first}.`);
    toast(`Yeni oyun · ${first}`);
    return;
  }
  if (s.ply > prev.ply && s.last && s.players[s.last.by] !== me) {
    sfx(s.last.caps.length ? 'pop' : 'snap');
    const to = s.last.path[s.last.path.length - 1];
    const who = nameOf(s, s.players[s.last.by]);
    announce(`${who} ${D.squareName(s.last.from)} → ${D.squareName(to)}${s.last.caps.length ? `, ${s.last.caps.length} taş aldı` : ''}`);
  }
  if (s.ply < prev.ply) {
    toast(prev.undoReq === me ? 'Hamlen geri alındı' : 'Son hamle geri alındı');
  } else if (prev.undoReq === me && !s.undoReq && s.ply === prev.ply) {
    toast(`${nameOf(s, s.players.find((x) => x !== me))} geri almayı kabul etmedi`);
  } else if (s.undoReq && s.undoReq !== me && !prev.undoReq) {
    sfx('pop');
  }
  if (s.phase === 'end' && prev.phase !== 'end') celebrateEnd(s, info);
}

function celebrateEnd(s, info) {
  sfx('win');
  const r = s.result || {};
  const w = r.winner;
  const loserSeat = w === 0 ? 1 : 0;
  const loser = s.players[loserSeat];
  let title, why;
  if (w === -1) {
    title = 'Berabere 🤝';
    why = 'İki tarafta da birer dama kaldı.';
  } else {
    title = s.players[w] === me ? 'Kazandın! 🎉' : `${nameOf(s, s.players[w])} kazandı 🎉`;
    if (loser === me) why = r.reason === 'tas' ? 'Taşın kalmadı.' : 'Oynayacak hamlen kalmadı.';
    else {
      const whose = tamlayan(nameOf(s, loser));
      why = r.reason === 'tas' ? `${whose} taşı kalmadı.` : `${whose} oynayacak hamlesi kalmadı.`;
    }
  }
  const score = s.players.map((id) => `${nameOf(s, id)} ${s.tally?.[id] || 0}`).join(' · ');
  announce(`${title} ${why}`);
  let kayit = null;
  if (M.authority && !info?.adopted) {
    logGame(M.roomId, NS, D.resultOf(s));
    kayit = skorKaydet(M.room, NS, { kazanan: w === -1 ? null : s.players[w] });
  }
  if (!info?.adopted) {
    oyunOdulu({
      roomId: M.roomId, oyun: NS, sonuc: w === -1 ? 'beraber' : s.players[w] === me ? 'kazan' : 'kayip',
      ikiKisi: s.players.includes(me) && !s.players.includes(UNKNOWN), oyunNo: s.startedAt,
    });
  }
  closeCelebrate = celebrate({
    title,
    lines: [why, `Skor: ${score}`, toplamSatiri(M.room, NS, s.players, s.names, kayit)],
    buttons: [
      { label: 'Rövanş', primary: true, onClick: () => { closeCelebrate = null; M.sync.dispatch({ type: 'new', no: s.no }); } },
      { label: 'Ana sayfaya dön', onClick: () => { location.href = lobbyUrl(); } },
    ],
  });
}

// ---------- başlat (tüm tanımlardan sonra) ----------
fitToViewport(root, layout);
if ('ResizeObserver' in window) {
  const ro = new ResizeObserver(() => layout());
  ro.observe(stage);
  ro.observe(footEl);
}

function dropResume() {
  if (!resumeOpen) return;
  resumeOpen = false;
  closeResume?.();
  closeResume = null;
}

M.start({
  onState(s, prev, info) {
    clearOptimistic();
    if (prev && (prev.no !== s.no || prev.ply !== s.ply)) sel = null;
    if (s.phase !== 'play') dropResume(); // bitmiş oyun "Devam et" ile sunulmaz
    render();
    if (!quiet) effects(s, prev, info);
  },
  onPeer(here) { away.set(here); render(); },
  notify: (s, prev) => D.notice(prev, s, { by: me, ad: (id) => M.nameOf(id, s) }),
  // Kayıt arkada silindi (oyun öbür cihazda bitti): sunulan "devam" bayat; boş oyuna dön.
  onGone() {
    if (!resumeOpen) return;
    dropResume();
    quiet = true;
    try { M.fresh(); } finally { quiet = false; }
    toast('Bu oyun bitmiş. Yeni oyun hazır.');
  },
});

if (M.authority && M.resumed && M.sync.state?.phase === 'play' && M.sync.state.ply > 0) {
  const s = M.sync.state;
  resumeOpen = true;
  const turnTxt = s.players[s.turn] === me ? 'Sıra sende' : `Sıra ${bulunma(M.nameOf(s.players[s.turn], s))}`;
  closeResume = resumeCard(cover, {
    title: 'Kaldığımız yerden devam?',
    detail: `${s.ply}. hamle · ${turnTxt}${s.at ? ` · ${agoText(Date.now() - s.at)}` : ''}`,
    onContinue: () => { resumeOpen = false; closeResume = null; render(); },
    onNew: () => { resumeOpen = false; closeResume = null; M.sync.dispatch({ type: 'new', no: M.sync.state.no }); },
  });
}
render();
