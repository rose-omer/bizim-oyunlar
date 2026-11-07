// Yavrumuz oda çizimleri: ortak çerçeve ve renk jetonları (saf metin, DOM yok).
// Tüm odalar viewBox 0 0 390 480, "xMidYMax slice": sahne boyu değişince alt kenar sabit, üst ve yanlar kırpılır.
// Üst 76 birim başlık alanı (ad, geri, jeton): boş kalsın. Zemin çizgisi y 372. Bebeğin oturduğu yer ortada, y ≈ 430.
// Bebek x 90..300 arasını örter; eşyalar kenarlarda (x < 90, x > 300) ve duvarın üstünde durur.
// Renkler yalnız jetonlardan (iki tema aynı çizim). Odaya özel ek stil: oda dosyasının CSS'i.

export const sar = (oda, ic) => `<svg class="yvo-svg" data-oda="${oda}" viewBox="0 0 390 480" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">${ic}</svg>`;

/** Duvar ve zemin. */
export const TABAN = '<rect class="yvo-duvar" width="390" height="480"/><rect class="yvo-zemin" y="372" width="390" height="108"/><rect class="yvo-supurgelik" y="370" width="390" height="4"/>';

export const ORTAK_CSS = `
.yv-sahne {
  --yvo-duvar: #EDEDED; --yvo-duvar2: #E0E0E0; --yvo-zemin: #D4D4D4; --yvo-zemin2: #BDBDBD;
  --yvo-esya: #C9C9C9; --yvo-esya2: #8F8F8F; --yvo-cam: #FFFFFF; --yvo-cam2: #D9D9D9; --yvo-sicak: #FF3DAE;
  --yvo-gece: #000000; --yvo-gece2: #1C1C1C; --yvo-ay: #FFFFFF;
}
@media (prefers-color-scheme: dark) { :root:not([data-mod='acik']) .yv-sahne {
  --yvo-duvar: #161616; --yvo-duvar2: #0C0C0C; --yvo-zemin: #262626; --yvo-zemin2: #363636;
  --yvo-esya: #303030; --yvo-esya2: #4F4F4F; --yvo-cam: #5E5E5E; --yvo-cam2: #414141; --yvo-sicak: #FF3DAE;
} }
:root[data-mod='koyu'] .yv-sahne {
  --yvo-duvar: #161616; --yvo-duvar2: #0C0C0C; --yvo-zemin: #262626; --yvo-zemin2: #363636;
  --yvo-esya: #303030; --yvo-esya2: #4F4F4F; --yvo-cam: #5E5E5E; --yvo-cam2: #414141; --yvo-sicak: #FF3DAE;
}
.yvo-svg { display: block; width: 100%; height: 100%; }
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
