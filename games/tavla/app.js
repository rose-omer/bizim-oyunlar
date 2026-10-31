// Tavla sayfası. Kurallar oyun.js'te; ev sahibi uygular (zar dahil), misafir niyet yollar.
import { celebrate, toast, confirmDialog, h } from '../../js/core/ui.js';
import { lobbyUrl } from '../../js/core/identity.js';
import { sfx } from '../../js/core/sound.js';
import { logGame } from '../../js/core/db.js';
import { skorKaydet, toplamSatiri } from '../../js/core/skor.js';
import { fitToViewport } from '../hafiza/ekran.js';
import { bootMasa, agoText, bulunma, mountAway, resumeCard, boardSpace } from '../dama/masa.js';
import * as T from './oyun.js';
import { boardSvg, relOf, W as BOARD_W, H as BOARD_H } from './tahta.js';

const NS = 'tavla';
const OPTIMISTIC_MS = 3000;
const AUTO_MS = 700;   // tek seçenek kendiliğinden oynanmadan önce
const ROLL_MS = 650;   // zar animasyonu

const app = document.getElementById('app');
app.innerHTML = `
  <section class="tv" id="tv" aria-label="Tavla">
    <div class="tv-plate is-opp" id="tv-opp"></div>
    <div class="tv-stage" id="tv-stage">
      <div class="tv-board is-loading" id="tv-board"></div>
      <div class="masa-cover tv-cover hidden" id="tv-cover"></div>
    </div>
    <div class="tv-plate is-me" id="tv-me"></div>
    <div class="tv-foot" id="tv-foot">
      <p class="tv-status" id="tv-status" role="status">Bağlanıyor…</p>
      <div class="tv-actions" id="tv-actions"></div>
    </div>
    <p class="sr-only" id="tv-live" aria-live="polite"></p>
  </section>`;
const root = document.getElementById('tv');
const stage = document.getElementById('tv-stage');
const boardEl = document.getElementById('tv-board');
const cover = document.getElementById('tv-cover');
const oppEl = document.getElementById('tv-opp');
const meEl = document.getElementById('tv-me');
const statusEl = document.getElementById('tv-status');
const actionsEl = document.getElementById('tv-actions');
const footEl = document.getElementById('tv-foot');
const live = document.getElementById('tv-live');

const M = await bootMasa({
  ns: NS,
  title: 'Tavla',
  game: {
    reduce: T.reduce, toAction: T.toAction, schedule: T.schedule, view: T.view, seat: T.seat, isNewer: T.isNewer,
    finished: (s) => s.phase === 'matchover',
    fresh: (players, names) => T.initialState({ players, names, now: Date.now() }),
  },
  valid: (d) => Array.isArray(d.points) && d.points.length === 24 && Array.isArray(d.players),
});
const me = M.meId;

let sel = null;          // seçili pulun yeri (hane | BAR)
let optimistic = null;   // { s, timer }
let rolling = null;      // animasyondaki zar yüzleri
let rollTimer = 0;
let autoTimer = 0;
let autoKey = '';
let closeCelebrate = null;
let resumeOpen = false;
let closeResume = null;
let quiet = false;       // bayat kayıt bırakılırken ses/duyuru yok
let target = 5;          // kurulum ekranındaki seçim
let choosing = false;    // oyun sürerken yeni maç için hedef seçiliyor
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
  return !!s && s.players[s.turn] === me && !resumeOpen;
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
// Bakan oyuncuya göre hane numarası (1–24).
function pointNo(s, i) {
  return relOf(i, seatOf(s)) + 1;
}
function placeName(s, k) {
  if (k === T.BAR) return 'bar';
  if (k === T.OFF) return 'toplama';
  return `${pointNo(s, k)}`;
}

function layout() {
  const { w, h: hgt } = boardSpace(root, stage, [oppEl, meEl, footEl]);
  if (!w || !hgt) return;
  const bw = Math.floor(Math.min(w, hgt / (BOARD_H / BOARD_W)));
  boardEl.style.width = `${bw}px`;
}

// ---------- çizim ----------
function render() {
  const s = state();
  if (!s) return;
  boardEl.classList.remove('is-loading');
  const seat = seatOf(s);
  const mine = myTurn(s) && s.phase === 'move' && !s.noMove;
  const movable = new Set(mine ? T.movable(s) : []);
  if (sel != null && !movable.has(sel)) sel = null;
  const tlist = sel != null ? T.targetsFrom(s, sel) : [];
  const targets = new Map(tlist.map((t) => [t.to, t.hit]));
  const lastSteps = s.phase === 'roll' || s.phase === 'gameover' || s.phase === 'matchover' ? (s.last?.steps || []) : [];
  const last = { from: new Set(lastSteps.map((x) => x.from)), to: new Set(lastSteps.map((x) => x.to)) };
  const focused = document.activeElement?.closest?.('[data-k]')?.dataset.k;

  boardEl.innerHTML = boardSvg(s, {
    seat, me, sel, movable, targets, last,
    rolling,
    canRoll: myTurn(s) && s.phase === 'roll' && !rolling,
    labels: (k) => pointLabel(s, k, { movable, targets }),
  });
  if (focused != null) boardEl.querySelector(`[data-k="${focused}"]`)?.focus({ preventScroll: true });
  boardEl.classList.toggle('is-mine', myTurn(s) && (s.phase === 'roll' || s.phase === 'move'));

  renderPlate(oppEl, s, 1 - seat);
  renderPlate(meEl, s, seat);
  renderStatus(s, mine);
  renderActions(s, mine, tlist);
  renderCover(s);
  scheduleAuto(s, mine, movable);
}

function pointLabel(s, k, { movable, targets }) {
  const seat = seatOf(s);
  if (k === T.BAR) {
    const n = s.bar[seat];
    return `Bar: ${n} kırık pulun${movable.has(T.BAR) ? ', seçilebilir' : ''}`;
  }
  if (k === T.OFF) return `Toplama: ${s.off[seat]} pul topladın${targets.has(T.OFF) ? ', buraya topla' : ''}`;
  const n0 = T.countAt(s.points, k, seat), n1 = T.countAt(s.points, k, 1 - seat);
  let t = `${pointNo(s, k)}. hane: `;
  t += n0 ? `${n0} senin pulun` : n1 ? `${n1} ${n1 === 1 ? 'rakip pulu' : 'rakip pul'}` : 'boş';
  if (sel === k) t += ', seçili';
  else if (movable.has(k)) t += ', seçilebilir';
  if (targets.has(k)) t += targets.get(k) ? ', buraya git ve vur' : ', buraya git';
  return t;
}

function renderPlate(el, s, p) {
  const id = s.players[p];
  const active = (s.phase === 'roll' || s.phase === 'move') && s.turn === p;
  el.classList.toggle('is-turn', active);
  const pip = T.pipCount(T.posOf(s), p);
  el.replaceChildren(
    h('span', { class: `tv-swatch p${p}`, 'aria-hidden': 'true' }),
    h('span', { class: 'tv-name' }, nameOf(s, id)),
    h('span', { class: 'tv-meta' }, `bitişe ${pip} adım${s.off[p] ? ` · ${s.off[p]} topladı` : ''}${s.bar[p] ? ` · ${s.bar[p]} kırık` : ''}`),
    h('span', { class: 'tv-score', 'aria-label': `${s.score[p]} puan` }, String(s.score[p])),
  );
}

function diceText(s) {
  if (rolling) return 'zarlar dönüyor';
  return s.dice ? `${s.dice[0]}–${s.dice[1]}` : '';
}

function renderStatus(s, mine) {
  statusEl.className = 'tv-status';
  const cur = s.players[s.turn];
  const curName = nameOf(s, cur);
  let t;
  if (s.phase === 'setup') t = ''; // soru kurulum kartında; altta tekrar etmez
  else if (s.phase === 'gameover') t = gameOverText(s);
  else if (s.phase === 'matchover') t = s.players[s.result.winner] === me ? 'Maçı kazandın!' : `${nameOf(s, s.players[s.result.winner])} maçı kazandı.`;
  else if (s.phase === 'roll') {
    const open = s.opening ? `Açılış: ${nameOf(s, s.players[0])} ${s.opening[0]} · ${nameOf(s, s.players[1])} ${s.opening[1]}. ` : '';
    if (myTurn(s)) { t = `${open}Sıra sende · zar at`; statusEl.classList.add('is-turn'); }
    else t = `${open}Sıra ${bulunma(curName)}${M.partnerHere() ? '' : ' · gelince görecek'}`;
  } else if (s.phase === 'move') {
    if (s.noMove) t = `${diceText(s)} · oynanacak hamle yok, sıra geçiyor…`;
    else if (mine) {
      statusEl.classList.add('is-turn');
      const left = s.left.length;
      t = s.bar[s.turn] ? `${diceText(s)} · önce kırık pulunu gir` : `${diceText(s)} · ${left} hamle kaldı`;
      if (sel != null) t += ' · hedefe dokun';
    } else t = `${curName} oynuyor · ${diceText(s)}`;
  }
  statusEl.textContent = t || '';
}

function gameOverText(s) {
  const r = s.result;
  const kim = s.players[r.winner] === me ? 'Oyunu sen aldın' : `${nameOf(s, s.players[r.winner])} oyunu aldı`;
  return `${kim} · +${r.pts}${r.mars ? ' (mars)' : ''}`;
}

function renderActions(s, mine, tlist) {
  const btns = [];
  if (myTurn(s) && s.phase === 'roll') {
    btns.push(h('button', { type: 'button', class: 'btn primary tv-roll', onclick: roll, disabled: !!rolling }, 'Zar at'));
  }
  if (mine && sel != null) {
    for (const t of tlist.sort((a, b) => order(s, a.to) - order(s, b.to))) {
      const label = t.to === T.OFF ? 'Topla' : `${pointNo(s, t.to)}. haneye`;
      btns.push(h('button', { type: 'button', class: `btn small${t.hit ? ' primary' : ''}`, onclick: () => play(t.steps) }, label));
    }
    btns.push(h('button', { type: 'button', class: 'btn small ghost', onclick: () => { sel = null; render(); } }, 'Vazgeç'));
  } else if (myTurn(s) && s.phase === 'move' && s.steps.length) {
    btns.push(h('button', { type: 'button', class: 'btn small ghost', onclick: undo }, 'Geri al'));
  }
  if (s.phase === 'gameover') {
    btns.push(h('button', { type: 'button', class: 'btn primary', onclick: () => M.sync.dispatch({ type: 'next' }) }, 'Sonraki oyun'));
  }
  if (s.phase === 'matchover') {
    btns.push(h('button', { type: 'button', class: 'btn primary', onclick: () => newMatch(s.target, s) }, 'Yeni maç'));
  }
  if (s.phase === 'roll' || s.phase === 'move' || s.phase === 'gameover') {
    btns.push(h('button', { type: 'button', class: 'btn small ghost tv-new', onclick: askNewMatch }, 'Yeni maç'));
  }
  actionsEl.replaceChildren(...btns);
}
const order = (s, k) => (k === T.OFF ? 99 : pointNo(s, k));

function renderCover(s) {
  if (resumeOpen) return;
  if (s.phase !== 'setup' && !choosing) {
    if (cover.dataset.kind === 'setup') resetSetupCover();
    return;
  }
  if (cover.dataset.kind === 'setup') return;
  cover.dataset.kind = 'setup';
  target = s.target || target;
  const seg = h('div', { class: 'seg tv-targets', role: 'group', 'aria-label': 'Maç uzunluğu' },
    T.TARGETS.map((n) => h('button', {
      type: 'button', 'aria-pressed': String(n === target),
      onclick: (e) => {
        target = n;
        seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget)));
        sfx('tap');
      },
    }, `${n} puan`)));
  cover.replaceChildren(h('div', { class: 'card stack masa-card' },
    h('h2', { class: 'masa-card-title' }, 'Tavla'),
    h('p', { class: 'muted' }, 'Her oyun 1 puan. Rakip hiç pul toplayamadan biterse mars olur: 2 puan. Kaç puana kadar oynayalım?'),
    seg,
    h('div', { class: 'masa-card-actions' },
      h('button', {
        type: 'button', class: 'btn primary',
        onclick: () => { const restart = choosing; choosing = false; newMatch(target, s, restart); },
      }, 'Başla'),
      choosing && s.phase !== 'setup'
        ? h('button', { type: 'button', class: 'btn ghost', onclick: () => { choosing = false; resetSetupCover(); render(); } }, 'Vazgeç')
        : null)));
  cover.classList.remove('hidden');
}

// Tek seçenek: tüm turda tek bir ilk adım varsa kısa süre sonra kendiliğinden oynanır.
function scheduleAuto(s, mine, movable) {
  if (!mine || movable.size !== 1 || optimistic) { clearTimeout(autoTimer); autoKey = ''; return; }
  const steps = T.legalSteps(T.posOf(s), s.turn, s.left);
  const uniq = new Set(steps.map((x) => `${x.from}/${x.to}`));
  if (uniq.size !== 1) { clearTimeout(autoTimer); autoKey = ''; return; }
  const key = `${s.seq}`;
  if (autoKey === key) return;
  autoKey = key;
  clearTimeout(autoTimer);
  autoTimer = setTimeout(() => {
    const now = state();
    if (now?.seq !== s.seq) return;
    play([{ from: steps[0].from, die: steps[0].die }]);
  }, AUTO_MS);
}

// ---------- eylemler ----------
function roll() {
  const s = state();
  if (!s || !myTurn(s) || s.phase !== 'roll' || rolling) return;
  sfx('tick');
  if (M.sync.dispatch({ type: 'roll' }) === false) { toast('Bağlantı yok; biraz sonra yeniden dene.'); return; }
}

function play(steps) {
  const s = M.sync.state;
  sel = null;
  clearTimeout(autoTimer);
  const ok = M.sync.dispatch({ type: 'play', steps });
  sfx('snap');
  if (!M.authority && ok !== false) {
    const preview = T.reduce(s, { type: 'play', by: me, steps, now: s.at });
    if (preview !== s) optimistic = { s: preview, timer: setTimeout(() => { optimistic = null; render(); }, OPTIMISTIC_MS) };
  } else if (ok === false) toast('Bağlantı yok; hamle gönderilemedi.');
  render();
}

function undo() {
  sel = null;
  M.sync.dispatch({ type: 'undo' });
  sfx('tap');
}

// s = düğmenin çizildiği durum: maç numarası oradan (aynı anda iki "Başla"da ikincisi yok sayılır).
// restart = süren maçı bilerek bırakma ("Yeni maç" onayı ya da devam kartı).
function newMatch(n, s, restart = false) {
  if (closeCelebrate) { try { closeCelebrate(); } catch { /* kapalı */ } closeCelebrate = null; }
  M.sync.dispatch({ type: 'match', target: n, match: s.match, restart });
}

async function askNewMatch() {
  const s = M.sync.state;
  const busy = s && (s.game > 1 || s.rolls > 0 || s.score.some((x) => x > 0));
  if (busy && !(await confirmDialog('Bu maçı bırakıp yeni maça başlayalım mı?', { ok: 'Yeni maç' }))) return;
  sel = null;
  choosing = true;
  resetSetupCover();
  render();
}
function resetSetupCover() {
  cover.classList.add('hidden');
  cover.replaceChildren();
  delete cover.dataset.kind;
}

function tap(k) {
  const s = state();
  if (!s || resumeOpen) return;
  if (k === 'roll') { roll(); return; }
  if (!myTurn(s)) {
    if (s.phase === 'roll' || s.phase === 'move') announce(`Sıra ${bulunma(nameOf(s, s.players[s.turn]))}`);
    return;
  }
  if (s.phase === 'roll') { roll(); return; }
  if (s.phase !== 'move' || s.noMove) return;
  const key = k === T.BAR || k === T.OFF ? k : Number(k);
  if (sel != null) {
    const t = T.targetsFrom(s, sel).find((x) => x.to === key);
    if (t) { play(t.steps); return; }
  }
  const movable = T.movable(s);
  if (movable.includes(key)) {
    const ts = T.targetsFrom(s, key);
    if (ts.length === 1 && sel !== key) { play(ts[0].steps); return; } // tek hedef: hemen oyna
    sel = sel === key ? null : key;
    sfx('tap');
    render();
    return;
  }
  if (sel != null) { sel = null; render(); return; }
  if (s.bar[s.turn] && key !== T.BAR) { sfx('wrong'); toast('Önce kırık pulunu oyuna sok.'); }
}

boardEl.addEventListener('click', (e) => {
  const g = e.target.closest('[data-k]');
  if (g) tap(g.dataset.k);
});
boardEl.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const g = e.target.closest('[data-k]');
  if (!g) return;
  e.preventDefault();
  tap(g.dataset.k);
});

// ---------- ses, duyuru, bitiş ----------
function startRollAnim(s) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  clearInterval(rollTimer);
  let n = 0;
  const face = () => [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
  rolling = face();
  render();
  rollTimer = setInterval(() => {
    n++;
    if (n * 90 >= ROLL_MS) {
      clearInterval(rollTimer);
      rolling = null;
      render();
      return;
    }
    rolling = face();
    render();
  }, 90);
}

function effects(s, prev, info) {
  if (!prev) return;
  if (s.match !== prev.match) {
    choosing = false;
    resetSetupCover();
    if (closeCelebrate) { try { closeCelebrate(); } catch { /* kapalı */ } closeCelebrate = null; }
    const starter = nameOf(s, s.players[s.turn]);
    sfx('flip');
    announce(`Yeni maç: ${s.target} puan. Açılış zarı ${s.opening?.join(' ve ')}. ${starter === 'Sen' ? 'Sen başlıyorsun' : `${starter} başlıyor`}.`);
    return;
  }
  if (s.rolls > prev.rolls && s.dice) {
    sfx('flip');
    startRollAnim(s);
    const who = nameOf(s, s.players[s.turn]);
    announce(`${who === 'Sen' ? 'Attın' : `${who} attı`}: ${s.dice[0]} ve ${s.dice[1]}${s.noMove ? '. Oynanacak hamle yok.' : ''}`);
  }
  const hits = s.bar[0] + s.bar[1] > prev.bar[0] + prev.bar[1];
  if (s.steps.length > prev.steps.length || (s.turn !== prev.turn && prev.phase === 'move')) {
    if (s.players[prev.turn] !== me || info?.adopted) sfx(hits ? 'pop' : 'snap');
    else if (hits) sfx('pop');
  }
  if (s.phase === 'gameover' && prev.phase !== 'gameover') {
    sfx(s.players[s.result.winner] === me ? 'win' : 'match');
    toast(gameOverText(s));
    announce(gameOverText(s));
  }
  if (s.phase === 'matchover' && prev.phase !== 'matchover') celebrateEnd(s, info);
}

function celebrateEnd(s, info) {
  sfx('win');
  const w = s.result.winner;
  const title = s.players[w] === me ? 'Maçı kazandın! 🎉' : `${nameOf(s, s.players[w])} maçı kazandı 🎉`;
  const score = s.players.map((id, k) => `${nameOf(s, id)} ${s.score[k]}`).join(' · ');
  const lines = [`${s.target} puanlık maç · ${score}`, s.result.mars ? 'Son oyun mars bitti!' : `${s.game}. oyunda bitti.`];
  announce(`${title} ${lines.join('. ')}`);
  let kayit = null;
  if (M.authority && !info?.adopted) {
    logGame(M.roomId, NS, T.resultOf(s));
    kayit = skorKaydet(M.room, NS, { kazanan: s.players[w] });
  }
  closeCelebrate = celebrate({
    title,
    lines: [...lines, toplamSatiri(M.room, NS, s.players, s.names, kayit)],
    buttons: [
      { label: 'Yeni maç', primary: true, onClick: () => { closeCelebrate = null; newMatch(s.target, s); } },
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

const RESUMABLE = ['roll', 'move', 'gameover'];
function dropResume() {
  if (!resumeOpen) return;
  resumeOpen = false;
  closeResume?.();
  closeResume = null;
}

M.start({
  onState(s, prev, info) {
    clearOptimistic();
    if (prev && (prev.turn !== s.turn || prev.seq !== s.seq)) sel = sel != null && T.movable(s).includes(sel) ? sel : null;
    if (!RESUMABLE.includes(s.phase)) dropResume(); // bitmiş maç "Devam et" ile sunulmaz
    render();
    if (!quiet) effects(s, prev, info);
  },
  onPeer(here) { away.set(here); render(); },
  notify: (s, prev) => T.notice(prev, s, { by: me, ad: (id) => M.nameOf(id, s) }),
  // Kayıt arkada silindi (maç öbür cihazda bitti): sunulan "devam" bayat; kuruluma dön.
  onGone() {
    if (!resumeOpen) return;
    dropResume();
    quiet = true;
    try { M.fresh(); } finally { quiet = false; }
    toast('Bu maç bitmiş. Yeni maç kurabilirsiniz.');
  },
});

if (M.authority && M.resumed && RESUMABLE.includes(M.sync.state?.phase)) {
  const s = M.sync.state;
  resumeOpen = true;
  const turnTxt = s.players[s.turn] === me ? 'Sıra sende' : `Sıra ${bulunma(M.nameOf(s.players[s.turn], s))}`;
  closeResume = resumeCard(cover, {
    title: 'Kaldığımız yerden devam?',
    detail: `${s.target} puanlık maç · ${s.score[seatOf(s)]}–${s.score[1 - seatOf(s)]} · ${turnTxt}${s.at ? ` · ${agoText(Date.now() - s.at)}` : ''}`,
    onContinue: () => { resumeOpen = false; closeResume = null; render(); },
    newLabel: 'Yeni maç',
    onNew: () => { resumeOpen = false; closeResume = null; resetSetupCover(); newMatch(s.target, M.sync.state, true); },
  });
}
render();
