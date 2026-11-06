// Yavrumuz: Oyunlar alt sayfasının içeriği. oyunGruplari ve cubukYuzde saf; oyunSecKur DOM kurar (üst düzeyde DOM yok).
import { h } from '../../js/core/ui.js';
import { ikon, paraIkon, OYUN_IKON } from './ikonlar.js';
import { OYUNLAR, JETON_SINIRI } from './oyunlar/cerceve.js';
import { SITE_ODUL } from './site-oyun.js';

const BIRLIKTE = ['salla'];
const TEK_ONCE = ['giydir', 'tarif'];

/** Kayıt -> iki bölüm. Tek başına: TEK_ONCE başta, kalanı kayıt sırasıyla. */
export function oyunGruplari(oyunlar) {
  const idler = Object.keys(oyunlar);
  const kalan = idler.filter((id) => !BIRLIKTE.includes(id) && !TEK_ONCE.includes(id));
  return [
    { baslik: 'Birlikte', oyunlar: BIRLIKTE.filter((id) => idler.includes(id)) },
    { baslik: 'Tek başına', oyunlar: [...TEK_ONCE.filter((id) => idler.includes(id)), ...kalan] },
  ];
}

/** Günlük çubuğun dolu yüzdesi: 0..100. Bozuk girdi 0. */
export function cubukYuzde(bugun, sinir) {
  if (!(sinir > 0) || !(bugun > 0)) return 0;
  return Math.min(100, (bugun * 100) / sinir);
}

const satirEtiket = (ad, oz, enCok) => `${ad}: ${oz} En çok ${enCok} jeton.`;

function satirKur(etiket, ozellik, { ikonAd, ad, oz, enCok, vurgu = false }) {
  const ozEl = h('span', { class: 'yvos-oz' }, oz);
  const el = h(etiket, { ...ozellik, class: 'yvos-satir', 'aria-label': satirEtiket(ad, oz, enCok) },
    h('span', { class: vurgu ? 'yvos-kutu yvos-vurgu' : 'yvos-kutu', html: ikon(ikonAd, 25) }),
    h('span', { class: 'yvos-yazi' }, h('span', { class: 'yvos-ad' }, ad), ozEl),
    h('span', { class: 'yvos-sag', html: paraIkon(16) }, enCok));
  const ozYaz = (yeni) => {
    ozEl.textContent = yeni;
    el.setAttribute('aria-label', satirEtiket(ad, yeni, enCok));
  };
  return { el, ozYaz };
}

const bolum = (baslik, satirlar) => h('section', {},
  h('div', { class: 'yvos-bas' }, h('h3', { class: 'yvos-baslik' }, baslik), h('span', { class: 'yvos-encok' }, 'en çok')),
  h('ul', { class: 'yvos-liste' }, satirlar.map((s) => h('li', {}, s.el))));

/** onOyun(id, dugme): satıra dokununca. lobiUrl: site oyunları için ana sayfa adresi. -> { el, guncelle({ bugun, sinir, partnerVar }) } */
export function oyunSecKur({ onOyun, lobiUrl }) {
  const oyunSatiri = (id, vurgu) => satirKur('button', { type: 'button', onclick: (e) => onOyun(id, e.currentTarget) }, {
    ikonAd: OYUN_IKON[id], ad: OYUNLAR[id].ad, oz: OYUNLAR[id].ozet, enCok: JETON_SINIRI, vurgu,
  });
  const salla = oyunSatiri('salla', true);
  const site = satirKur('a', { href: lobiUrl }, {
    ikonAd: 'kalp',
    ad: 'Dört Taş, Dama, Tavla…',
    oz: `Kazanan ${SITE_ODUL.kazan}, kaybeden ${SITE_ODUL.kayip} jeton.`,
    enCok: SITE_ODUL.kazan,
  });
  const [birlikte, tek] = oyunGruplari(OYUNLAR);

  const sayac = h('span', { class: 'yvos-sayac' });
  const dolu = h('div', { class: 'yvos-dolu' });
  const el = h('div', { class: 'yvos-kok' },
    h('div', { class: 'yvos-ust' },
      h('div', { class: 'yvos-ust-satir' }, h('span', {}, 'Bugün kazandığın'), sayac),
      h('div', { class: 'yvos-iz', 'aria-hidden': 'true' }, dolu)),
    bolum(birlikte.baslik, [salla, site]),
    bolum(tek.baslik, tek.oyunlar.map((id) => oyunSatiri(id, false))));

  function guncelle({ bugun, sinir, partnerVar }) {
    sayac.textContent = `${bugun} / ${sinir}`;
    dolu.style.width = `${cubukYuzde(bugun, sinir)}%`;
    salla.ozYaz(partnerVar ? 'Sevgilin burada, hemen başlayın.' : OYUNLAR.salla.ozet);
  }
  return { el, guncelle };
}

export const CSS = `
.yvos-kok { display: flex; flex-direction: column; min-width: 0; }
.yvos-ust { margin: 2px 0 4px; }
.yvos-ust-satir { display: flex; justify-content: space-between; gap: 12px; font-size: 0.8125rem; font-weight: 700; color: var(--muted); }
.yvos-sayac { flex: none; font-variant-numeric: tabular-nums; }
.yvos-iz { height: 6px; margin-top: 6px; border-radius: 3px; background: var(--line); overflow: hidden; }
.yvos-dolu { width: 0; height: 100%; border-radius: 3px; background: var(--yvb-altin); box-shadow: inset 0 0 0 1px var(--yvb-altin-koyu); }
.yvos-bas { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin: 14px 0 2px; }
.yvos-baslik { margin: 0; font-family: var(--font-display); font-size: 1.25rem; font-weight: 600; font-variation-settings: 'SOFT' 100; line-height: 1.2; color: var(--text); }
.yvos-encok { flex: none; font-size: 0.8125rem; font-weight: 700; color: var(--muted); }
.yvos-liste { list-style: none; margin: 0; padding: 0; }
.yvos-satir {
  box-sizing: border-box; display: flex; align-items: center; gap: 13px; width: 100%; min-height: 66px; margin: 0; padding: 8px 0;
  border: 0; border-radius: 16px; background: none; color: var(--text); font: inherit; text-align: left; text-decoration: none; cursor: pointer; touch-action: manipulation;
}
.yvos-satir:focus-visible { outline: 3px solid var(--focus); outline-offset: 4px; }
.yvos-kutu { flex: none; display: grid; place-items: center; width: 46px; height: 46px; border-radius: 15px; background: var(--surface-2); color: var(--text); }
.yvos-vurgu { background: var(--accent); color: var(--accent-ink); }
.yvos-yazi { flex: 1; min-width: 0; }
.yvos-ad { display: block; font-size: 0.9375rem; font-weight: 800; line-height: 1.25; }
.yvos-oz { display: block; font-size: 0.8125rem; font-weight: 600; line-height: 1.3; color: var(--muted); }
.yvos-sag { flex: none; display: flex; align-items: center; gap: 4px; font-size: 0.8125rem; font-weight: 800; font-variant-numeric: tabular-nums; }
.yvos-satir:active .yvos-kutu { background: var(--line); }
.yvos-satir:active .yvos-vurgu { background: var(--accent-strong); }
@media (hover: hover) {
  .yvos-satir:hover .yvos-kutu { background: var(--line); }
  .yvos-satir:hover .yvos-vurgu { background: var(--accent-strong); }
}
@media (prefers-reduced-motion: no-preference) {
  .yvos-dolu { transition: width 0.3s ease-out; }
  .yvos-kutu { transition: background-color 0.15s ease-out; }
}
`;
