// Yavrumuz: tek ikon dili (saf metin, DOM yok). Hepsi 24×24, aynı çizgi kalınlığı, yuvarlak uç. Renk currentColor.
// Emoji yerine bunlar: cihaza göre değişmez, tek görünüm verir.
const YOL = Object.freeze({
  geri: 'M15 5l-7 7 7 7',
  ileri: 'M9 5l7 7-7 7',
  kapat: 'M6 6l12 12M18 6L6 18',
  biberon: 'M9.5 2.5h5M10.5 2.5v3L8 9v10.5a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V9l-2.5-3.5v-3M8 13.5h8M8 17h4',
  baloncuk: 'M14 15a5 5 0 1 1-10 0 5 5 0 0 1 10 0ZM20.5 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM20.5 17a1.7 1.7 0 1 1-3.4 0 1.7 1.7 0 0 1 3.4 0Z',
  lazimlik: 'M4 9.5h16v1a6.5 6.5 0 0 1-6.5 6.5h-3A6.5 6.5 0 0 1 4 10.5v-1ZM8.5 17v3.5h7V17M7 9.5V4h5.5v5.5',
  ay: 'M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5Z',
  cingirak: 'M16.8 7.8a4.8 4.8 0 1 1-9.6 0 4.8 4.8 0 0 1 9.6 0ZM12 12.6V17M14.2 19.2a2.2 2.2 0 1 1-4.4 0 2.2 2.2 0 0 1 4.4 0ZM9.8 6.5h.01M14.2 6.5h.01M12 9.5h.01',
  top: 'M20.5 12a8.5 8.5 0 1 1-17 0 8.5 8.5 0 0 1 17 0ZM3.8 10c4.2 1.6 12.2 1.6 16.4 0M12 3.5c-3.2 5-3.2 12 0 17',
  elma: 'M12 7.5C10 5.5 4.5 6 4.5 11.5c0 4.5 3 9 5.2 9 1 0 1.3-.6 2.3-.6s1.3.6 2.3.6c2.2 0 5.2-4.5 5.2-9 0-5.5-5.5-6-7.5-4ZM12 7.5c0-2.2 1-3.8 3-4.7',
  pasta: 'M4 20.5h16V12H4v8.5ZM4 15.5c2.7 1.7 5.3 1.7 8 0s5.3-1.7 8 0M12 12V8.5M12 5.5v.01',
  sabun: 'M4.5 14a5 5 0 0 1 5-5h5a5 5 0 0 1 5 5v1.5a5 5 0 0 1-5 5h-5a5 5 0 0 1-5-5V14ZM9 13.5h4.5M17 4.8a1.6 1.6 0 1 1-3.2 0 1.6 1.6 0 0 1 3.2 0ZM10.5 5.2a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z',
  dus: 'M4 21V8a4.5 4.5 0 0 1 9 0M8 11h10M9.5 14.5v.01M13 14.5v.01M16.5 14.5v.01M9.5 18v.01M13 18v.01M16.5 18v.01',
  nota: 'M9 18V6l10.5-2.5v12M9 18a2.7 2.7 0 1 1-5.4 0A2.7 2.7 0 0 1 9 18ZM19.5 15.5a2.7 2.7 0 1 1-5.4 0 2.7 2.7 0 0 1 5.4 0Z',
  dur: 'M6.5 6.5h11v11h-11z',
  gunes: 'M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4',
  kumanda: 'M7 8h10a5 5 0 0 1 4.9 6l-.6 3a2.5 2.5 0 0 1-4.3 1.2L15 16H9l-2 2.2A2.5 2.5 0 0 1 2.7 17l-.6-3A5 5 0 0 1 7 8ZM8 10.5V14M6.2 12.2h3.6M15.5 11.5v.01M17.8 13.5v.01',
  mikrofon: 'M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3ZM5.5 11a6.5 6.5 0 0 0 13 0M12 17.500V21',
  canta: 'M5.8 8h12.4l1.3 12.5h-15L5.8 8ZM8.8 10.5V6.8a3.2 3.2 0 0 1 6.4 0v3.7',
  alev: 'M12 2.8c1 4.2 5.3 5.8 5.3 11.2a5.3 5.3 0 0 1-10.6 0c0-2 .9-3.2 2-4.2.2 1.5 1 2.2 2.1 2.2 0-3.2-1-5.3 1.2-9.200Z',
  tik: 'M5 12.5l4.5 4.500L19 7.5',
  kilit: 'M6 11h12v9.500H6V11ZM8.5 11V7.500a3.5 3.5 0 0 1 7 0V11',
  kalp: 'M12 20s-7.5-4.6-7.5-10.100A4.3 4.3 0 0 1 12 7.300a4.3 4.3 0 0 1 7.5 2.600C19.5 15.4 12 20 12 20Z',
  yildiz: 'M12 3.500l2.6 5.5 6 .8-4.4 4.1 1.1 5.900L12 16.900l-5.3 2.9 1.1-5.900L3.4 9.800l6-.8L12 3.500Z',
  hediye: 'M4 11h16v9.500H4V11ZM3 7.500h18V11H3V7.500ZM12 7.500v13M12 7.500c-1.5-4-6-4.5-6-2 0 1.5 2 2 6 2ZM12 7.500c1.5-4 6-4.5 6-2 0 1.5-2 2-6 2Z',
  balon: 'M18 9.500c0 4-3 7.5-6 7.500s-6-3.5-6-7.500a6 6 0 0 1 12 0ZM12 17l-1.2 2h2.400L12 17ZM12 19c0 1.5-1 1.5-1 3',
  sepet: 'M4 10.500h16l-1.8 9.500H5.800L4 10.500ZM7.5 10.5 11 4M16.5 10.5 13 4M9.5 14v2.500M14.5 14v2.5',
  goz: 'M2.8 12s3.4-6.5 9.2-6.500S21.2 12 21.2 12s-3.4 6.5-9.2 6.500S2.8 12 2.8 12ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  elbise: 'M9 3 8 7l2.5 3.500L6 21h12l-4.5-10.500L16 7l-1-4M9 3c1 1.5 5 1.5 6 0',
  tencere: 'M5 10h14v7.500a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V10ZM3 10h18M2.5 13.500H5M19 13.500h2.500M9.5 6.500c-1-1 1-2 0-3.500M14.5 6.500c-1-1 1-2 0-3.5',
  besik: 'M4 11c0 4.5 3.6 7.5 8 7.500s8-3 8-7.500H4ZM4 11c0-3.8 3-7 8-7v7M5 21c4 1.5 10 1.5 14 0M8 18l-1 3M16 18l1 3',
  ses: 'M4 9.500v5h3.500l4.5 4v-13l-4.5 4H4ZM15.5 9a4 4 0 0 1 0 6M18 6.500a7.5 7.5 0 0 1 0 11',
  sessiz: 'M4 9.500v5h3.500l4.5 4v-13l-4.5 4H4ZM16 9.500l5 5M21 9.500l-5 5',
  kalem: 'M4 20l1-4L16 5l3 3L8 19l-4 1Z',
  saat: 'M20.5 12a8.5 8.5 0 1 1-17 0 8.5 8.5 0 0 1 17 0ZM12 7v5.500l3.5 2',
  ilac: 'M10.2 20.800a5.1 5.1 0 0 1-7.2-7.200l6.8-6.800a5.1 5.1 0 0 1 7.2 7.200l-6.8 6.800ZM6.4 10.200l7.2 7.2',
  kisilik: 'M20.5 12a8.5 8.5 0 1 1-17 0 8.5 8.5 0 0 1 17 0ZM8.4 13.600a4.1 4.1 0 0 0 7.2 0M9.2 9.600v.2M14.8 9.600v.2',
});

// Kendi çizimini getiren tema (temalar/<id>/ikonlar.js). O temada olmayan ikon varsayılan çizimle gelir.
let ozel = null;
export function ikonTemasi(modul) { ozel = modul; }

/** İkon SVG metni. Bilinmeyen ad -> ''. Süs: aria-hidden. */
export function ikon(ad, boy = 24) {
  const o = ozel?.ikon(ad, boy);
  if (o) return o;
  if (!Object.hasOwn(YOL, ad ?? '')) return '';
  return `<svg class="yv-ikon" width="${boy}" height="${boy}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${YOL[ad]}"/></svg>`;
}

// Dolgu katmanları: [renk jetonu, yol]. Çizgi YOL'dan gelir, dolgu altında kalır. Emoji değil, her cihazda aynı görünür.
const R1 = '--yv-r1'; const R2 = '--yv-r2'; const R4 = '--yv-r4'; const R5 = '--yv-r5'; const R6 = '--yv-r6';
const AK = '--yvb-ak'; const PEMBE = '--yvb-fiyonk';
const DOLGU = Object.freeze({
  biberon: [[R5, 'M10.5 5.500 8 9v10.500a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V9l-2.500-3.500Z'], [AK, 'M8 13.500h8v6a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2Z'], [PEMBE, 'M10.500 2.500h3v3h-3Z']],
  baloncuk: [[R5, 'M14 15a5 5 0 1 1-10 0 5 5 0 0 1 10 0Z'], [R2, 'M20.500 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z'], [R1, 'M20.500 17a1.700 1.700 0 1 1-3.400 0 1.700 1.700 0 0 1 3.400 0Z']],
  lazimlik: [[R2, 'M7 9.500V4h5.500v5.500Z'], [R5, 'M4 9.500h16v1a6.500 6.500 0 0 1-6.500 6.500h-3A6.500 6.500 0 0 1 4 10.500v-1ZM8.500 17h7v3.500h-7Z']],
  ay: [[R6, YOL.ay]],
  cingirak: [[PEMBE, 'M16.800 7.800a4.800 4.800 0 1 1-9.600 0 4.800 4.800 0 0 1 9.600 0Z'], [R6, 'M14.200 19.200a2.200 2.200 0 1 1-4.400 0 2.200 2.200 0 0 1 4.400 0Z']],
  top: [[R5, 'M20.500 12a8.500 8.500 0 1 1-17 0 8.500 8.500 0 0 1 17 0Z']],
  elma: [[R4, 'M13.500 4.800c1.400-1.700 3.600-2 5-1.300-.6 2-2.700 3.100-5 1.300Z'], [PEMBE, 'M12 7.500C10 5.500 4.500 6 4.500 11.500c0 4.500 3 9 5.200 9 1 0 1.300-.6 2.300-.6s1.300.6 2.300.6c2.200 0 5.200-4.500 5.200-9 0-5.500-5.500-6-7.500-4Z']],
  pasta: [[R6, 'M4 20.500h16V12H4Z'], [R1, 'M4 12h16v3.500c-2.700-1.700-5.300-1.700-8 0s-5.300 1.700-8 0Z'], [R5, 'M11 8.500h2V12h-2Z']],
  sabun: [[R1, 'M4.500 14a5 5 0 0 1 5-5h5a5 5 0 0 1 5 5v1.500a5 5 0 0 1-5 5h-5a5 5 0 0 1-5-5V14Z'], [R5, 'M17 4.800a1.600 1.600 0 1 1-3.200 0 1.600 1.600 0 0 1 3.200 0ZM10.500 5.200a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z']],
  dus: [[R2, 'M8 11a5 4 0 0 1 10 0Z'], [R5, 'M11 14.500a1.500 1.500 0 1 1-3 0 1.500 1.500 0 0 1 3 0ZM14.500 14.500a1.500 1.500 0 1 1-3 0 1.500 1.500 0 0 1 3 0ZM18 14.500a1.500 1.500 0 1 1-3 0 1.500 1.500 0 0 1 3 0ZM11 18a1.500 1.500 0 1 1-3 0 1.500 1.500 0 0 1 3 0ZM14.500 18a1.500 1.500 0 1 1-3 0 1.500 1.500 0 0 1 3 0ZM18 18a1.500 1.500 0 1 1-3 0 1.500 1.500 0 0 1 3 0Z']],
  nota: [[R1, 'M9 6l10.500-2.500v3L9 9Z'], [R2, 'M9 18a2.700 2.700 0 1 1-5.400 0A2.700 2.700 0 0 1 9 18ZM19.500 15.500a2.700 2.700 0 1 1-5.400 0 2.700 2.700 0 0 1 5.400 0Z']],
  dur: [[R1, YOL.dur]],
  gunes: [[R6, 'M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z']],
  kumanda: [[R2, 'M7 8h10a5 5 0 0 1 4.900 6l-.6 3a2.500 2.500 0 0 1-4.300 1.200L15 16H9l-2 2.200A2.500 2.500 0 0 1 2.700 17l-.6-3A5 5 0 0 1 7 8Z']],
  mikrofon: [[R1, 'M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z']],
  canta: [[R5, 'M5.800 8h12.400l1.300 12.500h-15L5.800 8Z']],
  ilac: [[R4, 'M10.200 20.800a5.100 5.100 0 0 1-7.200-7.200l6.800-6.800a5.100 5.100 0 0 1 7.200 7.200l-6.800 6.800Z'], [R1, 'M6.400 10.200 3 13.600a5.100 5.100 0 0 0 7.200 7.200l3.400-3.400Z']],
  kalp: [[PEMBE, YOL.kalp]],
});

/** Dolgulu ikon: tek ikonla aynı çizgi, altında şeker rengi. Bilinmeyen ad -> ''. Süs: aria-hidden. */
export function renkliIkon(ad, boy = 28) {
  const o = ozel?.ikon(ad, boy);
  if (o) return o;
  if (!Object.hasOwn(DOLGU, ad ?? '')) return '';
  const dolgu = DOLGU[ad].map(([renk, d]) => `<path fill="var(${renk})" stroke="none" d="${d}"/>`).join('');
  return `<svg class="yv-ikon renkli" width="${boy}" height="${boy}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${dolgu}<path d="${YOL[ad]}"/></svg>`;
}

/** Jeton: dolu altın para (tek renkli ikon değil; --yvb-altin ve --yvb-altin-koyu bebek.js'te). */
export function paraIkon(boy = 18) {
  if (ozel) return ozel.paraIkon(boy);
  return `<svg class="yv-para" width="${boy}" height="${boy}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="10" fill="var(--yvb-altin)"/><circle cx="12" cy="12" r="6.5" fill="none" stroke="var(--yvb-altin-koyu)" stroke-width="1.6"/></svg>`;
}

export const ODA_IKON = Object.freeze({ mutfak: 'biberon', banyo: 'baloncuk', tuvalet: 'lazimlik', yatak: 'ay', oyun: 'cingirak' });
export const EYLEM_IKON = Object.freeze({
  mama: 'biberon', meyve: 'elma', tatli: 'pasta', oyna: 'cingirak', yika: 'sabun', sev: 'kalp', uyut: 'ay', uyandir: 'gunes',
  ilac: 'ilac', lazimlik: 'lazimlik', ninni: 'nota', durdur: 'dur', oyunlar: 'kumanda', konus: 'mikrofon', magaza: 'canta', durula: 'dus',
});
export const OYUN_IKON = Object.freeze({ balon: 'balon', top: 'sepet', cee: 'goz', ninni: 'yildiz', giydir: 'elbise', tarif: 'tencere', salla: 'besik' });
