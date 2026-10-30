// "Daha": tüm özellikler, oyunlar, davet, uygulamayı yükle, Android APK.
import { bootPage } from '../../js/core/sayfa.js';
import { SAYFALAR, GAMES } from '../../js/core/games.js';
import { pageUrl, lobbyUrl } from '../../js/core/identity.js';
import { h, icon, toast, shareInvite } from '../../js/core/ui.js';
import { kurulumDurumu } from '../../js/core/pwa.js';
import { isNative } from '../../js/core/mobil.js';
import { APK_URL, IOS_ADIMLARI, dahaOgeleri, apkGoster, kurulumGorunum } from './mantik.js';

const { roomId } = await bootPage({ ns: 'daha', title: 'Daha', tab: 'daha' });
const app = document.getElementById('app');

const STROKE = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"';
const svg = (d) => h('span', { class: 'daha-svg', html: `<svg viewBox="0 0 24 24" ${STROKE}>${d}</svg>` });
const SVG = {
  ileri: '<path d="m9.5 5.5 6.5 6.5-6.5 6.5"/>',
  yukle: '<path d="M12 4v10.5M7.5 10 12 14.5 16.5 10"/><path d="M5 19.5h14"/>',
  telefon: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>',
  ekle: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8.5v7M8.5 12h7"/>',
};

// ---------- Özellik kutucukları ----------
function kutu(s, i) {
  return h('a', { class: 'daha-kutu', href: pageUrl(s.path), dataset: { tint: String((i % 6) + 1) } },
    h('span', { class: 'daha-ikon', 'aria-hidden': 'true' }, s.icon),
    h('span', { class: 'daha-ad' }, s.title),
    h('span', { class: 'daha-aciklama' }, s.desc));
}

function oyunlarKutusu() {
  const ornek = GAMES.slice(0, 5);
  return h('a', { class: 'daha-oyunlar', href: `${lobbyUrl()}#oyunlar` },
    h('span', { class: 'daha-oyun-yigin', 'aria-hidden': 'true' },
      ornek.map((g, i) => h('span', { class: 'daha-oyun-pul', dataset: { tint: String((i % 6) + 1) } }, g.emoji))),
    h('span', { class: 'daha-oyun-metin' },
      h('span', { class: 'daha-ad' }, 'Oyunlarımız'),
      h('span', { class: 'daha-aciklama' }, `${GAMES.length} oyun ana sayfada sizi bekliyor.`)),
    svg(SVG.ileri));
}

// ---------- Uygulama satırları ----------
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
        ciz();
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
const listeKutusu = h('ul', { class: 'daha-liste', role: 'list' });

function ciz() {
  listeKutusu.replaceChildren(...[
    satir({
      ikon: icon('share'),
      baslik: 'Sevgilini davet et',
      aciklama: 'Odanızın linkini gönder; açınca yanına gelir.',
      onclick: () => shareInvite(roomId),
      sag: svg(SVG.ileri),
    }),
    kurulumSatiri(),
    apkSatiri(),
  ].filter(Boolean));
}

app.replaceChildren(h('div', { class: 'daha' },
  h('section', { class: 'daha-bolum', 'aria-labelledby': 'daha-h-ozellik' },
    h('h2', { class: 'daha-baslik', id: 'daha-h-ozellik' }, 'İkimize özel'),
    h('div', { class: 'daha-izgara' }, dahaOgeleri(SAYFALAR).map(kutu))),
  h('section', { class: 'daha-bolum', 'aria-labelledby': 'daha-h-oyun' },
    h('h2', { class: 'daha-baslik', id: 'daha-h-oyun' }, 'Birlikte oynayın'),
    oyunlarKutusu()),
  h('section', { class: 'daha-bolum', 'aria-labelledby': 'daha-h-uyg' },
    h('h2', { class: 'daha-baslik', id: 'daha-h-uyg' }, 'Uygulama'),
    listeKutusu)));
ciz();

// Kurulum durumu sonradan değişebilir (tarayıcı izni geç verir, kurulum biter).
window.addEventListener('beforeinstallprompt', () => setTimeout(ciz, 0));
window.addEventListener('appinstalled', () => setTimeout(ciz, 0));
