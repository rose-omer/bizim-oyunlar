// Yavrumuz: oda arka planları ve sahne eşyaları (kodla SVG; dış görsel yok). Saf metin üretir, DOM yok.
// Arka plan viewBox 0 0 560 272, zemin çizgisi y 196 (duvar, zemin, sonra eşyalar); "xMidYMax slice": dar ekranda (≈350 px) yalnız orta x 105..455
// görünür, bu yüzden ana eşyalar bu bantta; bebek ortada (x 182..378) durur. Renkler style.css'teki --yvo-* jetonları
// (oda başına ton, iki tema). Desen id'leri oda başına sabit: sahnede aynı anda tek oda arka planı olur.
// Eşyalar: küvet ön yüzü (bebek viewBox'ı 0 0 200 200, bebeğin üstünde), lazımlık, sabun.

const kat = (sinif, ic) => `<g class="${sinif}">${ic}</g>`;
const DUVAR = '<rect class="yvo-duvar" width="560" height="196"/>';
const ZEMIN = '<rect class="yvo-zemin" y="194" width="560" height="78"/>'
  + '<path class="yvo-zemin-cizgi" d="M0 226 H560 M0 256 H560 M120 196 L60 272 M220 196 L196 272 M340 196 L364 272 M440 196 L500 272"/>'
  + '<rect class="yvo-supurgelik" y="188" width="560" height="8"/>';
const svg = (oda, defs, ic) => `<svg class="yvo-svg" data-oda="${oda}" viewBox="0 0 560 272" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">`
  + (defs ? `<defs>${defs}</defs>` : '') + DUVAR + ZEMIN + ic + '</svg>';
const yildiz = (x, y, r, sinif = 'yvo-vurgu') => {
  const n = [];
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const u = i % 2 ? r * 0.45 : r;
    n.push(`${Math.round((x + Math.cos(a) * u) * 10) / 10} ${Math.round((y + Math.sin(a) * u) * 10) / 10}`);
  }
  return `<path class="${sinif}" d="M${n.join(' L')} Z"/>`;
};
const pencere = (x, y, w, h, cam = 'yvo-cam') => `<rect class="yvo-cerceve" x="${x - 5}" y="${y - 5}" width="${w + 10}" height="${h + 10}" rx="8"/>`
  + `<rect class="${cam}" x="${x}" y="${y}" width="${w}" height="${h}" rx="4"/>`
  + `<path class="yvo-cerceve-cizgi" d="M${x + w / 2} ${y} V${y + h} M${x} ${y + h / 2} H${x + w}"/>`;
const perde = (x, w, y) => {
  // Fırfırlı kısa perde: üstte çubuk, altı yarım daireler
  const n = Math.round(w / 14);
  const p = w / n;
  let d = `M${x} ${y} H${x + w} V${y + 18}`;
  for (let i = n; i > 0; i--) d += ` A${p / 2} ${p / 2} 0 0 1 ${Math.round((x + (i - 1) * p) * 10) / 10} ${y + 18}`;
  return `<path class="yvo-vurgu" d="${d} Z"/><rect class="yvo-esya-koyu" x="${x - 6}" y="${y - 4}" width="${w + 12}" height="5" rx="2.5"/>`;
};

const MUTFAK = svg('mutfak',
  '<pattern id="yvo-karo-mutfak" width="18" height="18" patternUnits="userSpaceOnUse"><rect class="yvo-desen" x="1" y="1" width="16" height="16" rx="2.5"/></pattern>',
  '<rect fill="url(#yvo-karo-mutfak)" y="112" width="560" height="76"/>'
  + kat('yvo-pencere', pencere(112, 28, 60, 56) + perde(112, 60, 24))
  // Raf ve kavanozlar
  + '<rect class="yvo-esya-koyu" x="392" y="74" width="86" height="6" rx="3"/>'
  + '<rect class="yvo-cam" x="400" y="46" width="20" height="28" rx="6"/><rect class="yvo-vurgu" x="398" y="40" width="24" height="8" rx="3"/>'
  + '<rect class="yvo-cam" x="428" y="54" width="16" height="20" rx="5"/><rect class="yvo-vurgu2" x="426" y="49" width="20" height="7" rx="3"/>'
  + '<path class="yvo-esya" d="M452 56 H472 V66 A10 8 0 0 1 452 66 Z"/><path class="yvo-cizgi" d="M472 59 q7 0 7 5 q0 5 -7 5"/>'
  // Asılı kepçe ve tava
  + '<path class="yvo-cizgi" d="M410 92 V122"/><ellipse class="yvo-esya" cx="410" cy="126" rx="7" ry="5"/>'
  + '<path class="yvo-cizgi" d="M444 92 V104"/><circle class="yvo-esya-koyu" cx="444" cy="120" r="15"/><circle class="yvo-esya" cx="444" cy="120" r="11"/>'
  // Tezgâh ve dolap
  + '<rect class="yvo-esya" x="36" y="148" width="136" height="84" rx="5"/>'
  + '<rect class="yvo-tezgah" x="30" y="138" width="148" height="12" rx="4"/>'
  + '<path class="yvo-cizgi" d="M104 156 V226"/><circle class="yvo-esya-koyu" cx="96" cy="176" r="3"/><circle class="yvo-esya-koyu" cx="112" cy="176" r="3"/>'
  + '<path class="yvo-vurgu" d="M136 138 c0 -14 22 -14 22 0 Z"/><rect class="yvo-cam" x="120" y="118" width="12" height="20" rx="4"/>');

const BANYO = svg('banyo',
  '<pattern id="yvo-karo-banyo" width="22" height="22" patternUnits="userSpaceOnUse"><rect class="yvo-desen" x="1" y="1" width="20" height="20" rx="3"/></pattern>',
  '<rect fill="url(#yvo-karo-banyo)" width="560" height="188"/>'
  // Ayna
  + '<ellipse class="yvo-cerceve" cx="140" cy="74" rx="30" ry="38"/><ellipse class="yvo-cam" cx="140" cy="74" rx="23" ry="31"/>'
  + '<path class="yvo-parilti" d="M128 60 q4 -12 14 -14 M126 72 q1 -4 3 -6"/>'
  // Havluluk ve havlu
  + '<rect class="yvo-esya-koyu" x="396" y="60" width="72" height="5" rx="2.5"/>'
  + '<rect class="yvo-vurgu" x="406" y="62" width="48" height="66" rx="5"/><path class="yvo-vurgu2" d="M406 112 H454 M406 118 H454"/>'
  // Raf: şişeler ve ördek
  + '<rect class="yvo-esya-koyu" x="400" y="150" width="70" height="5" rx="2.5"/>'
  + '<rect class="yvo-vurgu2" x="406" y="128" width="13" height="22" rx="4"/><rect class="yvo-esya" x="409" y="122" width="7" height="7" rx="2"/>'
  + '<rect class="yvo-cam" x="424" y="134" width="11" height="16" rx="4"/>'
  + '<path class="yvo-sari" d="M444 150 c0 -10 8 -12 12 -8 c2 -8 12 -8 12 0 c0 4 -3 6 -6 7 c4 0 8 1 8 1 Z"/><circle class="yvo-goz" cx="461" cy="138" r="1.4"/>');

const TUVALET = svg('tuvalet', '',
  // Lambri
  '<rect class="yvo-desen" y="118" width="560" height="70"/>'
  + '<path class="yvo-cizgi yvo-ince" d="M0 118 H560 M40 118 V188 M80 118 V188 M120 118 V188 M160 118 V188 M200 118 V188 M240 118 V188 M280 118 V188 M320 118 V188 M360 118 V188 M400 118 V188 M440 118 V188 M480 118 V188 M520 118 V188"/>'
  + '<rect class="yvo-esya-koyu" y="114" width="560" height="5"/>'
  // Çerçeveli resim (yıldız)
  + '<rect class="yvo-cerceve" x="114" y="34" width="54" height="46" rx="4"/><rect class="yvo-cam" x="120" y="40" width="42" height="34" rx="2"/>'
  + yildiz(141, 57, 11)
  // Yuvarlak küçük pencere
  + kat('yvo-pencere', '<circle class="yvo-cerceve" cx="430" cy="52" r="26"/><circle class="yvo-cam" cx="430" cy="52" r="20"/><path class="yvo-cerceve-cizgi" d="M430 32 V72 M410 52 H450"/>')
  // Tuvalet kâğıdı
  + '<rect class="yvo-esya-koyu" x="410" y="132" width="34" height="5" rx="2.5"/><circle class="yvo-kagit" cx="427" cy="146" r="11"/><circle class="yvo-esya" cx="427" cy="146" r="3.5"/>'
  + '<path class="yvo-kagit" d="M416 146 V170 H427 V146 Z"/>');

const YATAK = svg('yatak', '',
  // Gece penceresi: ay ve yıldızlar
  kat('yvo-pencere', pencere(108, 28, 66, 60, 'yvo-gece-cam')
    + '<path class="yvo-ay" d="M158 40 a12 12 0 1 0 6 22 a9 9 0 1 1 -6 -22 Z"/>'
    + yildiz(124, 44, 3.6, 'yvo-ay') + yildiz(138, 74, 2.6, 'yvo-ay') + yildiz(160, 76, 2.2, 'yvo-ay')
    + perde(108, 66, 24))
  // Duvar yıldızları
  + yildiz(214, 40, 6, 'yvo-desen-koyu') + yildiz(350, 30, 5, 'yvo-desen-koyu') + yildiz(388, 70, 4, 'yvo-desen-koyu')
  // Beşik (bebeğin arkasında)
  + '<rect class="yvo-esya" x="186" y="128" width="188" height="10" rx="5"/>'
  + `<path class="yvo-cubuk" d="${Array.from({ length: 11 }, (_, i) => `M${200 + i * 16} 138 V192`).join(' ')}"/>`
  + '<rect class="yvo-esya-koyu" x="180" y="108" width="12" height="92" rx="5"/><rect class="yvo-esya-koyu" x="368" y="108" width="12" height="92" rx="5"/>'
  + '<circle class="yvo-vurgu" cx="186" cy="106" r="7"/><circle class="yvo-vurgu" cx="374" cy="106" r="7"/>'
  // Komodin ve lamba (ışık: yvo-isik; uyurken söner)
  + '<rect class="yvo-esya" x="404" y="150" width="56" height="44" rx="5"/><path class="yvo-cizgi" d="M404 170 H460"/><circle class="yvo-esya-koyu" cx="432" cy="160" r="2.5"/><circle class="yvo-esya-koyu" cx="432" cy="181" r="2.5"/>'
  + '<circle class="yvo-isik" cx="432" cy="118" r="34"/>'
  + '<rect class="yvo-esya-koyu" x="429" y="122" width="6" height="26" rx="3"/><ellipse class="yvo-esya-koyu" cx="432" cy="149" rx="13" ry="3"/>'
  + '<path class="yvo-abajur" d="M416 124 L422 100 H442 L448 124 Z"/>'
  + '<ellipse class="yvo-hali" cx="280" cy="232" rx="190" ry="22"/>');

const BAYRAK = [1, 2, 3, 4, 5, 6, 1, 2, 3, 4, 5, 6, 1];
const OYUN = svg('oyun', '',
  // Bayrak süsü
  '<path class="yvo-cizgi" d="M40 22 Q280 62 520 22"/>'
  + BAYRAK.map((r, i) => {
    const x = 60 + i * 36;
    const t = (x - 40) / 480;
    const y = 22 + 80 * t * (1 - t); // ipin eğrisi (ikinci derece Bézier; x doğrusal)
    return `<path class="yvo-b${r}" d="M${x - 11} ${y.toFixed(1)} L${x + 11} ${(y + 1).toFixed(1)} L${x} ${(y + 22).toFixed(1)} Z"/>`;
  }).join('')
  // Duvar yıldızları ve bulut
  + yildiz(132, 92, 8, 'yvo-b6') + yildiz(426, 84, 7, 'yvo-b2') + yildiz(462, 122, 5, 'yvo-b1')
  + '<path class="yvo-bulut" d="M112 140 a12 12 0 0 1 20 -10 a14 14 0 0 1 26 4 a10 10 0 0 1 2 20 H116 a10 10 0 0 1 -4 -14 Z"/>'
  // Halı
  + '<ellipse class="yvo-hali" cx="280" cy="232" rx="210" ry="26"/><ellipse class="yvo-hali-ic" cx="280" cy="232" rx="170" ry="17"/>'
  // Küpler (sol) ve top (sağ)
  + '<rect class="yvo-b5" x="112" y="186" width="30" height="30" rx="5"/><text class="yvo-harf" x="127" y="208">A</text>'
  + '<rect class="yvo-b1" x="144" y="196" width="22" height="22" rx="4"/><text class="yvo-harf kucuk" x="155" y="212">B</text>'
  + '<rect class="yvo-b4" x="122" y="160" width="24" height="24" rx="4" transform="rotate(-8 134 172)"/><text class="yvo-harf kucuk" x="134" y="177" transform="rotate(-8 134 172)">C</text>'
  + '<circle class="yvo-b3" cx="420" cy="214" r="20"/><path class="yvo-top-serit" d="M402 206 Q420 216 438 206 M404 224 Q420 214 436 224"/>'
  + '<circle class="yvo-parilti-dolgu" cx="412" cy="204" r="4"/>');

const SVGLER = { mutfak: MUTFAK, banyo: BANYO, tuvalet: TUVALET, yatak: YATAK, oyun: OYUN };

/** Oda arka planı (SVG metni). Bilinmeyen oda: ''. */
export function odaSvg(oda) {
  return Object.hasOwn(SVGLER, oda) ? SVGLER[oda] : '';
}

/** Küvetin ön yüzü: bebek viewBox'ında (0 0 200 200), bebeğin üstünde; alt yarıyı örter. Kenarda köpük. */
export const KUVET_SVG = '<svg class="yvo-kuvet" viewBox="0 0 200 200" aria-hidden="true" focusable="false">'
  + '<path class="yvo-su" d="M14 150 Q100 140 186 150 V160 H14 Z"/>'
  + '<path class="yvo-kuvet-dis" d="M6 146 H194 V158 C194 184 172 196 142 196 H58 C28 196 6 184 6 158 Z"/>'
  + '<rect class="yvo-kuvet-kenar" x="2" y="142" width="196" height="12" rx="6"/>'
  + '<path class="yvo-kuvet-isik" d="M24 166 C30 180 44 186 60 188"/>'
  + '<path class="yvo-ayak" d="M36 192 l-6 8 h14 l2 -6 Z M164 192 l6 8 h-14 l-2 -6 Z"/>'
  + '<g class="yvo-kopuk-kenar"><circle cx="24" cy="141" r="8"/><circle cx="36" cy="137" r="10"/><circle cx="50" cy="141" r="7"/>'
  + '<circle cx="152" cy="140" r="8"/><circle cx="166" cy="136" r="11"/><circle cx="180" cy="141" r="7"/>'
  // Ortada köpük yığını: küçük bebekte boynu, büyükte göğsü örter (bebek suda)
  + '<circle cx="66" cy="138" r="9"/><circle cx="82" cy="137" r="11"/><circle cx="100" cy="135" r="12"/><circle cx="118" cy="137" r="11"/><circle cx="134" cy="138" r="9"/></g>'
  + '</svg>';

/** Lazımlık (tuvalet odası; sürükleme hedefi). viewBox 0 0 80 80. */
export const LAZIMLIK_SVG = '<svg class="yvo-lazimlik" viewBox="0 0 80 80" aria-hidden="true" focusable="false">'
  + '<ellipse class="yvo-golge" cx="40" cy="74" rx="30" ry="4"/>'
  + '<path class="yvo-lazimlik-sirt" d="M22 40 C20 22 26 10 40 10 C54 10 60 22 58 40 Z"/>'
  + '<path class="yvo-lazimlik-govde" d="M10 40 H70 C70 58 60 72 40 72 C20 72 10 58 10 40 Z"/>'
  + '<ellipse class="yvo-lazimlik-oturak" cx="40" cy="40" rx="31" ry="8"/><ellipse class="yvo-lazimlik-ic" cx="40" cy="40" rx="20" ry="4.5"/>'
  + yildiz(40, 56, 7, 'yvo-lazimlik-yildiz')
  + '</svg>';

/** Sabun kalıbı (banyo; sürüklenir). viewBox 0 0 64 48. */
export const SABUN_SVG = '<svg class="yvo-sabun" viewBox="0 0 64 48" aria-hidden="true" focusable="false">'
  + '<rect class="yvo-sabun-govde" x="6" y="12" width="52" height="30" rx="13"/>'
  + '<path class="yvo-sabun-isik" d="M16 20 Q24 16 34 17"/>'
  + '<circle class="yvo-sabun-kopuk" cx="14" cy="11" r="6"/><circle class="yvo-sabun-kopuk" cx="24" cy="7" r="4.5"/><circle class="yvo-sabun-kopuk" cx="50" cy="12" r="5"/>'
  + '</svg>';
