// Birlikte Sudoku sayfası. Kurallar oyun.js'te; ev sahibi hamleleri uygular, misafir niyet yollar.
// Odası olan: games/dama/masa.js (oyunkayit 'sudoku', yeniden bağlanma, tek başına da sürer).
// Odasız: tek kişilik, durum bu cihazda (localStorage) saklanır.
// Seçili hücre anlık mesajla gider ({ t:'imlec', i }); durum (state) içinde değildir.
import { joinRoom } from '../../js/core/room.js';
import { readGameParams, currentRoom, lobbyUrl } from '../../js/core/identity.js';
import { mountShell, celebrate, toast, confirmDialog, h } from '../../js/core/ui.js';
import { sfx } from '../../js/core/sound.js';
import { logGame } from '../../js/core/db.js';
import { oyunOdulu } from '../../js/core/oyun-odul.js';
import { createSync } from '../hafiza/sync.js';
import { fitToViewport, fmtTime } from '../hafiza/ekran.js';
import { newSeed } from '../hafiza/rng.js';
import { bootMasa, agoText, mountAway, resumeCard } from '../dama/masa.js';
import { seat, isNewer } from '../duello/koltuk.js';
import * as S from './oyun.js';

const NS = 'sudoku';
const BASLIK = 'Birlikte Sudoku';
const OPT_MS = 3000;      // onaylanmayan iyimser hamle bu süre sonra geri alınır
const IMLEC_MS = 100;     // seçim mesajı en çok 100 ms'de bir
const HATA_KEY = 'bizim.sudoku.hataGoster';
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)');
const ACIKLAMA = { kolay: 'Isınma turu, bol ipucu', orta: 'Keyifli bir mola', zor: 'Sabır ve not ister' };
const IKON = {
  not: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="m13.5 6.5 4 4" stroke="currentColor" stroke-width="2"/></svg>',
  sil: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6-7z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="m12 9.5 5 5m0-5-5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  geri: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 14 4 9l5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  hata: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7.5v5.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="16.4" r="1.3" fill="currentColor"/></svg>',
  yeni: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20 12a8 8 0 1 1-2.3-5.6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M20 4v5h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

const app = document.getElementById('app');
app.innerHTML = `
  <section class="sd" id="sd" aria-label="Birlikte Sudoku">
    <div class="sd-ust" id="sd-ust"></div>
    <div class="sd-sahne" id="sd-sahne">
      <div class="sd-tahta is-yukleniyor" id="sd-tahta" role="group" aria-label="Sudoku tahtası"></div>
      <div class="sd-secim hidden" id="sd-secim"></div>
      <div class="masa-cover hidden" id="sd-cover"></div>
    </div>
    <div class="sd-arac" id="sd-arac" role="group" aria-label="Araçlar"></div>
    <div class="sd-rakam" id="sd-rakam" role="group" aria-label="Rakamlar"></div>
    <p class="sr-only" id="sd-live" aria-live="polite"></p>
  </section>`;
const root = document.getElementById('sd');
const ustEl = document.getElementById('sd-ust');
const sahne = document.getElementById('sd-sahne');
const tahtaEl = document.getElementById('sd-tahta');
const secimEl = document.getElementById('sd-secim');
const cover = document.getElementById('sd-cover');
const aracEl = document.getElementById('sd-arac');
const rakamEl = document.getElementById('sd-rakam');
const live = document.getElementById('sd-live');

// ---------- açılış: odalı (masa) ya da odasız (tek kişi) ----------
const game = {
  reduce: S.reduce,
  toAction: S.toAction,
  seat,
  isNewer,
  finished: (s) => s.faz === 'bitti',
  fresh: (players, names) => S.initialState({ players, names, now: Date.now() }),
};
const params = readGameParams();
const M = params.roomId || currentRoom()
  ? await bootMasa({ ns: NS, title: BASLIK, game, valid: S.gecerliKayit })
  : await yalniz();
const me = M.meId;

/**
 * Odasız tek kişilik açılış: bootMasa ile aynı biçimde nesne döner. Durum bu cihazda süresiz saklanır
 * (createSync'in kendi deposu 3 saatte unutur); biten bulmaca silinir.
 */
async function yalniz() {
  const room = await joinRoom({ roomId: null, ns: NS });
  mountShell({ title: BASLIK, room });
  const meId = room.me.clientId;
  const KEY = 'bizim.sudoku.yalniz';
  let kayitli = null;
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (S.gecerliKayit(d) && d.players[0] === meId && d.faz === 'oyun') kayitli = d;
  } catch { /* bozuk kayıt */ }
  const sakla = (s) => {
    try {
      if (s.faz === 'oyun') localStorage.setItem(KEY, JSON.stringify(s));
      else localStorage.removeItem(KEY);
    } catch { /* dolu ya da kapalı */ }
  };
  let handlers = {};
  const sync = createSync({
    room, ns: NS, isHost: true, solo: true,
    reduce: S.reduce,
    toAction: (intent, by, s) => S.toAction(intent, by, s, { hostId: meId, now: Date.now(), seed: newSeed() }),
    initial: kayitli || S.initialState({ players: [meId], names: { [meId]: room.me.name || 'Ben' }, now: Date.now() }),
    onState: (s, prev) => {
      if (prev && prev.seq !== s.seq) sakla(s);
      handlers.onState?.(s, prev, {});
    },
  });
  return {
    room, roomId: null, meId, authority: true, sync,
    resumed: !!kayitli,
    nameOf: (id) => (id === meId ? room.me.name || 'Sen' : 'Sevgilin'),
    partnerHere: () => false,
    becomeHost: () => {},
    fresh: () => {},
    start(hs = {}) { handlers = hs; sync.start(); },
  };
}

// ---------- yerel durum ----------
let sec = null;            // seçili hücre
let notModu = false;
let hataGoster = (() => { try { return localStorage.getItem(HATA_KEY) !== '0'; } catch { return true; } })();
let bekleyen = [];         // misafirin onaysız hücre hamleleri: { intent, i, hedef, at }
let sonNiyet = null;       // { i, d, at } çakışma bildirimi için
let partnerSec = null;
let partnerBurada = false;
let imlecTimer = 0;
let imlecSon = 0;
let closeCelebrate = null;
let celebrated = null;
let logged = null;
let resumeOpen = false;
let closeResume = null;
let lastAnnounce = '';
let yeniO = new Set();     // partnerin yeni yazdığı hücreler (kısa vurgu)
const later = (fn, ms = 0) => setTimeout(fn, ms);
const away = M.roomId ? mountAway(root, { isGuest: !M.authority, onHost: () => M.becomeHost() }) : { set() {} };

/** Gösterilen durum: ev sahibinden gelen + henüz onaylanmamış kendi hamlelerim (misafir). */
function state() {
  const s = M.sync.state;
  if (!s || !bekleyen.length || s.faz !== 'oyun') return s;
  let out = s;
  for (const b of bekleyen) {
    const a = S.toAction(b.intent, me, out, { hostId: null, now: M.sync.hostNow() });
    if (a) out = S.reduce(out, a);
  }
  return out;
}
/** Ev sahibinin işlediği (sürümü hedefe ulaşan) ya da süresi dolan hamleleri bırak. */
function bekleyenleriAyikla() {
  const s = M.sync.state;
  const simdi = Date.now();
  bekleyen = bekleyen.filter((b) => s && s.sur?.[b.i] < b.hedef && simdi - b.at < OPT_MS);
}
/** Hamlenin taşıyacağı sürüm: ev sahibinden gelen son onaylı durum (iyimser önizleme değil). */
const surum = (i) => M.sync.state?.sur?.[i] ?? 0;
const myIdx = (s) => Math.max(0, s.players.indexOf(me));
const ikiKisi = (s) => s.players.length > 1;
const pName = (s) => M.nameOf(s.players.find((x) => x !== me), s);
function announce(text) {
  if (!text || text === lastAnnounce) return;
  lastAnnounce = text;
  live.textContent = text;
}
const satirOf = (i) => Math.floor(i / 9);
const sutunOf = (i) => i % 9;
const kutuOf = (i) => Math.floor(satirOf(i) / 3) * 3 + Math.floor(sutunOf(i) / 3);

// ---------- tahta iskeleti (bir kez) ----------
const hucreler = new Array(81);
for (let k = 0; k < 9; k++) {
  const kutu = h('div', { class: 'sd-kutu' });
  for (let j = 0; j < 9; j++) {
    const i = (Math.floor(k / 3) * 3 + Math.floor(j / 3)) * 9 + (k % 3) * 3 + (j % 3);
    const b = h('button', { type: 'button', class: 'sd-h', dataset: { i: String(i) }, tabindex: i === 0 ? '0' : '-1' },
      h('span', { class: 'sd-d' }),
      h('span', { class: 'sd-n', 'aria-hidden': 'true' }, ...Array.from({ length: 9 }, () => h('i'))));
    hucreler[i] = b;
    kutu.appendChild(b);
  }
  tahtaEl.appendChild(kutu);
}
const rakamlar = [];
for (let d = 1; d <= 9; d++) {
  const b = h('button', { type: 'button', class: 'sd-rk', dataset: { d: String(d) } },
    h('span', { class: 'sd-rk-d' }, String(d)),
    h('span', { class: 'sd-rk-k' }));
  rakamlar.push(b);
  rakamEl.appendChild(b);
}

// ---------- çizim ----------
function paint() {
  const s = state();
  if (!s) return;
  root.dataset.faz = s.faz;
  tahtaEl.classList.remove('is-yukleniyor');
  if (s.faz === 'secim') {
    secimGoster(s);
    renderUst(s);
    renderArac(s);
    renderRakam(s);
    return;
  }
  secimEl.classList.add('hidden');
  tahtaEl.hidden = false;
  const mi = myIdx(s);
  const secD = sec != null ? S.deger(s, sec) : 0;
  const hatalar = hataGoster ? new Set(S.hatalilar(s)) : new Set();
  for (let i = 0; i < 81; i++) {
    const b = hucreler[i];
    const ipucu = s.bulmaca[i] !== '0';
    const d = S.deger(s, i);
    const notlar = !d ? s.notlar[i] || 0 : 0;
    const kim = !ipucu && d ? (s.son[i] === mi ? 'ben' : 'o') : '';
    b.classList.toggle('is-ipucu', ipucu);
    b.classList.toggle('is-ben', kim === 'ben');
    b.classList.toggle('is-o', kim === 'o' && ikiKisi(s));
    b.classList.toggle('is-sec', i === sec);
    b.classList.toggle('is-bolge', sec != null && i !== sec && (satirOf(i) === satirOf(sec) || sutunOf(i) === sutunOf(sec) || kutuOf(i) === kutuOf(sec)));
    b.classList.toggle('is-ayni', !!secD && d === secD && i !== sec);
    b.classList.toggle('is-hata', hatalar.has(i));
    b.classList.toggle('is-o-sec', partnerSec === i && partnerBurada);
    b.classList.toggle('is-yeni-o', yeniO.has(i));
    b.children[0].textContent = d ? String(d) : '';
    const n = b.children[1].children;
    for (let k = 0; k < 9; k++) n[k].textContent = notlar & (1 << k) ? String(k + 1) : '';
    b.setAttribute('aria-label', hucreEtiket(s, i, d, ipucu, kim, notlar, hatalar.has(i)));
  }
  tahtaEl.classList.toggle('is-not', notModu);
  tahtaEl.classList.toggle('is-bitti', s.faz === 'bitti');
  renderUst(s);
  renderArac(s);
  renderRakam(s);
}

function hucreEtiket(s, i, d, ipucu, kim, notlar, hata) {
  let t = `Satır ${satirOf(i) + 1}, sütun ${sutunOf(i) + 1}: `;
  if (!d) {
    const a = S.adaylar(notlar);
    t += a.length ? `boş, notlar ${a.join(' ')}` : 'boş';
  } else {
    t += String(d);
    if (ipucu) t += ', ipucu';
    else if (kim === 'o' && ikiKisi(s)) t += `, ${pName(s)} yazdı`;
    if (hata) t += ', hatalı';
  }
  if (partnerSec === i && partnerBurada) t += `, ${pName(s)} burada`;
  return t;
}

function renderUst(s) {
  const parcalar = [];
  if (s.faz !== 'secim') {
    parcalar.push(h('span', { class: 'chip sd-zorluk' }, S.ZORLUKLAR[s.zorluk]?.ad || ''));
    parcalar.push(h('span', { class: 'sd-sure', id: 'sd-sure', 'aria-label': 'Süre' }, fmtTime(S.gecenSure(s, M.sync.hostNow()) / 1000)));
    if (ikiKisi(s)) {
      const k = S.katki(s);
      const mi = myIdx(s);
      parcalar.push(h('span', { class: 'sd-katki', title: 'Kim kaç hücre doldurdu' },
        h('span', { class: 'sd-nokta is-ben', 'aria-hidden': 'true' }), `Sen ${k[mi]}`,
        h('span', { class: 'sd-nokta is-o', 'aria-hidden': 'true' }), `${pName(s)} ${k[1 - mi]}`));
    }
  } else {
    parcalar.push(h('span', { class: 'sd-ust-yazi' }, ikiKisi(s) ? `${pName(s)} ile aynı tahtada` : 'Bir bulmaca seç'));
  }
  ustEl.replaceChildren(...parcalar);
}

function renderArac(s) {
  const oyun = s.faz === 'oyun';
  const arac = (ad, ikon, yazi, onclick, ek = {}) => h('button', { type: 'button', class: `sd-arac-b is-${ad}`, onclick, disabled: !oyun && ad !== 'yeni', ...ek },
    h('span', { class: 'sd-ikon', html: ikon }), h('span', {}, yazi));
  aracEl.replaceChildren(
    arac('not', IKON.not, notModu ? 'Not: açık' : 'Not', notAc, { 'aria-pressed': String(notModu) }),
    arac('sil', IKON.sil, 'Sil', silHucre),
    arac('geri', IKON.geri, 'Geri al', geriAl, { disabled: !oyun || !s.geri?.[myIdx(s)]?.length }),
    arac('hata', IKON.hata, 'Hatalar', hataAc, { 'aria-pressed': String(hataGoster), disabled: !oyun }),
    arac('yeni', IKON.yeni, 'Yeni', yeniBulmaca, { disabled: s.faz === 'secim' }));
}

function renderRakam(s) {
  const kalan = s.faz === 'secim' ? new Array(10).fill(0) : S.kalanSayilar(s);
  const secD = sec != null && s.faz !== 'secim' ? S.deger(s, sec) : 0;
  const acik = s.faz === 'oyun';
  rakamEl.classList.toggle('is-not', notModu);
  rakamlar.forEach((b, k) => {
    const d = k + 1;
    b.disabled = !acik;
    b.classList.toggle('is-bitti', acik && kalan[d] === 0);
    b.classList.toggle('is-ayni', !!secD && secD === d);
    b.children[1].textContent = acik && kalan[d] ? String(kalan[d]) : '';
    b.setAttribute('aria-label', `${d}${notModu ? ' notu' : ''}${acik ? `, ${kalan[d]} kaldı` : ''}`);
  });
}

function secimGoster(s) {
  tahtaEl.hidden = true;
  secimEl.classList.remove('hidden');
  if (secimEl.dataset.kurulu) return;
  secimEl.dataset.kurulu = '1';
  secimEl.replaceChildren(h('div', { class: 'sd-secim-ic' },
    h('h2', { class: 'sd-baslik' }, 'Hangi bulmaca?'),
    h('p', { class: 'muted' }, ikiKisi(s) ? 'Seçtiğiniz tahtayı ikiniz aynı anda doldurursunuz.' : 'Sevgilin gelince aynı tahtaya katılır.'),
    h('div', { class: 'sd-zorluklar' },
      Object.entries(S.ZORLUKLAR).map(([id, z]) => h('button', {
        type: 'button', class: `sd-zk is-${id}`, onclick: () => baslat(id),
      },
      h('span', { class: 'sd-zk-ad' }, z.ad),
      h('span', { class: 'sd-zk-alt' }, ACIKLAMA[id]),
      h('span', { class: 'sd-zk-nokta', 'aria-hidden': 'true' }, ...Array.from({ length: 3 }, (_, k) => h('i', { class: k < ['kolay', 'orta', 'zor'].indexOf(id) + 1 ? 'is-dolu' : '' }))))))));
}

// ---------- hamleler ----------
function gonder(intent) {
  const base = state();
  if (!base) return false;
  const ok = M.sync.dispatch(intent);
  if (!M.authority) {
    if (ok === false) { toast('Bağlantı yok; biraz sonra yeniden dene.'); return false; }
    if (Number.isInteger(intent.i)) {
      // hedef: ev sahibi bu hamleyi işleyince hücrenin ulaşacağı sürüm
      bekleyen.push({ intent, i: intent.i, hedef: base.sur[intent.i] + 1, at: Date.now() });
      later(() => { bekleyenleriAyikla(); paint(); }, OPT_MS + 50);
    }
  }
  paint();
  return true;
}

function rakamBas(d) {
  const s = state();
  if (!s || s.faz !== 'oyun') return;
  if (sec == null || s.bulmaca[sec] !== '0') {
    // seçim yoksa ya da ipucuysa: o rakamı vurgula
    const ilk = [...Array(81).keys()].find((i) => S.deger(s, i) === d);
    if (sec == null && ilk != null) secimYap(ilk);
    sfx('tick');
    return;
  }
  if (notModu) {
    if (s.deger[sec]) { toast('Dolu hücreye not yazılmaz; önce sil.'); return; }
    sfx('tap');
    gonder({ type: 'not', i: sec, d, v: surum(sec) });
    return;
  }
  const yanlis = d !== Number(s.cozum[sec]) && s.deger[sec] !== d;
  sfx(yanlis && hataGoster ? 'wrong' : 'snap');
  sonNiyet = { i: sec, d: s.deger[sec] === d ? 0 : d, at: Date.now() };
  gonder({ type: 'yaz', i: sec, d, v: surum(sec) });
}

function silHucre() {
  const s = state();
  if (!s || sec == null || s.faz !== 'oyun' || s.bulmaca[sec] !== '0') return;
  if (!s.deger[sec] && !s.notlar[sec]) return;
  sfx('pop');
  sonNiyet = { i: sec, d: 0, at: Date.now() };
  gonder({ type: 'sil', i: sec, v: surum(sec) });
}
function geriAl() {
  const s = state();
  if (!s || s.faz !== 'oyun') return;
  sfx('flip');
  gonder({ type: 'geri' });
}
function notAc() {
  notModu = !notModu;
  sfx('tap');
  announce(notModu ? 'Not modu açık' : 'Not modu kapalı');
  paint();
}
function hataAc() {
  hataGoster = !hataGoster;
  try { localStorage.setItem(HATA_KEY, hataGoster ? '1' : '0'); } catch { /* yok */ }
  announce(hataGoster ? 'Hatalar gösteriliyor' : 'Hatalar gizli');
  paint();
}

function secimYap(i, odak = false) {
  if (i == null) return;
  const once = sec;
  sec = i;
  if (once != null) hucreler[once].tabIndex = -1;
  hucreler[i].tabIndex = 0;
  if (odak) hucreler[i].focus({ preventScroll: true });
  imlecYolla();
  paint();
}
function imlecYolla() {
  if (!M.roomId) return;
  const gonderNow = () => {
    imlecTimer = 0;
    imlecSon = Date.now();
    M.room.send({ t: 'imlec', i: sec });
  };
  if (imlecTimer) return;
  const bekle = imlecSon + IMLEC_MS - Date.now();
  if (bekle <= 0) gonderNow();
  else imlecTimer = later(gonderNow, bekle);
}

async function zorlukSec() {
  return new Promise((resolve) => {
    let secilen = null;
    const dlg = h('dialog', { class: 'ui-dialog sd-dlg', 'aria-labelledby': 'sd-dlg-t' });
    dlg.append(h('div', { class: 'dialog-card stack' },
      h('h2', { class: 'sd-baslik', id: 'sd-dlg-t' }, 'Yeni bulmaca'),
      h('div', { class: 'sd-zorluklar' },
        Object.entries(S.ZORLUKLAR).map(([id, z]) => h('button', {
          type: 'button', class: `sd-zk is-${id}`, onclick: () => { secilen = id; dlg.close(); },
        }, h('span', { class: 'sd-zk-ad' }, z.ad), h('span', { class: 'sd-zk-alt' }, ACIKLAMA[id])))),
      h('div', { class: 'dialog-actions' }, h('button', { type: 'button', class: 'btn ghost', onclick: () => dlg.close() }, 'Vazgeç'))));
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener('close', () => { dlg.remove(); resolve(secilen); });
    document.body.append(dlg);
    dlg.showModal();
  });
}
function baslat(zorluk) {
  const s = M.sync.state;
  if (!s) return;
  sfx('flip');
  sec = null;
  if (M.sync.dispatch({ type: 'yeni', no: s.no, zorluk }) === false && !M.authority) toast('Bağlantı yok; biraz sonra yeniden dene.');
}
async function yeniBulmaca() {
  const s = M.sync.state;
  if (!s) return;
  const ilerlemis = s.faz === 'oyun' && s.deger.some(Boolean);
  if (ilerlemis && !(await confirmDialog('Bu bulmacayı bırakıp yenisine geçelim mi?', { ok: 'Yeni bulmaca' }))) return;
  const z = await zorlukSec();
  if (z) baslat(z);
}

// ---------- girdi ----------
tahtaEl.addEventListener('click', (e) => {
  const b = e.target.closest('.sd-h');
  if (!b) return;
  const i = Number(b.dataset.i);
  sfx('tick');
  secimYap(i === sec ? i : i);
});
rakamEl.addEventListener('click', (e) => {
  const b = e.target.closest('.sd-rk');
  if (b) rakamBas(Number(b.dataset.d));
});
window.addEventListener('keydown', (e) => {
  if (document.querySelector('dialog[open], .celebrate') || !cover.classList.contains('hidden') || resumeOpen) return;
  if (e.target?.closest?.('input, textarea, select, [contenteditable]')) return;
  const s = state();
  if (!s || s.faz !== 'oyun') return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); geriAl(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const yon = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -9, ArrowDown: 9 }[e.key];
  if (yon) {
    e.preventDefault();
    const i = sec ?? 40;
    let j = i + yon;
    if (yon === -1 && sutunOf(i) === 0) j = i + 8;
    if (yon === 1 && sutunOf(i) === 8) j = i - 8;
    if (j < 0) j += 81;
    if (j > 80) j -= 81;
    secimYap(sec == null ? 40 : j, true);
    return;
  }
  if (/^[1-9]$/.test(e.key)) { e.preventDefault(); rakamBas(Number(e.key)); return; }
  if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') { e.preventDefault(); silHucre(); return; }
  if (e.key === 'n' || e.key === 'N') { e.preventDefault(); notAc(); }
});

// İmleç mesajları (partnerin seçili hücresi)
if (M.roomId) {
  M.room.on('message', (msg, from) => {
    if (msg?.t !== 'imlec' || !from || from.clientId === me) return;
    partnerSec = Number.isInteger(msg.i) && msg.i >= 0 && msg.i < 81 ? msg.i : null;
    paint();
  });
}

// ---------- ses, duyuru, bitiş ----------
function effects(s, prev, info) {
  if (!prev) return;
  if (s.no !== prev.no) {
    if (closeCelebrate) { try { closeCelebrate(); } catch { /* kapalı */ } closeCelebrate = null; }
    sec = null;
    if (s.faz === 'oyun') {
      toast(`Yeni bulmaca · ${S.ZORLUKLAR[s.zorluk]?.ad}`);
      announce(`Yeni bulmaca: ${S.ZORLUKLAR[s.zorluk]?.ad}`);
    }
    return;
  }
  if (s.faz !== 'oyun' && s.faz !== 'bitti') return;
  const mi = myIdx(s);
  // partnerin yeni yazdığı hücreler kısa süre parlar
  const yeni = [];
  for (let i = 0; i < 81; i++) if (s.deger[i] && s.deger[i] !== prev.deger?.[i] && s.son[i] !== mi) yeni.push(i);
  if (yeni.length && ikiKisi(s)) {
    yeni.forEach((i) => yeniO.add(i));
    later(() => { yeni.forEach((i) => yeniO.delete(i)); paint(); }, 900);
  }
  // misafir: yazdığım hücreyi ev sahibi aynı anda değiştirdiyse bildir
  if (sonNiyet && Date.now() - sonNiyet.at < 2500) {
    const i = sonNiyet.i;
    if (s.son[i] !== mi && s.deger[i] !== sonNiyet.d && prev.sur?.[i] !== s.sur[i]) {
      toast(`${pName(s)} bu hücreyi senden önce doldurdu`);
      sonNiyet = null;
    } else if (s.son[i] === mi) sonNiyet = null;
  }
  if (s.faz === 'bitti' && prev.faz !== 'bitti') bitis(s, info);
}

function bitis(s, info) {
  if (M.authority && M.roomId && !info?.adopted && logged !== s.no) {
    logged = s.no;
    logGame(M.roomId, NS, S.resultOf(s));
  }
  // Ödül iki cihazda. Odada tek başına da biter ve koltuk hep iki ('?'): iki kişi = ikisi de hücre doldurdu.
  if (!info?.adopted) oyunOdulu({ roomId: M.roomId, oyun: NS, sonuc: 'ortak', ikiKisi: S.katki(s).every((n) => n > 0), oyunNo: s.kimlik });
  if (celebrated === s.no) return;
  celebrated = s.no;
  sec = null;
  sfx('win');
  const satirlar = [`${S.ZORLUKLAR[s.zorluk]?.ad} · ${fmtTime(s.sure / 1000)}`];
  if (ikiKisi(s)) {
    const k = S.katki(s);
    const mi = myIdx(s);
    satirlar.push(`Sen ${k[mi]} hücre · ${pName(s)} ${k[1 - mi]} hücre`);
  }
  const hata = s.hata.reduce((a, b) => a + b, 0);
  satirlar.push(hata ? `${hata} yanlış denemeyle` : 'Hiç yanlış yapmadan');
  announce(`Bulmaca tamam! ${satirlar.join('. ')}`);
  later(() => {
    if (M.sync.state?.faz !== 'bitti' || M.sync.state.no !== s.no) return;
    closeCelebrate = celebrate({
      title: ikiKisi(s) ? 'Birlikte çözdünüz!' : 'Bulmaca tamam!',
      lines: satirlar,
      buttons: [
        { label: 'Yeni bulmaca', primary: true, onClick: async () => { closeCelebrate = null; const z = await zorlukSec(); if (z) baslat(z); } },
        { label: 'Tahtaya bak', onClick: () => { closeCelebrate = null; } },
        { label: 'Ana sayfaya dön', onClick: () => { location.href = lobbyUrl(); } },
      ],
    });
  }, REDUCED.matches ? 300 : 900);
}

// ---------- yerleşim ----------
function layout() {
  const w = sahne.clientWidth;
  const hh = sahne.clientHeight;
  if (!w || !hh) return;
  const c = Math.floor(Math.max(28, Math.min((Math.min(w, hh) - 20) / 9, 64)));
  root.style.setProperty('--hucre', `${c}px`);
}
fitToViewport(root, layout);
if ('ResizeObserver' in window) new ResizeObserver(() => layout()).observe(sahne);

setInterval(() => {
  const s = state();
  const el = document.getElementById('sd-sure');
  if (el && s?.faz === 'oyun') el.textContent = fmtTime(S.gecenSure(s, M.sync.hostNow()) / 1000);
}, 1000);

function dropResume() {
  if (!resumeOpen) return;
  resumeOpen = false;
  closeResume?.();
  closeResume = null;
}
function oturumAc() {
  if (M.authority && M.sync.state?.faz === 'oyun') later(() => M.sync.dispatch({ type: 'oturum' }));
}

M.start({
  onState(s, prev, info) {
    bekleyenleriAyikla();
    if (s.faz !== 'oyun') dropResume();
    if (s.faz === 'secim') delete secimEl.dataset.kurulu; // kişi sayısı değişmiş olabilir
    paint();
    effects(s, prev, info);
    if (info?.adopted) oturumAc();
  },
  onPeer(here) {
    partnerBurada = here;
    away.set(here);
    if (here) imlecYolla();
    else partnerSec = null;
    paint();
  },
  onGone() {
    if (!resumeOpen) return;
    dropResume();
    M.fresh();
    toast('Bu bulmaca bitmiş. Yenisini seç.');
  },
});
oturumAc();

if (M.authority && M.resumed && M.sync.state?.faz === 'oyun' && M.sync.state.deger.some(Boolean)) {
  const s = M.sync.state;
  const dolu = s.deger.filter(Boolean).length + S.ipucuSayisi(s.bulmaca);
  resumeOpen = true;
  closeResume = resumeCard(cover, {
    title: 'Kaldığımız yerden devam?',
    detail: `${S.ZORLUKLAR[s.zorluk]?.ad} · ${dolu}/81 dolu${s.at ? ` · ${agoText(Date.now() - s.at)}` : ''}`,
    onContinue: () => { resumeOpen = false; closeResume = null; paint(); },
    onNew: async () => { resumeOpen = false; closeResume = null; const z = await zorlukSec(); if (z) baslat(z); },
    newLabel: 'Yeni bulmaca',
  });
}
paint();
layout();
