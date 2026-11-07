// Yavrumuz oda çizimi: banyo. Sahne: fayanslı duvar, sağda duş, baloncuklar.
// Küvet sahnede değil: KUVET_SVG bebeğin üstüne, bebek SVG'siyle aynı koordinatta (0 0 200 200) çizilir; çene (y 117) açık kalır.
import { sar, TABAN } from './ortak.js';

const FAYANS = '<path class="yvo-banyo-fayans" d="M0 96H390M0 142H390M0 188H390M0 234H390M0 280H390M0 326H390'
  + 'M23 96V372M69 96V372M115 96V372M161 96V372M207 96V372M253 96V372M299 96V372M345 96V372"/>';
const DUS = '<path class="yvo-banyo-boru" d="M345 372V172a17 17 0 0 0-34 0"/><path class="yvo-esya2" d="M297 168h28a6 6 0 0 1 6 5l3 12a4 4 0 0 1-4 5h-38a4 4 0 0 1-4-5l3-12a6 6 0 0 1 6-5Z"/>';
const BALONCUK = '<circle class="yvo-cam" cx="326" cy="240" r="12" opacity="0.4"/>';
const AYNA = '<ellipse class="yvo-cam" cx="54" cy="170" rx="28" ry="36"/><path class="yvo-cizgi-duvar" d="M42 154q3-12 13-15"/>';
// Raf: şişeler ve ördek. Bebeğin solunda, ayna altında.
const RAF = '<rect class="yvo-r2" x="20" y="254" width="15" height="32" rx="6"/><rect class="yvo-esya2" x="23" y="247" width="9" height="9" rx="3"/>'
  + '<rect class="yvo-r5" x="39" y="264" width="12" height="22" rx="5"/>'
  + '<path class="yvo-r6" d="M56 286c0-12 9-14 14-10 2-9 14-9 14 0 0 5-4 7-7 8 2 0 5 1 5 2Z"/>'
  + '<path class="yvo-sicak" d="M84 266l7 2-7 3Z"/><circle class="yvo-banyo-goz" cx="78" cy="265" r="1.8"/>'
  + '<rect class="yvo-esya2" x="12" y="286" width="82" height="9" rx="4.5"/>';

export const sahne = () => sar('banyo', TABAN + FAYANS + DUS + BALONCUK + AYNA + RAF);

const KOPUK = '<circle class="yvo-banyo-acik" cx="30" cy="139" r="12"/><circle class="yvo-banyo-acik" cx="76" cy="139" r="12"/>'
  + '<circle class="yvo-banyo-acik" cx="124" cy="139" r="12"/><circle class="yvo-banyo-acik" cx="170" cy="139" r="12"/>'
  + '<circle class="yvo-banyo-ak" cx="53" cy="138" r="16"/><circle class="yvo-banyo-ak" cx="147" cy="138" r="16"/>'
  + '<circle class="yvo-banyo-ak" cx="100" cy="140" r="10"/>';

export const KUVET_SVG = '<svg class="yvo-kuvet" viewBox="0 0 200 200" aria-hidden="true" focusable="false">'
  + '<path class="yvo-banyo-ayak" d="M30 194l-5 11M170 194l5 11"/>'
  + '<path class="yvo-banyo-acik" d="M5 145H195V167a29 29 0 0 1-29 29H34a29 29 0 0 1-29-29Z"/>'
  + '<rect class="yvo-banyo-ak" x="-2" y="138" width="204" height="13" rx="6.5"/>'
  + KOPUK
  + '</svg>';

export const SABUN_SVG = '<svg class="yvo-sabun" viewBox="0 0 64 48" aria-hidden="true" focusable="false">'
  + '<rect class="yvo-banyo-sabun" x="6" y="14" width="52" height="30" rx="13"/>'
  + '<circle class="yvo-banyo-ak" cx="17" cy="13" r="9"/><circle class="yvo-banyo-ak" cx="44" cy="12" r="6.5"/>'
  + '</svg>';

export const CSS = `
.yvo-banyo-fayans { fill: none; stroke: var(--yvo-duvar2); stroke-width: 3.5; stroke-linecap: round; }
.yvo-svg[data-oda='banyo'] .yvo-benek { display: none; }
.yvo-banyo-boru { fill: none; stroke: var(--yvo-esya2); stroke-width: 9; stroke-linecap: round; }
.yvo-banyo-goz { fill: var(--yvb-murekkep); }
.yvo-kuvet { display: block; width: 100%; height: 100%; overflow: visible; }
.yvo-banyo-ayak { fill: none; stroke: var(--yvo-esya2); stroke-width: 5.5; stroke-linecap: round; }
.yvo-banyo-acik { fill: color-mix(in oklab, var(--yvb-ak) 82%, var(--yv-damla)); }
.yvo-kuvet path.yvo-banyo-acik { filter: url(#yvo-hamur); }
.yvo-banyo-ak { fill: var(--yvb-ak); }
.yvo-sabun { display: block; width: 100%; height: 100%; }
.yvo-banyo-sabun { fill: var(--yv-r1); }
`;
