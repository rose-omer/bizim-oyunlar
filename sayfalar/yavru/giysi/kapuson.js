// Yavrumuz giysi çizimi: kapüşonlular (ayı ve tavşan kulaklı tulum, sarı yağmurluk). Üçü de patikli.
import { KAPUSON_KUTU, kumas, yol, ayna, noktalar, tulumTaban, fermuar } from './ortak.js';

// Dış kenar ense saçını örter; yüz iç kenarın içinde görünür.
const KAP_DIS = 'M100 5 C141 5 170 36 170 76 C170 101 158 119 141 124 C121 118 79 118 59 124 C42 119 30 101 30 76 C30 36 59 5 100 5 Z';
const KAP_ICI = 'M100 38 C128 38 147 58 147 81 C147 103 127 117 100 117 C73 117 53 103 53 81 C53 58 72 38 100 38 Z';
const kenarYol = (sinif) => yol(sinif, KAP_ICI);

/** Kapüşon: kulak (halkanın arkasında), halka, iç kenar, alın süsü. */
const kapuson = (f, kulak, kenar, sus = '') => kulak
  + kumas(`${f} fill-rule="evenodd"`, `${KAP_DIS} ${KAP_ICI}`)
  + kenarYol('yvb-kp-kenar') + kenar + sus;

/** Alındaki küçük hayvan yüzü: gözler, açık burun bölgesi, burun, gülüş, yanaklar. */
const alinYuzu = (burun, yanak) => ayna(noktalar(yanak, [[81.5, 27, 4.4]]) + noktalar('yvb-kp-goz', [[88.5, 19.5, 2.6]]))
  + '<ellipse class="yvb-kp-burun-bolge" cx="100" cy="25.5" rx="10" ry="7.5"/>'
  + `<ellipse class="${burun}" cx="100" cy="22.4" rx="3.3" ry="2.4"/>`
  + yol('yvb-kp-agiz', 'M100 24.6 L100 26.6 M95.5 26.4 Q97.8 29.8 100 26.8 Q102.2 29.8 104.5 26.4');

// Kol ucu: dikiş ve beyaz biye (sol; ayna ile iki yan).
const MANSET_DIKIS = ayna(yol('yvb-dikis', 'M50.5 145 C54 149 58 150 62 149.7 C66 149.4 69.5 147.5 71.3 143.5'));
const MANSET_BIYE = ayna(yol('yvb-biye', 'M50 147.5 C53 151.5 58 152.5 63 152 C68 151.5 71 149 72.5 146'));

// Ayı tulumu: önden çapraz fermuar (bacağa uzanır, patiğin altında biter), boyunda düğmeli sekme, göğüste rozet.
const FERMUAR = 'M108 116 C104 132 96 152 88 174';
const SEKME = 'M89 122 C96 122.5 104 123.5 110 124.5 C115.5 125.3 115.5 132.3 110 131.8 C104 131.2 96 130.2 89 130 C87 127.5 87 124.5 89 122 Z';
const ROZET = '<circle class="yvb-kp-rozet" cx="112.5" cy="141" r="7"/>'
  + '<text class="yvb-kp-rozet-b" x="112.5" y="144.6">B</text>'
  + yol('yvb-kp-serit', 'M104 154.5 L120.5 151.5');
const ayiKulak = (f) => ayna(kumas(f, 'M39.5 15 a13.5 13.5 0 1 0 27 0 a13.5 13.5 0 1 0 -27 0 Z')
  + noktalar('yvb-kp-kulak-ici', [[51.5, 13.5, 7.5]]));

// Tavşan: sol kulak dik, sağ kulak kırık (dış yana sarkar; kırık yerde kıvrım).
const tavsanKulak = (f) => kumas(f, 'M52 26 C49 10 51 -14 60 -14 C68 -14 71 4 69 16 Z')
  + yol('yvb-kp-kulak-pembe', 'M56 24 C54 8 55 -8 60 -8.5 C64.5 -8 66 4 65 18 Z')
  + kumas(f, 'M130 16 C130 2 134 -10 143 -11 C156 -12 168 -2 170 16 C170.5 24 161 26 158 18 C155.5 10 151 5 147 5 C148 12 149 20 148 28 Z')
  + yol('yvb-kp-kulak-pembe', 'M135 20 C135 6 138 -4 143 -5.5 C145 -1 145.5 6 145 24 Z')
  + yol('yvb-kumas-kat', 'M143 -11 C148 -7 149 -1 147 5');

// Yağmurluk: tek parça etekli gövde (üstü kapüşon ve kolların altında), çizme tabanı, parlak kapüşon.
const PALTO = 'M78 112 L122 112 C132 120 139 132 142 146 C146 156 151 165 154 172 Q128 183 100 183 Q72 183 46 172 C49 165 54 156 58 146 C61 132 68 120 78 112 Z';
const CEP = yol('yvb-kp-cep', 'M80 142 H93.5 V153 Q93.5 157 89.5 157 H84 Q80 157 80 153 Z')
  + yol('yvb-kp-cep', 'M79 140.5 H94.5 V145.5 Q86.8 149.5 79 145.5 Z');
const cizmeTaban = (x, a) => `<g transform="translate(${x} 176) rotate(${a})"><ellipse class="yvb-kp-taban" cx="0" cy="-1" rx="7.5" ry="8.5"/></g>`;

export const GIYSILER = {
  ayitulum: {
    renk: 'bej',
    kutu: KAPUSON_KUTU,
    ciz: (k, f) => {
      const t = tulumTaban(f);
      return {
        ...t,
        bacak: t.bacak + fermuar(FERMUAR) + kumas(f, SEKME) + noktalar('yvb-kp-tas', [[109.5, 128.2, 3.3]]) + ROZET,
        kol: t.kol + MANSET_DIKIS,
        baslik: kapuson(f, ayiKulak(f), kenarYol('yvb-kp-astar') + kenarYol('yvb-kp-astar-cizgi'),
          yol('yvb-kumas-kat', 'M100 5.5 L100 12.5') + alinYuzu('yvb-kp-burun-koyu', 'yvb-kp-yanak-sari')),
      };
    },
  },
  tavsan: {
    renk: 'tavsan',
    kutu: KAPUSON_KUTU,
    ciz: (k, f) => {
      const t = tulumTaban(f);
      return {
        ...t,
        govde: t.govde + '<ellipse class="yvb-kp-yama" cx="100" cy="141" rx="18" ry="19"/>'
          + noktalar('yvb-kp-dugme', [[100, 129, 2.8], [100, 141, 2.8], [100, 153, 2.8]]),
        kol: t.kol + MANSET_BIYE,
        baslik: kapuson(f, tavsanKulak(f), kenarYol('yvb-kp-kenar-pembe'), alinYuzu('yvb-kp-burun-pembe', 'yvb-kp-yanak-pembe')),
      };
    },
  },
  yagmurluk: {
    renk: 'sari',
    kutu: KAPUSON_KUTU,
    ciz: (k, f) => {
      const t = tulumTaban(f);
      return {
        ...t,
        bacak: kumas(f, PALTO)
          + yol('yvb-dikis', 'M49 167.5 Q72 178.5 100 178.5 Q128 178.5 151 167.5')
          + yol('yvb-dikis', 'M100 120 L100 172')
          + ayna(CEP)
          + noktalar('yvb-dugme', [[100, 127, 3.8], [100, 141, 3.8], [100, 155, 3.8]]),
        ayak: t.ayak + cizmeTaban(86, -10) + cizmeTaban(114, 10),
        kol: t.kol + MANSET_DIKIS,
        baslik: kapuson(f, '', kenarYol('yvb-kp-kenar-sari'),
          yol('yvb-dikis', 'M58 104 C50 92 46 86 46 78 C46 50 70 29 100 29 C130 29 154 50 154 78 C154 86 150 92 142 104')
          + yol('yvb-kp-parilti', 'M43 62 C46 46 57 31 74 23')),
      };
    },
  },
};

export const AKSESUAR = {};

export const CSS = `
:root {
  --yvb-k-bej: #E9DCC6;
  --yvb-k-tavsan: #F8E6EC;
  --yvb-k-sari: #F8E28C;
  --yvb-kp-turkuaz: #58BFA6;
}
.yvb-kp-kenar { fill: none; stroke: var(--yvb-kumas-koyu); stroke-width: 7; }
.yvb-kp-astar { fill: none; stroke: var(--yvb-ak); stroke-width: 5.4; }
.yvb-kp-astar-cizgi { fill: none; stroke: color-mix(in oklab, var(--yvb-k-bej) 60%, var(--yvb-murekkep)); stroke-width: 5.4; stroke-dasharray: 1.2 3; opacity: 0.32; }
.yvb-kp-kenar-pembe { fill: none; stroke: color-mix(in oklab, var(--yvb-pembe) 38%, var(--yvb-ak)); stroke-width: 5.4; }
.yvb-kp-kenar-sari { fill: none; stroke: color-mix(in oklab, var(--yvb-kumas) 72%, var(--yvb-altin-koyu)); stroke-width: 5.4; }
.yvb-kp-kulak-ici { fill: color-mix(in oklab, var(--yvb-kumas) 30%, var(--yvb-ayi)); }
.yvb-kp-kulak-pembe { fill: color-mix(in oklab, var(--yvb-pembe) 50%, var(--yvb-ak)); }
.yvb-kp-goz, .yvb-kp-burun-koyu { fill: var(--yvb-murekkep); }
.yvb-kp-burun-bolge { fill: color-mix(in oklab, var(--yvb-kumas) 35%, var(--yvb-ak)); }
.yvb-kp-burun-pembe { fill: var(--yvb-pembe); }
.yvb-kp-agiz { fill: none; stroke: var(--yvb-murekkep); stroke-width: 1.2; stroke-linecap: round; stroke-linejoin: round; }
.yvb-kp-yanak-sari { fill: var(--yvb-altin); opacity: 0.8; }
.yvb-kp-yanak-pembe { fill: color-mix(in oklab, var(--yvb-pembe) 60%, var(--yvb-ak)); opacity: 0.75; }
.yvb-kp-tas { fill: var(--yvb-ayi); stroke: color-mix(in oklab, var(--yvb-ayi) 55%, var(--yvb-murekkep)); stroke-width: 0.9; }
.yvb-kp-rozet { fill: var(--yvb-ak); stroke: var(--yvb-kp-turkuaz); stroke-width: 1.5; }
.yvb-kp-rozet-b { fill: color-mix(in oklab, var(--yvb-kp-turkuaz) 55%, var(--yvb-murekkep)); font-family: var(--font-display); font-weight: 700; font-size: 10px; text-anchor: middle; }
.yvb-kp-serit { fill: none; stroke: var(--yvb-kp-turkuaz); stroke-width: 4; stroke-linecap: round; }
.yvb-kp-yama { fill: var(--yvb-ak); stroke: var(--yvb-kumas-koyu); stroke-width: 1.2; }
.yvb-kp-dugme { fill: color-mix(in oklab, var(--yvb-pembe) 55%, var(--yvb-ak)); stroke: var(--yvb-kumas-koyu); stroke-width: 0.9; }
.yvb-kp-cep { fill: color-mix(in oklab, var(--yvb-kumas) 88%, var(--yvb-kumas-koyu)); stroke: var(--yvb-kumas-koyu); stroke-width: 1.2; stroke-linejoin: round; }
.yvb-kp-taban { fill: color-mix(in oklab, var(--yvb-kumas) 75%, var(--yvb-kumas-koyu)); }
.yvb-kp-parilti { fill: none; stroke: var(--yvb-ak); stroke-width: 3; stroke-linecap: round; opacity: 0.55; }
`;
