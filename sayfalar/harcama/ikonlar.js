// Ortak Harcamalar ikonları: kategori çizimleri + Listeler'in ortak çizgi ikonları (aynı kalınlık ve uç).
import { IKON } from '../listeler/ikonlar.js';

const S = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
const svg = (d) => `<svg viewBox="0 0 24 24" ${S} aria-hidden="true" focusable="false">${d}</svg>`;

export const KAT_IKON = {
  market: svg('<path d="M5.5 8h13l-1 11.5a1.5 1.5 0 0 1-1.5 1.4H8a1.5 1.5 0 0 1-1.5-1.4z"/><path d="M9 10V7a3 3 0 0 1 6 0v3"/>'),
  yemek: svg('<path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z"/><path d="M16 10.5h1.5a2.5 2.5 0 0 1 0 5H16M9 3.5V6m3.5-2.5V6"/>'),
  ev: svg('<path d="M4 11 12 4.5l8 6.5"/><path d="M6 9.5V19a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V9.5"/><path d="M10 20v-5h4v5"/>'),
  ulasim: svg('<rect x="4" y="11" width="16" height="6" rx="1.5"/><path d="M6 11l1.6-3.8a1.5 1.5 0 0 1 1.4-.9h6a1.5 1.5 0 0 1 1.4.9L18 11M7 17v2m10-2v2"/><circle cx="8" cy="14" r=".6"/><circle cx="16" cy="14" r=".6"/>'),
  eglence: svg('<path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h13A1.5 1.5 0 0 1 20 8.5V10a2 2 0 0 0 0 4v1.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 15.5V14a2 2 0 0 0 0-4z"/><path d="M14 8v1.5m0 2.2v.6m0 2.2V16"/>'),
  hediye: svg('<rect x="4" y="9" width="16" height="4" rx="1"/><path d="M5.5 13v6a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-6M12 9v11"/><path d="M12 9C10.5 5.5 7 5.5 7 7.5S10 9 12 9s5-.5 5-1.5-3.5-2-5 1.5z"/>'),
  seyahat: svg('<rect x="4" y="8" width="16" height="11" rx="2"/><path d="M9 8V6a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 6v2M4 13h16"/>'),
  diger: IKON.more,
};

export function ikon(ad) {
  const t = document.createElement('template');
  t.innerHTML = KAT_IKON[ad] || IKON[ad] || '';
  return t.content.firstElementChild;
}
