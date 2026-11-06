// Dört Taş (+ XOX) sayfası. games/xox/ aynı kodu body[data-oyun="xox"] ile açar: yalnız XOX, kendi oda kanalı ve skoru.
// Ev sahibi durumu tutar (oyun.js), misafir niyet yollar ve
// hamlesini yerelde tahmin ederek hemen gösterir (ev sahibi onaylamazsa 3 sn sonra geri alır).
import { joinRoom, partnerGoruyor } from '../../js/core/room.js';
import { readGameParams, lobbyUrl } from '../../js/core/identity.js';
import { mountShell, waitForPartner, celebrate, confirmDialog } from '../../js/core/ui.js';
import { sfx } from '../../js/core/sound.js';
import { logGame } from '../../js/core/db.js';
import { skorKaydet, toplamSatiri } from '../../js/core/skor.js';
import { oyunOdulu } from '../../js/core/oyun-odul.js';
import { bildir } from '../../js/core/bildirim.js';
import { siraPartnere } from '../dama/kayit.js';
import { createSync, sessionStore } from '../hafiza/sync.js';
import { fitToViewport, esc } from '../hafiza/ekran.js';
import { MODLAR, initialState, reduce, toAction, resultOf, yeniTaslar, inecegiSatir } from './oyun.js';

const XOX = document.body.dataset.oyun === 'xox';
const NS = XOX ? 'xox' : 'dorttas';
const BASLIK = XOX ? 'XOX' : 'Dört Taş';
const TAHMIN_MS = 3000;
const XOX_ADLAR = ['Sol üst', 'Üst orta', 'Sağ üst', 'Sol orta', 'Orta', 'Sağ orta', 'Sol alt', 'Alt orta', 'Sağ alt'];
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)');

const { roomId, hostId, isHost } = readGameParams();
const room = await joinRoom({ roomId, ns: NS });
mountShell({ title: BASLIK, room });

const app = document.getElementById('app');
app.innerHTML = `
  <section class="dt" id="dt" aria-label="${BASLIK}">
    <div class="dt-head"${XOX ? ' hidden' : ''}>
      <div class="seg dt-mod" role="group" aria-label="Oyun türü">
        <button type="button" data-mod="dort" aria-pressed="true">Dört Taş</button>
        <button type="button" data-mod="xox" aria-pressed="false">XOX</button>
      </div>
    </div>
    <div class="dt-score" id="dt-score"></div>
    <p class="dt-status" id="dt-status" aria-hidden="true">Bağlanıyor…</p>
    <div class="dt-stage" id="dt-stage"></div>
    <div class="dt-foot" id="dt-foot"></div>
    <p class="sr-only" id="dt-live" aria-live="polite"></p>
    <div class="dt-away hidden" id="dt-away" role="status">
      <div class="card stack center">
        <p class="dt-away-title">Sevgilin dönünce devam 💞</p>
        <p class="muted">Taşlar olduğu gibi bekliyor.</p>
      </div>
    </div>
  </section>`;
const root = document.getElementById('dt');
const scoreEl = document.getElementById('dt-score');
const statusEl = document.getElementById('dt-status');
const stage = document.getElementById('dt-stage');
const foot = document.getElementById('dt-foot');
const live = document.getElementById('dt-live');
const away = document.getElementById('dt-away');
const modSeg = root.querySelector('.dt-mod');

await waitForPartner(room, { ns: NS, text: 'Sevgilin gelince sırayla taş bırakırsınız.' });
const me = room.me.clientId;
const partner = room.partner();
const players = [me, partner?.clientId || 'sevgilim'];
const names = { [me]: room.me.name, [players[1]]: partner?.name || '' };

let board = null;        // { key, el, mod, cells[], cols[] }
let shown = null;        // ekranda çizili durum (misafirde tahmin olabilir)
let guessTimer = 0;
let closeCelebrate = null;
let celebrateTimer = 0;
let loggedGame = null;
let awayTimer = 0;

const sync = createSync({
  room, ns: NS, hostId, isHost, solo: false,
  reduce,
  toAction: (intent, by, s) => toAction(intent, by, s, { hostId: me }),
  initial: initialState({ players, names, mod: XOX ? 'xox' : 'dort' }),
  storage: sessionStore(),
  storeKey: `bizim.${NS}.${roomId || '-'}`,
  accept: (s) => s.v === 1 && s.players?.join() === players.join(),
  onState: (s, prev) => { draw(s); siraBildir(s, prev); bitisOdulu(s, prev); },
  onPeer: (here) => {
    clearTimeout(awayTimer);
    if (here) away.classList.add('hidden');
    else awayTimer = setTimeout(() => away.classList.remove('hidden'), 1200); // kısa kopmada titremesin
  },
  onJoin: (from) => fillSeat(from),
});

// Ev sahibi: başka cihazdan (yeni clientId) dönen partner, oyundaki koltuğuna oturur.
function fillSeat(p) {
  if (!isHost || !p?.clientId || p.clientId === me) return;
  sync.dispatch({ type: 'seat', ids: [me, p.clientId], names: p.name ? { [p.clientId]: p.name } : {} });
}

fitToViewport(root, layout);
if ('ResizeObserver' in window) new ResizeObserver(() => layout()).observe(root);
sync.start();
if (isHost) room.on('presence', (p) => { if (p) fillSeat(p); });

// "Sıra sende" bildirimi (dama/masa.js kalıbı): sırayı devreden cihaz yollar; partner bu oyunda ve
// uygulaması öndeyse yollanmaz.
function siraBildir(s, prev) {
  const holder = (x) => (x?.faz === 'oyun' ? x.players[x.sira] : null);
  if (!prev || !roomId || !siraPartnere(holder(prev), holder(s), me) || partnerGoruyor(room.partner(), NS)) return;
  const oyun = MODLAR[s.mod].ad;
  const yeni = prev.oyun !== s.oyun || prev.mod !== s.mod;
  const metin = yeni ? `${oyun}: yeni oyun · ilk hamle senin` : `${oyun}: ${room.me.name || 'Sevgilin'} hamlesini yaptı`;
  bildir(roomId, { tur: 'oyun', baslik: 'Sıra sende', metin, url: `games/${NS}/?oda=${roomId}&host=${isHost ? me : hostId}` });
}

// ---------- yardımcılar ----------
function myIdx(s) { return s.players.indexOf(me); }
// Bu cihaz oyunda değil (koltuk henüz bu clientId'ye geçmedi): yalnız izler.
function watching(s) { return myIdx(s) < 0; }
function nameOf(s, k) {
  const id = s.players[k];
  if (id === me) return 'Sen';
  return s.names?.[id] || 'Sevgilin';
}
function partnerName(s) { return nameOf(s, 1 - myIdx(s)); }
function announce(text) { if (text) live.textContent = text; }
function turnText(s) {
  if (s.faz === 'bitti') {
    if (s.kazanan === -1) return 'Berabere!';
    return s.kazanan === myIdx(s) ? 'Kazandın!' : `${partnerName(s)} kazandı`;
  }
  return s.sira === myIdx(s) ? 'Sıra sende' : `${partnerName(s)} düşünüyor…`;
}

// ---------- çizim ----------
function draw(s) {
  if (!s) return;
  clearTimeout(guessTimer);
  const prev = shown;
  shown = s;
  if (s.faz !== 'bitti') {
    clearTimeout(celebrateTimer);
    if (closeCelebrate) { try { closeCelebrate(); } catch { /* kapalı */ } closeCelebrate = null; }
  }
  modSeg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mod === s.mod)));
  drawScore(s);
  if (watching(s)) {
    statusEl.textContent = 'Bu cihaz oyunda değil · izliyorsun';
    statusEl.dataset.state = 'wait';
    foot.innerHTML = '';
    drawBoard(s, prev);
    return;
  }
  statusEl.textContent = turnText(s);
  statusEl.dataset.state = s.faz === 'bitti' ? (s.kazanan === myIdx(s) ? 'win' : s.kazanan === -1 ? 'draw' : 'lose') : s.sira === myIdx(s) ? 'mine' : 'wait';
  drawFoot(s);
  drawBoard(s, prev);
  effects(s, prev);
}

function drawScore(s) {
  const sk = s.skor[s.mod];
  const mi = Math.max(0, myIdx(s)); // izleyende ev sahibi solda
  const order = [mi, 1 - mi]; // ben solda
  const plate = (k) => `
    <div class="dt-plate p${k}${s.faz === 'oyun' && s.sira === k ? ' is-turn' : ''}">
      <span class="dt-swatch ${s.mod}" aria-hidden="true">${s.mod === 'xox' ? markSvg(k) : ''}</span>
      <span class="dt-name">${esc(nameOf(s, k))}</span>
      <span class="dt-num" aria-label="${esc(nameOf(s, k))} puanı ${Number(sk[k])}">${Number(sk[k])}</span>
    </div>`;
  scoreEl.innerHTML = `${plate(order[0])}<span class="dt-draws" title="Berabere">${sk[2] ? `${Number(sk[2])} berabere` : '–'}</span>${plate(order[1])}`;
}

function drawFoot(s) {
  const end = s.faz === 'bitti';
  foot.innerHTML = end
    ? '<button type="button" class="btn primary" data-act="yeni">Tekrar oyna</button>'
    : `<button type="button" class="btn ghost small" data-act="yeni"${s.hamle ? '' : ' disabled'}>Baştan başla</button>`;
}

function markSvg(k) {
  return k === 0
    ? '<svg viewBox="0 0 100 100" class="dt-mark x" aria-hidden="true" focusable="false"><path pathLength="100" d="M26 26 74 74M74 26 26 74"/></svg>'
    : '<svg viewBox="0 0 100 100" class="dt-mark o" aria-hidden="true" focusable="false"><circle pathLength="100" cx="50" cy="50" r="25"/></svg>';
}

function buildBoard(s) {
  const m = MODLAR[s.mod];
  stage.innerHTML = '';
  const el = document.createElement('div');
  el.className = `dt-board ${s.mod}`;
  el.setAttribute('role', 'group');
  el.style.setProperty('--cols', m.cols);
  el.style.setProperty('--rows', m.rows);
  const cols = [];
  const cells = [];
  if (s.mod === 'dort') {
    el.setAttribute('aria-label', 'Tahta: 7 sütun');
    for (let c = 0; c < m.cols; c++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'dt-col';
      b.dataset.c = String(c);
      for (let r = 0; r < m.rows; r++) {
        const hole = document.createElement('span');
        hole.className = 'dt-hole';
        hole.innerHTML = '<span class="dt-ghost" aria-hidden="true"></span>';
        b.appendChild(hole);
        cells[r * m.cols + c] = hole;
      }
      el.appendChild(b);
      cols.push(b);
    }
  } else {
    el.setAttribute('aria-label', 'Tahta: 3×3');
    for (let i = 0; i < 9; i++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'dt-cell';
      b.dataset.i = String(i);
      el.appendChild(b);
      cells.push(b);
    }
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    line.setAttribute('class', 'dt-strike');
    line.setAttribute('aria-hidden', 'true');
    line.setAttribute('viewBox', '0 0 300 300');
    el.appendChild(line);
  }
  el.addEventListener('click', onBoardClick);
  el.addEventListener('keydown', onBoardKey);
  stage.appendChild(el);
  board = { key: `${s.oyun}:${s.mod}`, el, mod: s.mod, cells, cols };
  layout();
}

function drawBoard(s, prev) {
  const fresh = !board || board.key !== `${s.oyun}:${s.mod}`;
  if (fresh) buildBoard(s);
  const m = MODLAR[s.mod];
  const novel = fresh ? [] : yeniTaslar(prev, s);
  const end = s.faz === 'bitti';
  const win = new Set(s.cizgi);
  const mine = s.faz === 'oyun' && s.sira === myIdx(s);
  board.el.classList.toggle('is-locked', !mine);
  board.el.classList.toggle('is-over', end);
  board.el.dataset.turn = String(s.sira);

  s.tahta.forEach((p, i) => {
    const cell = board.cells[i];
    let piece = cell.querySelector('.dt-disc, .dt-mark');
    if (p === -1) {
      piece?.remove();
    } else if (!piece || !piece.classList.contains(`p${p}`)) {
      piece?.remove();
      if (s.mod === 'dort') {
        piece = document.createElement('span');
        piece.className = `dt-disc p${p}`;
        piece.setAttribute('aria-hidden', 'true');
        cell.appendChild(piece);
      } else {
        cell.insertAdjacentHTML('beforeend', markSvg(p));
        piece = cell.lastElementChild;
        piece.classList.add(`p${p}`);
      }
      if (novel.includes(i)) animateIn(piece, s.mod === 'dort' ? Math.floor(i / m.cols) : 0, s.mod);
    }
    cell.classList.toggle('is-win', win.has(i));
    cell.classList.toggle('is-last', s.son === i && !end);
    if (s.mod === 'xox') {
      cell.disabled = p !== -1 || end;
      cell.setAttribute('aria-label', `${XOX_ADLAR[i]}: ${p === -1 ? 'boş' : p === 0 ? 'X' : 'O'}${win.has(i) ? ', kazanan çizgi' : ''}`);
    }
  });

  if (s.mod === 'dort') {
    board.cols.forEach((b, c) => {
      const r = inecegiSatir(s.tahta, m.cols, m.rows, c);
      board.cells.forEach((h, i) => { if (i % m.cols === c) h.classList.toggle('is-next', Math.floor(i / m.cols) === r); });
      const free = r + 1;
      b.disabled = end || r < 0;
      b.setAttribute('aria-label', `${c + 1}. sütun${r < 0 ? ', dolu' : `, ${free} boş`}`);
    });
  } else {
    drawStrike(s);
  }
}

// XOX: tek düz çizgide kazanınca üstüne çizgi çek.
function drawStrike(s) {
  const svg = board.el.querySelector('.dt-strike');
  if (!svg) return;
  if (s.cizgi.length !== 3) { svg.innerHTML = ''; return; }
  const c = (i) => [((i % 3) + 0.5) * 100, (Math.floor(i / 3) + 0.5) * 100];
  const [a, b] = [c(s.cizgi[0]), c(s.cizgi[2])];
  const ext = (p, q) => [p[0] + (p[0] - q[0]) * 0.18, p[1] + (p[1] - q[1]) * 0.18];
  const [x1, y1] = ext(a, b);
  const [x2, y2] = ext(b, a);
  svg.innerHTML = `<line class="p${s.kazanan}" pathLength="100" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
}

function animateIn(piece, row, mod) {
  if (REDUCED.matches || !piece.animate) return;
  if (mod === 'xox') { piece.classList.add('is-new'); return; }
  const cell = board.el.style.getPropertyValue('--cell');
  const size = parseFloat(cell) || 44;
  const gap = parseFloat(board.el.style.getPropertyValue('--gap')) || 6;
  const d = (row + 1) * (size + gap) + 8;
  const bounce = Math.min(10, size * 0.2);
  const dur = 260 + row * 50;
  piece.animate([
    { transform: `translateY(${-d}px)`, easing: 'cubic-bezier(.5,0,.95,.55)' },
    { transform: 'translateY(0)', offset: 0.76, easing: 'cubic-bezier(.2,.65,.4,1)' },
    { transform: `translateY(${-bounce}px)`, offset: 0.88, easing: 'cubic-bezier(.6,0,.85,.45)' },
    { transform: 'translateY(0)' },
  ], { duration: dur });
  setTimeout(() => sfx('snap'), Math.round(dur * 0.76));
}

// Tahta, üst ve alt öğelerden kalan yüksekliğe sığar; hepsi ekranın ortasında toplanır.
function layout() {
  if (!board) return;
  const cs = getComputedStyle(root);
  const gap = parseFloat(cs.rowGap) || 10;
  const padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
  const others = [root.querySelector('.dt-head'), scoreEl, statusEl, foot].reduce((a, el) => a + el.offsetHeight, 0);
  const w = stage.clientWidth;
  const h = Math.max(180, root.clientHeight - padY - others - gap * 4);
  if (!w) return;
  const m = MODLAR[board.mod];
  if (board.mod === 'dort') {
    const gap = w < 420 ? 5 : 8;
    const pad = w < 420 ? 8 : 12;
    const cell = Math.floor(Math.min((w - pad * 2 - gap * (m.cols - 1)) / m.cols, (h - pad * 2 - gap * (m.rows - 1)) / m.rows, 76));
    board.el.style.setProperty('--cell', `${Math.max(28, cell)}px`);
    board.el.style.setProperty('--gap', `${gap}px`);
    board.el.style.setProperty('--pad', `${pad}px`);
  } else {
    const cell = Math.floor(Math.min((w - 8) / 3, (h - 8) / 3, 132));
    board.el.style.setProperty('--cell', `${Math.max(60, cell)}px`);
  }
}

// ---------- etkileşim ----------
function play(x) {
  const s = sync.state ?? shown;
  if (!s || s.faz !== 'oyun') return;
  if (s.sira !== myIdx(s)) {
    announce(`Şimdi ${partnerName(s)} oynuyor.`);
    statusEl.classList.remove('is-nudge');
    void statusEl.offsetWidth;
    statusEl.classList.add('is-nudge');
    return;
  }
  const intent = { type: 'hamle', x };
  if (isHost) {
    sync.dispatch(intent);
    return;
  }
  // Misafir: hamleyi yerelde tahmin et, hemen göster.
  const guess = reduce(shown, toAction(intent, me));
  if (guess === shown) return;
  if (!sync.dispatch(intent)) { announce('Bağlantı yok, biraz sonra yeniden dene.'); return; }
  const base = sync.state;
  draw(guess);
  guessTimer = setTimeout(() => { if (sync.state === base) draw(sync.state); }, TAHMIN_MS);
}

function onBoardClick(e) {
  const col = e.target.closest('.dt-col');
  if (col) { play(Number(col.dataset.c)); return; }
  const cell = e.target.closest('.dt-cell');
  if (cell) { sfx('tap'); play(Number(cell.dataset.i)); }
}

// Ok tuşlarıyla sütun/hücre arasında gezin.
function onBoardKey(e) {
  const keys = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -3, ArrowDown: 3 };
  if (!(e.key in keys)) return;
  const list = board.mod === 'dort' ? board.cols : board.cells;
  const i = list.indexOf(document.activeElement);
  if (i < 0) return;
  let step = keys[e.key];
  if (board.mod === 'dort' && Math.abs(step) === 3) return;
  const n = i + step;
  if (n < 0 || n >= list.length) return;
  e.preventDefault();
  list[n].focus();
}

modSeg.addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-mod]');
  const s = sync.state ?? shown;
  if (!b || !s || b.dataset.mod === s.mod) return;
  if (s.faz === 'oyun' && s.hamle > 0
    && !(await confirmDialog(`Bu oyunu bırakıp ${MODLAR[b.dataset.mod].ad} oynayalım mı?`, { ok: 'Geçelim' }))) return;
  sfx('tap');
  sync.dispatch({ type: 'mod', mod: b.dataset.mod });
});

foot.addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-act="yeni"]');
  const s = sync.state ?? shown;
  if (!b || !s) return;
  if (s.faz === 'oyun' && s.hamle > 0 && !(await confirmDialog('Bu oyunu bırakıp baştan başlayalım mı?', { ok: 'Baştan' }))) return;
  sfx('tap');
  sync.dispatch({ type: 'yeni', oyun: s.oyun }); // gördüğüm oyun: aynı anda iki istek tek oyun açar
});

// ---------- ses, duyuru, bitiş ----------
function effects(s, prev) {
  const same = prev && prev.oyun === s.oyun && prev.mod === s.mod;
  if (!same) {
    announce(`${MODLAR[s.mod].ad}. ${s.sira === myIdx(s) ? 'Sen başlıyorsun.' : `${partnerName(s)} başlıyor.`}`);
    return;
  }
  if (s.hamle > prev.hamle) {
    const by = s.tahta[s.son];
    if (s.mod === 'xox' && by !== myIdx(s)) sfx('pop');
    const where = s.mod === 'dort' ? `${(s.son % 7) + 1}. sütuna bıraktın` : `${XOX_ADLAR[s.son].toLocaleLowerCase('tr')} hücreye koydun`;
    const who = by === myIdx(s) ? `Sen ${where}.` : `${partnerName(s)} ${where.replace('bıraktın', 'bıraktı').replace('koydun', 'koydu')}.`;
    announce(`${who} ${turnText(s)}`);
  }
  if (s.faz === 'bitti' && prev.faz !== 'bitti') endGame(s);
}

// Ödül onaylı duruma bağlı, endGame'e değil: misafirin tahmini (draw(guess)) de endGame'i çalıştırır,
// tahmin 3 sn'de geri alınırsa ev sahibi onayıyla ikinci kez çalışır. XOX ödül listesinde (SITE_OYUNLARI) yok.
function bitisOdulu(s, prev) {
  if (!prev || prev.oyun !== s.oyun || prev.mod !== s.mod) return;
  if (s.faz !== 'bitti' || prev.faz === 'bitti' || s.mod !== 'dort') return;
  const mi = myIdx(s);
  oyunOdulu({
    roomId, oyun: 'dorttas', sonuc: s.kazanan === -1 ? 'beraber' : s.kazanan === mi ? 'kazan' : 'kayip',
    ikiKisi: mi >= 0 && !s.players.includes('sevgilim'),
  });
}

function endGame(s) {
  const mi = myIdx(s);
  const sk = s.skor[s.mod];
  let kayit = null;
  if (isHost && roomId && loggedGame !== s.oyun) {
    loggedGame = s.oyun;
    logGame(roomId, NS, resultOf(s));
    kayit = skorKaydet(room, NS, { kazanan: s.kazanan === -1 ? null : s.players[s.kazanan] });
  }
  if (s.kazanan === mi) sfx('win');
  else if (s.kazanan === -1) sfx('match');
  else sfx('wrong');
  const title = s.kazanan === -1 ? 'Berabere! Tam uyum 🤝' : s.kazanan === mi ? 'Kazandın! 🎉' : `${partnerName(s)} kazandı! 🎉`;
  const lines = [
    `${MODLAR[s.mod].ad}: Sen ${sk[mi]} – ${sk[1 - mi]} ${partnerName(s)}`,
    sk[2] ? `${sk[2]} kez berabere` : `${s.hamle} hamle`,
  ];
  // Kazanan dörtlüyü önce bir an göster, sonra kutla.
  clearTimeout(celebrateTimer);
  celebrateTimer = setTimeout(() => {
    if (shown?.faz !== 'bitti' || shown.oyun !== s.oyun) return;
    closeCelebrate = celebrate({
      title,
      lines: [...lines, toplamSatiri(room, NS, s.players, s.names, kayit)],
      buttons: [
        { label: 'Tekrar oyna', primary: true, onClick: () => { closeCelebrate = null; sync.dispatch({ type: 'yeni', oyun: s.oyun }); } },
        { label: 'Ana sayfaya dön', onClick: () => { location.href = lobbyUrl(); } },
      ],
    });
  }, REDUCED.matches ? 400 : 1300);
}
