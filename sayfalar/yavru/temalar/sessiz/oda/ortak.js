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
  --yvo-duvar: var(--bg);
  --yvo-duvar2: color-mix(in srgb, var(--text) 4%, var(--bg));
  --yvo-zemin: color-mix(in srgb, var(--text) 5%, var(--bg));
  --yvo-zemin2: color-mix(in srgb, var(--text) 9%, var(--bg));
  --yvo-esya: color-mix(in srgb, var(--text) 2%, var(--bg));
  --yvo-esya2: color-mix(in srgb, var(--text) 26%, var(--bg));
  --yvo-cam: color-mix(in srgb, var(--text) 3%, var(--bg));
  --yvo-cam2: color-mix(in srgb, var(--text) 12%, var(--bg));
  --yvo-sicak: color-mix(in srgb, var(--text) 7%, var(--bg));
  --yvo-gece: var(--hero);
  --yvo-gece2: color-mix(in srgb, var(--hero-ink) 10%, var(--hero));
  --yvo-ay: var(--hero-muted);
}
.yvo-svg { display: block; width: 100%; height: 100%; }
.yvo-duvar { fill: var(--yvo-duvar); }
.yvo-duvar2 { fill: var(--yvo-duvar2); }
.yvo-zemin { fill: var(--yvo-zemin); }
.yvo-zemin2 { fill: var(--yvo-zemin2); }
.yvo-supurgelik { fill: var(--yvo-esya2); height: 1px; }
.yvo-esya { fill: var(--yvo-esya); stroke: var(--yvo-esya2); stroke-width: 1; }
.yvo-esya2 { fill: var(--yvo-esya2); }
.yvo-cam { fill: var(--yvo-cam); stroke: var(--yvo-esya2); stroke-width: 1; }
.yvo-cam2 { fill: var(--yvo-cam2); }
.yvo-sicak { fill: var(--yvo-sicak); }
.yvo-ay { fill: var(--yvo-ay); }
.yvo-cizgi { fill: none; stroke: var(--yvo-esya2); stroke-width: 1.2; stroke-linecap: round; stroke-linejoin: round; }
.yvo-cizgi-duvar { fill: none; stroke: var(--yvo-esya2); stroke-width: 1; }
`;
