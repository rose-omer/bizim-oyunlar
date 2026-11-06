// Mama Tarifi: DOM/SVG görünümü (malzemeler gerçek <button>). Mantık tarif.js'te.
import { h } from '../../../js/core/ui.js';
import { sfx } from '../../../js/core/sound.js';
import { yeni, adim, ekle, gosterMs, kalanMs, SURE, CAN, MALZEMELER } from './tarif.js';

const DUSME_MS = 420; // tarif.css oy-tf-dus süresiyle aynı
const BASILI_MS = 240;
const METIN = { goster: 'Tarifi aklında tut', ekle: 'Tarif aklında mı?', iyi: 'Afiyet olsun!', tasti: 'Mama taştı!', bitti: '' };

const IC_D = 'M44 58 H176 V122 Q176 146 152 146 H68 Q44 146 44 122 Z';
const TENCERE_SVG = `<svg viewBox="0 0 220 170" aria-hidden="true" focusable="false">
  <defs><clipPath id="oy-tf-ic"><path d="${IC_D}"/></clipPath></defs>
  <ellipse class="oy-tf-golge" cx="110" cy="160" rx="84" ry="7"/>
  <g class="oy-tf-buhar">
    <path d="M78 38 q-9 -9 0 -18 q9 -9 0 -18"/>
    <path d="M110 38 q-9 -9 0 -18 q9 -9 0 -18"/>
    <path d="M142 38 q-9 -9 0 -18 q9 -9 0 -18"/>
  </g>
  <g class="oy-tf-gove">
    <rect class="oy-tf-kulp" x="10" y="72" width="34" height="14" rx="7"/>
    <rect class="oy-tf-kulp" x="176" y="72" width="34" height="14" rx="7"/>
    <path class="oy-tf-dis" d="M36 52 H184 V124 Q184 154 154 154 H66 Q36 154 36 124 Z"/>
    <path class="oy-tf-icyuz" d="${IC_D}"/>
    <g clip-path="url(#oy-tf-ic)">
      <path class="oy-tf-mama" d="M34 0 q19 -7 38 0 t38 0 t38 0 t38 0 V96 H34 Z"/>
    </g>
    <path class="oy-tf-kabarma" d="M38 50 Q58 24 84 38 Q110 18 136 38 Q162 24 182 50 Z"/>
    <rect class="oy-tf-agiz" x="28" y="44" width="164" height="14" rx="7"/>
    <path class="oy-tf-damla" d="M52 48 v38 a7 7 0 0 0 14 0 v-38 Z"/>
    <path class="oy-tf-damla" d="M100 48 v56 a8 8 0 0 0 16 0 v-56 Z"/>
    <path class="oy-tf-damla" d="M152 48 v28 a6 6 0 0 0 12 0 v-28 Z"/>
  </g>
</svg>`;

export function kur({ sahne, tohum, azHareket, duyur }) {
  if (!document.querySelector('link[data-oy-tarif]')) {
    document.head.append(h('link', { rel: 'stylesheet', href: new URL('./tarif.css', import.meta.url).href, 'data-oy-tarif': '' }));
  }
  const s = yeni({ tohum, yavas: azHareket });

  const durum = h('p', { class: 'oy-tf-durum' }, METIN.goster);
  const canlar = Array.from({ length: CAN }, () => h('span', { class: 'oy-tf-can' }, '🥄'));
  const kalemler = h('ol', { class: 'oy-tf-kalemler' });
  const kart = h('div', { class: 'oy-tf-kart', 'aria-hidden': 'true' },
    h('div', { class: 'oy-tf-ust' }, durum, h('div', { class: 'oy-tf-canlar' }, canlar)),
    kalemler,
    h('div', { class: 'oy-tf-sure' }, h('i')));
  const bonus = h('span', { class: 'oy-tf-bonus', hidden: true });
  const tencere = h('div', { class: 'oy-tf-tencere', 'aria-hidden': 'true', html: TENCERE_SVG });
  tencere.append(bonus);
  const dugmeler = MALZEMELER.map((m, i) => h('button', {
    type: 'button', class: 'oy-tf-malzeme', 'aria-label': `${m.ad} ekle`, 'aria-keyshortcuts': String(i + 1), 'aria-disabled': 'true',
    onClick: () => tikla(i),
  },
    h('span', { class: 'oy-tf-emoji', 'aria-hidden': 'true' }, m.emoji),
    h('span', { class: 'oy-tf-ad', 'aria-hidden': 'true' }, m.ad),
    h('span', { class: 'oy-tf-tus', 'aria-hidden': 'true' }, String(i + 1))));
  const kok = h('div', { class: 'oy-tf', 'data-faz': s.faz }, kart, tencere, h('div', { class: 'oy-tf-raf' }, dugmeler));
  sahne.append(kok);
  sahne.setAttribute('aria-label', 'Mama Tarifi oyun alanı. Malzemeleri 1-8 tuşlarıyla da ekleyebilirsin.');

  let basili = { i: -1, kalan: 0, dogru: false };
  let sonYanlis = 0;
  let dusenler = [];
  let sonAnahtar = '';
  let kartDuyur = true; // kart gerçekten akarken duyurulur; adim(0) hazırlıkta çalışır

  const tus = (e) => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return; // basılı kalan tuş yanlış malzeme saymasın
    const i = Number(e.key) - 1;
    if (Number.isInteger(i) && i >= 0 && i < MALZEMELER.length) { e.preventDefault(); tikla(i); }
  };
  sahne.addEventListener('keydown', tus);

  function tikla(i) {
    const r = ekle(s, i);
    if (!r) return;
    basili = { i, kalan: BASILI_MS, dogru: r.dogru };
    if (r.dogru && !azHareket) dusur(i);
  }

  function dusur(m) {
    const kay = ((s.girilen * 37) % 41) - 20; // malzemeler üst üste binmesin
    const el = h('span', { class: 'oy-tf-dusen', style: { '--x': `${kay}px` } }, MALZEMELER[m].emoji);
    tencere.append(el);
    dusenler.push({ el, kalan: DUSME_MS });
  }

  function dusenleriAzalt(dt) {
    dusenler = dusenler.filter((d) => {
      d.kalan -= dt;
      if (d.kalan > 0) return true;
      d.el.remove();
      return false;
    });
  }

  function kalemKur() {
    kalemler.replaceChildren(...s.tarif.map(() => h('li', { class: 'oy-tf-kalem' }, h('b'), h('small'))));
  }
  kalemKur();

  function kalemCiz() {
    [...kalemler.children].forEach((li, i) => {
      const hatali = s.faz === 'tasti' && i === s.girilen;
      const acik = s.faz === 'goster' || i < s.girilen || hatali;
      const m = MALZEMELER[hatali ? sonYanlis : s.tarif[i]];
      li.dataset.d = hatali ? 'yanlis' : s.faz !== 'goster' && acik ? 'dolu' : acik ? 'acik' : 'kapali';
      li.firstChild.textContent = acik ? m.emoji : '?';
      li.lastChild.textContent = acik ? m.ad : '';
    });
  }

  function olaylar() {
    for (const o of s.olaylar.splice(0)) {
      if (o.tur === 'dogru') {
        if (o.girilen < s.tarif.length) sfx('tick');
        duyur(`${MALZEMELER[o.malzeme].ad} eklendi.`);
      } else if (o.tur === 'yanlis') {
        sonYanlis = o.malzeme;
        sfx('wrong');
        duyur(o.can > 0 ? `Yanlış malzeme. Mama taştı; ${o.can} hakkın kaldı.` : 'Yanlış malzeme. Mama taştı; hakkın kalmadı.');
      } else if (o.tur === 'tamam') {
        bonus.textContent = `+${o.bonus}`;
        sfx('match');
        duyur(`Afiyet olsun! ${o.bonus} bonus puan.`);
      } else if (o.tur === 'faz') {
        if (o.faz === 'goster') { kalemKur(); kartDuyur = true; }
        if (o.faz === 'ekle') duyur(`Tarif aklında mı? ${s.tarif.length} malzemeyi sırayla ekle.`);
      }
    }
  }

  function ciz(dt) {
    basili.kalan -= dt;
    dugmeler.forEach((b, i) => {
      b.classList.toggle('dogru', basili.dogru && basili.kalan > 0 && basili.i === i);
      b.classList.toggle('yanlis', s.faz === 'tasti' && basili.i === i);
    });
    if (s.faz === 'goster') kok.style.setProperty('--kart', (1 - s.fazT / gosterMs(s)).toFixed(3));
    const anahtar = `${s.faz}|${s.girilen}`;
    if (anahtar === sonAnahtar) return;
    sonAnahtar = anahtar;
    kok.dataset.faz = s.faz;
    durum.textContent = METIN[s.faz];
    kok.style.setProperty('--seviye', s.faz === 'tasti' ? '1' : (s.girilen / s.tarif.length).toFixed(3));
    dugmeler.forEach((b) => b.setAttribute('aria-disabled', s.faz === 'ekle' ? 'false' : 'true'));
    canlar.forEach((c, i) => c.classList.toggle('kayip', i >= s.can));
    bonus.hidden = s.faz !== 'iyi';
    kalemCiz();
  }

  return {
    adim(dt) {
      adim(s, dt);
      olaylar();
      if (kartDuyur && dt > 0) {
        kartDuyur = false;
        duyur(`Tarif: ${s.tarif.map((m) => MALZEMELER[m].ad).join(', ')}.`);
      }
      dusenleriAzalt(dt);
      ciz(dt);
      return { skor: s.skor, bitti: s.bitti, kalanMs: kalanMs(s), ilerleme: s.t / SURE };
    },
    temizle() {
      sahne.removeEventListener('keydown', tus);
      kok.remove();
    },
  };
}
