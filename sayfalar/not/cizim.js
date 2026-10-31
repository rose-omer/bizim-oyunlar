// Not için parmakla çizim alanı: Çiz Bakalım'ın çizgi deposu (cizgi.js) ve tuvali (tuval.js), ağsız.
//   const ped = cizimPedi();  el.append(ped.el);
//   ped.bos()        // çizgi yok mu
//   await ped.blob() // kare PNG (yükleme öncesi fotoKucult ile WebP olur)
//   ped.kapat()      // gözlemciyi bırakır
import { h } from '../../js/core/ui.js';
import { sfx } from '../../js/core/sound.js';
import { ikon } from '../listeler/ikonlar.js';
import { PALETTE, ERASER, BRUSHES, MAX_STROKE_PTS, toNorm, farEnough, StrokeStore } from '../../games/ciz/cizgi.js';
import { Tuval, exportPng } from '../../games/ciz/tuval.js';

const BEN = 'ben';
const SILGI_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M15.5 4.5 20 9l-9.5 9.5H6L3.5 16a1.4 1.4 0 0 1 0-2z"/><path d="M9 10l5 5M11 19.5h9"/></svg>';
const svgEl = (s) => {
  const t = document.createElement('template');
  t.innerHTML = s;
  return t.content.firstElementChild;
};

export function cizimPedi({ onDegis } = {}) {
  const store = new StrokeStore({ maxStrokes: 400, maxPoints: 40_000 });
  const arac = { c: 0, b: 1, silgi: false };
  let cur = null;
  let n = 0;

  const canvas = h('canvas', { class: 'nt-tuval', role: 'img', 'aria-label': 'Çizim alanı. Parmağınla çiz.' });
  const kagit = h('div', { class: 'nt-kagit-ciz' }, canvas);
  const tuval = new Tuval(canvas);

  const renkler = h('div', { class: 'nt-renkler', role: 'group', 'aria-label': 'Renk' },
    PALETTE.map((p, i) => h('button', {
      type: 'button', class: 'nt-renk', style: { '--sw': p.color }, 'aria-label': p.name, dataset: { c: String(i) },
    })));
  const kalinlik = h('div', { class: 'nt-araclar', role: 'group', 'aria-label': 'Kalınlık ve araçlar' },
    BRUSHES.map((b, i) => h('button', {
      type: 'button', class: 'nt-arac nt-firca', 'aria-label': `Kalınlık: ${b.name}`, dataset: { b: String(i) },
    }, h('span', { style: { '--d': `${4 + i * 5}px` } }))),
    h('button', { type: 'button', class: 'nt-arac', dataset: { a: 'silgi' }, 'aria-label': 'Silgi' }, svgEl(SILGI_SVG)),
    h('button', { type: 'button', class: 'nt-arac', dataset: { a: 'geri' }, 'aria-label': 'Son çizgiyi geri al' }, ikon('undo')),
    h('button', { type: 'button', class: 'nt-arac', dataset: { a: 'temizle' }, 'aria-label': 'Tuvali temizle' }, ikon('trash')));
  const el = h('div', { class: 'nt-ciz' }, kagit, renkler, kalinlik);

  function boya() {
    for (const b of renkler.children) b.setAttribute('aria-pressed', String(!arac.silgi && Number(b.dataset.c) === arac.c));
    for (const b of kalinlik.querySelectorAll('[data-b]')) b.setAttribute('aria-pressed', String(Number(b.dataset.b) === arac.b));
    kalinlik.querySelector('[data-a="silgi"]').setAttribute('aria-pressed', String(arac.silgi));
    const bos = !store.list.length;
    kalinlik.querySelector('[data-a="geri"]').disabled = bos;
    kalinlik.querySelector('[data-a="temizle"]').disabled = bos;
  }

  function uygula(op) {
    const r = store.apply(op, BEN);
    if (r === 'redraw') tuval.redraw(store.list);
    else if (r === 'add') tuval.touch(store.get(op.id), true);
    if (op.t !== 'sp') { boya(); onDegis?.(); }
  }

  function basla(x, y, pid, rect) {
    cur = { id: `n${(n++).toString(36)}`, pid, rect, lx: x, ly: y };
    uygula({ t: 's0', id: cur.id, c: arac.silgi ? ERASER : arac.c, w: BRUSHES[arac.b].w, p: [x, y] });
  }
  function bitir() {
    if (!cur) return;
    uygula({ t: 's1', id: cur.id });
    cur = null;
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary || cur) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch { /* eski tarayıcı */ }
    const rect = canvas.getBoundingClientRect();
    const [x, y] = toNorm(e.clientX, e.clientY, rect);
    basla(x, y, e.pointerId, rect);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!cur || e.pointerId !== cur.pid) return;
    e.preventDefault();
    const evs = e.getCoalescedEvents?.() || [];
    let pts = [];
    for (const ev of evs.length ? evs : [e]) {
      const [x, y] = toNorm(ev.clientX, ev.clientY, cur.rect);
      if (!farEnough(cur.lx, cur.ly, x, y)) continue;
      const s = store.get(cur.id);
      if (s && s.p.length / 2 + pts.length / 2 >= MAX_STROKE_PTS) {
        if (pts.length) uygula({ t: 'sp', id: cur.id, p: pts });
        pts = [];
        const { pid, rect, lx, ly } = cur;
        bitir();
        basla(lx, ly, pid, rect);
      }
      pts.push(x, y);
      cur.lx = x;
      cur.ly = y;
    }
    if (pts.length) uygula({ t: 'sp', id: cur.id, p: pts });
  });
  for (const ad of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    canvas.addEventListener(ad, (e) => { if (cur && e.pointerId === cur.pid) bitir(); });
  }

  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || !el.contains(b)) return;
    if (b.dataset.c) { arac.c = Number(b.dataset.c); arac.silgi = false; }
    else if (b.dataset.b) arac.b = Number(b.dataset.b);
    else if (b.dataset.a === 'silgi') arac.silgi = !arac.silgi;
    else if (b.dataset.a === 'geri') {
      const id = store.lastOwn(BEN);
      if (id) uygula({ t: 'undo', id });
    } else if (b.dataset.a === 'temizle') uygula({ t: 'clear' });
    sfx('tap');
    boya();
  });

  // Tuval kâğıdın genişliğine oturur (kare).
  let kenar = 0;
  const olc = () => {
    const w = Math.floor(kagit.clientWidth);
    if (!w || w === kenar) return;
    kenar = w;
    tuval.resize(w, store.list);
  };
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(olc) : null;
  ro?.observe(kagit);
  requestAnimationFrame(olc);
  boya();

  return {
    el,
    bos: () => !store.list.length,
    blob: () => exportPng(store.list, 1000),
    kapat: () => ro?.disconnect(),
  };
}
