// Yavrumuz giysi çizimi: çilekli salopet, çilekli bodi, fırfır omuzlu bodi. Sol parça çizilir, ayna() sağa çoğaltır.
import { GOVDE_YOL, PUF_KOL, KISA_BACAK, kumas, yol, ayna, noktalar } from './ortak.js';

// ---------- Küçük çilek (salopet deseni): (x, y) merkez, o ölçek, a dönüş ----------
const kucukCilek = (x, y, o, a = 0) => `<g transform="translate(${x} ${y}) rotate(${a}) scale(${o})">`
  + yol('yvb-cl-cilek', 'M0 7 C-5 5.5 -6.5 -0.5 -4.8 -3.2 C-3.2 -5 3.2 -5 4.8 -3.2 C6.5 -0.5 5 5.5 0 7 Z')
  + yol('yvb-cl-yaprak', 'M0 -2.4 L-5.2 -3.4 L-2.8 -5.2 L-3.4 -7.8 L0 -5.8 L3.4 -7.8 L2.8 -5.2 L5.2 -3.4 Z')
  + noktalar('yvb-cl-cekirdek', [[-2.2, -0.4, 0.75], [2.2, 0, 0.75], [0, 3.2, 0.75]])
  + '</g>';

// ---------- Salopet ----------
const SALOPET_BALON = 'M62 146 C46 150 40 170 52 182 C60 190 82 192 90 184 C96 176 96 166 89 157 C82 150 72 143 62 146 Z';
const SALOPET_MANSET = 'M69.6 174 C68.4 180 70.5 186 75.5 188.8 C81 191.6 88 192 93 189.8';
const SALOPET_FIYONK = '<g transform="translate(100 150)">'
  + yol('yvb-cl-kusak', 'M-2.5 3 C-4.5 9 -6.5 14 -7.5 20 L-4.2 18.2 L-1.4 21 C-0.6 15 0 9 0.5 4 Z M2.5 3 C4.5 9 6.5 14 7.5 20 L4.2 18.2 L1.4 21 C0.6 15 0 9 -0.5 4 Z')
  + yol('yvb-cl-kusak', 'M-2 -2 C-7 -8 -15 -8.5 -16 -4 C-17 1 -16 6.5 -13 7 C-8 7 -4 3.5 -2 2 Z M2 -2 C7 -8 15 -8.5 16 -4 C17 1 16 6.5 13 7 C8 7 4 3.5 2 2 Z')
  + yol('yvb-cl-kusak-kat', 'M-5 -1 Q-10 -3.5 -13 -2 M-5 1 Q-9 3 -12.5 3 M5 -1 Q10 -3.5 13 -2 M5 1 Q9 3 12.5 3')
  + '<rect class="yvb-cl-dugum" x="-3.6" y="-4.2" width="7.2" height="8.4" rx="2.6"/>'
  + '</g>';
const EKOSE_CIZGI = 'M91 133 L109 133 M91 137.5 L109 137.5 M91 142 L109 142 M95.5 128.5 L95.5 144 M100 128.5 L100 144 M104.5 128.5 L104.5 144';

// ---------- Çilekli bodi: karındaki büyük çilek ----------
const tohum = (x, y) => `M${x} ${y - 2.8} c1.8 2.2 2 4.4 0 4.8 c-2 -0.4 -1.8 -2.6 0 -4.8 Z`;
const BUYUK_CILEK = '<g transform="translate(0 4.5)">'
  + yol('yvb-cl-cilek-pembe', 'M100 162 C90 160 82 150 83 140 C84 132 92 130 100 130 C108 130 116 132 117 140 C118 150 110 160 100 162 Z')
  + yol('yvb-cl-tohum', [[91, 138.5], [109, 138.5], [88.5, 147], [111.5, 147], [93, 154], [107, 154], [100, 158]].map(([x, y]) => tohum(x, y)).join(' '))
  + yol('yvb-cl-turkuaz', 'M100 127.5 C94 127 88 130 86 134.5 C90 136 94.5 135.5 96.8 134 C96.8 138 98.5 141 100 141 C101.5 141 103.2 138 103.2 134 C105.5 135.5 110 136 114 134.5 C112 130 106 127 100 127.5 Z')
  + '<circle class="yvb-cl-turkuaz" cx="100" cy="125.8" r="3.2"/>'
  + yol('yvb-cl-damar', 'M100 131 L100 138 M95 131 L90.5 133 M105 131 L109.5 133')
  + noktalar('yvb-cl-goz', [[93, 147, 1.9], [107, 147, 1.9]])
  + yol('yvb-cl-gulus', 'M96.8 150 Q100 153.4 103.2 150')
  + '</g>';

// ---------- Fırfır omuzlu bodi ----------
const FIRFIR_GOVDE = 'M73 127 L127 127 C131 136 141 148 141 158 C141 170 128 177 100 177 C72 177 59 170 59 158 C59 148 69 136 73 127 Z';
const FIRFIR_KANAT = 'M79 119 C74 111 63 105 54 107 C48 108.5 46 114 48.5 118 C43.5 120 42 127 46 130 C42.5 134 44 141 50.5 141 C58 142 69 137 77 128 C79 125 80 122 79 119 Z';

export const GIYSILER = {
  // Pembe balon paçalı salopet: beyaz bluz, ekose panel, askılar, kuşak ve büyük fiyonk, balon bacakta çilekler.
  cileksalopet: {
    renk: 'cilek',
    ciz: (k, f) => ({
      govde: kumas(f, GOVDE_YOL)
        + yol('yvb-cl-bluz', 'M80 110 C90 107 110 107 120 110 L116 150 L84 150 Z')
        + yol('yvb-cl-ekose', 'M91 128.5 L109 128.5 L109 144 L91 144 Z')
        + yol('yvb-cl-ekose-cizgi', EKOSE_CIZGI)
        + yol('yvb-cl-yaka', 'M78 113.5 Q100 123.5 122 113.5 L124 117.5 Q121 122.5 117 121 Q114 125.5 109.5 123.5 Q105 128 100 125.5 Q95 128 90.5 123.5 Q86 125.5 83 121 Q79 122.5 76 117.5 Z')
        + noktalar('yvb-cl-dugme', [[100, 131.2, 1.9], [100, 136, 1.9], [100, 140.8, 1.9]])
        + ayna(kumas(f, 'M75 110 L83 110 L89 146 L81 146 Z')
          + noktalar('yvb-cl-dugme', [[80.6, 122, 2.6], [84.8, 140, 1.8]]))
        + yol('yvb-cl-kusak', 'M60 137 Q100 149 140 137 L141 145 Q100 157 59 145 Z'),
      bacak: ayna(kumas(f, SALOPET_BALON)
        + yol('yvb-kumas-kat', 'M56 156 C50 164 50 174 56 182 M84 156 C88 160 90 164 90 168')
        + yol('yvb-cl-manset-kenar', SALOPET_MANSET)
        + yol('yvb-cl-manset', SALOPET_MANSET)
        + yol('yvb-cl-buzgu', 'M67.4 176.6 L71.6 175.8 M67.4 181.8 L71.6 180.6 M70.6 187.8 L73.8 184.6 M80 192.7 L81.4 188.8 M88.2 193 L87.8 189.2'))
        + kucukCilek(51, 166, 0.82, -10) + kucukCilek(63, 178, 0.92, 8) + kucukCilek(82, 157.5, 0.72, -6)
        + kucukCilek(149, 164, 0.9, 10) + kucukCilek(137.5, 179.5, 0.82, -8) + kucukCilek(118, 157.5, 0.72, 8)
        + SALOPET_FIYONK,
      kol: ayna(yol('yvb-cl-bluz', PUF_KOL[0])
        + noktalar('yvb-cl-benek', [[57, 122, 1.3], [65, 118, 1.3], [62, 128, 1.3], [71, 124, 1.3], [54, 131, 1.3], [69, 131, 1.3]])
        + yol('yvb-cl-firfir', 'M50 134 C57 139 69 136 77 127 L80 130 Q79 135.5 74.5 136.5 Q72.5 142 67 140.5 Q63.5 145 58.5 141.8 Q54 145 50.5 141 Q47 137.5 50 134 Z')),
    }),
  },
  // Açık pembe kısa kollu zıbın: koyu pembe biyeler, zarf yaka, karında gülen çilek.
  cilekbodi: {
    renk: 'bodi',
    ciz: (k, f) => ({
      govde: kumas(f, GOVDE_YOL)
        + yol('yvb-cl-acik', 'M141 140 C145 159 137 175 100 177 C82 176 72 172 66 165 C84 170 110 166 120 152 C126 143 126 132 132 125 C136 129 139 134 141 140 Z')
        + ayna(yol('yvb-cl-zarf', 'M82 112 C84 120 82 128 77 133'))
        + yol('yvb-cl-biye', 'M78 110 Q100 141 122 110')
        + BUYUK_CILEK,
      bacak: ayna(kumas(f, KISA_BACAK) + yol('yvb-cl-biye', 'M52 170 C60 173 76 170 86 158'))
        + yol('yvb-cl-biye', 'M86 176.5 Q100 165 114 176.5'),
      kol: ayna(kumas(f, PUF_KOL[0]) + yol('yvb-cl-biye', 'M50 135 C56.5 139.5 69.5 136.5 77 127.5')),
    }),
  },
  // Kolsuz, kare yakalı mavi bodi: askılar, omuzda kanat fırfır, bel bandı, büzgü, üç çıtçıt.
  firfirbodi: {
    renk: 'gokmavi',
    ciz: (k, f) => ({
      govde: kumas(f, FIRFIR_GOVDE)
        + ayna(yol('yvb-kumas-kat', 'M87 151 Q86 154 87.5 157 M92.5 151.5 Q92 153.5 92.5 155.5') + kumas(f, 'M76 108 L84 108 L88 141 L80 141 Z'))
        + kumas(f, 'M68 136 Q100 144 132 136 L137 145 Q100 153 63 145 Z')
        + yol('yvb-kumas-kat', 'M90 158.5 Q100 155.5 110 158.5')
        + noktalar('yvb-cit', [[93.5, 161.8, 1.8], [100, 162.6, 1.8], [106.5, 161.8, 1.8]]),
      bacak: ayna(kumas(f, KISA_BACAK) + yol('yvb-cl-paca', 'M53 169.5 C60 172 76 169 85.5 158')),
      kol: ayna(kumas(f, FIRFIR_KANAT)
        + yol('yvb-cl-kanat-kat', 'M72 118 C66 114 60 112 55 112.5 M71 123 C64 121 57 121 51 123.5 M70 128 C64 131 57 133 51 135')),
    }),
  },
};

export const AKSESUAR = {};

export const CSS = `
:root {
  --yvb-k-cilek: #F7B8C4;
  --yvb-k-bodi: #F8CFDB;
  --yvb-k-gokmavi: #C4DBE8;
  --yvb-cl-kirmizi: #E8606A;
  --yvb-cl-yesil: #6F9A58;
  --yvb-cl-gul: #EF7A92;
  --yvb-cl-mercan: #EA7CA0;
  --yvb-cl-yesim: #66A69D;
  --yvb-cl-siyah: #33262B;
}
.yvb-cl-bluz { fill: var(--yvb-ak); stroke: var(--yvb-kumas-koyu); stroke-width: 1.4; stroke-linejoin: round; }
.yvb-cl-ekose { fill: color-mix(in oklab, var(--yvb-cl-gul) 22%, var(--yvb-ak)); stroke: var(--yvb-cl-gul); stroke-width: 0.9; }
.yvb-cl-ekose-cizgi { fill: none; stroke: var(--yvb-cl-gul); stroke-width: 0.8; opacity: 0.6; }
.yvb-cl-yaka { fill: color-mix(in oklab, var(--yvb-cl-gul) 40%, var(--yvb-ak)); stroke: var(--yvb-cl-gul); stroke-width: 1.1; stroke-linejoin: round; }
.yvb-cl-dugme { fill: var(--yvb-cl-gul); stroke: color-mix(in oklab, var(--yvb-cl-gul) 62%, var(--yvb-murekkep)); stroke-width: 0.9; }
.yvb-cl-kusak, .yvb-cl-dugum { fill: var(--yvb-cl-gul); stroke: color-mix(in oklab, var(--yvb-cl-gul) 62%, var(--yvb-murekkep)); stroke-width: 1.2; stroke-linejoin: round; }
.yvb-cl-dugum { fill: color-mix(in oklab, var(--yvb-cl-gul) 86%, var(--yvb-murekkep)); }
.yvb-cl-kusak-kat, .yvb-cl-buzgu { fill: none; stroke: color-mix(in oklab, var(--yvb-cl-gul) 62%, var(--yvb-murekkep)); stroke-width: 1; stroke-linecap: round; opacity: 0.7; }
.yvb-cl-manset-kenar { fill: none; stroke: color-mix(in oklab, var(--yvb-cl-gul) 62%, var(--yvb-murekkep)); stroke-width: 6; stroke-linecap: round; }
.yvb-cl-manset { fill: none; stroke: color-mix(in oklab, var(--yvb-cl-gul) 72%, var(--yvb-ak)); stroke-width: 3.8; stroke-linecap: round; }
.yvb-cl-firfir { fill: color-mix(in oklab, var(--yvb-cl-gul) 65%, var(--yvb-ak)); stroke: var(--yvb-cl-gul); stroke-width: 1.1; stroke-linejoin: round; }
.yvb-cl-benek { fill: var(--yvb-cl-gul); opacity: 0.75; }
.yvb-cl-cilek { fill: var(--yvb-cl-kirmizi); stroke: color-mix(in oklab, var(--yvb-cl-kirmizi) 62%, var(--yvb-murekkep)); stroke-width: 0.9; stroke-linejoin: round; }
.yvb-cl-yaprak { fill: var(--yvb-cl-yesil); stroke: color-mix(in oklab, var(--yvb-cl-yesil) 62%, var(--yvb-murekkep)); stroke-width: 0.6; stroke-linejoin: round; }
.yvb-cl-cekirdek { fill: var(--yvb-ak); }
.yvb-cl-biye { fill: none; stroke: var(--yvb-cl-mercan); stroke-width: 4.2; stroke-linecap: round; stroke-linejoin: round; }
.yvb-cl-zarf { fill: none; stroke: color-mix(in oklab, var(--yvb-cl-mercan) 72%, var(--yvb-murekkep)); stroke-width: 1.4; stroke-linecap: round; }
.yvb-cl-acik { fill: color-mix(in oklab, var(--yv-govde) 55%, var(--yvb-ak)); }
.yvb-cl-cilek-pembe { fill: var(--yvb-cl-mercan); stroke: color-mix(in oklab, var(--yvb-cl-mercan) 70%, var(--yvb-murekkep)); stroke-width: 1; stroke-linejoin: round; }
.yvb-cl-tohum { fill: color-mix(in oklab, var(--yvb-cl-mercan) 35%, var(--yvb-ak)); }
.yvb-cl-turkuaz { fill: var(--yvb-cl-yesim); stroke: color-mix(in oklab, var(--yvb-cl-yesim) 65%, var(--yvb-murekkep)); stroke-width: 1; stroke-linejoin: round; }
.yvb-cl-damar { fill: none; stroke: color-mix(in oklab, var(--yvb-cl-yesim) 45%, var(--yvb-ak)); stroke-width: 1; stroke-linecap: round; }
.yvb-cl-goz { fill: var(--yvb-cl-siyah); }
.yvb-cl-gulus { fill: none; stroke: var(--yvb-cl-siyah); stroke-width: 1.2; stroke-linecap: round; }
.yvb-cl-paca { fill: none; stroke: color-mix(in oklab, var(--yvb-kumas) 62%, var(--yvb-kumas-koyu)); stroke-width: 2.6; stroke-linecap: round; }
.yvb-cl-kanat-kat { fill: none; stroke: var(--yvb-kumas-koyu); stroke-width: 1.4; stroke-linecap: round; opacity: 0.6; }
`;
