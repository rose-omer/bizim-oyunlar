// Ninni ritmi: DOM/SVG görünümü (yıldızlar gerçek <button>). Mantık ninni.js'te.
// Notalar: sound.js'te perde seçilemediği için küçük yerel sentez; sessiz ayarına (isMuted) uyar.
import { h } from '../../../js/core/ui.js';
import { sfx, isMuted } from '../../../js/core/sound.js';
import { yeni, adim, dokun, yanan, kalanMs, SURE, YILDIZ, CAN, ILK_UZUNLUK, notaMs } from './ninni.js';

const PERDE = [523.25, 587.33, 659.25, 783.99, 880]; // do re mi sol la: pentatonik, ninni yumuşaklığı
const ADLAR = ['Birinci', 'İkinci', 'Üçüncü', 'Dördüncü', 'Beşinci'];
const DOLU_AY = 9; // bu uzunlukta ay dolunay olur
const KONUM = [[14, 80], [32, 70], [50, 85], [68, 70], [86, 80]]; // yıldız merkezleri (% x, % y)
const YILDIZ_D = 'M50 6 L61.8 36.2 L94 38.2 L69 58.8 L77.2 90.2 L50 72.6 L22.8 90.2 L31 58.8 L6 38.2 L38.2 36.2 Z';
const BULUT_D = 'M14 30 C4 30 4 18 14 18 C15 9 28 7 32 15 C38 9 50 13 48 21 C56 21 56 30 48 30 Z';

let actx = null;
/**
 * AudioContext'i kurar ya da uyandırır; sessizde null. iOS sesi yalnız kullanıcı hareketi içinde açar: kur() bunu oyun
 * kutusundaki dokunuşa (Başla) bağlar, yoksa ilk "dinle" notası sessiz kalır.
 */
function sesAc() {
  if (isMuted()) return null;
  if (!actx) {
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return null;
    try { actx = new AC(); } catch { return null; }
    // Eski iOS: hareket içinde çalınan tek örneklik sessiz tampon kilidi açar.
    try {
      const b = actx.createBufferSource();
      b.buffer = actx.createBuffer(1, 1, 22050);
      b.connect(actx.destination);
      b.start(0);
    } catch { /* ses kritik değil */ }
  }
  if (actx.state !== 'running') actx.resume().catch(() => {}); // suspended ya da iOS 'interrupted'
  return actx;
}

function nota(i, ms) {
  const actx = sesAc();
  if (!actx) return;
  try {
    const t0 = actx.currentTime;
    const son = t0 + ms / 1000 + 0.35;
    for (const [carp, vol, tip] of [[1, 0.15, 'sine'], [2, 0.025, 'triangle']]) {
      const o = actx.createOscillator();
      const g = actx.createGain();
      o.type = tip;
      o.frequency.value = PERDE[i] * carp;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + 0.025);
      g.gain.exponentialRampToValueAtTime(0.0001, son);
      o.connect(g);
      g.connect(actx.destination);
      o.start(t0);
      o.stop(son + 0.05);
    }
  } catch { /* ses kritik değil */ }
}

export function kur({ sahne, tohum, azHareket, duyur }) {
  const s = yeni({ tohum, yavas: azHareket });
  const golge = h('div', { class: 'oy-ay-golge' });
  const bulutlar = Array.from({ length: CAN }, (_, i) => h('div', { class: 'oy-ay-bulut', 'data-i': String(i), html: `<svg viewBox="0 0 60 34" aria-hidden="true"><path d="${BULUT_D}"/></svg>` }));
  const ay = h('div', { class: 'oy-ay', 'aria-hidden': 'true' }, h('div', { class: 'oy-ay-disk' }, golge), bulutlar);
  const durum = h('p', { class: 'oy-ninni-durum', 'aria-hidden': 'true' }, 'Dinle…');
  const izler = h('div', { class: 'oy-ninni-iz', 'aria-hidden': 'true' });
  // Takımyıldız çizgisi: yıldız konumları oyun.css ile aynı (yüzde).
  const cizgi = h('div', { class: 'oy-takim', 'aria-hidden': 'true', html: `<svg viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points="${KONUM.map(([x, y]) => `${x},${y}`).join(' ')}"/></svg>` });
  let basili = { i: -1, kalan: 0 };
  const yildizlar = Array.from({ length: YILDIZ }, (_, i) => h('button', {
    type: 'button', class: 'oy-yildiz', 'data-i': String(i), 'aria-label': `${ADLAR[i]} yıldız`, 'aria-disabled': 'true',
    html: `<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false"><path d="${YILDIZ_D}"/></svg>`,
    style: { left: `${KONUM[i][0]}%`, top: `${KONUM[i][1]}%` },
    onClick: () => tikla(i),
  }));
  const kok = h('div', { class: 'oy-ninni' }, cizgi, ay, durum, izler, h('div', { class: 'oy-yildizlar' }, yildizlar));
  sahne.append(kok);
  sahne.setAttribute('aria-label', 'Ninni Ritmi oyun alanı. Yıldızlara 1-5 tuşlarıyla da dokunabilirsin.');

  const tus = (e) => {
    const i = Number(e.key) - 1;
    if (Number.isInteger(i) && i >= 0 && i < YILDIZ) { e.preventDefault(); tikla(i); }
  };
  sahne.addEventListener('keydown', tus);
  // Ses kilidi: oyun kutusundaki her dokunuşta (Başla dahil) senkron açılır; açıkken etkisiz.
  const kutu = sahne.closest('.oy') || sahne;
  const HAREKET = ['pointerup', 'touchend', 'keydown', 'click'];
  for (const t of HAREKET) kutu.addEventListener(t, sesAc, { capture: true, passive: true });

  function tikla(i) {
    const r = dokun(s, i);
    if (!r) return;
    basili = { i, kalan: 240 };
    if (r.dogru) nota(i, 220);
  }

  function izKur() {
    izler.replaceChildren(...Array.from({ length: s.uzunluk }, () => h('i')));
  }
  izKur();

  function olaylar() {
    for (const o of s.olaylar.splice(0)) {
      if (o.tur === 'nota') nota(o.yildiz, notaMs(s.uzunluk) * s.carpan);
      else if (o.tur === 'hata') {
        sfx('wrong');
        duyur(o.can > 0 ? `Yanlış yıldız. Bir bulut geldi; ${o.can} hakkın kaldı.` : 'Bulutlar ayı örttü.');
      } else if (o.tur === 'tamam') sfx('match');
      else if (o.tur === 'faz') {
        if (o.faz === 'dinle') izKur();
        if (o.faz === 'cal') duyur(`Sıra sende: ${s.uzunluk} nota.`);
        if (o.faz === 'iyi') duyur(`Çok güzel! Ninni uzuyor.`);
      }
    }
  }

  const METIN = { dinle: 'Dinle…', cal: 'Sıra sende', iyi: 'Çok güzel!', hata: 'Bir bulut geldi' };

  function ciz(dt) {
    const y = yanan(s);
    basili.kalan -= dt;
    const cal = s.faz === 'cal';
    yildizlar.forEach((b, i) => {
      b.classList.toggle('yanik', y === i || (basili.kalan > 0 && basili.i === i));
      b.classList.toggle('hatali', s.faz === 'hata' && basili.i === i);
      b.setAttribute('aria-disabled', cal ? 'false' : 'true');
    });
    durum.textContent = METIN[s.faz] || '';
    kok.dataset.faz = s.faz;
    const p = Math.min(1, (s.uzunluk - ILK_UZUNLUK) / (DOLU_AY - ILK_UZUNLUK));
    kok.style.setProperty('--ay', p.toFixed(3));
    bulutlar.forEach((b, i) => b.classList.toggle('gelmis', CAN - s.can > i));
    [...izler.children].forEach((n, i) => n.classList.toggle('dolu', (cal || s.faz === 'iyi') && i < s.girilen));
  }

  return {
    adim(dt) {
      adim(s, dt);
      olaylar();
      ciz(dt);
      return { skor: s.skor, bitti: s.bitti, kalanMs: kalanMs(s), ilerleme: s.t / SURE };
    },
    temizle() {
      sahne.removeEventListener('keydown', tus);
      for (const t of HAREKET) kutu.removeEventListener(t, sesAc, { capture: true });
      kok.remove();
    },
  };
}
