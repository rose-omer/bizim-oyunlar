// Yavrumuz oda çizimleri: ortak çerçeve ve renk jetonları (saf metin, DOM yok).
// Tüm odalar viewBox 0 0 390 480, "xMidYMax slice": sahne boyu değişince alt kenar sabit, üst ve yanlar kırpılır.
// Üst 76 birim başlık alanı (ad, geri, jeton): boş kalsın. Zemin çizgisi y 372. Bebeğin oturduğu yer ortada, y ≈ 430.
// Bebek x 90..300 arasını örter; eşyalar kenarlarda (x < 90, x > 300) ve duvarın üstünde durur.
// Renkler yalnız jetonlardan (iki tema aynı çizim). Odaya özel ek stil: oda dosyasının CSS'i.
// İznik: duvar çini (48 birimlik karo), zemin baklava taş, süpürgelikte kobalt bordür. Oda tonu --yvo-cini1/2 ile değişir.

const DESENLER = '<defs>'
  + '<pattern id="yvo-cini" width="48" height="48" patternUnits="userSpaceOnUse">'
  + '<path class="yvo-cini-derz" d="M.5 0V48M0 .5H48"/>'
  + '<path class="yvo-cini1" d="M24 11c4.4 4.2 4.4 8.8 0 13-4.4-4.2-4.4-8.8 0-13ZM24 37c4.4-4.2 4.4-8.8 0-13-4.4 4.2-4.4 8.8 0 13ZM11 24c4.2-4.4 8.8-4.4 13 0-4.2 4.4-8.8 4.4-13 0ZM37 24c-4.2-4.4-8.8-4.4-13 0 4.2 4.4 8.8 4.4 13 0Z"/>'
  + '<circle class="yvo-cini3" cx="24" cy="24" r="2.4"/>'
  + '<path class="yvo-cini2" d="M1 1h6a6 6 0 0 1-6 6ZM48 1v6a6 6 0 0 1-6-6ZM1 48v-6a6 6 0 0 1 6 6ZM48 48h-6a6 6 0 0 1 6-6Z"/>'
  + '</pattern>'
  + '<pattern id="yvo-yer" width="52" height="30" patternUnits="userSpaceOnUse">'
  + '<path class="yvo-yer-cizgi" d="M0 15 26 0 52 15 26 30Z"/>'
  + '</pattern>'
  + '<pattern id="yvo-bordur" x="-1" y="352" width="40" height="18" patternUnits="userSpaceOnUse">'
  + '<path class="yvo-bordur-ak" d="M20 3 29 9 20 15 11 9Z"/><circle class="yvo-bordur-nokta" cx="20" cy="9" r="2"/>'
  + '<path class="yvo-bordur-cizgi" d="M0 9H9M31 9H40"/>'
  + '</pattern>'
  + '</defs>';

export const sar = (oda, ic) => `<svg class="yvo-svg" data-oda="${oda}" viewBox="0 0 390 480" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">${DESENLER}${ic}</svg>`;

/** Duvar ve zemin. */
export const TABAN = '<rect class="yvo-duvar" width="390" height="480"/><rect fill="url(#yvo-cini)" width="390" height="372"/>'
  + '<rect class="yvo-zemin" y="372" width="390" height="108"/><rect fill="url(#yvo-yer)" y="372" width="390" height="108"/>'
  + '<rect class="yvo-bordur" y="352" width="390" height="18"/><rect fill="url(#yvo-bordur)" y="352" width="390" height="18"/>'
  + '<rect class="yvo-supurgelik" y="370" width="390" height="4"/>';

export const ORTAK_CSS = `
.yv-sahne {
  --yvo-duvar: #F8FBFD; --yvo-duvar2: #DCE9F5; --yvo-zemin: #DDE8F3; --yvo-zemin2: #BBD0E7;
  --yvo-esya: #D3E2F3; --yvo-esya2: #2A4FA3; --yvo-cam: #BFE7EA; --yvo-cam2: #86CDD4; --yvo-sicak: #EFC26A;
  --yvo-gece: #0E1E42; --yvo-gece2: #16305F; --yvo-ay: #F4E6B0;
  --yvo-cini1: #D3E0F2; --yvo-cini2: #C2E8E9; --yvo-cini3: #EFBFB3; --yvo-derz: #E8EFF7;
  --yvo-yer: #C9D9EA; --yvo-bant: #1C3F94; --yvo-bant-ak: #FFFFFF; --yvo-bant-nokta: #C2331F; --yvo-bant-cizgi: #57C7CF;
}
@media (prefers-color-scheme: dark) { :root:not([data-mod='acik']) .yv-sahne {
  --yvo-duvar: #12244C; --yvo-duvar2: #0E1D40; --yvo-zemin: #1A2F5E; --yvo-zemin2: #27427A;
  --yvo-esya: #24417C; --yvo-esya2: #63D3D3; --yvo-cam: #2E7B8F; --yvo-cam2: #3F9BAE; --yvo-sicak: #F0BE7C;
  --yvo-cini1: #1F3B75; --yvo-cini2: #1A5569; --yvo-cini3: #4A8FA0; --yvo-derz: #172C5A;
  --yvo-yer: #22396E; --yvo-bant: #1F7F96; --yvo-bant-ak: #F4FAFD; --yvo-bant-nokta: #0F2148; --yvo-bant-cizgi: #7FE3E0;
} }
:root[data-mod='koyu'] .yv-sahne {
  --yvo-duvar: #12244C; --yvo-duvar2: #0E1D40; --yvo-zemin: #1A2F5E; --yvo-zemin2: #27427A;
  --yvo-esya: #24417C; --yvo-esya2: #63D3D3; --yvo-cam: #2E7B8F; --yvo-cam2: #3F9BAE; --yvo-sicak: #F0BE7C;
  --yvo-cini1: #1F3B75; --yvo-cini2: #1A5569; --yvo-cini3: #4A8FA0; --yvo-derz: #172C5A;
  --yvo-yer: #22396E; --yvo-bant: #1F7F96; --yvo-bant-ak: #F4FAFD; --yvo-bant-nokta: #0F2148; --yvo-bant-cizgi: #7FE3E0;
}
.yvo-svg { display: block; width: 100%; height: 100%; }
.yvo-duvar { fill: var(--yvo-duvar); }
.yvo-duvar2 { fill: var(--yvo-duvar2); }
.yvo-zemin { fill: var(--yvo-zemin); }
.yvo-zemin2 { fill: var(--yvo-zemin2); }
.yvo-supurgelik { fill: var(--yvo-bant); }
.yvo-esya { fill: var(--yvo-esya); }
.yvo-esya2 { fill: var(--yvo-esya2); }
.yvo-cam { fill: var(--yvo-cam); }
.yvo-cam2 { fill: var(--yvo-cam2); }
.yvo-sicak { fill: var(--yvo-sicak); }
.yvo-ay { fill: var(--yvo-ay); }
.yvo-cizgi { fill: none; stroke: var(--yvo-esya2); stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
.yvo-cizgi-duvar { fill: none; stroke: var(--yvo-duvar); stroke-width: 4; }
.yvo-cini1 { fill: var(--yvo-cini1); }
.yvo-cini2 { fill: var(--yvo-cini2); }
.yvo-cini3 { fill: var(--yvo-cini3); }
.yvo-cini-derz { fill: none; stroke: var(--yvo-derz); stroke-width: 1; }
.yvo-yer-cizgi { fill: none; stroke: var(--yvo-yer); stroke-width: 1.2; }
.yvo-bordur { fill: var(--yvo-bant); }
.yvo-bordur-ak { fill: var(--yvo-bant-ak); }
.yvo-bordur-nokta { fill: var(--yvo-bant-nokta); }
.yvo-bordur-cizgi { fill: none; stroke: var(--yvo-bant-cizgi); stroke-width: 1.4; }
/* Oda tonu: mutfak kobalt, banyo turkuaz, tuvalet yeşil, yatak mor, oyun mercan */
.yvo-svg[data-oda='banyo'] { --yvo-cini1: #BEE7E8; --yvo-cini2: #D3E0F2; }
.yvo-svg[data-oda='tuvalet'] { --yvo-cini1: #CCE9DB; --yvo-cini2: #C2E8E9; }
.yvo-svg[data-oda='yatak'] { --yvo-cini1: #DDD7F0; --yvo-cini2: #D3E0F2; }
.yvo-svg[data-oda='oyun'] { --yvo-cini1: #F5D6CA; --yvo-cini2: #D3E0F2; --yvo-cini3: #7E9FD6; }
@media (prefers-color-scheme: dark) { :root:not([data-mod='acik']) .yvo-svg[data-oda] {
  --yvo-cini1: #1F3B75; --yvo-cini2: #1A5569; --yvo-cini3: #4A8FA0;
} }
:root[data-mod='koyu'] .yvo-svg[data-oda] { --yvo-cini1: #1F3B75; --yvo-cini2: #1A5569; --yvo-cini3: #4A8FA0; }
`;
