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
  --yvo-duvar: #F9EADF; --yvo-duvar2: #F4E0D3; --yvo-zemin: #F0D8C9; --yvo-zemin2: #E7C8B6;
  --yvo-esya: #EAD2C2; --yvo-esya2: #DAB9A6; --yvo-cam: #D5E6F3; --yvo-cam2: #B9D3E8; --yvo-sicak: #F3C97A;
  --yvo-gece: #2E2140; --yvo-gece2: #3A2B4E; --yvo-ay: #F6DFA0;
}
@media (prefers-color-scheme: dark) { :root:not([data-mod='acik']) .yv-sahne {
  --yvo-duvar: #34253C; --yvo-duvar2: #2B1E33; --yvo-zemin: #402E48; --yvo-zemin2: #4C3856;
  --yvo-esya: #4A3654; --yvo-esya2: #5E4769; --yvo-cam: #7487AE; --yvo-cam2: #566891; --yvo-sicak: #F0BE7C;
} }
:root[data-mod='koyu'] .yv-sahne {
  --yvo-duvar: #34253C; --yvo-duvar2: #2B1E33; --yvo-zemin: #402E48; --yvo-zemin2: #4C3856;
  --yvo-esya: #4A3654; --yvo-esya2: #5E4769; --yvo-cam: #7487AE; --yvo-cam2: #566891; --yvo-sicak: #F0BE7C;
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
