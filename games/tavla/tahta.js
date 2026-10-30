// Tavla tahtası: geometri ve SVG dizesi (saf; DOM yok). Bakan oyuncunun iç bölgesi hep sağ altta.
import { BAR, OFF, countAt } from './oyun.js';

export const PW = 32;   // hane genişliği
export const BARW = 28; // orta bar
export const TRAY = 30; // toplama kutusu
export const GAP = 4;
export const PADX = 6;
export const PADY = 13; // hane numaraları için kenar
export const PH = 150;  // hane yüksekliği (5 pul)
export const MID = 40;  // iki yarı arası
export const D = 30;    // pul çapı
export const W = PADX * 2 + 12 * PW + BARW + GAP + TRAY;
export const H = PADY * 2 + PH * 2 + MID;
const BOTTOM = PADY + 2 * PH + MID;
const RIGHT0 = PADX + 6 * PW + BARW;
const TRAY_X = PADX + 12 * PW + BARW + GAP;
const BAR_X = PADX + 6 * PW + BARW / 2;
const CY = PADY + PH + MID / 2;

/** Mutlak hane → bakan oyuncuya göre hane (0 = kendi iç bölgesinin sağ ucu). Tersine de aynı. */
export const relOf = (i, seat) => (seat === 1 ? 23 - i : i);
export const isTop = (r) => r >= 12;

/** Göreli hanenin sol x'i. */
export function colX(r) {
  if (r < 6) return RIGHT0 + (5 - r) * PW;
  if (r < 12) return PADX + (11 - r) * PW;
  if (r < 18) return PADX + (r - 12) * PW;
  return RIGHT0 + (r - 18) * PW;
}

/** k. pulun merkez y'si (0 = kenardaki). 5'ten fazla pulda sıkıştırılır. */
export function stackY(k, n, top) {
  const step = n > 5 ? (PH - D) / (n - 1) : D;
  return top ? PADY + D / 2 + k * step : BOTTOM - D / 2 - k * step;
}

const PIPS = {
  1: [[0, 0]],
  2: [[-1, -1], [1, 1]],
  3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
};

/** Tek zar SVG'si (merkez cx, cy). */
export function dieSvg(v, cx, cy, { size = 26, cls = '' } = {}) {
  const s = size;
  const o = s * 0.27;
  const pips = (PIPS[v] || []).map(([dx, dy]) => `<circle cx="${(cx + dx * o).toFixed(1)}" cy="${(cy + dy * o).toFixed(1)}" r="${(s * 0.095).toFixed(1)}"/>`).join('');
  return `<g class="tv-die ${cls}"><rect x="${cx - s / 2}" y="${cy - s / 2}" width="${s}" height="${s}" rx="${s * 0.22}"/>${pips}</g>`;
}

/** Zarların kullanılmış mı bilgisi: [{ v, used }]. Çiftte 2 zar + kalan sayısı. */
export function diceView(s) {
  if (!s.dice) return { dice: [], extra: 0 };
  const [a, b] = s.dice;
  if (a === b) {
    const n = s.phase === 'move' ? s.left.length : 0;
    return { dice: [{ v: a, used: n < 2 }, { v: b, used: n < 1 }], extra: n > 2 ? n : 0 };
  }
  const left = s.phase === 'move' ? s.left.slice() : [];
  const used = (v) => {
    const k = left.indexOf(v);
    if (k < 0) return true;
    left.splice(k, 1);
    return false;
  };
  return { dice: [{ v: a, used: used(a) }, { v: b, used: used(b) }], extra: 0 };
}

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function checker(owner, cx, cy, cls = '') {
  const r = D / 2 - 1;
  return `<g class="tv-ck p${owner} ${cls}"><circle cx="${cx}" cy="${cy}" r="${r}"/><circle class="tv-ck-in" cx="${cx}" cy="${cy}" r="${(r * 0.6).toFixed(1)}"/></g>`;
}

/**
 * Tahta SVG'si. o: { seat, sel, movable:Set, targets:Map(to → hit), last:{ from:Set, to:Set },
 *   labels:(k) → aria-label, rolling, canRoll, myTurn }
 */
export function boardSvg(s, o) {
  const seat = o.seat;
  const out = [];
  out.push(`<svg class="tv-svg" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`);
  out.push(`<rect class="tv-frame" x="0" y="0" width="${W}" height="${H}" rx="14"/>`);
  out.push(`<rect class="tv-felt" x="${PADX}" y="${PADY}" width="${6 * PW}" height="${2 * PH + MID}" rx="6"/>`);
  out.push(`<rect class="tv-felt" x="${RIGHT0}" y="${PADY}" width="${6 * PW}" height="${2 * PH + MID}" rx="6"/>`);

  // Haneler
  for (let r = 0; r < 24; r++) {
    const i = relOf(r, seat);
    const x = colX(r);
    const top = isTop(r);
    const own = countAt(s.points, i, 0) ? 0 : countAt(s.points, i, 1) ? 1 : -1;
    const n = own < 0 ? 0 : countAt(s.points, i, own);
    const isTarget = o.targets?.has(i);
    const cls = ['tv-pt',
      o.movable?.has(i) ? 'is-movable' : '',
      o.sel === i ? 'is-sel' : '',
      isTarget ? 'is-target' : '',
      o.last?.from.has(i) ? 'is-last-from' : '',
      o.last?.to.has(i) ? 'is-last-to' : ''].filter(Boolean).join(' ');
    const tip = top ? PADY + PH - 12 : BOTTOM - PH + 12;
    const base = top ? PADY : BOTTOM;
    const focusable = o.movable?.has(i) || isTarget;
    out.push(`<g class="${cls}" data-k="${i}" role="button" tabindex="${focusable ? 0 : -1}" aria-label="${esc(o.labels(i))}">`);
    out.push(`<rect class="tv-hit" x="${x}" y="${top ? PADY : BOTTOM - PH - MID / 2}" width="${PW}" height="${PH + MID / 2}"/>`);
    out.push(`<polygon class="tv-tri ${r % 2 ? 'tb' : 'ta'}" points="${x + 1},${base} ${x + PW - 1},${base} ${x + PW / 2},${tip}"/>`);
    const cx = x + PW / 2;
    for (let k = 0; k < n; k++) {
      const last = k === n - 1;
      const c = last && o.movable?.has(i) ? (o.sel === i ? 'is-top is-sel' : 'is-top') : '';
      out.push(checker(own, cx, stackY(k, n, top).toFixed(1), c));
    }
    if (n > 5) out.push(`<text class="tv-n p${own}" x="${cx}" y="${(stackY(n - 1, n, top) + 4).toFixed(1)}">${n}</text>`);
    if (isTarget) {
      const hit = o.targets.get(i);
      const k = hit ? 0 : (own === s.turn ? n : 0);
      const gy = stackY(Math.min(k, 4), Math.max(n + 1, 1), top);
      out.push(`<circle class="tv-ghost${hit ? ' is-hit' : ''}" cx="${cx}" cy="${gy.toFixed(1)}" r="${D / 2 - 2}"/>`);
    }
    out.push(`<text class="tv-num" x="${cx}" y="${top ? PADY - 3.5 : H - 3.5}">${r + 1}</text>`);
    out.push('</g>');
  }

  // Bar: bakanın kırık pulları alt yarıda, rakibinki üst yarıda
  const barCls = ['tv-bar', o.movable?.has(BAR) ? 'is-movable' : '', o.sel === BAR ? 'is-sel' : ''].filter(Boolean).join(' ');
  out.push(`<g class="${barCls}" data-k="${BAR}" role="button" tabindex="${o.movable?.has(BAR) ? 0 : -1}" aria-label="${esc(o.labels(BAR))}">`);
  out.push(`<rect class="tv-barbg" x="${PADX + 6 * PW + 2}" y="${PADY}" width="${BARW - 4}" height="${2 * PH + MID}" rx="5"/>`);
  for (const pl of [0, 1]) {
    const n = s.bar[pl];
    const mine = pl === seat;
    for (let k = 0; k < n; k++) {
      const cy = mine ? CY + D / 2 + 6 + k * Math.min(D, 60 / Math.max(1, n - 1)) : CY - D / 2 - 6 - k * Math.min(D, 60 / Math.max(1, n - 1));
      const last = k === n - 1;
      const c = mine && last && o.movable?.has(BAR) ? (o.sel === BAR ? 'is-top is-sel' : 'is-top') : '';
      out.push(checker(pl, BAR_X, cy.toFixed(1), c));
    }
  }
  out.push('</g>');

  // Toplama kutusu: bakanınki altta
  const offCls = ['tv-off', o.targets?.has(OFF) ? 'is-target' : ''].filter(Boolean).join(' ');
  out.push(`<g class="${offCls}" data-k="${OFF}" role="button" tabindex="${o.targets?.has(OFF) ? 0 : -1}" aria-label="${esc(o.labels(OFF))}">`);
  for (const top of [true, false]) {
    out.push(`<rect class="tv-tray${top ? '' : ' mine'}" x="${TRAY_X}" y="${top ? PADY : BOTTOM - PH}" width="${TRAY}" height="${PH}" rx="6"/>`);
  }
  for (const pl of [0, 1]) {
    const n = s.off[pl];
    const top = pl !== seat;
    for (let k = 0; k < n; k++) {
      const y = top ? PADY + 3 + k * 9.6 : BOTTOM - 3 - 7 - k * 9.6;
      out.push(`<rect class="tv-offck p${pl}" x="${TRAY_X + 3}" y="${y.toFixed(1)}" width="${TRAY - 6}" height="7" rx="3"/>`);
    }
  }
  out.push('</g>');

  // Zarlar: sırası gelenin yarısında
  const mineTurn = s.players[s.turn] === o.me;
  const hx = mineTurn ? RIGHT0 + 3 * PW : PADX + 3 * PW;
  if (o.canRoll) {
    out.push(`<g class="tv-rollhint" data-k="roll" role="button" tabindex="0" aria-label="Zar at"><rect x="${hx - 46}" y="${CY - 15}" width="92" height="30" rx="15"/><text x="${hx}" y="${CY + 5}">Zar at</text></g>`);
  } else if (s.phase === 'move' && s.dice) {
    const dv = diceView(s);
    out.push(`<g class="tv-dice${o.rolling ? ' is-rolling' : ''}">`);
    dv.dice.forEach((d, k) => out.push(dieSvg(o.rolling ? o.rolling[k] : d.v, hx + (k ? 16 : -16), CY, { cls: d.used && !o.rolling ? 'is-used' : '' })));
    if (dv.extra) out.push(`<text class="tv-extra" x="${hx + 40}" y="${CY + 5}">×${dv.extra}</text>`);
    out.push('</g>');
  }
  out.push('</svg>');
  return out.join('');
}
