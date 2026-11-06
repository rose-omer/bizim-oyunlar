// Birlikte Salla: DOM/SVG görünümü ve oda mesajlaşması. Mantık salla.js'te.
// Mesaj: { tur: 'salla', a: 'hazir' } | { tur: 'salla', a: 'basla' } | { tur: 'salla', a: 'vur', b, i }. Küçük clientId'li taraf liderdir.
// kur() "Başla"dan önce çağrılır: mesajlaşma ilk adim(dt > 0) çağrısında başlar. baglam yoksa (önizleme) tek başına deneme.
import { h, ICONS } from '../../../js/core/ui.js';
import { sfx } from '../../../js/core/sound.js';
import { yeni, basla, adim, vur, esVurdu, elSikis, isik, hedefYari, pencerede, kalanMs, SURE } from './salla.js';

const HAZIR_MS = 1000;
const SIMDI_MS = 1000; // oyun başında "Şimdi!" süresi
const GERI_MS = 550; // "Güzel!", "Kaçtı", "Uyum!" süresi
const KALP_MS = 700; // salla.css oy-salla-kalp ile aynı
const FLAS_MS = 220;
const EGIM = 7; // beşiğin en büyük eğimi (derece)
const ISIK_YOL = 44; // ışığın ortadan en büyük uzaklığı (yol genişliğinin %'si)
const BEKLE_METIN = "Sevgilin de Birlikte Salla'yı açsın";
const AYRILDI_METIN = 'Sevgilin ayrıldı';

const SVG_AC = '<svg viewBox="0 0 200 180" aria-hidden="true" focusable="false">';
const BESIK_ARKA = `${SVG_AC}
<path class="oy-sb-kubbe" d="M24 88 C24 38 62 8 104 8 C146 8 176 42 176 88 Z"/>
<path class="oy-sb-ic" d="M38 88 C38 48 68 22 104 22 C138 22 162 52 162 88 Z"/>
</svg>`;
const BESIK_ON = `${SVG_AC}
<path class="oy-sb-cizgi" d="M58 136 L48 160 M142 136 L152 160"/>
<path class="oy-sb-cizgi" d="M22 156 Q100 182 178 156"/>
<path class="oy-sb-govde" d="M18 84 H182 C182 124 150 146 100 146 C50 146 18 124 18 84 Z"/>
<path class="oy-sb-orgu" d="M42 92 C46 114 58 130 72 138 M70 92 C72 114 80 132 88 144 M100 92 V145 M130 92 C128 114 120 132 112 144 M158 92 C154 114 142 130 128 138"/>
<rect class="oy-sb-kenar" x="12" y="78" width="176" height="12" rx="6"/>
<path class="oy-sb-kalp" transform="translate(86 100)" d="M14 25 C3 16 2 9 7 6 C10 4 13 6 14 9 C15 6 18 4 21 6 C26 9 25 16 14 25 Z"/>
</svg>`;
// Yerleşik bebek (bebekSvg yoksa): uyuyan yüz. Renkler oyun.css oy-bb-* jetonlarından.
const BEBEK_SVG = `<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
<ellipse class="oy-bb-yuz" cx="50" cy="56" rx="38" ry="34"/>
<path class="oy-bb-cizgi" d="M28 54 Q35 60 42 54 M58 54 Q65 60 72 54 M45 68 Q50 72 55 68"/>
<ellipse class="oy-bb-yanak" cx="27" cy="66" rx="6.5" ry="4"/><ellipse class="oy-bb-yanak" cx="73" cy="66" rx="6.5" ry="4"/>
</svg>`;

export function kur({ sahne, azHareket, duyur, bebekSvg, baglam }) {
  if (!document.querySelector('link[data-oy-salla]')) {
    document.head.append(h('link', { rel: 'stylesheet', href: new URL('./salla.css', import.meta.url).href, 'data-oy-salla': '' }));
  }
  const room = baglam?.room ?? null;
  const s = yeni({ yavas: azHareket });

  const durum = h('p', { class: 'oy-salla-durum', 'aria-hidden': 'true' });
  const notEl = h('p', { class: 'oy-salla-not', 'aria-hidden': 'true' });
  const besik = h('div', { class: 'oy-salla-besik' },
    h('div', { class: 'oy-salla-katman', html: BESIK_ARKA }),
    h('div', { class: 'oy-salla-bebek', html: bebekSvg || BEBEK_SVG }),
    h('div', { class: 'oy-salla-katman', html: BESIK_ON }));
  const kalpler = h('div', { class: 'oy-salla-kalpler' },
    [0, 1, 2].map((i) => h('span', { class: 'oy-salla-kalp', 'data-i': String(i), html: ICONS.heart })));
  const senEl = h('span', { class: 'oy-salla-kisi' }, 'Sen');
  const esEl = room ? h('span', { class: 'oy-salla-kisi' }, 'Sevgilin') : null;
  const hedef = h('i', { class: 'oy-salla-hedef' });
  const ray = h('div', { class: 'oy-salla-ray' }, h('i', { class: 'oy-salla-isik' }));
  const dugme = h('button', {
    type: 'button', class: 'btn primary oy-salla-dugme', 'aria-label': 'Salla', 'aria-disabled': 'true',
    // Parmak değdiği an sayılır (click parmak kalkınca gelir). Klavye ve ekran okuyucu click'i detail 0 ile gelir.
    onPointerdown: (e) => { if (e.button === 0) tikla(); },
    onClick: (e) => { if (e.detail === 0) tikla(); },
  }, 'Salla');
  const kok = h('div', { class: 'oy-salla' },
    durum, notEl,
    h('div', { class: 'oy-salla-alan', 'aria-hidden': 'true' }, besik, kalpler),
    h('div', { class: 'oy-salla-kisiler', 'aria-hidden': 'true' }, senEl, esEl),
    h('div', { class: 'oy-salla-yol', 'aria-hidden': 'true' }, hedef, ray),
    dugme);
  sahne.append(kok);
  sahne.setAttribute('aria-label', 'Birlikte Salla oyun alanı. Işık ortaya gelince Salla düğmesine dokun. Boşluk ya da Enter da olur.');

  let bagli = false;
  let ayrildi = false;
  let hazirZaman = 0;
  const offs = [];
  let geriMetin = '';
  let geriTur = '';
  let geriKalan = 0;
  let kalpKalan = 0;
  let senKalan = 0;
  let esKalan = 0;
  let ilkUyum = true;

  function tikla() {
    const r = vur(s);
    if (r) room?.send({ tur: 'salla', a: 'vur', b: r.b, i: r.isabet ? 1 : 0 });
  }

  const tus = (e) => {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault();
    if (!e.repeat) tikla();
  };
  sahne.addEventListener('keydown', tus);

  function hazirGonder() {
    if (s.faz === 'bekle') room.send({ tur: 'salla', a: 'hazir' });
    else clearInterval(hazirZaman);
  }

  function mesaj(m, from) {
    if (m?.tur !== 'salla') return;
    if (m.a === 'vur') esVurdu(s, { b: m.b, isabet: m.i === 1 });
    else if (elSikis(s, m.a, room.me.clientId < from?.clientId)) room.send({ tur: 'salla', a: 'basla' });
  }

  function varlik(p) {
    if (!p && !ayrildi && s.faz === 'oyun') duyur(`${AYRILDI_METIN}. Oyun sürüyor.`);
    ayrildi = !p;
  }

  function baglan() {
    if (!room) { basla(s); return; }
    offs.push(room.on('message', mesaj), room.on('presence', varlik));
    duyur(BEKLE_METIN);
    hazirGonder();
    hazirZaman = setInterval(hazirGonder, HAZIR_MS);
  }

  function geri(metin, tur) {
    geriMetin = metin;
    geriTur = tur;
    geriKalan = GERI_MS;
  }

  function kalpAt() {
    kalpler.classList.remove('uc');
    void kalpler.offsetWidth; // animasyonu yeniden başlat
    kalpler.classList.add('uc');
    kalpKalan = KALP_MS;
  }

  function olaylar() {
    for (const o of s.olaylar.splice(0)) {
      if (o.tur === 'vurus') sfx('tick');
      else if (o.tur === 'isabet') { sfx('tap'); geri('Güzel!', 'isabet'); senKalan = FLAS_MS; }
      else if (o.tur === 'kacti') { sfx('wrong'); geri('Kaçtı', 'kacti'); }
      else if (o.tur === 'es') esKalan = FLAS_MS;
      else if (o.tur === 'uyum') {
        sfx('match');
        geri('Uyum!', 'uyum');
        kalpAt();
        if (ilkUyum) duyur('Uyum! İkiniz aynı vuruşu tutturdunuz.');
        ilkUyum = false;
      } else if (o.tur === 'faz' && o.faz === 'oyun') duyur('Şimdi! Işık ortaya gelince dokun.');
    }
  }

  function notMetni() {
    if (s.faz === 'bekle') return BEKLE_METIN;
    if (!room) return 'Tek başına deneme';
    return ayrildi ? AYRILDI_METIN : '';
  }

  function yaz(el, metin) {
    if (el.textContent !== metin) el.textContent = metin;
  }

  function ciz(dt) {
    const x = isik(s);
    ray.style.transform = `translateX(${(x * ISIK_YOL).toFixed(2)}%)`;
    hedef.style.width = `${(hedefYari(s) * ISIK_YOL * 2).toFixed(1)}%`;
    if (!azHareket) besik.style.transform = `rotate(${(x * EGIM).toFixed(2)}deg)`;
    geriKalan -= dt;
    kalpKalan -= dt;
    senKalan -= dt;
    esKalan -= dt;
    const simdi = s.faz === 'oyun' && s.t < SIMDI_MS ? 'Şimdi!' : '';
    yaz(durum, geriKalan > 0 ? geriMetin : simdi);
    durum.dataset.tur = geriKalan > 0 ? geriTur : '';
    yaz(notEl, notMetni());
    if (kalpKalan <= 0) kalpler.classList.remove('uc');
    senEl.classList.toggle('vurdu', senKalan > 0);
    esEl?.classList.toggle('vurdu', esKalan > 0);
    kok.classList.toggle('icinde', pencerede(s));
    kok.dataset.faz = s.faz;
    dugme.setAttribute('aria-disabled', s.faz === 'oyun' ? 'false' : 'true');
  }

  return {
    adim(dt) {
      if (dt > 0 && !bagli) { bagli = true; baglan(); }
      adim(s, dt);
      olaylar();
      ciz(dt);
      return { skor: s.skor, bitti: s.faz === 'bitti', kalanMs: kalanMs(s), ilerleme: s.t / SURE };
    },
    temizle() {
      clearInterval(hazirZaman);
      for (const off of offs) off();
      sahne.removeEventListener('keydown', tus);
      kok.remove();
    },
  };
}
