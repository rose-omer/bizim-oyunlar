// Satranç sayfası. Kurallar kurallar.js + oyun.js'te; ev sahibi uygular, misafir niyet yollar (dama/masa.js).
// Dokun-seç-dokun-bırak; olası hamle noktaları, son hamle, şah vurgusu; tahta kendi rengine göre döner.
import { celebrate, toast, confirmDialog, h } from '../../js/core/ui.js';
import { lobbyUrl } from '../../js/core/identity.js';
import { sfx } from '../../js/core/sound.js';
import { logGame } from '../../js/core/db.js';
import { skorKaydet, toplamSatiri } from '../../js/core/skor.js';
import { oyunOdulu } from '../../js/core/oyun-odul.js';
import { fitToViewport } from '../hafiza/ekran.js';
import { bootMasa, agoText, bulunma, mountAway, resumeCard, boardSpace } from '../dama/masa.js';
import { UNKNOWN } from '../dama/kayit.js';
import * as K from './kurallar.js';
import * as S from './oyun.js';
import { pieceSvg, PIECE_TR } from './taslar.js';

const NS = 'satranc';
const OPTIMISTIC_MS = 3000;
const ORDER = ['q', 'r', 'b', 'n', 'p'];
const PROMO = [['q', 'Vezir'], ['r', 'Kale'], ['b', 'Fil'], ['n', 'At']];
const END_WHY = {
  pat: 'Pat: hamle yok ama şah tehdit altında değil.',
  malzeme: 'Mat edecek taş kalmadı.',
  elli: '50 hamledir taş alınmadı, piyon oynamadı.',
  tekrar: 'Aynı konum üç kez tekrarlandı.',
  anlasma: 'Beraberlikte anlaştınız.',
};

const app = document.getElementById('app');
app.innerHTML = `
  <section class="sc" id="sc" aria-label="Satranç">
    <div class="sc-plate is-opp" id="sc-opp"></div>
    <div class="sc-stage" id="sc-stage">
      <div class="sc-board is-loading" id="sc-board" role="group" aria-label="Satranç tahtası"></div>
      <div class="masa-cover sc-cover hidden" id="sc-cover"></div>
    </div>
    <div class="sc-plate is-me" id="sc-me"></div>
    <div class="sc-foot" id="sc-foot">
      <p class="sc-status" id="sc-status" role="status">Bağlanıyor…</p>
      <div class="sc-tools" id="sc-tools"></div>
    </div>
    <p class="sr-only" id="sc-live" aria-live="polite"></p>
  </section>`;
const root = document.getElementById('sc');
const boardEl = document.getElementById('sc-board');
const stage = document.getElementById('sc-stage');
const cover = document.getElementById('sc-cover');
const oppEl = document.getElementById('sc-opp');
const meEl = document.getElementById('sc-me');
const statusEl = document.getElementById('sc-status');
const toolsEl = document.getElementById('sc-tools');
const footEl = document.getElementById('sc-foot');
const live = document.getElementById('sc-live');

const M = await bootMasa({
  ns: NS,
  title: 'Satranç',
  game: {
    reduce: S.reduce, toAction: S.toAction, seat: S.seat, isNewer: S.isNewer,
    finished: (s) => s.phase === 'end',
    fresh: (players, names) => S.initialState({ players, names, now: Date.now() }),
  },
  valid: (d) => typeof d.board === 'string' && d.board.length === 64 && Array.isArray(d.players)
    && Array.isArray(d.rep) && Array.isArray(d.caps),
});
const me = M.meId;

// ---------- tahta iskeleti ----------
const cells = [];
const drawn = []; // hücrede çizili taş (gereksiz SVG yenilemesin)
for (let d = 0; d < 64; d++) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'sc-sq';
  b.dataset.d = String(d);
  b.innerHTML = '<span class="sc-mark" aria-hidden="true"></span><span class="sc-pc" aria-hidden="true"></span><span class="sc-coord" aria-hidden="true"></span>';
  boardEl.appendChild(b);
  cells.push(b);
  drawn.push('.');
}

let sel = null; // seçili kare
let optimistic = null; // { s, timer }
let closeCelebrate = null;
let resumeOpen = false;
let closeResume = null;
let promoOpen = false;
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
const flipOf = (s) => seatOf(s) === 1;
const toSq = (d, flip) => (flip ? 63 - d : d);
function nameOf(s, id) {
  return id === me ? 'Sen' : M.nameOf(id, s);
}
const otherName = (s) => nameOf(s, s.players.find((x) => x !== me) ?? s.players[1]);
function myTurn(s) {
  return !!s && s.phase === 'play' && s.players[s.turn] === me && !resumeOpen && !promoOpen;
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
const colorWord = (c) => (c === 0 ? 'beyaz' : 'siyah');

function layout() {
  const { w, h: hgt } = boardSpace(root, stage, [oppEl, meEl, footEl]);
  if (!w || !hgt) return;
  const cell = Math.max(30, Math.floor((Math.min(w, hgt) - 10) / 8));
  boardEl.style.setProperty('--sc-cell', `${cell}px`);
}

// ---------- çizim ----------
function render() {
  const s = state();
  if (!s) return;
  boardEl.classList.remove('is-loading');
  const flip = flipOf(s);
  const seat = seatOf(s);
  const mine = myTurn(s);
  const moves = mine ? K.legalMoves(s) : [];
  if (sel != null && !moves.some((m) => m.from === sel)) sel = null;
  const targets = new Map();
  for (const m of moves) if (m.from === sel) targets.set(m.to, m);
  const movable = new Set(moves.map((m) => m.from));
  const checked = K.inCheck(s) ? K.kingSq(s.board, s.turn) : -1;
  const last = s.last;

  for (let d = 0; d < 64; d++) {
    const sq = toSq(d, flip);
    const b = cells[d];
    const r = sq >> 3, c = sq & 7;
    const ch = s.board[sq];
    const t = targets.get(sq);
    b.classList.toggle('alt', (r + c) % 2 === 1);
    b.classList.toggle('is-last', !!last && (sq === last.from || sq === last.to));
    b.classList.toggle('is-sel', sq === sel);
    b.classList.toggle('is-target', !!t);
    b.classList.toggle('is-take', !!t && !!t.cap);
    b.classList.toggle('is-check', sq === checked);
    b.classList.toggle('is-can', mine && sel == null && movable.has(sq));
    if (drawn[d] !== ch) {
      drawn[d] = ch;
      b.children[1].innerHTML = ch === '.' ? '' : pieceSvg(ch);
    }
    const coord = b.children[2];
    const name = K.sqName(sq);
    const showFile = d >= 56, showRank = d % 8 === 0;
    coord.textContent = showFile && showRank ? name : showFile ? name[0] : showRank ? name[1] : '';
    b.setAttribute('aria-label', cellLabel(s, sq, ch, { target: t, sel: sq === sel, check: sq === checked }));
  }
  boardEl.classList.toggle('is-mine', mine);

  renderPlate(oppEl, s, 1 - seat);
  renderPlate(meEl, s, seat);
  renderStatus(s, { mine, checked });
  renderTools(s);
}

function cellLabel(s, sq, ch, f) {
  let t = K.sqName(sq);
  const col = K.colorOf(ch);
  if (col >= 0) t += `: ${colorWord(col)} ${PIECE_TR[K.typeOf(ch)]}${s.players[col] === me ? ' (senin)' : ''}`;
  else t += ': boş';
  if (f.sel) t += ', seçili';
  if (f.check) t += ', şah tehdit altında';
  if (f.target) t += f.target.cap ? ', buradaki taşı alabilirsin' : ', buraya gidebilirsin';
  return t;
}

function capsRow(caps, colorOfTaken) {
  const sorted = caps.slice().sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  return sorted.map((t) => h('span', { class: 'sc-cap', html: pieceSvg(colorOfTaken === 0 ? t.toUpperCase() : t) }));
}

function renderPlate(el, s, p) {
  const id = s.players[p];
  const active = s.phase === 'play' && s.turn === p;
  const wins = s.tally?.[id] || 0;
  const mat = S.boardMaterial(s.board);
  const adv = mat[p] - mat[1 - p];
  const caps = s.caps[p] || [];
  el.classList.toggle('is-turn', active);
  el.replaceChildren(
    h('span', { class: 'sc-swatch', html: pieceSvg(p === 0 ? 'K' : 'k'), title: p === 0 ? 'Beyaz' : 'Siyah' }),
    h('span', { class: 'sc-who' },
      h('span', { class: 'sc-name' }, nameOf(s, id)),
      caps.length || adv > 0
        ? h('span', { class: 'sc-caps', 'aria-label': `${caps.length} taş aldı${adv > 0 ? `, ${adv} puan önde` : ''}` },
          capsRow(caps, 1 - p),
          adv > 0 ? h('span', { class: 'sc-adv' }, `+${adv}`) : null)
        : null),
    h('span', { class: 'sc-wins', title: 'Galibiyet', 'aria-label': `${wins} galibiyet` }, String(wins)),
  );
}

function renderStatus(s, { mine, checked }) {
  statusEl.classList.remove('is-alert', 'is-turn');
  if (s.phase === 'end') {
    const w = s.result?.winner;
    statusEl.textContent = w === -1 ? 'Berabere bitti.' : s.players[w] === me ? 'Kazandın!' : `${nameOf(s, s.players[w])} kazandı.`;
    return;
  }
  if (s.offer && s.offer !== me) {
    statusEl.classList.add('is-alert');
    statusEl.replaceChildren(
      h('span', {}, `${nameOf(s, s.offer)} beraberlik öneriyor.`),
      h('span', { class: 'sc-ask' },
        h('button', { type: 'button', class: 'btn small primary', onclick: () => reply(true) }, 'Kabul'),
        h('button', { type: 'button', class: 'btn small ghost', onclick: () => reply(false) }, 'Sürsün')));
    return;
  }
  if (s.offer === me) {
    statusEl.textContent = 'Beraberlik teklifin bekliyor…';
    return;
  }
  if (s.players[s.turn] === me) {
    statusEl.classList.add('is-turn');
    if (promoOpen) {
      statusEl.textContent = 'Piyonun yeni taşını seç';
    } else if (!mine) {
      statusEl.textContent = 'Sıra sende';
    } else if (checked >= 0) {
      statusEl.classList.add('is-alert');
      statusEl.textContent = 'Şah! Şahını korumalısın.';
    } else {
      statusEl.textContent = sel != null ? 'Gideceği kareye dokun' : 'Sıra sende';
    }
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
    const blocked = !!s.offer || (s.declined?.by === me && s.declined.ply === s.ply);
    btns.push(h('button', { type: 'button', class: 'btn small ghost', disabled: blocked, onclick: offerDraw }, 'Beraberlik öner'));
    btns.push(h('button', { type: 'button', class: 'btn small ghost', onclick: resign }, 'Teslim ol'));
  }
  toolsEl.replaceChildren(...btns);
}

function offerDraw() {
  if (M.sync.dispatch({ type: 'offer' }) === false) toast('Bağlantı yok; biraz sonra yeniden dene.');
  else toast(M.partnerHere() ? 'Beraberlik teklifin gitti' : 'Teklifin kaydedildi; sevgilin girince görecek');
}

function reply(ok) {
  sfx('tap');
  M.sync.dispatch({ type: 'offerReply', ok });
}

async function resign() {
  if (!(await confirmDialog('Teslim olmak istediğine emin misin?', { ok: 'Teslim ol' }))) return;
  M.sync.dispatch({ type: 'resign' });
}

// ---------- oynama ----------
function submit(move) {
  const s = M.sync.state;
  sel = null;
  sfx(move.cap ? 'pop' : 'snap');
  const ok = M.sync.dispatch({ type: 'move', from: move.from, to: move.to, promo: move.promo });
  if (!M.authority) {
    if (ok === false) {
      toast('Bağlantı yok; hamle gönderilemedi.');
    } else {
      const preview = S.reduce(s, { type: 'move', by: me, from: move.from, to: move.to, promo: move.promo, now: s.at });
      if (preview !== s) optimistic = { s: preview, timer: setTimeout(() => { optimistic = null; render(); }, OPTIMISTIC_MS) };
    }
  }
  render();
}

function askPromo(move) {
  const s = state();
  const color = s.turn;
  promoOpen = true;
  const close = () => { promoOpen = false; cover.classList.add('hidden'); cover.replaceChildren(); };
  const pick = (t) => { close(); submit({ ...move, promo: t }); };
  const first = h('button', { type: 'button', class: 'sc-promo-btn', onclick: () => pick('q') },
    h('span', { class: 'sc-promo-pc', html: pieceSvg(color === 0 ? 'Q' : 'q') }), 'Vezir');
  cover.replaceChildren(h('div', { class: 'card stack masa-card', role: 'dialog', 'aria-labelledby': 'sc-promo-t' },
    h('h2', { class: 'masa-card-title', id: 'sc-promo-t' }, 'Piyon neye dönüşsün?'),
    h('div', { class: 'sc-promo' },
      first,
      PROMO.slice(1).map(([t, label]) => h('button', { type: 'button', class: 'sc-promo-btn', onclick: () => pick(t) },
        h('span', { class: 'sc-promo-pc', html: pieceSvg(color === 0 ? t.toUpperCase() : t) }), label))),
    h('button', { type: 'button', class: 'btn ghost small', onclick: () => { close(); sel = null; render(); } }, 'Vazgeç')));
  cover.classList.remove('hidden');
  first.focus({ preventScroll: true });
  render();
}

function tap(sq) {
  const s = state();
  if (!s || resumeOpen || promoOpen) return;
  if (!myTurn(s)) {
    if (s.phase === 'play') {
      announce(`Sıra ${bulunma(nameOf(s, s.players[s.turn]))}`);
      nudge(sq);
    }
    return;
  }
  const moves = K.legalMoves(s);
  if (sel != null) {
    const ms = moves.filter((m) => m.from === sel && m.to === sq);
    if (ms.length > 1) { askPromo(ms[0]); return; }
    if (ms.length === 1) { submit(ms[0]); return; }
  }
  if (K.colorOf(s.board[sq]) === s.turn) {
    if (moves.some((m) => m.from === sq)) {
      sel = sel === sq ? null : sq;
      sfx('tap');
    } else {
      sel = null;
      sfx('wrong');
      nudge(sq);
      toast(K.inCheck(s) ? 'Şahın tehdit altında: önce onu kurtar.' : 'Bu taşın gidebileceği kare yok.');
    }
    render();
    return;
  }
  if (sel != null) { sel = null; render(); }
}

function nudge(sq) {
  const d = cells.findIndex((c, i) => toSq(i, flipOf(state())) === sq);
  cells[d]?.animate?.([{ transform: 'translateX(0)' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(3px)' }, { transform: 'translateX(0)' }], { duration: 200 });
}

boardEl.addEventListener('click', (e) => {
  const b = e.target.closest('.sc-sq');
  const s = state();
  if (!b || !s) return;
  tap(toSq(Number(b.dataset.d), flipOf(s)));
});

// ---------- ses, duyuru, bitiş ----------
function moveText(s) {
  const l = s.last;
  const who = nameOf(s, s.players[l.by]);
  const piece = PIECE_TR[K.typeOf(s.board[l.to])];
  let t = l.flag === 'O-O' ? `${who}: kısa rok` : l.flag === 'O-O-O' ? `${who}: uzun rok`
    : `${who}: ${l.promo ? 'piyon' : piece} ${K.sqName(l.from)} → ${K.sqName(l.to)}`;
  if (l.cap) t += `, ${PIECE_TR[l.cap]} aldı`;
  if (l.promo) t += `, ${piece} oldu`;
  if (l.check) t += ', şah!';
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
    const first = s.players[0] === me ? 'Beyazlar sende, sen başlıyorsun' : `${nameOf(s, s.players[0])} beyazla başlıyor`;
    announce(`Yeni oyun. ${first}.`);
    toast(`Yeni oyun · ${first}`);
    return;
  }
  if (s.ply > prev.ply && s.last) {
    if (s.players[s.last.by] !== me) sfx(s.last.cap ? 'pop' : 'snap');
    if (s.last.check && s.phase === 'play') sfx('tick');
    announce(moveText(s));
  }
  if (s.offer && s.offer !== me && !prev.offer) sfx('pop');
  if (prev.offer === me && !s.offer && s.phase === 'play' && s.ply === prev.ply) toast(`${otherName(s)} beraberliği kabul etmedi`);
  if (s.phase === 'end' && prev.phase !== 'end') celebrateEnd(s, info);
}

function celebrateEnd(s, info) {
  sfx('win');
  const r = s.result || {};
  const w = r.winner;
  let title, why;
  if (w === -1) {
    title = 'Berabere';
    why = END_WHY[r.reason] || 'Oyun berabere bitti.';
  } else {
    const won = s.players[w] === me;
    title = won ? 'Kazandın!' : `${nameOf(s, s.players[w])} kazandı`;
    if (r.reason === 'mat') why = won ? 'Şah mat! Ne hamleydi.' : 'Şah mat.';
    else why = s.players[1 - w] === me ? 'Teslim oldun.' : `${nameOf(s, s.players[1 - w])} teslim oldu.`;
  }
  const score = s.players.map((id) => `${nameOf(s, id)} ${s.tally?.[id] || 0}`).join(' · ');
  announce(`${title}. ${why}`);
  let kayit = null;
  if (M.authority && !info?.adopted) {
    logGame(M.roomId, NS, S.resultOf(s));
    kayit = skorKaydet(M.room, NS, { kazanan: w === -1 ? null : s.players[w] });
  }
  if (!info?.adopted) {
    // Teslim her an açık, partner yokken de: sayfayı tek başına açıp teslim olan ödül almasın (iki taraf da oynamış olmalı).
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
  const turnTxt = s.players[s.turn] === me ? 'Sıra sende' : `Sıra ${bulunma(M.nameOf(s.players[s.turn], s))}`;
  closeResume = resumeCard(cover, {
    title: 'Kaldığımız yerden devam?',
    detail: `${s.full}. hamle · ${turnTxt}${s.at ? ` · ${agoText(Date.now() - s.at)}` : ''}`,
    onContinue: () => { resumeOpen = false; closeResume = null; render(); },
    onNew: () => { resumeOpen = false; closeResume = null; M.sync.dispatch({ type: 'new', no: M.sync.state.no }); },
  });
}
render();
