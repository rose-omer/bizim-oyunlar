// Kutu Kapmaca sayfası. Kurallar oyun.js'te; ev sahibi uygular, misafir niyet yollar (dama/masa.js).
// İki nokta arasına dokun, çizgi çekilir. Senin çizgilerin ve kutuların vurgu renginde, sevgilininkiler mor.
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

const NS = 'kutu';
const OPTIMISTIC_MS = 3000;
const DOT = 0.24; // nokta izi / kutu kenarı

const app = document.getElementById('app');
app.innerHTML = `
  <section class="kk" id="kk" aria-label="Kutu Kapmaca">
    <div class="kk-plate is-opp" id="kk-opp"></div>
    <div class="kk-stage" id="kk-stage">
      <div class="kk-board is-loading" id="kk-board" role="group" aria-label="Kutu Kapmaca tahtası"></div>
      <div class="masa-cover kk-cover hidden" id="kk-cover"></div>
    </div>
    <div class="kk-plate is-me" id="kk-me"></div>
    <div class="kk-foot" id="kk-foot">
      <p class="kk-status" id="kk-status" role="status">Bağlanıyor…</p>
      <div class="kk-tools" id="kk-tools"></div>
    </div>
    <p class="sr-only" id="kk-live" aria-live="polite"></p>
  </section>`;
const root = document.getElementById('kk');
const boardEl = document.getElementById('kk-board');
const stage = document.getElementById('kk-stage');
const cover = document.getElementById('kk-cover');
const oppEl = document.getElementById('kk-opp');
const meEl = document.getElementById('kk-me');
const statusEl = document.getElementById('kk-status');
const toolsEl = document.getElementById('kk-tools');
const footEl = document.getElementById('kk-foot');
const live = document.getElementById('kk-live');

const M = await bootMasa({
  ns: NS,
  title: 'Kutu Kapmaca',
  game: {
    reduce: S.reduce, toAction: S.toAction, seat: S.seat, isNewer: S.isNewer,
    finished: (s) => s.phase === 'end',
    fresh: (players, names) => S.initialState({ players, names, now: Date.now() }),
  },
  valid: S.validSaved,
});
const me = M.meId;

let built = 0; // kurulu tahta boyutu
let lineEls = [];
let boxEls = [];
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
const tone = (s, seatNo) => (seatNo === seatOf(s) ? 'p0' : 'p1');

function lineName(n, l) {
  if (l < S.hCount(n)) {
    const r = Math.floor(l / n), c = l % n;
    return `Yatay çizgi: ${r + 1}. sıra, ${c + 1}–${c + 2}. noktalar arası`;
  }
  const x = l - S.hCount(n);
  const r = Math.floor(x / (n + 1)), c = x % (n + 1);
  return `Dikey çizgi: ${c + 1}. sütun, ${r + 1}–${r + 2}. noktalar arası`;
}

function build(n) {
  built = n;
  lineEls = new Array(S.lineCount(n));
  boxEls = new Array(n * n);
  boardEl.replaceChildren();
  boardEl.style.setProperty('--kk-n', String(n));
  for (let R = 0; R < 2 * n + 1; R++) {
    for (let C = 0; C < 2 * n + 1; C++) {
      const er = R % 2 === 0, ec = C % 2 === 0;
      let el;
      if (er && ec) {
        el = h('span', { class: 'kk-dot', 'aria-hidden': 'true' });
      } else if (er || ec) {
        const l = er ? S.hLine(n, R / 2, (C - 1) / 2) : S.vLine(n, (R - 1) / 2, C / 2);
        el = h('button', { type: 'button', class: `kk-line ${er ? 'is-h' : 'is-v'}`, 'data-l': String(l) }, h('span', { class: 'kk-ink', 'aria-hidden': 'true' }));
        lineEls[l] = el;
      } else {
        const b = ((R - 1) / 2) * n + (C - 1) / 2;
        el = h('span', { class: 'kk-box', 'aria-hidden': 'true' });
        boxEls[b] = el;
      }
      el.style.gridRow = String(R + 1);
      el.style.gridColumn = String(C + 1);
      boardEl.appendChild(el);
    }
  }
  layout();
}

function layout() {
  const s = state();
  const n = s?.n || built || S.VARSAYILAN;
  const { w, h: hgt } = boardSpace(root, stage, [oppEl, meEl, footEl]);
  if (!w || !hgt) return;
  const k = Math.max(36, Math.min(96, Math.floor((Math.min(w, hgt) - 24) / (n + (n + 1) * DOT))));
  boardEl.style.setProperty('--kk-k', `${k}px`);
  boardEl.style.setProperty('--kk-d', `${Math.round(k * DOT)}px`);
}

// ---------- çizim ----------
function render() {
  const s = state();
  if (!s) return;
  if (built !== s.n) build(s.n);
  boardEl.classList.remove('is-loading');
  const mine = myTurn(s);
  const lastLine = s.last?.line ?? -1;
  const lastBoxes = new Set(s.last?.boxes || []);
  for (let l = 0; l < lineEls.length; l++) {
    const el = lineEls[l];
    const by = s.lines[l];
    el.classList.toggle('is-on', by !== -1);
    el.classList.toggle('p0', by !== -1 && tone(s, by) === 'p0');
    el.classList.toggle('p1', by !== -1 && tone(s, by) === 'p1');
    el.classList.toggle('is-last', l === lastLine);
    el.classList.toggle('is-can', mine && by === -1);
    el.setAttribute('aria-label', `${lineName(s.n, l)}${by === -1 ? ', boş' : `, ${by === seatOf(s) ? 'senin' : 'sevgilinin'}`}`);
    el.setAttribute('aria-disabled', by === -1 && mine ? 'false' : 'true');
  }
  for (let b = 0; b < boxEls.length; b++) {
    const el = boxEls[b];
    const by = s.boxes[b];
    el.classList.toggle('is-on', by !== -1);
    el.classList.toggle('p0', by !== -1 && tone(s, by) === 'p0');
    el.classList.toggle('p1', by !== -1 && tone(s, by) === 'p1');
    el.classList.toggle('is-new', lastBoxes.has(b));
    el.textContent = by === -1 ? '' : initial(M.nameOf(s.players[by], s)); // "Sen" değil, gerçek ad
  }
  boardEl.classList.toggle('is-mine', mine);
  renderPlate(oppEl, s, 1 - seatOf(s));
  renderPlate(meEl, s, seatOf(s));
  renderStatus(s, mine);
  renderTools(s);
}

function initial(name) {
  return (String(name || '?').trim()[0] || '?').toLocaleUpperCase('tr');
}

function renderPlate(el, s, p) {
  const id = s.players[p];
  const active = s.phase === 'play' && s.turn === p;
  const wins = s.tally?.[id] || 0;
  const n = S.counts(s.boxes)[p];
  el.classList.toggle('is-turn', active);
  el.replaceChildren(
    h('span', { class: `kk-swatch ${tone(s, p)}`, 'aria-hidden': 'true' }, String(n)),
    h('span', { class: 'kk-who' },
      h('span', { class: 'kk-name' }, nameOf(s, id)),
      h('span', { class: 'kk-sub' }, `${n} kutu`)),
    h('span', { class: 'kk-wins', title: 'Galibiyet', 'aria-label': `${wins} galibiyet` }, String(wins)),
  );
}

function renderStatus(s, mine) {
  statusEl.classList.remove('is-alert', 'is-turn');
  const [a, b] = S.counts(s.boxes);
  const my = seatOf(s) === 0 ? a : b, their = seatOf(s) === 0 ? b : a;
  if (s.phase === 'end') {
    const w = s.result?.winner;
    statusEl.textContent = w === -1 ? `Berabere bitti (${my}–${their}).` : s.players[w] === me ? `Kazandın! (${my}–${their})` : `${nameOf(s, s.players[w])} kazandı (${their}–${my}).`;
    return;
  }
  if (s.players[s.turn] === me) {
    statusEl.classList.add('is-turn');
    const again = s.last?.boxes?.length && s.players[s.last.by] === me;
    statusEl.textContent = !mine ? 'Sıra sende' : again ? 'Kutu senin! Bir çizgi daha çek' : 'Sıra sende: iki nokta arasına dokun';
    return;
  }
  const other = nameOf(s, s.players[s.turn]);
  statusEl.textContent = M.partnerHere() ? `Sıra ${bulunma(other)}` : `Sıra ${bulunma(other)} · gelince görecek`;
}

function renderTools(s) {
  const btns = [];
  if (s.phase === 'end') {
    btns.push(h('button', { type: 'button', class: 'btn small primary', onclick: () => M.sync.dispatch({ type: 'new', no: s.no }) }, 'Rövanş'));
  } else if (s.ply === 0) {
    btns.push(h('div', { class: 'seg kk-size', role: 'group', 'aria-label': 'Tahta boyutu' },
      S.BOYUTLAR.map((n) => h('button', {
        type: 'button', 'aria-pressed': String(s.n === n),
        onclick: () => { if (s.n !== n) { sfx('tap'); M.sync.dispatch({ type: 'size', n }); } },
      }, `${n}×${n}`))));
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
function submit(l) {
  const s = M.sync.state;
  sfx(S.closes(s, l) ? 'match' : 'snap');
  const ok = M.sync.dispatch({ type: 'line', line: l });
  if (!M.authority) {
    if (ok === false) {
      toast('Bağlantı yok; çizgi gönderilemedi.');
    } else {
      const pre = S.reduce(s, { type: 'line', by: me, line: l, now: s.at });
      if (pre !== s) optimistic = { s: pre, timer: setTimeout(() => { optimistic = null; render(); }, OPTIMISTIC_MS) };
    }
  }
  render();
}

boardEl.addEventListener('click', (e) => {
  const el = e.target.closest('.kk-line');
  const s = state();
  if (!el || !s || resumeOpen) return;
  const l = Number(el.dataset.l);
  if (!myTurn(s)) {
    if (s.phase === 'play') announce(`Sıra ${bulunma(nameOf(s, s.players[s.turn]))}`);
    return;
  }
  if (s.lines[l] !== -1) return;
  submit(l);
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
    const first = s.players[0] === me ? 'İlk çizgi senin' : `${nameOf(s, s.players[0])} başlıyor`;
    announce(`Yeni oyun. ${first}.`);
    toast(`Yeni oyun · ${first}`);
    return;
  }
  if (s.n !== prev.n && s.ply === 0) {
    announce(`Tahta ${s.n}×${s.n} oldu`);
    return;
  }
  if (s.ply > prev.ply && s.last) {
    const mineMove = s.players[s.last.by] === me;
    if (!mineMove) sfx(s.last.boxes.length ? 'pop' : 'snap');
    const who = nameOf(s, s.players[s.last.by]);
    announce(`${who}: ${lineName(s.n, s.last.line).toLocaleLowerCase('tr')}${s.last.boxes.length ? `, ${s.last.boxes.length} kutu aldı` : ''}`);
  }
  if (s.phase === 'end' && prev.phase !== 'end') celebrateEnd(s, info);
}

function celebrateEnd(s, info) {
  sfx('win');
  const r = s.result || {};
  const w = r.winner;
  const [a, b] = S.counts(s.boxes);
  const my = seatOf(s) === 0 ? a : b, their = seatOf(s) === 0 ? b : a;
  let title, why;
  if (w === -1) {
    title = 'Berabere';
    why = `Kutular eşit: ${my}–${their}.`;
  } else {
    const won = s.players[w] === me;
    title = won ? 'Kazandın!' : `${nameOf(s, s.players[w])} kazandı`;
    if (r.reason === 'teslim') why = s.players[1 - w] === me ? 'Teslim oldun.' : `${nameOf(s, s.players[1 - w])} teslim oldu.`;
    else why = `Kutular: sen ${my}, ${nameOf(s, s.players[1 - seatOf(s)])} ${their}.`;
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
  const [a, b] = S.counts(s.boxes);
  const my = seatOf(s) === 0 ? a : b, their = seatOf(s) === 0 ? b : a;
  const turnTxt = s.players[s.turn] === me ? 'Sıra sende' : `Sıra ${bulunma(M.nameOf(s.players[s.turn], s))}`;
  closeResume = resumeCard(cover, {
    title: 'Kaldığımız yerden devam?',
    detail: `Kutular ${my}–${their} · ${turnTxt}${s.at ? ` · ${agoText(Date.now() - s.at)}` : ''}`,
    onContinue: () => { resumeOpen = false; closeResume = null; render(); },
    onNew: () => { resumeOpen = false; closeResume = null; M.sync.dispatch({ type: 'new', no: M.sync.state.no }); },
  });
}
render();
