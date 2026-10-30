// Birlikte İzle: aynı YouTube videosunu iki cihazda eş zamanlı oynatır.
// Eşleme mantığı esleme.js'te (saf, testli); burası YouTube oynatıcısı ve arayüz.
// Mesajlar (room.send, ns 'izle'):
//   { t:'izle', videoId, durum, zaman, hiz, at, surum, sahip, kalp? }  eylem ya da kalp atışı
//   { t:'izle-iste' }                 yeni gelen güncel durumu ister
//   { t:'saat', a } / { t:'saat-yanit', a, b }   saat farkı ölçümü
//   { t:'tepki', e }                  uçan emoji
import { bootPage } from '../../js/core/sayfa.js';
import { h, toast, knownPartner } from '../../js/core/ui.js';
import { sfx } from '../../js/core/sound.js';
import { bildir } from '../../js/core/bildirim.js';
import { videoAyristir, kapakUrl, sonaEkle, oncesi, gecerliId, createEsleyici } from './esleme.js';

const NS = 'izle';
const YT_API = 'https://www.youtube.com/iframe_api';
const TEPKILER = [
  { e: '❤️', ad: 'Kalp' },
  { e: '😂', ad: 'Kahkaha' },
  { e: '😮', ad: 'Şaşkın' },
  { e: '😢', ad: 'Hüzünlü' },
  { e: '🔥', ad: 'Ateş' },
];
const YT_DURUM = { '-1': 'hazir', 0: 'bitti', 1: 'oynuyor', 2: 'durdu', 3: 'tamponda', 5: 'hazir' };
const YT_HATA = {
  2: 'Bu bağlantıdaki video kimliği geçersiz.',
  5: 'Video bu tarayıcıda oynatılamadı.',
  100: 'Video bulunamadı ya da gizli.',
  101: 'Videonun sahibi başka sitelerde oynatılmasına izin vermiyor.',
  150: 'Videonun sahibi başka sitelerde oynatılmasına izin vermiyor.',
};

const { room, roomId, me } = await bootPage({ ns: NS, title: 'Birlikte İzle', tab: 'daha' });
const SON_KEY = `bizim.izle.son.${roomId}`;

const app = document.getElementById('app');
app.innerHTML = `
  <section class="iz" aria-label="Birlikte İzle">
    <form class="iz-form" id="iz-form" novalidate>
      <label class="iz-label" for="iz-url">YouTube bağlantısı</label>
      <div class="iz-row">
        <input class="input" id="iz-url" type="url" inputmode="url" autocomplete="off" autocapitalize="off"
          spellcheck="false" enterkeyhint="go" placeholder="Bağlantıyı buraya yapıştır" aria-describedby="iz-err">
        <button class="btn primary" type="submit">Aç</button>
      </div>
      <p class="iz-err" id="iz-err" role="alert"></p>
    </form>

    <div class="iz-stage">
      <div class="iz-frame" id="iz-frame">
        <div class="iz-player"><div id="iz-player"></div></div>
        <div class="iz-empty" id="iz-empty">
          <svg class="iz-art" viewBox="0 0 120 84" aria-hidden="true" focusable="false">
            <rect x="6" y="6" width="108" height="64" rx="12" />
            <path class="iz-art-heart" d="M60 52c-.5 0-1-.2-1.4-.5-8.6-7-15.1-12.7-15.1-20.1 0-5 3.9-9 8.8-9 3 0 5.8 1.5 7.7 3.9 1.9-2.4 4.7-3.9 7.7-3.9 4.9 0 8.8 4 8.8 9 0 7.4-6.5 13.1-15.1 20.1-.4.3-.9.5-1.4.5z"/>
            <path class="iz-art-leg" d="M44 70l-6 10M76 70l6 10" />
          </svg>
          <p class="iz-empty-title">Ne izleyelim?</p>
          <p class="iz-empty-text">Bir YouTube bağlantısı yapıştır; ikinizin ekranında aynı anda oynasın.</p>
        </div>
        <div class="iz-cover" id="iz-tap" hidden>
          <button type="button" class="iz-tap-btn" id="iz-tap-btn">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>
            <span>Oynatmak için dokun</span>
          </button>
          <p class="iz-tap-note" id="iz-tap-note">Telefonun otomatik oynatmaya izin vermedi.</p>
        </div>
        <div class="iz-cover iz-fail" id="iz-fail" hidden>
          <p class="iz-fail-title">YouTube oynatıcısı yüklenemedi</p>
          <p class="iz-fail-text">İnternet bağlantını kontrol edip yeniden dene.</p>
          <button type="button" class="btn small" id="iz-retry">Yeniden dene</button>
        </div>
        <div class="iz-fly" id="iz-fly" aria-hidden="true"></div>
      </div>
      <div class="iz-meta">
        <p class="iz-title" id="iz-title"></p>
        <div class="iz-sync-row">
          <p class="iz-sync" id="iz-sync" role="status"></p>
          <button type="button" class="btn small ghost iz-esitle" id="iz-esitle" hidden>Bana eşitle</button>
        </div>
      </div>
    </div>

    <div class="iz-react" role="group" aria-label="Tepki gönder">
      ${TEPKILER.map((t) => `<button type="button" class="iz-react-btn" data-e="${t.e}" aria-label="${t.ad} gönder">${t.e}</button>`).join('')}
    </div>

    <section class="iz-recent" aria-labelledby="iz-recent-h">
      <h2 class="iz-h" id="iz-recent-h">Son izlediklerimiz</h2>
      <ul class="iz-list" id="iz-list"></ul>
      <p class="iz-none" id="iz-none">Henüz birlikte bir şey izlemediniz. İlk videoyu sen seç 🎬</p>
    </section>
  </section>`;

const form = document.getElementById('iz-form');
const input = document.getElementById('iz-url');
const errEl = document.getElementById('iz-err');
const frame = document.getElementById('iz-frame');
const emptyEl = document.getElementById('iz-empty');
const tapEl = document.getElementById('iz-tap');
const tapNote = document.getElementById('iz-tap-note');
const failEl = document.getElementById('iz-fail');
const flyEl = document.getElementById('iz-fly');
const titleEl = document.getElementById('iz-title');
const syncEl = document.getElementById('iz-sync');
const esitleBtn = document.getElementById('iz-esitle');
const listEl = document.getElementById('iz-list');
const noneEl = document.getElementById('iz-none');

// ---------- YouTube oynatıcısı ----------
let player = null;
let hazir = false;
let kuruluyor = false;
let ytSoz = null;
let tapDeneme = 0;

function ytYukle() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (ytSoz) return ytSoz;
  ytSoz = new Promise((resolve, reject) => {
    const once = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { try { once?.(); } catch { /* yok */ } resolve(window.YT); };
    const s = document.createElement('script');
    s.src = YT_API;
    s.async = true;
    s.onerror = () => { s.remove(); reject(new Error('YouTube betiği yüklenemedi')); };
    document.head.appendChild(s);
    setTimeout(() => reject(new Error('YouTube betiği zaman aşımı')), 15000);
  }).catch((e) => {
    ytSoz = null;
    throw e;
  });
  return ytSoz;
}

async function oynaticiKur() {
  if (player || kuruluyor) return;
  kuruluyor = true;
  failEl.hidden = true;
  try {
    const YT = await ytYukle();
    player = new YT.Player('iz-player', {
      width: '100%',
      height: '100%',
      playerVars: { playsinline: 1, rel: 0, modestbranding: 1, origin: location.origin },
      events: {
        onReady: () => { hazir = true; es.oynaticiHazir(); },
        onStateChange: () => { es.denetle(); baslikGuncelle(); },
        onPlaybackRateChange: () => es.denetle(),
        onError: (e) => hataGoster(YT_HATA[e?.data] || 'Video oynatılamadı.'),
      },
    });
  } catch (e) {
    console.warn('[izle]', e?.message || e);
    failEl.hidden = false;
  } finally {
    kuruluyor = false;
  }
}

const oynatici = {
  zaman: () => (hazir ? player.getCurrentTime?.() ?? 0 : 0),
  durum: () => (hazir ? YT_DURUM[player.getPlayerState?.()] ?? 'hazir' : 'yok'),
  hiz: () => (hazir ? player.getPlaybackRate?.() ?? 1 : 1),
  oynat: () => hazir && player.playVideo(),
  duraklat: () => hazir && player.pauseVideo(),
  git: (sn) => hazir && player.seekTo(sn, true),
  hizAyarla: (x) => hazir && player.setPlaybackRate(x),
  yukle: (id, sn, oynat) => {
    gorunum();
    if (!hazir) { oynaticiKur(); return; } // hazır olunca oynaticiHazir() yükler
    const o = { videoId: id, startSeconds: Math.max(0, sn) };
    if (oynat) player.loadVideoById(o);
    else player.cueVideoById(o);
  },
};

// ---------- eşleme ----------
const es = createEsleyici({
  oynatici,
  ben: me.clientId,
  gonder: (m) => room.send(m),
  onEngel: (v) => {
    tapEl.hidden = !v;
    if (v) {
      tapNote.textContent = tapDeneme > 0
        ? 'Hâlâ başlamadıysa videonun üstündeki oynat düğmesine dokun.'
        : 'Telefonun otomatik oynatmaya izin vermedi.';
      tapEl.classList.toggle('is-soft', tapDeneme > 0); // ikinci kez: dokunuş videoya geçsin
    }
  },
  onOrtak: (o, kaynak) => {
    gorunum();
    if (o.videoId !== sonVideo) {
      sonVideo = o.videoId;
      titleEl.textContent = '';
      tapDeneme = 0;
      sonaKaydet(o.videoId, '');
      if (kaynak === 'uzak') { sfx('pop'); toast(`${partnerAdi()} bir video açtı 🎬`); }
    }
    durumYaz();
  },
});
let sonVideo = null;
setInterval(() => es.denetle(), 500);

function gorunum() {
  const var_ = !!es.ortak;
  emptyEl.hidden = var_;
  frame.classList.toggle('has-video', var_);
  esitleBtn.hidden = !var_;
}

function baslikGuncelle() {
  if (!hazir || !es.ortak) return;
  const d = player.getVideoData?.();
  const baslik = d?.video_id === es.ortak.videoId ? d.title : '';
  if (baslik && titleEl.textContent !== baslik) {
    titleEl.textContent = baslik;
    sonaKaydet(es.ortak.videoId, baslik);
  }
}

function hataGoster(text) {
  errEl.textContent = text;
  input.setAttribute('aria-invalid', 'true');
}
function hataTemizle() {
  errEl.textContent = '';
  input.removeAttribute('aria-invalid');
}

// ---------- partner ----------
let partnerBurada = false;
const bildirilen = new Set();
function partnerAdi() {
  return room.partner()?.name || knownPartner(roomId)?.name || 'Sevgilin';
}
function durumYaz() {
  const p = room.partner();
  const ad = partnerAdi();
  let kind;
  let text;
  if (p && p.page === NS) {
    kind = 'here';
    text = es.ortak ? 'Eş zamanlı izliyorsunuz' : `${ad} burada. Bir video seçin.`;
  } else if (p) {
    kind = 'on';
    text = `${ad} başka bir sayfada. Video açınca haber veririz.`;
  } else {
    kind = 'off';
    text = `${ad} şu an çevrimdışı.`;
  }
  syncEl.dataset.state = kind;
  syncEl.replaceChildren(h('span', { class: 'dot', 'aria-hidden': 'true' }), h('span', {}, text));
}

function saatOlc() {
  [0, 400, 1200].forEach((ms) => setTimeout(() => room.send({ t: 'saat', a: Date.now() }), ms));
}

room.on('presence', (p) => {
  const burada = !!p && p.page === NS;
  if (burada && !partnerBurada) {
    room.send({ t: 'izle-iste' });
    saatOlc();
    const m = es.durumMesaji();
    if (m) room.send(m); // partner gelince mevcut video ve konum
  }
  partnerBurada = burada;
  durumYaz();
});

room.on('message', (m) => {
  if (!m || typeof m !== 'object') return;
  switch (m.t) {
    case 'izle':
      if (es.uzaktan(m) === 'eski') { const d = es.durumMesaji(); if (d) room.send(d); } // geride kalana güncelini yolla
      break;
    case 'izle-iste': {
      const d = es.durumMesaji();
      if (d) room.send(d);
      break;
    }
    case 'saat':
      if (Number.isFinite(m.a)) room.send({ t: 'saat-yanit', a: m.a, b: Date.now() });
      break;
    case 'saat-yanit':
      if (Number.isFinite(m.a) && Number.isFinite(m.b)) es.saatOrnek(m.a, m.b, Date.now());
      break;
    case 'tepki':
      if (TEPKILER.some((t) => t.e === m.e)) ucur(m.e, 'o');
      break;
    default:
  }
});

// ---------- video açma ----------
function videoAc(id, baslangic = 0) {
  if (!gecerliId(id)) return;
  hataTemizle();
  es.videoAc(id, baslangic);
  sfx('tap');
  const p = room.partner();
  if (!(p && p.page === NS) && !bildirilen.has(id)) {
    bildirilen.add(id);
    bildir(roomId, {
      tur: 'izle',
      baslik: 'Birlikte izleyelim mi?',
      metin: `${me.name || 'Sevgilin'} bir video açtı. Gel, aynı anda izleyelim 🎬`,
      url: 'sayfalar/izle/',
    });
    toast(`${partnerAdi()} burada değil; haber verdik 💌`);
  }
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const v = videoAyristir(input.value);
  if (!v) {
    hataGoster(input.value.trim() ? 'Bu bir YouTube bağlantısına benzemiyor.' : 'Önce bir YouTube bağlantısı yapıştır.');
    input.focus();
    sfx('wrong');
    return;
  }
  input.value = '';
  input.blur();
  videoAc(v.id, v.baslangic);
});
input.addEventListener('input', hataTemizle);
// Yapıştırınca geçerliyse hemen aç
input.addEventListener('paste', () => setTimeout(() => {
  if (videoAyristir(input.value)) form.requestSubmit();
}, 0));

document.getElementById('iz-retry').addEventListener('click', () => {
  failEl.hidden = true;
  oynaticiKur();
});
document.getElementById('iz-tap-btn').addEventListener('click', () => {
  tapDeneme++;
  es.dokunOynat();
});
esitleBtn.addEventListener('click', () => {
  if (es.esitle()) { sfx('pop'); toast(`${partnerAdi()} senin konumuna geldi`); }
});

// ---------- tepkiler ----------
let sonTepki = 0;
document.querySelector('.iz-react').addEventListener('click', (e) => {
  const b = e.target.closest('[data-e]');
  if (!b) return;
  const now = Date.now();
  if (now - sonTepki < 250) return; // en çok 4/sn
  sonTepki = now;
  ucur(b.dataset.e, 'ben');
  room.send({ t: 'tepki', e: b.dataset.e });
  sfx('pop');
});

function ucur(e, kimden) {
  const el = document.createElement('span');
  el.className = `iz-emoji ${kimden}`;
  el.textContent = e;
  const sol = kimden === 'ben' ? 8 + Math.random() * 30 : 58 + Math.random() * 30;
  el.style.setProperty('--x', `${sol.toFixed(1)}%`);
  el.style.setProperty('--drift', `${Math.round(Math.random() * 50 - 25)}px`);
  el.style.setProperty('--rot', `${Math.round(Math.random() * 30 - 15)}deg`);
  if (kimden === 'o') el.dataset.ad = partnerAdi();
  flyEl.appendChild(el);
  const sil = () => el.remove();
  el.addEventListener('animationend', sil);
  setTimeout(sil, 4000);
}

// ---------- son izlenenler (bu cihazda) ----------
function sonOku() {
  try {
    const v = JSON.parse(localStorage.getItem(SON_KEY) || '[]');
    return Array.isArray(v) ? v.filter((x) => gecerliId(x?.id)) : [];
  } catch {
    return [];
  }
}
function sonaKaydet(id, baslik) {
  const l = sonaEkle(sonOku(), { id, baslik, at: Date.now() });
  try { localStorage.setItem(SON_KEY, JSON.stringify(l)); } catch { /* dolu ya da gizli */ }
  sonCiz(l);
}
function sonCiz(l = sonOku()) {
  noneEl.hidden = l.length > 0;
  listEl.replaceChildren(...l.map((x) => h('li', {},
    h('button', { type: 'button', class: 'iz-item', dataset: { id: x.id }, 'aria-label': `${x.baslik || 'YouTube videosu'}: yeniden aç` },
      h('img', { class: 'iz-thumb', src: kapakUrl(x.id), alt: '', loading: 'lazy', width: '112', height: '63' }),
      h('span', { class: 'iz-item-body' },
        h('span', { class: 'iz-item-title' }, x.baslik || 'YouTube videosu'),
        h('span', { class: 'iz-item-when' }, oncesi(x.at)))))));
}
listEl.addEventListener('click', (e) => {
  const b = e.target.closest('.iz-item');
  if (!b) return;
  videoAc(b.dataset.id, 0);
  frame.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
});

// ---------- açılış ----------
sonCiz();
durumYaz();
gorunum();
ytYukle().catch(() => { /* video açılınca yeniden denenir */ });
// Başka sayfadan bağlantıyla gelindiyse (?v=<kimlik> ya da ?url=<youtube bağlantısı>) aç
{
  const q = new URLSearchParams(location.search);
  const v = videoAyristir(q.get('v') || q.get('url') || '');
  if (v) setTimeout(() => videoAc(v.id, v.baslangic), 800); // önce partnerin burada olup olmadığı öğrenilsin
}
