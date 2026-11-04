// Ana sayfa için "Geçen yıl bugün" kartı: geçmiş yıllarda bugüne denk gelen en yakın anı.
// Anı yoksa bölüm gizli kalır. CSS kartın içinde gelir (sınıf öneki agk-, yalnız değişkenler).
//   const kapat = await mountBugunGecenKart(el, { room });   // room = joinRoom sonucu
//   kapat();  // abonelikleri bırakır
import { openCollection } from '../../js/core/veri.js';
import { pageUrl } from '../../js/core/identity.js';
import { fotoImg } from '../../js/core/foto.js';
import { toDay, parseDay } from '../../js/core/gunler.js';
import { h, icon } from '../../js/core/ui.js';
import { AY_ADLARI, buGunGecmisYillar, buGunBasligi, gunYazi } from './mantik.js';

const CSS = `
.agk { display: grid; grid-template-columns: 88px minmax(0, 1fr) auto; align-items: center; gap: 14px;
  padding: 10px 12px 10px 10px; border: 1px solid color-mix(in srgb, var(--accent) 22%, var(--line));
  border-radius: var(--radius-lg); background: var(--accent-soft); box-shadow: var(--shadow-sm);
  color: var(--text); text-decoration: none; transition: box-shadow .18s ease, transform .12s var(--ease); }
.agk:active { transform: scale(.985); }
@media (hover: hover) { .agk:hover { box-shadow: var(--shadow); } }
.agk:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
.agk-kapak { display: grid; place-items: center; width: 88px; height: 88px; overflow: hidden; border-radius: 14px;
  background: var(--surface); box-shadow: var(--shadow-sm); color: var(--accent-strong); text-align: center; }
.agk-kapak img { width: 100%; height: 100%; object-fit: cover; }
.agk-kapak img[data-hata] { opacity: 0; }
.agk-gun { display: block; font-family: var(--font-display); font-size: 2rem; font-weight: 600; line-height: 1; }
.agk-ay { display: block; margin-top: 2px; font-size: .75rem; font-weight: 750; }
.agk-govde { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.agk-baslik { margin: 0; color: var(--accent-strong); font-family: var(--font-display); font-size: 1.1875rem;
  font-style: italic; font-weight: 600; font-variation-settings: 'SOFT' 100; line-height: 1.25; }
.agk-ani { display: -webkit-box; margin: 0; overflow: hidden; font-weight: 750; line-height: 1.35; overflow-wrap: anywhere;
  -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.agk-alt { margin: 0; color: color-mix(in srgb, var(--text) 72%, var(--accent-strong)); font-size: .875rem; font-weight: 650; line-height: 1.35; overflow-wrap: anywhere; }
.agk-git { display: grid; place-items: center; width: 24px; color: var(--accent-strong); }
.agk-git svg { width: 20px; height: 20px; }
@media (prefers-reduced-motion: reduce) { .agk { transition: none; } }
`;

function kapak(ani) {
  const foto = ani.data.fotolar?.[0];
  if (foto) return h('span', { class: 'agk-kapak', 'aria-hidden': 'true' }, fotoImg(foto, { alt: '', eager: true }));
  const p = parseDay(ani.data.tarih);
  return h('span', { class: 'agk-kapak', 'aria-hidden': 'true' },
    h('span', {}, h('span', { class: 'agk-gun' }, String(p.d)), h('span', { class: 'agk-ay' }, AY_ADLARI[p.m - 1])));
}

/** el içine kartı kurar; anı değişince ve gün dönünce tazeler. Anı yoksa el gizlenir. -> kapat() */
export async function mountBugunGecenKart(el, { room } = {}) {
  if (!el || !room?.roomId) {
    el?.replaceChildren();
    return () => {};
  }
  const col = await openCollection(room, 'ani');
  let imza = '';
  const ciz = () => {
    const liste = buGunGecmisYillar(col.all(), toDay());
    const ilk = liste[0];
    const yeni = JSON.stringify(ilk ? [toDay(), liste.length, ilk.ani.id, ilk.ani.data] : null);
    if (yeni === imza) return;
    imza = yeni;
    el.hidden = !ilk;
    if (!ilk) {
      el.replaceChildren();
      return;
    }
    const { ani, yilOnce } = ilk;
    const diger = liste.length - 1;
    el.replaceChildren(h('style', {}, CSS), h('a', { class: 'agk', href: pageUrl('sayfalar/anilar/', { id: ani.id }) },
      kapak(ani),
      h('span', { class: 'agk-govde' },
        h('span', { class: 'agk-baslik' }, buGunBasligi(yilOnce)),
        h('span', { class: 'agk-ani' }, ani.data.baslik),
        h('span', { class: 'agk-alt' }, [gunYazi(ani.data.tarih), ani.data.yer, diger ? `${diger} anı daha` : null].filter(Boolean).join(' · '))),
      h('span', { class: 'agk-git', 'aria-hidden': 'true' }, icon('chevron'))));
  };
  const onGorunur = () => { if (document.visibilityState === 'visible') ciz(); };
  const off = col.on('change', ciz);
  document.addEventListener('visibilitychange', onGorunur);
  ciz();
  return () => {
    off?.();
    document.removeEventListener('visibilitychange', onGorunur);
    col.close();
  };
}
