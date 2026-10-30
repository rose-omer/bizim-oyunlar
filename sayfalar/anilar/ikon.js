// Anılar ve Mektuplar sayfalarının çizgi ikonları (24×24, 2 px, yuvarlak uç; ui.js ICONS ile aynı dil).
const S = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
const HEART = 'M12 20.7c-.27 0-.53-.09-.75-.27C6.6 16.6 3 13.5 3 9.45 3 6.68 5.13 4.5 7.8 4.5c1.68 0 3.2.83 4.2 2.15 1-1.32 2.52-2.15 4.2-2.15 2.67 0 4.8 2.18 4.8 4.95 0 4.05-3.6 7.15-8.25 10.98-.22.18-.48.27-.75.27z';

const YOLLAR = {
  arti: `<path d="M12 5v14M5 12h14"/>`,
  ara: `<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>`,
  takvim: `<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>`,
  konum: `<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/>`,
  kalp: `<path d="${HEART}"/>`,
  kalem: `<path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0 0-3l-1-1a2.1 2.1 0 0 0-3 0L4 16z"/><path d="m14 6 4 4"/>`,
  cop: `<path d="M4.5 7h15M9.5 7V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 5v2M6.5 7l1 12a1.8 1.8 0 0 0 1.8 1.5h5.4a1.8 1.8 0 0 0 1.8-1.5l1-12"/>`,
  genislet: `<path d="M14.5 4.5h5v5M9.5 19.5h-5v-5M19.5 4.5 14 10M4.5 19.5 10 14"/>`,
  sol: `<path d="M14.5 5.5 8 12l6.5 6.5"/>`,
  sag: `<path d="M9.5 5.5 16 12l-6.5 6.5"/>`,
  kapat: `<path d="M6.5 6.5l11 11m0-11-11 11"/>`,
  foto: `<rect x="3.5" y="4.5" width="17" height="15" rx="3"/><circle cx="9" cy="10" r="1.8"/><path d="m20.5 16-4.8-4.8L6 19.5"/>`,
  etiket: `<path d="M3.5 12.2V5a1.5 1.5 0 0 1 1.5-1.5h7.2l8.3 8.3a1.5 1.5 0 0 1 0 2.1l-7.2 7.2a1.5 1.5 0 0 1-2.1 0z"/><circle cx="8" cy="8" r="1.3"/>`,
  kilit: `<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>`,
  gonder: `<path d="M20.5 3.5 10 14M20.5 3.5 14 20.5l-4-6.5-6.5-4z"/>`,
  zarf: `<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="m3.8 7 8.2 6.2L20.2 7"/>`,
  izgara: `<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>`,
  cizelge: `<path d="M6 4v16"/><circle cx="6" cy="7" r="1.8"/><circle cx="6" cy="16" r="1.8"/><path d="M11 7h9M11 16h9"/>`,
  geri: `<path d="M14.5 5.5 8 12l6.5 6.5"/>`,
  saat: `<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>`,
  harita: `<path d="M9 4.5 3.5 6.6v12.9L9 17.4l6 2.1 5.5-2.1V4.5L15 6.6z"/><path d="M9 4.5v12.9M15 6.6v12.9"/>`,
  hedef: `<circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="12" r="2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/>`,
};

/** Çizgi ikon. dolu: kalp gibi içi dolu çizim (stroke yerine fill). */
export function ikon(ad, { dolu = false } = {}) {
  const t = document.createElement('template');
  const attrs = dolu ? 'fill="currentColor"' : S;
  t.innerHTML = `<svg viewBox="0 0 24 24" ${attrs} aria-hidden="true" focusable="false">${YOLLAR[ad] || ''}</svg>`;
  return t.content.firstElementChild;
}
