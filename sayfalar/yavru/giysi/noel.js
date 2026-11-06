// Yavrumuz giysi çizimi: Noel elbisesi (fitilli kırmızı üst, pembe Noel Baba baskılı etek) ve Noel fiyonklu bant.
import { GOVDE_YOL, UZUN_KOL, kumas, yol, sag, ayna, noktalar, y1 } from './ortak.js';

// Noel Baba yüzü: yerel 0,0 yüzün ortası; ölçek 1'de yaklaşık 23 birim.
const BABA = yol('yvb-no-sakal', 'M-9 -2 Q-11.5 3 -8 6 Q-6.5 10 -2.6 9.2 Q0 11.5 2.6 9.2 Q6.5 10 8 6 Q11.5 3 9 -2 Z')
  + '<ellipse class="yvb-no-yuz" cx="0" cy="-0.8" rx="6.8" ry="4.8"/>'
  + yol('yvb-no-sapka', 'M-7.8 -5.4 C-7.4 -10.5 -2 -13 3 -12 C6.8 -11.2 9.6 -8.6 10.4 -5 C9 -6 8 -6.2 7.8 -5.4 Q0 -7.4 -7.8 -5.4 Z')
  + yol('yvb-no-sakal', 'M-9 -5.4 Q0 -8.4 9 -5.4 Q9.8 -3.6 9 -2.4 Q0 -5.4 -9 -2.4 Q-9.8 -3.6 -9 -5.4 Z')
  + '<circle class="yvb-no-sakal" cx="10.8" cy="-3.8" r="2.4"/>'
  + '<circle class="yvb-no-goz" cx="-2.9" cy="-0.9" r="1.35"/><circle class="yvb-no-goz" cx="2.9" cy="-0.9" r="1.35"/>'
  + yol('yvb-no-biyik', 'M0 2.2 C-1.5 0.9 -5 1 -6.2 3 C-4 4.6 -1.4 4.4 0 3.2 C1.4 4.4 4 4.6 6.2 3 C5 1 1.5 0.9 0 2.2 Z')
  + '<circle class="yvb-no-burun" cx="0" cy="1.5" r="1.3"/>';
const noelBaba = (x, y, s, a) => `<g transform="translate(${x} ${y}) rotate(${a}) scale(${s})">${BABA}</g>`;

/** Kar taneleri. liste: [[x, y, r], ...] */
const kar = (liste) => yol('yvb-no-kar', liste.map(([x, y, r]) => {
  const dx = y1(r * 0.5);
  const dy = y1(r * 0.87);
  return `M${y1(x - r)} ${y} L${y1(x + r)} ${y} M${y1(x - dx)} ${y1(y - dy)} L${y1(x + dx)} ${y1(y + dy)} M${y1(x - dx)} ${y1(y + dy)} L${y1(x + dx)} ${y1(y - dy)}`;
}).join(' '));

// Fitil: üst sınır gövde kavsini izler (clip yok).
const fitilCizgi = (x) => `M${x} ${y1(108 + 32 * (Math.abs(x - 100) / 41) ** 2.2)} L${x} 146`;
const FITIL = Array.from({ length: 15 }, (_, i) => fitilCizgi(65 + i * 5)).join(' ');
const KOL_FITIL = 'M54 120 C50 130 50 141 53 149 M59 117 C55.5 130 56 142 58 151 M65 115 C61.5 128 62 141 64 150 M71 117 C69 128 68.5 140 69.5 148';
const YAKA = 'M76 113 Q100 136 124 113 L119.5 112 Q100 129 80.5 112 Z';

// Askı: omuzdan bele; iç kenar düz, dış kenar fırfırlı. Noel Baba baskılı.
const ASKI = yol('yvb-no-etek', 'M79 111 C79.5 122 78 133 75.5 143 Q70 147 68.5 139.5 Q61.5 139 63.5 131 Q56.5 129 60.5 122 Q54 118.5 61 113.5 Q70 108 79 111 Z')
  + yol('yvb-no-pli', 'M78 133 L63.5 131 M76.5 139 L68.5 139.5')
  + noelBaba(69.5, 122, 0.66, -6)
  + kar([[71, 134.5, 2.4]]);

// Etek: pliler arkada, yüzler önde (okunurluk). Sol ayağın altındaki yüz ve el ile ayak altındaki kar taneleri yalnız kartta görünür.
const ETEK = yol('yvb-no-etek', 'M64 142 Q100 152 136 142 C146 158 158 172 166 186 Q150 192 134 188 Q118 194 100 189 Q82 194 66 188 Q50 192 34 186 C42 172 54 158 64 142 Z')
  + ayna(yol('yvb-no-pli', 'M72 147 Q60 168 50 188 M81 149 Q73 168 66 187 M90 150 Q87 170 83 190'))
  + yol('yvb-no-pli', 'M100 151 L100 188')
  + ayna(kar([[54, 165, 2.6], [58, 185.5, 2.3], [88, 158.5, 2.5], [68, 161, 3]]))
  + kar([[111, 172, 3], [118, 183, 2.4]])
  + noelBaba(49, 178, 0.82, -12)
  + noelBaba(66.5, 180, 0.72, 9)
  + sag(noelBaba(48.5, 177.5, 0.84, -8) + noelBaba(66.5, 180.5, 0.7, 12))
  + noelBaba(100, 161.5, 0.76, -5)
  + noelBaba(87, 177.5, 0.66, 6);

// Belde büyük fiyonk: yerel 0,0 düğüm.
const BEL_FIYONK = '<g transform="translate(100 145)">'
  + yol('yvb-no-fiyonk', 'M-4 -4 C-11 -9 -18 -12 -23 -11 C-26 -6 -26 6 -21 13 C-15 12 -9 8 -4 4 Z M4 -4 C11 -9 18 -12 23 -11 C26 -6 26 6 21 13 C15 12 9 8 4 4 Z')
  + yol('yvb-no-fiyonk-kat', 'M-6 -2 L-20 -7 M-6 0 L-22 0.5 M-6 2 L-19 8 M6 -2 L20 -7 M6 0 L22 0.5 M6 2 L19 8')
  + yol('yvb-no-fiyonk yvb-no-dugum', 'M-5 -5.5 Q0 -7 5 -5.5 Q6.5 0 5 5.5 Q0 7 -5 5.5 Q-6.5 0 -5 -5.5 Z')
  + '</g>';

export const GIYSILER = {
  noelelbise: {
    renk: 'noel',
    ciz: (k, f) => ({
      govde: kumas(f, GOVDE_YOL) + yol('yvb-no-fitil', FITIL) + kumas(f, YAKA),
      bacak: ETEK + BEL_FIYONK,
      kol: ayna(kumas(f, UZUN_KOL) + yol('yvb-no-fitil', KOL_FITIL) + yol('yvb-kumas-kat', 'M49.5 145 C55 149.5 64 150 72.5 144') + ASKI),
    }),
  },
};

// Saç bandı: krem yay + büyük pembe fiyonk; kırmızı ve beyaz benekli. Yerel 0,0 fiyonk merkezi.
const BANT_YAY = 'M-50 32 C-42 -2 42 -2 50 32';
const BANT = yol('yvb-no-bant-kenar', BANT_YAY) + yol('yvb-no-bant', BANT_YAY)
  + yol('yvb-no-sac-fiyonk', 'M-4 -4 C-11 -15 -31 -20 -33 -8 C-34 2 -32 12 -28 15 C-20 18 -10 10 -4 4 Z M4 -4 C11 -15 31 -20 33 -8 C34 2 32 12 28 15 C20 18 10 10 4 4 Z')
  + yol('yvb-no-sac-fiyonk-kat', 'M-8 -2 Q-18 -8 -27 -9 M-8 1 L-28 2.5 M-8 4 Q-16 8 -25 11 M8 -2 Q18 -8 27 -9 M8 1 L28 2.5 M8 4 Q16 8 25 11')
  + noktalar('yvb-no-benek-k', [[-24, -5, 2.1], [-14, 5, 2], [-27, 7, 1.8], [24, -5, 2.1], [14, 5, 2], [27, 7, 1.8]])
  + noktalar('yvb-no-benek-b', [[-17, -6.5, 2], [-20, 3, 1.9], [-20, 10, 1.7], [17, -6.5, 2], [20, 3, 1.9], [20, 10, 1.7]])
  + yol('yvb-no-sac-fiyonk yvb-no-sac-dugum', 'M-6 -6.5 Q0 -8.5 6 -6.5 Q8 0 6 6.5 Q0 8.5 -6 6.5 Q-8 0 -6 -6.5 Z');

export const AKSESUAR = {
  noelbant: { yuva: 'bas', cizim: BANT, yer: 'translate(100 24)', kucuk: 'translate(100 52) scale(0.62)', kutu: '-56 -24 112 62' },
};

export const CSS = `
:root {
  --yvb-k-noel: #B92A3E;
  --yvb-no-pembe: #F7B9C0;
  --yvb-no-krem: #F6E7CF;
}
.yvb-no-fitil { fill: none; stroke: var(--yvb-kumas-koyu); stroke-width: 0.9; stroke-linecap: round; opacity: 0.6; }
.yvb-no-etek { fill: var(--yvb-no-pembe); stroke: color-mix(in oklab, var(--yvb-no-pembe) 60%, var(--yvb-murekkep)); stroke-width: 1.5; stroke-linejoin: round; }
.yvb-no-pli { fill: none; stroke: color-mix(in oklab, var(--yvb-no-pembe) 45%, var(--yvb-murekkep)); stroke-width: 1; stroke-linecap: round; opacity: 0.75; }
.yvb-no-kar { fill: none; stroke: var(--yvb-ak); stroke-width: 1.2; stroke-linecap: round; }
.yvb-no-sakal { fill: var(--yvb-ak); stroke: color-mix(in oklab, var(--yvb-no-pembe) 60%, var(--yvb-murekkep)); stroke-width: 0.9; stroke-linejoin: round; }
.yvb-no-yuz { fill: var(--yvb-ten); }
.yvb-no-sapka { fill: var(--yvb-k-noel); stroke: color-mix(in oklab, var(--yvb-k-noel) 65%, var(--yvb-murekkep)); stroke-width: 0.9; stroke-linejoin: round; }
.yvb-no-goz { fill: var(--yvb-murekkep); }
.yvb-no-biyik { fill: var(--yvb-ak); }
.yvb-no-burun { fill: var(--yvb-allik); }
.yvb-no-fiyonk { fill: var(--yvb-kumas); stroke: var(--yvb-kumas-koyu); stroke-width: 1.4; stroke-linejoin: round; }
.yvb-no-fiyonk-kat { fill: none; stroke: var(--yvb-kumas-koyu); stroke-width: 1.1; stroke-linecap: round; opacity: 0.8; }
.yvb-no-dugum { fill: color-mix(in oklab, var(--yvb-kumas) 86%, var(--yvb-murekkep)); }
.yvb-no-bant-kenar { fill: none; stroke: color-mix(in oklab, var(--yvb-no-krem) 62%, var(--yvb-murekkep)); stroke-width: 5; stroke-linecap: round; }
.yvb-no-bant { fill: none; stroke: var(--yvb-no-krem); stroke-width: 3.2; stroke-linecap: round; }
.yvb-no-sac-fiyonk { fill: var(--yvb-no-pembe); stroke: color-mix(in oklab, var(--yvb-no-pembe) 55%, var(--yvb-murekkep)); stroke-width: 1.4; stroke-linejoin: round; }
.yvb-no-sac-fiyonk-kat { fill: none; stroke: color-mix(in oklab, var(--yvb-no-pembe) 55%, var(--yvb-murekkep)); stroke-width: 1.1; stroke-linecap: round; opacity: 0.55; }
.yvb-no-sac-dugum { fill: color-mix(in oklab, var(--yvb-no-pembe) 82%, var(--yvb-k-noel)); }
.yvb-no-benek-k { fill: var(--yvb-k-noel); }
.yvb-no-benek-b { fill: var(--yvb-ak); }
`;
