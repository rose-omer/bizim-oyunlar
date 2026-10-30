// Yapboz grid geometry: grid size, seeded tab signs and piece outlines.
// Pure module (no DOM). Coordinates are world units (normalized photo pixels).

export const PIECE_COUNTS = [100, 200, 500, 1000];

// Choose cols x rows (both >= 2) close to `target` pieces with near-square pieces.
export function computeGrid(target, imgW, imgH) {
  const n = Math.max(4, Math.round(target) || 4);
  const ratio = imgW > 0 && imgH > 0 ? imgW / imgH : 1;
  let best = null;
  for (let cols = 2; cols <= Math.ceil(n / 2); cols++) {
    const ideal = n / cols;
    for (const r of [Math.floor(ideal), Math.ceil(ideal), Math.round(cols / ratio)]) {
      const rows = Math.max(2, r);
      const countDev = Math.abs(cols * rows - n) / n;
      const aspectDev = Math.abs(Math.log((ratio * rows) / cols)); // log(pieceW / pieceH)
      const score = 2 * countDev + aspectDev;
      if (!best || score < best.score) best = { cols, rows, score };
    }
  }
  return { cols: best.cols, rows: best.rows, count: best.cols * best.rows };
}

// Turn any seed (int, fraction, string) into a uint32.
function seedToUint(seed) {
  if (typeof seed === 'string') {
    let h = 2166136261;
    for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
    return h >>> 0;
  }
  const x = Number(seed) || 0;
  return Number.isInteger(x) ? x >>> 0 : Math.floor(Math.abs(x) * 4294967296) >>> 0;
}

export function mulberry32(seed) {
  let a = seedToUint(seed);
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Edge values: 0 flat (border), 1 tab out, -1 hole. Neighbours are complementary.
export function generateEdges(cols, rows, seed) {
  const rnd = mulberry32(seed);
  const out = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const id = row * cols + col;
      out.push({
        id, col, row,
        top: row === 0 ? 0 : -out[id - cols].bottom,
        right: col === cols - 1 ? 0 : rnd() < 0.5 ? 1 : -1,
        bottom: row === rows - 1 ? 0 : rnd() < 0.5 ? 1 : -1,
        left: col === 0 ? 0 : -out[id - 1].right,
      });
    }
  }
  return out;
}

// Space around the piece rectangle that holds tabs (max ~0.25) plus a baked shadow.
export function tabMargin(pw, ph) {
  return 0.33 * Math.min(pw, ph);
}

// Per-edge shape variation. Keyed by the shared edge, so both neighbours get the same curve.
function edgeJitter(kind, col, row) {
  const rnd = mulberry32(Math.imul(col + 1, 73856093) ^ Math.imul(row + 1, 19349663) ^ (kind === 'v' ? 83492791 : 0));
  return { shift: (rnd() - 0.5) * 0.08, scale: 0.94 + rnd() * 0.12, tilt: (rnd() - 0.5) * 0.03 };
}

// Canonical edge along +a with bulge toward +n (when k = 1). Points: [p0, c1, c2, p1, ...].
function canonicalEdge(len, m, k, j) {
  if (!k) return [[0, 0], [len / 3, 0], [(2 * len) / 3, 0], [len, 0]];
  const T = 0.095 * m * j.scale; // tab height is about 2.5 T (~22-25% of m)
  const c = len / 2 + j.shift * m;
  const e = j.tilt * m;
  const pts = [
    [0, 0],
    [c - 0.3 * m, 0], [c, -T], [c - T, T], // shoulder to left neck
    [c - 2.25 * T + e, 3 * T], [c + 2.25 * T + e, 3 * T], [c + T, T], // bulb
    [c, -T], [c + 0.3 * m, 0], [len, 0], // right neck to shoulder
  ];
  return pts.map(([a, n]) => [a, n * k]);
}

// One side of a piece as cubic bezier points, piece-local coords, clockwise traversal.
export function edgeCurve(piece, side, pw, ph) {
  const m = Math.min(pw, ph);
  const { col, row } = piece;
  // Horizontal edges bulge toward +y, vertical toward +x; the piece below/right reverses them.
  switch (side) {
    case 'top':
      return canonicalEdge(pw, m, -piece.top, edgeJitter('h', col, row - 1));
    case 'right':
      return canonicalEdge(ph, m, piece.right, edgeJitter('v', col, row)).map(([a, n]) => [pw + n, a]);
    case 'bottom':
      return canonicalEdge(pw, m, piece.bottom, edgeJitter('h', col, row)).map(([a, n]) => [a, ph + n]).reverse();
    case 'left':
      return canonicalEdge(ph, m, -piece.left, edgeJitter('v', col - 1, row)).map(([a, n]) => [n, a]).reverse();
    default:
      throw new Error(`unknown side ${side}`);
  }
}

const fmt = (v) => String(+v.toFixed(3));
const pt = ([x, y]) => `${fmt(x)} ${fmt(y)}`;

// SVG path data for a piece outline in piece-local coords (rect at [0,pw]x[0,ph]).
export function piecePathD(piece, pw, ph) {
  let d = 'M0 0';
  for (const side of ['top', 'right', 'bottom', 'left']) {
    const pts = edgeCurve(piece, side, pw, ph);
    if (!piece[side]) {
      d += `L${pt(pts[pts.length - 1])}`;
      continue;
    }
    for (let i = 1; i < pts.length; i += 3) d += `C${pt(pts[i])} ${pt(pts[i + 1])} ${pt(pts[i + 2])}`;
  }
  return `${d}Z`;
}
