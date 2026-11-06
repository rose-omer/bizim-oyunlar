// Giydirme Siparişi: DOM/SVG görünümü (seçenekler gerçek <button>). Mantık giydir.js'te.
// Düğmeler sipariş değişince yeniden kurulmaz, içi güncellenir: klavye odağı kaybolmaz.
import { h } from '../../../js/core/ui.js';
import { sfx } from '../../../js/core/sound.js';
import { bebekSvg as bebekCiz, giyimParcaSvg } from '../bebek.js';
import { URUNLER } from '../jeton.js';
import { yeni, adim, sec, giyildiMi, kalanMs, ilerleme, SECENEK, CEZA_MS } from './giydir.js';

const UYARI_MS = 800; // yanlış parça uyarısının görünme süresi (giydir.css oy-gd-ceza ile aynı)
const CEZA_SN = CEZA_MS / 1000;
const SEVINC = ['Bayıldım!', 'Çok yakıştı!', 'Tam istediğim!'];
const ad = (id) => URUNLER[id]?.ad ?? id;

export function kur({ sahne, tohum, azHareket, duyur, baglam }) {
  if (!document.querySelector('link[data-oy-giydir]')) document.head.append(h('link', { rel: 'stylesheet', href: new URL('./giydir.css', import.meta.url).href, 'data-oy-giydir': '' }));

  const s = yeni({ tohum, yavas: azHareket });
  const renk = baglam?.renk ?? 1;
  const kisilik = baglam?.kisilik ?? '';

  const balon = h('div', { class: 'oy-gd-balon', role: 'img' });
  const bebek = h('div', { class: 'oy-gd-bebek', 'aria-hidden': 'true' });
  const sevinc = h('b');
  const ekPuan = h('span');
  const butonlar = Array.from({ length: SECENEK }, (_, i) => h('button', { type: 'button', class: 'oy-gd-sec', onClick: () => tikla(i) },
    h('span', { class: 'oy-gd-resim', 'aria-hidden': 'true' }),
    h('span', { class: 'oy-gd-no', 'aria-hidden': 'true' }, String(i + 1))));
  const kok = h('div', { class: 'oy-gd' },
    balon,
    h('div', { class: 'oy-gd-orta' },
      bebek,
      h('div', { class: 'oy-gd-konfeti', 'aria-hidden': 'true' }, Array.from({ length: 8 }, () => h('i'))),
      h('div', { class: 'oy-gd-kutla', 'aria-hidden': 'true' }, sevinc, ekPuan),
      h('span', { class: 'oy-gd-ceza', 'aria-hidden': 'true' }, `−${CEZA_SN} sn`)),
    h('div', { class: 'oy-gd-secenekler' }, butonlar));
  sahne.append(kok);
  sahne.setAttribute('aria-label', 'Giydirme Siparişi oyun alanı. Seçeneklere 1-6 tuşlarıyla da basabilirsin.');

  let basladi = false; // çerçevenin ilk adim(0) çağrısı ve 3-2-1 sayımı oyun sayılmaz
  let uyariT = 0;
  let cizilenNo = 0;
  let cizilenGiyim = null;
  let cizilenFaz = '';

  const tus = (e) => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return; // basılı tutmak süre yakmasın; Ctrl+1 tarayıcının
    const i = Number(e.key) - 1;
    if (Number.isInteger(i) && i >= 0 && i < SECENEK) { e.preventDefault(); tikla(i); }
  };
  sahne.addEventListener('keydown', tus);

  function tikla(i) {
    if (!basladi) return;
    const r = sec(s, s.secenekler[i]);
    if (!r) return;
    if (!r.dogru) hataGoster(i);
    // Karşılık ve ses dokunuşun içinde: bir sonraki kareyi beklemez.
    olaylar();
    ciz(0);
  }

  function hataGoster(i) {
    butonlar.forEach((b, j) => b.classList.toggle('hatali', j === i));
    kok.classList.remove('sars');
    void kok.offsetWidth; // art arda yanlışta sarsılma baştan başlasın
    kok.classList.add('sars');
    uyariT = UYARI_MS;
  }

  function olaylar() {
    for (const o of s.olaylar.splice(0)) {
      if (o.tur === 'dogru') {
        if (!o.tamam) sfx('tick');
        duyur(`${ad(o.urun)} giyildi.`);
      } else if (o.tur === 'yanlis') {
        sfx('wrong');
        duyur(`${ad(o.urun)} istenmedi. ${CEZA_SN} saniye gitti.`);
      } else if (o.tur === 'tamam') {
        sfx('match');
        sevinc.textContent = SEVINC[s.tamam % SEVINC.length];
        ekPuan.textContent = `+${o.bonus} bonus${o.seriPuan ? `, +${o.seriPuan} seri` : ''}`;
        duyur(`Sipariş tamam! ${o.bonus + o.seriPuan} puan bonus.`);
      } else if (o.tur === 'siparis' && basladi) duyur(`Yeni sipariş: ${o.parcalar.map(ad).join(', ')}.`);
    }
  }

  function siparisCiz() {
    balon.replaceChildren(...s.siparis.map((id) => h('span', { class: 'oy-gd-parca', html: giyimParcaSvg(id, { renk }) })));
    butonlar.forEach((b, i) => {
      const id = s.secenekler[i];
      b.hidden = !id; // küçük katalogda 6'dan az seçenek olabilir
      if (!id) return;
      b.setAttribute('aria-label', ad(id));
      b.firstChild.innerHTML = giyimParcaSvg(id, { renk });
    });
  }

  function isaretle() {
    const acik = s.faz === 'sec';
    s.siparis.forEach((id, i) => balon.children[i].classList.toggle('giyili', giyildiMi(s, id)));
    balon.setAttribute('aria-label', `Sipariş: ${s.siparis.map((id) => (giyildiMi(s, id) ? `${ad(id)} (giyildi)` : ad(id))).join(', ')}`);
    butonlar.forEach((b, i) => {
      const giyili = Boolean(s.secenekler[i]) && giyildiMi(s, s.secenekler[i]);
      b.classList.toggle('giyili', giyili);
      b.setAttribute('aria-disabled', acik && !giyili ? 'false' : 'true');
    });
    kok.dataset.faz = s.faz;
  }

  function ciz(dt) {
    if (s.no !== cizilenNo) { cizilenNo = s.no; siparisCiz(); }
    const giyimDegisti = s.giyilenler !== cizilenGiyim;
    if (giyimDegisti) {
      cizilenGiyim = s.giyilenler;
      bebek.innerHTML = bebekCiz({ asama: 'buyuk', renk, kisilik, ruh: 'mutlu', giyim: s.giyilenler });
    }
    if (giyimDegisti || s.faz !== cizilenFaz) { cizilenFaz = s.faz; isaretle(); }
    if (uyariT > 0) {
      uyariT -= dt;
      if (uyariT <= 0) {
        kok.classList.remove('sars');
        for (const b of butonlar) b.classList.remove('hatali');
      }
    }
  }

  return {
    adim(dt) {
      if (dt > 0 && !basladi) {
        basladi = true;
        duyur(`Sipariş: ${s.siparis.map(ad).join(', ')}.`);
      }
      adim(s, dt);
      olaylar();
      ciz(dt);
      return { skor: s.skor, bitti: s.bitti, kalanMs: kalanMs(s), ilerleme: ilerleme(s) };
    },
    temizle() {
      sahne.removeEventListener('keydown', tus);
      kok.remove();
    },
  };
}
