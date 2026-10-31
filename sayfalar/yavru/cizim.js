// Yavrumuz: elle çizilmiş, kodla üretilen SVG (dış görsel yok). Saf metin üretir; DOM yok (Node'da test edilir).
// Sayfa (app.js) ve ana sayfa kartı (kart.js) paylaşır. Stil CIZIM_CSS'te: sayfa ve kart bir <style> ile ekler.
// Renkler değişkenden: gövde --yv-r1..6 (oda kimliğinden tohumlu), çizgi ve göz var(--hero) (iki temada da koyu),
// parıltı var(--hero-ink) (iki temada da açık). Böylece pastel yavru açık ve koyu zeminde aynı kalır.

export const ASAMALAR = ['yumurta', 'kucuk', 'buyuk'];
export const RUHLAR = ['normal', 'mutlu', 'ac', 'kirli', 'uykulu', 'uzgun', 'uyuyor'];

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// ---------- Yüz (0,0 merkezli; gözler ±16, ağız altta) ----------

const gozAcik = (rx = 4.6, ry = 5.6) =>
  `<g class="yv-goz"><ellipse cx="-16" cy="0" rx="${rx}" ry="${ry}"/><ellipse cx="16" cy="0" rx="${rx}" ry="${ry}"/>`
  + `<circle class="yv-parilti" cx="-14.3" cy="-2.2" r="1.7"/><circle class="yv-parilti" cx="17.7" cy="-2.2" r="1.7"/></g>`;
const yanak = (op = '') => `<ellipse class="yv-yanak${op}" cx="-27" cy="9" rx="6.2" ry="3.6"/><ellipse class="yv-yanak${op}" cx="27" cy="9" rx="6.2" ry="3.6"/>`;
const cizgi = (d) => `<path class="yv-cizgi" d="${d}"/>`;
const agiz = (ic) => `<g class="yv-agiz-g">${ic}</g>`;

const YUZLER = {
  normal: () => gozAcik() + yanak() + agiz(cizgi('M-5 10 Q0 14.5 5 10')),
  mutlu: () => cizgi('M-21 2 Q-16 -5 -11 2') + cizgi('M11 2 Q16 -5 21 2') + yanak(' guclu')
    + agiz('<path class="yv-agiz" d="M-7.5 8 Q0 20 7.5 8 Z"/><ellipse class="yv-dil" cx="0" cy="13.6" rx="3.4" ry="2"/>'),
  ac: () => gozAcik(5.2, 6.4) + yanak() + agiz('<ellipse class="yv-agiz" cx="0" cy="12" rx="3.6" ry="4.4"/>'),
  kirli: () => gozAcik() + yanak() + agiz(cizgi('M-6.5 11 Q-3.2 8 0 11 Q3.2 14 6.5 11')),
  uykulu: () => '<path class="yv-agiz" d="M-21 0 Q-16 6.5 -11 0 Z"/><path class="yv-agiz" d="M11 0 Q16 6.5 21 0 Z"/>'
    + cizgi('M-22.5 0 L-9.5 0') + cizgi('M9.5 0 L22.5 0') + yanak() + agiz('<ellipse class="yv-agiz" cx="0" cy="12" rx="2.6" ry="3"/>'),
  uzgun: () => gozAcik() + cizgi('M-22 -8 L-11.5 -11.5') + cizgi('M11.5 -11.5 L22 -8') + yanak()
    + agiz(cizgi('M-5 13.5 Q0 9 5 13.5')) + '<path class="yv-damla" d="M-19 6.5 Q-22.2 11.6 -19 13.6 Q-15.8 11.6 -19 6.5 Z"/>',
  uyuyor: () => cizgi('M-21 0 Q-16 5 -11 0') + cizgi('M11 0 Q16 5 21 0') + yanak()
    + agiz(cizgi('M-3 11 Q0 13 3 11')),
};

const yuz = (ruh, x, y, s = 1) => `<g class="yv-yuz" transform="translate(${x} ${y}) scale(${s})">${YUZLER[ruh]()}</g>`;

// Küçük işaretler (sevimli; sinek yok): düşünce balonu, leke, z'ler.
function isaret(ruh, x, y, lekeler) {
  if (ruh === 'ac') {
    return `<g class="yv-isaret yv-dusunce"><circle cx="${x - 12}" cy="${y + 16}" r="2.6"/><circle cx="${x - 5}" cy="${y + 7}" r="3.8"/>`
      + `<circle cx="${x + 10}" cy="${y - 9}" r="14"/>`
      + `<rect class="yv-biberon" x="${x + 5.5}" y="${y - 11}" width="9" height="12" rx="3"/>`
      + `<rect class="yv-biberon-uc" x="${x + 7.5}" y="${y - 16}" width="5" height="5" rx="2"/></g>`;
  }
  if (ruh === 'kirli') {
    return `<g class="yv-isaret yv-leke">${lekeler.map(([lx, ly, r]) =>
      `<path d="M${lx - r} ${ly} q${r * 0.3} -${r} ${r} -${r * 0.8} q${r} -${r * 0.1} ${r} ${r * 0.7} q0 ${r} -${r} ${r * 0.9} q-${r} 0 -${r} -${r * 0.8}z"/>`).join('')}</g>`;
  }
  if (ruh === 'uykulu') return `<text class="yv-isaret yv-z" x="${x}" y="${y}">z</text>`;
  if (ruh === 'uyuyor') {
    return `<g class="yv-isaret yv-zzz"><text class="yv-z1" x="${x - 6}" y="${y + 10}">z</text>`
      + `<text class="yv-z2" x="${x + 4}" y="${y - 2}">z</text><text class="yv-z3" x="${x + 14}" y="${y - 16}">Z</text></g>`;
  }
  return '';
}

// ---------- Aşamalar (viewBox 0 0 200 200, zemin y≈180) ----------

function yumurta(hazir) {
  return '<ellipse class="yv-zemin" cx="100" cy="181" rx="42" ry="6.5"/>'
    + '<g class="yv-beden">'
    + '<path class="yv-kabuk" d="M100 50 C131 50 150 102 150 132 C150 161 128 178 100 178 C72 178 50 161 50 132 C50 102 69 50 100 50 Z"/>'
    + '<ellipse class="yv-benek" cx="83" cy="97" rx="9" ry="7"/><ellipse class="yv-benek" cx="121" cy="86" rx="5" ry="4"/>'
    + '<ellipse class="yv-benek" cx="119" cy="134" rx="12" ry="9"/><ellipse class="yv-benek" cx="79" cy="152" rx="7" ry="5.5"/>'
    + '<ellipse class="yv-isik" cx="79" cy="82" rx="7" ry="12" transform="rotate(24 79 82)"/>'
    + (hazir ? '<path class="yv-catlak" d="M53 118 L65 110 L75 121 L88 108 L100 121 L112 108 L125 121 L136 111 L147 117"/>' : '')
    + '</g>';
}

// Küçük yavru üç parça: zemin, gövde (kabuktan çıkan kısım), kabuğun alt yarısı. Çatlama sahnesi de bunları kullanır.
const KUCUK_ZEMIN = '<ellipse class="yv-zemin" cx="100" cy="182" rx="48" ry="6.5"/>';
// Kabuğun alt yarısı hâlâ üstünde: 🐣
const KUCUK_KABUK = '<path class="yv-kabuk" d="M54 154 L64 146 L74 155 L86 145 L100 156 L114 145 L126 155 L136 146 L146 154 C146 172 128 182 100 182 C72 182 54 172 54 154 Z"/>'
  + '<ellipse class="yv-benek" cx="76" cy="168" rx="6" ry="4"/><ellipse class="yv-benek" cx="124" cy="166" rx="7" ry="4.5"/>';

function kucukGovde(ruh) {
  return '<ellipse class="yv-govde" cx="55" cy="140" rx="8" ry="10" transform="rotate(-24 55 140)"/>'
    + '<ellipse class="yv-govde" cx="145" cy="140" rx="8" ry="10" transform="rotate(24 145 140)"/>'
    + '<path class="yv-govde" d="M100 88 C129 88 151 110 152 140 C153 165 130 174 100 174 C70 174 47 165 48 140 C49 110 71 88 100 88 Z"/>'
    + '<path class="yv-govde" d="M97 90 C92 80 99 72 106 77 C110 80 107 85 103 84"/>'
    + '<ellipse class="yv-isik" cx="74" cy="108" rx="9" ry="5.5" transform="rotate(-34 74 108)"/>'
    + yuz(ruh, 100, 128)
    + isaret(ruh, 140, 86, [[72, 146, 5], [126, 118, 4], [114, 150, 3.5]]);
}

function kucuk(ruh) {
  return `${KUCUK_ZEMIN}<g class="yv-beden">${kucukGovde(ruh)}${KUCUK_KABUK}</g>`;
}

function buyuk(ruh) {
  return '<ellipse class="yv-zemin" cx="100" cy="183" rx="54" ry="7"/>'
    + '<g class="yv-beden">'
    + '<path class="yv-kuyruk yv-kuyruk-dis" d="M146 158 C170 160 178 138 166 130 C157 124 150 134 158 138"/>'
    + '<path class="yv-kuyruk" d="M146 158 C170 160 178 138 166 130 C157 124 150 134 158 138"/>'
    + '<g class="yv-kulak"><ellipse class="yv-govde" cx="70" cy="66" rx="13" ry="22" transform="rotate(-22 70 66)"/>'
    + '<ellipse class="yv-kulak-ic" cx="70" cy="68" rx="6.5" ry="13" transform="rotate(-22 70 68)"/>'
    + '<ellipse class="yv-govde" cx="130" cy="66" rx="13" ry="22" transform="rotate(22 130 66)"/>'
    + '<ellipse class="yv-kulak-ic" cx="130" cy="68" rx="6.5" ry="13" transform="rotate(22 130 68)"/></g>'
    + '<path class="yv-govde" d="M100 66 C134 66 154 94 154 128 C154 162 134 178 100 178 C66 178 46 162 46 128 C46 94 66 66 100 66 Z"/>'
    + '<ellipse class="yv-karin" cx="100" cy="146" rx="30" ry="24"/>'
    + '<ellipse class="yv-isik" cx="72" cy="92" rx="10" ry="6" transform="rotate(-38 72 92)"/>'
    + '<ellipse class="yv-govde" cx="50" cy="134" rx="8" ry="12" transform="rotate(-18 50 134)"/>'
    + '<ellipse class="yv-govde" cx="150" cy="134" rx="8" ry="12" transform="rotate(18 150 134)"/>'
    + '<ellipse class="yv-govde" cx="80" cy="178" rx="13" ry="6.5"/><ellipse class="yv-govde" cx="120" cy="178" rx="13" ry="6.5"/>'
    + yuz(ruh, 100, 108, 1.08)
    + isaret(ruh, 144, 62, [[70, 126, 5.5], [130, 104, 4.5], [118, 158, 4]])
    + '</g>';
}

/**
 * Yavru SVG'si (metin). asama: 'yumurta'|'kucuk'|'buyuk'; ruh: RUHLAR; renk: 1–6; hazir: yumurtada çatlak.
 * etiket verilirse role="img" + aria-label; yoksa ekran okuyucudan gizli. Bilinmeyen değer varsayılana düşer.
 */
export function yavruSvg({ asama = 'kucuk', ruh = 'normal', renk = 1, hazir = false, etiket = '' } = {}) {
  const a = ASAMALAR.includes(asama) ? asama : 'kucuk';
  const r = a === 'yumurta' ? 'yumurta' : RUHLAR.includes(ruh) ? ruh : 'normal';
  const k = Number.isInteger(renk) && renk >= 1 && renk <= 6 ? renk : 1;
  const erisim = etiket ? `role="img" aria-label="${esc(etiket)}"` : 'aria-hidden="true"';
  const ic = a === 'yumurta' ? yumurta(!!hazir) : a === 'buyuk' ? buyuk(r) : kucuk(r);
  return `<svg viewBox="0 0 200 200" class="yv-svg" data-asama="${a}" data-ruh="${r}" style="--yv-govde:var(--yv-r${k})" ${erisim} focusable="false">${ic}</svg>`;
}

// ---------- Çatlama sahnesi ----------
// Yumurta = üst kabuk + küçük yavrunun alt kabuğu (dişli kenar ortak). Yumurta çizimi 4 birim aşağıda (zemin 182).
const UST_KABUK = 'M54 154 C51 147.5 50 141.8 50 136 C50 106 69 54 100 54 C131 54 150 106 150 136 C150 141.8 149 147.5 146 154'
  + ' L136 146 L126 155 L114 145 L100 156 L86 145 L74 155 L64 146 Z';
// Dişli kenarın tepelerinden yukarı dallanan çatlaklar: [yol, gecikme (sn)]
const CATLAKLAR = [
  ['M86 145 L83 135 L89 128 L86 120', 0.45],
  ['M114 145 L118 136 L113 129', 0.8],
  ['M64 146 L61 139 L66 133', 1.05],
  ['M136 146 L140 138 L135 132', 1.25],
];
// Kabuk kırıntıları: [yol, uçuş x, uçuş y, dönüş]
const KIRINTILAR = [
  ['M92 150 l8 -5 l2 8 z', -46, -54, -160],
  ['M108 150 l7 4 l-7 4 z', 52, -46, 140],
  ['M70 152 l6 -6 l3 7 z', -64, -12, -220],
  ['M128 152 l7 -4 l1 7 z', 66, -6, 200],
];
// Parıltılar: [x, y, gecikme (sn), ölçek]
const YILDIZLAR = [[46, 96, 0, 1], [156, 88, 0.08, 1.2], [36, 136, 0.16, 0.8], [166, 130, 0.1, 0.9], [72, 62, 0.22, 0.75], [130, 58, 0.04, 0.95]];
const YILDIZ = 'M0 -7 L1.8 -1.8 L7 0 L1.8 1.8 L0 7 L-1.8 1.8 L-7 0 L-1.8 -1.8 Z';

/**
 * Çatlama anı SVG'si (metin): yumurta sallanır, çatlaklar belirir, üst kabuk uçar, yavru alt kabuktan çıkar.
 * Hareket CIZIM_CSS'te (.yv-cs-*; yalnız hareket isteyene). Son kare küçük yavru çizimiyle aynıdır.
 */
export function catlamaSvg({ renk = 1, ruh = 'mutlu' } = {}) {
  const k = Number.isInteger(renk) && renk >= 1 && renk <= 6 ? renk : 1;
  const r = RUHLAR.includes(ruh) ? ruh : 'mutlu';
  const catlaklar = CATLAKLAR.map(([d, g]) => `<path class="yv-cs-catlak" d="${d}" pathLength="1" style="--gecik:${g}s"/>`).join('');
  const kirintilar = KIRINTILAR.map(([d, x, y, don]) =>
    `<path class="yv-cs-kirinti" d="${d}" style="--dx:${x}px;--dy:${y}px;--don:${don}deg"/>`).join('');
  const yildizlar = YILDIZLAR.map(([x, y, g, s]) =>
    `<g transform="translate(${x} ${y}) scale(${s})"><path class="yv-cs-yildiz" d="${YILDIZ}" style="--gecik:${g}s"/></g>`).join('');
  return `<svg viewBox="0 0 200 200" class="yv-svg yv-cs-svg" data-asama="catlama" style="--yv-govde:var(--yv-r${k})" aria-hidden="true" focusable="false">`
    + KUCUK_ZEMIN
    + `<g class="yv-cs-yavru">${kucukGovde(r)}</g>`
    + '<g class="yv-cs-yumurta">'
    + `<g class="yv-cs-alt">${KUCUK_KABUK}</g>`
    + `<g class="yv-cs-ust"><path class="yv-kabuk" d="${UST_KABUK}"/>`
    + '<ellipse class="yv-benek" cx="83" cy="101" rx="9" ry="7"/><ellipse class="yv-benek" cx="121" cy="90" rx="5" ry="4"/>'
    + '<ellipse class="yv-benek" cx="116" cy="131" rx="9" ry="6.5"/>'
    + '<ellipse class="yv-isik" cx="79" cy="86" rx="7" ry="12" transform="rotate(24 79 86)"/>'
    + `${catlaklar}</g>`
    + '</g>'
    + kirintilar + yildizlar
    + '</svg>';
}

/** Yavru stili: renk jetonları, çizgi, boşta nefes ve göz kırpma. Hareket azaltmada hareket yok. */
export const CIZIM_CSS = `
:root {
  --yv-r1: #F4BFCD;
  --yv-r2: #D3C4F1;
  --yv-r3: #F9CBA7;
  --yv-r4: #B9E2C8;
  --yv-r5: #B8D6F3;
  --yv-r6: #F3DD95;
  --yv-yanak: #F2879F;
  --yv-damla: #8EC5F0;
  --yv-sicak: #B85F17;
  --yv-cs-sis: 46%;
  --yv-cs-isik: 95%;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-mod="acik"]) {
    --yv-sicak: #F0A35A;
    --yv-cs-sis: 20%;
    --yv-cs-isik: 30%;
  }
}
:root[data-mod="koyu"] {
  --yv-sicak: #F0A35A;
  --yv-cs-sis: 20%;
  --yv-cs-isik: 30%;
}
.yv-svg {
  display: block; width: 100%; height: 100%; overflow: visible;
  --yv-murekkep: var(--hero);
  --yv-kabuk: color-mix(in oklab, var(--hero-ink) 72%, var(--yv-govde));
  --yv-koyu: color-mix(in oklab, var(--yv-govde) 62%, var(--yv-murekkep));
  --yv-karin: color-mix(in oklab, var(--yv-govde) 42%, var(--hero-ink));
}
.yv-govde { fill: var(--yv-govde); stroke: var(--yv-murekkep); stroke-width: 3.2; stroke-linejoin: round; stroke-linecap: round; }
.yv-kabuk { fill: var(--yv-kabuk); stroke: var(--yv-murekkep); stroke-width: 3.2; stroke-linejoin: round; }
.yv-benek { fill: var(--yv-govde); opacity: 0.9; }
.yv-svg[data-asama="yumurta"] .yv-benek { fill: color-mix(in oklab, var(--yv-govde) 70%, var(--yv-murekkep)); opacity: 0.6; }
.yv-karin { fill: var(--yv-karin); }
.yv-isik { fill: var(--hero-ink); opacity: 0.6; }
.yv-zemin { fill: var(--yv-murekkep); opacity: 0.14; }
.yv-goz ellipse, .yv-agiz { fill: var(--yv-murekkep); }
.yv-parilti { fill: var(--hero-ink); }
.yv-cizgi { fill: none; stroke: var(--yv-murekkep); stroke-width: 2.8; stroke-linecap: round; stroke-linejoin: round; }
.yv-yanak { fill: var(--yv-yanak); opacity: 0.5; }
.yv-yanak.guclu { opacity: 0.8; }
.yv-dil { fill: var(--yv-yanak); }
.yv-damla { fill: var(--yv-damla); stroke: var(--yv-murekkep); stroke-width: 1.2; }
.yv-leke path { fill: var(--yv-murekkep); opacity: 0.16; }
.yv-kulak-ic { fill: var(--yv-yanak); opacity: 0.55; }
.yv-kuyruk { fill: none; stroke: var(--yv-govde); stroke-width: 9; stroke-linecap: round; }
.yv-kuyruk-dis { stroke: var(--yv-murekkep); stroke-width: 15.4; }
.yv-catlak { fill: none; stroke: var(--yv-murekkep); stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
.yv-dusunce circle { fill: var(--hero-ink); stroke: var(--yv-murekkep); stroke-width: 2; }
.yv-biberon { fill: var(--yv-govde); stroke: var(--yv-murekkep); stroke-width: 1.6; }
.yv-biberon-uc { fill: var(--yv-yanak); stroke: var(--yv-murekkep); stroke-width: 1.4; }
.yv-z, .yv-zzz text { fill: var(--yv-murekkep); font-family: var(--font-display); font-weight: 700; font-size: 17px; }
.yv-zzz .yv-z1 { font-size: 13px; }
.yv-zzz .yv-z3 { font-size: 21px; }
@media (prefers-reduced-motion: no-preference) {
  .yv-beden { transform-box: fill-box; transform-origin: 50% 100%; animation: yv-nefes 3.8s ease-in-out infinite; }
  .yv-svg[data-ruh="uyuyor"] .yv-beden { animation-duration: 6s; }
  .yv-svg[data-ruh="mutlu"] .yv-beden { animation: yv-hopla 3.2s var(--ease) infinite; }
  .yv-svg[data-asama="yumurta"] .yv-beden { animation: yv-salla 4.6s ease-in-out infinite; }
  .yv-goz { transform-box: fill-box; transform-origin: center; animation: yv-kirp 5.6s infinite; }
  .yv-zzz text { animation: yv-z 3.2s ease-in-out infinite both; }
  .yv-zzz .yv-z2 { animation-delay: 0.9s; }
  .yv-zzz .yv-z3 { animation-delay: 1.8s; }
}
@keyframes yv-nefes { 0%, 100% { transform: scale(1, 1); } 50% { transform: scale(1.025, 0.975); } }
@keyframes yv-hopla {
  0%, 64%, 100% { transform: translateY(0) scale(1, 1); }
  70% { transform: translateY(0) scale(1.05, 0.94); }
  80% { transform: translateY(-9px) scale(0.97, 1.04); }
  90% { transform: translateY(0) scale(1.03, 0.97); }
}
@keyframes yv-salla { 0%, 100% { transform: rotate(0deg); } 25% { transform: rotate(-2.2deg); } 75% { transform: rotate(2.2deg); } }
@keyframes yv-kirp { 0%, 93%, 100% { transform: scaleY(1); } 96% { transform: scaleY(0.12); } }
@keyframes yv-z { 0% { opacity: 0; transform: translate(0, 4px); } 30% { opacity: 1; } 100% { opacity: 0; transform: translate(6px, -12px); } }

/* Çatlama sahnesi: tam ekran kat (sayfa dokunuşları sahneyi bozmasın). Hareket azaltmada durağan iki kare (app.js). */
.yv-cs {
  position: fixed; inset: 0; z-index: 880;
  display: grid; place-content: center; justify-items: center; gap: 14px;
  padding: calc(24px + var(--safe-top)) 20px calc(24px + var(--safe-bottom));
  overflow: hidden;
  background:
    radial-gradient(72% 48% at 50% 44%, color-mix(in srgb, var(--yv-govde) var(--yv-cs-sis), var(--bg)) 0%, transparent 100%),
    var(--bg);
  touch-action: none; overscroll-behavior: contain;
  user-select: none; -webkit-user-select: none; -webkit-tap-highlight-color: transparent;
}
.yv-cs-sahne { position: relative; width: min(320px, 82vw); aspect-ratio: 1; }
/* Kabuğun içinden gelen sıcak krem ışık (iki temada da açık; yavru rengiyle bulanmaz) */
.yv-cs-hale {
  position: absolute; inset: -12%; border-radius: 50%; opacity: 0.5;
  background: radial-gradient(closest-side,
    color-mix(in srgb, color-mix(in srgb, var(--yv-r6) 38%, var(--hero-ink)) var(--yv-cs-isik), transparent), transparent);
}
.yv-cs-cizim { position: relative; display: block; width: 100%; height: 100%; }
.yv-cs-metin {
  max-width: 22ch; min-height: 2.6em; margin: 0;
  color: var(--text); font-family: var(--font-display); font-size: clamp(1.375rem, 1.2rem + 1vw, 1.75rem);
  font-weight: 600; font-variation-settings: 'SOFT' 100; letter-spacing: -0.01em; line-height: 1.3;
  text-align: center; text-wrap: balance;
}
.yv-cs-catlak { fill: none; stroke: var(--yv-murekkep); stroke-width: 2.6; stroke-linecap: round; stroke-linejoin: round; stroke-dasharray: 1; }
.yv-cs-kirinti { fill: var(--yv-kabuk); stroke: var(--yv-murekkep); stroke-width: 1.6; stroke-linejoin: round; opacity: 0; }
.yv-cs-yildiz { fill: var(--accent); opacity: 0; }
.yv-cs-yumurta, .yv-cs-ust, .yv-cs-yavru, .yv-cs-kirinti, .yv-cs-yildiz { transform-box: fill-box; }
.yv-cs-yumurta, .yv-cs-ust, .yv-cs-yavru { transform-origin: 50% 100%; }
.yv-cs-kirinti, .yv-cs-yildiz { transform-origin: center; }
@media (prefers-reduced-motion: no-preference) {
  .yv-cs { animation: yv-cs-gir 0.3s ease-out both; }
  .yv-cs.kapaniyor { animation: yv-cs-kapan 0.28s ease-in forwards; }
  .yv-cs-hale { animation: yv-cs-hale 2.7s ease-in-out both; }
  .yv-cs-yumurta { animation: yv-cs-salla 1.6s 0.15s ease-in-out both; }
  .yv-cs-catlak { animation: yv-cs-catlak 0.3s var(--gecik, 0s) ease-out both; }
  .yv-cs-ust { animation: yv-cs-ust 0.85s 1.75s both; }
  .yv-cs-yavru { animation: yv-cs-cik 0.78s 1.82s cubic-bezier(0.16, 1, 0.3, 1) both; }
  .yv-cs-kirinti { animation: yv-cs-kirinti 0.7s 1.76s cubic-bezier(0.16, 1, 0.3, 1) both; }
  .yv-cs-yildiz { animation: yv-cs-yildiz 0.9s calc(2.05s + var(--gecik, 0s)) ease-out both; }
  .yv-cs-metin[data-n="2"] { animation: yv-cs-metin 0.45s cubic-bezier(0.16, 1, 0.3, 1) both; }
}
@keyframes yv-cs-gir { from { opacity: 0; } }
@keyframes yv-cs-kapan { to { opacity: 0; } }
@keyframes yv-cs-metin { from { opacity: 0; transform: translateY(8px); } }
@keyframes yv-cs-hale {
  0% { opacity: 0; transform: scale(0.7); }
  50% { opacity: 0.5; transform: scale(0.95); }
  64% { opacity: 1; transform: scale(1.2); }
  100% { opacity: 0.55; transform: scale(1.05); }
}
@keyframes yv-cs-salla {
  0% { transform: rotate(0); }
  7% { transform: rotate(-3deg); }
  14% { transform: rotate(3deg); }
  21%, 32% { transform: rotate(0); }
  38% { transform: rotate(-5deg); }
  44% { transform: rotate(5deg); }
  50% { transform: rotate(-6.5deg); }
  56% { transform: rotate(6.5deg); }
  62%, 70% { transform: rotate(0); }
  84% { transform: scale(1.07, 0.92); }
  94% { transform: scale(0.98, 1.03); }
  100% { transform: none; }
}
@keyframes yv-cs-catlak { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
@keyframes yv-cs-ust {
  0% { opacity: 1; transform: none; animation-timing-function: cubic-bezier(0.2, 0.8, 0.3, 1); }
  38% { opacity: 1; transform: translate(-16px, -62px) rotate(-28deg); animation-timing-function: cubic-bezier(0.5, 0, 0.9, 0.4); }
  100% { opacity: 0; transform: translate(-78px, 40px) rotate(-118deg); }
}
@keyframes yv-cs-cik {
  0% { opacity: 0; transform: translateY(34px) scale(0.84, 0.9); }
  22% { opacity: 1; }
  58% { transform: translateY(-10px) scale(0.97, 1.05); }
  80% { transform: translateY(0) scale(1.04, 0.96); }
  100% { opacity: 1; transform: none; }
}
@keyframes yv-cs-kirinti {
  0% { opacity: 0; transform: none; }
  12% { opacity: 1; }
  100% { opacity: 0; transform: translate(var(--dx), var(--dy)) rotate(var(--don)); }
}
@keyframes yv-cs-yildiz {
  0% { opacity: 0; transform: scale(0.2); }
  35% { opacity: 1; transform: scale(1.15); }
  100% { opacity: 0; transform: scale(0.4) rotate(60deg); }
}
`;
