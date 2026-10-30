// Amiral Battı sayfası. Ev sahibi sırayı ve atış geçmişini tutar; her filo yalnız kendi
// cihazında (sessionStorage) durur. Savunan cihaz atışın sonucunu kendisi hesaplar.
import { joinRoom, partnerGoruyor } from '../../js/core/room.js';
import { readGameParams, lobbyUrl } from '../../js/core/identity.js';
import { mountShell, waitForPartner, celebrate, confirmDialog, toast } from '../../js/core/ui.js';
import { sfx } from '../../js/core/sound.js';
import { logGame } from '../../js/core/db.js';
import { skorKaydet, toplamSatiri } from '../../js/core/skor.js';
import { bildir } from '../../js/core/bildirim.js';
import { siraPartnere } from '../dama/kayit.js';
import { createSync, sessionStore } from '../hafiza/sync.js';
import { mulberry32, newSeed } from '../hafiza/rng.js';
import { esc } from '../hafiza/ekran.js';
import {
  N, FILO, gemiTanim, koord, hucreler, yerlesimHatasi, filoGecerli, rastgeleFilo, dondur,
  dogrula, batanlar, initialState, reduce, toAction, cevapla, resultOf,
} from './oyun.js';

const NS = 'amiral';
const CEVAP_MS = 480; // savunan cihaz sonucu biraz bekleyip yollar (gerilim)
const HARF = 'ABCDEFGHIJ';
const HATA = {
  disari: 'Tahtanın dışına taşıyor.',
  cakisma: 'Başka bir gemiyle çakışıyor.',
  temas: 'Gemiler birbirine değmemeli.',
};
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)');
const store = sessionStore();

const { roomId, hostId, isHost } = readGameParams();
const room = await joinRoom({ roomId, ns: NS });
mountShell({ title: 'Amiral Battı', room });

const app = document.getElementById('app');
app.innerHTML = `
  <section class="am" id="am" aria-label="Amiral Battı">
    <div class="am-body" id="am-body"><p class="muted am-wait">Bağlanıyor…</p></div>
    <p class="sr-only" id="am-live" aria-live="polite"></p>
    <div class="am-away hidden" id="am-away" role="status">
      <div class="card stack center">
        <p class="am-away-title">Sevgilin dönünce devam 💞</p>
        <p class="muted">Gemiler demirde bekliyor.</p>
      </div>
    </div>
  </section>`;
const body = document.getElementById('am-body');
const live = document.getElementById('am-live');
const away = document.getElementById('am-away');

await waitForPartner(room, { ns: NS, text: 'Sevgilin gelince filolarınızı gizlice yerleştirirsiniz.' });
const me = room.me.clientId;
const partner = room.partner();
const players = [me, partner?.clientId || 'sevgilim'];
const names = { [me]: room.me.name, [players[1]]: partner?.name || '' };

// ---------- yerel durum (yalnız bu cihazda) ----------
let filo = [];          // kendi gemilerim; yerleşimde eksik olabilir
let filoKimlik = null;  // hangi oyunun filosu
let secili = null;      // seçili gemi kimliği
let seciliYon = 'y';
let nisan = null;       // düşman tahtasında nişan { x, y }
let atesBekliyor = false;
let cevapKey = '';
let cevapAt = 0;
let cevapTimer = 0;
let filoYollandi = null;
let filoAt = 0;
let view = null;        // { key, ... } kurulu ekran
let drag = null;
let closeCelebrate = null;
let celebrateTimer = 0;
let loggedTur = null;
let celebratedTur = null;
let awayTimer = 0;
let lastNote = '';

const sync = createSync({
  room, ns: NS, hostId, isHost, solo: false,
  reduce,
  toAction: (intent, by, s) => toAction(intent, by, s, { kimlik: newSeed(), hostId: me }),
  initial: initialState({ players, names, kimlik: newSeed() }),
  storage: store,
  storeKey: `bizim.amiral.${roomId || '-'}`,
  accept: (s) => s.v === 1 && s.players?.join() === players.join(),
  onState: (s, prev) => { render(s, prev); siraBildir(s, prev); },
  onPeer: (here) => {
    clearTimeout(awayTimer);
    if (here) away.classList.add('hidden');
    else awayTimer = setTimeout(() => away.classList.remove('hidden'), 1200);
  },
  onJoin: (from) => fillSeat(from),
});

// Ev sahibi: başka cihazdan (yeni clientId) dönen partner, oyundaki koltuğuna oturur.
// Filo o cihazda olmadığından oyun sürüyorsa "filon bulunamadı" görür ve yeni oyun açar.
function fillSeat(p) {
  if (!isHost || !p?.clientId || p.clientId === me) return;
  sync.dispatch({ t: 'seat', ids: [me, p.clientId], names: p.name ? { [p.clientId]: p.name } : {} });
}

window.addEventListener('pointermove', onDragMove, { passive: false });
window.addEventListener('pointerup', onDragEnd);
window.addEventListener('pointercancel', onDragEnd);
sync.start();
if (isHost) room.on('presence', (p) => { if (p) fillSeat(p); });

// "Sıra sende" bildirimi (dama/masa.js kalıbı): sırayı devreden cihaz yollar; partner bu oyunda ve
// uygulaması öndeyse yollanmaz.
function siraBildir(s, prev) {
  const holder = (x) => (x?.faz === 'oyun' ? x.players[x.sira] : null);
  if (!prev || !roomId || !siraPartnere(holder(prev), holder(s), me) || partnerGoruyor(room.partner(), NS)) return;
  const metin = prev.faz !== 'oyun'
    ? 'Amiral Battı: savaş başladı · ilk atış senin'
    : `Amiral Battı: ${room.me.name || 'Sevgilin'} ıskaladı · atış sırası sende`;
  bildir(roomId, { tur: 'oyun', baslik: 'Sıra sende', metin, url: `games/${NS}/?oda=${roomId}&host=${isHost ? me : hostId}` });
}

// ---------- yardımcılar ----------
const later = (fn, ms = 0) => setTimeout(fn, ms);
function myIdx(s) { return s.players.indexOf(me); }
function nameOf(s, k) {
  const id = s.players[k];
  if (id === me) return 'Sen';
  return s.names?.[id] || 'Sevgilin';
}
function pName(s) { return nameOf(s, 1 - myIdx(s)); }
function kural(s = sync.state) { return { temasYok: s ? s.temasYok : true }; }
function announce(text) { if (text) live.textContent = text; }
function filoKey(k) { return `bizim.amiral.filo.${roomId || '-'}.${k}`; }
function filoYukle(k) {
  if (filoKimlik === k) return;
  filoKimlik = k;
  filo = [];
  secili = null;
  nisan = null;
  try {
    const v = JSON.parse(store?.get(filoKey(k)) || 'null');
    if (Array.isArray(v)) filo = v.filter((g) => gemiTanim(g?.id) && (g.yon === 'y' || g.yon === 'd'));
  } catch { /* bozuk kayıt */ }
}
function filoKaydet() {
  try { store?.set(filoKey(filoKimlik), JSON.stringify(filo)); } catch { /* dolu */ }
}
function gemiHucredenCikar(b) {
  const xs = b.hucreler.map((p) => p[0]);
  const ys = b.hucreler.map((p) => p[1]);
  return { id: b.id, x: Math.min(...xs), y: Math.min(...ys), yon: new Set(ys).size === 1 ? 'y' : 'd' };
}

// ---------- tahta bileşeni ----------
function makeGrid({ kind, labels, aria }) {
  const wrap = document.createElement('div');
  wrap.className = `am-grid ${kind}${labels ? ' has-labels' : ''}`;
  wrap.innerHTML = `${labels ? `
      <div class="am-lbl am-lbl-x" aria-hidden="true">${HARF.split('').map((h) => `<span>${h}</span>`).join('')}</div>
      <div class="am-lbl am-lbl-y" aria-hidden="true">${Array.from({ length: N }, (_, i) => `<span>${i + 1}</span>`).join('')}</div>` : ''}
    <div class="am-sea">
      <div class="am-cells" role="group" aria-label="${esc(aria)}"></div>
      <div class="am-ships"></div>
      <div class="am-marks" aria-hidden="true"></div>
    </div>`;
  const cellsEl = wrap.querySelector('.am-cells');
  const marksEl = wrap.querySelector('.am-marks');
  const cells = [];
  const marks = [];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const c = document.createElement(kind === 'mini' ? 'span' : 'button');
      c.className = 'am-cell';
      if (kind !== 'mini') {
        c.type = 'button';
        c.dataset.x = String(x);
        c.dataset.y = String(y);
        c.tabIndex = x === 0 && y === 0 ? 0 : -1;
        c.setAttribute('aria-label', koord(x, y));
      }
      cellsEl.appendChild(c);
      cells.push(c);
      const m = document.createElement('span');
      m.className = 'am-mark';
      marksEl.appendChild(m);
      marks.push(m);
    }
  }
  if (kind !== 'mini') cellsEl.addEventListener('keydown', onGridKey);
  return { wrap, sea: wrap.querySelector('.am-sea'), cells, ships: wrap.querySelector('.am-ships'), marks };
}

// Ok tuşlarıyla hücreler arasında gezin (tek sekme durağı).
function onGridKey(e) {
  const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
  const c = e.target.closest('.am-cell');
  if (!d || !c) return;
  const x = Math.min(N - 1, Math.max(0, Number(c.dataset.x) + d[0]));
  const y = Math.min(N - 1, Math.max(0, Number(c.dataset.y) + d[1]));
  const next = c.parentElement.children[y * N + x];
  e.preventDefault();
  c.tabIndex = -1;
  next.tabIndex = 0;
  next.focus();
}

function shipEl(g, cls = '') {
  const t = gemiTanim(g.id);
  const el = document.createElement('div');
  el.className = `am-ship ${g.yon === 'd' ? 'is-v' : 'is-h'} ${cls}`.trim();
  el.dataset.id = g.id;
  el.style.setProperty('--x', g.x);
  el.style.setProperty('--y', g.y);
  el.style.setProperty('--boy', t.boy);
  el.setAttribute('aria-hidden', 'true');
  return el;
}

function paintMarks(G, shots, { pending = null, aim = null, fresh = null } = {}) {
  const st = new Map();
  for (const a of shots) st.set(a.y * N + a.x, a);
  const last = shots.at(-1);
  G.marks.forEach((m, i) => {
    const a = st.get(i);
    let cls = 'am-mark';
    if (a) cls += a.vurdu ? ' hit' : ' miss';
    if (a && fresh && a === last) cls += ' is-new';
    if (a && a === last) cls += ' is-last';
    if (pending && pending.y * N + pending.x === i) cls += ' is-pending';
    if (aim && aim.y * N + aim.x === i) cls += ' is-aim';
    if (m.className !== cls) m.className = cls;
  });
}

// ---------- çizim ----------
function render(s, prev) {
  if (!s) return;
  if (myIdx(s) < 0) { renderIzle(); return; }
  filoYukle(s.kimlik);
  atesBekliyor = false;
  const mi = myIdx(s);
  if (s.faz !== 'bitti') {
    clearTimeout(celebrateTimer);
    if (closeCelebrate) { try { closeCelebrate(); } catch { /* kapalı */ } closeCelebrate = null; }
  }
  // Hazır görünüp filosu kaybolan cihaz (ör. depolama silindi) hazırlığı geri alır.
  if (s.faz === 'yerlesim' && s.hazir[mi] && !filoGecerli(filo, kural(s))) later(() => sync.dispatch({ t: 'hazir', hazir: false }));
  if (s.faz === 'yerlesim') renderYerlesim(s);
  else renderOyun(s, prev);
  cevapGerekirse(s);
  filoAcGerekirse(s);
  effects(s, prev);
}

// Bu cihaz oyunda değil (koltuk henüz bu clientId'ye geçmedi): yalnız bekler.
function renderIzle() {
  if (view?.key === 'izle') return;
  view = { key: 'izle' };
  body.innerHTML = `
    <div class="card stack center am-izle">
      <p class="am-away-title">Bu oyun başka bir cihazda sürüyor</p>
      <p class="muted">Sevgilin seni oyuna alınca buradan devam edersin.</p>
    </div>`;
}

// ----- Yerleşim -----
function renderYerlesim(s) {
  const key = `yer:${s.kimlik}`;
  if (view?.key !== key) {
    body.innerHTML = `
      <div class="am-yer">
        <div class="am-head">
          <h2 class="am-h">Filonu yerleştir</h2>
          <p class="am-hint" id="am-hint">Gemiyi sürükle; dokununca döner. ${esc(pName(s))} göremez 🤫</p>
        </div>
        <div class="am-board-slot"></div>
        <div class="am-tray" role="group" aria-label="Gemiler"></div>
        <div class="am-tools">
          <button type="button" class="btn small" data-act="dondur">Döndür</button>
          <button type="button" class="btn small" data-act="rastgele">Rastgele dağıt</button>
          <button type="button" class="btn small ghost" data-act="temizle">Temizle</button>
        </div>
        <button type="button" class="am-switch" role="switch" data-act="kural">
          <span class="am-switch-track" aria-hidden="true"><span class="am-switch-dot"></span></span>
          <span>Gemiler birbirine değmesin</span>
        </button>
        <div class="am-ready">
          <p class="am-partner" id="am-partner"></p>
          <button type="button" class="btn primary wide" data-act="hazir">Hazırım</button>
        </div>
      </div>`;
    const G = makeGrid({ kind: 'own', labels: true, aria: 'Senin denizin' });
    body.querySelector('.am-board-slot').replaceWith(G.wrap);
    view = { key, G, root: body.querySelector('.am-yer') };
    view.root.addEventListener('click', onYerClick);
    G.ships.addEventListener('pointerdown', (e) => {
      const el = e.target.closest('.am-ship');
      if (el && !sync.state?.hazir[myIdx(sync.state)]) onDragStart(e, el.dataset.id, true, el);
    });
    view.root.querySelector('.am-tray').addEventListener('pointerdown', (e) => {
      const b = e.target.closest('.am-tray-ship');
      if (b) onDragStart(e, b.dataset.id, false, b);
    });
  }
  paintYerlesim(s);
}

function paintYerlesim(s) {
  if (!view?.G || !view.key.startsWith('yer:')) return;
  const { G, root } = view;
  const mi = myIdx(s);
  const ready = s.hazir[mi];
  const k = kural(s);
  root.classList.toggle('is-ready', ready);
  if (!drag) {
    G.ships.replaceChildren(...filo.map((g) => {
      const bad = yerlesimHatasi(filo, g, k);
      return shipEl(g, `${bad ? 'is-bad' : ''} ${g.id === secili && !ready ? 'is-sel' : ''}`);
    }));
  }
  paintMarks(G, []);
  const tray = root.querySelector('.am-tray');
  tray.hidden = ready;
  if (!drag) tray.innerHTML = FILO.map((t) => {
    const placed = filo.some((g) => g.id === t.id);
    return `<button type="button" class="am-tray-ship${placed ? ' is-placed' : ''}${secili === t.id ? ' is-sel' : ''}"
      data-id="${t.id}" aria-pressed="${secili === t.id}" aria-label="${t.ad}, ${t.boy} kare${placed ? ', yerleşti' : ''}">
      <span class="am-cap" style="--boy:${t.boy}" aria-hidden="true">${'<i></i>'.repeat(t.boy)}</span>
      <span class="am-tray-name">${t.ad}</span></button>`;
  }).join('');
  root.querySelector('.am-tools').hidden = ready;
  const sw = root.querySelector('.am-switch');
  sw.setAttribute('aria-checked', String(k.temasYok));
  sw.disabled = s.hazir.some(Boolean);
  sw.title = sw.disabled ? 'Biriniz hazır olunca kural değişmez' : '';
  const valid = filoGecerli(filo, k);
  const btn = root.querySelector('[data-act="hazir"]');
  btn.textContent = ready ? 'Düzenle' : valid ? 'Hazırım' : `Hazırım · ${filo.length}/${FILO.length}`;
  btn.classList.toggle('primary', !ready);
  btn.classList.toggle('ghost', ready);
  btn.disabled = !ready && !valid;
  const other = s.hazir[1 - mi];
  root.querySelector('#am-partner').innerHTML = ready
    ? `<b>Hazırsın.</b> ${other ? '' : `${esc(pName(s))} gemilerini yerleştiriyor…`}`
    : other ? `<span class="am-ok">✓</span> ${esc(pName(s))} hazır, seni bekliyor.` : `${esc(pName(s))} gemilerini yerleştiriyor…`;
  G.cells.forEach((c) => { c.disabled = ready; });
}

function hint(text, bad = false) {
  const el = document.getElementById('am-hint');
  if (!el) return;
  el.textContent = text;
  el.classList.toggle('is-bad', bad);
  announce(text);
}

function nextUnplaced() {
  return FILO.find((t) => !filo.some((g) => g.id === t.id))?.id ?? null;
}

function placeShip(g) {
  filo = [...filo.filter((x) => x.id !== g.id), g];
  filoKaydet();
}

function tryPlace(g) {
  const err = yerlesimHatasi(filo, g, kural());
  if (err) { hint(HATA[err], true); sfx('wrong'); shakeSea(); return false; }
  placeShip(g);
  sfx('snap');
  return true;
}

function rotateShip(id) {
  const g = filo.find((x) => x.id === id);
  if (!g) { seciliYon = seciliYon === 'y' ? 'd' : 'y'; hint(`Yön: ${seciliYon === 'y' ? 'yatay' : 'dikey'}`); return; }
  const t = gemiTanim(id);
  const r = dondur(g);
  if (r.yon === 'd') r.y = Math.min(r.y, N - t.boy);
  else r.x = Math.min(r.x, N - t.boy);
  secili = id;
  if (tryPlace(r)) hint(`${t.ad} döndü.`);
}

function shakeSea() {
  const sea = view?.G?.sea;
  if (!sea || REDUCED.matches) return;
  sea.animate?.([{ translate: '0' }, { translate: '-5px' }, { translate: '5px' }, { translate: '0' }], { duration: 240 });
}

async function onYerClick(e) {
  const s = sync.state;
  if (!s) return;
  const mi = myIdx(s);
  const ready = s.hazir[mi];
  const cell = e.target.closest('.am-cell');
  const trayBtn = e.target.closest('.am-tray-ship');
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (cell && !ready) {
    if (!secili) { hint('Önce aşağıdan bir gemi seç ya da sürükle.'); return; }
    const old = filo.find((g) => g.id === secili);
    const g = { id: secili, x: Number(cell.dataset.x), y: Number(cell.dataset.y), yon: old ? old.yon : seciliYon };
    if (tryPlace(g)) {
      secili = old ? secili : nextUnplaced();
      hint(secili ? `Sıradaki: ${gemiTanim(secili).ad}. Dokunduğun kareye koyarım.` : 'Filo tamam! Hazır olunca söyle.');
    }
    paintYerlesim(s);
    return;
  }
  if (trayBtn) {
    if (trayBtn._dragged) { trayBtn._dragged = false; return; }
    secili = secili === trayBtn.dataset.id ? null : trayBtn.dataset.id;
    sfx('tap');
    if (secili) {
      const t = gemiTanim(secili);
      hint(`${t.ad} (${t.boy}) seçili. Bir kareye dokun ya da sürükle.`);
    }
    paintYerlesim(s);
    return;
  }
  switch (act) {
    case 'dondur':
      if (secili) rotateShip(secili);
      else { seciliYon = seciliYon === 'y' ? 'd' : 'y'; hint(`Yeni gemiler ${seciliYon === 'y' ? 'yatay' : 'dikey'} konacak.`); }
      paintYerlesim(s);
      break;
    case 'rastgele':
      filo = rastgeleFilo(mulberry32(newSeed()), kural(s));
      secili = null;
      filoKaydet();
      sfx('flip');
      hint('Filo denize indi. Beğenmezsen yeniden dağıt.');
      paintYerlesim(s);
      break;
    case 'temizle':
      if (!filo.length) return;
      filo = [];
      secili = FILO[0].id;
      filoKaydet();
      hint('Tahta boş. Gemileri yeniden yerleştir.');
      paintYerlesim(s);
      break;
    case 'kural':
      if (s.hazir.some(Boolean)) return;
      sfx('tap');
      sync.dispatch({ t: 'kural', temasYok: !s.temasYok });
      break;
    case 'hazir':
      if (ready) { sync.dispatch({ t: 'hazir', hazir: false }); return; }
      if (!filoGecerli(filo, kural(s))) { hint('Önce beş gemiyi de kurala uygun yerleştir.', true); return; }
      secili = null;
      sfx('pop');
      sync.dispatch({ t: 'hazir', hazir: true });
      break;
    default:
  }
}

// ----- Sürükle-bırak (fare ve dokunma) -----
function onDragStart(e, id, fromBoard, el) {
  if (e.button !== 0 && e.pointerType === 'mouse') return;
  const s = sync.state;
  if (!s || s.faz !== 'yerlesim' || s.hazir[myIdx(s)]) return;
  const g = filo.find((x) => x.id === id);
  const t = gemiTanim(id);
  const yon = g ? g.yon : seciliYon;
  let grabK = 0;
  if (fromBoard && g) {
    const r = view.G.sea.getBoundingClientRect();
    const cw = r.width / N;
    grabK = yon === 'y' ? Math.floor((e.clientX - r.left) / cw) - g.x : Math.floor((e.clientY - r.top) / cw) - g.y;
  } else {
    const cap = el.querySelector('.am-cap')?.getBoundingClientRect();
    if (cap) grabK = Math.floor(((e.clientX - cap.left) / cap.width) * t.boy);
  }
  grabK = Math.max(0, Math.min(t.boy - 1, grabK));
  drag = { id, yon, grabK, fromBoard, x0: e.clientX, y0: e.clientY, moved: false, pid: e.pointerId, el, cand: null, touch: e.pointerType === 'touch' };
  try { el.setPointerCapture(e.pointerId); } catch { /* yok */ }
}

function onDragMove(e) {
  if (!drag || e.pointerId !== drag.pid) return;
  if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 8) return;
  e.preventDefault();
  if (!drag.moved) {
    drag.moved = true;
    drag.el.classList.add('is-lifted');
    secili = drag.id;
  }
  const r = view.G.sea.getBoundingClientRect();
  const cw = r.width / N;
  const px = e.clientX;
  const py = e.clientY - (drag.touch ? cw * 0.9 : 0); // parmak gemiyi örtmesin
  const inside = px > r.left - cw && px < r.right + cw && py > r.top - cw && py < r.bottom + cw;
  let prev = view.G.ships.querySelector('.is-preview');
  if (!inside) {
    drag.cand = null;
    prev?.remove();
    return;
  }
  const cx = Math.floor((px - r.left) / cw);
  const cy = Math.floor((py - r.top) / cw);
  const g = { id: drag.id, yon: drag.yon, x: cx - (drag.yon === 'y' ? drag.grabK : 0), y: cy - (drag.yon === 'd' ? drag.grabK : 0) };
  const err = yerlesimHatasi(filo, g, kural());
  drag.cand = { g, err };
  const el = shipEl(g, `is-preview${err ? ' is-bad' : ''}`);
  if (prev) prev.replaceWith(el); else view.G.ships.appendChild(el);
}

function onDragEnd(e) {
  if (!drag || e.pointerId !== drag.pid) return;
  const d = drag;
  drag = null;
  d.el.classList.remove('is-lifted');
  view?.G?.ships.querySelector('.is-preview')?.remove();
  const s = sync.state;
  if (!s) return;
  // Yeniden çizim, ardından gelen click hedefini silmesin diye bir sonraki göreve kalır.
  const paint = () => later(() => paintYerlesim(sync.state));
  if (!d.moved) {
    if (d.fromBoard) { rotateShip(d.id); paint(); } // dokunma: döndür (tepsideki dokunuşu click seçer)
    return;
  }
  if (!d.fromBoard) d.el._dragged = true; // ardından gelen click seçim yapmasın
  if (d.cand && !d.cand.err) {
    placeShip(d.cand.g);
    sfx('snap');
    secili = d.id;
    hint(filoGecerli(filo, kural(s)) ? 'Filo tamam! Hazır olunca söyle.' : `${gemiTanim(d.id).ad} yerleşti.`);
  } else if (!d.cand && d.fromBoard) {
    filo = filo.filter((g) => g.id !== d.id);
    filoKaydet();
    sfx('pop');
    hint(`${gemiTanim(d.id).ad} limana döndü.`);
  } else if (d.cand?.err) {
    hint(HATA[d.cand.err], true);
    sfx('wrong');
    shakeSea();
  }
  paint();
}

// ----- Oyun -----
function renderOyun(s, prev) {
  const key = `oyun:${s.kimlik}`;
  if (view?.key !== key) {
    body.innerHTML = `
      <div class="am-oyun">
        <div class="am-top">
          <div class="am-score" id="am-score"></div>
          <p class="am-status" id="am-status"></p>
          <p class="am-note" id="am-note"></p>
        </div>
        <div class="am-boards">
          <div class="am-side enemy">
            <div class="am-side-head"><h2 class="am-sub" id="am-enemy-title"></h2><div class="am-fleet" id="am-enemy-fleet"></div></div>
            <div class="am-enemy-slot"></div>
            <div class="am-fire"><button type="button" class="btn primary wide" data-act="ates" disabled>Ateş et</button></div>
          </div>
          <div class="am-side own">
            <div class="am-side-head"><h2 class="am-sub">Senin denizin</h2><div class="am-fleet" id="am-own-fleet"></div></div>
            <div class="am-own-slot"></div>
          </div>
        </div>
        <div class="am-end" id="am-end" hidden></div>
      </div>`;
    const E = makeGrid({ kind: 'enemy', labels: true, aria: 'Sevgilinin denizi: hedef seç' });
    const O = makeGrid({ kind: 'mini', labels: false, aria: 'Senin denizin' });
    body.querySelector('.am-enemy-slot').replaceWith(E.wrap);
    body.querySelector('.am-own-slot').replaceWith(O.wrap);
    view = { key, E, O, root: body.querySelector('.am-oyun') };
    E.wrap.querySelector('.am-cells').addEventListener('click', onEnemyClick);
    view.root.addEventListener('click', onOyunClick);
    prev = null;
  }
  paintOyun(s, prev);
}

function fleetChips(sunk) {
  return FILO.map((t) => `<span class="am-chip${sunk.has(t.id) ? ' is-sunk' : ''}" title="${t.ad}${sunk.has(t.id) ? ' (battı)' : ''}">
    <span class="am-cap sm" style="--boy:${t.boy}" aria-hidden="true">${'<i></i>'.repeat(t.boy)}</span></span>`).join('');
}

function paintOyun(s, prev) {
  const { E, O, root } = view;
  const mi = myIdx(s);
  const pi = 1 - mi;
  const mine = s.atislar[mi];
  const theirs = s.atislar[pi];
  const end = s.faz === 'bitti';
  const sunkEnemy = batanlar(mine);
  const sunkMine = batanlar(theirs);
  const b = s.bekleyen;
  const myTurn = s.faz === 'oyun' && s.sira === mi && !b;
  root.classList.toggle('is-my-turn', myTurn);
  root.classList.toggle('is-end', end);
  if (!myTurn) nisan = null;

  // Skor ve durum
  const hits = (l) => l.filter((a) => a.vurdu).length;
  const total = FILO.reduce((a, t) => a + t.boy, 0);
  document.getElementById('am-score').innerHTML = `
    <span class="am-pl${s.sira === mi && !end ? ' is-turn' : ''}"><b>Sen</b> <span class="am-num">${s.skor[mi]}</span></span>
    <span class="am-vs" aria-hidden="true">–</span>
    <span class="am-pl${s.sira === pi && !end ? ' is-turn' : ''}"><span class="am-num">${s.skor[pi]}</span> <b>${esc(pName(s))}</b></span>`;
  const status = document.getElementById('am-status');
  let st;
  if (end) st = s.kazanan === mi ? 'Kazandın! Amiral sensin ⚓' : `${pName(s)} kazandı 🌊`;
  else if (b && b.idx === mi) st = `${koord(b.x, b.y)} hedefine ateş edildi…`;
  else if (b) st = `${pName(s)} ${koord(b.x, b.y)} hedefine ateş etti!`;
  else if (myTurn) st = 'Sıra sende: hedef seç';
  else st = `${pName(s)} nişan alıyor…`;
  status.textContent = st;
  status.dataset.state = end ? (s.kazanan === mi ? 'win' : 'lose') : myTurn ? 'mine' : 'wait';

  document.getElementById('am-enemy-title').textContent = `Sevgilinin denizi · ${hits(mine)}/${total}`;
  document.getElementById('am-enemy-fleet').innerHTML = fleetChips(sunkEnemy);
  document.getElementById('am-own-fleet').innerHTML = fleetChips(sunkMine);

  // Düşman tahtası: batırdıklarım, bitince kalanlar açılır
  const enemyShips = mine.filter((a) => a.batti).map((a) => shipEl(gemiHucredenCikar(a.batti), 'is-sunk'));
  const enemyFleet = s.filolar[pi];
  if (end && enemyFleet) {
    for (const g of enemyFleet) if (!sunkEnemy.has(g.id)) enemyShips.push(shipEl(g, 'is-revealed'));
  }
  E.ships.replaceChildren(...enemyShips);
  const freshMine = !!prev && prev.atislar[mi].length < mine.length;
  paintMarks(E, mine, { pending: b && b.idx === mi ? b : null, aim: myTurn ? nisan : null, fresh: freshMine });
  const shot = new Set(mine.map((a) => a.y * N + a.x));
  E.cells.forEach((c, i) => {
    const a = mine.find((t) => t.y * N + t.x === i);
    c.setAttribute('aria-label', `${koord(i % N, Math.floor(i / N))}${a ? (a.batti ? `: ${a.batti.ad} battı` : a.vurdu ? ': isabet' : ': ıska') : ''}`);
    c.setAttribute('aria-disabled', String(!myTurn || shot.has(i)));
  });
  E.wrap.classList.toggle('is-locked', !myTurn);

  // Kendi tahtam: gemilerim ve ona yapılan atışlar
  O.ships.replaceChildren(...filo.map((g) => shipEl(g, sunkMine.has(g.id) ? 'is-sunk' : '')));
  const freshTheirs = !!prev && prev.atislar[pi].length < theirs.length;
  paintMarks(O, theirs, { pending: b && b.idx === pi ? b : null, fresh: freshTheirs });
  O.wrap.classList.toggle('is-target', !!b && b.idx === pi);

  // Ateş düğmesi
  const fire = root.querySelector('[data-act="ates"]');
  fire.disabled = !myTurn || !nisan || atesBekliyor;
  fire.textContent = nisan && myTurn ? `Ateş et · ${koord(nisan.x, nisan.y)}` : myTurn ? 'Hedef seç' : 'Ateş et';
  fire.closest('.am-fire').hidden = end;

  // Filo bu cihazda yoksa (başka cihaz / silinmiş depolama) oyun sürdürülemez
  const endBox = document.getElementById('am-end');
  const lost = !end && !filoGecerli(filo, kural(s));
  if (end) {
    const fair = !s.filolar[pi] || dogrula(s.filolar[pi], mine);
    endBox.hidden = false;
    endBox.innerHTML = `
      ${fair ? '' : '<p class="am-warn">Hmm, sonuçlar açılan filoyla uyuşmuyor 🤨</p>'}
      <button type="button" class="btn primary" data-act="yeni">Tekrar oyna</button>
      <a class="btn ghost" href="${esc(lobbyUrl())}">Ana sayfaya dön</a>`;
  } else if (lost) {
    endBox.hidden = false;
    endBox.innerHTML = `<p class="am-warn">Filon bu cihazda bulunamadı. Yeni oyunla devam edin.</p>
      <button type="button" class="btn" data-act="yeni">Yeni oyun</button>`;
  } else {
    endBox.hidden = true;
    endBox.innerHTML = '';
  }
}

function onEnemyClick(e) {
  const c = e.target.closest('.am-cell');
  const s = sync.state;
  if (!c || !s) return;
  const mi = myIdx(s);
  const x = Number(c.dataset.x);
  const y = Number(c.dataset.y);
  if (s.faz !== 'oyun' || s.sira !== mi || s.bekleyen) {
    announce(s.faz === 'oyun' ? `Şimdi ${pName(s)} atıyor.` : '');
    return;
  }
  if (s.atislar[mi].some((a) => a.x === x && a.y === y)) { announce(`${koord(x, y)} zaten denendi.`); return; }
  if (nisan && nisan.x === x && nisan.y === y) { fire(); return; } // aynı kareye ikinci dokunuş: ateş
  nisan = { x, y };
  sfx('tick');
  announce(`Nişan: ${koord(x, y)}. Ateş etmek için yeniden dokun ya da Ateş et.`);
  paintOyun(s, s);
}

function fire() {
  const s = sync.state;
  if (!s || !nisan || atesBekliyor) return;
  const { x, y } = nisan;
  nisan = null;
  atesBekliyor = true;
  sfx('tap');
  if (!sync.dispatch({ t: 'atis', x, y })) {
    atesBekliyor = false;
    toast('Bağlantı yok; biraz sonra yeniden dene.');
  }
  paintOyun(sync.state, sync.state);
}

async function onOyunClick(e) {
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'ates') fire();
  if (act === 'yeni') {
    const s = sync.state;
    if (!s) return;
    if (s.faz === 'oyun' && !(await confirmDialog('Bu oyunu bırakıp yeniden başlayalım mı?', { ok: 'Yeni oyun' }))) return;
    sync.dispatch({ t: 'yeni', tur: s.tur }); // gördüğüm oyun: aynı anda iki istek tek oyun açar
  }
}

// ---------- savunma: sonucu bu cihaz hesaplar ----------
function cevapGerekirse(s) {
  const intent = cevapla(s, myIdx(s), filoGecerli(filo, kural(s)) ? filo : null);
  if (!intent) return;
  const b = s.bekleyen;
  const key = `${s.kimlik}:${s.atislar[b.idx].length}:${b.x},${b.y}`;
  if (key === cevapKey && Date.now() - cevapAt < 2500) return; // yeniden yayında tekrar cevaplama
  cevapKey = key;
  cevapAt = Date.now();
  clearTimeout(cevapTimer);
  cevapTimer = later(() => {
    const now = sync.state;
    const nb = now?.bekleyen;
    if (!nb || `${now.kimlik}:${now.atislar[nb.idx].length}:${nb.x},${nb.y}` !== key) return;
    sync.dispatch(intent);
  }, CEVAP_MS);
}

// Oyun bitince kendi filomu açarım (kaybedenin filosu son sonuçla zaten gelir).
function filoAcGerekirse(s) {
  const mi = myIdx(s);
  if (s.faz !== 'bitti' || s.filolar[mi] || !filoGecerli(filo, kural(s))) return;
  if (filoYollandi === s.kimlik && Date.now() - filoAt < 3000) return;
  filoYollandi = s.kimlik;
  filoAt = Date.now();
  later(() => sync.dispatch({ t: 'filo', filo }));
}

// ---------- ses, duyuru, bitiş ----------
function note(text, tone = '') {
  const el = document.getElementById('am-note');
  if (!el || !text) return;
  lastNote = text;
  el.textContent = text;
  el.dataset.tone = tone;
  el.classList.remove('is-in');
  void el.offsetWidth;
  el.classList.add('is-in');
  announce(text);
}

function effects(s, prev) {
  if (!prev || prev.kimlik !== s.kimlik) {
    if (s.faz === 'yerlesim') announce('Yeni oyun: filonu yerleştir.');
    return;
  }
  const mi = myIdx(s);
  const pi = 1 - mi;
  if (prev.faz === 'yerlesim' && s.faz === 'oyun') {
    sfx('pop');
    note(s.sira === mi ? 'Savaş başladı! İlk atış senden.' : `Savaş başladı! İlk atışı ${pName(s)} yapacak.`);
    return;
  }
  if (prev.faz === 'yerlesim' && s.faz === 'yerlesim') {
    if (!prev.hazir[pi] && s.hazir[pi]) { sfx('pop'); announce(`${pName(s)} hazır.`); }
    if (prev.temasYok !== s.temasYok) announce(s.temasYok ? 'Kural: gemiler birbirine değmez.' : 'Kural: gemiler yan yana olabilir.');
    return;
  }
  if (s.atislar[mi].length > prev.atislar[mi].length) {
    const a = s.atislar[mi].at(-1);
    if (a.batti) { sfx('match'); note(`${a.batti.ad} battı! 💥`, 'hit'); }
    else if (a.vurdu) { sfx('snap'); note(`${koord(a.x, a.y)}: isabet! Bir daha at.`, 'hit'); }
    else { sfx('pop'); note(`${koord(a.x, a.y)}: ıska. Şimdi ${pName(s)} atacak.`); }
  }
  if (s.atislar[pi].length > prev.atislar[pi].length) {
    const a = s.atislar[pi].at(-1);
    if (a.batti) { sfx('wrong'); note(`${pName(s)} ${a.batti.ad} gemini batırdı!`, 'bad'); }
    else if (a.vurdu) { sfx('wrong'); note(`${pName(s)} ${koord(a.x, a.y)} karesinden vurdu!`, 'bad'); }
    else { sfx('pop'); note(`${pName(s)} ıskaladı. Sıra sende!`); }
  }
  if (s.faz === 'bitti' && prev.faz !== 'bitti') endGame(s);
}

function endGame(s) {
  const mi = myIdx(s);
  let kayit = null;
  if (isHost && roomId && loggedTur !== s.tur) {
    loggedTur = s.tur;
    logGame(roomId, NS, resultOf(s));
    kayit = skorKaydet(room, NS, { kazanan: s.players[s.kazanan] });
  }
  if (celebratedTur === s.kimlik) return;
  celebratedTur = s.kimlik;
  const won = s.kazanan === mi;
  if (won) sfx('win');
  const mine = s.atislar[mi];
  const isabet = mine.length ? Math.round((100 * mine.filter((a) => a.vurdu).length) / mine.length) : 0;
  clearTimeout(celebrateTimer);
  celebrateTimer = later(() => {
    if (sync.state?.faz !== 'bitti' || sync.state.kimlik !== s.kimlik) return;
    closeCelebrate = celebrate({
      title: won ? 'Kazandın! Amiral sensin ⚓' : `${pName(s)} kazandı! 🌊`,
      lines: [`Skor: Sen ${s.skor[mi]} – ${s.skor[1 - mi]} ${pName(s)}`, `${mine.length} atış, isabet %${isabet}`, toplamSatiri(room, NS, s.players, s.names, kayit)],
      buttons: [
        { label: 'Tekrar oyna', primary: true, onClick: () => { closeCelebrate = null; sync.dispatch({ t: 'yeni', tur: s.tur }); } },
        { label: 'Filoları gör', onClick: () => { closeCelebrate = null; } },
        { label: 'Ana sayfaya dön', onClick: () => { location.href = lobbyUrl(); } },
      ],
    });
  }, REDUCED.matches ? 400 : 1400);
}
