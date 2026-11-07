// Yavrumuz oda çizimleri: ortak çerçeve ve renk jetonları (saf metin, DOM yok).
// Tüm odalar viewBox 0 0 390 480, "xMidYMax slice": sahne boyu değişince alt kenar sabit, üst ve yanlar kırpılır.
// Üst 76 birim başlık alanı (ad, geri, jeton): boş kalsın. Zemin çizgisi y 372. Bebeğin oturduğu yer ortada, y ≈ 430.
// Bebek x 90..300 arasını örter; eşyalar kenarlarda (x < 90, x > 300) ve duvarın üstünde durur.
// Renkler yalnız jetonlardan (iki tema aynı çizim). Odaya özel ek stil: oda dosyasının CSS'i.

export const sar = (oda, ic) => `<svg class="yvo-svg" data-oda="${oda}" viewBox="0 0 390 480" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">${ic}</svg>`;

/** Duvar ve zemin. */
export const TABAN = '<rect class="yvo-duvar" width="390" height="480"/>'
  // Duvar kâğıdı: seyrek yıldızlar ve iki ince takımyıldız
  + '<g class="yvo-duvar-gok"><path class="yvo-takim" d="M110 118l34 22 40-12 26 26M292 104l-28 30 22 34 40 8"/>'
  + '<circle cx="110" cy="118" r="2.2"/><circle cx="144" cy="140" r="1.6"/><circle cx="184" cy="128" r="2.4"/><circle cx="210" cy="154" r="1.5"/>'
  + '<circle cx="292" cy="104" r="2.2"/><circle cx="264" cy="134" r="1.6"/><circle cx="286" cy="168" r="2"/><circle cx="326" cy="176" r="1.5"/>'
  + '<circle cx="24" cy="92" r="1.3"/><circle cx="72" cy="262" r="1.2"/><circle cx="160" cy="92" r="1.2"/><circle cx="232" cy="100" r="1.4"/><circle cx="360" cy="96" r="1.3"/><circle cx="372" cy="300" r="1.2"/><circle cx="20" cy="340" r="1.2"/><circle cx="128" cy="210" r="1.1"/><circle cx="262" cy="222" r="1.1"/></g>'
  + '<rect class="yvo-zemin" y="372" width="390" height="108"/><rect class="yvo-supurgelik" y="371" width="390" height="1.5"/>';

/** Pencere camında gece: hilal ve yıldızlar. (x, y): hilalin yeri; yildizlar: [x, y, r] listesi. */
export const gece = (x, y, yildizlar) => `<g class="yvo-pencere-gok"><path class="yvo-ay" transform="translate(${x} ${y})" d="M0 -14a15 15 0 1 0 7 23a12 12 0 0 1 -7 -23Z"/>${yildizlar.map(([a, b, r]) => `<circle class="yvo-ay" cx="${a}" cy="${b}" r="${r}"/>`).join('')}</g>`;

/** Ay ışığı: pencereden yere düşen soluk huzme ve ışık havuzu. */
export const ayIsigi = (ust, alt, cx, rx) => `<path class="yvo-ay-isik" d="M${ust} L${alt} Z"/><ellipse class="yvo-ay-havuz" cx="${cx}" cy="412" rx="${rx}" ry="20"/>`;

export const ORTAK_CSS = `
.yv-sahne {
  --yvo-duvar: #DAD2EC; --yvo-duvar2: #CCC2E3; --yvo-zemin: #C6BADF; --yvo-zemin2: #B4A7D3;
  --yvo-esya: #E9E2F2; --yvo-esya2: #BDB0D8; --yvo-cam: #2A3170; --yvo-cam2: #4A5296; --yvo-sicak: #EBC877;
  --yvo-gece: #161E4C; --yvo-gece2: #20295E; --yvo-ay: #F4E2A8;
  --yvo-altin: #9C7E33; --yvo-gok: #8C7430;
}
@media (prefers-color-scheme: dark) { :root:not([data-mod='acik']) .yv-sahne {
  --yvo-duvar: #16214F; --yvo-duvar2: #121B44; --yvo-zemin: #1D2A5E; --yvo-zemin2: #27356F;
  --yvo-esya: #1F2C63; --yvo-esya2: #33427F; --yvo-cam: #070D2A; --yvo-cam2: #121B44; --yvo-sicak: #EDC67A;
  --yvo-altin: #C7A968; --yvo-gok: #E2C27C;
} }
:root[data-mod='koyu'] .yv-sahne {
  --yvo-duvar: #16214F; --yvo-duvar2: #121B44; --yvo-zemin: #1D2A5E; --yvo-zemin2: #27356F;
  --yvo-esya: #1F2C63; --yvo-esya2: #33427F; --yvo-cam: #070D2A; --yvo-cam2: #121B44; --yvo-sicak: #EDC67A;
  --yvo-altin: #C7A968; --yvo-gok: #E2C27C;
}
.yvo-svg { display: block; width: 100%; height: 100%; }
.yvo-duvar { fill: var(--yvo-duvar); }
.yvo-duvar2 { fill: var(--yvo-duvar2); }
.yvo-zemin { fill: var(--yvo-zemin); }
.yvo-zemin2 { fill: var(--yvo-zemin2); }
.yvo-supurgelik { fill: var(--yvo-altin); opacity: 0.7; }
.yvo-esya, .yvo-esya2 { stroke: var(--yvo-altin); stroke-width: 1; stroke-opacity: 0.75; }
.yvo-esya { fill: var(--yvo-esya); }
.yvo-esya2 { fill: var(--yvo-esya2); }
.yvo-cam { fill: var(--yvo-cam); stroke: var(--yvo-altin); stroke-width: 1.2; }
.yvo-duvar-gok circle { fill: var(--yvo-gok); opacity: 0.6; }
.yvo-takim { fill: none; stroke: var(--yvo-gok); stroke-width: 0.8; opacity: 0.35; }
.yvo-ay-isik { fill: var(--yvo-ay); opacity: 0.07; }
.yvo-ay-havuz { fill: var(--yvo-ay); opacity: 0.09; }
.yvo-cam2 { fill: var(--yvo-cam2); }
.yvo-sicak { fill: var(--yvo-sicak); }
.yvo-ay { fill: var(--yvo-ay); }
.yvo-cizgi { fill: none; stroke: var(--yvo-altin); stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
.yvo-cizgi-duvar { fill: none; stroke: var(--yvo-altin); stroke-width: 1.5; }
`;
