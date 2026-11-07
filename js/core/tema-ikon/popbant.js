// Üretildi: dev/tema-uret.mjs. Elle düzenleme.
const HEART_D =
  'M12 20.7c-.27 0-.53-.09-.75-.27C6.6 16.6 3 13.5 3 9.45 3 6.68 5.13 4.5 7.8 4.5c1.68 0 3.2.83 4.2 2.15 1-1.32 2.52-2.15 4.2-2.15 2.67 0 4.8 2.18 4.8 4.95 0 4.05-3.6 7.15-8.25 10.98-.22.18-.48.27-.75.27z';
const STROKE = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

export const ICONS = {
  heart: `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${HEART_D}"/></svg>`,
  mark: `<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><rect x="1.5" y="1.5" width="29" height="29" rx="6" style="fill:var(--accent);stroke:var(--line);stroke-width:3"/><path transform="translate(5 5.2) scale(.92)" d="${HEART_D}" style="fill:var(--surface);stroke:var(--line);stroke-width:2.2"/></svg>`,
  back: `<svg viewBox="0 0 24 24" ${STROKE} aria-hidden="true" focusable="false"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg>`,
  soundOn: `<svg viewBox="0 0 24 24" ${STROKE} aria-hidden="true" focusable="false"><path d="M4 9.5v5h3.5l4.5 4v-13l-4.5 4z"/><path d="M15.5 9.2a4 4 0 0 1 0 5.6M18.2 6.5a7.8 7.8 0 0 1 0 11"/></svg>`,
  soundOff: `<svg viewBox="0 0 24 24" ${STROKE} aria-hidden="true" focusable="false"><path d="M4 9.5v5h3.5l4.5 4v-13l-4.5 4z"/><path d="m16 9.5 5 5m0-5-5 5"/></svg>`,
  share: `<svg viewBox="0 0 24 24" ${STROKE} aria-hidden="true" focusable="false"><path d="M12 14.5V4M8 7.5 12 3.5l4 4"/><path d="M5.5 11.5v7A1.5 1.5 0 0 0 7 20h10a1.5 1.5 0 0 0 1.5-1.5v-7"/></svg>`,
  copy: `<svg viewBox="0 0 24 24" ${STROKE} aria-hidden="true" focusable="false"><rect x="8.5" y="8.5" width="11" height="11" rx="2.5"/><path d="M15.5 8.5V6.2A1.7 1.7 0 0 0 13.8 4.5H6.2A1.7 1.7 0 0 0 4.5 6.2v7.6a1.7 1.7 0 0 0 1.7 1.7h2.3"/></svg>`,
  settings: `<svg viewBox="0 0 24 24" ${STROKE} aria-hidden="true" focusable="false"><path d="M4 7h9m4 0h3M4 17h3m4 0h9"/><circle cx="15" cy="7" r="2.2"/><circle cx="9" cy="17" r="2.2"/></svg>`,
  close: `<svg viewBox="0 0 24 24" ${STROKE} aria-hidden="true" focusable="false"><path d="M6.5 6.5l11 11m0-11-11 11"/></svg>`,
  chevron: `<svg viewBox="0 0 24 24" ${STROKE} aria-hidden="true" focusable="false"><path d="m9.5 5.5 6.5 6.5-6.5 6.5"/></svg>`,
  pin: `<svg viewBox="0 0 24 24" ${STROKE} aria-hidden="true" focusable="false"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/></svg>`,
  lock: `<svg viewBox="0 0 24 24" ${STROKE} aria-hidden="true" focusable="false"><rect x="5" y="10.5" width="14" height="9.5" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/><path d="M12 14.4v2"/></svg>`,
};

// Alt sekme simgeleri: tek çizgi ailesi (1.75). Etkin sekmede .f parçaları dolar.
const TAB_STROKE = 'fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"';
export const TAB_ICONS = {
  biz: `<svg viewBox="0 0 24 24" ${TAB_STROKE} aria-hidden="true" focusable="false"><path class="f" d="${HEART_D}"/></svg>`,
  sohbet: `<svg viewBox="0 0 24 24" ${TAB_STROKE} aria-hidden="true" focusable="false"><path class="f" d="M4.5 7A2.5 2.5 0 0 1 7 4.5h10A2.5 2.5 0 0 1 19.5 7v7a2.5 2.5 0 0 1-2.5 2.5h-6l-4.5 3.5v-3.5H7A2.5 2.5 0 0 1 4.5 14z"/><path d="M8.5 9.5h7M8.5 12.5h4.5"/></svg>`,
  anilar: `<svg viewBox="0 0 24 24" ${TAB_STROKE} aria-hidden="true" focusable="false"><rect class="f" x="3.5" y="5" width="17" height="14" rx="2.8"/><circle cx="9" cy="10" r="1.7"/><path d="m4 17 4.6-4.2 3.4 3 2.6-2.2L20 18"/></svg>`,
  gunler: `<svg viewBox="0 0 24 24" ${TAB_STROKE} aria-hidden="true" focusable="false"><rect class="f" x="3.8" y="5.3" width="16.4" height="14.7" rx="2.8"/><path d="M3.8 10h16.4M8.3 3.5v3.6M15.7 3.5v3.6"/><path d="M12 17.2c-.1 0-.2 0-.3-.1-1.5-1.2-2.4-2-2.4-3a1.4 1.4 0 0 1 2.7-.6 1.4 1.4 0 0 1 2.7.6c0 1-.9 1.8-2.4 3-.1.1-.2.1-.3.1z"/></svg>`,
  yavru: `<svg viewBox="0 0 24 24" ${TAB_STROKE} aria-hidden="true" focusable="false"><circle class="f" cx="12" cy="13" r="8"/><path d="M12 5c-1.7-.3-2.6-1.3-2-2.2.5-.7 1.7-.5 1.7.3"/><path d="M9.2 11.8v.5M14.8 11.8v.5"/><path d="M9.3 15.4a3.3 3.3 0 0 0 5.4 0"/></svg>`,
  daha: `<svg viewBox="0 0 24 24" ${TAB_STROKE} aria-hidden="true" focusable="false"><rect class="f" x="4" y="4" width="6.6" height="6.6" rx="2"/><rect class="f" x="13.4" y="4" width="6.6" height="6.6" rx="2"/><rect class="f" x="4" y="13.4" width="6.6" height="6.6" rx="2"/><rect class="f" x="13.4" y="13.4" width="6.6" height="6.6" rx="2"/></svg>`,
};
