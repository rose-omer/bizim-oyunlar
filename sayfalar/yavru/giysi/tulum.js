// Yavrumuz giysi çizimi: tulumlar (laleli uyku tulumu, çift renk tulum, denizci takımı, kot salopet).
import { GOVDE_YOL, PUF_KOL, UZUN_KOL, UZUN_BACAK, KISA_BACAK, kumas, yol, sag, ayna, noktalar, patik, tulumTaban, fermuar, y1 } from './ortak.js';

/** Lale: pembe çanak, yeşil sap ve yaprak. (x, y): çanağın tabanı; a: eğim. */
const lale = (x, y, a = 0) => `<g transform="translate(${x} ${y}) rotate(${a})">`
  + yol('yvb-tl-sap', 'M0 0 L0 6.5 M0 4.8 Q2.8 4.4 3.6 1.6')
  + yol('yvb-tl-lale', 'M-3.3 -5.2 L-1.6 -3.4 L0 -5.8 L1.6 -3.4 L3.3 -5.2 C3.9 -1.8 2.5 0.5 0 0.5 C-2.5 0.5 -3.9 -1.8 -3.3 -5.2 Z')
  + '</g>';
const benek = (liste) => noktalar('yvb-tl-benek', liste.map(([x, y]) => [x, y, 1.25]));

/** Beş yapraklı beyaz çiçekler. liste: [[x, y, r], ...] */
const cicekler = (liste) => noktalar('yvb-tl-cicek', liste.flatMap(([x, y, r]) => [0, 1, 2, 3, 4].map((i) => {
  const a = (i * 2 * Math.PI) / 5 - Math.PI / 2;
  return [y1(x + r * 0.62 * Math.cos(a)), y1(y + r * 0.62 * Math.sin(a)), y1(r * 0.52)];
}))) + noktalar('yvb-tl-cicek-orta', liste.map(([x, y, r]) => [x, y, y1(r * 0.3)]));

export const GIYSILER = {
  // Beyaz patikli uyku tulumu: lale ve pembe nokta deseni, fitilli yaka ve manşet, sol bacağa inen fermuar.
  lalepijama: {
    renk: 'krem',
    ciz: (k, f) => {
      const t = tulumTaban(f);
      return {
        govde: t.govde
          + benek([[80, 139], [94, 128], [95, 141], [83, 151], [96, 156], [106, 128], [121, 138], [106, 139], [122, 149], [105, 147]])
          + lale(87, 134, -10) + lale(114, 133, 12) + lale(89, 150, 8) + lale(113, 147, -8)
          + yol('yvb-tl-fitil', 'M76 113 Q100 138 124 113 L116 109 Q100 122 84 109 Z')
          + yol('yvb-tl-fitil-cizgi', 'M80 111.5 Q100 131.5 120 111.5'),
        bacak: t.bacak
          + ayna(lale(58, 176, -12) + benek([[55.5, 164], [71, 173], [65.5, 176], [68, 183]]))
          + fermuar('M100 124 L100 147 C100 155 108 157 116 157 C123 157 128 160 131 167')
          + yol('yvb-tl-kilit', 'M95.5 121 L104.5 121 L100 131 Z'),
        ayak: t.ayak + ayna(lale(85.5, 172, -10) + benek([[78.5, 176], [93, 177]])),
        kol: t.kol + ayna(lale(59, 131, -18) + benek([[66, 121], [70, 133], [51, 136], [65, 141]])
          + yol('yvb-tl-fitil', 'M48 141 C49 149 53 153 59 153 C66 153 71 150 73 145 L74.5 140 C68 146 56 147 48 141 Z')
          + yol('yvb-tl-fitil-cizgi', 'M52.5 147 C56 149.3 66 150.5 70 146')),
      };
    },
  },
  // Çift renk patikli tulum: izleyicinin solu düz açık pembe, sağı koyu pembe ve çiçekli; krem yaka, pat ve düğmeler.
  ciftrenk: {
    renk: 'pembe',
    ciz: (k, f) => ({
      govde: kumas(f, GOVDE_YOL)
        + kumas(f, 'M100 107 C124 107 137 120 141 140 C145 159 137 175 100 177 Z', ' yvb-tl-koyu')
        + cicekler([[110, 127, 3.6], [120, 133, 3.6], [108, 139, 3.6], [118, 146, 3.6], [108, 151, 3.6]])
        + kumas(f, 'M93.5 122.5 L101.5 122.5 L101.5 160 Q97.5 163.5 93.5 160 Z')
        + yol('yvb-tl-yaka', 'M80 112 Q100 135 120 112')
        + noktalar('yvb-tl-dugme', [[97.5, 129.5, 2.3], [97.5, 138.5, 2.3], [97.5, 147.5, 2.3], [97.5, 156.5, 2.3]]),
      bacak: kumas(f, UZUN_BACAK)
        + sag(kumas(f, UZUN_BACAK, ' yvb-tl-koyu') + cicekler([[56.5, 165, 3.4], [59, 174.5, 3.6], [69, 175.5, 3.6], [64.5, 182, 3]])),
      ayak: patik(f, 86, -10) + patik(f, 114, 10, ' yvb-tl-koyu') + cicekler([[115, 167, 3.2], [108, 176, 3.2], [120, 177, 3.2]]),
      kol: kumas(f, UZUN_KOL)
        + sag(kumas(f, UZUN_KOL, ' yvb-tl-koyu') + cicekler([[61, 123, 3.6], [53, 135, 3.6], [66, 135, 3.6], [59, 146, 3.6]])),
    }),
  },
  // Denizci takımı: beyaz üst, lacivert yaka ve şerit, kırmızı fular; lacivert şort, iki düğme, kısa kol. Ayaklar açık.
  denizci: {
    renk: 'krem',
    ciz: (k, f) => ({
      govde: kumas(f, GOVDE_YOL)
        + kumas(f, 'M58.1 147 Q100 155 141.9 147 C142.5 162.8 132.4 175.3 100 177 C67.6 175.3 57.5 162.8 58.1 147 Z', ' yvb-tl-laci')
        + noktalar('yvb-dugme', [[91, 156.5, 2.2], [109, 156.5, 2.2]])
        + '<g class="yvb-tl-capa" transform="translate(116 139)"><circle cx="0" cy="-5" r="1.4"/><path d="M0 -3.6 L0 4.8 M-2.6 -1.4 L2.6 -1.4 M-4.4 1.4 Q-4 5 0 5 Q4 5 4.4 1.4"/></g>',
      bacak: ayna(kumas(f, KISA_BACAK, ' yvb-tl-laci') + yol('yvb-tl-serit', 'M54.5 167 C62 169 74 166 82 157.5')),
      kol: ayna(kumas(f, PUF_KOL[0]) + yol('yvb-tl-manset', 'M52 136 C58 140 70 137 76 130'))
        + yol('yvb-tl-laci-dolgu', 'M68 115 L100 143 L132 115 L116 109 L100 128 L84 109 Z')
        + yol('yvb-tl-serit', 'M72.7 114.7 L100 138.5 L127.3 114.7')
        + yol('yvb-tl-kirmizi', 'M85 110 L100 128 L115 110 Q100 121 85 110 Z')
        + ayna(yol('yvb-tl-kirmizi', 'M98 131 L90 145 L98.5 142 L100 134 Z'))
        + yol('yvb-tl-kirmizi', 'M95.5 127 Q100 125 104.5 127 L103.5 134 Q100 135.5 96.5 134 Z'),
    }),
  },
  // Kot salopet ve çizgili tişört: göğüslük, altın düğmeli askılar, kalpli cep, açık renk kıvrık paça. Ayaklar açık.
  salopet: {
    renk: 'kot',
    ciz: (k, f) => ({
      govde: kumas(f, GOVDE_YOL)
        + yol('yvb-tl-tisort', 'M59 140 C63 120 76 107 100 107 C124 107 137 120 141 140 Q100 150 59 140 Z')
        + yol('yvb-tl-cizgi', 'M68.5 119.5 Q100 124 131.5 119.5 M64.5 125.5 Q100 130 135.5 125.5 M61.5 131.5 Q100 136 138.5 131.5 M59.6 137.5 Q100 142 140.4 137.5')
        + yol('yvb-tl-cizgi', 'M86 109.5 Q100 130 114 109.5')
        + ayna(kumas(f, 'M78.6 111.6 L86.5 108.8 L90.5 126 L83.5 126 Z'))
        + kumas(f, 'M85 124 L115 124 Q118 124 118 127 C118.5 134 120 139 124 143.3 Q100 146.7 76 143.3 C80 139 81.5 134 82 127 Q82 124 85 124 Z')
        + ayna(yol('yvb-dikis', 'M84.4 130 C84 135 82.5 139 80 142'))
        + noktalar('yvb-tl-altin', [[86.8, 127.5, 2.5], [113.2, 127.5, 2.5]])
        + yol('yvb-tl-cep', 'M91 130 L109 130 L109 138 Q100 143.5 91 138 Z')
        + yol('yvb-tl-kalp', 'M100 139.6 C94.2 135.6 94.2 131.8 97.2 131.6 C98.8 131.5 99.7 132.4 100 133.4 C100.3 132.4 101.2 131.5 102.8 131.6 C105.8 131.8 105.8 135.6 100 139.6 Z'),
      bacak: ayna(kumas(f, 'M63 147 C52 155 50 172 59 180 C64 184 70 182 74 178 C80 170 84 164 86 158 C82 152 74 146 63 147 Z')
        + yol('yvb-tl-paca', 'M53.6 173.2 C54 177 56.5 180 59 181.5 C64 185 71 183 75 179 L78.6 172.6 C71 178 61 178.5 53.6 173.2 Z')),
      kol: ayna(yol('yvb-tl-tisort', PUF_KOL[0])
        + yol('yvb-tl-cizgi', 'M53.6 119 Q64 121 74.6 118 M50.4 124.7 Q63 127 76.8 123 M49.6 130.4 Q62 133 76.5 127.8 M53 136.6 C58 138.8 67.5 137 72.5 132')),
    }),
  },
};

export const AKSESUAR = {};

export const CSS = `
:root {
  --yvb-k-krem: #FFFAF4;
  --yvb-k-pembe: #F9C9D4;
  --yvb-k-kot: #86A9D0;
  --yvb-tl-lale: #EE9DB2;
  --yvb-tl-yesil: #6FA56B;
  --yvb-tl-koyu: #F08AA2;
  --yvb-tl-laci: #2F4A7A;
  --yvb-tl-kirmizi: #D8433F;
}
.yvb-tl-lale { fill: var(--yvb-tl-lale); }
.yvb-tl-benek { fill: var(--yvb-tl-lale); }
.yvb-tl-sap { fill: none; stroke: var(--yvb-tl-yesil); stroke-width: 1.1; stroke-linecap: round; }
.yvb-tl-fitil { fill: color-mix(in oklab, var(--yvb-tl-lale) 55%, var(--yvb-ak)); stroke: var(--yvb-kumas-koyu); stroke-width: 1.2; stroke-linejoin: round; }
.yvb-tl-fitil-cizgi { fill: none; stroke: var(--yvb-tl-lale); stroke-width: 4.6; stroke-dasharray: 0.9 2.3; }
.yvb-tl-kilit { fill: var(--yvb-ak); stroke: var(--yvb-kumas-koyu); stroke-width: 1.1; stroke-linejoin: round; }
.yvb-kumas.yvb-tl-koyu { fill: var(--yvb-tl-koyu); stroke: color-mix(in oklab, var(--yvb-tl-koyu) 68%, var(--yvb-murekkep)); }
.yvb-tl-cicek { fill: var(--yvb-ak); }
.yvb-tl-cicek-orta { fill: var(--yvb-tl-koyu); }
.yvb-tl-yaka { fill: none; stroke: var(--yvb-k-krem); stroke-width: 3.8; stroke-linecap: round; }
.yvb-tl-dugme { fill: var(--yvb-k-krem); stroke: var(--yvb-kumas-koyu); stroke-width: 1; }
.yvb-kumas.yvb-tl-laci { fill: var(--yvb-tl-laci); stroke: color-mix(in oklab, var(--yvb-tl-laci) 68%, var(--yvb-murekkep)); }
.yvb-tl-laci-dolgu { fill: var(--yvb-tl-laci); stroke: color-mix(in oklab, var(--yvb-tl-laci) 68%, var(--yvb-murekkep)); stroke-width: 1.2; stroke-linejoin: round; }
.yvb-tl-manset { fill: none; stroke: var(--yvb-tl-laci); stroke-width: 3.8; stroke-linecap: round; }
.yvb-tl-serit { fill: none; stroke: var(--yvb-ak); stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
.yvb-tl-kirmizi { fill: var(--yvb-tl-kirmizi); stroke: color-mix(in oklab, var(--yvb-tl-kirmizi) 72%, var(--yvb-murekkep)); stroke-width: 0.9; stroke-linejoin: round; }
.yvb-tl-capa { fill: none; stroke: var(--yvb-tl-laci); stroke-width: 1.4; stroke-linecap: round; }
.yvb-tl-tisort { fill: var(--yvb-ak); stroke: var(--yvb-kumas-koyu); stroke-width: 1.4; stroke-linejoin: round; }
.yvb-tl-cizgi { fill: none; stroke: var(--yvb-tl-kirmizi); stroke-width: 2.4; }
.yvb-tl-altin { fill: var(--yvb-altin); stroke: var(--yvb-altin-koyu); stroke-width: 1; }
.yvb-tl-cep { fill: color-mix(in oklab, var(--yvb-k-kot) 80%, var(--yvb-kumas-koyu)); stroke: var(--yvb-kumas-koyu); stroke-width: 1.1; stroke-linejoin: round; }
.yvb-tl-kalp { fill: var(--yvb-tl-kirmizi); }
.yvb-tl-paca { fill: color-mix(in oklab, var(--yvb-k-kot) 40%, var(--yvb-ak)); stroke: var(--yvb-kumas-koyu); stroke-width: 1.2; stroke-linejoin: round; }
`;
