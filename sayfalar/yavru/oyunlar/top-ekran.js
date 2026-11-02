// Top yakala: canvas görünümü. Mantık top.js'te.
// Sürükleme ya da dokunulan yere sepet gider; klavyede ← → (Shift ile hızlı).
import { sfx } from '../../../js/core/sound.js';
import { yeni, adim, sepetKonum, sepetKaydir, kalanMs, SURE, GEN, YUK, SEPET_G, SEPET_Y, PUAN } from './top.js';
import { tuvalKur, efektler } from './tuval.js';

const R = Math.PI * 2;

function yildizYol(ctx, x, y, d, ic = 0.45) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i / 10) * R;
    const r = i % 2 ? d * ic : d;
    ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  ctx.closePath();
}

function yuvarlakKare(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

const CIZIMLER = {
  top(tv, r) {
    const { ctx } = tv;
    ctx.fillStyle = tv.renk('oy-b1');
    ctx.beginPath(); ctx.arc(0, 0, r, 0, R); ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = tv.renk('oy-b4');
    ctx.fillRect(-r, -r * 0.28, r * 2, r * 0.56);
    ctx.restore();
    ctx.fillStyle = tv.renk('oy-parilti');
    ctx.beginPath(); ctx.ellipse(-r * 0.4, -r * 0.45, r * 0.22, r * 0.14, -0.6, 0, R); ctx.fill();
  },
  kup(tv, r) {
    const { ctx } = tv;
    ctx.fillStyle = tv.renk('oy-b3');
    yuvarlakKare(ctx, -r, -r, r * 2, r * 2, r * 0.35); ctx.fill();
    ctx.fillStyle = tv.renk('oy-parilti');
    ctx.font = tv.font(r * 1.35, 900);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('A', 0, r * 0.08);
  },
  cingirak(tv, r) {
    const { ctx } = tv;
    ctx.strokeStyle = tv.renk('oy-b2');
    ctx.lineWidth = r * 0.32;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, r * 0.2); ctx.lineTo(0, r * 1.05); ctx.stroke();
    ctx.lineWidth = r * 0.22;
    ctx.beginPath(); ctx.arc(0, r * 1.25, r * 0.3, 0, R); ctx.stroke();
    ctx.fillStyle = tv.renk('oy-b2');
    ctx.beginPath(); ctx.arc(0, -r * 0.25, r * 0.75, 0, R); ctx.fill();
    ctx.fillStyle = tv.renk('oy-parilti');
    for (const [x, y] of [[-0.3, -0.4], [0.25, -0.1], [0, -0.65]]) { ctx.beginPath(); ctx.arc(x * r, y * r, r * 0.12, 0, R); ctx.fill(); }
  },
  ayicik(tv, r) {
    const { ctx } = tv;
    ctx.fillStyle = tv.renk('oy-sepet');
    for (const x of [-0.68, 0.68]) { ctx.beginPath(); ctx.arc(x * r, -r * 0.68, r * 0.36, 0, R); ctx.fill(); }
    ctx.beginPath(); ctx.arc(0, 0, r * 0.92, 0, R); ctx.fill();
    ctx.fillStyle = tv.renk('oy-parilti');
    ctx.beginPath(); ctx.ellipse(0, r * 0.3, r * 0.38, r * 0.28, 0, 0, R); ctx.fill();
    ctx.fillStyle = tv.renk('oy-goz');
    for (const x of [-0.32, 0.32]) { ctx.beginPath(); ctx.arc(x * r, -r * 0.12, r * 0.1, 0, R); ctx.fill(); }
    ctx.beginPath(); ctx.arc(0, r * 0.22, r * 0.1, 0, R); ctx.fill();
  },
  yildiz(tv, r) {
    const { ctx } = tv;
    ctx.fillStyle = tv.renk('oy-altin-hale');
    yildizYol(ctx, 0, 0, r * 1.45); ctx.fill();
    ctx.fillStyle = tv.renk('oy-altin');
    yildizYol(ctx, 0, 0, r * 1.15); ctx.fill();
  },
};

function sepetCiz(tv, x, ez) {
  const { ctx } = tv;
  const g = SEPET_G;
  const y = SEPET_Y;
  const hgt = 11 * (1 - ez * 0.12);
  ctx.save();
  ctx.translate(x, y + 11 - hgt);
  // gövde (aşağı daralan)
  ctx.fillStyle = tv.renk('oy-sepet');
  ctx.beginPath();
  ctx.moveTo(-g / 2, 0);
  ctx.lineTo(g / 2, 0);
  ctx.lineTo(g / 2 - 3, hgt);
  ctx.lineTo(-g / 2 + 3, hgt);
  ctx.closePath();
  ctx.fill();
  // örgü çizgileri
  ctx.strokeStyle = tv.renk('oy-sepet-2');
  ctx.lineWidth = 0.6;
  for (let i = 1; i < 3; i++) {
    const yy = (hgt * i) / 3;
    ctx.beginPath(); ctx.moveTo(-g / 2 + (3 * yy) / hgt, yy); ctx.lineTo(g / 2 - (3 * yy) / hgt, yy); ctx.stroke();
  }
  for (let i = -3; i <= 3; i++) {
    ctx.beginPath(); ctx.moveTo((i * g) / 8, 0); ctx.lineTo((i * (g - 6)) / 8, hgt); ctx.stroke();
  }
  // ağız kenarı
  ctx.fillStyle = tv.renk('oy-sepet-2');
  ctx.beginPath(); ctx.roundRect(-g / 2 - 1, -1.6, g + 2, 3.2, 1.6); ctx.fill();
  ctx.restore();
}

export function kur({ sahne, tohum, azHareket, duyur }) {
  const s = yeni({ tohum, yavas: azHareket });
  const tv = tuvalKur(sahne, { gen: GEN, yuk: YUK });
  const fx = efektler(azHareket);
  let surukle = false;
  let ez = 0; // sepet sıkışma (yakalayınca)

  const git = (e) => { if (!s.bitti) sepetKonum(s, tv.nokta(e.clientX, e.clientY).x); };
  const bas = (e) => { e.preventDefault(); surukle = true; tv.cv.setPointerCapture?.(e.pointerId); git(e); };
  const kay = (e) => { if (surukle) git(e); };
  const birak = () => { surukle = false; };
  const tus = (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    sepetKaydir(s, (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 14 : 7));
  };
  tv.cv.addEventListener('pointerdown', bas);
  tv.cv.addEventListener('pointermove', kay);
  tv.cv.addEventListener('pointerup', birak);
  tv.cv.addEventListener('pointercancel', birak);
  sahne.addEventListener('keydown', tus);
  sahne.setAttribute('aria-label', 'Top Yakala oyun alanı. Sepeti sol ve sağ ok tuşlarıyla kaydır.');

  function olaylar() {
    for (const o of s.olaylar.splice(0)) {
      if (o.tur === 'yakalandi') {
        ez = 1;
        const seri = o.puan > PUAN[o.esya];
        fx.ekle({ tur: 'yazi', x: o.x, y: SEPET_Y - 8, metin: seri ? `Seri! +${o.puan}` : `+${o.puan}`, renk: o.esya === 'yildiz' || seri ? 'oy-altin-yazi' : 'text', boy: seri ? 8 : 7, sure: 700 });
        if (seri) { sfx('match'); duyur(`Seri! ${o.seri} yakalama`); } else sfx(o.esya === 'yildiz' ? 'match' : 'snap');
      } else if (o.tur === 'kacti') fx.ekle({ tur: 'yazi', x: Math.min(GEN - 6, Math.max(6, o.x)), y: YUK - 6, metin: 'pıt', renk: 'muted', boy: 5, sure: 500 });
    }
  }

  function ciz(dt) {
    tv.kare();
    const { ctx } = tv;
    // halı
    ctx.fillStyle = tv.renk('oy-hali');
    ctx.beginPath(); ctx.roundRect(-4, SEPET_Y + 9, GEN + 8, 30, 6); ctx.fill();
    for (const e of s.esyalar) {
      ctx.save();
      ctx.translate(e.x, e.y);
      if (!azHareket) ctx.rotate((e.don * s.t) / 1000);
      CIZIMLER[e.tur](tv, e.r);
      ctx.restore();
    }
    sepetCiz(tv, s.sepetX, azHareket ? 0 : ez);
    ez = Math.max(0, ez - dt / 160);
    fx.ciz(tv, dt);
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
      tv.temizle();
    },
  };
}
