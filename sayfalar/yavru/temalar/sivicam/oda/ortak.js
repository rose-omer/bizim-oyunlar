// Yavrumuz oda çizimleri: ortak çerçeve ve renk jetonları (saf metin, DOM yok).
// Tüm odalar viewBox 0 0 390 480, "xMidYMax slice": sahne boyu değişince alt kenar sabit, üst ve yanlar kırpılır.
// Üst 76 birim başlık alanı (ad, geri, jeton): boş kalsın. Zemin çizgisi y 372. Bebeğin oturduğu yer ortada, y ≈ 430.
// Bebek x 90..300 arasını örter; eşyalar kenarlarda (x < 90, x > 300) ve duvarın üstünde durur.
// Renkler yalnız jetonlardan (iki tema aynı çizim). Odaya özel ek stil: oda dosyasının CSS'i.

export const sar = (oda, ic) => `<svg class="yvo-svg" data-oda="${oda}" viewBox="0 0 390 480" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">${ic}</svg>`;

/** Duvar ve zemin. */
export const TABAN = '<rect class="yvo-duvar" width="390" height="480"/><rect class="yvo-zemin" x="-400" y="372" width="1190" height="2000"/><rect class="yvo-supurgelik" x="-400" y="370" width="1190" height="4"/>';

export const ORTAK_CSS = `
.yv-sahne {
  --yvo-duvar: transparent; --yvo-duvar2: rgb(255 255 255 / 0.34); --yvo-zemin: rgb(255 255 255 / 0.38); --yvo-zemin2: rgb(255 255 255 / 0.5);
  --yvo-esya: rgb(255 255 255 / 0.55); --yvo-esya2: rgb(112 92 190 / 0.42); --yvo-cam: rgb(150 228 242 / 0.62); --yvo-cam2: rgb(105 190 228 / 0.62); --yvo-sicak: #F7C27A;
  --yvo-gece: #1E1650; --yvo-gece2: #2A2068; --yvo-ay: #FFE9A8;
}
@media (prefers-color-scheme: dark) { :root:not([data-mod='acik']) .yv-sahne {
  --yvo-duvar: transparent; --yvo-duvar2: rgb(255 255 255 / 0.09); --yvo-zemin: rgb(10 6 34 / 0.44); --yvo-zemin2: rgb(255 255 255 / 0.12);
  --yvo-esya: rgb(255 255 255 / 0.18); --yvo-esya2: rgb(255 255 255 / 0.32); --yvo-cam: rgb(120 232 248 / 0.36); --yvo-cam2: rgb(120 232 248 / 0.24); --yvo-sicak: #FFC27C;
  --yvo-gece: #120D38; --yvo-gece2: #1B154E;
} }
:root[data-mod='koyu'] .yv-sahne {
  --yvo-duvar: transparent; --yvo-duvar2: rgb(255 255 255 / 0.09); --yvo-zemin: rgb(10 6 34 / 0.44); --yvo-zemin2: rgb(255 255 255 / 0.12);
  --yvo-esya: rgb(255 255 255 / 0.18); --yvo-esya2: rgb(255 255 255 / 0.32); --yvo-cam: rgb(120 232 248 / 0.36); --yvo-cam2: rgb(120 232 248 / 0.24); --yvo-sicak: #FFC27C;
  --yvo-gece: #120D38; --yvo-gece2: #1B154E;
}
.yvo-svg { display: block; width: 100%; height: 100%; overflow: visible; }
.yvo-duvar { fill: var(--yvo-duvar); }
.yvo-duvar2 { fill: var(--yvo-duvar2); }
.yvo-zemin { fill: var(--yvo-zemin); }
.yvo-zemin2 { fill: var(--yvo-zemin2); }
.yvo-supurgelik { fill: var(--yvo-zemin2); }
.yvo-esya { fill: var(--yvo-esya); }
.yvo-esya2 { fill: var(--yvo-esya2); }
.yvo-cam { fill: var(--yvo-cam); }
.yvo-cam2 { fill: var(--yvo-cam2); }
.yvo-sicak { fill: var(--yvo-sicak); }
.yvo-ay { fill: var(--yvo-ay); }
.yvo-cizgi { fill: none; stroke: var(--yvo-esya2); stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
.yvo-cizgi-duvar { fill: none; stroke: var(--yvo-duvar2); stroke-width: 4; }
`;
