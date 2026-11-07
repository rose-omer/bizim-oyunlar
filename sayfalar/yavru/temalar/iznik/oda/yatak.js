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
  + '<path class="yvo-cizgi" d="M60 90v52"/><path class="yvo-esya2" d="M34 172a26 30 0 0 1 52 0Z"/>';

const YILDIZLAR = '<path class="yvo-esya2" d="M46 220l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.1 5.9-.8Z"/>'
  + '<path class="yvo-esya2" d="M70 262l1.9 3.9 4.3.6-3.1 3 .7 4.3-3.8-2-3.8 2 .7-4.3-3.1-3 4.3-.6Z"/>';

const HALI = '<ellipse class="yvo-zemin2" cx="195" cy="430" rx="164" ry="28"/>';

export const sahne = () => sar('yatak', TABAN + PENCERE + LAMBA + YILDIZLAR + HALI);

export const CSS = `
.yv-sahne[data-gece] .yvo-svg[data-oda='yatak'] {
  --yvo-duvar: var(--yvo-gece);
  --yvo-duvar2: var(--yvo-gece);
  --yvo-zemin: var(--yvo-gece2);
  --yvo-zemin2: color-mix(in srgb, var(--yvo-gece2) 94%, var(--yvo-ay));
  --yvo-esya2: color-mix(in srgb, var(--yvo-gece2) 88%, var(--yvo-ay));
  --yvo-cam: color-mix(in srgb, var(--yvo-cam2) 25%, var(--yvo-gece));
  --yvo-cini1: color-mix(in srgb, var(--yvo-gece2) 80%, var(--yvo-cam2));
  --yvo-cini2: color-mix(in srgb, var(--yvo-gece2) 86%, var(--yvo-cam2));
  --yvo-cini3: var(--yvo-gece2);
  --yvo-derz: var(--yvo-gece2);
  --yvo-yer: color-mix(in srgb, var(--yvo-gece2) 88%, var(--yvo-cam2));
}
.yvo-yatak-gece { opacity: 0; }
.yv-sahne[data-gece] .yvo-yatak-gece { opacity: 1; }
.yv-sahne[data-gece] .yvo-yatak-isik { opacity: 0; }
@media (prefers-reduced-motion: no-preference) {
  .yvo-svg[data-oda='yatak'] * { transition: fill 0.8s ease, stroke 0.8s ease, opacity 0.8s ease; }
}
`;
