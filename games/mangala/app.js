// Mangala sayfası. Kurallar oyun.js'te; ev sahibi uygular, misafir niyet yollar (dama/masa.js).
// Dokun-seç-dokun-oyna: ilk dokunuş son taşın düşeceği yeri ve sonucunu gösterir, ikinci dokunuş oynar.
// Tahta kendi tarafına göre döner: senin kuyuların altta soldan sağa, hazinen sağda.
import { celebrate, toast, confirmDialog, h } from '../../js/core/ui.js';
import { lobbyUrl } from '../../js/core/identity.js';
import { sfx } from '../../js/core/sound.js';
import { logGame } from '../../js/core/db.js';
import { skorKaydet, toplamSatiri } from '../../js/core/skor.js';
import { oyunOdulu } from '../../js/core/oyun-odul.js';
import { fitToViewport } from '../hafiza/ekran.js';
import { bootMasa, agoText, bulunma, tamlayan, mountAway, resumeCard, boardSpace } from '../dama/masa.js';
import { UNKNOWN } from '../dama/kayit.js';
import * as S from './oyun.js';

const NS = 'mangala';
const OPTIMISTIC_MS = 3000;
const PEBBLES_PIT = 12;
const PEBBLES_STORE = 24;
const KURALLAR = [
  'Kendi kuyularından birine dokun. Taşların hepsi alınır; ilki aynı kuyuya, kalanı sağa doğru birer birer bırakılır.',
  'Kuyuda tek taş varsa o taş yandaki kuyuya geçer.',
  'Son taş hazinene düşerse bir kez daha oynarsın.',
  'Son taş sevgilinin kuyusundaki sayıyı çift yaparsa o kuyunun hepsi senin.',
  'Son taş kendi boş kuyuna düşerse karşısındaki taşlarla birlikte hazinene girer.',
  'Bir tarafın kuyuları boşalınca oyun biter. Önce bitiren, karşıda kalan taşları da alır. Hazinesi dolu olan kazanır.',
];

const app = document.getElementById('app');
app.innerHTML = `
  <section class="mg" id="mg" aria-label="Mangala">
    <div class="mg-plate is-opp" id="mg-opp"></div>
    <div class="mg-stage" id="mg-stage">
      <div class="mg-board is-loading" id="mg-board" role="group" aria-label="Mangala tahtası"></div>
      <div class="masa-cover mg-cover hidden" id="mg-cover"></div>
    </div>
    <div class="mg-plate is-me" id="mg-me"></div>
    <div class="mg-foot" id="mg-foot">
      <p class="mg-status" id="mg-status" role="status">Bağlanıyor…</p>
      <div class="mg-tools" id="mg-tools"></div>
    </div>
    <p class="sr-only" id="mg-live" aria-live="polite"></p>
    <div class="masa-cover hidden" id="mg-help"></div>
  </section>`;
const root = document.getElementById('mg');
const boardEl = document.getElementById('mg-board');
const stage = document.getElementById('mg-stage');
const cover = document.getElementById('mg-cover');
const oppEl = document.getElementById('mg-opp');
const meEl = document.getElementById('mg-me');
const statusEl = document.getElementById('mg-status');
const toolsEl = document.getElementById('mg-tools');
const footEl = document.getElementById('mg-foot');
const live = document.getElementById('mg-live');
const help = document.getElementById('mg-help');

const M = await bootMasa({
  ns: NS,
  title: 'Mangala',
  game: {
    reduce: S.reduce, toAction: S.toAction, seat: S.seat, isNewer: S.isNewer,
    finished: (s) => s.phase === 'end',
    fresh: (players, names) => S.initialState({ players, names, now: Date.now() }),
  },
  valid: S.validSaved,
});
const me = M.meId;

// ---------- tahta iskeleti ----------
// Görsel yer → tahta gözü. Üst sıra: rakibin kuyuları sağdan sola (5..0); alt sıra: seninkiler (0..5).
const slots = []; // { el, kind: 'pit'|'store', side: 'me'|'opp', k }
function slot(kind, side, k, area) {
  const el = document.createElement(kind === 'pit' ? 'button' : 'div');
  if (kind === 'pit') el.type = 'button';
  el.className = `mg-${kind} is-${side}`;
  el.style.gridArea = area;
  el.innerHTML = '<span class="mg-tas-alan" aria-hidden="true"></span><span class="mg-sayi" aria-hidden="true"></span>';
  boardEl.appendChild(el);
  const o = { el, kind, side, k, drawn: -1 };
  slots.push(o);
  return o;
}
slot('store', 'opp', -1, '1 / 1 / 3 / 2');
for (let c = 0; c < 6; c++) slot('pit', 'opp', 5 - c, `1 / ${c + 2} / 2 / ${c + 3}`);
for (let c = 0; c < 6; c++) slot('pit', 'me', c, `2 / ${c + 2} / 3 / ${c + 3}`);
slot('store', 'me', -1, '1 / 8 / 3 / 9');

let sel = null; // seçili kuyu (yerel 0–5)
let optimistic = null; // { s, timer }
let closeCelebrate = null;
let resumeOpen = false;
let closeResume = null;
let rulesOpen = false;
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
const otherName = (s) => nameOf(s, s.players.find((x) => x !== me) ?? s.players[1]);
function myTurn(s) {
  return !!s && s.phase === 'play' && s.players[s.turn] === me && !resumeOpen && !rulesOpen;
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
/** Görsel yerin tahta gözü (oturulan koltuğa göre). */
function indexOf(o, seat) {
  const p = o.side === 'me' ? seat : 1 - seat;
  return o.kind === 'store' ? S.storeOf(p) : S.pitIndex(p, o.k);
}

function layout() {
  const { w, h: hgt } = boardSpace(root, stage, [oppEl, meEl, footEl]);
  if (!w || !hgt) return;
  // 6 kuyu + 2 dar hazine (0,72 kuyu) = 7,44 kuyu; 7 aralık × 3 px + 2 × 8 px kenar = 37 px. Yükseklik: 2 kuyu + 19 px.
  const cell = Math.max(34, Math.min(84, Math.floor((w - 37) / 7.44), Math.floor((hgt - 19) / 2)));
  boardEl.style.setProperty('--mg-cell', `${cell}px`);
}

// ---------- çizim ----------
function pebbles(area, n, cap) {
  const shown = Math.min(n, cap);
  if (area.childElementCount === shown) return;
  const kids = [];
  for (let i = 0; i < shown; i++) kids.push(h('span', { class: `mg-tas t${i % 4}` }));
  area.replaceChildren(...kids);
}

function preview(s, k) {
  return S.sow(s.board, s.turn, k);
}

function render() {
  const s = state();
  if (!s) return;
  boardEl.classList.remove('is-loading');
  const seat = seatOf(s);
  const mine = myTurn(s);
  const legal = mine ? S.legalPits(s.board, seat) : [];
  if (sel != null && !legal.includes(sel)) sel = null;
  const aim = sel != null ? preview(s, sel) : null;
  const last = s.last;

  for (const o of slots) {
    const i = indexOf(o, seat);
    const n = s.board[i];
    const el = o.el;
    if (o.drawn !== n) {
      o.drawn = n;
      pebbles(el.children[0], n, o.kind === 'store' ? PEBBLES_STORE : PEBBLES_PIT);
      el.children[1].textContent = String(n);
    }
    const own = o.side === 'me';
    el.classList.toggle('is-empty', n === 0);
    el.classList.toggle('is-end', !!last && last.end === i && !aim);
    el.classList.toggle('is-cap', !!last && !aim && (last.capPits || []).includes(i));
    el.classList.toggle('is-aim', !!aim && aim.end === i);
    if (o.kind === 'pit') {
      el.classList.toggle('is-can', own && legal.includes(o.k));
      el.classList.toggle('is-sel', own && sel === o.k);
      el.setAttribute('aria-label', pitLabel(s, o, n, { own, sel: own && sel === o.k, aim: !!aim && aim.end === i }));
    } else {
      el.classList.toggle('is-turn', s.phase === 'play' && s.turn === (own ? seat : 1 - seat));
      el.setAttribute('role', 'img');
      el.setAttribute('aria-label', `${own ? 'Senin hazinen' : `${tamlayan(otherName(s))} hazinesi`}: ${n} taş`);
    }
  }
  boardEl.classList.toggle('is-mine', mine);

  renderPlate(oppEl, s, 1 - seat);
  renderPlate(meEl, s, seat);
  renderStatus(s, { mine, aim });
  renderTools(s);
}

function pitLabel(s, o, n, f) {
  let t = f.own ? `Senin ${o.k + 1}. kuyun` : `${tamlayan(otherName(s))} ${o.k + 1}. kuyusu`;
  t += `: ${n} taş`;
  if (f.sel) t += ', seçili; oynamak için yeniden dokun';
  if (f.aim) t += ', son taş buraya düşer';
  return t;
}

function renderPlate(el, s, p) {
  const id = s.players[p];
  const active = s.phase === 'play' && s.turn === p;
  const wins = s.tally?.[id] || 0;
  const store = s.board[S.storeOf(p)];
  el.classList.toggle('is-turn', active);
  el.replaceChildren(
    h('span', { class: `mg-swatch p${p === seatOf(s) ? 0 : 1}`, 'aria-hidden': 'true' }),
    h('span', { class: 'mg-who' },
      h('span', { class: 'mg-name' }, nameOf(s, id)),
      h('span', { class: 'mg-sub' }, `Hazine ${store} · kuyularda ${S.sideSum(s.board, p)}`)),
    h('span', { class: 'mg-wins', title: 'Galibiyet', 'aria-label': `${wins} galibiyet` }, String(wins)),
  );
}

function aimText(m) {
  if (m.over) return 'Bu hamleyle oyun biter';
  if (m.extra) return 'Son taş hazinene: bir kez daha oynarsın';
  if (m.cap) return `${m.cap} taş alırsın`;
  return 'Son taş işaretli yere düşer';
}

function renderStatus(s, { mine, aim }) {
  statusEl.classList.remove('is-alert', 'is-turn');
  if (s.phase === 'end') {
    const w = s.result?.winner;
    const sk = `${s.board[S.storeOf(seatOf(s))]}–${s.board[S.storeOf(1 - seatOf(s))]}`;
    statusEl.textContent = w === -1 ? `Berabere bitti (${sk}).` : s.players[w] === me ? `Kazandın! (${sk})` : `${nameOf(s, s.players[w])} kazandı (${sk}).`;
    return;
  }
  if (s.players[s.turn] === me) {
    statusEl.classList.add('is-turn');
    if (!mine) statusEl.textContent = 'Sıra sende';
    else if (aim) {
      statusEl.classList.add('is-alert');
      statusEl.textContent = `${aimText(aim)} · oynamak için yeniden dokun`;
    } else statusEl.textContent = s.last?.extra && s.players[s.last.by] === me ? 'Bir kez daha oyna!' : 'Sıra sende: bir kuyu seç';
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
  btns.push(h('button', { type: 'button', class: 'btn small ghost', onclick: showRules }, 'Nasıl oynanır?'));
  toolsEl.replaceChildren(...btns);
}

async function resign() {
  if (!(await confirmDialog('Teslim olmak istediğine emin misin?', { ok: 'Teslim ol' }))) return;
  M.sync.dispatch({ type: 'resign' });
}

function showRules() {
  rulesOpen = true;
  const close = () => { rulesOpen = false; help.classList.add('hidden'); help.replaceChildren(); render(); };
  const ok = h('button', { type: 'button', class: 'btn primary', onclick: close }, 'Anladım');
  help.replaceChildren(h('div', { class: 'card stack masa-card mg-rules', role: 'dialog', 'aria-labelledby': 'mg-rules-t' },
    h('h2', { class: 'masa-card-title', id: 'mg-rules-t' }, 'Mangala nasıl oynanır?'),
    h('ol', { class: 'mg-rules-list' }, KURALLAR.map((t) => h('li', {}, t))),
    h('div', { class: 'masa-card-actions' }, ok)));
  help.classList.remove('hidden');
  ok.focus({ preventScroll: true });
  render();
}

// ---------- oynama ----------
function submit(k) {
  const s = M.sync.state;
  sel = null;
  sfx('snap');
  const ok = M.sync.dispatch({ type: 'move', pit: k });
  if (!M.authority) {
    if (ok === false) {
      toast('Bağlantı yok; hamle gönderilemedi.');
    } else {
      const pre = S.reduce(s, { type: 'move', by: me, pit: k, now: s.at });
      if (pre !== s) optimistic = { s: pre, timer: setTimeout(() => { optimistic = null; render(); }, OPTIMISTIC_MS) };
    }
  }
  render();
}

function tap(o) {
  const s = state();
  if (!s || resumeOpen || rulesOpen) return;
  if (!myTurn(s)) {
    if (s.phase === 'play') {
      announce(`Sıra ${bulunma(nameOf(s, s.players[s.turn]))}`);
      nudge(o.el);
    }
    return;
  }
  if (o.side !== 'me') {
    nudge(o.el);
    toast('Kendi kuyularından birini seç (alt sıra).');
    return;
  }
  if (!S.legalPits(s.board, seatOf(s)).includes(o.k)) {
    sfx('wrong');
    nudge(o.el);
    toast('Bu kuyu boş.');
    return;
  }
  if (sel === o.k) { submit(o.k); return; }
  sel = o.k;
  sfx('tap');
  render();
  announce(aimText(preview(s, o.k)));
}

function nudge(el) {
  el?.animate?.([{ transform: 'translateX(0)' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(3px)' }, { transform: 'translateX(0)' }], { duration: 200 });
}

boardEl.addEventListener('click', (e) => {
  const el = e.target.closest('.mg-pit');
  const o = slots.find((x) => x.el === el);
  if (o) tap(o);
});

// ---------- ses, duyuru, bitiş ----------
function moveText(s) {
  const l = s.last;
  const who = nameOf(s, s.players[l.by]);
  let t = `${who}: ${l.pit + 1}. kuyu`;
  if (l.cap) t += `, ${l.cap} taş aldı`;
  if (l.extra) t += ', bir hamle daha';
  if (l.sweep) {
    const to = s.players[l.sweep.to];
    t += `, kalan ${l.sweep.n} taş ${to === me ? 'senin hazinene' : `${tamlayan(nameOf(s, to))} hazinesine`}`;
  }
  return t;
}

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
    if (s.last.cap) sfx('match');
    else if (!mineMove) sfx('snap');
    if (s.last.extra && mineMove && s.phase === 'play') sfx('tick');
    announce(moveText(s));
  }
  if (s.phase === 'end' && prev.phase !== 'end') celebrateEnd(s, info);
}

function celebrateEnd(s, info) {
  sfx('win');
  const r = s.result || {};
  const w = r.winner;
  const seat = seatOf(s);
  const hz = `${s.board[S.storeOf(seat)]}–${s.board[S.storeOf(1 - seat)]}`;
  let title, why;
  if (w === -1) {
    title = 'Berabere';
    why = `Hazineler eşit: ${hz}.`;
  } else {
    const won = s.players[w] === me;
    title = won ? 'Kazandın!' : `${nameOf(s, s.players[w])} kazandı`;
    if (r.reason === 'teslim') why = s.players[1 - w] === me ? 'Teslim oldun.' : `${nameOf(s, s.players[1 - w])} teslim oldu.`;
    else why = `Hazineler: ${hz}.`;
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
    if (prev && (prev.no !== s.no || prev.ply !== s.ply)) sel = null;
    if (s.phase !== 'play') dropResume();
    render();
    if (!quiet) effects(s, prev, info);
  },
  onPeer(here) { away.set(here); render(); },
  notify: (s, prev) => {
    // Ekstra hamlede sıra devredilmez; bildirim yalnız sıra partnere geçince gider (masa.js handedTo).
    return S.notice(prev, s, { by: me, ad: (id) => M.nameOf(id, s) });
  },
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
  const sk = `${s.board[S.storeOf(seatOf(s))]}–${s.board[S.storeOf(1 - seatOf(s))]}`;
  closeResume = resumeCard(cover, {
    title: 'Kaldığımız yerden devam?',
    detail: `Hazineler ${sk} · ${turnTxt}${s.at ? ` · ${agoText(Date.now() - s.at)}` : ''}`,
    onContinue: () => { resumeOpen = false; closeResume = null; render(); },
    onNew: () => { resumeOpen = false; closeResume = null; M.sync.dispatch({ type: 'new', no: M.sync.state.no }); },
  });
}
render();
