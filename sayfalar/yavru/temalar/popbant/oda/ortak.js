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
  --yvo-duvar: var(--tint-4); --yvo-zemin: var(--surface); --yvo-zemin2: var(--tint-1);
  --yvo-duvar2: color-mix(in srgb, var(--line) 22%, var(--yvo-duvar));
  --yvo-esya: var(--surface); --yvo-esya2: var(--accent);
  --yvo-cam: #BFE3FF; --yvo-cam2: #7FC1FF; --yvo-sicak: #FFE94A;
  --yvo-gece: #0F1F99; --yvo-gece2: #1F3BFF; --yvo-ay: #FFE94A;
}
.yv-sahne[data-oda='banyo'] { --yvo-duvar: var(--tint-5); --yvo-zemin: var(--tint-6); --yvo-zemin2: var(--tint-2); }
.yv-sahne[data-oda='tuvalet'] { --yvo-duvar: var(--tint-1); --yvo-zemin: var(--tint-5); --yvo-zemin2: var(--tint-4); }
.yv-sahne[data-oda='yatak'] { --yvo-duvar: var(--tint-2); --yvo-zemin: var(--tint-1); --yvo-zemin2: var(--tint-6); }
.yv-sahne[data-oda='oyun'] { --yvo-duvar: var(--tint-3); --yvo-zemin: var(--tint-4); --yvo-zemin2: var(--tint-5); }
.yvo-svg { display: block; width: 100%; height: 100%; }
.yvo-duvar { fill: var(--yvo-duvar); }
.yvo-duvar2 { fill: var(--yvo-duvar2); }
.yvo-zemin { fill: var(--yvo-zemin); }
.yvo-zemin2 { fill: var(--yvo-zemin2); stroke: var(--line); stroke-width: 3; }
.yvo-supurgelik { fill: var(--line); }
.yvo-esya { fill: var(--yvo-esya); stroke: var(--line); stroke-width: 3; stroke-linejoin: round; }
.yvo-esya2 { fill: var(--yvo-esya2); stroke: var(--line); stroke-width: 3; stroke-linejoin: round; }
.yvo-cam { fill: var(--yvo-cam); stroke: var(--line); stroke-width: 3; stroke-linejoin: round; }
.yvo-cam2 { fill: var(--yvo-cam2); stroke: var(--line); stroke-width: 3; }
.yvo-sicak { fill: var(--yvo-sicak); }
.yvo-ay { fill: var(--yvo-ay); }
.yvo-cizgi { fill: none; stroke: var(--line); stroke-width: 3.5; stroke-linecap: square; stroke-linejoin: miter; }
.yvo-cizgi-duvar { fill: none; stroke: var(--line); stroke-width: 3; }
`;
