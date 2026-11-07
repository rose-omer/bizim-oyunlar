// Yavrumuz oda çizimi: oyun. Duvarda bayrak dizisi, solda küpler, sağda top, zeminde oval halı.
import { sar, TABAN } from './ortak.js';

/** İpin x'teki yüksekliği (M-6 92 Q195 142 396 92 eğrisi). */
const ipY = (x) => {
  const t = (x + 6) / 402;
  return 92 + 100 * t * (1 - t);
};

/** Üst kenarı ipe oturan üçgen bayrak. */
const bayrak = (renk, sira) => {
  const x = 29 + sira * 56;
  return `<path class="yvo-oyun-r${renk}" d="M${x} ${ipY(x).toFixed(1)}L${x + 52} ${ipY(x + 52).toFixed(1)}L${x + 26} ${(ipY(x + 26) + 40).toFixed(1)}Z"/>`;
};

const YILDIZ = 'M46 220l4 8.300 9.100 1.300-6.600 6.400 1.600 9.100-8.100-4.300-8.100 4.300 1.600-9.100-6.600-6.400 9.100-1.300Z';

// Bayrak dizisi kısa sahnede gizlenir: başlığın arkasına düşmesin.
const ESYALAR = `<g class="yvo-oyun-bayrak"><g class="yvo-oyun-pastel">${[1, 5, 6, 4, 2, 1].map(bayrak).join('')}</g><path class="yvo-cizgi" d="M-6 92Q195 142 396 92"/></g><g class="yvo-oyun-pastel">`
  + '<rect class="yvo-oyun-r5" x="18" y="332" width="42" height="42" rx="13"/>'
  + '<rect class="yvo-oyun-r1" x="60" y="344" width="30" height="30" rx="10"/>'
  + '<rect class="yvo-oyun-r6" x="28" y="298" width="32" height="34" rx="11"/>'
  + '<circle class="yvo-oyun-r1" cx="334" cy="342" r="32"/>'
  + '<path class="yvo-oyun-dikis" d="M303 336c20 8 42 8 62 0M334 310c-12 20-12 44 0 64"/>'
  + '</g>'
  + '<text class="yvo-oyun-harf" x="39" y="361">A</text><text class="yvo-oyun-harf kucuk" x="75" y="365">B</text><text class="yvo-oyun-harf kucuk" x="44" y="321">C</text>'
  + '<path class="yvo-oyun-bulut" d="M28 226a12 12 0 0 1 20-10 14 14 0 0 1 26 4 10 10 0 0 1 2 20H32a10 10 0 0 1-4-14Z"/>'
  + `<path class="yvo-esya2" d="${YILDIZ}" transform="translate(300 -46)"/><path class="yvo-esya2" d="${YILDIZ}" transform="translate(280 -4) scale(0.72) translate(0 86)"/>`
  + '<ellipse class="yvo-zemin2 yvo-puf" cx="195" cy="432" rx="166" ry="30"/>'
  + '<ellipse class="yvo-cizgi" cx="195" cy="432" rx="142" ry="22" stroke-dasharray="4 11"/>';

export const sahne = () => sar('oyun', TABAN + ESYALAR);

export const CSS = `
@container (max-height: 400px) { .yvo-oyun-bayrak { display: none; } }
.yvo-oyun-r1 { fill: var(--yv-r1); }
.yvo-oyun-r2 { fill: var(--yv-r2); }
.yvo-oyun-r4 { fill: var(--yv-r4); }
.yvo-oyun-r5 { fill: var(--yv-r5); }
.yvo-oyun-r6 { fill: var(--yv-r6); }
.yvo-oyun-pastel > rect, .yvo-oyun-pastel > circle, .yvo-oyun-bayrak path[class^='yvo-oyun-r'] { filter: url(#yvo-hamur); }
.yvo-oyun-harf { fill: var(--text); font-family: var(--font-display); font-size: 24px; font-weight: 800; text-anchor: middle; }
.yvo-oyun-harf.kucuk { font-size: 18px; }
.yvo-oyun-bulut { fill: var(--yvo-cerceve); filter: url(#yvo-hamur); }
.yvo-oyun-dikis { fill: none; stroke: var(--hero-ink); stroke-width: 3; opacity: 0.8; }
@media (prefers-color-scheme: dark) { :root:not([data-mod='acik']) .yvo-oyun-pastel { opacity: 0.82; } }
:root[data-mod='koyu'] .yvo-oyun-pastel { opacity: 0.82; }
`;
