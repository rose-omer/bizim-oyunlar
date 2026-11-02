// Balon patlat: canvas görünümü. Mantık balon.js'te.
import { sfx } from '../../../js/core/sound.js';
import { yeni, adim, dokun, kalanMs, SURE, GEN, YUK } from './balon.js';
import { tuvalKur, efektler } from './tuval.js';

const RENKLER = ['oy-b1', 'oy-b2', 'oy-b3', 'oy-b4'];
const BULUTLAR = [{ x: 18, y: 26, s: 1 }, { x: 74, y: 52, s: 0.8 }, { x: 34, y: 98, s: 0.7 }];

function bulut(ctx, x, y, s) {
  ctx.beginPath();
  ctx.arc(x, y, 6 * s, Math.PI * 0.5, Math.PI * 1.5);
  ctx.arc(x + 7 * s, y - 5 * s, 7.5 * s, Math.PI, Math.PI * 2);
  ctx.arc(x + 15 * s, y - 1 * s, 6 * s, Math.PI * 1.3, Math.PI * 0.5);
  ctx.closePath();
  ctx.fill();
}

function balonCiz(tv, b) {
  const { ctx } = tv;
  const rx = b.r;
  const ry = b.r * 1.16;
  const renk = b.tur === 'altin' ? tv.renk('oy-altin') : b.tur === 'diken' ? tv.renk('oy-diken') : tv.renk(RENKLER[b.renk]);
  // ip
  ctx.strokeStyle = tv.renk('oy-ip');
  ctx.lineWidth = 0.45;
  ctx.beginPath();
  ctx.moveTo(b.x, b.y + ry + 1.5);
  ctx.quadraticCurveTo(b.x + 2.5, b.y + ry + 7, b.x - 0.5, b.y + ry + 13);
  ctx.stroke();
  // dikenler (gövdenin arkasında)
  if (b.tur === 'diken') {
    ctx.fillStyle = renk;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      ctx.beginPath();
      ctx.moveTo(b.x + c * (rx + 3.2), b.y + s * (ry + 3.2));
      ctx.lineTo(b.x + Math.cos(a + 0.22) * rx * 0.9, b.y + Math.sin(a + 0.22) * ry * 0.9);
      ctx.lineTo(b.x + Math.cos(a - 0.22) * rx * 0.9, b.y + Math.sin(a - 0.22) * ry * 0.9);
      ctx.fill();
    }
  }
  if (b.tur === 'altin') { // yumuşak hale
    ctx.fillStyle = tv.renk('oy-altin-hale');
    ctx.beginPath();
    ctx.ellipse(b.x, b.y, rx + 3.5, ry + 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // düğüm
  ctx.fillStyle = renk;
  ctx.beginPath();
  ctx.moveTo(b.x, b.y + ry - 0.5);
  ctx.lineTo(b.x - 1.6, b.y + ry + 2);
  ctx.lineTo(b.x + 1.6, b.y + ry + 2);
  ctx.closePath();
  ctx.fill();
  // gövde: hafif armut
  ctx.beginPath();
  ctx.moveTo(b.x, b.y + ry);
  ctx.bezierCurveTo(b.x + rx * 1.35, b.y + ry * 0.55, b.x + rx * 1.2, b.y - ry, b.x, b.y - ry);
  ctx.bezierCurveTo(b.x - rx * 1.2, b.y - ry, b.x - rx * 1.35, b.y + ry * 0.55, b.x, b.y + ry);
  ctx.fill();
  // parıltı
  ctx.fillStyle = tv.renk('oy-parilti');
  ctx.beginPath();
  ctx.ellipse(b.x - rx * 0.38, b.y - ry * 0.42, rx * 0.2, ry * 0.32, -0.5, 0, Math.PI * 2);
  ctx.fill();
  if (b.tur === 'altin') { // yıldız pırıltısı
    ctx.fillStyle = tv.renk('oy-parilti');
    const sx = b.x + rx * 0.35;
    const sy = b.y + ry * 0.1;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const d = i % 2 ? 0.8 : 2.6;
      ctx.lineTo(sx + Math.cos(a) * d, sy + Math.sin(a) * d);
    }
    ctx.fill();
  }
  if (b.tur === 'diken') { // kaşlı küçük surat: "dokunma"
    ctx.strokeStyle = tv.renk('oy-parilti');
    ctx.lineWidth = 0.7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(b.x - 4, b.y - 2.2); ctx.lineTo(b.x - 1.4, b.y - 1);
    ctx.moveTo(b.x + 4, b.y - 2.2); ctx.lineTo(b.x + 1.4, b.y - 1);
    ctx.moveTo(b.x - 2.2, b.y + 3.2); ctx.quadraticCurveTo(b.x, b.y + 1.8, b.x + 2.2, b.y + 3.2);
    ctx.stroke();
  }
}

export function kur({ sahne, tohum, azHareket, duyur }) {
  const s = yeni({ tohum, yavas: azHareket });
  const tv = tuvalKur(sahne, { gen: GEN, yuk: YUK });
  const fx = efektler(azHareket);
  let altinSay = 0;

  const bas = (e) => {
    if (s.bitti) return;
    e.preventDefault();
    const p = tv.nokta(e.clientX, e.clientY);
    const r = dokun(s, p.x, p.y);
    if (!r) return;
    const renk = r.tur === 'altin' ? 'oy-altin-yazi' : r.tur === 'diken' ? 'bad' : 'text';
    fx.ekle({ tur: 'kirinti', x: r.x, y: r.y, r: r.r, renk: r.tur === 'altin' ? 'oy-altin' : r.tur === 'diken' ? 'oy-diken' : 'oy-parilti', aci: Math.random(), sure: 380 });
    fx.ekle({ tur: 'yazi', x: r.x, y: r.y, metin: r.puan > 0 ? `+${r.puan}` : `−${-r.puan}`, renk, boy: r.tur === 'normal' ? 7 : 9, sure: 650 });
    if (r.tur === 'altin') { sfx('match'); if (++altinSay === 1) duyur('Altın balon! Artı 5'); }
    else if (r.tur === 'diken') sfx('wrong');
    else sfx('pop');
  };
  tv.cv.addEventListener('pointerdown', bas);

  function ciz(dt) {
    tv.kare();
    const { ctx } = tv;
    ctx.fillStyle = tv.renk('oy-bulut');
    const kay = azHareket ? 0 : s.t / 900;
    for (const b of BULUTLAR) bulut(ctx, ((b.x + kay * b.s + 20) % (GEN + 40)) - 20, b.y, b.s);
    for (const b of s.balonlar) balonCiz(tv, b);
    fx.ciz(tv, dt);
  }

  return {
    adim(dt) {
      adim(s, dt);
      ciz(dt);
      return { skor: s.skor, bitti: s.bitti, kalanMs: kalanMs(s), ilerleme: s.t / SURE };
    },
    temizle() { tv.cv.removeEventListener('pointerdown', bas); tv.temizle(); },
  };
}
