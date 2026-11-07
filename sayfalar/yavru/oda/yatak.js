// Yavrumuz oda çizimi: yatak. Uyanıkken gündüz, uyurken gece; `.yv-sahne[data-gece]` geceyi açar.
// İki durumun öğeleri de çizimde durur; görünürlüğü CSS seçer.
import { sar, TABAN } from './ortak.js';

// Pencere: gece öğeleri camın üstünde, çıtanın altında. Ay y 150'nin altında (küçük ekranda üst kırpılır).
const PENCERE = '<path class="yvo-cam" d="M250 234V150a54 54 0 0 1 108 0v84Z"/>'
  + '<g class="yvo-yatak-gece"><path class="yvo-ay" d="M336 178a17 17 0 1 0 8 26 14 14 0 0 1-8-26Z"/>'
  + '<circle class="yvo-ay" cx="334" cy="138" r="1.6"/><circle class="yvo-ay" cx="270" cy="152" r="2"/><circle class="yvo-ay" cx="282" cy="200" r="2"/></g>'
  + '<path class="yvo-cizgi-duvar" d="M304 96v138M250 170h108"/>';

// Sarkan lamba: ışık (huzme ve ampul) gece söner.
const LAMBA = '<g class="yvo-yatak-isik"><path class="yvo-sicak" d="M38 172h44l26 62a48 12 0 0 1-96 0Z" opacity="0.22"/><path class="yvo-sicak" d="M50 172a10 9 0 0 0 20 0Z"/></g>'
  + '<path class="yvo-cizgi" d="M60 90v52"/><path class="yvo-esya2" d="M32 174a28 34 0 0 1 56 0 4 4 0 0 1-4 4H36a4 4 0 0 1-4-4Z"/>';

const YILDIZ = 'M46 220l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.1 5.9-.8Z';
const YILDIZLAR = `<path class="yvo-esya2" d="${YILDIZ}"/>`
  + `<path class="yvo-esya2" d="${YILDIZ}" transform="translate(112 -122)"/>`
  + `<path class="yvo-esya2" d="${YILDIZ}" transform="translate(166 -136)"/>`;

// Beşik bebeğin arkasında: yalnız kenarları ve parmaklıkların ucu görünür.
const BESIK = '<path class="yvo-yatak-cubuk" d="M76 274V354M100 274V354M124 274V354M266 274V354M290 274V354M314 274V354"/>'
  + '<rect class="yvo-esya" x="56" y="262" width="278" height="12" rx="6"/>'
  + '<rect class="yvo-esya2" x="48" y="248" width="14" height="110" rx="7"/><rect class="yvo-esya2" x="328" y="248" width="14" height="110" rx="7"/>'
  + '<circle class="yvo-esya" cx="55" cy="244" r="9"/><circle class="yvo-esya" cx="335" cy="244" r="9"/>';

const HALI = '<ellipse class="yvo-zemin2 yvo-puf" cx="195" cy="430" rx="164" ry="28"/>';

export const sahne = () => sar('yatak', TABAN + PENCERE + LAMBA + YILDIZLAR + BESIK + HALI);

export const CSS = `
.yv-sahne[data-gece] .yvo-svg[data-oda='yatak'] {
  --yvo-duvar: var(--yvo-gece);
  --yvo-duvar2: var(--yvo-gece);
  --yvo-zemin: var(--yvo-gece2);
  --yvo-zemin2: color-mix(in srgb, var(--yvo-gece2) 94%, var(--yvo-ay));
  --yvo-esya: color-mix(in srgb, var(--yvo-gece2) 92%, var(--yvo-ay));
  --yvo-esya2: color-mix(in srgb, var(--yvo-gece2) 88%, var(--yvo-ay));
  --yvo-cam: color-mix(in srgb, var(--yvo-cam2) 25%, var(--yvo-gece));
}
.yvo-yatak-cubuk { fill: none; stroke: var(--yvo-esya2); stroke-width: 6; stroke-linecap: round; }
.yvo-yatak-gece { opacity: 0; }
.yv-sahne[data-gece] .yvo-yatak-gece { opacity: 1; }
.yv-sahne[data-gece] .yvo-yatak-isik { opacity: 0; }
@media (prefers-reduced-motion: no-preference) {
  .yvo-svg[data-oda='yatak'] * { transition: fill 0.8s ease, stroke 0.8s ease, opacity 0.8s ease; }
}
`;
