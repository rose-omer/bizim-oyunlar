// Listeler ve Randevu sayfalarının çizgi ikonları (ui.js ICONS ile aynı çizgi kalınlığı).
const S = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
const svg = (d) => `<svg viewBox="0 0 24 24" ${S} aria-hidden="true" focusable="false">${d}</svg>`;

export const IKON = {
  check: svg('<path d="M5.5 12.5 10 17l8.5-9.5"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  more: svg('<circle cx="5.5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18.5" cy="12" r="1.2"/>'),
  edit: svg('<path d="M4.5 19.5h4l10-10a2.8 2.8 0 0 0-4-4l-10 10z"/><path d="m13.5 6.5 4 4"/>'),
  trash: svg('<path d="M4.5 7h15M10 11v6m4-6v6"/><path d="M6.5 7l.8 11.2A2 2 0 0 0 9.3 20h5.4a2 2 0 0 0 2-1.8L17.5 7M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7"/>'),
  photo: svg('<rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><circle cx="9" cy="10.5" r="1.6"/><path d="m20.5 15.5-4.5-4.5-8 8"/>'),
  undo: svg('<path d="M9 7.5 5 11.5l4 4"/><path d="M5.5 11.5H14a4.5 4.5 0 0 1 0 9h-2"/>'),
  heart: svg('<path d="M12 19.5s-7.5-4.4-7.5-10A4.2 4.2 0 0 1 12 7a4.2 4.2 0 0 1 7.5 2.5c0 5.6-7.5 10-7.5 10z"/>'),
  calendar: svg('<rect x="4" y="5.5" width="16" height="14.5" rx="2.5"/><path d="M4 10h16M8.5 3.5v4m7-4v4"/>'),
  dice: svg('<rect x="4" y="4" width="16" height="16" rx="3.5"/><circle cx="8.5" cy="8.5" r=".9"/><circle cx="15.5" cy="8.5" r=".9"/><circle cx="12" cy="12" r=".9"/><circle cx="8.5" cy="15.5" r=".9"/><circle cx="15.5" cy="15.5" r=".9"/>'),
  clock: svg('<circle cx="12" cy="12" r="8"/><path d="M12 8v4.5l3 1.8"/>'),
};

export function ikon(ad) {
  const t = document.createElement('template');
  t.innerHTML = IKON[ad] || '';
  return t.content.firstElementChild;
}
