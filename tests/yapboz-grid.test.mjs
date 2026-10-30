import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PIECE_COUNTS, computeGrid, mulberry32, generateEdges, tabMargin, piecePathD, edgeCurve,
} from '../games/yapboz/grid.js';

const pieceAspect = (g, w, h) => (w / g.cols) / (h / g.rows);

// Cubic bezier sampling over an edgeCurve point list [p0, c1, c2, p1, c1, c2, p2, ...].
function sample(pts, n = 16) {
  const out = [pts[0]];
  for (let i = 0; i + 3 < pts.length; i += 3) {
    const [a, b, c, d] = pts.slice(i, i + 4);
    for (let s = 1; s <= n; s++) {
      const t = s / n, u = 1 - t;
      const w0 = u * u * u, w1 = 3 * u * u * t, w2 = 3 * u * t * t, w3 = t * t * t;
      out.push([w0 * a[0] + w1 * b[0] + w2 * c[0] + w3 * d[0], w0 * a[1] + w1 * b[1] + w2 * c[1] + w3 * d[1]]);
    }
  }
  return out;
}

function assertClose(a, b, eps = 1e-9) {
  assert.equal(a.length, b.length);
  for (let i = 0; i < a.length; i++) {
    assert.ok(Math.abs(a[i][0] - b[i][0]) < eps && Math.abs(a[i][1] - b[i][1]) < eps,
      `point ${i}: ${a[i]} vs ${b[i]}`);
  }
}

test('PIECE_COUNTS matches contract', () => {
  assert.deepEqual(PIECE_COUNTS, [100, 200, 500, 1000]);
});

test('computeGrid: 4:3 with 1000 pieces is about 37x27', () => {
  const g = computeGrid(1000, 4000, 3000);
  assert.equal(g.count, g.cols * g.rows);
  assert.ok(Math.abs(g.cols - 37) <= 2 && Math.abs(g.rows - 27) <= 2, `${g.cols}x${g.rows}`);
  assert.ok(Math.abs(g.count - 1000) / 1000 <= 0.05);
});

test('computeGrid: count within 5% and near-square pieces for common shapes', () => {
  const shapes = [[1, 1], [4, 3], [3, 4], [16, 9], [9, 16], [3, 2], [2, 3], [3, 1], [1, 3]];
  for (const target of PIECE_COUNTS) {
    for (const [w, h] of shapes) {
      const g = computeGrid(target, w * 1000, h * 1000);
      const label = `${target} @ ${w}:${h} -> ${g.cols}x${g.rows}`;
      assert.ok(g.cols >= 2 && g.rows >= 2, label);
      assert.equal(g.count, g.cols * g.rows, label);
      assert.ok(Math.abs(g.count - target) / target <= 0.05, label);
      const a = pieceAspect(g, w, h);
      assert.ok(a > 0.8 && a < 1.25, `${label} aspect ${a}`);
    }
  }
});

test('computeGrid: portrait is the transpose of landscape', () => {
  const l = computeGrid(500, 1600, 900);
  const p = computeGrid(500, 900, 1600);
  assert.equal(l.cols, p.rows);
  assert.equal(l.rows, p.cols);
  assert.ok(l.cols > l.rows);
});

test('computeGrid: tiny and extreme images still give a valid grid', () => {
  const tiny = computeGrid(100, 8, 6);
  assert.deepEqual(tiny, computeGrid(100, 800, 600));
  const pano = computeGrid(100, 5000, 50);
  assert.ok(pano.rows >= 2 && pano.cols >= 2);
  assert.equal(pano.rows, 2);
  const bad = computeGrid(100, 0, 0);
  assert.equal(bad.cols, 10);
  assert.equal(bad.rows, 10);
});

test('mulberry32: deterministic, in [0,1), seed-dependent', () => {
  const a = mulberry32(42), b = mulberry32(42), c = mulberry32(43);
  const sa = Array.from({ length: 50 }, a), sb = Array.from({ length: 50 }, b), sc = Array.from({ length: 50 }, c);
  assert.deepEqual(sa, sb);
  assert.notDeepEqual(sa, sc);
  for (const v of sa) assert.ok(v >= 0 && v < 1);
});

test('mulberry32: fractional seeds do not collapse to the same stream', () => {
  const a = mulberry32(0.25)(), b = mulberry32(0.75)();
  assert.notEqual(a, b);
});

test('generateEdges: shape, borders flat, interior +-1, complementary', () => {
  const cols = 7, rows = 5;
  const edges = generateEdges(cols, rows, 123);
  assert.equal(edges.length, cols * rows);
  for (const p of edges) {
    assert.equal(p.id, p.row * cols + p.col);
    if (p.row === 0) assert.equal(p.top, 0); else assert.ok(p.top === 1 || p.top === -1);
    if (p.col === 0) assert.equal(p.left, 0); else assert.ok(p.left === 1 || p.left === -1);
    if (p.row === rows - 1) assert.equal(p.bottom, 0); else assert.equal(p.bottom, -edges[p.id + cols].top);
    if (p.col === cols - 1) assert.equal(p.right, 0); else assert.equal(p.right, -edges[p.id + 1].left);
  }
});

test('generateEdges: deterministic per seed, varies across seeds', () => {
  assert.deepEqual(generateEdges(10, 8, 7), generateEdges(10, 8, 7));
  assert.notDeepEqual(generateEdges(10, 8, 7), generateEdges(10, 8, 8));
  const signs = generateEdges(20, 20, 99).map((p) => p.right).filter(Boolean);
  const outs = signs.filter((s) => s === 1).length;
  assert.ok(outs > signs.length * 0.3 && outs < signs.length * 0.7, 'roughly balanced tabs');
});

test('tabMargin: covers tabs, scales with the smaller side', () => {
  assert.ok(Math.abs(tabMargin(100, 80) - tabMargin(80, 100)) < 1e-12);
  assert.ok(tabMargin(100, 80) >= 0.25 * 80 && tabMargin(100, 80) <= 0.35 * 80);
});

test('edgeCurve: right edge of A equals left edge of B (translated, reversed)', () => {
  const cols = 6, rows = 5, pw = 40, ph = 31;
  const edges = generateEdges(cols, rows, 5);
  for (const a of edges) {
    if (a.col === cols - 1) continue;
    const b = edges[a.id + 1];
    const ra = edgeCurve(a, 'right', pw, ph).map(([x, y]) => [x - pw, y]);
    const lb = edgeCurve(b, 'left', pw, ph).slice().reverse();
    assertClose(ra, lb);
  }
});

test('edgeCurve: bottom edge of A equals top edge of the piece below', () => {
  const cols = 6, rows = 5, pw = 40, ph = 31;
  const edges = generateEdges(cols, rows, 5);
  for (const a of edges) {
    if (a.row === rows - 1) continue;
    const b = edges[a.id + cols];
    const ba = edgeCurve(a, 'bottom', pw, ph).map(([x, y]) => [x, y - ph]);
    const tb = edgeCurve(b, 'top', pw, ph).slice().reverse();
    assertClose(ba, tb);
  }
});

test('edgeCurve: traversal is clockwise and corners connect', () => {
  const pw = 50, ph = 40;
  const [p] = generateEdges(3, 3, 1).filter((q) => q.col === 1 && q.row === 1);
  const sides = ['top', 'right', 'bottom', 'left'].map((s) => edgeCurve(p, s, pw, ph));
  const corners = [[0, 0], [pw, 0], [pw, ph], [0, ph]];
  sides.forEach((pts, i) => {
    assertClose([pts[0], pts[pts.length - 1]], [corners[i], corners[(i + 1) % 4]]);
  });
});

test('edgeCurve: flat border edge lies on the rectangle side', () => {
  const pw = 50, ph = 40;
  const p = generateEdges(3, 3, 1)[0];
  for (const [x, y] of sample(edgeCurve(p, 'top', pw, ph))) assert.ok(Math.abs(y) < 1e-9 && x >= 0 && x <= pw);
  for (const [x] of sample(edgeCurve(p, 'left', pw, ph))) assert.ok(Math.abs(x) < 1e-9);
});

test('edgeCurve: tab sticks out about 20-25% of the smaller side, inside tabMargin', () => {
  const pw = 50, ph = 40, m = Math.min(pw, ph), tm = tabMargin(pw, ph);
  const edges = generateEdges(8, 8, 3);
  for (const p of edges) {
    if (!p.right) continue;
    const xs = sample(edgeCurve(p, 'right', pw, ph)).map(([x]) => x - pw);
    const out = p.right === 1 ? Math.max(...xs) : -Math.min(...xs);
    assert.ok(out >= 0.18 * m && out <= 0.26 * m, `protrusion ${out / m}`);
    for (const x of xs) assert.ok(Math.abs(x) <= tm);
  }
});

test('piecePathD: closed SVG path in local coords matching edgeCurve', () => {
  const pw = 50, ph = 40, tm = tabMargin(pw, ph);
  const edges = generateEdges(4, 3, 11);
  for (const p of edges) {
    const d = piecePathD(p, pw, ph);
    assert.match(d, /^M0 0/);
    assert.match(d, /Z$/);
    const curved = ['top', 'right', 'bottom', 'left'].filter((s) => p[s] !== 0).length;
    assert.equal((d.match(/C/g) || []).length, curved * 3);
    const nums = d.match(/-?\d+(\.\d+)?/g).map(Number);
    for (let i = 0; i < nums.length; i += 2) {
      assert.ok(nums[i] >= -tm && nums[i] <= pw + tm && nums[i + 1] >= -tm && nums[i + 1] <= ph + tm);
    }
  }
});
