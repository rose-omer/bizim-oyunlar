// Yavrumuz: günün görevi şeridi, seri noktaları ve görev alt sayfasının stili. Alt sayfa DOM'u app.js'te.
// Üst düzeyde DOM yok: Node testi bu dosyayı güvenle yükler.
import { h } from '../../js/core/ui.js';
import { ikon } from './ikonlar.js';

const NOKTA_HEDEF = 7; // noktalar yalnız ilk ödüle kadar çizilir
const NOKTA_IKON = Object.freeze({ dolu: 'alev', hediye: 'hediye' });

/** s: seri.js seriDurumu sonucu. -> [{ gun, durum: 'dolu'|'bos'|'hediye' }]; başka ödül hedefinde ya da seri yoksa null. */
export function seriNoktalari(s) {
  if (!s?.n || s.sonraki?.gun !== NOKTA_HEDEF) return null;
  return Array.from({ length: NOKTA_HEDEF }, (_, i) => {
    const gun = i + 1;
    if (gun === NOKTA_HEDEF) return { gun, durum: 'hediye' };
    return { gun, durum: gun <= s.n ? 'dolu' : 'bos' };
  });
}

/** Şeridin ekran okuyucu metni. */
export const gorevSeritEtiket = ({ metin, goster, gerek }) => `Günün görevi: ${metin}. ${goster}/${gerek}.`;

/** Ana ekran şeridi. onAc: dokununca. -> { el, guncelle({ gizli, metin, goster, gerek, tamam, seriN }) } */
export function gorevSeritKur({ onAc }) {
  const hap = h('span', { class: 'yvg-hap' });
  const metinEl = h('span', { class: 'yvg-metin' });
  const seriSayi = h('span', {});
  const seriEl = h('span', { class: 'yvg-seri', hidden: true }, h('span', { html: ikon('alev', 18) }), seriSayi);
  const el = h('button', { type: 'button', class: 'yvg-serit', onclick: () => onAc?.() },
    hap, metinEl, seriEl, h('span', { class: 'yvg-ileri', html: ikon('ileri', 18) }));

  function guncelle({ gizli, metin, goster, gerek, tamam, seriN }) {
    el.hidden = Boolean(gizli);
    if (gizli) return;
    hap.textContent = `${goster}/${gerek}`;
    metinEl.textContent = metin;
    seriEl.hidden = !seriN;
    seriSayi.textContent = seriN ? String(seriN) : '';
    el.dataset.tamam = String(Boolean(tamam));
    el.setAttribute('aria-label', gorevSeritEtiket({ metin, goster, gerek }));
  }
  return { el, guncelle };
}

/** Alt sayfadaki seri noktaları. guncelle(s): s seriDurumu sonucu; nokta yoksa ya da s null ise gizli. */
export function seriNoktaKur() {
  const el = h('div', { class: 'yvg-noktalar', role: 'img', hidden: true });

  function guncelle(s) {
    const noktalar = seriNoktalari(s);
    el.hidden = !noktalar;
    if (!noktalar) return;
    el.setAttribute('aria-label', `${s.n} gün · ${s.sonraki.gun}. günde hediye var, ${s.sonraki.kalan} gün kaldı`);
    el.replaceChildren(...noktalar.map(({ gun, durum }) => h('span', {
      class: 'yvg-nokta', dataset: { durum }, html: ikon(NOKTA_IKON[durum], 19) || String(gun),
    })));
  }
  return { el, guncelle };
}

export const CSS = `
.yvg-serit {
  display: flex; align-items: center; gap: 10px; width: 100%; min-height: 54px; margin: 0; padding: 0 12px 0 14px;
  border: 0; border-radius: 18px; background: var(--surface-2); color: var(--text);
  font-family: var(--font-body); font-size: 0.9375rem; line-height: 1.3; text-align: left; touch-action: manipulation;
}
.yvg-serit[hidden] { display: none; }
.yvg-serit:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
.yvg-hap {
  display: grid; place-items: center; flex: none; min-height: 28px; padding: 0 9px; border-radius: 999px; background: var(--bg);
  font-size: 0.8125rem; font-weight: 800; font-variant-numeric: tabular-nums;
}
.yvg-serit[data-tamam='true'] .yvg-hap { background: var(--good); color: var(--bg); }
.yvg-metin { flex: 1; min-width: 0; overflow: hidden; font-weight: 800; white-space: nowrap; text-overflow: ellipsis; }
.yvg-seri { display: flex; align-items: center; flex: none; gap: 3px; color: var(--accent-strong); font-weight: 800; font-variant-numeric: tabular-nums; }
.yvg-seri[hidden] { display: none; }
.yvg-ileri { flex: none; color: var(--muted); }

.yvg-noktalar {
  display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 36px); justify-content: space-between;
  padding-top: 14px; border-top: 1px solid var(--line);
}
.yvg-noktalar[hidden] { display: none; }
.yvg-nokta {
  display: grid; place-items: center; aspect-ratio: 1; border-radius: 50%; background: var(--surface-2); color: var(--muted);
  font-size: 0.8125rem; font-weight: 800; font-variant-numeric: tabular-nums;
}
.yvg-nokta[data-durum='dolu'] { background: var(--accent); color: var(--accent-ink); }
.yvg-nokta[data-durum='hediye'] { background: var(--accent-soft); color: var(--accent-strong); }

.yv-gorev { position: relative; display: flex; flex-direction: column; gap: 12px; }
.yv-gorev[hidden] { display: none; }
.yv-gorev-bas { display: flex; align-items: center; gap: 12px; min-width: 0; }
.yv-gorev-emoji {
  display: grid; place-items: center; flex: none; width: 40px; height: 40px; border-radius: 50%;
  background: var(--surface-2); color: var(--text); font-size: 1.25rem; line-height: 1;
}
.yv-gorev-govde { flex: 1 1 auto; min-width: 0; }
.yv-gorev .yv-gorev-baslik {
  position: absolute; width: 1px; height: 1px; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap;
}
.yv-gorev-metin {
  margin: 0; font-family: var(--font-display); font-size: 1.25rem; font-weight: 600; font-variation-settings: 'SOFT' 100;
  line-height: 1.2; overflow-wrap: anywhere;
}
.yv-gorev-sayi { flex: none; color: var(--muted); font-size: 0.9375rem; font-weight: 800; font-variant-numeric: tabular-nums; }
.yv-gorev-durum { margin: 0; color: var(--muted); font-size: 0.9375rem; font-weight: 600; line-height: 1.4; }
.yv-gorev-durum strong { color: var(--text); font-weight: 800; font-variant-numeric: tabular-nums; }
.yv-gorev-kisi[data-tamam='true'] strong,
.yv-gorev[data-tamam='true'] .yv-gorev-sayi,
.yv-gorev[data-tamam='true'] .yv-gorev-durum { color: var(--good); }
.yv-gorev[data-tamam='true'] .yv-cubuk-dolu { background: var(--good); }
.yv-gorev-seri { margin: 0; color: var(--muted); font-size: 0.9375rem; font-weight: 700; line-height: 1.4; }
.yv-gorev-seri[hidden] { display: none; }
.yv-gorev-odalar { display: flex; flex-wrap: wrap; gap: 8px; }
.yv-gorev-odalar[hidden] { display: none; }
.yv-gorev-odalar .btn.small { min-height: 44px; padding: 0 16px; font-size: 0.9375rem; font-weight: 800; }
.yv-gorev-odalar .btn.yv-gorev-git { --btn-bg: var(--surface-2); --btn-line: transparent; gap: 6px; }

.yv-rehber { display: flex; flex-direction: column; gap: 12px; padding: 16px; border-radius: 22px; background: var(--surface); }
.yv-rehber[hidden] { display: none; }
.yv-rehber .yv-gorev-baslik {
  margin: 0; color: var(--text); font-family: var(--font-display); font-size: 1.25rem; font-weight: 600;
  font-variation-settings: 'SOFT' 100; line-height: 1.2;
}
.yv-adimlar { display: flex; flex-direction: column; gap: 12px; margin: 0; padding: 0; list-style: none; }
.yv-adim { display: grid; grid-template-columns: 28px minmax(0, 1fr); gap: 10px; align-items: start; }
.yv-adim-no {
  display: grid; place-items: center; width: 28px; height: 28px; border-radius: 50%; background: var(--surface-2); color: var(--muted);
  font-size: 0.8125rem; font-weight: 800; font-variant-numeric: tabular-nums;
}
.yv-adim[data-durum='simdi'] .yv-adim-no { background: var(--accent-soft); color: var(--accent-strong); }
.yv-adim[data-durum='tamam'] .yv-adim-no { background: var(--good-soft); color: var(--good); }
.yv-adim-govde { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; min-width: 0; }
.yv-adim-baslik { font-size: 0.9375rem; font-weight: 800; line-height: 1.35; }
.yv-adim[data-durum='sonra'] .yv-adim-baslik { color: var(--muted); }
.yv-adim-alt { color: var(--muted); font-size: 0.8125rem; font-weight: 600; line-height: 1.4; }
.btn.small.yv-davet { min-height: 44px; margin-top: 6px; }
.yv-davet[hidden] { display: none; }

@media (prefers-reduced-motion: no-preference) {
  .yvg-serit { transition: transform 0.12s var(--ease); }
  .yvg-serit:active { transform: scale(0.98); }
}
`;
