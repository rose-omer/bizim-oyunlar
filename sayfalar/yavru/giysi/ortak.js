// Yavrumuz giysi çizimi: ortak yollar ve yardımcılar (saf metin, DOM yok). Geometri bebek.js büyük aşama (viewBox 0 0 200 200).
// Sol parça çizilir; ayna() sağ tarafı x = 200 − x ile üretir.
export const y1 = (n) => Math.round(n * 10) / 10;

export const GOVDE_YOL = 'M100 107 C124 107 137 120 141 140 C145 159 137 175 100 177 C63 175 55 159 59 140 C63 120 76 107 100 107 Z';
export const PUF_KOL = ['M60 114 C51 118 47 130 51 137 C57 141 70 138 77 129 C79 120 71 110 60 114 Z',
  'M140 114 C149 118 153 130 149 137 C143 141 130 138 123 129 C121 120 129 110 140 114 Z'];
/** Sol uzun kol: omuzdan bileğe; el açıkta. */
export const UZUN_KOL = 'M60 113 C50 117 46 130 48 142 C49 149 53 153 59 153 C66 153 71 150 73 145 C76 136 78 122 72 115 C69 113 64 112 60 113 Z';
/** Sol uzun bacak: ten bacağını tam örter. Patikle birlikte ayak da kapanır. */
export const UZUN_BACAK = 'M63 146 C50 155 48 175 60 184 C71 191 88 189 93 180 C97 171 91 160 81 153 C75 148 68 144 63 146 Z';
/** Sol kısa paça: bodi ve şort; bacağın üst kısmı. */
export const KISA_BACAK = 'M63 147 C54 151 50 160 52 170 C60 173 76 170 86 158 C82 151 73 145 63 147 Z';
/** Patik: ayak yerel koordinatı (parmakları da örter). */
const PATIK = 'M0 -17 C10 -17 13 -7 12.5 2 C12 11 7 16 0 16 C-7 16 -12 11 -12.5 2 C-13 -7 -10 -17 0 -17 Z';
/** Kapüşonlu ya da başlıklı giysinin mağaza kartı kutusu. */
export const KAPUSON_KUTU = '26 -16 148 212';

/** Kumaş yolu. f: dolgu özniteliği (bebekte gradyan; kartta boş, sınıf boyar). ek: ' sınıf' (baştaki boşlukla). */
export const kumas = (f, d, ek = '') => `<path class="yvb-kumas${ek}"${f} d="${d}"/>`;
/** Kumaş dışı yol. */
export const yol = (sinif, d) => `<path class="${sinif}" d="${d}"/>`;
/** Yalnız sağ taraf (soldaki çizimin aynası). */
export const sag = (s) => `<g transform="matrix(-1 0 0 1 200 0)">${s}</g>`;
/** Sol + sağ. */
export const ayna = (s) => s + sag(s);
/** Noktalar. liste: [[x, y, r], ...] */
export const noktalar = (sinif, liste) => `<g class="${sinif}">${liste.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('')}</g>`;
/** Tek patik; sol ayak ic = -10, sağ ayak ic = 10 (bebek.js ayak dönüşü). */
export const patik = (f, x, a, ek = '') => `<g transform="translate(${x} 176) rotate(${a})">${kumas(f, PATIK, ek)}<path class="yvb-patik-kat" d="M-7 7 Q0 12.5 7 7"/></g>`;
/** İki patik. */
export const patikler = (f, ek = '') => patik(f, 86, -10, ek) + patik(f, 114, 10, ek);
/** Uzun kollu, uzun bacaklı, patikli taban. */
export const tulumTaban = (f) => ({
  govde: kumas(f, GOVDE_YOL),
  bacak: ayna(kumas(f, UZUN_BACAK)),
  ayak: patikler(f),
  kol: ayna(kumas(f, UZUN_KOL)),
});
/** Fermuar: koyu şerit + açık diş. */
export const fermuar = (d) => yol('yvb-fermuar', d) + yol('yvb-fermuar-dis', d);

export const ORTAK_CSS = `
.yvb-patik-kat { fill: none; stroke: var(--yvb-kumas-koyu); stroke-width: 1.2; stroke-linecap: round; opacity: 0.5; }
.yvb-fermuar { fill: none; stroke: var(--yvb-kumas-koyu); stroke-width: 2.8; stroke-linecap: round; }
.yvb-fermuar-dis { fill: none; stroke: var(--yvb-ak); stroke-width: 1.3; stroke-dasharray: 1.6 1.8; }
.yvb-dikis { fill: none; stroke: var(--yvb-kumas-koyu); stroke-width: 1; stroke-dasharray: 2.4 2; stroke-linecap: round; opacity: 0.7; }
`;
