// Yavrumuz oda çizimleri: ortak çerçeve ve renk jetonları (saf metin, DOM yok).
// Tüm odalar viewBox 0 0 390 480, "xMidYMax slice": sahne boyu değişince alt kenar sabit, üst ve yanlar kırpılır.
// Üst 76 birim başlık alanı (ad, geri, jeton): boş kalsın. Zemin çizgisi y 372. Bebeğin oturduğu yer ortada, y ≈ 430.
// Bebek x 90..300 arasını örter; eşyalar kenarlarda (x < 90, x > 300) ve duvarın üstünde durur.
// Renkler yalnız jetonlardan (iki tema aynı çizim). Odaya özel ek stil: oda dosyasının CSS'i.

export const sar = (oda, ic) => `<svg class="yvo-svg" data-oda="${oda}" viewBox="0 0 390 480" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">${ic}</svg>`;

/** Duvar ve zemin. */
export const TABAN = '<rect class="yvo-duvar" width="390" height="480"/><rect class="yvo-zemin" y="372" width="390" height="108"/><rect class="yvo-supurgelik" y="370" width="390" height="4"/>';

// Yeşilçam Afişi: her oda ayrı renkli afiş paneli. --yvo-gunes bebeğin arkasındaki güneş.
const KOYU_ODALAR = (on) => `
${on}.yv-sahne {
  --yvo-duvar: #33284A; --yvo-duvar2: #2A2140; --yvo-zemin: #4A2A2C; --yvo-zemin2: #5C3333;
  --yvo-esya: #5B4A6C; --yvo-esya2: #E3AC3C; --yvo-cam: #6F9DA6; --yvo-cam2: #4F7F88; --yvo-sicak: #E8AE3A; --yvo-gunes: #A97A22;
}
${on}.yv-sahne[data-oda='mutfak'] { --yvo-duvar: #4E3A18; --yvo-duvar2: #40300F; --yvo-zemin: #5C2220; --yvo-zemin2: #6E2A26; --yvo-esya: #6E5A36; --yvo-gunes: #8F2C1E; }
${on}.yv-sahne[data-oda='banyo'] { --yvo-duvar: #0F4650; --yvo-duvar2: #0B3841; --yvo-zemin: #2B3A4A; --yvo-zemin2: #36485A; --yvo-esya: #3F6570; --yvo-gunes: #A97A22; }
${on}.yv-sahne[data-oda='tuvalet'] { --yvo-duvar: #2C2A4C; --yvo-duvar2: #5C2220; --yvo-zemin: #0F4650; --yvo-zemin2: #0B3841; --yvo-esya: #6E5A36; --yvo-gunes: #8F2C1E; }
${on}.yv-sahne[data-oda='yatak'] { --yvo-duvar: #1C2148; --yvo-duvar2: #161A3C; --yvo-zemin: #5C2220; --yvo-zemin2: #6E2A26; --yvo-esya: #6E5A36; --yvo-gunes: #A98A4A; }
${on}.yv-sahne[data-oda='oyun'] { --yvo-duvar: #5C2220; --yvo-duvar2: #4C1B1A; --yvo-zemin: #54401A; --yvo-zemin2: #66501F; --yvo-esya: #6E5A36; --yvo-gunes: #A97A22; }
`;

export const ORTAK_CSS = `
.yv-sahne {
  --yvo-duvar: #EFB02A; --yvo-duvar2: #D9951A; --yvo-zemin: #C2201D; --yvo-zemin2: #9E1613;
  --yvo-esya: #FFF1CC; --yvo-esya2: #0A6F74; --yvo-cam: #BFE6DF; --yvo-cam2: #7FC9C2; --yvo-sicak: #F5C53C;
  --yvo-gece: #141838; --yvo-gece2: #1F2550; --yvo-ay: #F5D27A; --yvo-gunes: #D8402A;
}
.yv-sahne[data-oda='banyo'] { --yvo-duvar: #1C9AA0; --yvo-duvar2: #157F85; --yvo-zemin: #F6E3B4; --yvo-zemin2: #E0C27E; --yvo-esya2: #B91C1A; --yvo-cam: #D8F0EA; --yvo-gunes: #F5C53C; }
.yv-sahne[data-oda='tuvalet'] { --yvo-duvar: #F6E3B4; --yvo-duvar2: #C2201D; --yvo-zemin: #0F8388; --yvo-zemin2: #0A6F74; --yvo-esya: #EFB02A; --yvo-esya2: #211B33; --yvo-gunes: #1C9AA0; }
.yv-sahne[data-oda='yatak'] { --yvo-duvar: #24305E; --yvo-duvar2: #1A2450; --yvo-zemin: #B91C1A; --yvo-zemin2: #8E1512; --yvo-esya: #EFB02A; --yvo-esya2: #F6E3B4; --yvo-gunes: #E8C25C; }
.yv-sahne[data-oda='oyun'] { --yvo-duvar: #D8402A; --yvo-duvar2: #B8301E; --yvo-zemin: #EFB02A; --yvo-zemin2: #D9951A; --yvo-gunes: #F5C53C; }
@media (prefers-color-scheme: dark) { ${KOYU_ODALAR(":root:not([data-mod='acik']) ")} }
${KOYU_ODALAR(":root[data-mod='koyu'] ")}
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
