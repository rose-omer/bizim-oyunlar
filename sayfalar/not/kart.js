// Ana sayfa için küçük "Not" kartı: sevgilinin bana bıraktığı en son not. Sürprizse kapalı paket görünür.
// Not yoksa bölüm gizli kalır. CSS kartın içinde gelir (sınıf öneki ntk-, yalnız değişkenler).
//   const kapat = await mountNotKart(el, { room });   // room = joinRoom sonucu
//   kapat();  // abonelikleri bırakır
import { openCollection } from '../../js/core/veri.js';
import { openProfil } from '../../js/core/profil.js';
import { pageUrl } from '../../js/core/identity.js';
import { fotoImg } from '../../js/core/foto.js';
import { h, icon, formatDay, knownPartner } from '../../js/core/ui.js';
import { ek } from '../mektup/mantik.js';
import { renkSirasi } from '../kupon/mantik.js';
import { TUR, sonGelen, kapaliMi, yazan, kisalt } from './mantik.js';

const CSS = `
.ntk { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 14px;
  padding: 12px 14px 12px 12px; border: 1px solid var(--line); border-radius: var(--radius-lg);
  background: var(--surface); box-shadow: var(--shadow); color: var(--text); text-decoration: none;
  transition: box-shadow .18s ease, transform .12s var(--ease); }
.ntk:active { transform: scale(.985); }
@media (hover: hover) { .ntk:hover { box-shadow: var(--shadow-lg); } }
.ntk:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
.ntk-gorsel { position: relative; display: grid; place-items: center; width: 64px; height: 64px; overflow: hidden;
  border-radius: 4px; background-color: var(--ntk-kagit, var(--tint-6)); background-image: var(--grain);
  box-shadow: var(--shadow-sm); transform: rotate(-3deg); font-size: 1.75rem; }
.ntk-gorsel img { width: 100%; height: 100%; object-fit: cover; }
.ntk[data-kapali='true'] .ntk-gorsel { background-color: var(--accent);
  background-image: repeating-linear-gradient(135deg, transparent 0 7px, color-mix(in srgb, var(--accent-hover) 70%, transparent) 7px 14px); }
.ntk[data-kapali='true'] .ntk-gorsel::before, .ntk[data-kapali='true'] .ntk-gorsel::after { content: ''; position: absolute;
  background: color-mix(in srgb, var(--hero-ink) 88%, transparent); }
.ntk[data-kapali='true'] .ntk-gorsel::before { top: 0; bottom: 0; left: calc(50% - 5px); width: 10px; }
.ntk[data-kapali='true'] .ntk-gorsel::after { left: 0; right: 0; top: calc(50% - 5px); height: 10px; }
.ntk-govde { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.ntk-baslik { margin: 0; color: var(--muted); font-size: .8125rem; font-weight: 800; line-height: 1.3; }
.ntk-metin { display: -webkit-box; margin: 0; overflow: hidden; font-family: var(--font-display); font-size: 1.0625rem;
  font-style: italic; font-variation-settings: 'SOFT' 100; line-height: 1.35; overflow-wrap: anywhere;
  -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.ntk-git { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 50%; color: var(--muted); }
.ntk-git svg { width: 20px; height: 20px; }
@media (prefers-reduced-motion: reduce) { .ntk { transition: none; } }
`;

/** el içine kartı kurar; not gelince ya da açılınca tazeler. Not yoksa el gizlenir. -> kapat() */
export async function mountNotKart(el, { room } = {}) {
  if (!el || !room?.roomId) {
    el?.replaceChildren();
    return () => {};
  }
  const myId = room.me?.clientId;
  const [col, profil] = await Promise.all([
    openCollection(room, TUR),
    openProfil(room).catch(() => null),
  ]);
  const gorsel = h('span', { class: 'ntk-gorsel', 'aria-hidden': 'true' });
  const baslik = h('p', { class: 'ntk-baslik' });
  const metin = h('p', { class: 'ntk-metin' });
  const kart = h('a', { class: 'ntk', href: pageUrl('sayfalar/not/') },
    h('style', {}, CSS), gorsel, h('span', { class: 'ntk-govde' }, baslik, metin),
    h('span', { class: 'ntk-git', 'aria-hidden': 'true' }, icon('chevron')));

  const adOf = (id) => profil?.kisiler?.get(id)?.data?.ad || profil?.partner()?.ad
    || room.partner?.()?.name || knownPartner(room.roomId)?.name || 'Sevgilin';

  let anahtar = '';
  const ciz = () => {
    const doc = sonGelen(col.all(), myId);
    const k = JSON.stringify(doc ? [doc.id, doc.data, adOf(yazan(doc)), formatDay(doc.created_at)] : null);
    if (k === anahtar) return;
    anahtar = k;
    if (!doc) {
      el.hidden = true;
      el.replaceChildren();
      return;
    }
    const d = doc.data;
    const kapali = kapaliMi(doc, myId);
    const ad = adOf(yazan(doc));
    kart.dataset.kapali = String(kapali);
    kart.style.setProperty('--ntk-kagit', `var(--tint-${renkSirasi(doc.id)})`);
    baslik.textContent = `${ek(ad, 'den')} not · ${formatDay(doc.created_at)}`;
    let yazi;
    if (kapali) {
      gorsel.replaceChildren();
      yazi = 'Sürpriz! Açmak için dokun 🎁';
    } else {
      gorsel.replaceChildren(d.foto && d.tur !== 'yazi'
        ? fotoImg(d.foto, { alt: '', eager: true })
        : '✍️');
      yazi = d.metin ? kisalt(d.metin, 120) : d.tur === 'cizim' ? 'Sana bir çizim yaptı 🎨' : 'Sana bir fotoğraf bıraktı 📷';
    }
    metin.textContent = yazi;
    kart.setAttribute('aria-label', `${baslik.textContent}: ${yazi}`);
    if (kart.parentNode !== el) el.replaceChildren(kart);
    el.hidden = false;
  };
  const offs = [col.on('change', ciz), profil?.on('change', ciz)];
  ciz();
  return () => {
    for (const off of offs) off?.();
    col.close();
    profil?.close();
  };
}
