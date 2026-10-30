// Çiz Bakalım sayfası.
// Oyun akışı (mod, tur, tahmin, puan) ev sahibi otoriteli sync ile; çizgiler doğrudan mesajla (cizgi.js).
import { joinRoom } from '../../js/core/room.js';
import { readGameParams, lobbyUrl } from '../../js/core/identity.js';
import { mountShell, waitForPartner, celebrate, toast, confirmDialog } from '../../js/core/ui.js';
import { sfx } from '../../js/core/sound.js';
import { logGame } from '../../js/core/db.js';
import { createSync, sessionStore } from '../hafiza/sync.js';
import { newSeed } from '../hafiza/rng.js';
import { fitToViewport, esc } from '../hafiza/ekran.js';
import {
  ROUND_OPTIONS, DEFAULT_ROUNDS, MAX_GUESS_LEN, initialState, reduce, toAction, schedule, viewFor, drawerId,
  canDraw, totalRounds, resultOf,
} from './oyun.js';
import {
  PALETTE, ERASER, BRUSHES, MAX_STROKE_PTS, toNorm, farEnough, StrokeStore, makeParts, Outbox, flushOne, PartsIn,
} from './cizgi.js';
import { Tuval, exportPng } from './tuval.js';

const NS = 'ciz';
const TICK_MS = 100;
const STROKE_MAX_AGE = 3 * 60 * 60 * 1000;
const PARTS_WAIT_MS = 6000; // sonraki parça bu sürede gelmezse set atılır
const SNAP_RETRY_MS = 3000; // anlık görüntü isteği en sık bu arayla
const CG_WAIT_MS = 6000; // 'clear' sayacı bu süreden uzun farklıysa (kaçan clear) taze görüntü istenir

const ICON = {
  eraser: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 3l5 5-10 10H6l-3-3z"/><path d="M11 18h10"/><path d="M8 9l6 6"/></svg>',
  undo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/></svg>',
  clear: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/></svg>',
  save: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/></svg>',
};

const { roomId, hostId, isHost } = readGameParams();
const room = await joinRoom({ roomId, ns: NS });
mountShell({ title: 'Çiz Bakalım', room });

const app = document.getElementById('app');
app.innerHTML = `
  <section class="cz" id="cz" aria-label="Çiz Bakalım">
    <div class="cz-top" id="cz-top"></div>
    <div class="cz-setup hidden" id="cz-setup"></div>
    <div class="cz-main" id="cz-main">
      <div class="cz-stage" id="cz-stage">
        <div class="cz-paper" id="cz-paper">
          <canvas id="cz-canvas" role="img" aria-label="Çizim tuvali"></canvas>
          <div class="cz-banner hidden" id="cz-banner" role="status"></div>
        </div>
      </div>
      <div class="cz-side" id="cz-side">
        <div class="cz-tools hidden" id="cz-tools" role="toolbar" aria-label="Çizim araçları">
          <div class="cz-palette" role="group" aria-label="Renk">
            ${PALETTE.map((p, i) => `<button type="button" class="cz-sw" data-c="${i}" aria-label="Renk: ${p.name}" aria-pressed="${i === 0}" style="--sw:${p.color}"></button>`).join('')}
          </div>
          <div class="cz-row">
            <div class="cz-brushes" role="group" aria-label="Kalınlık">
              ${BRUSHES.map((b, i) => `<button type="button" class="cz-tool cz-br" data-b="${i}" aria-label="Kalınlık: ${b.name}" aria-pressed="${i === 1}"><span style="--d:${4 + i * 6}px"></span></button>`).join('')}
            </div>
            <button type="button" class="cz-tool" data-act="eraser" aria-pressed="false" aria-label="Silgi">${ICON.eraser}</button>
            <button type="button" class="cz-tool" data-act="undo" aria-label="Son çizgimi geri al">${ICON.undo}</button>
            <button type="button" class="cz-tool" data-act="clear" aria-label="Tuvali temizle">${ICON.clear}</button>
            <button type="button" class="cz-tool" data-act="save" aria-label="Resmi kaydet (PNG)">${ICON.save}</button>
          </div>
        </div>
        <div class="cz-chat hidden" id="cz-chat">
          <ol class="cz-guesses" id="cz-guesses" aria-live="polite" aria-label="Tahminler"></ol>
          <form class="cz-form" id="cz-form" autocomplete="off">
            <input class="input" id="cz-input" name="tahmin" maxlength="${MAX_GUESS_LEN}" placeholder="Tahminini yaz…"
              aria-label="Tahminin" enterkeyhint="send" autocapitalize="off" autocorrect="off" spellcheck="false">
            <button type="submit" class="btn primary">Tahmin</button>
          </form>
        </div>
      </div>
    </div>
    <p class="cz-sr" id="cz-live" aria-live="polite"></p>
    <div class="cz-away hidden" id="cz-away" role="status">
      <div class="card stack center">
        <p class="title">Sevgilin dönünce devam 💞</p>
        <p class="muted">Tuval olduğu gibi bekliyor.</p>
      </div>
    </div>
  </section>`;
const $ = (id) => document.getElementById(id);
const root = $('cz');
const topEl = $('cz-top');
const setupEl = $('cz-setup');
const mainEl = $('cz-main');
const stage = $('cz-stage');
const canvas = $('cz-canvas');
const banner = $('cz-banner');
const toolsEl = $('cz-tools');
const chatEl = $('cz-chat');
const guessList = $('cz-guesses');
const form = $('cz-form');
const input = $('cz-input');
const live = $('cz-live');
const away = $('cz-away');
const undoBtn = toolsEl.querySelector('[data-act="undo"]');

const mode = await waitForPartner(room, {
  ns: NS,
  text: 'Sevgilin gelince birlikte çizersiniz. İstersen tek başına başla.',
  allowSolo: true,
});
const me = room.me.clientId;
const partner = room.partner();
const solo = !roomId || mode === 'solo' || !partner;
const authority = solo || isHost;
const players = solo ? [me] : [me, partner.clientId];
const names = solo ? { [me]: room.me.name } : { [me]: room.me.name, [partner.clientId]: partner.name };
const guestId = solo ? null : partner.clientId;
const KEY = `bizim.ciz.${roomId || '-'}.${solo ? 'solo' : 'duo'}`;
const storage = sessionStore();

// ---------- çizgi durumu ----------
const store = new StrokeStore();
const outbox = new Outbox();
const tuval = new Tuval(canvas);
const sendQ = []; // katılım anlık görüntüsü ve gönderilemeyen mesajlar; outbox'tan önce gider
const tool = { c: 0, b: 1, eraser: false };
const idBase = Math.random().toString(36).slice(2, 6);
let idN = 0;
let board = null;
let cur = null; // { id, pid, rect, lx, ly }
const partsIn = new PartsIn(); // misafir: gelen anlık görüntü parçaları
let partsT = 0;
let clears = authority ? 0 : null; // uygulanan 'clear' sayısı; misafir ev sahibininkini anlık görüntüden alır
let snapNeed = false; // misafir: anlık görüntü eksik kaldı; tam gelene dek yeniden istenir
let snapAt = Date.now(); // misafir: son istek (ilk join'i sync yollar)
let cgSince = 0; // misafir: sayaç farkının başladığı an
let saveT = 0;
let closeCelebrate = null;
let lastAnnounce = '';
let side = 0;

const sync = createSync({
  room, ns: NS, hostId, isHost: authority, solo,
  reduce, schedule,
  initial: initialState({ players, names }),
  toAction: (intent, by, s) => toAction(intent, by, s, { hostId: me, now: Date.now(), seed: newSeed(), players, names }),
  view: (s) => ({ ...viewFor(s, guestId), cg: clears }),
  storage,
  storeKey: KEY,
  accept: (s) => s.v === 1 && s.players?.join() === players.join(),
  onState: render,
  onMessage: onStrokeMessage,
  onJoin: sendSnapshot,
  onPeer: (here) => { if (!authority) away.classList.toggle('hidden', here); },
  onSoloPartner: () => toast('Sevgilin şu an tek başına çiziyor. Bitince birlikte oynayın 💞'),
});

if (authority) {
  board = sync.state.board;
  const saved = loadStrokes();
  if (saved && saved.b === board) store.load(saved.list);
  window.addEventListener('pagehide', saveStrokes);
}

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

fitToViewport(root, layoutStage);
if ('ResizeObserver' in window) new ResizeObserver(layoutStage).observe(stage);
sync.start();
setInterval(flushNet, TICK_MS);
setInterval(tickTimer, 250);
updateUndo();

// ---------- yardımcılar ----------
function nameOf(s, id) {
  if (id === me) return 'Sen';
  return s?.names?.[id] || 'Sevgilin';
}
function announce(text) {
  if (!text || text === lastAnnounce) return;
  lastAnnounce = text;
  live.textContent = text;
}
function viewOf(s) {
  return s && authority ? viewFor(s, me) : s;
}
function layoutStage() {
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  if (!w || !h) return;
  const next = Math.max(120, Math.floor(Math.min(w, h)));
  if (next === side) return;
  side = next;
  tuval.resize(side, store.list);
}

// ---------- ağ: çizgiler ----------
function flushNet() {
  if (solo) {
    outbox.reset();
    return;
  }
  if (!authority && askSnapshot()) return; // bu dilimin mesajı join oldu
  flushOne(sendQ, outbox, (m) => room.send(m)); // gönderilemezse sıranın başına döner
}

// Misafir: anlık görüntü eksik kaldıysa ya da 'clear' sayacı ev sahibininkinden uzun süredir farklıysa
// join ile taze görüntü ister. Bekleyen kendi işlemleri önce gider. Döner: join gönderildi mi.
function askSnapshot() {
  const cg = sync.state?.cg;
  if (cg === undefined || cg === clears) cgSince = 0;
  else if (!cgSince) cgSince = Date.now();
  const stale = cgSince && Date.now() - cgSince > CG_WAIT_MS;
  if (!(snapNeed || stale) || partsIn.busy || sendQ.length || outbox.size) return false;
  if (Date.now() - snapAt < SNAP_RETRY_MS) return false;
  snapAt = Date.now();
  cgSince = 0;
  snapNeed = true;
  return room.send({ t: 'join' });
}

// Ev sahibi: misafir katıldı → bekleyen işlemler, sonra tüm çizgiler (her parça < 60 KB, 100 ms arayla).
function sendSnapshot() {
  sendQ.length = 0;
  const pre = outbox.flush();
  if (pre) sendQ.push(pre);
  sendQ.push(...makeParts(store.list, board).map((m) => ({ ...m, cg: clears })));
}

function onStrokeMessage(msg, from) {
  if (msg.t === 'strokes') {
    onParts(msg);
    return;
  }
  applyRemote(msg, from?.clientId ?? null);
}

function applyRemote(op, by) {
  if (op.t === 'ops') {
    for (const o of op.list || []) applyRemote(o, by);
    return;
  }
  if (!['s0', 'sp', 's1', 'undo', 'clear'].includes(op.t)) return;
  if (op.t === 's0' && op.b !== board) return;
  afterApply(store.apply(op, by), op, false);
}

function applyLocal(op) {
  afterApply(store.apply(op, me), op, true);
  if (!solo) outbox.push(op);
}

function afterApply(result, op, local) {
  if (!result) return;
  if (op.t === 'clear') {
    cur = null;
    clears = (clears ?? 0) + 1;
  }
  if (result === 'redraw') tuval.redraw(store.list);
  else tuval.touch(store.get(op.id), local);
  dirty();
}

function onParts(m) {
  if (authority) return;
  clearTimeout(partsT);
  const got = partsIn.add(m);
  if (got === 'lost') {
    snapNeed = true; // yarım set atıldı; flushNet join ile yeniden ister
    return;
  }
  if (!got) {
    partsT = setTimeout(() => { partsIn.reset(); snapNeed = true; }, PARTS_WAIT_MS);
    return;
  }
  if (got.b === board) {
    store.load(got.list);
    tuval.redraw(store.list);
    updateUndo();
    clears = got.cg ?? clears;
    snapNeed = false;
  }
}

function dirty() {
  updateUndo();
  if (authority && !saveT) saveT = setTimeout(saveStrokes, 1500);
}
function saveStrokes() {
  clearTimeout(saveT);
  saveT = 0;
  if (!authority || !storage) return;
  try {
    storage.set(`${KEY}.cizgi`, JSON.stringify({ at: Date.now(), b: board, list: makeParts(store.list, board, Infinity)[0].list }));
  } catch { /* depo dolu: çizgiler yalnız bellekte */ }
}
function loadStrokes() {
  try {
    const raw = storage?.get(`${KEY}.cizgi`);
    if (!raw) return null;
    const o = JSON.parse(raw);
    return Date.now() - o.at > STROKE_MAX_AGE ? null : o;
  } catch {
    return null;
  }
}
function updateUndo() {
  undoBtn.disabled = !store.lastOwn(me);
}

// ---------- kalem ----------
function startStroke(x, y, pid, rect) {
  cur = { id: `${idBase}${(idN++).toString(36)}`, pid, rect, lx: x, ly: y };
  const w = BRUSHES[tool.b].w;
  applyLocal({ t: 's0', id: cur.id, c: tool.eraser ? ERASER : tool.c, w, b: board, p: [x, y] });
}
function endStroke() {
  if (!cur) return;
  applyLocal({ t: 's1', id: cur.id });
  cur = null;
}

canvas.addEventListener('pointerdown', (e) => {
  if (!e.isPrimary || cur || partsIn.busy) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  if (!canDraw(viewOf(sync.state), me)) return;
  e.preventDefault();
  try { canvas.setPointerCapture(e.pointerId); } catch { /* eski tarayıcı */ }
  const rect = canvas.getBoundingClientRect();
  const [x, y] = toNorm(e.clientX, e.clientY, rect);
  startStroke(x, y, e.pointerId, rect);
});

canvas.addEventListener('pointermove', (e) => {
  if (!cur || e.pointerId !== cur.pid) return;
  e.preventDefault();
  const evs = e.getCoalescedEvents?.() || [];
  const list = evs.length ? evs : [e];
  let pts = [];
  for (const ev of list) {
    const [x, y] = toNorm(ev.clientX, ev.clientY, cur.rect);
    if (!farEnough(cur.lx, cur.ly, x, y)) continue;
    const s = store.get(cur.id);
    if (s && s.p.length / 2 + pts.length / 2 >= MAX_STROKE_PTS) {
      // çok uzun çizgi: kesintisiz bölünür (parça sınırı 60 KB altında kalsın)
      if (pts.length) applyLocal({ t: 'sp', id: cur.id, p: pts });
      pts = [];
      const { pid, rect, lx, ly } = cur;
      endStroke();
      startStroke(lx, ly, pid, rect);
    }
    pts.push(x, y);
    cur.lx = x;
    cur.ly = y;
  }
  if (pts.length) applyLocal({ t: 'sp', id: cur.id, p: pts });
});

for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  canvas.addEventListener(ev, (e) => {
    if (cur && e.pointerId === cur.pid) endStroke();
  });
}

toolsEl.addEventListener('click', async (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.c) {
    tool.c = Number(b.dataset.c);
    tool.eraser = false;
  } else if (b.dataset.b) {
    tool.b = Number(b.dataset.b);
  } else if (b.dataset.act === 'eraser') {
    tool.eraser = !tool.eraser;
  } else if (b.dataset.act === 'undo') {
    const id = !cur && store.lastOwn(me);
    if (id) applyLocal({ t: 'undo', id });
    return;
  } else if (b.dataset.act === 'clear') {
    if (!store.list.length) return;
    if (await confirmDialog('Tuvali temizleyelim mi? İkinizin ekranından da silinir.', { ok: 'Temizle' })) {
      applyLocal({ t: 'clear' });
      sfx('pop');
    }
    return;
  } else if (b.dataset.act === 'save') {
    savePng();
    return;
  }
  sfx('tap');
  paintTools();
});

function paintTools() {
  toolsEl.querySelectorAll('[data-c]').forEach((x) => x.setAttribute('aria-pressed', String(!tool.eraser && Number(x.dataset.c) === tool.c)));
  toolsEl.querySelectorAll('[data-b]').forEach((x) => x.setAttribute('aria-pressed', String(Number(x.dataset.b) === tool.b)));
  toolsEl.querySelector('[data-act="eraser"]').setAttribute('aria-pressed', String(tool.eraser));
}

async function savePng() {
  const blob = await exportPng(store.list);
  if (!blob) return;
  const d = new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ciz-bakalim-${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  toast('Resim indirildi 🖼️');
}

// ---------- tahmin ----------
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  sync.dispatch({ type: 'guess', text });
  input.value = '';
});

// ---------- çizim (durum) ----------
function render(raw, rawPrev) {
  if (!raw) return;
  const s = viewOf(raw);
  const prev = viewOf(rawPrev);
  if (s.board !== board) {
    board = s.board;
    cur = null;
    store.apply({ t: 'clear' });
    tuval.redraw(store.list);
    dirty();
  }
  if (s.phase !== 'end' && closeCelebrate) {
    try { closeCelebrate(); } catch { /* zaten kapalı */ }
    closeCelebrate = null;
  }
  const isSetup = s.phase === 'setup';
  setupEl.classList.toggle('hidden', !isSetup);
  mainEl.classList.toggle('hidden', isSetup);
  if (isSetup) {
    topEl.innerHTML = '';
    if (authority && solo) {
      sync.dispatch({ type: 'setup', mode: 'serbest' });
      return;
    }
    if (authority) renderSetup(s);
    else setupEl.innerHTML = '<div class="card stack center cz-wait"><p class="title">Sevgilin oyunu kuruyor…</p><p class="muted">Kalemler hazır ✏️</p></div>';
    return;
  }
  renderTop(s);
  toolsEl.classList.toggle('hidden', !canDraw(s, me));
  renderChat(s);
  renderBanner(s);
  stage.classList.toggle('can-draw', canDraw(s, me));
  requestAnimationFrame(layoutStage);
  effects(s, prev);
}

function renderSetup(s) {
  let pick = s.mode || 'serbest';
  let rounds = s.rounds || DEFAULT_ROUNDS;
  setupEl.innerHTML = `
    <div class="card stack cz-setup-card">
      <h2 class="title">Çiz Bakalım</h2>
      <p class="subtitle">Nasıl oynayalım?</p>
      <div class="cz-modes" role="group" aria-label="Mod">
        <button type="button" class="btn cz-opt" data-mode="serbest" aria-pressed="${pick === 'serbest'}">
          <span class="cz-opt-t"><span aria-hidden="true">🎨</span> Serbest tuval</span>
          <small>İkiniz aynı anda, aynı tuvale çizin.</small>
        </button>
        <button type="button" class="btn cz-opt" data-mode="tahmin" aria-pressed="${pick === 'tahmin'}">
          <span class="cz-opt-t"><span aria-hidden="true">✏️</span> Çiz-Tahmin</span>
          <small>Biri çizer, diğeri tahmin eder. Puan ortak!</small>
        </button>
      </div>
      <div class="stack cz-rounds${pick === 'tahmin' ? '' : ' hidden'}">
        <p class="cz-label" id="cz-rl">Kişi başı tur</p>
        <div class="seg" role="group" aria-labelledby="cz-rl">
          ${ROUND_OPTIONS.map((n) => `<button type="button" data-rounds="${n}" aria-pressed="${n === rounds}">${n}</button>`).join('')}
        </div>
      </div>
      <button type="button" class="btn primary" data-act="start">Başla</button>
    </div>`;
  setupEl.querySelector('.cz-setup-card').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.mode) {
      pick = b.dataset.mode;
      setupEl.querySelectorAll('[data-mode]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      setupEl.querySelector('.cz-rounds').classList.toggle('hidden', pick !== 'tahmin');
      sfx('tap');
    } else if (b.dataset.rounds) {
      rounds = Number(b.dataset.rounds);
      setupEl.querySelectorAll('[data-rounds]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      sfx('tap');
    } else if (b.dataset.act === 'start') {
      sync.dispatch({ type: 'setup', mode: pick, rounds });
    }
  });
}

function renderTop(s) {
  const modeBtn = authority && !solo
    ? '<button type="button" class="btn small ghost" data-act="menu" aria-label="Mod seçimine dön">Mod</button>'
    : '';
  if (s.mode !== 'tahmin') {
    topEl.innerHTML = `<div class="cz-top-row"><span class="chip"><span aria-hidden="true">🎨</span> Serbest tuval</span>
      <span class="muted cz-hint-text">${solo ? 'Kendi resmini çiz.' : 'İkiniz aynı anda çizebilirsiniz.'}</span>${modeBtn}</div>`;
    return;
  }
  const total = totalRounds(s);
  const round = Math.min(s.round + 1, total);
  const chips = `
    <span class="chip">Tur <b>${round}/${total}</b></span>
    ${s.phase === 'turn' ? `<span class="chip cz-timer" id="cz-timer"><span aria-hidden="true">⏱</span> <b id="cz-timer-v">${secondsLeft(s)}</b><span class="cz-sr"> saniye</span></span>` : ''}
    <span class="chip">Puan <b>${Number(s.score)}</b></span>`;
  let line = '';
  const drawer = drawerId(s);
  if (s.phase === 'turn') {
    line = drawer === me
      ? `<span>Çiz: <b class="cz-word">${esc(s.word)}</b></span>${s.passes < 1 ? '<button type="button" class="btn small ghost" data-act="pass">Pas</button>' : ''}`
      : `<span>${esc(nameOf(s, drawer))} çiziyor · <b class="cz-hint" aria-label="İpucu: ${esc(s.hint)}">${esc(s.hint)}</b></span>`;
  } else if (s.phase === 'reveal') {
    line = `<span>Kelime: <b class="cz-word">${esc(s.word)}</b></span>`;
  } else if (s.phase === 'end') {
    line = '<span>Oyun bitti 🎉</span><button type="button" class="btn small primary" data-act="again">Tekrar</button>';
  }
  topEl.innerHTML = `<div class="cz-top-row"><div class="row cz-chips">${chips}</div>${modeBtn}</div><div class="cz-top-row cz-line">${line}</div>`;
}

topEl.addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-act]');
  if (!b) return;
  const act = b.dataset.act;
  if (act === 'pass') sync.dispatch({ type: 'pass' });
  if (act === 'again') sync.dispatch({ type: 'again' });
  if (act === 'menu') {
    const s = sync.state;
    if (s?.phase !== 'end' && !(await confirmDialog('Mod seçimine dönelim mi?', { ok: 'Dön' }))) return;
    sync.dispatch({ type: 'menu' });
  }
});

function renderChat(s) {
  const show = s.mode === 'tahmin';
  chatEl.classList.toggle('hidden', !show);
  if (!show) return;
  const guesser = s.phase === 'turn' && drawerId(s) !== me;
  form.classList.toggle('hidden', drawerId(s) === me && s.phase === 'turn');
  input.disabled = !guesser;
  form.querySelector('button').disabled = !guesser;
  input.placeholder = guesser ? 'Tahminini yaz…' : s.phase === 'turn' ? '' : 'Sıradaki tur birazdan…';
  const items = (s.guesses || []).map((g) => `<li class="${g.ok ? 'is-ok' : ''}"><b>${esc(nameOf(s, g.by))}:</b> ${esc(g.text)}${g.ok ? ' <span aria-label="doğru">✓</span>' : ''}</li>`);
  const html = items.join('') || `<li class="muted">${drawerId(s) === me ? 'Tahminler burada görünecek.' : 'İlk tahmini yaz!'}</li>`;
  if (guessList.innerHTML !== html) {
    guessList.innerHTML = html;
    guessList.scrollTop = guessList.scrollHeight;
  }
}

function renderBanner(s) {
  if (s.mode !== 'tahmin' || s.phase !== 'reveal') {
    banner.classList.add('hidden');
    return;
  }
  banner.innerHTML = s.ok
    ? `<p class="cz-b-big">Bildiniz! +${Number(s.gained)}</p><p>${esc(s.word)}</p>`
    : `<p class="cz-b-big">Süre doldu</p><p>Kelime: <b>${esc(s.word)}</b></p>`;
  banner.classList.remove('hidden');
}

function secondsLeft(s) {
  return Math.max(0, Math.ceil((s.deadline - sync.hostNow()) / 1000));
}
function tickTimer() {
  const s = sync.state;
  const v = document.getElementById('cz-timer-v');
  if (!s || s.phase !== 'turn' || !v) return;
  const left = String(secondsLeft(s));
  if (v.textContent === left) return;
  v.textContent = left;
  document.getElementById('cz-timer')?.classList.toggle('is-low', Number(left) <= 10);
  if (Number(left) <= 5 && Number(left) > 0) sfx('tick');
}

function effects(s, prev) {
  if (s.mode !== 'tahmin') return;
  const drawer = drawerId(s);
  const newRound = s.phase === 'turn' && (!prev || prev.phase !== 'turn' || prev.round !== s.round || prev.game !== s.game);
  if (newRound) {
    if (prev) sfx('pop');
    if (drawer === me) announce(`Sıra sende: çiz! Kelime: ${s.word}`);
    else {
      announce(`${nameOf(s, drawer)} çiziyor. Tahmin et!`);
      if (window.matchMedia?.('(pointer: fine)').matches) input.focus();
    }
    return;
  }
  if (!prev) return;
  if (s.phase === 'reveal' && prev.phase === 'turn') {
    sfx(s.ok ? 'match' : 'wrong');
    announce(s.ok ? `Bildiniz! Artı ${s.gained} puan. Kelime: ${s.word}` : `Süre doldu. Kelime: ${s.word}`);
  } else if (s.phase === 'turn' && prev.phase === 'turn' && s.word && prev.word && s.word !== prev.word) {
    announce(`Yeni kelime: ${s.word}`);
  } else if (s.phase === 'end' && prev.phase !== 'end') {
    celebrateEnd(s);
  }
}

function celebrateEnd(s) {
  sfx('win');
  const r = resultOf(s);
  if (authority && roomId) logGame(roomId, 'ciz', r);
  const title = r.ok === r.total ? 'Kusursuz takım! 🎨' : r.ok > 0 ? 'Harika takım! 🎨' : 'Bir dahaki sefere! 💞';
  const lines = [`Toplam puan: ${r.score}`, `${r.ok}/${r.total} kelimeyi bildiniz`];
  announce(`${title} ${lines.join('. ')}`);
  closeCelebrate = celebrate({
    title,
    lines,
    buttons: [
      { label: 'Tekrar', primary: true, onClick: () => { closeCelebrate?.(); closeCelebrate = null; sync.dispatch({ type: 'again' }); } },
      { label: 'Ana sayfaya dön', onClick: () => { location.href = lobbyUrl(); } },
    ],
  });
}
