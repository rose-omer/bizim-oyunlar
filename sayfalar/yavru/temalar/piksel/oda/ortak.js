// Yavrumuz oda çizimleri: ortak çerçeve ve renk jetonları (saf metin, DOM yok).
// Tüm odalar viewBox 0 0 390 480, "xMidYMax slice": sahne boyu değişince alt kenar sabit, üst ve yanlar kırpılır.
// Üst 76 birim başlık alanı (ad, geri, jeton): boş kalsın. Zemin çizgisi y 372. Bebeğin oturduğu yer ortada, y ≈ 430.
// Bebek x 90..300 arasını örter; eşyalar kenarlarda (x < 90, x > 300) ve duvarın üstünde durur.
// Renkler yalnız jetonlardan (iki tema aynı çizim). Odaya özel ek stil: oda dosyasının CSS'i.

// Piksel Aşk: oda çizimi süzgeçle 6 birimlik bloklara iner; bebek çizimi ayrı katmanda, etkilenmez.
export const sar = (oda, ic) => `<svg class="yvo-svg" data-oda="${oda}" viewBox="0 0 390 480" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false"><defs><filter id="yvo-px-${oda}" filterUnits="userSpaceOnUse" x="0" y="0" width="390" height="480" color-interpolation-filters="sRGB"><feFlood x="2" y="2" width="2" height="2"/><feComposite width="6" height="6"/><feTile result="a"/><feComposite in="SourceGraphic" in2="a" operator="in"/><feMorphology operator="dilate" radius="2"/></filter></defs><g filter="url(#yvo-px-${oda})">${ic}</g></svg>`;

/** Duvar ve zemin. */
export const TABAN = '<rect class="yvo-duvar" width="390" height="480"/><rect class="yvo-zemin" y="372" width="390" height="108"/><rect class="yvo-supurgelik" y="370" width="390" height="4"/>';

export const ORTAK_CSS = `
.yv-sahne {
  --yvo-duvar: #EBE8D2; --yvo-duvar2: #CBC8A8; --yvo-zemin: #CBC8A8; --yvo-zemin2: #8A8769;
  --yvo-esya: #8A8769; --yvo-esya2: #514D5C; --yvo-cam: #B9CBDD; --yvo-cam2: #C2DDBE; --yvo-sicak: #D9CF8B;
  --yvo-gece: #2A2638; --yvo-gece2: #514D5C; --yvo-ay: #D9CF8B;
}
@media (prefers-color-scheme: dark) { :root:not([data-mod='acik']) .yv-sahne {
  --yvo-duvar: #2B2260; --yvo-duvar2: #3C3180; --yvo-zemin: #3C3180; --yvo-zemin2: #6A5BB8;
  --yvo-esya: #6A5BB8; --yvo-esya2: #C9C0F2; --yvo-cam: #24508F; --yvo-cam2: #1E5A5C; --yvo-sicak: #FFD45E;
} }
:root[data-mod='koyu'] .yv-sahne {
  --yvo-duvar: #2B2260; --yvo-duvar2: #3C3180; --yvo-zemin: #3C3180; --yvo-zemin2: #6A5BB8;
  --yvo-esya: #6A5BB8; --yvo-esya2: #C9C0F2; --yvo-cam: #24508F; --yvo-cam2: #1E5A5C; --yvo-sicak: #FFD45E;
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
