// Yılımız ve Rozetler çizgi simgeleri (24×24, currentColor). Emoji yerine.
const HEART_D =
  'M12 20.7c-.27 0-.53-.09-.75-.27C6.6 16.6 3 13.5 3 9.45 3 6.68 5.13 4.5 7.8 4.5c1.68 0 3.2.83 4.2 2.15 1-1.32 2.52-2.15 4.2-2.15 2.67 0 4.8 2.18 4.8 4.95 0 4.05-3.6 7.15-8.25 10.98-.22.18-.48.27-.75.27z';

export const SIMGELER = {
  kalp: `<path d="${HEART_D}"/>`,
  balon: '<path d="M4.5 7A2.5 2.5 0 0 1 7 4.5h10A2.5 2.5 0 0 1 19.5 7v7a2.5 2.5 0 0 1-2.5 2.5h-6l-4.5 3.5v-3.5H7A2.5 2.5 0 0 1 4.5 14z"/><path d="M8.5 9.5h7M8.5 12.5h4.5"/>',
  isilti: '<path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3M6 6l2 2M16 16l2 2M18 6l-2 2M8 16l-2 2"/><circle cx="12" cy="12" r="2.5"/>',
  ay: '<path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z"/><path d="M17 3.5v3M15.5 5h3"/>',
  foto: '<rect x="3.5" y="6.5" width="17" height="13" rx="3"/><path d="M8.5 6.5 10 4h4l1.5 2.5"/><circle cx="12" cy="13" r="3.5"/>',
  soru: '<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.6a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.6"/><path d="M12 16.8v.2"/>',
  zar: '<rect x="4" y="4" width="16" height="16" rx="4"/><circle cx="8.5" cy="8.5" r=".9"/><circle cx="15.5" cy="15.5" r=".9"/><circle cx="12" cy="12" r=".9"/><circle cx="15.5" cy="8.5" r=".9"/><circle cx="8.5" cy="15.5" r=".9"/>',
  dokunus: '<path d="M12 18.5c-3.2-2.6-5.5-4.6-5.5-7.1A3 3 0 0 1 12 10a3 3 0 0 1 5.5 1.4c0 2.5-2.3 4.5-5.5 7.1z"/><path d="M12 6.5V4M7.5 7.5 6 6M16.5 7.5 18 6"/>',
  bayrak: '<path d="M5 20.5V4.5"/><path d="M5 5h11l-2.5 3.5L16 12H5"/>',
  tuy: '<path d="M5 19c4-1 7-4 9-9l3-5M9 15c-1.5-1.5-2-4 0-7 2.5-3.5 8-3.5 8-3.5s0 5.5-3.5 8c-2 1.4-4 1.5-4.5 2.5"/>',
  paylas: '<path d="M12 14.5V4M8 7.5 12 3.5l4 4"/><path d="M5.5 11.5v7A1.5 1.5 0 0 0 7 20h10a1.5 1.5 0 0 0 1.5-1.5v-7"/>',
  indir: '<path d="M12 4v10.5M7.5 10 12 14.5 16.5 10"/><path d="M5 19.5h14"/>',
  takvim: '<rect x="3.8" y="5.3" width="16.4" height="14.7" rx="2.8"/><path d="M3.8 10h16.4M8.3 3.5v3.6M15.7 3.5v3.6"/><path d="M12 17.2c-.1 0-.2 0-.3-.1-1.5-1.2-2.4-2-2.4-3a1.4 1.4 0 0 1 2.7-.6 1.4 1.4 0 0 1 2.7.6c0 1-.9 1.8-2.4 3-.1.1-.2.1-.3.1z"/>',
  yuzuk: '<circle cx="12" cy="14.5" r="5.5"/><path d="m9.5 6 2.5-2.5L14.5 6 12 8.8z"/>',
  alev: '<path d="M12 21c-3.6 0-6-2.4-6-5.6 0-3.4 2.6-5 3.4-8.4 1.7 1.2 2.6 2.7 2.8 4.3.9-.8 1.5-2 1.6-3.3 2.4 1.8 4.2 4.5 4.2 7.4C18 18.6 15.6 21 12 21z"/>',
  zarf: '<rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><path d="m4 7 8 6 8-6"/>',
  resim: '<rect x="3.5" y="5" width="17" height="14" rx="2.8"/><circle cx="9" cy="10" r="1.7"/><path d="m4 17 4.6-4.2 3.4 3 2.6-2.2L20 18"/>',
  mikrofon: '<rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5"/>',
  kilit: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  madalya: '<circle cx="12" cy="9" r="5.5"/><path d="m8.6 13.4-1.6 7.1 5-2.6 5 2.6-1.6-7.1"/>',
  kitap: '<path d="M12 6.5c-1.8-1.3-4.3-2-7.5-2v13c3.2 0 5.7.7 7.5 2 1.8-1.3 4.3-2 7.5-2v-13c-3.2 0-5.7.7-7.5 2z"/><path d="M12 6.5v13"/>',
  yazici: '<path d="M7 9V4.5h10V9"/><rect x="3.5" y="9" width="17" height="7.5" rx="2.5"/><path d="M7 14h10v5.5H7z"/>',
  kupa: '<path d="M7.5 4.5h9v4a4.5 4.5 0 0 1-9 0z"/><path d="M7.5 6H4.5a3 3 0 0 0 3 3.5M16.5 6h3a3 3 0 0 1-3 3.5M12 13v3.5M8.5 20h7M9.5 20l.6-3.5h3.8l.6 3.5"/>',
};

/** Satır içi SVG metni (h(..., { html }) için). */
export function simgeSvg(ad, kalinlik = 1.75) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${kalinlik}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${SIMGELER[ad] || SIMGELER.kalp}</svg>`;
}
