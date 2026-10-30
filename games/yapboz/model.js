// Yapboz board model: groups, z order, snapping, remote drops, scatter. Pure (no DOM).
// Group offset (x, y): piece top-left = (x + col*pw, y + row*ph). Aligned <=> equal offsets,
// in place <=> (0, 0). Group id = smallest piece id. Done <=> one group.
import { mulberry32, tabMargin } from './grid.js';

export const SNAP_RATIO = 0.22;

// Round to 1 decimal; "+ 0" turns -0 into 0.
const r1 = (v) => Math.round(v * 10) / 10 + 0;

function shuffle(arr, rnd) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Order-independent 32-bit mix of four ints.
function mix(a, b, c, d) {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13) ^ b, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 16) ^ c, 0x27d4eb2f);
  h = Math.imul(h ^ (h >>> 15) ^ d, 0x165667b1);
  return (h ^ (h >>> 16)) >>> 0;
}

export class PuzzleModel {
  constructor({ cols, rows, imgW, imgH }) {
    this.cols = cols;
    this.rows = rows;
    this.total = cols * rows;
    this.imgW = imgW;
    this.imgH = imgH;
    this.pw = imgW / cols;
    this.ph = imgH / rows;
    this.tol = SNAP_RATIO * Math.min(this.pw, this.ph);
    this.groups = new Map(); // id -> { id, x, y, pieces (sorted) }
    this.order = []; // group ids, bottom -> top
    this.owner = new Int32Array(this.total); // piece -> group id
    for (let i = 0; i < this.total; i++) {
      this.groups.set(i, { id: i, x: 0, y: 0, pieces: [i] });
      this.order.push(i);
      this.owner[i] = i;
    }
  }

  group(id) { return this.groups.get(id); }

  groupOf(piece) { return this.owner[piece]; }

  // World top-left of a piece rectangle.
  piecePos(piece) {
    const g = this.groups.get(this.owner[piece]);
    return { x: g.x + (piece % this.cols) * this.pw, y: g.y + Math.floor(piece / this.cols) * this.ph };
  }

  isEdgePiece(piece) {
    const col = piece % this.cols, row = Math.floor(piece / this.cols);
    return col === 0 || row === 0 || col === this.cols - 1 || row === this.rows - 1;
  }

  neighbours(piece) {
    const { cols, rows } = this;
    const col = piece % cols, row = Math.floor(piece / cols);
    const out = [];
    if (row > 0) out.push(piece - cols);
    if (col < cols - 1) out.push(piece + 1);
    if (row < rows - 1) out.push(piece + cols);
    if (col > 0) out.push(piece - 1);
    return out;
  }

  getState() {
    return {
      v: 1,
      groups: this.order.map((id) => {
        const g = this.groups.get(id);
        return { id, x: r1(g.x), y: r1(g.y), pieces: g.pieces.slice() };
      }),
    };
  }

  setState(state) {
    const bad = () => new Error('Yapboz durumu geçersiz');
    if (!state || state.v !== 1 || !Array.isArray(state.groups)) throw bad();
    const groups = new Map(), order = [], owner = new Int32Array(this.total);
    const seen = new Uint8Array(this.total);
    let count = 0;
    for (const s of state.groups) {
      if (!s || !Array.isArray(s.pieces) || !s.pieces.length) throw bad();
      const pieces = s.pieces.map(Number).sort((a, b) => a - b);
      for (const p of pieces) {
        if (!Number.isInteger(p) || p < 0 || p >= this.total || seen[p]) throw bad();
        seen[p] = 1;
        count++;
      }
      const id = pieces[0];
      groups.set(id, { id, x: Number(s.x) || 0, y: Number(s.y) || 0, pieces });
      order.push(id);
      for (const p of pieces) owner[p] = id;
    }
    if (count !== this.total) throw bad();
    this.groups = groups;
    this.order = order;
    this.owner = owner;
  }

  move(id, x, y) {
    const g = this.groups.get(id);
    if (!g) return false;
    g.x = x;
    g.y = y;
    return true;
  }

  bringToFront(id) {
    const i = this.order.indexOf(id);
    if (i < 0 || i === this.order.length - 1) return;
    this.order.splice(i, 1);
    this.order.push(id);
  }

  groupsOfPieces(pieces) {
    const ids = new Set();
    for (const p of pieces) if (Number.isInteger(p) && p >= 0 && p < this.total) ids.add(this.owner[p]);
    return ids;
  }

  // Union groups into one at offset (x, y). It takes the z slot of `anchor`, or goes on top.
  union(ids, x, y, anchor) {
    const idSet = new Set(ids);
    const pieces = [];
    for (const id of idSet) pieces.push(...this.groups.get(id).pieces);
    pieces.sort((a, b) => a - b);
    const g = { id: pieces[0], x, y, pieces };
    for (const id of idSet) this.groups.delete(id);
    this.groups.set(g.id, g);
    for (const p of pieces) this.owner[p] = g.id;
    const slot = anchor === undefined ? -1 : this.order.indexOf(anchor);
    const next = [];
    this.order.forEach((id, i) => {
      if (i === slot) next.push(g.id);
      else if (!idSet.has(id)) next.push(id);
    });
    if (slot < 0) next.push(g.id);
    this.order = next;
    return g;
  }

  // Local drop: merge with aligned neighbour groups (not in `blocked`) and settle into the
  // frame near (0,0); repeat until stable. Returns the resulting group.
  snap(id, blocked = new Set()) {
    let g = this.groups.get(id);
    if (!g) return null;
    g.x = r1(g.x);
    g.y = r1(g.y);
    let merged = false, framed = false;
    for (let guard = 0; guard <= this.total + 1; guard++) {
      let best = null, bestD = Infinity;
      for (const p of g.pieces) {
        for (const q of this.neighbours(p)) {
          const h = this.owner[q];
          if (h === g.id || blocked.has(h)) continue;
          const o = this.groups.get(h);
          const d = Math.hypot(o.x - g.x, o.y - g.y);
          if (d <= this.tol && d < bestD) { best = o; bestD = d; }
        }
      }
      if (best) {
        g = this.union([g.id, best.id], r1(best.x), r1(best.y), g.id);
        merged = true;
      } else if ((g.x || g.y) && Math.hypot(g.x, g.y) <= this.tol) {
        g.x = 0;
        g.y = 0;
        framed = true;
      } else break;
    }
    return { g: g.id, x: g.x, y: g.y, pieces: g.pieces.slice(), merged, framed };
  }

  // Remote drop: every group holding any listed piece becomes one group at (x, y), on top.
  applyDrop(id, x, y, pieces) {
    const ids = this.groupsOfPieces(pieces && pieces.length ? pieces : [id]);
    if (!ids.size) return null;
    return this.union([...ids], r1(x), r1(y)).id;
  }

  applyMoves(moves) {
    for (const { g, x, y } of moves || []) this.move(g, x, y);
  }

  // Initial layout: every single piece goes to the table around the frame.
  scatterAll(seed) {
    const ids = this.order.filter((id) => this.groups.get(id).pieces.length === 1);
    return this.scatter(ids, seed);
  }

  // Spread loose single pieces (not in the frame, not excluded) around the frame again.
  scatterLoose(seed, exclude = new Set()) {
    const ids = this.order.filter((id) => {
      const g = this.groups.get(id);
      return g.pieces.length === 1 && (g.x || g.y) && !exclude.has(id);
    });
    return this.scatter(ids, seed);
  }

  scatter(ids, seed) {
    const rnd = mulberry32(seed);
    const { pw, ph, cols } = this;
    const tm = tabMargin(pw, ph);
    const moving = new Set(ids);
    const obstacles = [];
    for (const g of this.groups.values()) {
      if (moving.has(g.id)) continue;
      for (const p of g.pieces) {
        const { x, y } = this.piecePos(p);
        obstacles.push({ x0: x - tm, y0: y - tm, x1: x + pw + tm, y1: y + ph + tm });
      }
    }
    const cells = this.freeCells(ids.length, obstacles, rnd);
    const cw = pw + 2 * tm, ch = ph + 2 * tm, jit = 0.1 * Math.min(pw, ph);
    const moves = [];
    shuffle(ids.slice(), rnd).forEach((id, i) => {
      const g = this.groups.get(id);
      const p = g.pieces[0];
      const wx = cells[i].x + (cw - pw) / 2 + (rnd() - 0.5) * jit;
      const wy = cells[i].y + (ch - ph) / 2 + (rnd() - 0.5) * jit;
      g.x = r1(wx - (p % cols) * pw);
      g.y = r1(wy - Math.floor(p / cols) * ph);
      moves.push({ g: id, x: g.x, y: g.y });
    });
    return moves;
  }

  // Table cells in rings around the frame, nearest ring first; cells hitting obstacles skipped.
  freeCells(n, obstacles, rnd) {
    const { pw, ph, imgW, imgH } = this;
    const tm = tabMargin(pw, ph);
    const cw = pw + 2 * tm, ch = ph + 2 * tm, gap = 0.4 * Math.min(pw, ph);
    const nx = Math.ceil((imgW + 2 * gap) / cw), ny = Math.ceil((imgH + 2 * gap) / ch);
    const ox = imgW / 2 - (nx * cw) / 2, oy = imgH / 2 - (ny * ch) / 2;
    const out = [];
    for (let r = 1; out.length < n && r < 10000; r++) {
      const ring = [];
      for (let j = -r; j < ny + r; j++) {
        const dj = j < 0 ? -j : j >= ny ? j - ny + 1 : 0;
        for (let i = -r; i < nx + r; i++) {
          const di = i < 0 ? -i : i >= nx ? i - nx + 1 : 0;
          if (Math.max(di, dj) !== r) continue;
          const x = ox + i * cw, y = oy + j * ch;
          if (obstacles.some((o) => o.x0 < x + cw && x < o.x1 && o.y0 < y + ch && y < o.y1)) continue;
          ring.push({ x, y });
        }
      }
      out.push(...shuffle(ring, rnd));
    }
    return out;
  }

  progress() {
    const total = this.total, groups = this.groups.size;
    const percent = total > 1 ? Math.round((100 * (total - groups)) / (total - 1)) : 100;
    return { total, groups, percent };
  }

  isComplete() { return this.groups.size === 1; }

  // Same membership + offsets => same hash, whatever the z order.
  hash() {
    let a = 0, b = 0;
    for (const g of this.groups.values()) {
      const x = Math.round(g.x * 10), y = Math.round(g.y * 10);
      for (const p of g.pieces) {
        a = (a + mix(p, g.id, x, y)) >>> 0;
        b = (b ^ mix(g.id, p, y, x)) >>> 0;
      }
    }
    return `${a.toString(36)}.${b.toString(36)}`;
  }

  // World bounds of the frame and every piece rectangle (tabs not included).
  bounds() {
    let x0 = 0, y0 = 0, x1 = this.imgW, y1 = this.imgH;
    for (const g of this.groups.values()) {
      for (const p of g.pieces) {
        const { x, y } = this.piecePos(p);
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x + this.pw > x1) x1 = x + this.pw;
        if (y + this.ph > y1) y1 = y + this.ph;
      }
    }
    return { x0, y0, x1, y1 };
  }
}
