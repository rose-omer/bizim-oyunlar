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

// Bayrak dizisi kısa sahnede gizlenir: başlığın arkasına düşmesin.
const ESYALAR = `<g class="yvo-oyun-bayrak"><g class="yvo-oyun-pastel">${[1, 5, 6, 4, 2, 1].map(bayrak).join('')}</g><path class="yvo-cizgi" d="M-6 92Q195 142 396 92"/></g><g class="yvo-oyun-pastel">`
  + '<rect class="yvo-oyun-r5" x="18" y="332" width="42" height="42" rx="8"/>'
  + '<rect class="yvo-oyun-r1" x="60" y="344" width="30" height="30" rx="7"/>'
  + '<rect class="yvo-oyun-r6" x="28" y="298" width="32" height="34" rx="7"/>'
  + '<circle class="yvo-oyun-r1" cx="334" cy="342" r="32"/>'
  + '<path class="yvo-oyun-dikis" d="M303 336c20 8 42 8 62 0M334 310c-12 20-12 44 0 64"/>'
  + '</g>'
  + '<ellipse class="yvo-zemin2" cx="195" cy="432" rx="166" ry="30"/>'
  + '<ellipse class="yvo-cizgi" cx="195" cy="432" rx="142" ry="22" stroke-dasharray="4 11"/>';

export const sahne = () => sar('oyun', TABAN + ESYALAR);

export const CSS = `
@container (max-height: 400px) { .yvo-oyun-bayrak { display: none; } }
.yvo-oyun-r1, .yvo-oyun-r2, .yvo-oyun-r4, .yvo-oyun-r5, .yvo-oyun-r6 { fill: var(--yvo-esya); stroke: var(--yvo-esya2); stroke-width: 1; }
.yvo-oyun-dikis { fill: none; stroke: var(--yvo-esya2); stroke-width: 1; }
`;
