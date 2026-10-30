import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PuzzleModel } from '../games/yapboz/model.js';
import { computeGrid, tabMargin } from '../games/yapboz/grid.js';

// 4x3 grid of 100x100 pieces; tolerance = 22.
const small = () => new PuzzleModel({ cols: 4, rows: 3, imgW: 400, imgH: 300 });

function stateOf(groups) {
  return { v: 1, groups: groups.map(([pieces, x, y]) => ({ id: Math.min(...pieces), x, y, pieces })) };
}

// Model with every piece loose and far apart, except the listed groups.
function layout(m, groups) {
  const used = new Set(groups.flatMap(([p]) => p));
  const rest = [];
  for (let i = 0; i < m.total; i++) if (!used.has(i)) rest.push([[i], 1000 + i * 300, 2000]);
  m.setState(stateOf([...rest, ...groups]));
  return m;
}

const canon = (s) => s.groups.map((g) => `${g.id}:${g.x},${g.y}:${g.pieces.join('.')}`).sort();

function rectsOverlap(a, b) {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

test('constructor: geometry, tolerance, singleton groups', () => {
  const m = small();
  assert.equal(m.total, 12);
  assert.equal(m.pw, 100);
  assert.equal(m.ph, 100);
  assert.ok(Math.abs(m.tol - 22) < 1e-9);
  assert.equal(m.getState().groups.length, 12);
  assert.equal(m.groupOf(7), 7);
});

test('piece world position = group offset + (col*pw, row*ph)', () => {
  const m = layout(small(), [[[5, 6], 30, 40]]);
  assert.deepEqual(m.piecePos(6), { x: 30 + 2 * 100, y: 40 + 1 * 100 });
  assert.equal(m.groupOf(6), 5);
});

test('getState: v1, z order bottom to top, x/y rounded to 1 decimal, sorted pieces', () => {
  const m = small();
  m.setState(stateOf([[[3, 2], 1.26, -7.04], ...Array.from({ length: 12 }, (_, i) => i).filter((i) => i !== 2 && i !== 3).map((i) => [[i], i, i])]));
  m.move(2, 10.149, 20.25);
  const s = m.getState();
  assert.equal(s.v, 1);
  const g = s.groups.find((x) => x.id === 2);
  assert.deepEqual(g, { id: 2, x: 10.1, y: 20.3, pieces: [2, 3] });
  assert.equal(s.groups[0].id, 2, 'first in state = bottom of z order');
});

test('setState/getState round trip and z order', () => {
  const m = small();
  const st = stateOf([[[0, 1, 4, 5], 0, 0], [[2], 500, 10], [[3, 7], -200, 300], [[6], 1, 2], [[8, 9, 10, 11], 600, 700]]);
  m.setState(st);
  assert.deepEqual(m.getState(), st);
  m.bringToFront(2);
  assert.equal(m.getState().groups.at(-1).id, 2);
});

test('setState rejects invalid states', () => {
  const m = small();
  assert.throws(() => m.setState({ v: 2, groups: [] }));
  assert.throws(() => m.setState(stateOf([[[0, 1, 2], 0, 0]])), 'missing pieces');
  const dup = stateOf(Array.from({ length: 12 }, (_, i) => [[i], 0, 0]));
  dup.groups[1].pieces.push(0);
  assert.throws(() => m.setState(dup), 'duplicate piece');
});

test('move and bringToFront', () => {
  const m = small();
  m.move(4, 123, 456);
  assert.deepEqual(m.piecePos(4), { x: 123, y: 556 });
  m.bringToFront(4);
  assert.equal(m.getState().groups.at(-1).id, 4);
});

test('snap: merges with a neighbour whose offset is within tolerance', () => {
  const m = layout(small(), [[[0], 300, 300], [[1], 315, 290]]);
  const r = m.snap(1);
  assert.deepEqual({ g: r.g, x: r.x, y: r.y, pieces: r.pieces, merged: r.merged }, { g: 0, x: 300, y: 300, pieces: [0, 1], merged: true });
  assert.equal(m.groupOf(1), 0);
  assert.equal(m.getState().groups.length, 11);
});

test('snap: no merge beyond tolerance or with non-neighbours', () => {
  const far = layout(small(), [[[0], 300, 300], [[1], 330, 300]]);
  assert.equal(far.snap(1).merged, false);
  const notNeighbour = layout(small(), [[[0], 300, 300], [[2], 305, 300]]);
  assert.equal(notNeighbour.snap(2).merged, false);
  assert.equal(notNeighbour.groupOf(2), 2);
});

test('snap: skips blocked (peer-held) groups', () => {
  const m = layout(small(), [[[0], 300, 300], [[1], 310, 300]]);
  const r = m.snap(1, new Set([0]));
  assert.equal(r.merged, false);
  assert.equal(r.g, 1);
});

test('snap: rounds the dropped offset to 1 decimal', () => {
  const m = layout(small(), []);
  m.move(5, 1234.567, 890.123);
  const r = m.snap(5);
  assert.equal(r.x, 1234.6);
  assert.equal(r.y, 890.1);
  assert.deepEqual(m.group(5), { id: 5, x: 1234.6, y: 890.1, pieces: [5] });
});

test('snap: settles into the frame near (0,0)', () => {
  const m = layout(small(), [[[5], 12, -9]]);
  const r = m.snap(5);
  assert.deepEqual([r.x, r.y, r.framed, r.merged], [0, 0, true, false]);
});

test('snap: framing then merging with framed neighbours repeats until stable', () => {
  const m = layout(small(), [[[0, 1], 0, 0], [[6], 0, 0], [[5], 10, 10]]);
  const r = m.snap(5);
  assert.equal(r.g, 0);
  assert.deepEqual(r.pieces, [0, 1, 5, 6]);
  assert.deepEqual([r.x, r.y], [0, 0]);
  assert.equal(m.getState().groups.length, 12 - 3);
});

test('snap: chains through several groups and keeps the dropped group on top', () => {
  const m = layout(small(), [[[0], 500, 500], [[2], 512, 500], [[1], 506, 505]]);
  m.bringToFront(1);
  const r = m.snap(1);
  assert.deepEqual(r.pieces, [0, 1, 2]);
  assert.equal(m.getState().groups.at(-1).id, 0);
  assert.ok(r.x === 500 || r.x === 512);
});

test('applyDrop: unions every group touching the listed pieces, id=min, offset given, on top', () => {
  const m = layout(small(), [[[0, 1], 50, 50], [[2], 900, 900], [[6, 7], 60, 40]]);
  const g = m.applyDrop(1, 55.5, 44.4, [1, 2, 6]);
  assert.equal(g, 0);
  assert.deepEqual(m.group(0), { id: 0, x: 55.5, y: 44.4, pieces: [0, 1, 2, 6, 7] });
  assert.equal(m.getState().groups.at(-1).id, 0);
  assert.equal(m.group(6), undefined);
});

test('applyDrop: plain move of a single group', () => {
  const m = layout(small(), []);
  assert.equal(m.applyDrop(3, 7, 8, [3]), 3);
  assert.deepEqual(m.piecePos(3), { x: 7 + 300, y: 8 });
});

test('concurrent drops on disjoint groups converge in either order', () => {
  const base = [[[0], 300, 300], [[1], 310, 305], [[10], 900, 900], [[11], 905, 890]];
  const a = layout(small(), base);
  const b = layout(small(), base);
  const dropA = a.snap(1); // A merges 0+1 locally
  const dropB = b.snap(11); // B merges 10+11 locally
  a.applyDrop(dropB.g, dropB.x, dropB.y, dropB.pieces);
  b.applyDrop(dropA.g, dropA.x, dropA.y, dropA.pieces);
  assert.deepEqual(canon(a.getState()), canon(b.getState()));
  assert.equal(a.hash(), b.hash());
});

test('applyDrop order: overlapping drops still end with identical membership', () => {
  const base = [[[0], 300, 300], [[1], 300, 300], [[2], 300, 300]];
  const a = layout(small(), base);
  const b = layout(small(), base);
  a.applyDrop(0, 1, 1, [0, 1]); a.applyDrop(1, 2, 2, [1, 2]);
  b.applyDrop(1, 2, 2, [1, 2]); b.applyDrop(0, 1, 1, [0, 1]);
  assert.deepEqual(a.group(0).pieces, b.group(0).pieces);
  assert.deepEqual(a.group(0).pieces, [0, 1, 2]);
});

test('hash: independent of z order, sensitive to offsets and membership', () => {
  const a = layout(small(), [[[0, 1], 10, 10]]);
  const b = layout(small(), [[[0, 1], 10, 10]]);
  b.bringToFront(0); b.bringToFront(5);
  assert.equal(a.hash(), b.hash());
  b.move(5, 1, 1);
  assert.notEqual(a.hash(), b.hash());
  const c = layout(small(), [[[0], 10, 10], [[1], 10, 10]]);
  assert.notEqual(a.hash(), c.hash());
});

test('progress: total, groups, percent', () => {
  const m = small();
  assert.deepEqual(m.progress(), { total: 12, groups: 12, percent: 0 });
  layout(m, [[[0, 1, 2, 3, 4, 5], 0, 0]]);
  assert.deepEqual(m.progress(), { total: 12, groups: 7, percent: Math.round((100 * 5) / 11) });
  assert.equal(m.isComplete(), false);
  m.setState(stateOf([[Array.from({ length: 12 }, (_, i) => i), 0, 0]]));
  assert.deepEqual(m.progress(), { total: 12, groups: 1, percent: 100 });
  assert.equal(m.isComplete(), true);
});

test('isEdgePiece: border pieces only', () => {
  const m = small();
  const edge = Array.from({ length: 12 }, (_, i) => i).filter((i) => m.isEdgePiece(i));
  assert.deepEqual(edge, [0, 1, 2, 3, 4, 7, 8, 9, 10, 11]);
});

function checkScatter(m) {
  const tm = tabMargin(m.pw, m.ph);
  const frame = { x0: 0, y0: 0, x1: m.imgW, y1: m.imgH };
  const rects = [];
  for (let i = 0; i < m.total; i++) {
    const p = m.piecePos(i);
    const r = { x0: p.x, y0: p.y, x1: p.x + m.pw, y1: p.y + m.ph };
    const withTabs = { x0: r.x0 - tm * 0.8, y0: r.y0 - tm * 0.8, x1: r.x1 + tm * 0.8, y1: r.y1 + tm * 0.8 };
    assert.ok(!rectsOverlap(withTabs, frame), `piece ${i} covers the frame`);
    rects.push(r);
  }
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) assert.ok(!rectsOverlap(rects[i], rects[j]), `pieces ${i},${j} overlap`);
  }
}

test('scatterAll: deterministic, around the frame, no overlaps', () => {
  const a = small(); a.scatterAll(5);
  const b = small(); b.scatterAll(5);
  const c = small(); c.scatterAll(6);
  assert.deepEqual(a.getState(), b.getState());
  assert.notDeepEqual(a.getState(), c.getState());
  checkScatter(a);
  for (const g of a.getState().groups) {
    assert.equal(g.x, Math.round(g.x * 10) / 10);
    assert.equal(g.y, Math.round(g.y * 10) / 10);
  }
});

test('scatterAll: table grows with piece count, 1000 pieces do not pile up', () => {
  for (const target of [100, 1000]) {
    const { cols, rows } = computeGrid(target, 2000, 1500);
    const m = new PuzzleModel({ cols, rows, imgW: 2000, imgH: 1500 });
    m.scatterAll(1);
    checkScatter(m);
    const b = m.bounds();
    const tableArea = (b.x1 - b.x0) * (b.y1 - b.y0) - 2000 * 1500;
    const perPiece = tableArea / (m.total * m.pw * m.ph);
    assert.ok(perPiece > 1.5 && perPiece < 6, `table area per piece ${perPiece}`);
  }
});

test('scatterLoose: moves only loose singles, avoids frame and assembled groups', () => {
  const m = small();
  m.scatterAll(3);
  const keep = m.getState();
  const big = keep.groups.find((g) => g.id === 8);
  m.applyDrop(8, big.x, big.y, [8, 9]); // assembled pair stays put
  m.applyDrop(11, 0, 0, [11]); // framed single stays put
  m.move(4, 5000, 5000);
  const before = m.getState();
  const moves = m.scatterLoose(77, new Set([2])); // 2 is excluded (held)
  const movedIds = moves.map((mv) => mv.g).sort((x, y) => x - y);
  assert.deepEqual(movedIds, [0, 1, 3, 4, 5, 6, 7, 10]);
  for (const mv of moves) {
    assert.deepEqual([m.group(mv.g).x, m.group(mv.g).y], [mv.x, mv.y]);
  }
  const after = m.getState();
  const same = (id) => assert.deepEqual(after.groups.find((g) => g.id === id), before.groups.find((g) => g.id === id));
  same(2); same(8); same(11);
  const pair = m.group(8);
  const pairRect = { x0: pair.x, y0: pair.y + 2 * 100, x1: pair.x + 2 * 100, y1: pair.y + 3 * 100 };
  for (const mv of moves) {
    const p = m.piecePos(mv.g);
    assert.ok(!rectsOverlap({ x0: p.x, y0: p.y, x1: p.x + 100, y1: p.y + 100 }, pairRect));
  }
});

test('applyMoves: sets offsets for listed groups, ignores unknown ids', () => {
  const m = small();
  m.applyMoves([{ g: 3, x: 1, y: 2 }, { g: 99, x: 0, y: 0 }]);
  assert.deepEqual([m.group(3).x, m.group(3).y], [1, 2]);
});

test('bounds: covers frame and every piece', () => {
  const m = layout(small(), [[[0], -500, 0]]);
  const b = m.bounds();
  assert.ok(b.x0 <= -500 && b.y0 <= 0 && b.x1 >= 400 && b.y1 >= 300);
});
