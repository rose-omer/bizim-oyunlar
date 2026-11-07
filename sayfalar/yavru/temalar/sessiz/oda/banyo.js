// Yavrumuz oda çizimi: banyo. Sahne: fayanslı duvar, sağda duş, baloncuklar.
// Küvet sahnede değil: KUVET_SVG bebeğin üstüne, bebek SVG'siyle aynı koordinatta (0 0 200 200) çizilir; çene (y 117) açık kalır.
import { sar, TABAN } from './ortak.js';

const FAYANS = '<path class="yvo-banyo-fayans" d="M0 96H390M0 142H390M0 188H390M0 234H390M0 280H390M0 326H390'
  + 'M23 96V372M69 96V372M115 96V372M161 96V372M207 96V372M253 96V372M299 96V372M345 96V372"/>';
const DUS = '<path class="yvo-banyo-boru" d="M345 372V172a17 17 0 0 0-34 0"/><path class="yvo-esya2" d="M295 172h32l5 14h-42Z"/>';
const BALONCUK = '<circle class="yvo-cam" cx="52" cy="170" r="16" opacity="0.5"/>'
  + '<circle class="yvo-cam" cx="58" cy="222" r="9" opacity="0.4"/>'
  + '<circle class="yvo-cam" cx="326" cy="240" r="12" opacity="0.4"/>';

export const sahne = () => sar('banyo', TABAN + FAYANS + DUS + BALONCUK);

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
.yvo-banyo-fayans { fill: none; stroke: var(--yvo-zemin2); stroke-width: 1; }
.yvo-banyo-boru { fill: none; stroke: var(--yvo-esya2); stroke-width: 1.5; stroke-linecap: round; }
.yvo-kuvet { display: block; width: 100%; height: 100%; overflow: visible; }
.yvo-banyo-ayak { fill: none; stroke: var(--yvo-esya2); stroke-width: 1.5; stroke-linecap: round; }
.yvo-banyo-acik { fill: var(--surface); stroke: var(--yvo-esya2); stroke-width: 1; }
.yvo-banyo-ak { fill: var(--surface); stroke: var(--yvo-esya2); stroke-width: 0.8; }
.yvo-sabun { display: block; width: 100%; height: 100%; }
.yvo-banyo-sabun { fill: var(--surface-2); stroke: var(--muted); stroke-width: 1; }
`;
