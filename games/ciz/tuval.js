// Tuval çizici: çizgileri ikinci dereceden orta noktalarla yumuşatır, artımlı çizer.
// Uzak çizgiler gelen noktaları ~100 ms'ye yayarak gösterir. DOM kullanır; testler içe aktarmaz.
import { Q, PAPER, ERASER, ERASER_SCALE, colorOf } from './cizgi.js';

// st = { r: sıradaki parça, e: uç çizildi mi }; v = görünen nokta sayısı.
function paint(ctx, S, s, st, v, final) {
  const p = s.p;
  const total = p.length / 2;
  const n = Math.min(v, total);
  if (!n) return;
  const k = S / Q;
  const X = (i) => p[2 * i] * k;
  const Y = (i) => p[2 * i + 1] * k;
  const color = colorOf(s.c);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(1, s.w * k * (s.c === ERASER ? ERASER_SCALE : 1));
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (st.r === 0 && n >= 2) {
    ctx.beginPath();
    ctx.moveTo(X(0), Y(0));
    ctx.lineTo((X(0) + X(1)) / 2, (Y(0) + Y(1)) / 2);
    ctx.stroke();
    st.r = 1;
  }
  if (st.r >= 1 && st.r <= n - 2) {
    ctx.beginPath();
    ctx.moveTo((X(st.r - 1) + X(st.r)) / 2, (Y(st.r - 1) + Y(st.r)) / 2);
    for (; st.r <= n - 2; st.r++) {
      const i = st.r;
      ctx.quadraticCurveTo(X(i), Y(i), (X(i) + X(i + 1)) / 2, (Y(i) + Y(i + 1)) / 2);
    }
    ctx.stroke();
  }
  if (final && !st.e && n === total) {
    ctx.beginPath();
    if (n === 1) {
      ctx.arc(X(0), Y(0), ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.moveTo((X(n - 2) + X(n - 1)) / 2, (Y(n - 2) + Y(n - 1)) / 2);
      ctx.lineTo(X(n - 1), Y(n - 1));
      ctx.stroke();
    }
    st.e = true;
  }
}

export class Tuval {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.S = 0;
    this.css = 0;
    this.active = new Set();
    this.raf = 0;
    this.frame = this.frame.bind(this);
  }

  resize(cssSize, list) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const px = Math.max(1, Math.round(cssSize * dpr));
    this.css = cssSize;
    this.cv.style.width = `${cssSize}px`;
    this.cv.style.height = `${cssSize}px`;
    if (this.cv.width !== px) {
      this.cv.width = px;
      this.cv.height = px;
    }
    this.S = px;
    this.redraw(list);
  }

  redraw(list) {
    const { ctx, S } = this;
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, S, S);
    this.active.clear();
    for (const s of list) {
      s._st = { r: 0, e: false };
      s._v = s.p.length / 2;
      paint(ctx, S, s, s._st, s._v, s.done);
      if (!s.done) this.active.add(s);
    }
  }

  // Çizgi değişti: sonraki karede artımlı çiz. local = kendi çizgimiz (beklemeden göster).
  touch(s, local) {
    if (!s) return;
    if (!s._st) { s._st = { r: 0, e: false }; s._v = 0; }
    if (local) s._v = s.p.length / 2;
    this.active.add(s);
    if (!this.raf) this.raf = requestAnimationFrame(this.frame);
  }

  frame() {
    this.raf = 0;
    for (const s of this.active) {
      const n = s.p.length / 2;
      if (s._v < n) s._v = Math.min(n, s._v + Math.max(1, Math.ceil((n - s._v) / 5)));
      paint(this.ctx, this.S, s, s._st, s._v, s.done);
      if (s._v >= n && (!s.done || s._st.e)) this.active.delete(s);
    }
    if (this.active.size) this.raf = requestAnimationFrame(this.frame);
  }
}

// Tüm çizgileri kare PNG olarak verir.
export function exportPng(list, size = 1200) {
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, size, size);
  for (const s of list) paint(ctx, size, s, { r: 0, e: false }, s.p.length / 2, true);
  return new Promise((resolve) => cv.toBlob(resolve, 'image/png'));
}
