// Yavrumuz: bebek çizimi (küçük ve büyük aşama). Kodla üretilen katmanlı SVG; dış görsel yok.
// Saf metin üretir; DOM yok (Node'da test edilir). cizim.js yavruSvg yumurta dışındaki aşamalar için bunu çağırır;
// çatlama sahnesi (cizim.js catlamaSvg) küçük bebeği bebekCatlamaParcalari ile alır.
// Katmanlar ayrı <g> ve sınıflı (yvb-*): sonraki işler canlandırır ve kıyafet değiştirir.
// Renkler: kıyafet --yv-govde (= --yv-r1..6, CIZIM_CSS'te tanımlı), ten/saç/göz --yvb-* jetonları (iki temada aynı;
// pastel bebek açık ve koyu zeminde aynı kalır). Dış kontur ten rengiyle var(--hero) karışımı; parıltı var(--hero-ink).
// Gradyan id'leri her SVG'de benzersiz önek alır (aynı sayfada çok SVG olur); `kimlik` verilirse önek odur.

export const BEBEK_ASAMALARI = ['kucuk', 'buyuk'];
// huzur (okşanınca: gözler kapalı, gülümser) ve hapsu (hapşırma) dokunma tepkileri içindir (dokunma.js).
export const BEBEK_RUHLARI = ['normal', 'mutlu', 'ac', 'kirli', 'uykulu', 'uzgun', 'uyuyor', 'aglama', 'kahkaha', 'sasirma', 'huzur', 'hapsu'];
const KISILIKLER = ['obur', 'uykucu', 'neseli', 'titiz'];

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const y1 = (n) => Math.round(n * 10) / 10;
let sayac = 0;

// ---------- Ortak tanımlar (gradyan, desen) ----------

function tanimlar(k) {
  return '<defs>'
    + `<radialGradient id="${k}-ten" cx="0.42" cy="0.34" r="0.72"><stop offset="0" class="yvb-d-ten1"/><stop offset="0.6" class="yvb-d-ten2"/><stop offset="1" class="yvb-d-ten3"/></radialGradient>`
    + `<radialGradient id="${k}-iris" cx="0.5" cy="0.78" r="0.7"><stop offset="0" class="yvb-d-iris1"/><stop offset="0.55" class="yvb-d-iris2"/><stop offset="1" class="yvb-d-iris3"/></radialGradient>`
    + `<radialGradient id="${k}-allik"><stop offset="0" class="yvb-d-allik"/><stop offset="1" class="yvb-d-allik yvb-d-sifir"/></radialGradient>`
    + `<linearGradient id="${k}-sac" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="yvb-d-sac1"/><stop offset="0.55" class="yvb-d-sac2"/><stop offset="1" class="yvb-d-sac3"/></linearGradient>`
    + `<linearGradient id="${k}-kumas" x1="0" y1="0" x2="0.25" y2="1"><stop offset="0" class="yvb-d-kumas1"/><stop offset="0.5" class="yvb-d-kumas2"/><stop offset="1" class="yvb-d-kumas3"/></linearGradient>`
    + `<pattern id="${k}-benek" width="10" height="10" patternUnits="userSpaceOnUse"><circle class="yvb-benek" cx="2.5" cy="2.5" r="1.25"/><circle class="yvb-benek" cx="7.5" cy="7.5" r="1.25"/></pattern>`
    + '</defs>';
}

const ten = (k, sekil) => sekil.replace('/>', ` fill="url(#${k}-ten)"/>`);

// ---------- Yüz (0,0 = gözlerin ortası; gözler ±21, burun y 14, ağız y 27) ----------

// Açık göz: ak, iris, bebek, iki parıltı, üst kapak çizgisi ve kirpikler. s: -1 sol, +1 sağ (dış köşe yönü).
function gozAcik(k, s, { buyukluk = 1, kapak = false } = {}) {
  const cx = 21 * s;
  const rx = 13 * buyukluk;
  const ry = 14.4 * buyukluk;
  const ir = 11.6 * buyukluk;
  const dis = cx + rx * s;
  // Üst kapak: göz akının üst yayı (uçları yanlara kıvrılır); dış köşede iki kirpik, altta bir kısa kirpik.
  const ust = `M${y1(cx - 0.92 * rx * s)} ${y1(-0.4 * ry)} C${y1(cx - 0.6 * rx * s)} ${y1(-1.16 * ry)} ${y1(cx + 0.6 * rx * s)} ${y1(-1.16 * ry)} ${y1(dis + 0.4 * s)} ${y1(-0.32 * ry)}`;
  const kirpik = `M${y1(dis - 0.4 * s)} ${y1(-0.42 * ry)} q${y1(3.4 * s)} -0.6 ${y1(5.4 * s)} -3.8`
    + ` M${y1(dis - 3 * s)} ${y1(-0.78 * ry)} q${y1(3 * s)} -1.4 ${y1(4.2 * s)} -5`
    + ` M${y1(dis - 3.6 * s)} ${y1(0.72 * ry)} q${y1(1.8 * s)} 0.8 ${y1(2.8 * s)} 3`;
  const kapakSekil = kapak
    ? `<path class="yvb-kapak" fill="url(#${k}-ten)" d="M${y1(cx - rx - 1.6)} 0.5 C${y1(cx - rx - 1.6)} ${y1(-ry * 1.5)} ${y1(cx + rx + 1.6)} ${y1(-ry * 1.5)} ${y1(cx + rx + 1.6)} 0.5 Z"/>`
      + `<path class="yvb-kapak-cizgi" d="M${y1(cx - rx - 0.5)} 0.5 Q${cx} 3 ${y1(cx + rx + 0.5)} 0.5"/>`
    : '';
  return `<g class="yvb-goz${kapak ? '' : ' yvb-goz-acik'}">`
    + `<ellipse class="yvb-ak" cx="${cx}" cy="0" rx="${y1(rx)}" ry="${y1(ry)}"/>`
    + `<circle class="yvb-iris" fill="url(#${k}-iris)" cx="${cx}" cy="${y1(1.4 * buyukluk)}" r="${y1(ir)}"/>`
    + `<circle class="yvb-gozbebek" cx="${cx}" cy="${y1(1.8 * buyukluk)}" r="${y1(5.9 * buyukluk)}"/>`
    + `<ellipse class="yvb-parilti" cx="${y1(cx + 4.4 * buyukluk)}" cy="${y1(-4.2 * buyukluk)}" rx="${y1(3.9 * buyukluk)}" ry="${y1(4.4 * buyukluk)}"/>`
    + `<circle class="yvb-parilti" cx="${y1(cx - 4.6 * buyukluk)}" cy="${y1(5.6 * buyukluk)}" r="${y1(1.8 * buyukluk)}"/>`
    + kapakSekil
    + (kapak
      // Ağır kapak: kirpikler kapak çizgisinin dış ucundan aşağı
      ? `<path class="yvb-kirpik ince" d="M${y1(dis)} 0.5 l${y1(2.6 * s)} 2.6 M${y1(dis - 3.4 * s)} 1.6 l${y1(1.6 * s)} 3"/>`
      : `<path class="yvb-kirpik" d="${ust}"/><path class="yvb-kirpik ince" d="${kirpik}"/>`)
    + '</g>';
}
const gozler = (k, o) => gozAcik(k, -1, o) + gozAcik(k, 1, o);

// Kapalı göz biçimleri (çizgi). kapali: aşağı kavis (uyku); hilal: yukarı kavis (gülme); sikik: > <.
function gozCizgi(tur) {
  const tek = (s) => {
    const cx = 21 * s;
    if (tur === 'hilal') return `M${cx - 11} 3 Q${cx} -9 ${cx + 11} 3`;
    if (tur === 'sikik') return `M${cx + 9 * s} -7 L${cx - 8 * s} 0 L${cx + 9 * s} 7`;
    return `M${cx - 11} -1 Q${cx} 8 ${cx + 11} -1 M${cx + 9 * s} 3.5 l${2.6 * s} 3`;
  };
  return `<g class="yvb-goz yvb-goz-kapali"><path class="yvb-kirpik" d="${tek(-1)} ${tek(1)}"/></g>`;
}

const KASLAR = {
  normal: 'M-29 -21 Q-21 -26 -13 -22 M13 -22 Q21 -26 29 -21',
  kalkik: 'M-30 -25 Q-21 -31 -12 -26 M12 -26 Q21 -31 30 -25',
  egik: 'M-29 -19 Q-22 -21 -13 -26 M13 -26 Q22 -21 29 -19',
  sakin: 'M-29 -19 Q-21 -22 -13 -19 M13 -19 Q21 -22 29 -19',
};
const kas = (tur) => `<g class="yvb-kas"><path d="${KASLAR[tur]}"/></g>`;

const AGIZLAR = {
  gulus: '<path class="yvb-dudak" d="M-6.5 25.5 Q0 31 6.5 25.5"/>',
  minik: '<path class="yvb-dudak" d="M-3.5 27 Q0 29 3.5 27"/>',
  acik: '<path class="yvb-agiz-ic" d="M-8.5 24 Q0 25.5 8.5 24 Q7.5 35.5 0 35.5 Q-7.5 35.5 -8.5 24 Z"/><ellipse class="yvb-dil" cx="0" cy="32.4" rx="4.4" ry="2.4"/>',
  kahkaha: '<path class="yvb-agiz-ic" d="M-12 22.5 Q0 25 12 22.5 Q11 40 0 40 Q-11 40 -12 22.5 Z"/><ellipse class="yvb-dil" cx="0" cy="35.6" rx="6" ry="3.2"/>',
  o: '<ellipse class="yvb-agiz-ic" cx="0" cy="28" rx="3.8" ry="4.6"/>',
  esneme: '<ellipse class="yvb-agiz-ic" cx="0" cy="28.5" rx="3" ry="3.6"/>',
  asik: '<path class="yvb-dudak" d="M-6 30 Q0 25 6 30"/>',
  dalga: '<path class="yvb-dudak" d="M-7.5 28 Q-3.8 25 0 28 Q3.8 31 7.5 28"/>',
  aglama: '<path class="yvb-agiz-ic" d="M-11 33 C-11 21 11 21 11 33 Q0 30 -11 33 Z"/><ellipse class="yvb-dil" cx="0" cy="31.2" rx="5" ry="1.8"/>',
};
// Konuşma ağzı (ses taklidi): gizli; ata öğede [data-konusuyor] varken görünür, açıklığı --yvb-konus (0..1).
const agiz = (tur) => `<g class="yvb-agiz">${AGIZLAR[tur]}<ellipse class="yvb-agiz-konus" cx="0" cy="29" rx="7.5" ry="7"/></g>`;

const yanak = (k, guclu) => `<g class="yvb-yanak${guclu ? ' guclu' : ''}">`
  + `<ellipse fill="url(#${k}-allik)" cx="-31" cy="18" rx="11" ry="7.5"/><ellipse fill="url(#${k}-allik)" cx="31" cy="18" rx="11" ry="7.5"/></g>`;
const burun = '<g class="yvb-burun"><ellipse class="yvb-burun-ic" cx="0" cy="14.5" rx="3.6" ry="2.6"/><circle class="yvb-parilti" cx="-1" cy="13.6" r="0.9"/></g>';

const GOZYASI = '<g class="yvb-gozyasi"><path class="yvb-iz" d="M-27 9 Q-30 18 -28 27 M27 9 Q30 18 28 27"/>'
  + '<path class="yvb-damla yvb-dusen" d="M-28 12 Q-31.5 18 -28 20.4 Q-24.5 18 -28 12 Z"/>'
  + '<path class="yvb-damla yvb-dusen ikinci" d="M28 12 Q24.5 18 28 20.4 Q31.5 18 28 12 Z"/></g>';

// ruh → yüz parçaları. emzik: küçük aşamada sakin ruhlarda ağız emziğin altında kalır.
function yuzIc(k, ruh, emzik) {
  const ag = (tur) => agiz(emzik ? 'minik' : tur); // emzik ağzı örter
  switch (ruh) {
    case 'mutlu': return kas('normal') + gozler(k) + yanak(k, true) + burun + agiz('acik');
    case 'kahkaha': return kas('kalkik') + gozCizgi('hilal') + yanak(k, true) + burun + agiz('kahkaha');
    case 'ac': return kas('kalkik') + gozler(k, { buyukluk: 1.05 }) + yanak(k) + burun + agiz('o');
    case 'kirli': return kas('egik') + gozler(k) + yanak(k) + burun + ag('dalga');
    case 'uykulu': return kas('sakin') + gozler(k, { kapak: true }) + yanak(k) + burun + ag('esneme');
    case 'uzgun': return kas('egik') + gozler(k) + yanak(k) + burun + agiz('asik')
      + '<path class="yvb-damla" d="M-28 9 Q-31.5 15 -28 17.4 Q-24.5 15 -28 9 Z"/>';
    case 'uyuyor': return kas('sakin') + gozCizgi('kapali') + yanak(k) + burun + ag('minik');
    case 'aglama': return kas('egik') + gozCizgi('sikik') + yanak(k, true) + burun + agiz('aglama') + GOZYASI;
    case 'sasirma': return kas('kalkik') + gozler(k, { buyukluk: 1.1 }) + yanak(k) + burun + agiz('o');
    case 'huzur': return kas('sakin') + gozCizgi('hilal') + yanak(k, true) + burun + agiz('gulus');
    case 'hapsu': return kas('kalkik') + gozCizgi('sikik') + yanak(k) + burun + agiz('esneme');
    default: return kas('normal') + gozler(k) + yanak(k) + burun + ag('gulus');
  }
}
const yuz = (k, ruh, x, y, s, emzik = false) =>
  `<g class="yvb-yuz" transform="translate(${x} ${y}) scale(${s})">${yuzIc(k, ruh, emzik)}</g>`;

// ---------- İşaretler (cizim.js ile aynı anlam: biberon balonu, leke, z'ler) ----------

function isaret(ruh, x, y, lekeler) {
  if (ruh === 'ac') {
    return `<g class="yvb-isaret yvb-dusunce"><circle cx="${x - 12}" cy="${y + 16}" r="2.6"/><circle cx="${x - 5}" cy="${y + 7}" r="3.8"/>`
      + `<circle cx="${x + 10}" cy="${y - 9}" r="14"/>`
      + `<rect class="yvb-biberon" x="${x + 5.5}" y="${y - 11}" width="9" height="12" rx="3"/>`
      + `<rect class="yvb-biberon-uc" x="${x + 7.5}" y="${y - 16}" width="5" height="5" rx="2"/></g>`;
  }
  if (ruh === 'kirli') {
    return `<g class="yvb-isaret yvb-leke">${lekeler.map(([lx, ly, r]) =>
      `<path d="M${lx - r} ${ly} q${y1(r * 0.3)} -${r} ${r} -${y1(r * 0.8)} q${r} -${y1(r * 0.1)} ${r} ${y1(r * 0.7)} q0 ${r} -${r} ${y1(r * 0.9)} q-${r} 0 -${r} -${y1(r * 0.8)}z"/>`).join('')}</g>`;
  }
  if (ruh === 'uykulu') return `<text class="yvb-isaret yvb-z" x="${x}" y="${y}">z</text>`;
  if (ruh === 'uyuyor') {
    return `<g class="yvb-isaret yvb-zzz"><text class="yvb-z1" x="${x - 6}" y="${y + 10}">z</text>`
      + `<text class="yvb-z2" x="${x + 4}" y="${y - 2}">z</text><text class="yvb-z3" x="${x + 14}" y="${y - 16}">Z</text></g>`;
  }
  return '';
}

// ---------- Ayak: taban izleyiciye dönük, beş parmak üst kenarda ----------
// (x, y) taban merkezi; a: dönüş (derece); ic: başparmak yönü (-1 sol, +1 sağ).
function ayak(k, x, y, a, ic) {
  const parmak = [[-0.64, 3.8], [-0.3, 3.1], [0.02, 2.8], [0.32, 2.5], [0.6, 2.2]].map(([u, r], i) => {
    const px = y1(u * 9.6 * ic);
    const py = y1(-12 + Math.abs(u) * 3.6 + (i === 0 ? -0.8 : 0));
    return `<circle class="yvb-ten" fill="url(#${k}-ten)" cx="${px}" cy="${py}" r="${r}"/>`;
  }).join('');
  return `<g class="yvb-ayak" transform="translate(${x} ${y}) rotate(${a})">`
    + parmak
    + `<path class="yvb-ten" fill="url(#${k}-ten)" d="M0 -11 C7.5 -11 11 -5 10.5 2 C10 10 6 14 0 14 C-6 14 -10 10 -10.5 2 C-11 -5 -7.5 -11 0 -11 Z"/>`
    + '<ellipse class="yvb-taban" cx="0" cy="5" rx="5.5" ry="5"/>'
    + '</g>';
}

// ---------- Giyim (aksesuar katmanı; giyim.js yuvaları) ----------
// Her parça kendi yerel koordinatında çizilir (0,0 = oturma noktası); aşamaya göre yerleşim GIYIM_YER'de.
// Gradyan ve id yok (SVG başına benzersizlik sorunu doğmaz). Yalnız sınıflı düz boya; renkler --yvb-* jetonları.

// Taç: tabanı başın kavsine uyar; beş diş, uçlarda inci, bantta taşlar.
const TAC = '<path class="yvb-g-altin" d="M-24 0 L-27.5 -22 L-15 -11 L0 -28 L15 -11 L27.5 -22 L24 0 Q0 5.5 -24 0 Z"/>'
  + '<path class="yvb-g-altin-koyu" d="M-24.6 -6.2 Q0 -1 24.6 -6.2 L24 0 Q0 5.5 -24 0 Z"/>'
  + '<path class="yvb-g-isik" d="M-21 -9 L-23 -18 M-6 -14 L0 -21"/>'
  + '<circle class="yvb-g-inci" cx="-27.5" cy="-23.5" r="2.8"/><circle class="yvb-g-inci" cx="0" cy="-29.8" r="3.2"/><circle class="yvb-g-inci" cx="27.5" cy="-23.5" r="2.8"/>'
  + '<ellipse class="yvb-g-tas-a" cx="0" cy="-2" rx="3.6" ry="2.8"/><circle class="yvb-g-tas-b" cx="-13" cy="-3.2" r="2.1"/><circle class="yvb-g-tas-b" cx="13" cy="-3.2" r="2.1"/>';

// Silindir şapka (küçük, yana yatık): kenar, gövde, kurdele, kurdelede çiçek.
const SAPKA = '<ellipse class="yvb-g-sapka" cx="0" cy="0" rx="29" ry="6.6"/>'
  + '<path class="yvb-g-sapka" d="M-17 -1.5 L-15.5 -32 Q0 -36.5 15.5 -32 L17 -1.5 Q0 3 -17 -1.5 Z"/>'
  + '<ellipse class="yvb-g-sapka-ust" cx="0" cy="-32.2" rx="15.5" ry="3.6"/>'
  + '<path class="yvb-g-kurdele" d="M-16.6 -9.5 Q0 -6 16.6 -9.5 L17 -2 Q0 2.4 -17 -2 Z"/>'
  + '<path class="yvb-g-isik" d="M-11 -14 L-10.2 -28"/>'
  + '<g transform="translate(10 -6)"><circle class="yvb-g-cicek" cx="0" cy="-3.4" r="2.6"/><circle class="yvb-g-cicek" cx="3.3" cy="-1" r="2.6"/>'
  + '<circle class="yvb-g-cicek" cx="2" cy="2.8" r="2.6"/><circle class="yvb-g-cicek" cx="-2" cy="2.8" r="2.6"/><circle class="yvb-g-cicek" cx="-3.3" cy="-1" r="2.6"/>'
  + '<circle class="yvb-g-tas-a" cx="0" cy="0" r="1.9"/></g>';

// Büyük puantiyeli fiyonk (satın alınan): yuvarlak kanatlar, kısa kuyruk, beyaz benekler.
const FIYONK = '<path class="yvb-g-kurdele" d="M-3 3 C-7 9 -10 14 -13 18 L-7 17 L-4.5 22 C-2.5 15 -0.5 9 0.5 5 Z M3 3 C7 9 10 14 13 18 L7 17 L4.5 22 C2.5 15 0.5 9 -0.5 5 Z"/>'
  + '<path class="yvb-g-kurdele" d="M-3 -1 C-10 -19 -33 -19 -32 -3 C-31 12 -12 12 -3 3 Z"/>'
  + '<path class="yvb-g-kurdele" d="M3 -1 C10 -19 33 -19 32 -3 C31 12 12 12 3 3 Z"/>'
  + '<path class="yvb-g-kat" d="M-8 -2 Q-19 -11 -26 -5 M8 -2 Q19 -11 26 -5 M-8 3 Q-18 8 -25 3 M8 3 Q18 8 25 3"/>'
  + '<circle class="yvb-g-benek" cx="-22" cy="-7" r="2.3"/><circle class="yvb-g-benek" cx="-14" cy="3" r="2"/><circle class="yvb-g-benek" cx="-26" cy="3.5" r="1.7"/>'
  + '<circle class="yvb-g-benek" cx="22" cy="-7" r="2.3"/><circle class="yvb-g-benek" cx="14" cy="3" r="2"/><circle class="yvb-g-benek" cx="26" cy="3.5" r="1.7"/>'
  + '<ellipse class="yvb-g-kurdele yvb-g-dugum" cx="0" cy="1" rx="6.5" ry="7.5"/>'
  + '<ellipse class="yvb-g-isik-dolgu" cx="-20" cy="-9.5" rx="4" ry="1.8" transform="rotate(-18 -20 -9.5)"/>';

// Gözlük (yüz koordinatı: 0,0 gözlerin ortası, gözler ±21): yuvarlak çerçeve, renkli cam (gözler görünür), sap.
const GOZLUK = '<path class="yvb-g-sap" d="M-37.5 -3 L-51 2 M37.5 -3 L51 2"/>'
  + '<circle class="yvb-g-cam" cx="-21" cy="1" r="16.5"/><circle class="yvb-g-cam" cx="21" cy="1" r="16.5"/>'
  + '<path class="yvb-g-cerceve" d="M-4.5 1 A16.5 16.5 0 1 0 -37.5 1 A16.5 16.5 0 1 0 -4.5 1 Z M37.5 1 A16.5 16.5 0 1 0 4.5 1 A16.5 16.5 0 1 0 37.5 1 Z M-4.5 -1.5 Q0 -5.5 4.5 -1.5"/>'
  + '<path class="yvb-g-cam-isik" d="M-31 -6 Q-28 -11.5 -22 -12.5 M11 -6 Q14 -11.5 20 -12.5"/>';

// Atkı (büyük aşama koordinatı): boyna dolanan bant, sağda sarkan uç, çizgiler ve püsküller.
const ATKI = '<path class="yvb-g-atki" d="M115 118 C121 132 124 146 126 158 L111 160 C110 148 108 134 104 122 Z"/>'
  + '<path class="yvb-g-atki-cizgi" d="M108.5 139 L123.6 136.5 M109.8 147.5 L124.9 145"/>'
  + '<path class="yvb-g-puskul" d="M112.5 160 l-1 5 M116.5 159.6 l-0.4 5 M120.5 159.2 l0.2 5 M124.5 158.6 l0.8 5"/>'
  + '<path class="yvb-g-atki" d="M69 109 C82 117 118 117 131 109 C135 112 136 118 134 123 C118 132 82 132 66 123 C64 118 65 112 69 109 Z"/>'
  + '<path class="yvb-g-atki-cizgi" d="M79 116.5 L77.5 128 M121 116.5 L122.5 128"/>'
  + '<path class="yvb-g-atki-kat" d="M72 119 C86 125 114 125 128 119"/>';

const GIYIM_CIZIM = {
  bas: { tac: TAC, sapka: SAPKA, fiyonk: FIYONK },
  goz: { gozluk: GOZLUK },
  boyun: { atki: ATKI },
};
/** Aşama → yuva → ürün → yerleşim (transform). Küçükte (kundak) yalnız baş yuvası: başlığın tepesinde küçük boy. */
const GIYIM_YER = {
  buyuk: {
    bas: { tac: 'translate(102 31) rotate(6) scale(0.92)', sapka: 'translate(113 33) rotate(13) scale(0.8)', fiyonk: 'translate(100 25) scale(1.08)' },
    goz: { gozluk: 'translate(100 75)' },
    boyun: { atki: '' },
  },
  kucuk: {
    bas: { tac: 'translate(100 54) rotate(3) scale(0.6)', sapka: 'translate(102 55) rotate(8) scale(0.56)', fiyonk: 'translate(100 52) scale(0.62)' },
  },
};
const GIYIM_BOS = Object.freeze({ bas: null, goz: null, boyun: null });

/** Bilinmeyen yuva ya da değer yok sayılır. -> { bas, goz, boyun } */
function giyimGecerli(g) {
  const o = g && typeof g === 'object' ? g : {};
  const sonuc = {};
  for (const yuva of Object.keys(GIYIM_BOS)) {
    const id = o[yuva];
    sonuc[yuva] = typeof id === 'string' && Object.hasOwn(GIYIM_CIZIM[yuva], id) ? id : null;
  }
  return sonuc;
}

function giyimKatmani(giyim, yuva, asama) {
  const id = giyim[yuva];
  const yer = id && GIYIM_YER[asama][yuva]?.[id];
  if (yer == null) return '';
  return `<g class="yvb-giyim yvb-giyim-${yuva}" data-urun="${id}"${yer ? ` transform="${yer}"` : ''}>${GIYIM_CIZIM[yuva][id]}</g>`;
}

// Mağaza kartı için yalnız parça (yerel koordinatta, kırpılmış görünüm kutusu).
const PARCA_KUTU = { tac: '-34 -38 68 48', sapka: '-36 -42 72 54', fiyonk: '-36 -22 72 48', gozluk: '-54 -20 108 40', atki: '58 100 84 70' };

/**
 * Tek aksesuarın SVG'si (mağaza kartı önizlemesi). urun: giyim yuvalarındaki id; renk: 1–6 (kıyafet rengi jetonu).
 * Bilinmeyen ürün -> ''. Süs: aria-hidden.
 */
export function giyimParcaSvg(urun, { renk = 1 } = {}) {
  const yuva = Object.keys(GIYIM_CIZIM).find((y) => Object.hasOwn(GIYIM_CIZIM[y], urun ?? ''));
  if (!yuva) return '';
  return `<svg viewBox="${PARCA_KUTU[urun]}" class="yvb-svg yvb-parca" data-urun="${urun}" style="--yv-govde:var(--yv-r${renkGecerli(renk)})" aria-hidden="true" focusable="false">`
    + `<g class="yvb-giyim yvb-giyim-${yuva}">${GIYIM_CIZIM[yuva][urun]}</g></svg>`;
}

// ---------- Büyük: oturan bebek (viewBox 0 0 200 200, zemin y≈186) ----------

const MOTIFLER = {
  obur: '<path class="yvb-motif-a" d="M0 -5.5 C5 -5.5 6.5 -1 4.5 3 C3 5.5 1.2 6.5 0 6.5 C-1.2 6.5 -3 5.5 -4.5 3 C-6.5 -1 -5 -5.5 0 -5.5 Z"/><path class="yvb-motif-b" d="M-3.5 -5.5 L0 -3.5 L3.5 -5.5 L2 -7.5 L0 -6.5 L-2 -7.5 Z"/>',
  uykucu: '<path class="yvb-motif-c" d="M2.5 -6.5 A6.5 6.5 0 1 0 6.5 3 A5 5 0 1 1 2.5 -6.5 Z"/>',
  neseli: '<path class="yvb-motif-c" d="M0 -7 L2 -2.3 L7 -2 L3.1 1.2 L4.4 6.2 L0 3.4 L-4.4 6.2 L-3.1 1.2 L-7 -2 L-2 -2.3 Z"/>',
  titiz: '<circle class="yvb-motif-d" cx="-2" cy="1" r="4.6"/><circle class="yvb-motif-d" cx="3.6" cy="-3.6" r="2.6"/><circle class="yvb-motif-d" cx="4.4" cy="3.4" r="1.6"/>',
  kalp: '<path class="yvb-motif-a" d="M0 6 C-7 1 -7.5 -4.5 -3.8 -5.6 C-1.8 -6.2 -0.4 -4.8 0 -3.6 C0.4 -4.8 1.8 -6.2 3.8 -5.6 C7.5 -4.5 7 1 0 6 Z"/>',
};

function buyuk(k, ruh, kisilik, giyim) {
  // El: dizde duran bebek eli; avuç üstte, dört kısa parmak (orta uzun, aralıklı, hafif yelpaze) avucun altından
  // çıkar; başparmak iç yanda ayrı ve eğik. s: başparmak yönü.
  const parmak = (x, y, ry, a) => `<ellipse class="yvb-ten yvb-parmak" fill="url(#${k}-ten)" cx="${x}" cy="${y}" rx="2.5" ry="${ry}" transform="rotate(${a} ${x} ${y})"/>`;
  const el = (x, y, s) => `<g class="yvb-el" transform="translate(${x} ${y}) scale(${s} 1)">`
    + parmak(-5.8, 6.6, 4.2, 20) + parmak(-2, 8.2, 5, 7) + parmak(1.9, 8.2, 4.8, -5) + parmak(5.6, 6.6, 4, -18)
    + `<ellipse class="yvb-ten" fill="url(#${k}-ten)" cx="8.6" cy="-0.4" rx="3" ry="5" transform="rotate(-40 8.6 -0.4)"/>`
    + `<path class="yvb-ten" fill="url(#${k}-ten)" d="M-8.4 -3 C-8.4 -9.4 7.6 -9.4 7.8 -3 C8 2 5.2 5.6 0 5.6 C-5.2 5.6 -8.4 2 -8.4 -3 Z"/>`
    + '</g>';
  const KABUK_SAC_ARKA = 'M100 15 C138 15 161 41 161 72 C161 84 157 91 162 98 C167 104 161 110 154 107 C150 105 148 102 147 99 C140 78 60 78 53 99 C52 102 50 105 46 107 C39 110 33 104 38 98 C43 91 39 84 39 72 C39 41 62 15 100 15 Z';
  return '<ellipse class="yvb-zemin" cx="100" cy="187" rx="66" ry="6.5"/>'
    + '<g class="yvb-beden">'
    // Saçın ense kısmı başın arkasında
    + `<g class="yvb-sac yvb-sac-arka"><path fill="url(#${k}-sac)" d="${KABUK_SAC_ARKA}"/></g>`
    // Gövde (ten; kıyafet altında, giydirme için ayrı)
    + `<g class="yvb-govde">${ten(k, '<path class="yvb-ten" d="M100 108 C124 108 137 121 141 140 C145 159 137 175 100 177 C63 175 55 159 59 140 C63 121 76 108 100 108 Z"/>')}</g>`
    // Kıyafet: tulum (renk jetonundan), benek, yaka, göğüste motif
    + '<g class="yvb-kiyafet yvb-kiyafet-govde">'
    + `<path class="yvb-kumas" fill="url(#${k}-kumas)" d="M100 107 C124 107 137 120 141 140 C145 159 137 175 100 177 C63 175 55 159 59 140 C63 120 76 107 100 107 Z"/>`
    + `<path fill="url(#${k}-benek)" d="M100 107 C124 107 137 120 141 140 C145 159 137 175 100 177 C63 175 55 159 59 140 C63 120 76 107 100 107 Z"/>`
    + '<path class="yvb-kumas-kat" d="M80 168 Q100 176 120 168"/>'
    + '<path class="yvb-yaka" d="M84 111 Q92 121 100 117 Q108 121 116 111 Q108 114 100 113 Q92 114 84 111 Z"/>'
    + `<g class="yvb-motif" transform="translate(100 140)">${MOTIFLER[kisilik] || MOTIFLER.kalp}</g>`
    + '</g>'
    // Bacaklar öne uzanmış, tabanlar izleyiciye dönük
    + '<g class="yvb-bacak">'
    + ten(k, '<path class="yvb-ten" d="M63 148 C52 156 50 174 61 182 C71 189 87 187 92 179 C96 171 90 161 80 154 C74 150 68 146 63 148 Z"/>')
    + ten(k, '<path class="yvb-ten" d="M137 148 C148 156 150 174 139 182 C129 189 113 187 108 179 C104 171 110 161 120 154 C126 150 132 146 137 148 Z"/>')
    + ayak(k, 86, 176, -10, 1) + ayak(k, 114, 176, 10, -1)
    + '</g>'
    // Kollar: omuzdan dize; eller dizde
    + '<g class="yvb-kol">'
    + ten(k, '<path class="yvb-ten" d="M64 116 C53 122 48 138 51 150 C53 158 61 162 67 158 C73 153 76 136 76 124 Z"/>')
    + ten(k, '<path class="yvb-ten" d="M136 116 C147 122 152 138 149 150 C147 158 139 162 133 158 C127 153 124 136 124 124 Z"/>')
    + el(67, 157, 1)
    + el(133, 157, -1)
    + '</g>'
    // Kabarık kısa kollar (kıyafetin parçası; kolun üstünde)
    + '<g class="yvb-kiyafet yvb-kiyafet-kol">'
    + `<path class="yvb-kumas" fill="url(#${k}-kumas)" d="M60 114 C51 118 47 130 51 137 C57 141 70 138 77 129 C79 120 71 110 60 114 Z"/>`
    + `<path class="yvb-kumas" fill="url(#${k}-kumas)" d="M140 114 C149 118 153 130 149 137 C143 141 130 138 123 129 C121 120 129 110 140 114 Z"/>`
    + '</g>'
    + giyimKatmani(giyim, 'boyun', 'buyuk')
    // Baş: kulaklar, yüz şekli (alt yanaklar tombul), çene gölgesi
    + '<g class="yvb-bas">'
    + '<ellipse class="yvb-golge" cx="100" cy="117" rx="26" ry="6"/>'
    + ten(k, '<ellipse class="yvb-ten" cx="48" cy="80" rx="9" ry="11"/>') + '<path class="yvb-kulak-ic" d="M47 74 Q43 80 47 86"/>'
    + ten(k, '<ellipse class="yvb-ten" cx="152" cy="80" rx="9" ry="11"/>') + '<path class="yvb-kulak-ic" d="M153 74 Q157 80 153 86"/>'
    + ten(k, '<path class="yvb-ten" d="M100 22 C131 22 152 42 153 69 C154 95 138 117 100 117 C62 117 46 95 47 69 C48 42 69 22 100 22 Z"/>')
    + '</g>'
    + yuz(k, ruh, 100, 75, 1)
    // Ön saç: dalgalı kâkül, yanlarda kıvrım; ışık şeridi
    + '<g class="yvb-sac yvb-sac-on">'
    + `<path fill="url(#${k}-sac)" d="M47 72 C42 38 66 18 100 18 C134 18 158 38 153 72 C149 60 143 52 136 49 C134 55 128 58 122 55 C120 47 113 42 106 42 C103 50 93 54 84 51 C82 46 78 44 73 46 C69 53 62 57 55 58 C51 62 48 66 47 72 Z"/>`
    + '<path class="yvb-sac-cizgi" d="M106 42 C109 37 102 33 104 29 C105 26 101 24 97 25 M84 51 C87 45 80 42 82 37 C83 34 80 32 76 34 M122 55 C126 50 119 45 122 40 C124 37 121 34 118 33 M136 49 C140 45 135 41 138 37 M44 99 C40 97 41 92 45 92 M156 99 C160 97 159 92 155 92"/>'
    + '<path class="yvb-sac-isik" d="M72 30 C84 23 104 22 118 26"/>'
    + '</g>'
    + giyimKatmani(giyim, 'goz', 'buyuk')
    // Aksesuar: baş yuvası boşsa varsayılan saç bandı + pembe fiyonk; doluysa giyilen (giyim katmanı)
    + (giyim.bas ? giyimKatmani(giyim, 'bas', 'buyuk') : '<g class="yvb-aksesuar">'
    + '<path class="yvb-bant" d="M64 38 C86 22 120 21 142 37 C148 42 152 50 154 58"/>'
    + '<g class="yvb-fiyonk" transform="translate(66 34) rotate(-18)">'
    + '<path class="yvb-fiyonk-kuyruk" d="M-2 3 C-6 9 -9 15 -12 20 L-6.5 18.5 L-4 23 C-2 16 0 10 1 5 Z M2 3 C6 9 9 15 12 20 L6.5 18.5 L4 23 C2 16 0 10 -1 5 Z"/>'
    + '<path class="yvb-fiyonk-kanat" d="M-2 0 C-9 -15 -27 -17 -29 -3 C-31 11 -14 13 -2 2 Z"/>'
    + '<path class="yvb-fiyonk-kanat" d="M2 0 C9 -15 27 -17 29 -3 C31 11 14 13 2 2 Z"/>'
    + '<path class="yvb-fiyonk-kat" d="M-7 -1 Q-18 -9 -24 -3 M7 -1 Q18 -9 24 -3"/>'
    + '<ellipse class="yvb-fiyonk-dugum" cx="0" cy="0.5" rx="6" ry="7"/>'
    + '<ellipse class="yvb-parilti yvb-fiyonk-isik" cx="-19" cy="-7" rx="4" ry="2" transform="rotate(-20 -19 -7)"/>'
    + '</g></g>')
    + isaret(ruh, 160, 34, [[68, 104, 4], [118, 152, 5], [140, 176, 3.5]])
    + '</g>';
}

// ---------- Küçük: yeni doğmuş, kundakta, emzikli, tek tutam saç, alt yarısı kabukta ----------
// Kabuk cizim.js KUCUK_KABUK ile aynı biçim (çatlama sahnesinin son karesine uysun).
const KUCUK_KABUK = '<path class="yvb-kabuk-dis" d="M54 154 L64 146 L74 155 L86 145 L100 156 L114 145 L126 155 L136 146 L146 154 C146 172 128 182 100 182 C72 182 54 172 54 154 Z"/>'
  + '<ellipse class="yvb-kabuk-benek" cx="76" cy="168" rx="6" ry="4"/><ellipse class="yvb-kabuk-benek" cx="124" cy="166" rx="7" ry="4.5"/>';
const EMZIK_RUHLARI = ['normal', 'kirli', 'uykulu', 'uyuyor'];
const KUCUK_ZEMIN = '<ellipse class="yvb-zemin" cx="100" cy="182" rx="48" ry="6.5"/>';
const kucukIsaret = (ruh) => isaret(ruh, 140, 70, [[72, 146, 4], [128, 112, 3.4], [116, 150, 3.5]]);

/** Kabuktan çıkan kısım (kundak, baş, yüz, saç, emzik); kabuk ve işaret hariç. */
function kucukGovde(k, ruh, giyim = GIYIM_BOS) {
  const emzik = EMZIK_RUHLARI.includes(ruh);
  return ''
    // Kundak: başlık (yüzü çerçeveler) ve battaniye (renk jetonundan), çapraz kat, benek
    + '<g class="yvb-kiyafet yvb-kundak">'
    + `<path class="yvb-kumas" fill="url(#${k}-kumas)" d="M52 156 C42 110 62 46 100 44 C138 46 158 110 148 156 Z"/>`
    + `<path fill="url(#${k}-benek)" d="M52 156 C42 110 62 46 100 44 C138 46 158 110 148 156 Z"/>`
    + '<path class="yvb-kundak-kenar" d="M62 134 C54 98 70 56 100 54 C130 56 146 98 138 134"/>'
    + `<path class="yvb-kumas" fill="url(#${k}-kumas)" d="M100 116 C132 116 152 132 152 154 C152 172 130 179 100 179 C70 179 48 172 48 154 C48 132 68 116 100 116 Z"/>`
    + `<path fill="url(#${k}-benek)" d="M100 116 C132 116 152 132 152 154 C152 172 130 179 100 179 C70 179 48 172 48 154 C48 132 68 116 100 116 Z"/>`
    + '<path class="yvb-kumas-kat" d="M56 140 C80 142 112 148 146 166"/>'
    + '</g>'
    + '<g class="yvb-govde"></g>'
    // Baş
    + '<g class="yvb-bas">'
    + ten(k, '<ellipse class="yvb-ten" cx="64.5" cy="98" rx="6.5" ry="8"/>')
    + ten(k, '<ellipse class="yvb-ten" cx="135.5" cy="98" rx="6.5" ry="8"/>')
    + ten(k, '<path class="yvb-ten" d="M100 60 C123 60 137 76 137 96 C137 116 122 130 100 130 C78 130 63 116 63 96 C63 76 77 60 100 60 Z"/>')
    + '</g>'
    + yuz(k, ruh, 100, 98, 0.72, emzik)
    + '<g class="yvb-kiyafet yvb-kundak-on">'
    + `<path class="yvb-kumas" fill="url(#${k}-kumas)" d="M68 133 C84 128 116 128 132 133 C126 140 114 143 100 143 C86 143 74 140 68 133 Z"/>`
    + '</g>'
    // Baş yuvası (küçük boy, başlığın tepesinde; saç tutamı önünde kıvrılır)
    + giyimKatmani(giyim, 'bas', 'kucuk')
    // Tek tutam saç
    + `<g class="yvb-sac"><path fill="url(#${k}-sac)" d="M95 62 C92 54 96 46 104 46 C111 46 113 54 107 56 C103 57 101 53 104 51 C99 51 98 56 102 62 Z"/></g>`
    + (emzik
      ? '<g class="yvb-emzik"><ellipse class="yvb-emzik-kalkan" cx="100" cy="117.5" rx="10.5" ry="6.2"/>'
        + '<circle class="yvb-emzik-dugme" cx="100" cy="118" r="3.4"/><circle class="yvb-emzik-halka" cx="100" cy="124.5" r="5.4"/></g>'
      : '');
}

function kucuk(k, ruh, giyim) {
  return KUCUK_ZEMIN + '<g class="yvb-beden">' + kucukGovde(k, ruh, giyim) + `<g class="yvb-kabuk">${KUCUK_KABUK}</g>` + kucukIsaret(ruh) + '</g>';
}

/**
 * Bebek SVG'si (metin). asama: 'kucuk'|'buyuk'; ruh: BEBEK_RUHLARI; renk: 1–6 (kıyafet/kundak);
 * kisilik: 'obur'|'uykucu'|'neseli'|'titiz' (büyükte göğüs motifi); etiket: erişilebilir ad;
 * kimlik: gradyan id öneki (verilmezse sayaçtan benzersiz); giyim: { bas?, goz?, boyun? } (giyim.js giyimOku;
 * baş boşsa varsayılan pembe fiyonk; küçükte yalnız baş, küçük boy). Bilinmeyen değer varsayılana düşer / yok sayılır.
 */
const renkGecerli = (renk) => (Number.isInteger(renk) && renk >= 1 && renk <= 6 ? renk : 1);
const onek = (kimlik) => String(kimlik).replace(/[^a-zA-Z0-9_-]/g, '') || `yvb${++sayac}`;

export function bebekSvg({ asama = 'buyuk', ruh = 'normal', renk = 1, kisilik = '', etiket = '', kimlik = '', giyim = null } = {}) {
  const a = BEBEK_ASAMALARI.includes(asama) ? asama : 'buyuk';
  const g = giyimGecerli(giyim);
  const r = BEBEK_RUHLARI.includes(ruh) ? ruh : 'normal';
  const c = renkGecerli(renk);
  const ki = KISILIKLER.includes(kisilik) ? kisilik : '';
  const k = onek(kimlik);
  const erisim = etiket ? `role="img" aria-label="${esc(etiket)}"` : 'aria-hidden="true"';
  const ic = a === 'buyuk' ? buyuk(k, r, ki, g) : kucuk(k, r, g);
  return `<svg viewBox="0 0 200 200" class="yvb-svg" data-asama="${a}" data-ruh="${r}"${ki ? ` data-kisilik="${ki}"` : ''}`
    + ` style="--yv-govde:var(--yv-r${c})" ${erisim} focusable="false">${tanimlar(k)}${ic}</svg>`;
}

/**
 * Çatlama sahnesi için küçük bebeğin parçaları (cizim.js catlamaSvg). Son kare bebekSvg({ asama: 'kucuk' }) ile aynı:
 * -> { tanim (<defs>), zemin, yavru (gövde + işaret), kabuk (alt yarı), renk (1–6) }. Sahne <svg>'si yvb-svg sınıfını taşır.
 */
export function bebekCatlamaParcalari({ ruh = 'mutlu', renk = 1, kimlik = '' } = {}) {
  const r = BEBEK_RUHLARI.includes(ruh) ? ruh : 'mutlu';
  const k = onek(kimlik);
  return { tanim: tanimlar(k), zemin: KUCUK_ZEMIN, yavru: kucukGovde(k, r) + kucukIsaret(r), kabuk: KUCUK_KABUK, renk: renkGecerli(renk) };
}

/** Bebek stili. Renk jetonları (--yv-r1..6, --yv-damla) CIZIM_CSS'ten gelir; ikisi birlikte eklenir. */
export const BEBEK_CSS = `
:root {
  --yvb-ten: #F8CDAE;
  --yvb-ten-isik: #FFE6D3;
  --yvb-ten-golge: #E6A585;
  --yvb-ten-cizgi: #B87158;
  --yvb-sac: #8C5636;
  --yvb-sac-isik: #B98258;
  --yvb-sac-koyu: #5A321F;
  --yvb-iris: #2E9EA6;
  --yvb-iris-isik: #93E3D9;
  --yvb-iris-koyu: #0F4E5C;
  --yvb-gozbebek: #1B2230;
  --yvb-ak: #FFFDFA;
  --yvb-murekkep: #4B2A25;
  --yvb-kas: #A06A4A;
  --yvb-agiz: #A33A50;
  --yvb-dudak: #B4515F;
  --yvb-dil: #F38FA2;
  --yvb-allik: #F5768F;
  --yvb-pembe: #EE5F8C;
  --yvb-kabuk: #FFF6EA;
  --yvb-zemin-koyu: #0E0612;
  --yvb-altin: #F6C94E;
  --yvb-altin-koyu: #C98A1C;
  --yvb-inci: #FFF8EC;
  --yvb-sapka: #6C4A8C;
  --yvb-kurdele: #E5506F;
  --yvb-cerceve: #5B2D4E;
  --yvb-cam: #3B2F5C;
  --yvb-atki: #E86A5A;
}
.yvb-svg {
  display: block; width: 100%; height: 100%; overflow: visible;
  --yvb-kontur: color-mix(in oklab, var(--yvb-ten-cizgi) 78%, var(--hero));
  /* Kumaş pastel jetondan biraz daha doygun (eski motorda düz renk). */
  --yvb-kumas: var(--yv-govde);
  --yvb-kumas: oklch(from var(--yv-govde) calc(l - 0.04) calc(c * 1.55) h);
  --yvb-kumas-koyu: color-mix(in oklab, var(--yvb-kumas) 68%, var(--yvb-murekkep));
  --yvb-fiyonk: color-mix(in oklab, var(--yv-govde) 35%, var(--yvb-pembe));
}
.yvb-d-ten1 { stop-color: var(--yvb-ten-isik); }
.yvb-d-ten2 { stop-color: var(--yvb-ten); }
.yvb-d-ten3 { stop-color: var(--yvb-ten-golge); }
.yvb-d-iris1 { stop-color: var(--yvb-iris-isik); }
.yvb-d-iris2 { stop-color: var(--yvb-iris); }
.yvb-d-iris3 { stop-color: var(--yvb-iris-koyu); }
.yvb-d-allik { stop-color: var(--yvb-allik); stop-opacity: 0.62; }
.yvb-d-sifir { stop-opacity: 0; }
.yvb-d-sac1 { stop-color: var(--yvb-sac-isik); }
.yvb-d-sac2 { stop-color: var(--yvb-sac); }
.yvb-d-sac3 { stop-color: var(--yvb-sac-koyu); }
.yvb-d-kumas1 { stop-color: var(--yv-govde); }
.yvb-d-kumas2 { stop-color: var(--yvb-kumas); }
.yvb-d-kumas3 { stop-color: color-mix(in oklab, var(--yvb-kumas) 78%, var(--yvb-kumas-koyu)); }
.yvb-benek { fill: var(--yvb-ak); opacity: 0.75; }
.yvb-zemin { fill: var(--hero); opacity: 0.14; }
/* Koyu temada --hero zeminden açık: gölge koyu jetonla, daha belirgin. */
@media (prefers-color-scheme: dark) { :root:not([data-mod="acik"]) .yvb-zemin { fill: var(--yvb-zemin-koyu); opacity: 0.42; } }
:root[data-mod="koyu"] .yvb-zemin { fill: var(--yvb-zemin-koyu); opacity: 0.42; }
.yvb-ten { stroke: var(--yvb-kontur); stroke-width: 1.6; stroke-linejoin: round; }
.yvb-parmak { stroke-width: 1.2; }
.yvb-kumas { stroke: var(--yvb-kumas-koyu); stroke-width: 1.6; stroke-linejoin: round; }
.yvb-kundak-kenar { fill: none; stroke: color-mix(in oklab, var(--yv-govde) 55%, var(--yvb-ak)); stroke-width: 5; stroke-linecap: round; }
.yvb-kumas-kat { fill: none; stroke: var(--yvb-kumas-koyu); stroke-width: 1.3; stroke-linecap: round; opacity: 0.55; }
.yvb-yaka { fill: var(--yvb-ak); stroke: var(--yvb-kumas-koyu); stroke-width: 1.2; stroke-linejoin: round; }
.yvb-motif-a { fill: var(--yvb-fiyonk); stroke: var(--yvb-kumas-koyu); stroke-width: 1; }
.yvb-motif-b { fill: var(--yvb-iris); }
.yvb-motif-c { fill: var(--yvb-ak); stroke: var(--yvb-kumas-koyu); stroke-width: 1; stroke-linejoin: round; }
.yvb-motif-d { fill: var(--yvb-ak); stroke: var(--yvb-iris); stroke-width: 1.1; }
.yvb-golge { fill: var(--yvb-kumas-koyu); opacity: 0.4; }
.yvb-kulak-ic { fill: none; stroke: var(--yvb-kontur); stroke-width: 1.3; stroke-linecap: round; opacity: 0.8; }
.yvb-taban { fill: var(--yvb-allik); opacity: 0.22; }
.yvb-sac path:not([class]) { stroke: var(--yvb-sac-koyu); stroke-width: 1.4; stroke-linejoin: round; }
.yvb-sac-cizgi { fill: none; stroke: var(--yvb-sac-koyu); stroke-width: 1.3; stroke-linecap: round; opacity: 0.7; }
.yvb-sac-isik { fill: none; stroke: var(--yvb-sac-isik); stroke-width: 3.2; stroke-linecap: round; opacity: 0.8; }
.yvb-bant { fill: none; stroke: var(--yvb-fiyonk); stroke-width: 4; stroke-linecap: round; }
.yvb-fiyonk-kanat, .yvb-fiyonk-kuyruk, .yvb-fiyonk-dugum { fill: var(--yvb-fiyonk); stroke: color-mix(in oklab, var(--yvb-fiyonk) 60%, var(--yvb-murekkep)); stroke-width: 1.4; stroke-linejoin: round; }
.yvb-fiyonk-dugum { fill: color-mix(in oklab, var(--yvb-fiyonk) 85%, var(--yvb-murekkep)); }
.yvb-fiyonk-kat { fill: none; stroke: color-mix(in oklab, var(--yvb-fiyonk) 60%, var(--yvb-murekkep)); stroke-width: 1.1; stroke-linecap: round; opacity: 0.6; }
.yvb-fiyonk-isik { opacity: 0.55; }
.yvb-ak { fill: var(--yvb-ak); stroke: var(--yvb-kontur); stroke-width: 0.8; }
.yvb-iris { stroke: var(--yvb-iris-koyu); stroke-width: 0.9; }
.yvb-gozbebek { fill: var(--yvb-gozbebek); }
.yvb-parilti { fill: var(--hero-ink); }
.yvb-kirpik { fill: none; stroke: var(--yvb-murekkep); stroke-width: 2.6; stroke-linecap: round; stroke-linejoin: round; }
.yvb-kirpik.ince { stroke-width: 1.5; }
.yvb-kapak { stroke: none; }
.yvb-kapak-cizgi { fill: none; stroke: var(--yvb-murekkep); stroke-width: 2.4; stroke-linecap: round; }
.yvb-kas path { fill: none; stroke: var(--yvb-kas); stroke-width: 2; stroke-linecap: round; }
.yvb-burun-ic { fill: var(--yvb-ten-golge); opacity: 0.85; }
.yvb-dudak { fill: none; stroke: var(--yvb-dudak); stroke-width: 2.2; stroke-linecap: round; }
.yvb-agiz-ic { fill: var(--yvb-agiz); stroke: var(--yvb-murekkep); stroke-width: 1.2; stroke-linejoin: round; }
.yvb-dil { fill: var(--yvb-dil); }
.yvb-agiz-konus { display: none; fill: var(--yvb-agiz); stroke: var(--yvb-murekkep); stroke-width: 1.2; transform-box: fill-box; transform-origin: 50% 15%; transform: scaleY(var(--yvb-konus, 0.12)); }
[data-konusuyor] .yvb-agiz > :not(.yvb-agiz-konus), [data-konusuyor] .yvb-emzik { display: none; }
[data-konusuyor] .yvb-agiz-konus { display: inline; }
.yvb-yanak.guclu ellipse { transform: scale(1.12); transform-box: fill-box; transform-origin: center; }
.yvb-damla { fill: var(--yv-damla); stroke: color-mix(in oklab, var(--yv-damla) 55%, var(--yvb-murekkep)); stroke-width: 0.9; }
.yvb-iz { fill: none; stroke: var(--yv-damla); stroke-width: 3; stroke-linecap: round; opacity: 0.7; }
.yvb-leke path { fill: var(--yvb-sac); opacity: 0.4; }
.yvb-dusunce circle { fill: var(--hero-ink); stroke: var(--hero); stroke-width: 2; }
.yvb-biberon { fill: var(--yv-govde); stroke: var(--hero); stroke-width: 1.6; }
.yvb-biberon-uc { fill: var(--yvb-allik); stroke: var(--hero); stroke-width: 1.4; }
.yvb-z, .yvb-zzz text { fill: var(--text); font-family: var(--font-display); font-weight: 700; font-size: 17px; }
.yvb-zzz .yvb-z1 { font-size: 13px; }
.yvb-zzz .yvb-z3 { font-size: 21px; }
.yvb-kabuk-dis { fill: var(--yvb-kabuk); stroke: var(--yvb-kontur); stroke-width: 1.8; stroke-linejoin: round; }
.yvb-kabuk-benek { fill: var(--yv-govde); opacity: 0.9; }
.yvb-emzik-kalkan { fill: var(--yvb-fiyonk); stroke: color-mix(in oklab, var(--yvb-fiyonk) 60%, var(--yvb-murekkep)); stroke-width: 1.2; }
.yvb-emzik-halka { fill: none; stroke: color-mix(in oklab, var(--yvb-fiyonk) 80%, var(--yvb-murekkep)); stroke-width: 2.2; }
.yvb-emzik-dugme { fill: color-mix(in oklab, var(--yvb-fiyonk) 45%, var(--yvb-ak)); }
/* Giyim katmanı (aksesuarlar). Kontur mürekkeple karışık; iki temada aynı (pastel bebek gibi). */
.yvb-g-altin { fill: var(--yvb-altin); stroke: color-mix(in oklab, var(--yvb-altin-koyu) 70%, var(--yvb-murekkep)); stroke-width: 1.5; stroke-linejoin: round; }
.yvb-g-altin-koyu { fill: var(--yvb-altin-koyu); stroke: color-mix(in oklab, var(--yvb-altin-koyu) 70%, var(--yvb-murekkep)); stroke-width: 1.2; stroke-linejoin: round; }
.yvb-g-inci { fill: var(--yvb-inci); stroke: color-mix(in oklab, var(--yvb-altin-koyu) 70%, var(--yvb-murekkep)); stroke-width: 1.1; }
.yvb-g-tas-a { fill: var(--yvb-pembe); stroke: color-mix(in oklab, var(--yvb-pembe) 55%, var(--yvb-murekkep)); stroke-width: 0.9; }
.yvb-g-tas-b { fill: var(--yvb-iris); stroke: var(--yvb-iris-koyu); stroke-width: 0.9; }
.yvb-g-isik { fill: none; stroke: var(--hero-ink); stroke-width: 2; stroke-linecap: round; opacity: 0.7; }
.yvb-g-isik-dolgu { fill: var(--hero-ink); opacity: 0.55; }
.yvb-g-sapka { fill: var(--yvb-sapka); stroke: color-mix(in oklab, var(--yvb-sapka) 55%, var(--yvb-murekkep)); stroke-width: 1.5; stroke-linejoin: round; }
.yvb-g-sapka-ust { fill: color-mix(in oklab, var(--yvb-sapka) 82%, var(--yvb-ak)); stroke: color-mix(in oklab, var(--yvb-sapka) 55%, var(--yvb-murekkep)); stroke-width: 1.3; }
.yvb-g-kurdele { fill: var(--yvb-kurdele); stroke: color-mix(in oklab, var(--yvb-kurdele) 55%, var(--yvb-murekkep)); stroke-width: 1.4; stroke-linejoin: round; }
.yvb-g-dugum { fill: color-mix(in oklab, var(--yvb-kurdele) 85%, var(--yvb-murekkep)); }
.yvb-g-kat { fill: none; stroke: color-mix(in oklab, var(--yvb-kurdele) 55%, var(--yvb-murekkep)); stroke-width: 1.1; stroke-linecap: round; opacity: 0.55; }
.yvb-g-benek { fill: var(--yvb-ak); opacity: 0.9; }
.yvb-g-cicek { fill: var(--yv-govde); stroke: color-mix(in oklab, var(--yv-govde) 50%, var(--yvb-murekkep)); stroke-width: 0.8; }
.yvb-g-cam { fill: var(--yvb-cam); opacity: 0.32; }
.yvb-g-cerceve { fill: none; stroke: var(--yvb-cerceve); stroke-width: 3.4; stroke-linecap: round; stroke-linejoin: round; }
.yvb-g-sap { fill: none; stroke: var(--yvb-cerceve); stroke-width: 2.8; stroke-linecap: round; }
.yvb-g-cam-isik { fill: none; stroke: var(--hero-ink); stroke-width: 2.2; stroke-linecap: round; opacity: 0.85; }
.yvb-g-atki { fill: var(--yvb-atki); stroke: color-mix(in oklab, var(--yvb-atki) 55%, var(--yvb-murekkep)); stroke-width: 1.5; stroke-linejoin: round; }
.yvb-g-atki-cizgi { fill: none; stroke: var(--yvb-ak); stroke-width: 3; stroke-linecap: round; opacity: 0.9; }
.yvb-g-atki-kat { fill: none; stroke: color-mix(in oklab, var(--yvb-atki) 55%, var(--yvb-murekkep)); stroke-width: 1.2; stroke-linecap: round; opacity: 0.5; }
.yvb-g-puskul { fill: none; stroke: color-mix(in oklab, var(--yvb-atki) 70%, var(--yvb-murekkep)); stroke-width: 2; stroke-linecap: round; }
/* transform özniteliği olan gruplara (yvb-yuz, yvb-ayak, yvb-el, yvb-fiyonk) transform-box verilmez: kayar. */
.yvb-beden, .yvb-goz-acik, .yvb-dusen { transform-box: fill-box; }
@media (prefers-reduced-motion: no-preference) {
  .yvb-beden { transform-origin: 50% 100%; animation: yvb-nefes 3.8s ease-in-out infinite; }
  .yvb-svg[data-ruh="uyuyor"] .yvb-beden { animation-duration: 6s; }
  .yvb-svg[data-ruh="mutlu"] .yvb-beden, .yvb-svg[data-ruh="kahkaha"] .yvb-beden { animation: yvb-hopla 2.6s ease-in-out infinite; }
  .yvb-goz-acik { transform-origin: center; animation: yvb-kirp 5.2s infinite; }
  .yvb-dusen { transform-origin: 50% 0; animation: yvb-dus 1.3s ease-in infinite; }
  .yvb-dusen.ikinci { animation-delay: 0.65s; }
  .yvb-zzz text { animation: yvb-z 3.2s ease-in-out infinite both; }
  .yvb-zzz .yvb-z2 { animation-delay: 0.9s; }
  .yvb-zzz .yvb-z3 { animation-delay: 1.8s; }
}
@keyframes yvb-nefes { 0%, 100% { transform: scale(1, 1); } 50% { transform: scale(1.018, 0.982); } }
@keyframes yvb-hopla {
  0%, 60%, 100% { transform: translateY(0) scale(1, 1); }
  68% { transform: translateY(0) scale(1.04, 0.95); }
  78% { transform: translateY(-7px) scale(0.98, 1.03); }
  88% { transform: translateY(0) scale(1.02, 0.98); }
}
@keyframes yvb-kirp { 0%, 92%, 100% { transform: scaleY(1); } 95% { transform: scaleY(0.08); } }
@keyframes yvb-dus { 0% { opacity: 0; transform: translateY(-2px); } 20% { opacity: 1; } 100% { opacity: 0; transform: translateY(16px); } }
@keyframes yvb-z { 0% { opacity: 0; transform: translate(0, 4px); } 30% { opacity: 1; } 100% { opacity: 0; transform: translate(6px, -12px); } }
`;
