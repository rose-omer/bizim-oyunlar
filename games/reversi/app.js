// Reversi sayfası. Kurallar oyun.js'te; ev sahibi uygular, misafir niyet yollar (dama/masa.js).
// Yasal karelerde nokta görünür; noktaya dokunmak taşı koyar. Senin taşların vurgu renginde, sevgilininkiler mor.
import { celebrate, toast, confirmDialog, h } from '../../js/core/ui.js';
import { lobbyUrl } from '../../js/core/identity.js';
import { sfx } from '../../js/core/sound.js';
import { logGame } from '../../js/core/db.js';
import { skorKaydet, toplamSatiri } from '../../js/core/skor.js';
import { oyunOdulu } from '../../js/core/oyun-odul.js';
import { fitToViewport } from '../hafiza/ekran.js';
import { bootMasa, agoText, bulunma, mountAway, resumeCard, boardSpace } from '../dama/masa.js';
import { UNKNOWN } from '../dama/kayit.js';
import * as S from './oyun.js';

const NS = 'reversi';
const OPTIMISTIC_MS = 3000;

const app = document.getElementById('app');
app.innerHTML = `
  <section class="rv" id="rv" aria-label="Reversi">
    <div class="rv-plate is-opp" id="rv-opp"></div>
    <div class="rv-stage" id="rv-stage">
      <div class="rv-board is-loading" id="rv-board" role="group" aria-label="Reversi tahtası"></div>
      <div class="masa-cover rv-cover hidden" id="rv-cover"></div>
    </div>
    <div class="rv-plate is-me" id="rv-me"></div>
    <div class="rv-foot" id="rv-foot">
      <p class="rv-status" id="rv-status" role="status">Bağlanıyor…</p>
      <div class="rv-tools" id="rv-tools"></div>
    </div>
    <p class="sr-only" id="rv-live" aria-live="polite"></p>
  </section>`;
const root = document.getElementById('rv');
const boardEl = document.getElementById('rv-board');
const stage = document.getElementById('rv-stage');
const cover = document.getElementById('rv-cover');
const oppEl = document.getElementById('rv-opp');
const meEl = document.getElementById('rv-me');
const statusEl = document.getElementById('rv-status');
const toolsEl = document.getElementById('rv-tools');
const footEl = document.getElementById('rv-foot');
const live = document.getElementById('rv-live');

const M = await bootMasa({
  ns: NS,
  title: 'Reversi',
  game: {
    reduce: S.reduce, toAction: S.toAction, seat: S.seat, isNewer: S.isNewer,
    finished: (s) => s.phase === 'end',
    fresh: (players, names) => S.initialState({ players, names, now: Date.now() }),
  },
  valid: S.validSaved,
});
const me = M.meId;

// ---------- tahta iskeleti ----------
const cells = [];
const drawn = [];
for (let d = 0; d < 64; d++) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'rv-sq';
  b.dataset.sq = String(d);
  b.innerHTML = '<span class="rv-mark" aria-hidden="true"></span><span class="rv-disc" aria-hidden="true"></span>';
  b.children[1].addEventListener('animationend', (e) => e.currentTarget.classList.remove('is-flip'));
  boardEl.appendChild(b);
  cells.push(b);
  drawn.push(-2);
}

let optimistic = null; // { s, timer }
let closeCelebrate = null;
let resumeOpen = false;
let closeResume = null;
let quiet = false;
let lastAnnounce = '';
const away = mountAway(root, { isGuest: !M.authority, onHost: () => M.becomeHost() });

// ---------- yardımcılar ----------
function state() {
  return optimistic?.s || M.sync.state;
}
function seatOf(s) {
  const i = s.players.indexOf(me);
  return i < 0 ? 0 : i;
}
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
/** Koltuk → renk sınıfı: sen hep p0 (vurgu), sevgilin p1 (mor). */
const tone = (s, p) => (p === seatOf(s) ? 'p0' : 'p1');

function layout() {
  const { w, h: hgt } = boardSpace(root, stage, [oppEl, meEl, footEl]);
  if (!w || !hgt) return;
  const cell = Math.max(30, Math.min(72, Math.floor((Math.min(w, hgt) - 12) / 8)));
  boardEl.style.setProperty('--rv-cell', `${cell}px`);
}

// ---------- çizim ----------
function render() {
  const s = state();
  if (!s) return;
  boardEl.classList.remove('is-loading');
  const mine = myTurn(s);
  const legal = new Set(mine ? S.legalMoves(s.board, s.turn) : []);
  const flipped = new Set(s.last?.flips || []);
  for (let d = 0; d < 64; d++) {
    const b = cells[d];
    const v = s.board[d];
    const disc = b.children[1];
    const key = v === -1 ? -1 : tone(s, v) === 'p0' ? 0 : 1;
    if (drawn[d] !== key) {
      const was = drawn[d];
      drawn[d] = key;
      disc.className = `rv-disc${key === -1 ? '' : ` p${key}`}`;
      if (was >= 0 && key >= 0 && was !== key) disc.classList.add('is-flip');
    }
    b.classList.toggle('alt', ((d >> 3) + (d & 7)) % 2 === 1);
    b.classList.toggle('is-can', legal.has(d));
    b.classList.toggle('is-last', s.last?.sq === d);
    b.classList.toggle('is-flipped', flipped.has(d));
    let label = `${S.sqName(d)}: `;
    label += v === -1 ? 'boş' : v === seatOf(s) ? 'senin taşın' : 'sevgilinin taşı';
    if (legal.has(d)) label += `, buraya koyarsan ${S.flipsFor(s.board, s.turn, d).length} taş döner`;
    b.setAttribute('aria-label', label);
  }
  boardEl.classList.toggle('is-mine', mine);
  renderPlate(oppEl, s, 1 - seatOf(s));
  renderPlate(meEl, s, seatOf(s));
  renderStatus(s, mine);
  renderTools(s);
}

function renderPlate(el, s, p) {
  const id = s.players[p];
  const active = s.phase === 'play' && s.turn === p;
  const wins = s.tally?.[id] || 0;
  const n = S.counts(s.board)[p];
  el.classList.toggle('is-turn', active);
  el.replaceChildren(
    h('span', { class: `rv-swatch ${tone(s, p)}`, 'aria-hidden': 'true' }),
    h('span', { class: 'rv-who' },
      h('span', { class: 'rv-name' }, nameOf(s, id)),
      h('span', { class: 'rv-sub' }, `${n} taş${p === 0 ? ' · ilk oynayan' : ''}`)),
    h('span', { class: 'rv-wins', title: 'Galibiyet', 'aria-label': `${wins} galibiyet` }, String(wins)),
  );
}

function renderStatus(s, mine) {
  statusEl.classList.remove('is-turn', 'is-alert');
  const c = S.counts(s.board);
  const my = c[seatOf(s)], their = c[1 - seatOf(s)];
  if (s.phase === 'end') {
    const w = s.result?.winner;
    statusEl.textContent = w === -1 ? `Berabere bitti (${my}–${their}).` : s.players[w] === me ? `Kazandın! (${my}–${their})` : `${nameOf(s, s.players[w])} kazandı (${their}–${my}).`;
    return;
  }
  if (s.players[s.turn] === me) {
    statusEl.classList.add('is-turn');
    const passed = s.last?.pass != null && s.players[s.last.pass] !== me;
    if (passed && mine) {
      statusEl.classList.add('is-alert');
      statusEl.textContent = `${nameOf(s, s.players[s.last.pass])} oynayamıyor: sıra yine sende`;
    } else statusEl.textContent = mine ? 'Sıra sende: noktalı bir kareye dokun' : 'Sıra sende';
    return;
  }
  const other = nameOf(s, s.players[s.turn]);
  statusEl.textContent = M.partnerHere() ? `Sıra ${bulunma(other)}` : `Sıra ${bulunma(other)} · gelince görecek`;
}

function renderTools(s) {
  const btns = [];
  if (s.phase === 'end') {
    btns.push(h('button', { type: 'button', class: 'btn small primary', onclick: () => M.sync.dispatch({ type: 'new', no: s.no }) }, 'Rövanş'));
  } else {
    btns.push(h('button', { type: 'button', class: 'btn small ghost', onclick: resign }, 'Teslim ol'));
  }
  toolsEl.replaceChildren(...btns);
}

async function resign() {
  if (!(await confirmDialog('Teslim olmak istediğine emin misin?', { ok: 'Teslim ol' }))) return;
  M.sync.dispatch({ type: 'resign' });
}

// ---------- oynama ----------
function submit(sq) {
  const s = M.sync.state;
  sfx('snap');
  const ok = M.sync.dispatch({ type: 'move', sq });
  if (!M.authority) {
    if (ok === false) {
      toast('Bağlantı yok; hamle gönderilemedi.');
    } else {
      const pre = S.reduce(s, { type: 'move', by: me, sq, now: s.at });
      if (pre !== s) optimistic = { s: pre, timer: setTimeout(() => { optimistic = null; render(); }, OPTIMISTIC_MS) };
    }
  }
  render();
}

function nudge(el) {
  el?.animate?.([{ transform: 'translateX(0)' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(3px)' }, { transform: 'translateX(0)' }], { duration: 200 });
}

boardEl.addEventListener('click', (e) => {
  const b = e.target.closest('.rv-sq');
  const s = state();
  if (!b || !s || resumeOpen) return;
  const sq = Number(b.dataset.sq);
  if (!myTurn(s)) {
    if (s.phase === 'play') { announce(`Sıra ${bulunma(nameOf(s, s.players[s.turn]))}`); nudge(b); }
    return;
  }
  if (!S.flipsFor(s.board, s.turn, sq).length) {
    if (s.board[sq] === -1) { sfx('wrong'); nudge(b); toast('Buraya koyamazsın: taş sıkıştırmıyor.'); }
    return;
  }
  submit(sq);
});

// ---------- ses, duyuru, bitiş ----------
function effects(s, prev, info) {
  if (!prev) {
    announce(s.phase === 'play' ? (s.players[s.turn] === me ? 'Sıra sende' : `Sıra ${bulunma(nameOf(s, s.players[s.turn]))}`) : '');
    return;
  }
  if (s.no !== prev.no) {
    if (closeCelebrate) { try { closeCelebrate(); } catch { /* kapalı */ } closeCelebrate = null; }
    sfx('flip');
    const first = s.players[0] === me ? 'İlk hamle senin' : `${nameOf(s, s.players[0])} başlıyor`;
    announce(`Yeni oyun. ${first}.`);
    toast(`Yeni oyun · ${first}`);
    return;
  }
  if (s.ply > prev.ply && s.last) {
    const mineMove = s.players[s.last.by] === me;
    if (!mineMove) sfx('snap');
    let t = `${nameOf(s, s.players[s.last.by])}: ${S.sqName(s.last.sq)}, ${s.last.flips.length} taş döndü`;
    if (s.last.pass != null && s.phase === 'play') {
      t += `. ${nameOf(s, s.players[s.last.pass])} oynayamıyor, pas`;
      if (s.players[s.last.pass] === me) toast('Hamlen yok: pas geçtin');
    }
    announce(t);
  }
  if (s.phase === 'end' && prev.phase !== 'end') celebrateEnd(s, info);
}

function celebrateEnd(s, info) {
  sfx('win');
  const r = s.result || {};
  const w = r.winner;
  const c = S.counts(s.board);
  const my = c[seatOf(s)], their = c[1 - seatOf(s)];
  let title, why;
  if (w === -1) {
    title = 'Berabere';
    why = `Taşlar eşit: ${my}–${their}.`;
  } else {
    const won = s.players[w] === me;
    title = won ? 'Kazandın!' : `${nameOf(s, s.players[w])} kazandı`;
    if (r.reason === 'teslim') why = s.players[1 - w] === me ? 'Teslim oldun.' : `${nameOf(s, s.players[1 - w])} teslim oldu.`;
    else why = `Taşlar: sen ${my}, ${nameOf(s, s.players[1 - seatOf(s)])} ${their}.`;
  }
  const score = s.players.map((id) => `${nameOf(s, id)} ${s.tally?.[id] || 0}`).join(' · ');
  announce(`${title}. ${why}`);
  let kayit = null;
  if (M.authority && !info?.adopted) {
    logGame(M.roomId, NS, S.resultOf(s));
    kayit = skorKaydet(M.room, NS, { kazanan: w === -1 ? null : s.players[w] });
  }
  if (!info?.adopted) {
    // Teslim her an açık: sayfayı tek başına açıp teslim olan ödül almasın (iki taraf da oynamış olmalı).
    oyunOdulu({
      roomId: M.roomId, oyun: NS, sonuc: w === -1 ? 'beraber' : s.players[w] === me ? 'kazan' : 'kayip',
      ikiKisi: s.ply >= 2 && s.players.includes(me) && !s.players.includes(UNKNOWN), oyunNo: s.startedAt,
    });
  }
  closeCelebrate = celebrate({
    title,
    lines: [why, `Skor: ${score}`, toplamSatiri(M.room, NS, s.players, s.names, kayit)],
    buttons: [
      { label: 'Rövanş', primary: true, onClick: () => { closeCelebrate = null; M.sync.dispatch({ type: 'new', no: s.no }); } },
      { label: 'Tahtaya bak', onClick: () => { closeCelebrate = null; } },
      { label: 'Ana sayfaya dön', onClick: () => { location.href = lobbyUrl(); } },
    ],
  });
}

// ---------- başlat ----------
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
    if (s.phase !== 'play') dropResume();
    render();
    if (!quiet) effects(s, prev, info);
  },
  onPeer(here) { away.set(here); render(); },
  notify: (s, prev) => S.notice(prev, s, { by: me, ad: (id) => M.nameOf(id, s) }),
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
  const c = S.counts(s.board);
  const turnTxt = s.players[s.turn] === me ? 'Sıra sende' : `Sıra ${bulunma(M.nameOf(s.players[s.turn], s))}`;
  closeResume = resumeCard(cover, {
    title: 'Kaldığımız yerden devam?',
    detail: `Taşlar ${c[seatOf(s)]}–${c[1 - seatOf(s)]} · ${turnTxt}${s.at ? ` · ${agoText(Date.now() - s.at)}` : ''}`,
    onContinue: () => { resumeOpen = false; closeResume = null; render(); },
    onNew: () => { resumeOpen = false; closeResume = null; M.sync.dispatch({ type: 'new', no: M.sync.state.no }); },
  });
}
render();
