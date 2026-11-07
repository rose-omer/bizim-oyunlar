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
  --yvo-duvar: #C7DFE9; --yvo-duvar2: #AECDDA; --yvo-zemin: #EADBB8; --yvo-zemin2: #D5BF92;
  --yvo-esya: #F7F1DD; --yvo-esya2: #3F6396; --yvo-cam: #F6F7E6; --yvo-cam2: #DCE9DE; --yvo-sicak: #E9B044;
  --yvo-gece: #14264E; --yvo-gece2: #1E3566; --yvo-ay: #F6E7B2;
}
@media (prefers-color-scheme: dark) { :root:not([data-mod='acik']) .yv-sahne {
  --yvo-duvar: #1F3362; --yvo-duvar2: #182950; --yvo-zemin: #2B3B68; --yvo-zemin2: #394B7D;
  --yvo-esya: #34497C; --yvo-esya2: #6D8BC4; --yvo-cam: #8FAAD8; --yvo-cam2: #6C88BE; --yvo-sicak: #F0BE7C;
} }
:root[data-mod='koyu'] .yv-sahne {
  --yvo-duvar: #1F3362; --yvo-duvar2: #182950; --yvo-zemin: #2B3B68; --yvo-zemin2: #394B7D;
  --yvo-esya: #34497C; --yvo-esya2: #6D8BC4; --yvo-cam: #8FAAD8; --yvo-cam2: #6C88BE; --yvo-sicak: #F0BE7C;
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
