// Yavrumuz: kodla üretilen SVG (dış görsel yok). Saf metin üretir; DOM yok (Node'da test edilir).
// Yumurta burada; küçük ve büyük aşama bebek.js'te (yavruSvg onu çağırır). Sayfa (app.js) ve ana sayfa kartı (kart.js)
// paylaşır. Stil CIZIM_CSS + BEBEK_CSS'te: sayfa ve kart ikisini bir <style> ile ekler.
// Renkler değişkenden: gövde --yv-r1..6 (oda kimliğinden tohumlu), çizgi var(--hero) (iki temada da koyu),
// parıltı var(--hero-ink) (iki temada da açık). Böylece pastel yavru açık ve koyu zeminde aynı kalır.
// Kabuk yumurtada, çatlama sahnesinde ve küçük bebekte aynı: krem dolgu (--yvb-kabuk), ince ten konturu, renkli benek.
import { bebekSvg, bebekCatlamaParcalari } from './bebek.js';

export const ASAMALAR = ['yumurta', 'kucuk', 'buyuk'];
export const RUHLAR = ['normal', 'mutlu', 'ac', 'kirli', 'uykulu', 'uzgun', 'uyuyor'];

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const renkGecerli = (renk) => (Number.isInteger(renk) && renk >= 1 && renk <= 6 ? renk : 1);

// ---------- Yumurta (viewBox 0 0 200 200, zemin y≈180) ----------

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

/**
 * Yavru SVG'si (metin). asama: 'yumurta'|'kucuk'|'buyuk'; ruh: bebek.js BEBEK_RUHLARI; renk: 1–6; hazir: yumurtada
 * çatlak; kisilik: büyükte göğüs motifi; kimlik: gradyan id öneki (bebek.js; verilmezse benzersiz); giyim: bebek.js aksesuar katmanı;
 * kucukBoy: ≈64–96 px gösterim (ana sayfa kartı) için sade el (bebek.js).
 * etiket verilirse role="img" + aria-label; yoksa ekran okuyucudan gizli. Bilinmeyen değer varsayılana düşer.
 */
export function yavruSvg({ asama = 'kucuk', ruh = 'normal', renk = 1, hazir = false, etiket = '', kisilik = '', kimlik = '', giyim = null, kucukBoy = false } = {}) {
  const a = ASAMALAR.includes(asama) ? asama : 'kucuk';
  if (a !== 'yumurta') return bebekSvg({ asama: a, ruh, renk, kisilik, etiket, kimlik, giyim, kucukBoy });
  const erisim = etiket ? `role="img" aria-label="${esc(etiket)}"` : 'aria-hidden="true"';
  return `<svg viewBox="0 0 200 200" class="yv-svg" data-asama="yumurta" data-ruh="yumurta" style="--yv-govde:var(--yv-r${renkGecerli(renk)})" ${erisim} focusable="false">${yumurta(!!hazir)}</svg>`;
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
 * Hareket CIZIM_CSS'te (.yv-cs-*; yalnız hareket isteyene). Son kare küçük bebek çizimiyle aynıdır (kimlik aynıysa).
 */
export function catlamaSvg({ renk = 1, ruh = 'mutlu', kimlik = '' } = {}) {
  const b = bebekCatlamaParcalari({ renk, ruh: RUHLAR.includes(ruh) ? ruh : 'mutlu', kimlik });
  const catlaklar = CATLAKLAR.map(([d, g]) => `<path class="yv-cs-catlak" d="${d}" pathLength="1" style="--gecik:${g}s"/>`).join('');
  const kirintilar = KIRINTILAR.map(([d, x, y, don]) =>
    `<path class="yv-cs-kirinti" d="${d}" style="--dx:${x}px;--dy:${y}px;--don:${don}deg"/>`).join('');
  const yildizlar = YILDIZLAR.map(([x, y, g, s]) =>
    `<g transform="translate(${x} ${y}) scale(${s})"><path class="yv-cs-yildiz" d="${YILDIZ}" style="--gecik:${g}s"/></g>`).join('');
  // Kabuk bebek.js stilinde (yvb-kabuk-*): üst ve alt yarı tek yumurta görünür.
  return `<svg viewBox="0 0 200 200" class="yv-svg yvb-svg yv-cs-svg" data-asama="catlama" style="--yv-govde:var(--yv-r${b.renk})" aria-hidden="true" focusable="false">`
    + b.tanim + b.zemin
    + `<g class="yv-cs-yavru">${b.yavru}</g>`
    + '<g class="yv-cs-yumurta">'
    + `<g class="yv-cs-alt">${b.kabuk}</g>`
    + `<g class="yv-cs-ust"><path class="yvb-kabuk-dis" d="${UST_KABUK}"/>`
    + '<ellipse class="yvb-kabuk-benek" cx="83" cy="101" rx="9" ry="7"/><ellipse class="yvb-kabuk-benek" cx="121" cy="90" rx="5" ry="4"/>'
    + '<ellipse class="yvb-kabuk-benek" cx="116" cy="131" rx="9" ry="6.5"/>'
    + '<ellipse class="yv-isik" cx="79" cy="86" rx="7" ry="12" transform="rotate(24 79 86)"/>'
    + `${catlaklar}</g>`
    + '</g>'
    + kirintilar + yildizlar
    + '</svg>';
}

/** Yumurta ve çatlama sahnesi stili, yavru renk jetonları; boşta nefes ve sallanma. Hareket azaltmada hareket yok. */
export const CIZIM_CSS = `
:root {
  --yv-r1: #F4BFCD;
  --yv-r2: #D3C4F1;
  --yv-r3: #F9CBA7;
  --yv-r4: #B9E2C8;
  --yv-r5: #B8D6F3;
  --yv-r6: #F3DD95;
  --yv-damla: #8EC5F0;
  --yv-sicak: #A34F0F;
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
  /* Kabuk konturu = bebek.js --yvb-kontur (ten çizgisi + mürekkep) */
  --yv-kabuk-cizgi: color-mix(in oklab, var(--yvb-ten-cizgi) 78%, var(--hero));
}
.yv-kabuk { fill: var(--yvb-kabuk); stroke: var(--yv-kabuk-cizgi); stroke-width: 1.8; stroke-linejoin: round; }
.yv-benek { fill: var(--yv-govde); opacity: 0.9; }
.yv-isik { fill: var(--hero-ink); opacity: 0.6; }
.yv-zemin { fill: var(--yv-murekkep); opacity: 0.14; }
.yv-catlak { fill: none; stroke: var(--yv-kabuk-cizgi); stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
@media (prefers-reduced-motion: no-preference) {
  .yv-beden { transform-box: fill-box; transform-origin: 50% 100%; animation: yv-salla 4.6s ease-in-out infinite; }
}
@keyframes yv-salla { 0%, 100% { transform: rotate(0deg); } 25% { transform: rotate(-2.2deg); } 75% { transform: rotate(2.2deg); } }

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
.yv-cs-catlak { fill: none; stroke: var(--yv-kabuk-cizgi); stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; stroke-dasharray: 1; }
.yv-cs-kirinti { fill: var(--yvb-kabuk); stroke: var(--yvb-kontur); stroke-width: 1.6; stroke-linejoin: round; opacity: 0; }
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
