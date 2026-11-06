// Yavrumuz giysi çizimi: aksesuarlar. Renkler sabit (:root jetonu); oda rengiyle değişmez.
// Önlük ve peluş büyük aşama koordinatında (yer: ''); diğerleri yerel koordinatta.
import { y1, yol, ayna, noktalar } from './ortak.js';

export const GIYSILER = {};

const KALP = 'M0 13 C-13 3 -17 -6 -11 -11 C-6 -15 -1 -11 0 -7 C1 -11 6 -15 11 -11 C17 -6 13 3 0 13 Z';
const YILDIZ = 'M0 -9 L2.6 -3 L9.5 -2.8 L4.2 1.6 L6 8 L0 4.4 L-6 8 L-4.2 1.6 L-9.5 -2.8 L-2.6 -3 Z';
const BULUT = 'M-7.5 4 C-11 4 -11 -1.5 -7 -1.5 C-7 -6 0 -7.5 2 -3 C5.5 -5 9 -2 7.5 1 C10 2 9 4 7 4 Z';

/** Konumlu şekil. */
const sekil = (sinif, d, x, y, s = 1) => `<path class="${sinif}" transform="translate(${x} ${y}) scale(${s})" d="${d}"/>`;

/** Yarım daire kenarlı kapalı yol (çiçek, ponpon): 0,0 merkezli, n tepeli. */
function tirtik(r, n) {
  const nokta = (i) => {
    const a = (2 * Math.PI * i) / n - Math.PI / 2;
    return `${y1(r * Math.cos(a))} ${y1(r * Math.sin(a))}`;
  };
  const yay = y1(r * Math.sin(Math.PI / n));
  let d = `M${nokta(0)}`;
  for (let i = 1; i <= n; i++) d += ` A${yay} ${yay} 0 0 1 ${nokta(i)}`;
  return `${d} Z`;
}

// Önlük: açık mavi benekli gövde, koyu mavi fisto, kalp, omuzda iki düğme. Baş üst kenarı örter.
const ONLUK_FISTO = [[63.9, 134.1, 4.4], [64.7, 141.1, 4.4], [66.7, 147.9, 4.4], [70.3, 154.1, 4.4],
  [75.8, 158.5, 4.4], [82.5, 160.8, 4.4], [89.5, 162.1, 4.4], [96.6, 162.7, 4.4]];
const ONLUK_BENEK = [[92.5, 121, 1.2], [82.5, 121, 1.2], [97.5, 128.5, 1.2], [87.5, 128.5, 1.2], [77.5, 128.5, 1.2], [67.5, 128.5, 1.2],
  [82.5, 136, 1.2], [72.5, 136, 1.2], [87.5, 143.5, 1.2], [77.5, 143.5, 1.2], [92.5, 151, 1.2], [82.5, 151, 1.2], [72.5, 151, 1.2],
  [97.5, 158.5, 1.2], [87.5, 158.5, 1.2]];
const ONLUK = ayna(noktalar('yvb-ak-fisto', ONLUK_FISTO))
  + yol('yvb-ak-onluk', 'M74 110 C80 120 120 120 126 110 L132 114 C138 126 138 146 128 156 C118 165 82 165 72 156 C62 146 62 126 68 114 Z')
  + sekil('yvb-ak-kalp', KALP, 100, 138, 1.15)
  + ayna(noktalar('yvb-ak-benek', ONLUK_BENEK))
  + sekil('yvb-ak-kalp-ic', KALP, 100, 137.5, 0.42)
  + ayna('<circle class="yvb-ak-dugme" cx="73.5" cy="120" r="3.9"/>' + noktalar('yvb-ak-dugme-delik', [[72.2, 120, 0.8], [74.8, 120, 0.8]]));

// Balıkçı şapka: kenar, tepe, iki dikiş; kendi desenimiz bulut ve yıldız.
const KOVASAPKA = yol('yvb-ak-kova', 'M-58 8 C-52 -8 -38 -14 -34 -14 L34 -14 C38 -14 52 -8 58 8 C34 18 -34 18 -58 8 Z')
  + yol('yvb-ak-kova', 'M-36 -12 C-34 -36 -24 -44 0 -44 C24 -44 34 -36 36 -12 C18 -6 -18 -6 -36 -12 Z')
  + yol('yvb-ak-kova-kat', 'M-31.6 -30 C-16 -25 16 -25 31.6 -30 M-51 5 C-28 12.5 28 12.5 51 5')
  + sekil('yvb-ak-bulut', BULUT, 13, -35, 0.6) + sekil('yvb-ak-yildiz', YILDIZ, -12, -35, 0.55)
  + sekil('yvb-ak-bulut', BULUT, -19, -16, 0.9) + sekil('yvb-ak-yildiz', YILDIZ, 2, -17, 0.65) + sekil('yvb-ak-bulut', BULUT, 21, -16, 0.75)
  + sekil('yvb-ak-bulut', BULUT, -39, 1, 0.8) + sekil('yvb-ak-yildiz', YILDIZ, -17, 3, 0.6) + sekil('yvb-ak-bulut', BULUT, 7, 3, 0.9)
  + sekil('yvb-ak-yildiz', YILDIZ, 28, 3, 0.6) + sekil('yvb-ak-bulut', BULUT, 43, 1, 0.65);

// Ponponlu bere: kırmızı örgü tepe, krem fitilli kıvrık bant, krem ponpon.
const BERE = '<path class="yvb-g-kurdele" d="M-54 -9 C-52 -32 -28 -42 0 -42 C28 -42 52 -32 54 -9 C30 -16 -30 -16 -54 -9 Z"/>'
  + yol('yvb-ak-bere-orgu', 'M0 -41 L0 -12 M-11 -40.5 C-14 -32 -15 -22 -15 -12 M11 -40.5 C14 -32 15 -22 15 -12 M-22 -38.5 C-27 -30 -30 -21 -30 -11 M22 -38.5 C27 -30 30 -21 30 -11 M-33 -35 C-40 -28 -44 -19 -44 -9 M33 -35 C40 -28 44 -19 44 -9')
  + yol('yvb-ak-bant', 'M-57 -9 C-30 -17 30 -17 57 -9 C61 -7 62 5 58 7 C30 14 -30 14 -58 7 C-62 5 -61 -7 -57 -9 Z')
  + yol('yvb-ak-fitil', 'M-49 -9.5 L-50 7 M-38 -11 L-38.5 9 M-27 -12.5 L-27.5 10.5 M-16 -13 L-16 11.5 M-5 -13.5 L-5 12 M5 -13.5 L5 12 M16 -13 L16 11.5 M27 -12.5 L27.5 10.5 M38 -11 L38.5 9 M49 -9.5 L50 7')
  + sekil('yvb-ak-bant', tirtik(10.5, 10), 0, -45)
  + yol('yvb-ak-fitil', 'M-5 -50 L-2.5 -46.5 M3.5 -51 L2.5 -47 M7 -44 L3 -43.5 M-7 -41 L-3 -42.5 M0.5 -38 L0.5 -41.5');

// Çiçek tacı: yeşil sap yayı, yapraklar, pembe-sarı-mavi yedi çiçek.
const CICEK_YAPRAK = 'M0 0 C2.5 -3.5 6.5 -3.5 9 0 C6.5 3.5 2.5 3.5 0 0 Z';
const CICEK_TAC = tirtik(6, 5);
const yaprak = (x, y, a) => `<path class="yvb-ak-yaprak" transform="translate(${x} ${y}) rotate(${a})" d="${CICEK_YAPRAK}"/>`;
const cicek = (x, y, renk, a) => `<g transform="translate(${x} ${y}) rotate(${a})"><path class="yvb-ak-cicek-${renk}" d="${CICEK_TAC}"/><circle class="yvb-ak-cicek-orta" r="2.7"/></g>`;
const CICEKTAC = yol('yvb-ak-sap', 'M-52 30 C-44 -4 44 -4 52 30')
  + [[-43.9, 17.3, -41], [-27.3, 8.5, -18], [-9.1, 4.9, -5], [9.1, 4.9, 5], [27.3, 8.5, 18], [43.9, 17.3, 41]]
    .map(([x, y, a]) => yaprak(x, y, a - 90) + yaprak(x, y, a + 90)).join('')
  + cicek(-49.8, 24.3, 'p', -61) + cicek(-36.2, 12.2, 's', -27) + cicek(-18.5, 6.2, 'm', -11) + cicek(0, 4.5, 'p', 0)
  + cicek(18.5, 6.2, 'm', 11) + cicek(36.2, 12.2, 's', 27) + cicek(49.8, 24.3, 'p', 61);

// Kalp gözlük (yüz koordinatı): pembe kalp çerçeve, yarı saydam cam; gözler görünür. Kalp gözü örtsün diye 1.2 büyük.
const KALPGOZLUK = yol('yvb-ak-gozluk-sap', 'M-37 -5 L-51 2 M37 -5 L51 2 M-5 -5 Q0 -9 5 -5')
  + sekil('yvb-ak-gozluk-cam', KALP, -21, 1, 1.2) + sekil('yvb-ak-gozluk-cam', KALP, 21, 1, 1.2)
  + yol('yvb-g-cam-isik', 'M-33 -5.5 Q-33 -9.5 -29.5 -10.5 M9 -5.5 Q9 -9.5 12.5 -10.5');

// Papyon (0,0 düğüm): benekli kırmızı kanatlar, kısa kıvrımlar.
const PAPYON = '<path class="yvb-g-kurdele" d="M-3 -3 C-9 -6 -16 -11.5 -20.5 -10.5 C-24 -9.5 -24 9.5 -20.5 10.5 C-16 11.5 -9 6 -3 3 Z M3 -3 C9 -6 16 -11.5 20.5 -10.5 C24 -9.5 24 9.5 20.5 10.5 C16 11.5 9 6 3 3 Z"/>'
  + '<path class="yvb-g-kat" d="M-5 -1.2 L-9 -2 M-5 1.2 L-9 2 M5 -1.2 L9 -2 M5 1.2 L9 2"/>'
  + noktalar('yvb-g-benek', [[-17.5, -5, 1.7], [-12, -2.6, 1.5], [-18, 4.6, 1.7], [-11.5, 3.4, 1.5], [17.5, -5, 1.7], [12, -2.6, 1.5], [18, 4.6, 1.7], [11.5, 3.4, 1.5]])
  + '<rect class="yvb-g-kurdele yvb-g-dugum" x="-3.8" y="-5.4" width="7.6" height="10.8" rx="3.4"/>';

// Yıldızlı emzik: altın yıldız kalkan, düğme, halka. Yıldız ucu burna değmez. .yvb-emzik konuşurken gizlenir.
const YILDIZEMZIK = '<g class="yvb-emzik"><circle class="yvb-ak-emzik-halka" cx="0" cy="12.6" r="5"/>'
  + sekil('yvb-g-altin', YILDIZ, 0, 1.8, 1.15)
  + '<circle class="yvb-ak-emzik-dugme" cx="0" cy="1.9" r="3"/></g>';

// Peluş ayıcık (büyük aşama): sol elin altında oturur; bir kolu ele uzanır. Bebek kolu sağ yanını örter, yüz görünür kalır.
const PELUS = '<circle class="yvb-ayi-yuz" cx="31" cy="137.5" r="5.6"/><circle class="yvb-ayi-ic" cx="31" cy="137.5" r="2.7"/>'
  + '<circle class="yvb-ayi-yuz" cx="52" cy="137.5" r="5.6"/><circle class="yvb-ayi-ic" cx="52" cy="137.5" r="2.7"/>'
  + '<ellipse class="yvb-ayi-yuz" cx="44" cy="172" rx="15" ry="15.5"/>'
  + '<ellipse class="yvb-ayi-ic" cx="44" cy="174" rx="9" ry="10"/>'
  + '<path class="yvb-ayi-yuz" d="M33 163 C27 165 23 172 26 177 C28 181 33 179 35 175 C36 171 36 166 33 163 Z"/>'
  + '<path class="yvb-ayi-yuz" d="M53 163 C58 159 64 157 67 160 C69 163 66 167 62 168 C58 170 54 170 52 168 C51 166 51 165 53 163 Z"/>'
  + '<ellipse class="yvb-ayi-yuz" cx="33" cy="185.5" rx="8.6" ry="6.8" transform="rotate(-18 33 185.5)"/><ellipse class="yvb-ayi-ic" cx="32.6" cy="185.8" rx="4.6" ry="3.7" transform="rotate(-18 32.6 185.8)"/>'
  + '<ellipse class="yvb-ayi-yuz" cx="55" cy="186" rx="8.6" ry="6.8" transform="rotate(14 55 186)"/><ellipse class="yvb-ayi-ic" cx="55.4" cy="186.3" rx="4.6" ry="3.7" transform="rotate(14 55.4 186.3)"/>'
  + '<ellipse class="yvb-ayi-yuz" cx="41.5" cy="150" rx="14" ry="13"/>'
  + '<ellipse class="yvb-ayi-ic" cx="40.3" cy="154.6" rx="6.4" ry="5"/>'
  + '<ellipse class="yvb-ayi-goz" cx="40.3" cy="152.4" rx="2.5" ry="1.8"/>'
  + '<path class="yvb-ayi-agiz" d="M40.3 154 L40.3 155.8 M37.8 156.4 Q40.3 158.4 42.8 156.4"/>'
  + '<circle class="yvb-ayi-goz" cx="35.5" cy="148.2" r="1.9"/><circle class="yvb-ayi-goz" cx="45" cy="148.2" r="1.9"/>'
  + noktalar('yvb-g-benek', [[36.1, 147.5, 0.7], [45.6, 147.5, 0.7]])
  + '<ellipse class="yvb-ayi-allik" cx="31.6" cy="153.6" rx="2.6" ry="1.7"/><ellipse class="yvb-ayi-allik" cx="48.2" cy="153.6" rx="2.2" ry="1.7"/>'
  + '<g transform="translate(43 164.5)"><path class="yvb-g-kurdele" d="M-1 -1 C-4 -5 -9 -5 -9 0 C-9 5 -4 4 -1 1 Z M1 -1 C4 -5 9 -5 9 0 C9 5 4 4 1 1 Z"/>'
  + '<ellipse class="yvb-g-kurdele yvb-g-dugum" cx="0" cy="0" rx="2.3" ry="2.7"/></g>';

export const AKSESUAR = {
  onluk: { yuva: 'boyun', cizim: ONLUK, yer: '', kutu: '56 102 88 74' },
  kovasapka: { yuva: 'bas', cizim: KOVASAPKA, yer: 'translate(100 36) scale(0.92)', kucuk: 'translate(100 54) scale(0.6)', kutu: '-62 -50 124 72' },
  bere: { yuva: 'bas', cizim: BERE, yer: 'translate(100 38) scale(0.86)', kucuk: 'translate(100 54) scale(0.6)', kutu: '-64 -60 128 78' },
  cicektac: { yuva: 'bas', cizim: CICEKTAC, yer: 'translate(100 26)', kucuk: 'translate(100 52) scale(0.62)', kutu: '-60 -8 120 44' },
  kalpgozluk: { yuva: 'goz', cizim: KALPGOZLUK, yer: 'translate(100 75)', kutu: '-54 -20 108 40' },
  papyon: { yuva: 'boyun', cizim: PAPYON, yer: 'translate(100 124)', kutu: '-24 -14 48 28' },
  yildizemzik: { yuva: 'agiz', cizim: YILDIZEMZIK, yer: 'translate(100 102)', kutu: '-18 -12 36 32' },
  pelus: { yuva: 'kucak', cizim: PELUS, yer: '', kutu: '20 130 52 66' },
};

export const CSS = `
:root {
  --yvb-ak-mavi: #BAD6F1;
  --yvb-ak-mavi-koyu: #5A8AC6;
  --yvb-ak-buz: #E8F2F9;
  --yvb-ak-krem: #F7EBD3;
  --yvb-ak-yesil: #6FA85B;
}
.yvb-svg { --yvb-ak-kontur: color-mix(in oklab, var(--yvb-ak-mavi-koyu) 50%, var(--yvb-murekkep)); }
.yvb-ak-onluk { fill: var(--yvb-ak-mavi); stroke: var(--yvb-ak-kontur); stroke-width: 1.5; stroke-linejoin: round; }
.yvb-ak-fisto { fill: var(--yvb-ak-mavi-koyu); stroke: var(--yvb-ak-kontur); stroke-width: 1.2; }
.yvb-ak-kalp { fill: var(--yvb-ak-mavi-koyu); stroke: var(--yvb-ak-kontur); stroke-width: 1.2; stroke-linejoin: round; }
.yvb-ak-kalp-ic { fill: var(--yvb-ak-mavi); stroke: var(--yvb-ak-kontur); stroke-width: 2.4; stroke-linejoin: round; }
.yvb-ak-benek { fill: var(--yvb-ak); }
.yvb-ak-dugme { fill: var(--yvb-ak-mavi-koyu); stroke: var(--yvb-ak-kontur); stroke-width: 1.2; }
.yvb-ak-dugme-delik { fill: var(--yvb-ak); }
.yvb-ak-kova { fill: var(--yvb-ak-buz); stroke: var(--yvb-ak-kontur); stroke-width: 1.9; stroke-linejoin: round; }
.yvb-ak-kova-kat { fill: none; stroke: var(--yvb-ak-kontur); stroke-width: 1.3; stroke-linecap: round; opacity: 0.6; }
.yvb-ak-bulut { fill: var(--yvb-ak-mavi); }
.yvb-ak-yildiz { fill: color-mix(in oklab, var(--yvb-ak-mavi) 65%, var(--yvb-ak-mavi-koyu)); }
.yvb-ak-bere-orgu { fill: none; stroke: color-mix(in oklab, var(--yvb-kurdele) 60%, var(--yvb-murekkep)); stroke-width: 1.4; stroke-linecap: round; opacity: 0.6; }
.yvb-ak-bant { fill: var(--yvb-ak-krem); stroke: color-mix(in oklab, var(--yvb-ak-krem) 45%, var(--yvb-murekkep)); stroke-width: 1.5; stroke-linejoin: round; }
.yvb-ak-fitil { fill: none; stroke: color-mix(in oklab, var(--yvb-ak-krem) 55%, var(--yvb-murekkep)); stroke-width: 1.3; stroke-linecap: round; opacity: 0.7; }
.yvb-ak-sap { fill: none; stroke: var(--yvb-ak-yesil); stroke-width: 3; stroke-linecap: round; }
.yvb-ak-yaprak { fill: var(--yvb-ak-yesil); stroke: color-mix(in oklab, var(--yvb-ak-yesil) 60%, var(--yvb-murekkep)); stroke-width: 0.9; stroke-linejoin: round; }
.yvb-ak-cicek-p { fill: color-mix(in oklab, var(--yvb-pembe) 72%, var(--yvb-ak)); stroke: color-mix(in oklab, var(--yvb-pembe) 60%, var(--yvb-murekkep)); stroke-width: 1; stroke-linejoin: round; }
.yvb-ak-cicek-s { fill: var(--yvb-altin); stroke: color-mix(in oklab, var(--yvb-altin-koyu) 70%, var(--yvb-murekkep)); stroke-width: 1; stroke-linejoin: round; }
.yvb-ak-cicek-m { fill: color-mix(in oklab, var(--yvb-ak-mavi) 45%, var(--yvb-ak-mavi-koyu)); stroke: var(--yvb-ak-kontur); stroke-width: 1; stroke-linejoin: round; }
.yvb-ak-cicek-orta { fill: var(--yvb-ak); stroke: var(--yvb-altin-koyu); stroke-width: 1; }
.yvb-ak-gozluk-cam { fill: var(--yvb-pembe); fill-opacity: 0.3; stroke: color-mix(in oklab, var(--yvb-pembe) 82%, var(--yvb-murekkep)); stroke-width: 3; stroke-linejoin: round; }
.yvb-ak-gozluk-sap { fill: none; stroke: color-mix(in oklab, var(--yvb-pembe) 82%, var(--yvb-murekkep)); stroke-width: 2.6; stroke-linecap: round; }
.yvb-ak-emzik-halka { fill: none; stroke: var(--yvb-altin-koyu); stroke-width: 2.2; }
.yvb-ak-emzik-dugme { fill: var(--yvb-inci); stroke: var(--yvb-altin-koyu); stroke-width: 1.1; }
`;
