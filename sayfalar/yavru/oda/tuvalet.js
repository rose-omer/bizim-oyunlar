// Yavrumuz oda çizimi: tuvalet. Sade köşe: küçük pencere, havluluk ve havlu, tuvalet kâğıdı, basamak taburesi.
// Sağ alt köşede (x 280..380, y 330..430) eşya yok: lazımlık orada durur.
import { sar, TABAN } from './ortak.js';

const LAMBRI = '<rect class="yvo-duvar2" y="306" width="390" height="64"/>'
  + '<path class="yvo-tuvalet-oluk" d="M42 310V354M86 310V354M130 310V354M174 310V354M218 310V354M262 310V354M306 310V354M350 310V354"/>'
  + '<rect class="yvo-esya2" x="14" y="302" width="362" height="7" rx="3.5"/>';

const RESIM = '<rect class="yvo-cam" x="24" y="112" width="60" height="52" rx="7"/>'
  + '<path class="yvo-esya2" d="M54 124l4 8.300 9.100 1.300-6.600 6.400 1.600 9.100L54 144.800l-8.100 4.300 1.600-9.100-6.600-6.400 9.100-1.300Z"/>';

const PENCERE = '<path class="yvo-cam" d="M308 204V152a28 28 0 0 1 56 0v52Z"/>'
  + '<path class="yvo-cizgi-duvar" d="M336 124V204M308 166H364"/>'
  + '<rect class="yvo-esya2" x="298" y="202" width="76" height="12" rx="6"/>';

const HAVLU = '<rect class="yvo-esya2" x="12" y="204" width="74" height="10" rx="5"/>'
  + '<path class="yvo-esya" d="M24 210a5 5 0 0 1 5-5H69a5 5 0 0 1 5 5V280a6 6 0 0 1-6 6H30a6 6 0 0 1-6-6Z"/>'
  + '<rect class="yvo-esya2" x="24" y="266" width="50" height="5"/>';

const KAGIT = '<rect class="yvo-esya2" x="310" y="256" width="60" height="9" rx="4.500"/>'
  + '<path class="yvo-tuvalet-kagit" d="M327 244H354a7 17 0 0 1 0 34H327Z"/>'
  + '<path class="yvo-tuvalet-kagit" d="M333 261H361V304H333Z"/>'
  + '<path class="yvo-tuvalet-delik" d="M333 292H361"/>'
  + '<ellipse class="yvo-cam2" cx="327" cy="261" rx="7" ry="17"/>'
  + '<ellipse class="yvo-esya2" cx="327" cy="261" rx="3" ry="7"/>';

const TABURE = '<ellipse class="yvo-zemin2" cx="46" cy="405" rx="42" ry="5"/>'
  + '<path class="yvo-esya" d="M16 360H76V405H62V393a16 16 0 0 0-32 0V405H16Z"/>'
  + '<rect class="yvo-esya2" x="6" y="346" width="80" height="16" rx="8"/>';

export const sahne = () => sar('tuvalet', TABAN + LAMBRI + RESIM + PENCERE + HAVLU + KAGIT + TABURE);

/** Lazımlık (tuvalet odası; sürükleme hedefi). viewBox 0 0 80 80. */
export const LAZIMLIK_SVG = '<svg class="yvo-lazimlik" viewBox="0 0 80 80" aria-hidden="true" focusable="false">'
  + '<ellipse class="yvo-tuvalet-golge" cx="40" cy="75" rx="28" ry="4"/>'
  + '<path class="yvo-tuvalet-koyu" d="M21 34C19 18 27 8 40 8C53 8 61 18 59 34Z"/>'
  + '<path class="yvo-tuvalet-ak" d="M40 27C34 23 32 20 32 17.5a4 4 0 0 1 8-1a4 4 0 0 1 8 1C48 20 46 23 40 27Z"/>'
  + '<rect class="yvo-tuvalet-koyu" x="24" y="66" width="32" height="9" rx="4.5"/>'
  + '<path class="yvo-tuvalet-govde" d="M9 38H71C71 54 62 68 50 70H30C18 68 9 54 9 38Z"/>'
  + '<path class="yvo-tuvalet-isik" d="M17 48C19 55 23 60 27 63"/>'
  + '<ellipse class="yvo-tuvalet-ak" cx="40" cy="38" rx="33" ry="9.5"/>'
  + '<ellipse class="yvo-tuvalet-koyu" cx="40" cy="38" rx="21" ry="5"/>'
  + '<circle class="yvo-tuvalet-goz" cx="31" cy="53" r="2.4"/><circle class="yvo-tuvalet-goz" cx="49" cy="53" r="2.4"/>'
  + '<path class="yvo-tuvalet-gulus" d="M35 58Q40 63 45 58"/>'
  + '</svg>';

export const CSS = `
.yvo-tuvalet-oluk { fill: none; stroke: var(--yvo-duvar); stroke-width: 3; stroke-linecap: round; }
.yvo-tuvalet-kagit { fill: color-mix(in oklab, var(--yvo-cam) 50%, var(--yvb-ak)); }
.yvo-tuvalet-delik { fill: none; stroke: var(--yvo-cam2); stroke-width: 1.5; stroke-dasharray: 3 3; }
.yvo-lazimlik { display: block; width: 100%; height: 100%; }
.yvo-tuvalet-golge { fill: var(--yvb-murekkep); opacity: 0.16; }
.yvo-tuvalet-govde { fill: var(--yv-r5); }
.yvo-tuvalet-koyu { fill: color-mix(in oklab, var(--yv-r5) 82%, var(--yvb-murekkep)); }
.yvo-tuvalet-ak { fill: var(--yvb-ak); }
.yvo-tuvalet-isik { fill: none; stroke: var(--yvb-ak); stroke-width: 3; stroke-linecap: round; opacity: 0.6; }
.yvo-tuvalet-goz { fill: var(--yvb-murekkep); }
.yvo-tuvalet-gulus { fill: none; stroke: var(--yvb-murekkep); stroke-width: 2.2; stroke-linecap: round; }
`;
