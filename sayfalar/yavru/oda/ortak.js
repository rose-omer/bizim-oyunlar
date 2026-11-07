// Yavrumuz oda çizimleri: ortak çerçeve ve renk jetonları (saf metin, DOM yok).
// Tüm odalar viewBox 0 0 390 480, "xMidYMax slice": sahne boyu değişince alt kenar sabit, üst ve yanlar kırpılır.
// Üst 76 birim başlık alanı (ad, geri, jeton): boş kalsın. Zemin çizgisi y 372. Bebeğin oturduğu yer ortada, y ≈ 430.
// Bebek x 90..300 arasını örter; eşyalar kenarlarda (x < 90, x > 300) ve duvarın üstünde durur.
// Renkler yalnız jetonlardan (iki tema aynı çizim). Odaya özel ek stil: oda dosyasının CSS'i.
// Pamuk Şeker: oda oyuncak diorama; yan duvarlı kutu, öne doğru açılan zemin, ön kenar. Eşyalar #yvo-hamur süzgeciyle şişkin.

export const sar = (oda, ic) => `<svg class="yvo-svg" data-oda="${oda}" viewBox="0 0 390 480" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">${ic}</svg>`;

// Şişkin hamur: üst-sol kenarda ışık, alt-sağ kenarda iç gölge, altında yumuşak dış gölge. Renkler CSS'ten (flood-color).
const SUZGEC = '<filter id="yvo-hamur" x="-25%" y="-40%" width="150%" height="200%" color-interpolation-filters="sRGB">'
  + '<feGaussianBlur in="SourceAlpha" stdDeviation="2.6" result="b"/>'
  + '<feOffset in="b" dx="2.4" dy="3" result="o1"/><feComposite in="SourceAlpha" in2="o1" operator="out" result="ust"/>'
  + '<feFlood class="yvo-f-isik" flood-opacity="0.8"/><feComposite in2="ust" operator="in" result="isik"/>'
  + '<feOffset in="b" dx="-2.4" dy="-3" result="o2"/><feComposite in="SourceAlpha" in2="o2" operator="out" result="alt"/>'
  + '<feFlood class="yvo-f-golge" flood-opacity="0.36"/><feComposite in2="alt" operator="in" result="golge"/>'
  + '<feGaussianBlur in="SourceAlpha" stdDeviation="3"/><feOffset dy="5" result="d"/>'
  + '<feFlood class="yvo-f-golge" flood-opacity="0.3"/><feComposite in2="d" operator="in" result="dus"/>'
  + '<feMerge><feMergeNode in="dus"/><feMergeNode in="SourceGraphic"/><feMergeNode in="golge"/><feMergeNode in="isik"/></feMerge>'
  + '</filter>'
  + '<pattern id="yvo-benek-desen" width="44" height="44" patternUnits="userSpaceOnUse"><circle class="yvo-duvar2" cx="11" cy="11" r="5"/><circle class="yvo-duvar2" cx="33" cy="33" r="5"/></pattern>';

/** Diorama kutusu: yan duvarlar, benekli arka duvar, öne açılan zemin, süpürgelik, ön kenar. */
export const TABAN = `<defs>${SUZGEC}</defs>`
  + '<rect class="yvo-duvar2" width="390" height="480"/>'
  + '<rect class="yvo-duvar" x="20" y="-20" width="350" height="392"/>'
  + '<rect class="yvo-benek" fill="url(#yvo-benek-desen)" x="20" y="-20" width="350" height="392"/>'
  + '<path class="yvo-zemin" d="M20 372H370L430 480H-40Z"/>'
  + '<path class="yvo-zemin-cizgi" d="M-8 404H398M-28 440H418M104 372L78 480M195 372V480M286 372L312 480"/>'
  + '<rect class="yvo-supurgelik" x="14" y="354" width="362" height="20" rx="10"/>'
  + '<rect class="yvo-onkenar" x="-20" y="462" width="430" height="30" rx="14"/>';

// Oda başına şeker renkleri: açık ve koyu (mürdüm gecesinde koyu hamur).
const ODA_RENK = {
  mutfak: ['#FFF0B8', '#FFE28F', '#BDEBD4', '#9FDDBF', '#FFC7DC', '#F796BB'],
  banyo: ['#C9F2E6', '#A5E5D3', '#BFDDFB', '#9CC8F5', '#D9CCFB', '#B8A6F2'],
  tuvalet: ['#E6D8FF', '#D2BFFA', '#FFD6E6', '#FFBAD4', '#FFF0B8', '#F5CF6E'],
  yatak: ['#D9D2FF', '#C3B8FA', '#FFDCC4', '#FFC6A3', '#FFC7DC', '#F796BB'],
  oyun: ['#FFD3E6', '#FFBCD8', '#FFF0B0', '#FFE27F', '#CBB8FA', '#A78BF0'],
};
const ODA_RENK_KOYU = {
  mutfak: ['#54394A', '#45303F', '#2F4F48', '#27423C', '#73406A', '#935282'],
  banyo: ['#2F4B52', '#274048', '#37426F', '#2E385F', '#54467A', '#6B5B95'],
  tuvalet: ['#46356A', '#3A2B59', '#5C2F52', '#4D2745', '#6B5A3A', '#85713F'],
  yatak: ['#3D3672', '#322C60', '#5A3E46', '#4C333A', '#73406A', '#935282'],
  oyun: ['#5E2F5A', '#4F274C', '#5A5030', '#4A4128', '#4C3E7C', '#62509D'],
};
const jeton = ([d, d2, z, z2, e, e2]) => `--yvo-duvar: ${d}; --yvo-duvar2: ${d2}; --yvo-zemin: ${z}; --yvo-zemin2: ${z2}; --yvo-esya: ${e}; --yvo-esya2: ${e2};`;
const acikKurallar = Object.entries(ODA_RENK).map(([oda, r]) => `.yv-sahne[data-oda='${oda}'], .yvo-svg[data-oda='${oda}'] { ${jeton(r)} }`).join('\n');
const koyuKurallar = (on) => Object.entries(ODA_RENK_KOYU).map(([oda, r]) => `${on} .yv-sahne[data-oda='${oda}'], ${on} .yvo-svg[data-oda='${oda}'] { ${jeton(r)} }`).join('\n');
const KOYU_ORTAK = '--yvo-cam: #7E9CD0; --yvo-cam2: #5F7BB0; --yvo-sicak: #FFC67E; --yvo-cerceve: #8A6C96; --yvo-isik: #E9B9E0; --yvo-golge: #0E0214;';

export const ORTAK_CSS = `
.yv-sahne {
  --yvo-duvar: #FFE3EE; --yvo-duvar2: #FFD0E2; --yvo-zemin: #FFE9A8; --yvo-zemin2: #FFDB82;
  --yvo-esya: #FFC7DC; --yvo-esya2: #F796BB; --yvo-cam: #CFE9FF; --yvo-cam2: #A9D4F7; --yvo-sicak: #FFC46B;
  --yvo-cerceve: #FFFBFE; --yvo-isik: #FFFFFF; --yvo-golge: #6B2A7A;
  --yvo-gece: #2E1A4E; --yvo-gece2: #3D2763; --yvo-ay: #FFE9A6;
}
${acikKurallar}
@media (prefers-color-scheme: dark) { :root:not([data-mod='acik']) .yv-sahne { ${KOYU_ORTAK} } }
:root[data-mod='koyu'] .yv-sahne { ${KOYU_ORTAK} }
@media (prefers-color-scheme: dark) {
${koyuKurallar(":root:not([data-mod='acik'])")}
}
${koyuKurallar(":root[data-mod='koyu']")}
.yvo-svg { display: block; width: 100%; height: 100%; }
.yvo-f-isik { flood-color: var(--yvo-isik); }
.yvo-f-golge { flood-color: var(--yvo-golge); }
.yvo-duvar { fill: var(--yvo-duvar); }
.yvo-duvar2 { fill: var(--yvo-duvar2); }
.yvo-benek { opacity: 0.55; }
.yvo-zemin { fill: var(--yvo-zemin); }
.yvo-zemin2 { fill: var(--yvo-zemin2); }
.yvo-zemin-cizgi { fill: none; stroke: var(--yvo-zemin2); stroke-width: 3; stroke-linecap: round; opacity: 0.75; }
.yvo-supurgelik { fill: var(--yvo-cerceve); filter: url(#yvo-hamur); }
.yvo-onkenar { fill: var(--yvo-zemin2); filter: url(#yvo-hamur); }
.yvo-esya { fill: var(--yvo-esya); filter: url(#yvo-hamur); }
.yvo-esya2 { fill: var(--yvo-esya2); filter: url(#yvo-hamur); }
.yvo-cam { fill: var(--yvo-cam); stroke: var(--yvo-cerceve); stroke-width: 7; stroke-linejoin: round; filter: url(#yvo-hamur); }
.yvo-cam2 { fill: var(--yvo-cam2); }
.yvo-sicak { fill: var(--yvo-sicak); }
.yvo-ay { fill: var(--yvo-ay); }
.yvo-puf { filter: url(#yvo-hamur); }
.yvo-r1 { fill: var(--yv-r1); filter: url(#yvo-hamur); }
.yvo-r2 { fill: var(--yv-r2); filter: url(#yvo-hamur); }
.yvo-r3 { fill: var(--yv-r3); filter: url(#yvo-hamur); }
.yvo-r4 { fill: var(--yv-r4); filter: url(#yvo-hamur); }
.yvo-r5 { fill: var(--yv-r5); filter: url(#yvo-hamur); }
.yvo-r6 { fill: var(--yv-r6); filter: url(#yvo-hamur); }
.yvo-cizgi { fill: none; stroke: var(--yvo-esya2); stroke-width: 5; stroke-linecap: round; stroke-linejoin: round; }
.yvo-cizgi-duvar { fill: none; stroke: var(--yvo-cerceve); stroke-width: 6; stroke-linecap: round; }
`;
