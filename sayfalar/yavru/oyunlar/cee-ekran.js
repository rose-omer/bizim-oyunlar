// Ce-e: DOM görünümü (battaniyeler gerçek <button>). Mantık cee.js'te.
import { h } from '../../../js/core/ui.js';
import { sfx } from '../../../js/core/sound.js';
import { yeni, adim, sec, konumlar, bebekGorunur, TUR_SAYISI, SEC_MS } from './cee.js';

// Yerleşik bebek: yuvarlak yüz, kıvrık perçem, kapalı-mutlu gözler. Renkler oyun.css değişkenlerinden.
const BEBEK_SVG = `<svg viewBox="0 0 100 92" aria-hidden="true" focusable="false">
<ellipse class="oy-bb-yuz" cx="50" cy="54" rx="40" ry="35"/>
<path class="oy-bb-cizgi" d="M47 20 C44 10 56 8 55 15 C54 20 48 19 49 15"/>
<ellipse class="oy-bb-goz" cx="35" cy="52" rx="4.2" ry="5.2"/><ellipse class="oy-bb-goz" cx="65" cy="52" rx="4.2" ry="5.2"/>
<circle class="oy-bb-isik" cx="36.6" cy="50" r="1.6"/><circle class="oy-bb-isik" cx="66.6" cy="50" r="1.6"/>
<ellipse class="oy-bb-yanak" cx="24" cy="64" rx="7" ry="4.2"/><ellipse class="oy-bb-yanak" cx="76" cy="64" rx="7" ry="4.2"/>
<path class="oy-bb-cizgi" d="M43 66 Q50 73 57 66"/>
</svg>`;

const METIN = {
  goster: 'Yavruyu gördün mü?',
  ortu: 'Ce…',
  karistir: 'Gözünü ayırma!',
  sec: 'Yavru nerede? Dokun.',
};

export function kur({ sahne, tohum, azHareket, duyur, bebekSvg }) {
  const s = yeni({ tohum, yavas: azHareket });
  const durum = h('p', { class: 'oy-cee-durum', 'aria-hidden': 'true' });
  const bebek = h('div', { class: 'oy-cee-bebek', html: bebekSvg || BEBEK_SVG });
  const sira = h('div', { class: 'oy-cee-sira' }, bebek);
  const sureCubuk = h('i');
  const noktalar = h('div', { class: 'oy-cee-noktalar', 'aria-hidden': 'true' },
    Array.from({ length: TUR_SAYISI }, () => h('span')));
  const kok = h('div', { class: 'oy-cee' }, durum, sira, h('div', { class: 'oy-cee-sure', 'aria-hidden': 'true' }, sureCubuk), noktalar);
  sahne.append(kok);

  let dugmeler = [];
  let sonFaz = '';
  let sonuclar = []; // tur başına true/false

  function dugmeKur() {
    for (const d of dugmeler) d.remove();
    dugmeler = Array.from({ length: s.n }, (_, k) => {
      const d = h('button', {
        type: 'button', class: 'oy-battaniye', 'aria-disabled': 'true', 'data-renk': String(k % 4),
        onClick: () => tikla(k),
      }, h('span', { class: 'oy-bt-kumas', 'aria-hidden': 'true' }));
      sira.append(d);
      return d;
    });
    kok.style.setProperty('--n', String(s.n));
  }

  function tikla(k) {
    const r = sec(s, k);
    if (!r) return;
    sfx(r.dogru ? 'match' : 'wrong');
  }

  function fazDegisti() {
    const f = s.faz;
    if (f === 'goster') {
      if (dugmeler.length !== s.n || sonFaz === 'sonuc' || sonFaz === '') dugmeKur();
      sfx('flip');
    }
    if (f === 'ortu') sfx('flip');
    if (f === 'sec') {
      // Sekme sırası görünür sırayı izlesin.
      [...dugmeler].sort((a, b) => s.yer[dugmeler.indexOf(a)] - s.yer[dugmeler.indexOf(b)]).forEach((d) => sira.append(d));
      dugmeler.forEach((d, k) => {
        d.setAttribute('aria-label', `${s.yer[k] + 1}. battaniye`);
        d.setAttribute('aria-disabled', 'false');
      });
      duyur(`Yavru nerede? ${s.n} battaniyeden birini seç.`);
    } else dugmeler.forEach((d) => d.setAttribute('aria-disabled', 'true'));
    if (f === 'sonuc') {
      const dogru = s.secilen === s.bebek;
      sonuclar[s.tur - 1] = dogru;
      durum.textContent = dogru ? `Ce-e! +${2 + s.tur}` : s.secilen < 0 ? 'Süre doldu, buradaymış' : 'Burada saklanıyormuş';
      duyur(dogru ? `Ce-e! Buldun, artı ${2 + s.tur}.` : 'Bulamadın. Yavru başka battaniyedeymiş.');
      if (s.secilen < 0) sfx('wrong');
    } else durum.textContent = METIN[f] || '';
    kok.dataset.faz = f;
    sonFaz = f;
  }

  function ciz() {
    const k0 = konumlar(s);
    const acik = new Set();
    if (bebekGorunur(s)) acik.add(s.bebek);
    if (s.faz === 'sonuc' && s.secilen >= 0) acik.add(s.secilen);
    k0.forEach((p, k) => {
      const d = dugmeler[k];
      if (!d) return;
      d.style.setProperty('--x', String(p.yuva));
      d.style.setProperty('--kalk', azHareket ? '0' : p.kalk.toFixed(3));
      d.style.zIndex = p.kalk > 0 ? '3' : '2';
      d.classList.toggle('acik', acik.has(k));
      d.classList.toggle('secilen', s.faz === 'sonuc' && s.secilen === k);
    });
    bebek.style.setProperty('--x', String(k0[s.bebek]?.yuva ?? 0));
    bebek.classList.toggle('mutlu', s.faz === 'sonuc' && s.secilen === s.bebek);
    sureCubuk.style.transform = `scaleX(${s.faz === 'sec' ? Math.max(0, 1 - s.fazT / SEC_MS) : s.faz === 'sonuc' ? 0 : 1})`;
    [...noktalar.children].forEach((n, i) => {
      n.dataset.d = sonuclar[i] === true ? 'iyi' : sonuclar[i] === false ? 'kotu' : i === s.tur - 1 ? 'simdi' : '';
    });
  }

  dugmeKur();
  fazDegisti();

  return {
    adim(dt) {
      adim(s, dt);
      if (s.olaylar.length) {
        s.olaylar.length = 0;
        if (s.faz !== sonFaz && !s.bitti) fazDegisti();
      }
      ciz();
      return {
        skor: s.skor, bitti: s.bitti, tur: s.tur, turSayisi: TUR_SAYISI,
        ilerleme: (s.tur - 1 + (s.faz === 'sonuc' || s.bitti ? 1 : 0)) / TUR_SAYISI,
      };
    },
    temizle() { kok.remove(); },
  };
}
