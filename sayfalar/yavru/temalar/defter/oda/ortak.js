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
  --yvo-duvar: #D9EEF9; --yvo-duvar2: #BFE0F3; --yvo-zemin: #FFDDA6; --yvo-zemin2: #F5C27A;
  --yvo-esya: #FFC4D8; --yvo-esya2: #F08BAE; --yvo-cam: #FFFEF6; --yvo-cam2: #BFE3F5; --yvo-sicak: #FFD35C;
  --yvo-kalem: #232B45;
  --yvo-gece: #2E2140; --yvo-gece2: #3A2B4E; --yvo-ay: #F6DFA0;
}
@media (prefers-color-scheme: dark) { :root:not([data-mod='acik']) .yv-sahne {
  --yvo-duvar: #2B2A31; --yvo-duvar2: #3A3942; --yvo-zemin: #35343B; --yvo-zemin2: #45434C;
  --yvo-esya: #3D3C46; --yvo-esya2: #5A5862; --yvo-cam: #51678C; --yvo-cam2: #3E5170; --yvo-sicak: #F3D27E;
  --yvo-kalem: #E8E3D6;
} }
:root[data-mod='koyu'] .yv-sahne {
  --yvo-duvar: #2B2A31; --yvo-duvar2: #3A3942; --yvo-zemin: #35343B; --yvo-zemin2: #45434C;
  --yvo-esya: #3D3C46; --yvo-esya2: #5A5862; --yvo-cam: #51678C; --yvo-cam2: #3E5170; --yvo-sicak: #F3D27E;
  --yvo-kalem: #E8E3D6;
}
.yvo-svg { display: block; width: 100%; height: 100%; }
.yvo-duvar { fill: var(--yvo-duvar); }
.yvo-duvar2 { fill: var(--yvo-duvar2); }
.yvo-zemin { fill: var(--yvo-zemin); }
.yvo-zemin2 { fill: var(--yvo-zemin2); }
.yvo-supurgelik { fill: var(--yvo-kalem); }
.yvo-esya { fill: var(--yvo-esya); stroke: var(--yvo-kalem); stroke-width: 1.5; stroke-linejoin: round; }
.yvo-esya2 { fill: var(--yvo-esya2); stroke: var(--yvo-kalem); stroke-width: 1.5; stroke-linejoin: round; }
.yvo-cam { fill: var(--yvo-cam); stroke: var(--yvo-kalem); stroke-width: 1.5; stroke-linejoin: round; }
.yvo-cam2 { fill: var(--yvo-cam2); }
.yvo-sicak { fill: var(--yvo-sicak); }
.yvo-ay { fill: var(--yvo-ay); }
.yvo-cizgi { fill: none; stroke: var(--yvo-kalem); stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; }
.yvo-cizgi-duvar { fill: none; stroke: var(--yvo-duvar2); stroke-width: 4; }
`;
