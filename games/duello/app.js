// Kelime Düellosu sayfası. Kurallar oyun.js'te; ev sahibi hakemdir, misafir niyet yollar
// (games/dama/masa.js → games/hafiza/sync.js). Kayıt: oyunkayit belgesi 'duello' (gizlisiz görünüm).
// Gizli kelimeler: her cihaz kendi seçtiğini, ev sahibi ikisini de yalnız kendi localStorage'ında tutar
// (kayıttan dönüşte geri koymak için). Arayüz yalnız gorunum(durum, ben) ile çizilir: ev sahibi de
// misafirin kelimesini ve tahmin harflerini oyun bitene dek görmez.
import { celebrate, toast, confirmDialog, h } from '../../js/core/ui.js';
import { lobbyUrl } from '../../js/core/identity.js';
import { sfx } from '../../js/core/sound.js';
import { logGame } from '../../js/core/db.js';
import { fitToViewport } from '../hafiza/ekran.js';
import { newSeed } from '../hafiza/rng.js';
import { bootMasa, agoText, tamlayan, mountAway, resumeCard } from '../dama/masa.js';
import * as D from './oyun.js';
import { seat, isNewer } from './koltuk.js';
import { kelimeVar, rastgeleKelime } from './sozluk.js';

const NS = 'duello';
const BEKLEME_MS = 4500; // misafirin tahminine cevap gelmezse girdi geri verilir
const UYARI_MS = 2200;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)');
// Türkçe Q düzeni (q, w, x Türkçe kelimelerde yok)
const SATIRLAR = [
  ['e', 'r', 't', 'y', 'u', 'ı', 'o', 'p', 'ğ', 'ü'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'ş', 'i'],
  ['gir', 'z', 'c', 'v', 'b', 'n', 'm', 'ö', 'ç', 'sil'],
];
const ANLAM = { d: 'doğru yerde', v: 'kelimede var, başka yerde', y: 'kelimede yok' };
const SVG_SIL = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6-7z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="m12 9.5 5 5m0-5-5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const SVG_TAMAM = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m5 12.5 4.2 4.2L19 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const app = document.getElementById('app');
app.innerHTML = `
  <section class="kd" id="kd" aria-label="Kelime Düellosu">
    <div class="kd-rakip" id="kd-rakip"></div>
    <p class="kd-durum" id="kd-durum" role="status"></p>
    <div class="kd-sahne" id="kd-sahne">
      <div class="kd-orta" id="kd-orta"></div>
      <div class="masa-cover hidden" id="kd-cover"></div>
    </div>
    <div class="kd-arac" id="kd-arac"></div>
    <div class="kd-klavye" id="kd-klavye" role="group" aria-label="Klavye"></div>
    <p class="sr-only" id="kd-live" aria-live="polite"></p>
  </section>`;
const root = document.getElementById('kd');
const rakipEl = document.getElementById('kd-rakip');
const durumEl = document.getElementById('kd-durum');
const sahne = document.getElementById('kd-sahne');
const orta = document.getElementById('kd-orta');
const cover = document.getElementById('kd-cover');
const aracEl = document.getElementById('kd-arac');
const klavyeEl = document.getElementById('kd-klavye');
const live = document.getElementById('kd-live');

let me = null;
const hostDurumu = (s) => ('gizli' in s ? s : D.kayittanDurum(s));
const M = await bootMasa({
  ns: NS,
  title: 'Kelime Düellosu',
  game: {
    reduce: D.reduce,
    toAction: D.toAction,
    isNewer,
    seat: (s, ids, names) => seat(hostDurumu(s), ids, names),
    finished: (s) => s.faz === 'bitti',
    fresh: (players, names) => D.initialState({ players, names, now: Date.now(), kimlik: newSeed() }),
    // pid undefined → kayıt; aksi hâlde misafire (ev sahibi dışındaki oyuncu) giden görünüm
    view: (s, pid) => D.gorunum(s, pid === undefined ? null : (s.players.find((x) => x !== me) ?? '?')),
  },
  valid: D.gecerliKayit,
});
me = M.meId;

// ---------- yerel durum ----------
let yazi = '';          // girilen harfler (tr küçük)
let duzenle = false;    // seçim fazında kelimeyi değiştiriyor
let bekleyen = null;    // { kelime, n, timer } misafirin yolladığı, cevabı beklenen tahmin
let uyari = null;       // { text, until }
let uyariTimer = 0;
let salla = false;      // geçersiz girişte satır sallansın
let onceki = null;      // son çizilen görünüm
let gorulen = { no: null, ben: 0, o: 0 }; // canlandırılmış satır sayıları
let closeCelebrate = null;
let celebrated = null;
let logged = null;
let resumeOpen = false;
let closeResume = null;
let geriYollandi = 0;
let geriKontrol = false; // yeniden yazılan kelimenin kabulü bekleniyor
const geriDenendi = new Set();
let lastAnnounce = '';
const later = (fn, ms = 0) => setTimeout(fn, ms);
const away = mountAway(root, { isGuest: !M.authority, onHost: () => M.becomeHost() });

// ---------- yardımcılar ----------
function view() {
  const s = M.sync.state;
  if (!s) return null;
  return M.authority ? D.gorunum(s, me) : s;
}
const myIdx = (v) => v.players.indexOf(me);
const partnerId = (v) => v.players.find((x) => x !== me);
const pName = (v) => M.nameOf(partnerId(v), v);
const BUYUK = (k) => D.trBuyuk(k || '');
function announce(text) {
  if (!text || text === lastAnnounce) return;
  lastAnnounce = text;
  live.textContent = text;
}
function okunus(t) {
  return `${BUYUK(t.k)}: ${[...t.k].map((ch, i) => `${BUYUK(ch)} ${ANLAM[t.r[i]]}`).join(', ')}`;
}

// Gizli kelimenin bu cihazdaki kopyası: { kimlik, k: [k0|null, k1|null] }
const GKEY = `bizim.duello.gizli.${M.roomId || '-'}`;
function gizliOku() {
  try {
    const d = JSON.parse(localStorage.getItem(GKEY) || 'null');
    return d && Array.isArray(d.k) ? d : null;
  } catch { return null; }
}
function gizliYaz(kimlik, i, k) {
  const d = gizliOku();
  const o = d && d.kimlik === kimlik ? d : { kimlik, k: [null, null] };
  if (o.k[i] === k) return;
  o.k[i] = k;
  try { localStorage.setItem(GKEY, JSON.stringify(o)); } catch { /* dolu ya da kapalı */ }
}
function kendiKelimem(v) {
  if (v.kendi) return v.kendi;
  const d = gizliOku();
  return d && d.kimlik === v.kimlik ? d.k[myIdx(v)] : null;
}

function modOf(v) {
  const mi = myIdx(v);
  if (mi < 0) return 'izle';
  if (v.faz === 'secim') return !v.hazir[mi] || duzenle ? 'secim' : 'bekle';
  if (v.faz === 'oyun' && v.eksik?.[mi] && !kendiKelimem(v)) return 'geri';
  return 'tahta';
}
function girdiAcik(v, m) {
  if (resumeOpen) return false;
  if (m === 'geri') return !geriKontrol;
  if (m === 'secim') return true;
  if (m !== 'tahta' || v.faz !== 'oyun' || bekleyen) return false;
  return !D.oyuncuDurumu(v.tahmin[myIdx(v)]).bitti;
}

function uyar(text) {
  uyari = { text, until: Date.now() + UYARI_MS };
  salla = true;
  sfx('wrong');
  announce(text);
  clearTimeout(uyariTimer);
  uyariTimer = later(() => { uyari = null; render(); }, UYARI_MS);
  render();
}

// ---------- kareler ----------
function kare(harf, r, { yeni = false, i = 0, gizli = false } = {}) {
  const el = document.createElement('span');
  el.className = `kd-kare${harf ? ' is-dolu' : ''}${yeni ? ' is-yeni' : ''}${gizli ? ' is-gizli' : ''}`;
  if (r) el.dataset.r = r;
  el.style.setProperty('--i', i);
  el.textContent = harf ? BUYUK(harf) : '';
  el.setAttribute('aria-hidden', 'true');
  return el;
}
function satir(harfler, sonuc, { yeni = false, aria = '', cls = '' } = {}) {
  const row = document.createElement('div');
  row.className = `kd-satir${cls ? ` ${cls}` : ''}`;
  row.setAttribute('role', 'row');
  if (aria) row.setAttribute('aria-label', aria);
  for (let i = 0; i < D.HARF; i++) row.appendChild(kare(harfler[i], sonuc?.[i], { yeni, i }));
  return row;
}

// ---------- çizim ----------
function render() {
  const v = view();
  if (!v) return;
  const m = modOf(v);
  root.dataset.mod = m;
  root.dataset.faz = v.faz;
  if (gorulen.no !== v.no) gorulen = { no: v.no, ben: v.tahmin[Math.max(0, myIdx(v))]?.length || 0, o: v.tahmin[1 - Math.max(0, myIdx(v))]?.length || 0 };
  renderRakip(v, m);
  renderDurum(v, m);
  renderOrta(v, m);
  renderArac(v, m);
  renderKlavye(v, m);
  salla = false;
}

function renderRakip(v, m) {
  if (m === 'izle') { rakipEl.replaceChildren(); return; }
  const mi = myIdx(v);
  const pi = 1 - mi;
  const ad = pName(v);
  const liste = v.tahmin[pi];
  const ds = D.oyuncuDurumu(liste);
  const sag = h('div', { class: 'kd-rakip-sag' });
  let alt;
  if (v.faz === 'secim') {
    alt = v.hazir[pi]
      ? h('span', { class: 'kd-rozet is-hazir' }, h('span', { class: 'kd-ikon', html: SVG_TAMAM }), 'Kelimesini seçti')
      : h('span', { class: 'kd-rozet is-dusunuyor' }, 'Kelimesini seçiyor…');
  } else {
    let not = `${liste.length}/${D.HAK}`;
    if (ds.bulundu) not = `${ds.bulundu}. denemede buldu`;
    else if (ds.bitti) not = 'Bulamadı';
    alt = h('span', { class: `kd-rozet${ds.bulundu ? ' is-buldu' : ''}` }, not);
    const yeniO = liste.length > gorulen.o;
    const mini = h('div', {
      class: 'kd-mini',
      role: 'img',
      'aria-label': miniAciklama(ad, liste),
    });
    for (let r = 0; r < D.HAK; r++) {
      const t = liste[r];
      const sira = h('span', { class: `kd-mini-satir${t && yeniO && r === liste.length - 1 ? ' is-yeni' : ''}` });
      for (let i = 0; i < D.HARF; i++) sira.appendChild(h('i', t ? { 'data-r': t.r[i] } : {}));
      mini.appendChild(sira);
    }
    sag.appendChild(mini);
    gorulen.o = liste.length;
  }
  rakipEl.replaceChildren(
    h('div', { class: 'kd-rakip-sol' },
      h('span', { class: 'kd-avatar', 'aria-hidden': 'true' }, BUYUK(ad).slice(0, 1)),
      h('span', { class: 'kd-rakip-yazi' },
        h('span', { class: 'kd-isim' }, ad),
        alt)),
    sag);
}

function miniAciklama(ad, liste) {
  if (!liste.length) return `${ad} henüz tahmin yapmadı`;
  const t = liste[liste.length - 1];
  const say = (c) => [...t.r].filter((x) => x === c).length;
  return `${ad} ${liste.length} tahmin yaptı. Son tahmin: ${say('d')} harf doğru yerde, ${say('v')} harf başka yerde.`;
}

function renderDurum(v, m) {
  const mi = myIdx(v);
  const pi = 1 - mi;
  const ad = pName(v);
  durumEl.className = 'kd-durum';
  if (uyari && Date.now() < uyari.until) {
    durumEl.classList.add('is-uyari');
    durumEl.textContent = uyari.text;
    return;
  }
  let t = '';
  if (m === 'izle') t = 'Bu oyun başka bir cihazda sürüyor';
  else if (m === 'secim') t = duzenle ? 'Yeni kelimeni yaz' : `${ad} için gizli bir kelime seç`;
  else if (m === 'geri') t = geriKontrol ? 'Kontrol ediliyor…' : 'Kelimeni yeniden yaz';
  else if (m === 'bekle') t = `${ad} kelimesini seçince başlıyoruz`;
  else if (v.faz === 'bitti') {
    const k = v.sonuc?.kazanan;
    t = k === -1 ? 'Berabere!' : k === mi ? 'Kazandın!' : `${ad} kazandı`;
    durumEl.classList.add(k === mi ? 'is-iyi' : 'is-son');
  } else {
    const ds = D.oyuncuDurumu(v.tahmin[mi]);
    if (ds.bulundu) { t = `${ds.bulundu}. denemede buldun! ${ad} bekleniyor…`; durumEl.classList.add('is-iyi'); }
    else if (ds.bitti) t = `Hakların bitti. ${ad} devam ediyor…`;
    else if (v.eksik?.[pi]) t = `${tamlayan(ad)} kelimesi bekleniyor; gelince tahminlerin değerlendirilir`;
    else if (bekleyen) t = 'Tahminin değerlendiriliyor…';
    else {
      const kalan = D.HAK - v.tahmin[mi].length;
      t = `${tamlayan(ad)} kelimesini bul · ${kalan} hakkın var`;
    }
  }
  durumEl.textContent = t;
}

function renderOrta(v, m) {
  const mi = myIdx(v);
  if (m === 'izle') {
    orta.replaceChildren(h('div', { class: 'card stack center kd-bilgi' },
      h('p', { class: 'kd-baslik' }, 'Bu oyun başka bir cihazda sürüyor'),
      h('p', { class: 'muted' }, 'Sevgilin seni oyuna alınca buradan devam edersin.')));
    orta.dataset.satir = '1';
    return;
  }
  if (m === 'secim' || m === 'geri' || m === 'bekle') {
    const ad = pName(v);
    const kendi = kendiKelimem(v);
    const harfler = m === 'bekle' ? [...(kendi || '')] : [...yazi];
    const baslik = m === 'geri' ? 'Kelimen bu cihazda yok' : m === 'bekle' ? 'Kelimen hazır' : 'Gizli kelimen';
    const alt = m === 'geri'
      ? 'Oyunun başında seçtiğin kelimeyi yaz; tahminlerle uyuşursa oyun sürer.'
      : m === 'bekle'
        ? `${ad} bunu ${D.HAK} denemede bulmaya çalışacak. Sen de onunkini.`
        : `${ad} bunu ${D.HAK} denemede bulmaya çalışacak. Sözlükte olan 5 harfli bir kelime olsun.`;
    const row = satir(harfler, null, { aria: m === 'bekle' ? `Kelimen: ${BUYUK(kendi)}` : `Yazılan: ${BUYUK(yazi) || 'boş'}`, cls: `${m === 'bekle' ? 'is-gizli' : 'is-aktif'}${salla ? ' is-salla' : ''}` });
    orta.replaceChildren(h('div', { class: 'kd-secim' },
      h('h2', { class: 'kd-baslik' }, baslik),
      row,
      h('p', { class: 'kd-alt' }, alt)));
    orta.dataset.satir = '1';
    return;
  }
  // tahta
  const liste = v.tahmin[mi];
  const ds = D.oyuncuDurumu(liste);
  const tahta = h('div', { class: 'kd-tahta', role: 'grid', 'aria-label': 'Tahminlerin' });
  const yeniBen = liste.length > gorulen.ben;
  liste.forEach((t, r) => {
    tahta.appendChild(satir([...t.k], t.r, { yeni: yeniBen && r === liste.length - 1, aria: okunus(t) }));
  });
  let dolu = liste.length;
  if (v.faz === 'oyun' && !ds.bitti) {
    if (bekleyen) tahta.appendChild(satir([...bekleyen.kelime], null, { cls: 'is-bekliyor', aria: `${BUYUK(bekleyen.kelime)}: değerlendiriliyor` }));
    else tahta.appendChild(satir([...yazi], null, { cls: `is-aktif${salla ? ' is-salla' : ''}`, aria: `Yazılan: ${BUYUK(yazi) || 'boş'}` }));
    dolu++;
  }
  for (let r = dolu; r < D.HAK; r++) tahta.appendChild(satir([], null, { cls: 'is-bos' }));
  gorulen.ben = liste.length;
  orta.replaceChildren(tahta);
  orta.dataset.satir = String(D.HAK);
}

function renderArac(v, m) {
  const btns = [];
  const nasil = h('button', { type: 'button', class: 'btn small ghost', onclick: nasilOynanir }, 'Nasıl oynanır?');
  if (m === 'secim') {
    btns.push(h('button', { type: 'button', class: 'btn small', onclick: rastgele }, 'Rastgele öner'));
    if (duzenle) btns.push(h('button', { type: 'button', class: 'btn small ghost', onclick: () => { duzenle = false; yazi = ''; render(); } }, 'Vazgeç'));
    else btns.push(nasil);
  } else if (m === 'bekle') {
    btns.push(h('button', { type: 'button', class: 'btn small', onclick: () => { duzenle = true; yazi = ''; render(); } }, 'Kelimeni değiştir'), nasil);
  } else if (m === 'geri') {
    btns.push(h('button', { type: 'button', class: 'btn small ghost', onclick: yeniOyun }, 'Yeni oyun'));
  } else if (m === 'tahta') {
    if (v.faz === 'bitti') {
      const mi = myIdx(v);
      if (v.acik) {
        btns.push(h('p', { class: 'kd-acik' },
          h('span', {}, 'Senin kelimen ', h('b', {}, BUYUK(v.acik[mi] || '?'))),
          h('span', {}, `${tamlayan(pName(v))} kelimesi `, h('b', {}, BUYUK(v.acik[1 - mi] || '?')))));
      }
      btns.push(h('button', { type: 'button', class: 'btn small primary', onclick: () => tekrar(v) }, 'Tekrar oyna'));
      btns.push(h('a', { class: 'btn small ghost', href: lobbyUrl() }, 'Ana sayfa'));
    } else {
      btns.push(nasil, h('button', { type: 'button', class: 'btn small ghost', onclick: yeniOyun }, 'Yeni oyun'));
    }
  }
  aracEl.replaceChildren(...btns);
}

// Ekran klavyesi bir kez kurulur; render yalnız durum sınıflarını günceller.
const tuslar = new Map();
for (const sira of SATIRLAR) {
  const row = h('div', { class: 'kd-sira' });
  for (const k of sira) {
    const ozel = k === 'gir' || k === 'sil';
    const b = h('button', {
      type: 'button',
      class: `kd-tus${ozel ? ` is-genis is-${k}` : ''}`,
      dataset: { k },
      'aria-label': k === 'gir' ? 'Gir' : k === 'sil' ? 'Sil' : BUYUK(k),
    });
    if (k === 'sil') b.innerHTML = SVG_SIL;
    else b.textContent = k === 'gir' ? 'Gir' : BUYUK(k);
    tuslar.set(k, b);
    row.appendChild(b);
  }
  klavyeEl.appendChild(row);
}
klavyeEl.addEventListener('click', (e) => {
  const b = e.target.closest('.kd-tus');
  if (!b) return;
  const k = b.dataset.k;
  if (k === 'gir') gir();
  else if (k === 'sil') sil();
  else ekle(k);
});

function renderKlavye(v, m) {
  const durum = m === 'tahta' ? D.klavyeDurumu(v.tahmin[myIdx(v)]) : {};
  const acik = girdiAcik(v, m);
  klavyeEl.classList.toggle('is-kapali', !acik);
  for (const [k, b] of tuslar) {
    if (k === 'gir' || k === 'sil') {
      b.disabled = !acik;
      continue;
    }
    const r = durum[k] || '';
    if ((b.dataset.r || '') !== r) {
      if (r) b.dataset.r = r; else delete b.dataset.r;
      b.setAttribute('aria-label', r ? `${BUYUK(k)}, ${ANLAM[r]}` : BUYUK(k));
    }
    b.setAttribute('aria-disabled', String(!acik));
  }
  tuslar.get('gir').classList.toggle('is-hazir', acik && yazi.length === D.HARF);
}

// ---------- giriş ----------
function ekle(harf) {
  const v = view();
  if (!v || !girdiAcik(v, modOf(v)) || yazi.length >= D.HARF) return;
  uyari = null;
  yazi += harf;
  sfx('tap');
  render();
}
function sil() {
  const v = view();
  if (!v || !girdiAcik(v, modOf(v)) || !yazi) return;
  uyari = null;
  yazi = yazi.slice(0, -1);
  render();
}
function gir() {
  const v = view();
  if (!v) return;
  const m = modOf(v);
  if (!girdiAcik(v, m)) return;
  const mi = myIdx(v);
  if (yazi.length < D.HARF) { uyar('5 harf yazmalısın'); return; }
  if (!kelimeVar(yazi)) { uyar(`${BUYUK(yazi)} sözlükte yok`); return; }
  const k = yazi;
  if (m === 'secim' || m === 'geri') {
    // Yeniden yazılan kelime ancak ev sahibi kabul edince (görünümde `kendi`) saklanır.
    if (m === 'secim') gizliYaz(v.kimlik, mi, k);
    yazi = '';
    duzenle = false;
    sfx('pop');
    const gitti = M.sync.dispatch({ type: 'sec', kelime: k });
    if (!M.authority && gitti === false) toast('Bağlantı yok; biraz sonra yeniden dene.');
    if (m === 'geri') {
      const no = v.no;
      geriKontrol = true;
      later(() => {
        geriKontrol = false;
        const w = view();
        if (w && w.no === no && w.eksik?.[mi]) {
          uyar('Bu kelime önceki tahminlerle uyuşmuyor');
        }
      }, 1800);
    }
    render();
    return;
  }
  if (v.eksik?.[1 - mi]) { uyar(`${tamlayan(pName(v))} kelimesi bekleniyor`); return; }
  if (v.tahmin[mi].some((t) => t.k === k)) { uyar('Bunu zaten denedin'); return; }
  yazi = '';
  sfx('pop');
  const ok = M.sync.dispatch({ type: 'tahmin', kelime: k });
  if (!M.authority) {
    if (ok === false) {
      yazi = k;
      toast('Bağlantı yok; tahmin gönderilemedi.');
    } else {
      bekleyen = {
        kelime: k,
        n: v.tahmin[mi].length,
        timer: later(() => {
          bekleyen = null;
          yazi = k;
          toast('Cevap gelmedi; yeniden dene.');
          render();
        }, BEKLEME_MS),
      };
    }
  }
  render();
}

function rastgele() {
  const v = view();
  if (!v) return;
  yazi = rastgeleKelime();
  sfx('flip');
  render();
}

async function yeniOyun() {
  const s = M.sync.state;
  if (!s) return;
  const ilerlemis = s.faz === 'oyun' && s.tahmin.some((l) => l.length);
  if (ilerlemis && !(await confirmDialog('Bu oyunu bırakıp yeni oyuna başlayalım mı?', { ok: 'Yeni oyun' }))) return;
  M.sync.dispatch({ type: 'yeni', no: s.no });
}
function tekrar(v) {
  if (closeCelebrate) { try { closeCelebrate(); } catch { /* kapalı */ } closeCelebrate = null; }
  M.sync.dispatch({ type: 'yeni', no: v.no });
}

// Fiziksel klavye: harf, Backspace, Enter (tr-TR: I→ı, İ→i)
window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
  if (document.querySelector('dialog[open], .celebrate') || !cover.classList.contains('hidden')) return;
  const t = e.target;
  if (t?.closest?.('input, textarea, select, [contenteditable]')) return;
  const disTus = t?.closest?.('button, a') && !t.closest('.kd-klavye');
  if (e.key === 'Enter') {
    if (disTus) return;
    e.preventDefault();
    gir();
  } else if (e.key === 'Backspace' || e.key === 'Delete') {
    e.preventDefault();
    sil();
  } else {
    const harf = D.normalizeTus(e.key);
    if (harf) { e.preventDefault(); ekle(harf); }
  }
});

// ---------- yardım ----------
function nasilOynanir() {
  const ornek = (r, harf) => h('span', { class: 'kd-kare is-dolu is-ornek', 'data-r': r, 'aria-hidden': 'true' }, harf);
  const dlg = h('dialog', { class: 'ui-dialog kd-yardim', 'aria-labelledby': 'kd-yardim-t' });
  dlg.append(h('div', { class: 'dialog-card stack' },
    h('h2', { class: 'kd-baslik', id: 'kd-yardim-t' }, 'Nasıl oynanır?'),
    h('ol', { class: 'kd-kurallar' },
      h('li', {}, 'İkiniz de birbirinize 5 harfli gizli bir kelime seçin.'),
      h('li', {}, `Aynı anda, karşınızdakinin kelimesini ${D.HAK} denemede bulmaya çalışın. Her tahmin sözlükte olmalı.`),
      h('li', {}, 'Kim daha az denemede bulursa kazanır. Eşitlikte berabere.')),
    h('ul', { class: 'kd-lejant' },
      h('li', {}, ornek('d', 'K'), h('span', {}, h('b', {}, 'Dolu ve tikli: '), 'harf doğru yerde.')),
      h('li', {}, ornek('v', 'A'), h('span', {}, h('b', {}, 'Çizgili ve halkalı: '), 'harf kelimede var, başka yerde.')),
      h('li', {}, ornek('y', 'L'), h('span', {}, h('b', {}, 'Sade ve çizgili: '), 'harf kelimede yok.'))),
    h('p', { class: 'muted' }, 'Sevgilinin tahminlerini renk ve şekilleriyle canlı görürsün; harfler oyun bitince açılır.'),
    h('div', { class: 'dialog-actions' }, h('button', { type: 'button', class: 'btn primary', onclick: () => dlg.close() }, 'Tamam'))));
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
}

// ---------- kayıttan dönüş: eksik gizliyi geri koy ----------
function gizlileriSakla(s) {
  if (M.authority && s?.gizli) s.gizli.forEach((k, i) => { if (k) gizliYaz(s.kimlik, i, k); });
  const v = view();
  if (v?.kendi && myIdx(v) >= 0) gizliYaz(v.kimlik, myIdx(v), v.kendi); // misafir: ev sahibinin onayladığı kelimem
}
function geriKoy() {
  const s = M.sync.state;
  if (!s || s.faz === 'bitti') return;
  const d = gizliOku();
  if (!d || d.kimlik !== s.kimlik) return;
  if (M.authority) {
    s.hazir.forEach((h0, i) => {
      const key = `${s.kimlik}:${s.no}:${i}`;
      if (!h0 || s.gizli[i] || !d.k[i] || geriDenendi.has(key)) return;
      geriDenendi.add(key);
      later(() => M.sync.dispatch({ type: 'sec', kelime: d.k[i], idx: i }));
    });
    return;
  }
  const mi = myIdx(s);
  if (mi < 0 || !s.eksik?.[mi] || !d.k[mi] || Date.now() - geriYollandi < 3000) return;
  geriYollandi = Date.now();
  M.sync.dispatch({ type: 'sec', kelime: d.k[mi] });
}

// ---------- ses, duyuru, bitiş ----------
function effects(v, pv, info) {
  if (!pv) return;
  const mi = myIdx(v);
  if (mi < 0) return;
  const pi = 1 - mi;
  const ad = pName(v);
  if (v.no !== pv.no) {
    if (closeCelebrate) { try { closeCelebrate(); } catch { /* kapalı */ } closeCelebrate = null; }
    yazi = '';
    duzenle = false;
    sfx('flip');
    announce('Yeni oyun. Gizli kelimeni seç.');
    toast('Yeni oyun · gizli kelimeni seç');
    return;
  }
  if (pv.faz === 'secim' && v.faz === 'oyun') {
    sfx('pop');
    announce(`İkiniz de hazırsınız. ${tamlayan(ad)} kelimesini bul!`);
  } else if (v.faz === 'secim' && !pv.hazir[pi] && v.hazir[pi]) {
    sfx('pop');
    announce(`${ad} kelimesini seçti`);
  }
  if (v.tahmin[mi].length > pv.tahmin[mi].length) {
    const t = v.tahmin[mi].at(-1);
    sfx(t.r === D.BULDU ? 'match' : 'snap');
    announce(okunus(t));
  }
  if (v.tahmin[pi].length > pv.tahmin[pi].length) {
    const t = v.tahmin[pi].at(-1);
    if (t.r === D.BULDU && v.faz !== 'bitti') { sfx('pop'); toast(`${ad} kelimeni buldu!`); }
    else sfx('tick');
  }
  if (v.faz === 'bitti' && pv.faz !== 'bitti') bitis(v, info);
}

function bitis(v, info) {
  const mi = myIdx(v);
  const pi = 1 - mi;
  const ad = pName(v);
  const k = v.sonuc?.kazanan;
  const s = M.sync.state;
  if (M.authority && M.roomId && !info?.adopted && logged !== s.no) {
    logged = s.no;
    logGame(M.roomId, NS, D.resultOf(s));
  }
  try { localStorage.removeItem(GKEY); } catch { /* yok */ }
  if (celebrated === v.no) return;
  celebrated = v.no;
  const kazandim = k === mi;
  const baslik = k === -1 ? 'Berabere!' : kazandim ? 'Kazandın!' : `${ad} kazandı`;
  const puan = v.sonuc?.puan || [null, null];
  const kim = (i, sen) => (puan[i] ? `${puan[i]}. denemede ${sen ? 'buldun' : 'buldu'}` : sen ? 'bulamadın' : 'bulamadı');
  const satirlar = [
    `Sen ${kim(mi, true)} · ${ad} ${kim(pi, false)}`,
    `Kelimen ${BUYUK(v.acik?.[mi])} · ${tamlayan(ad)} kelimesi ${BUYUK(v.acik?.[pi])}`,
  ];
  announce(`${baslik}. ${satirlar.join('. ')}`);
  if (kazandim || k === -1) sfx('win');
  later(() => {
    const w = view();
    if (!w || w.faz !== 'bitti' || w.no !== v.no) return;
    closeCelebrate = celebrate({
      title: baslik,
      lines: satirlar,
      buttons: [
        { label: 'Tekrar oyna', primary: true, onClick: () => { closeCelebrate = null; M.sync.dispatch({ type: 'yeni', no: v.no }); } },
        { label: 'Tahtaya bak', onClick: () => { closeCelebrate = null; } },
        { label: 'Ana sayfaya dön', onClick: () => { location.href = lobbyUrl(); } },
      ],
    });
  }, REDUCED.matches ? 300 : 1300);
}

// ---------- yerleşim ----------
function layout() {
  const w = sahne.clientWidth;
  const hh = sahne.clientHeight;
  if (!w || !hh) return;
  const gap = 6;
  const rows = Number(orta.dataset.satir) === 1 ? 2.6 : D.HAK; // seçimde başlık ve açıklamaya yer kalsın
  const c = Math.floor(Math.max(30, Math.min((w - gap * 4) / 5, (hh - gap * (rows - 1)) / rows, 62)));
  root.style.setProperty('--kare', `${c}px`);
}

// ---------- başlat ----------
fitToViewport(root, layout);
if ('ResizeObserver' in window) new ResizeObserver(() => layout()).observe(sahne);

function dropResume() {
  if (!resumeOpen) return;
  resumeOpen = false;
  closeResume?.();
  closeResume = null;
}

M.start({
  onState(s, prev, info) {
    if (info?.adopted) geriDenendi.clear(); // benimsenen kayıtta gizliler yine boş: yeniden koy
    gizlileriSakla(s);
    if (s.faz === 'bitti') dropResume();
    const v = view();
    if (bekleyen && v && myIdx(v) >= 0 && (v.no !== onceki?.no || v.tahmin[myIdx(v)].length > bekleyen.n || v.faz !== 'oyun')) {
      clearTimeout(bekleyen.timer);
      bekleyen = null;
    }
    render();
    layout();
    if (v) effects(v, onceki, info);
    onceki = v;
    geriKoy();
  },
  onPeer(here) { away.set(here); render(); },
  onGone() {
    if (!resumeOpen) return;
    dropResume();
    M.fresh();
    toast('Bu oyun bitmiş. Yeni oyun hazır.');
  },
});

if (M.authority && M.resumed) {
  const s = M.sync.state;
  const n = s ? s.tahmin[0].length + s.tahmin[1].length : 0;
  if (s && s.faz !== 'bitti' && (s.hazir.some(Boolean) || n)) {
    resumeOpen = true;
    closeResume = resumeCard(cover, {
      title: 'Kaldığımız yerden devam?',
      detail: `${s.faz === 'secim' ? 'Kelimeler seçiliyordu' : `${n} tahmin yapılmıştı`}${s.at ? ` · ${agoText(Date.now() - s.at)}` : ''}`,
      onContinue: () => { resumeOpen = false; closeResume = null; render(); },
      onNew: () => { resumeOpen = false; closeResume = null; M.sync.dispatch({ type: 'yeni', no: M.sync.state.no }); },
    });
  }
}
render();
layout();
