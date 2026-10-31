// Ana sayfa için küçük "Günün sorusu" kartı. Sayfa stilinden bağımsız: CSS kartın içinde gelir
// (sınıf öneki gsk-, yalnız base.css değişkenleri).
//   const kapat = await mountGununSorusuKart(el, { room });   // room = joinRoom/bootPage sonucu
//   kapat();  // abonelikleri bırakır
import { openCollection } from '../../js/core/veri.js';
import { pageUrl } from '../../js/core/identity.js';
import { h, knownPartner } from '../../js/core/ui.js';
import { SORULAR } from './sorular.js';
import { KATEGORILER, gunNo, soruSecici, gunlereGore, gunDurumu, ortakGunler, seri, seriMetni } from './mantik.js';

const CSS = `
.gsk { display: flex; flex-direction: column; gap: 12px; padding: 18px 18px 16px; border: 1px solid var(--line);
  border-radius: var(--radius-lg); background: var(--surface); box-shadow: var(--shadow); color: var(--text); }
.gsk-ust { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.gsk-baslik { margin: 0; font-family: var(--font-display); font-variation-settings: 'SOFT' 100; font-size: 1.0625rem;
  font-weight: 600; line-height: 1.2; }
.gsk-seri { display: inline-flex; align-items: center; gap: 4px; min-height: 28px; padding: 2px 10px;
  border-radius: var(--radius-pill); background: var(--tint-6); font-size: .875rem; font-weight: 800;
  font-variant-numeric: tabular-nums; white-space: nowrap; }
.gsk-soru { margin: 0; font-family: var(--font-display); font-variation-settings: 'SOFT' 100; font-size: 1.3125rem;
  font-weight: 600; line-height: 1.22; letter-spacing: -0.01em; text-wrap: balance; overflow-wrap: anywhere; }
.gsk-kat { color: var(--muted); font-size: .8125rem; font-weight: 750; }
.gsk-alt { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px 12px; }
.gsk-durum { display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1 1 12rem; margin: 0;
  color: var(--muted); font-size: .9375rem; font-weight: 700; line-height: 1.35; }
.gsk[data-durum='partner'] .gsk-durum { color: var(--accent-strong); }
.gsk-nokta { flex: none; width: 10px; height: 10px; border-radius: 50%; box-shadow: inset 0 0 0 1.5px var(--muted); }
.gsk[data-durum='partner'] .gsk-nokta, .gsk[data-durum='ikisi'] .gsk-nokta { background: var(--accent); box-shadow: none; }
.gsk[data-durum='ben'] .gsk-nokta { background: var(--plum); box-shadow: none; }
.gsk-dugme { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 44px; min-width: 44px;
  padding: 0 18px; border-radius: var(--radius-pill); background: var(--accent); color: var(--accent-ink);
  font-weight: 800; text-decoration: none; white-space: nowrap; transition: background-color .15s ease, transform .12s ease; }
.gsk-dugme[data-ikincil='true'] { background: var(--surface-2); color: var(--text); }
.gsk-dugme:active { transform: scale(.97); }
@media (hover: hover) { .gsk-dugme:hover { background: var(--accent-hover); } .gsk-dugme[data-ikincil='true']:hover { background: var(--accent-soft); } }
.gsk-dugme:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
`;

let sira = 0;

/**
 * el içine kartı kurar ve canlı tutar. -> kapat()
 * Seçenekler: room (zorunlu), partnerAd (isteğe bağlı; yoksa presence / son görülen ad).
 */
export async function mountGununSorusuKart(el, { room, partnerAd } = {}) {
  if (!el) return () => {};
  if (!room?.roomId || !room?.me?.clientId) {
    el.replaceChildren();
    return () => {};
  }
  const col = await openCollection(room, 'gs');
  const sec = soruSecici(SORULAR, room.roomId);
  const benId = room.me.clientId;
  const baslikId = `gsk-baslik-${++sira}`;
  const style = h('style', {}, CSS);
  const ad = () => partnerAd || room.partner?.()?.name || knownPartner(room.roomId)?.name || 'Sevgilin';

  const ciz = () => {
    const bugun = gunNo();
    const soru = sec(bugun);
    const harita = gunlereGore(col.all());
    const d = gunDurumu(harita, bugun, benId);
    const s = seriMetni(seri(ortakGunler(harita), bugun));
    const p = ad();
    let durum = 'yok';
    let metin = 'Bugün henüz kimse cevaplamadı. İlk sen yaz!';
    let dugme = 'Cevapla';
    if (d.ikisi) { durum = 'ikisi'; metin = 'İkiniz de cevapladınız 💞'; dugme = 'Cevapları gör'; }
    else if (d.partner) { durum = 'partner'; metin = `${p} cevapladı, senin cevabını bekliyor 🤫`; }
    else if (d.ben) { durum = 'ben'; metin = `Cevabın gitti. ${p} yazınca ikisi birlikte açılır.`; dugme = 'Gör'; }

    const kart = h('section', { class: 'gsk', 'aria-labelledby': baslikId, dataset: { durum } },
      h('div', { class: 'gsk-ust' },
        h('h2', { class: 'gsk-baslik', id: baslikId }, 'Günün sorusu'),
        s.sayi
          ? h('span', { class: 'gsk-seri', title: `Rekorumuz: ${s.rekor} gün` },
            h('span', { 'aria-hidden': 'true' }, s.simge), h('span', { class: 'sr-only' }, 'Üst üste '), `${s.sayi} gün`)
          : null),
      h('p', { class: 'gsk-soru' }, soru?.s || ''),
      soru ? h('span', { class: 'gsk-kat' }, KATEGORILER[soru.k] || '') : null,
      h('div', { class: 'gsk-alt' },
        h('p', { class: 'gsk-durum' }, h('span', { class: 'gsk-nokta', 'aria-hidden': 'true' }), h('span', {}, metin)),
        h('a', {
          class: 'gsk-dugme', href: pageUrl('sayfalar/gunun-sorusu/'),
          dataset: { ikincil: String(durum === 'ben') },
        }, dugme)));
    el.replaceChildren(style, kart);
  };

  const offChange = col.on('change', ciz);
  const offPresence = room.on?.('presence', ciz);
  let gun = gunNo();
  const zamanlayici = setInterval(() => { if (gunNo() !== gun) { gun = gunNo(); ciz(); } }, 60000);
  ciz();

  return () => {
    offChange?.();
    if (typeof offPresence === 'function') offPresence();
    clearInterval(zamanlayici);
    col.close();
  };
}
