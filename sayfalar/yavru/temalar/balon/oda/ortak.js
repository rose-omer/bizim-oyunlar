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
  --yvo-duvar: #D3F0FF; --yvo-duvar2: #B4E2FA; --yvo-zemin: #A6E06E; --yvo-zemin2: #7FCB48;
  --yvo-esya: #F2FBFF; --yvo-esya2: #4FB3E8; --yvo-cam: #8EDCFF; --yvo-cam2: #4FB8F0; --yvo-sicak: #FFD76A;
  --yvo-gece: #08305A; --yvo-gece2: #0C3F70; --yvo-ay: #FFEBA8;
}
@media (prefers-color-scheme: dark) { :root:not([data-mod='acik']) .yv-sahne {
  --yvo-duvar: #0B3A63; --yvo-duvar2: #08304F; --yvo-zemin: #0E5A5C; --yvo-zemin2: #127570;
  --yvo-esya: #16557F; --yvo-esya2: #2A7FAE; --yvo-cam: #49B8E8; --yvo-cam2: #2B8FC8; --yvo-sicak: #FFD76A;
} }
:root[data-mod='koyu'] .yv-sahne {
  --yvo-duvar: #0B3A63; --yvo-duvar2: #08304F; --yvo-zemin: #0E5A5C; --yvo-zemin2: #127570;
  --yvo-esya: #16557F; --yvo-esya2: #2A7FAE; --yvo-cam: #49B8E8; --yvo-cam2: #2B8FC8; --yvo-sicak: #FFD76A;
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
