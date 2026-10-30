// Satranç taşları: satır içi SVG (45×45). Renkler CSS'ten (.sc-piece.beyaz / .siyah): --pf dolgu, --ps çizgi.
// Gövde .g (dolgu + kontur), ayrıntı çizgileri .d, göz .e.

const BASE = '<path class="g" d="M11.5 39.5h22v-2.4c0-1.5-1.2-2.7-2.7-2.7H14.2c-1.5 0-2.7 1.2-2.7 2.7z"/>';

const SHAPES = {
  p: `<path class="g" d="M22.5 9a5 5 0 0 0-3.3 8.75c-1.7.55-2.9 1.6-2.9 2.85 0 1.05.85 1.95 2.25 2.5-.55 4.3-2.4 8.1-4.9 11.3h17.7c-2.5-3.2-4.35-7-4.9-11.3 1.4-.55 2.25-1.45 2.25-2.5 0-1.25-1.2-2.3-2.9-2.85A5 5 0 0 0 22.5 9z"/>`,
  r: `<path class="g" d="M12.5 9.5h4.2v3.3h3.4V9.5h4.8v3.3h3.4V9.5h4.2v7.6l-3.3 2.6v10.6l2.6 4.1H13.2l2.6-4.1V19.7l-3.3-2.6z"/>
      <path class="d" d="M15.8 19.7h13.4M15.8 30.3h13.4"/>`,
  n: `<path class="g" d="M15.2 34.4c.3-4.4 2.2-7.2 5.2-9.6-2.4 1.3-5.3 2.2-8.1 2.3-1.7.1-3-1.2-3-2.9 0-1.4.3-2.6.9-3.6 2.5-4.2 5.6-7.4 9.2-9.4l1.6-4.6 2.8 3.5c5.6.7 10.2 5.6 10.2 13.7 0 4.2-.8 7.7-2.1 10.6z"/>
      <path class="d" d="M24.6 12.6c4.4 1.7 6.9 6 7.1 11.6M12.4 23.6l1.6-.6"/>
      <circle class="e" cx="17.6" cy="16.6" r="1.3"/>`,
  b: `<circle class="g" cx="22.5" cy="8.3" r="2.4"/>
      <path class="g" d="M22.5 11.2c-4.7 3.4-7.3 7.6-7.3 11.5 0 3 1.8 5 4.2 5.8l-2.6 5.9h11.4l-2.6-5.9c2.4-.8 4.2-2.8 4.2-5.8 0-3.9-2.6-8.1-7.3-11.5z"/>
      <path class="d" d="M25.3 16.3l-3.9 4.7M19.4 28.5h6.2"/>`,
  q: `<path class="g" d="M13 34.4 10.6 16l5.6 7.6 1.3-11.4 4.6 10.3 1.4-11.9 2.1 11.9 4.6-10.3 1.3 11.4 5.6-7.6L32 34.4z"/>
      <circle class="g" cx="10.4" cy="14.6" r="2.1"/><circle class="g" cx="17.4" cy="11.1" r="2.1"/>
      <circle class="g" cx="23.5" cy="9.4" r="2.1"/><circle class="g" cx="29.6" cy="11.1" r="2.1"/>
      <circle class="g" cx="35.6" cy="14.6" r="2.1"/>
      <path class="d" d="M13.6 29.6c5.9-1.6 11.9-1.6 17.8 0"/>`,
  k: `<path class="g" d="M21.3 4.6h2.4v2.9h2.9v2.4h-2.9v3.6h-2.4V9.9h-2.9V7.5h2.9z"/>
      <path class="g" d="M22.5 13.4c-1.6 0-2.8 1.2-2.8 2.7 0 .8.3 1.5.9 2-5.4-.6-10.1 1.9-10.1 6.8 0 3.9 2.5 6.6 3.8 9.5h16.4c1.3-2.9 3.8-5.6 3.8-9.5 0-4.9-4.7-7.4-10.1-6.8.6-.5.9-1.2.9-2 0-1.5-1.2-2.7-2.8-2.7z"/>
      <path class="d" d="M15.2 29.4c4.9-1.5 9.7-1.5 14.6 0M22.5 18.6v6.6"/>`,
};

/** ch: 'PNBRQK' (beyaz) ya da 'pnbrqk' (siyah) -> SVG dizesi. */
export function pieceSvg(ch, cls = '') {
  const t = ch.toLowerCase();
  const color = ch === t ? 'siyah' : 'beyaz';
  return `<svg class="sc-piece ${color} ${cls}" viewBox="0 0 45 45" aria-hidden="true" focusable="false">${SHAPES[t]}${BASE}</svg>`;
}

export const PIECE_TR = { p: 'piyon', n: 'at', b: 'fil', r: 'kale', q: 'vezir', k: 'şah' };
