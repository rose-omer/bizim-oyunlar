// Canvas yardımcısı (balon ve top paylaşır): DPR'ye uyar, mantıksal alanı (gen×yuk) sahneye sığdırır,
// renkleri CSS değişkenlerinden okur (tema değişince saniyede bir tazelenir).
import { h } from '../../../js/core/ui.js';

export function tuvalKur(sahne, { gen, yuk }) {
  const cv = h('canvas', { class: 'oy-tuval', 'aria-hidden': 'true' });
  sahne.append(cv);
  const ctx = cv.getContext('2d');
  let w = 1;
  let y = 1;
  let dpr = 1;
  let olcek = 1;
  let ox = 0;
  let oy = 0;
  const boyut = () => {
    const r = sahne.getBoundingClientRect();
    dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    w = Math.max(1, r.width);
    y = Math.max(1, r.height);
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(y * dpr);
    olcek = Math.min(w / gen, y / yuk);
    ox = (w - gen * olcek) / 2;
    oy = (y - yuk * olcek) / 2;
  };
  const ro = new ResizeObserver(boyut);
  ro.observe(sahne);
  boyut();

  let renkler = Object.create(null);
  let renkZamani = 0;
  const stil = () => getComputedStyle(sahne);
  let stilNesne = null;

  return {
    cv,
    ctx,
    /** Kareye başla: temizle, mantıksal koordinata geç. */
    kare() {
      const simdi = performance.now();
      if (simdi - renkZamani > 1000) { renkler = Object.create(null); stilNesne = null; renkZamani = simdi; }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.setTransform(dpr * olcek, 0, 0, dpr * olcek, dpr * ox, dpr * oy);
    },
    /** Ekran noktası (clientX/Y) → mantıksal nokta. */
    nokta(cx, cy) {
      const r = cv.getBoundingClientRect();
      return { x: (cx - r.left - ox) / olcek, y: (cy - r.top - oy) / olcek };
    },
    /** CSS değişkeni (ör. 'accent' → --accent). */
    renk(ad) {
      if (!(ad in renkler)) {
        stilNesne ??= stil();
        renkler[ad] = stilNesne.getPropertyValue(`--${ad}`).trim() || '#888';
      }
      return renkler[ad];
    },
    /** Yazı tipi gövde değişkeninden. */
    font(px, agirlik = 800) {
      stilNesne ??= stil();
      return `${agirlik} ${px}px ${stilNesne.getPropertyValue('--font-body') || 'sans-serif'}`;
    },
    temizle() { ro.disconnect(); cv.remove(); },
  };
}

/** Yukarı süzülüp sönen "+1" yazıları ve kırıntılar (az hareket: yalnız kısa yazı). */
export function efektler(az) {
  let liste = [];
  return {
    ekle(e) { liste.push({ t: 0, ...e }); },
    ciz(tv, dt) {
      const { ctx } = tv;
      liste = liste.filter((e) => (e.t += dt) < e.sure);
      for (const e of liste) {
        const p = e.t / e.sure;
        ctx.globalAlpha = 1 - p * p;
        if (e.tur === 'yazi') {
          ctx.fillStyle = tv.renk(e.renk);
          ctx.font = tv.font(e.boy ?? 7);
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(e.metin, e.x, e.y - (az ? 2 : 12) * p);
        } else if (e.tur === 'kirinti' && !az) {
          ctx.fillStyle = tv.renk(e.renk);
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2 + e.aci;
            const d = e.r * (0.6 + 1.1 * p);
            ctx.beginPath();
            ctx.arc(e.x + Math.cos(a) * d, e.y + Math.sin(a) * d, 1.3 * (1 - p) + 0.3, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      ctx.globalAlpha = 1;
    },
  };
}
