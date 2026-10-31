// "Daha": gruplu özellik listesi, davet (sevgili yokken), uygulamayı yükle, Android APK. Ayarlar üst çubukta.
import { bootPage } from '../../js/core/sayfa.js';
import { SAYFALAR, SEKMELER, sayfaById } from '../../js/core/games.js';
import { pageUrl } from '../../js/core/identity.js';
import { openProfil } from '../../js/core/profil.js';
import { h, icon, toast, shareInvite, knownPartner } from '../../js/core/ui.js';
import { kurulumDurumu } from '../../js/core/pwa.js';
import { isNative } from '../../js/core/mobil.js';
import { APK_URL, IOS_ADIMLARI, dahaGruplari, davetGoster, apkGoster, kurulumGorunum } from './mantik.js';

const { room, roomId } = await bootPage({ ns: 'daha', title: 'Daha', tab: 'daha' });
const app = document.getElementById('app');

const STROKE = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"';
const svg = (d) => h('span', { class: 'daha-svg', html: `<svg viewBox="0 0 24 24" ${STROKE}>${d}</svg>` });
const SVG = {
  ileri: '<path d="m9.5 5.5 6.5 6.5-6.5 6.5"/>',
  yukle: '<path d="M12 4v10.5M7.5 10 12 14.5 16.5 10"/><path d="M5 19.5h14"/>',
  telefon: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>',
  ekle: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8.5v7M8.5 12h7"/>',
};

// ---------- Üst çubuk: Ayarlar ----------
const ayarlar = sayfaById('ayarlar');
if (ayarlar) {
  document.querySelector('#shell .shell-tools')?.append(h('a', {
    class: 'icon-btn', href: pageUrl(ayarlar.path), 'aria-label': ayarlar.title, title: ayarlar.title,
  }, icon('settings')));
}

// ---------- Satırlar ----------
function satir({ ikon, baslik, aciklama, sag = null, ek = null, ...props }) {
  const tag = props.href ? 'a' : props.onclick ? 'button' : 'div';
  const attrs = tag === 'button' ? { type: 'button', ...props } : props;
  return h('li', {},
    h(tag, { class: `daha-satir${tag === 'div' ? '' : ' tiklanir'}`, ...attrs },
      h('span', { class: 'daha-satir-ikon' }, ikon),
      h('span', { class: 'daha-satir-metin' },
        h('span', { class: 'daha-satir-baslik' }, baslik),
        aciklama ? h('span', { class: 'daha-satir-aciklama' }, aciklama) : null),
      sag),
    ek);
}

const sayfaSatiri = (s) => satir({
  ikon: h('span', { class: 'daha-emoji', 'aria-hidden': 'true' }, s.icon),
  baslik: s.title,
  aciklama: s.desc,
  href: pageUrl(s.path),
  sag: svg(SVG.ileri),
});

function bolum(id, baslik, liste, grup = null) {
  return h('section', { class: 'daha-bolum', 'aria-labelledby': `daha-h-${id}`, dataset: grup ? { grup } : null },
    h('h2', { class: 'daha-baslik', id: `daha-h-${id}` }, baslik),
    liste);
}

function kurulumSatiri() {
  const k = kurulumDurumu();
  const gorunum = kurulumGorunum(k?.durum, isNative());
  if (gorunum === 'kurulabilir') {
    return satir({
      ikon: svg(SVG.yukle),
      baslik: 'Uygulamayı yükle',
      aciklama: 'Ana ekrandan tek dokunuşla açılır, bildirim alırsın.',
      onclick: async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        let ok = false;
        try { ok = await k.kur(); } catch { ok = false; }
        btn.disabled = false;
        if (ok) toast('Yüklendi. Artık ana ekranında.');
        uygulamaCiz();
      },
      sag: h('span', { class: 'btn small primary daha-sag', 'aria-hidden': 'true' }, 'Yükle'),
    });
  }
  if (gorunum === 'ios-elle') {
    return satir({
      ikon: svg(SVG.ekle),
      baslik: 'Ana ekrana ekle',
      aciklama: 'Uygulama gibi açılır, bildirim alabilirsin.',
      ek: h('ol', { class: 'daha-adimlar' }, IOS_ADIMLARI.map((metin, i) => h('li', {}, metin,
        i === 0 ? h('span', { class: 'daha-adim-ikon' }, icon('share')) : null))),
    });
  }
  return null;
}

function apkSatiri() {
  if (!apkGoster(navigator.userAgent, isNative())) return null;
  return satir({
    ikon: svg(SVG.telefon),
    baslik: 'Android uygulaması (APK)',
    aciklama: 'İndir ve kur. Telefon “bilinmeyen kaynak” izni isteyebilir.',
    href: APK_URL,
    rel: 'noopener',
    sag: svg(SVG.ileri),
  });
}

// ---------- Çizim ----------
// Davet: yalnız sevgili henüz yokken (önce hatırlanan partner, profil gelince kesinleşir).
let profil = null;
const davetBolumu = h('section', { class: 'daha-bolum', 'aria-label': 'Davet' },
  h('ul', { class: 'daha-liste daha-davet', role: 'list' }, satir({
    ikon: icon('share'),
    baslik: 'Sevgilini davet et',
    aciklama: 'Odanızın linkini gönder; açınca yanına gelir.',
    onclick: () => shareInvite(roomId),
    sag: svg(SVG.ileri),
  })));
function davetCiz() {
  davetBolumu.hidden = !davetGoster(knownPartner(roomId), profil?.partner());
}

const uygulamaListesi = h('ul', { class: 'daha-liste', role: 'list' });
const uygulamaBolumu = bolum('uyg', 'Uygulama', uygulamaListesi);
function uygulamaCiz() {
  const satirlar = [kurulumSatiri(), apkSatiri()].filter(Boolean);
  uygulamaListesi.replaceChildren(...satirlar);
  uygulamaBolumu.hidden = !satirlar.length;
}

app.replaceChildren(h('div', { class: 'daha' },
  davetBolumu,
  dahaGruplari(SAYFALAR, SEKMELER).map((g) => bolum(g.id, g.baslik,
    h('ul', { class: 'daha-liste', role: 'list' }, g.sayfalar.map(sayfaSatiri)), g.id)),
  uygulamaBolumu));
davetCiz();
uygulamaCiz();

room.on('presence', davetCiz);
openProfil(room).then((p) => {
  profil = p;
  p.on('change', davetCiz);
  davetCiz();
}).catch((e) => console.warn('[daha] profil', e));

// Kurulum durumu sonradan değişebilir (tarayıcı izni geç verir, kurulum biter).
window.addEventListener('beforeinstallprompt', () => setTimeout(uygulamaCiz, 0));
window.addEventListener('appinstalled', () => setTimeout(uygulamaCiz, 0));
