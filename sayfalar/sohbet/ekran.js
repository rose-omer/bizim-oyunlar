// Sohbet: satır ve balon kurucuları. Kullanıcı metni yalnız textContent / metin düğümü olarak basılır.
import { h } from '../../js/core/ui.js';
import { baglantilar, saatEtiketi, tepkiOzeti, sadeceEmoji, ozet, gonderen } from './mantik.js';

const S = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
const svg = (ic, kutu = '0 0 24 24', ek = S) => `<svg viewBox="${kutu}" ${ek} aria-hidden="true" focusable="false">${ic}</svg>`;

// Sabit SVG'ler (kullanıcı verisi değil).
const IKONLAR = {
  gonder: svg('<path d="M12 19V5.5M5.8 11.5 12 5.3l6.2 6.2"/>'),
  kalp: svg('<path d="M12 20.7c-.27 0-.53-.09-.75-.27C6.6 16.6 3 13.5 3 9.45 3 6.68 5.13 4.5 7.8 4.5c1.68 0 3.2.83 4.2 2.15 1-1.32 2.52-2.15 4.2-2.15 2.67 0 4.8 2.18 4.8 4.95 0 4.05-3.6 7.15-8.25 10.98-.22.18-.48.27-.75.27z"/>', '0 0 24 24', 'fill="currentColor"'),
  foto: svg('<rect x="3.5" y="5" width="17" height="14" rx="3.2"/><circle cx="9" cy="10" r="1.6"/><path d="m20.3 15.2-4.4-4.4L7.2 19"/>'),
  emoji: svg('<circle cx="12" cy="12" r="8.6"/><path d="M8.6 14.2a4.2 4.2 0 0 0 6.8 0"/><path d="M9.3 9.6h.01M14.7 9.6h.01" stroke-width="2.6"/>'),
  yanitla: svg('<path d="M9.5 6.5 4.5 11.5l5 5"/><path d="M5 11.5h8.5a6 6 0 0 1 6 6v1"/>'),
  kopyala: svg('<rect x="8.5" y="8.5" width="11" height="11" rx="2.5"/><path d="M15.5 8.5V6.2a1.7 1.7 0 0 0-1.7-1.7H6.2a1.7 1.7 0 0 0-1.7 1.7v7.6a1.7 1.7 0 0 0 1.7 1.7h2.3"/>'),
  duzenle: svg('<path d="M4.5 19.5h4l10.2-10.2a2.83 2.83 0 0 0-4-4L4.5 15.5z"/><path d="m13.2 6.8 4 4"/>'),
  sil: svg('<path d="M4.5 7h15M9.5 7V4.8h5V7M6.8 7l.9 12.2h8.6L17.2 7"/><path d="M10.2 10.5v5.5M13.8 10.5v5.5"/>'),
  kapat: svg('<path d="M6.5 6.5l11 11m0-11-11 11"/>'),
  asagi: svg('<path d="M12 5.5v13M6 12.5l6 6 6-6"/>'),
  saat: svg('<circle cx="12" cy="12" r="8"/><path d="M12 7.8v4.6l2.9 1.7"/>'),
  tamam: svg('<path d="m5 12.5 4.6 4.6L19 7.6"/>'),
  tekrar: svg('<path d="M19.2 12a7.2 7.2 0 1 1-2.1-5.1"/><path d="M19.4 4.6v4.2h-4.2"/>'),
};

export function ikon(ad) {
  const t = document.createElement('template');
  t.innerHTML = IKONLAR[ad] || '';
  return t.content.firstElementChild;
}

/** Bağlantıları tıklanabilir yaparak metni bir öğeye ekler. */
export function metniBas(el, metin) {
  for (const p of baglantilar(metin)) {
    if (p.tur === 'baglanti') {
      el.append(h('a', { href: p.href, target: '_blank', rel: 'noopener noreferrer' }, p.metin));
    } else {
      el.append(document.createTextNode(p.metin));
    }
  }
  return el;
}

export function gunSatiri(etiket) {
  return h('li', { class: 'sh-gun' }, h('span', {}, etiket));
}

function zamanEl(doc, { duzenlendi = false } = {}) {
  const z = h('span', { class: 'sh-zaman' });
  if (duzenlendi) z.append(h('span', { class: 'sh-duz' }, 'düzenlendi'));
  z.append(h('time', { datetime: doc.created_at }, saatEtiketi(doc.created_at)));
  if (doc.pending) {
    const s = ikon('saat');
    s.classList.add('sh-bekliyor');
    z.append(s, h('span', { class: 'sr-only' }, 'gönderiliyor'));
  }
  return z;
}

/**
 * Mesaj satırı.
 * ctx: { benId, ad(clientId) -> ad, bul(id) -> doc|null, foto(img, url), durum: { durum, at } | null }
 */
export function mesajSatiri(satir, ctx) {
  const { doc, benim, ilk, son } = satir;
  const d = doc.data || {};
  const metin = typeof d.metin === 'string' ? d.metin : '';
  const kimAd = benim ? 'Sen' : ctx.ad(gonderen(doc));
  const buyuk = !d.foto && !d.yanit && sadeceEmoji(metin);

  const cls = ['sh-satir', benim ? 'benim' : 'onun'];
  if (ilk) cls.push('ilk');
  if (son) cls.push('son');
  if (doc.pending) cls.push('bekliyor');
  const li = h('li', { class: cls.join(' '), dataset: { id: doc.id } });

  const balonCls = ['sh-balon'];
  if (buyuk) balonCls.push('buyuk');
  if (d.foto && !metin) balonCls.push('yalniz-foto');
  const balon = h('div', { class: balonCls.join(' '), tabindex: '0', 'aria-haspopup': 'dialog' },
    h('span', { class: 'sr-only' }, `${kimAd}: `));

  if (d.yanit) {
    const hedef = ctx.bul(d.yanit);
    if (hedef) {
      const hedefBenim = gonderen(hedef) === ctx.benId;
      balon.append(h('button', { type: 'button', class: 'sh-alinti', dataset: { hedef: d.yanit }, 'aria-label': `Yanıtlanan mesaja git: ${ozet(hedef.data, 60)}` },
        h('span', { class: 'sh-alinti-kim' }, hedefBenim ? 'Sen' : ctx.ad(gonderen(hedef))),
        h('span', { class: 'sh-alinti-metin' }, ozet(hedef.data, 90) || 'Mesaj')));
    } else {
      balon.append(h('div', { class: 'sh-alinti yok' }, h('span', { class: 'sh-alinti-metin' }, 'Silinmiş ya da daha eski bir mesaj')));
    }
  }

  if (d.foto) {
    const en = Number(d.en) > 0 ? Number(d.en) : 4;
    const boy = Number(d.boy) > 0 ? Number(d.boy) : 3;
    const img = h('img', { alt: metin ? 'Fotoğraf' : `${kimAd} bir fotoğraf gönderdi`, decoding: 'async', draggable: 'false' });
    const kutu = h('button', { type: 'button', class: 'sh-foto', 'aria-label': 'Fotoğrafı tam ekran aç', style: { aspectRatio: `${en} / ${boy}` } }, img);
    ctx.foto(img, d.foto);
    balon.append(kutu);
    if (!metin) kutu.append(zamanEl(doc, { duzenlendi: !!d.duzenlendi }));
  }

  if (metin) {
    const p = h('p', { class: 'sh-metin' });
    metniBas(p, metin);
    p.append(zamanEl(doc, { duzenlendi: !!d.duzenlendi }));
    balon.append(p);
  }

  const kap = h('div', { class: 'sh-balon-kap' }, balon);
  li.append(kap);

  const tepkiler = tepkiOzeti(d.tepki, ctx.benId);
  if (tepkiler.length) {
    const etiket = tepkiler.map((t) => `${t.emoji} ${t.sayi}`).join(', ');
    kap.append(h('button', { type: 'button', class: 'sh-tepkiler', 'aria-label': `Tepkiler: ${etiket}. Değiştirmek için dokun.` },
      tepkiler.map((t) => h('span', { class: `sh-tepki${t.benim ? ' benim' : ''}` }, t.emoji,
        t.sayi > 1 ? h('span', { class: 'sh-tepki-sayi' }, String(t.sayi)) : null))));
    li.classList.add('tepkili');
  }

  if (ctx.durum) {
    const { durum, at } = ctx.durum;
    const yazi = durum === 'goruldu' ? `Görüldü${at ? ' · ' + saatEtiketi(at) : ''}` : durum === 'gonderiliyor' ? 'Gönderiliyor…' : 'Gönderildi';
    li.append(h('div', { class: `sh-durum ${durum}` }, yazi));
  }
  return li;
}

/** Yüklenen fotoğrafın yer tutucusu. y: { id, durum: 'hazirlaniyor'|'yukleniyor'|'hata', onizleme, en, boy, hata } */
export function yuklemeSatiri(y, { tekrar, vazgec }) {
  const en = y.en || 4;
  const boy = y.boy || 3;
  const ic = h('div', { class: 'sh-foto yer', style: { aspectRatio: `${en} / ${boy}` } });
  if (y.onizleme) ic.append(h('img', { src: y.onizleme, alt: 'Gönderilen fotoğraf', draggable: 'false' }));
  const ust = h('div', { class: 'sh-yukle-ust' });
  if (y.durum === 'hata') {
    ust.append(
      h('p', { class: 'sh-yukle-hata' }, y.hata || 'Gönderilemedi.'),
      h('div', { class: 'sh-yukle-dugmeler' },
        h('button', { type: 'button', class: 'btn small primary', onclick: () => tekrar(y) }, ikon('tekrar'), 'Tekrar dene'),
        h('button', { type: 'button', class: 'btn small', onclick: () => vazgec(y) }, 'Vazgeç')));
  } else {
    ust.append(h('span', { class: 'sh-donen', 'aria-hidden': 'true' }),
      h('span', { class: 'sh-yukle-yazi' }, y.durum === 'hazirlaniyor' ? 'Hazırlanıyor…' : 'Gönderiliyor…'));
  }
  ic.append(ust);
  return h('li', { class: 'sh-satir benim ilk son yukleme', dataset: { yukleme: y.id }, 'aria-busy': y.durum === 'hata' ? 'false' : 'true' },
    h('div', { class: 'sh-balon-kap' }, h('div', { class: 'sh-balon yalniz-foto' }, ic)));
}
