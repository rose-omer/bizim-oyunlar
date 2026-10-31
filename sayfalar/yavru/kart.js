// Ana sayfa için küçük "Yavrumuz" kartı: küçük görsel + ad + en çok ihtiyaç duyulan şey + sayfaya bağlantı.
// Sayfa stilinden bağımsız: CSS kartın içinde gelir (sınıf öneki yvk-, yalnız değişkenler; yavru çizimi cizim.js).
//   const kapat = await mountYavruKart(el, { room });   // room = joinRoom sonucu
//   kapat();  // abonelikleri bırakır
// Kart belge yazmaz: yumurtayı ilk açan sayfa (sayfalar/yavru/) oluşturur.
import { openCollection } from '../../js/core/veri.js';
import { pageUrl } from '../../js/core/identity.js';
import { h, icon } from '../../js/core/ui.js';
import {
  TUR, BELGE_ID, oku, ruhHali, ozledi, durumMetni, renkSec, catlamaHazir, DK, dogumGunuMu, DOGUM_GUNU_METNI,
} from './mantik.js';
import { keyifsizMi } from './saglik.js';
import { yavruSvg, CIZIM_CSS } from './cizim.js';

const CSS = `
.yvk { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 14px;
  padding: 12px 14px 12px 12px; border: 1px solid var(--line); border-radius: var(--radius-lg);
  background: var(--surface); box-shadow: var(--shadow); color: var(--text); text-decoration: none;
  transition: box-shadow .18s ease, transform .12s var(--ease); }
.yvk:active { transform: scale(.985); }
@media (hover: hover) { .yvk:hover { box-shadow: var(--shadow-lg); } }
.yvk:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
.yvk-gorsel { display: block; width: 72px; height: 72px; padding: 4px; border-radius: 22px;
  background: radial-gradient(90% 80% at 50% 100%, color-mix(in oklab, var(--yv-govde) 55%, var(--surface)), var(--surface-2)); }
.yvk-gorsel .yv-svg { width: 100%; height: 100%; }
.yvk-govde { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.yvk-ad { margin: 0; overflow: hidden; font-family: var(--font-display); font-size: 1.1875rem; font-weight: 600;
  font-variation-settings: 'SOFT' 100; line-height: 1.25; text-overflow: ellipsis; white-space: nowrap; }
.yvk-durum { margin: 0; color: var(--muted); font-size: .9375rem; font-weight: 700; line-height: 1.35; }
.yvk[data-ihtiyac='true'] .yvk-durum { color: var(--yv-sicak); }
.yvk[data-dogumgunu='true'] .yvk-durum { color: var(--accent-strong); }
.yvk-git { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 50%; color: var(--muted); }
.yvk-git svg { width: 20px; height: 20px; }
`;

let stilEklendi = false;
function stilEkle() {
  if (stilEklendi || document.getElementById('yv-cizim-stil')) return;
  stilEklendi = true;
  document.head.append(h('style', { id: 'yv-cizim-stil' }, CIZIM_CSS));
}

/** el içine kartı kurar; belge değişince ve dakikada bir tazeler. -> kapat() */
export async function mountYavruKart(el, { room } = {}) {
  if (!el || !room?.roomId) {
    el?.replaceChildren();
    return () => {};
  }
  stilEkle();
  const col = await openCollection(room, TUR);
  const gorsel = h('span', { class: 'yvk-gorsel', 'aria-hidden': 'true' });
  const ad = h('p', { class: 'yvk-ad' });
  const durum = h('p', { class: 'yvk-durum' });
  const kart = h('a', { class: 'yvk', href: pageUrl('sayfalar/yavru/') },
    h('style', {}, CSS), gorsel, h('span', { class: 'yvk-govde' }, ad, durum),
    h('span', { class: 'yvk-git', 'aria-hidden': 'true' }, icon('chevron')));
  el.replaceChildren(kart);

  let anahtar = '';
  const ciz = () => {
    const simdi = Date.now();
    const doc = col.get(BELGE_ID);
    const y = doc ? oku(doc.data) : null;
    const asama = y?.asama || 'yumurta';
    const renk = y?.renk || renkSec(room.roomId);
    const ruh = ruhHali(y, simdi);
    const hazir = asama === 'yumurta' && !!y && catlamaHazir(y, simdi);
    // Doğum gününde durum satırı kutlar (o gün ihtiyaç rengi yok; ihtiyaçlar sayfada görünür).
    const dogumGunu = dogumGunuMu(y, simdi);
    const keyifsiz = keyifsizMi(y, simdi);
    const metin = dogumGunu ? DOGUM_GUNU_METNI : durumMetni(y, simdi, keyifsiz);
    const baslik = asama === 'yumurta' ? 'Yavrumuz' : y.ad || 'Yavrumuz';
    const k = [asama, renk, ruh, hazir, metin, baslik].join('|');
    if (k === anahtar) return;
    anahtar = k;
    kart.style.setProperty('--yv-govde', `var(--yv-r${renk})`);
    gorsel.innerHTML = yavruSvg({ asama, ruh, renk, hazir });
    ad.textContent = baslik;
    durum.textContent = metin;
    kart.dataset.dogumgunu = String(dogumGunu);
    kart.dataset.ihtiyac = String(!dogumGunu && asama !== 'yumurta' && (keyifsiz || ozledi(y, simdi) || ['ac', 'kirli', 'uykulu', 'uzgun'].includes(ruh)));
    kart.setAttribute('aria-label', `${baslik}: ${metin}`);
  };
  const off = col.on('change', ciz);
  const zaman = setInterval(ciz, DK);
  ciz();
  return () => {
    off();
    clearInterval(zaman);
    col.close();
  };
}
