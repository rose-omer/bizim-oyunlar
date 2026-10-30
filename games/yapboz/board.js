// Yapboz board: canvas rendering, pointer input, local snapping and remote actions.
// All puzzle rules live in model.js; this file only draws and translates input.
//
// Drawing cost (phones):
// - Every piece is rendered once into atlas pages, plus half-size copies (manual mip levels).
//   All drawImage calls use imageSmoothingQuality 'low' on the right level. With 'medium'/'high'
//   Chrome made a mipmapped GPU copy of the whole atlas for every draw: seconds per frame.
// - While the view is still, groups below the first moving group are cached in a screen-size
//   layer; a frame is then one layer blit plus the moving groups and the partner's cursor.
// - The dragged group (with its drop shadow) and partner-held groups (with the rose outline)
//   are cached as one bitmap each, so no frame runs shadowBlur.
import { generateEdges, piecePathD, tabMargin, edgeCurve } from './grid.js';
import { PuzzleModel } from './model.js';

const PEER = '#ff5d8f';
const SIDES = ['top', 'right', 'bottom', 'left'];
const MOVE_MS = 100; // remote move glide
const SCATTER_MS = 320; // shuffle glide
const CURSOR_MS = 100; // cursor action rate limit
const PINCH_GRACE_MS = 350; // a second finger this soon after a grab turns it into a pinch
const DPR_MAX = 2;
const ATLAS_MAX = 4096; // atlas canvas side (px)
const BITMAP_BUDGET = 10e6; // total piece bitmap pixels (~40 MB)
const MIP_LEVELS = 4; // atlas copies at 1, 1/2, 1/4, 1/8
const SPRITE_PX = 4e6; // largest cached moving-group bitmap; bigger groups draw piece by piece
const LIFT_BLUR = 14; // dragged group shadow (CSS px)
const LIFT_DY = 7;
const LIFT_PAD = 30; // room for the shadow: >= 1.5 * blur + offset
const HELD_PAD = 6; // room for the rose outline: > half of its widest stroke
const ORIGIN = { x: 0, y: 0 };

const r1 = (v) => Math.round(v * 10) / 10 + 0;
const noop = () => {};
const now = () => performance.now();

// Mip level for a bitmap with `texel` px per world unit drawn at `k` device px per world unit.
// Each level halves the bitmap, so the drawn scale stays in [1/2, 1): clean with bilinear filtering.
export function mipLevel(texel, k, levels) {
  if (!(texel > 0) || !(k > 0) || !(levels > 1)) return 0;
  return Math.max(0, Math.min(levels - 1, Math.floor(Math.log2(texel / k))));
}

// Index of the first moving group in z order (bottom -> top); every group below it is static.
export function firstLive(order, isLive) {
  for (let i = 0; i < order.length; i++) if (isLive(order[i])) return i;
  return order.length;
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

function freeCanvas(c) {
  if (c && typeof c.width === 'number' && c.getContext) {
    c.width = 0;
    c.height = 0;
  }
}

// Half-size copy. Bilinear sampling at exactly 1/2 averages 2x2 texels (a box-filtered mip level)
// and needs no GPU mipmaps.
function halve(src, w, h) {
  const c = makeCanvas(w / 2, h / 2);
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = true;
  x.imageSmoothingQuality = 'low';
  x.drawImage(src, 0, 0, w, h, 0, 0, w / 2, h / 2);
  return c;
}

function heartPath(ctx, x, y, r) {
  ctx.beginPath();
  ctx.moveTo(x, y + r);
  ctx.bezierCurveTo(x - r * 1.6, y - r * 0.2, x - r * 0.7, y - r * 1.5, x, y - r * 0.5);
  ctx.bezierCurveTo(x + r * 0.7, y - r * 1.5, x + r * 1.6, y - r * 0.2, x, y + r);
  ctx.closePath();
}

function pillPath(ctx, x, y, w, h) {
  const r = h / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export class Board {
  constructor(canvas, { image, cols, rows, seed = 1, state = null, onAction, onProgress, onSnap, onComplete } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.image = image;
    this.imgW = image.naturalWidth || image.width;
    this.imgH = image.naturalHeight || image.height;
    this.emit = onAction || noop;
    this.onProgress = onProgress || noop;
    this.onSnap = onSnap || noop;
    this.onComplete = onComplete || noop;

    this.model = new PuzzleModel({ cols, rows, imgW: this.imgW, imgH: this.imgH });
    this.cols = cols;
    this.pw = this.model.pw;
    this.ph = this.model.ph;
    this.tm = tabMargin(this.pw, this.ph);
    this.edges = generateEdges(cols, rows, seed);
    // One Path2D per piece (piece-local coords): used for the bitmap clip and for hit tests.
    this.paths = this.edges.map((p) => new Path2D(piecePathD(p, this.pw, this.ph)));
    this.sidePaths = new Map();
    this.hitCtx = document.createElement('canvas').getContext('2d');
    this._buildAtlas();
    if (state) this.model.setState(state);
    else this.model.scatterAll(seed);

    this.view = { s: 1, tx: 0, ty: 0 }; // screen = world * s + t (CSS px)
    this.cssW = 0;
    this.cssH = 0;
    this.dpr = 1;
    this.needFit = true;
    this.pointers = new Map(); // pointerId -> { x, y } (CSS px, canvas-relative)
    this.drag = null;
    this.pan = null;
    this.pinch = null;
    this.peerHeld = new Set();
    this.anim = new Map(); // group id -> { fx, fy, t0, dur }: glide from (fx, fy) to the model offset
    this.peerCursor = null;
    this.edgeOnly = false;
    this.ghost = false;
    this.completed = false;
    this.raf = 0;
    this.destroyed = false;
    this.ver = 0; // bumps when static groups may have changed (see _invalidate)
    this.layer = null; // cached static groups (device px canvas)
    this.layerKey = '';
    this.lastView = '';
    this.sprites = new Map(); // group id -> cached bitmap of a dragged / partner-held group
    this.ghostLv = null; // photo mip levels for the preview
    this.cursorAt = 0;
    this.cursorTimer = 0;
    this.cursorPending = null;
    this.font = getComputedStyle(canvas).fontFamily || 'system-ui, sans-serif';

    canvas.style.touchAction = 'none';
    canvas.style.userSelect = 'none';
    canvas.style.webkitUserSelect = 'none';
    this._frame = this._frame.bind(this);
    const up = (e) => this._onUp(e);
    this.listeners = [
      [canvas, 'pointerdown', (e) => this._onDown(e)],
      [canvas, 'pointermove', (e) => this._onMove(e)],
      [canvas, 'pointerup', up],
      [canvas, 'pointercancel', up],
      [canvas, 'lostpointercapture', up],
      [canvas, 'wheel', (e) => this._onWheel(e), { passive: false }],
      [canvas, 'contextmenu', (e) => e.preventDefault()],
    ];
    if (typeof ResizeObserver === 'function') {
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(canvas);
    } else {
      this.listeners.push([window, 'resize', () => this.resize()]);
    }
    for (const [target, type, fn, opt] of this.listeners) target.addEventListener(type, fn, opt);
    this.resize();
    // Deferred so callbacks may already reference the constructed board.
    queueMicrotask(() => { if (!this.destroyed) this._changed(); });
  }

  // ---------- public API ----------

  getState() { return this.model.getState(); }

  setState(state) {
    this.model.setState(state); // throws on an invalid state, before anything changes
    this.drag = null;
    this.anim.clear();
    for (const id of this.peerHeld) if (!this.model.group(id)) this.peerHeld.delete(id);
    this._changed();
    this._invalidate();
  }

  applyRemote(a) {
    if (!a || this.destroyed) return;
    const t = now();
    switch (a.type) {
      case 'grab': {
        if (!this.model.group(a.g)) return;
        if (this.drag && this.drag.g === a.g) this.cancelLocalDrag();
        this.peerHeld.add(a.g);
        this.model.bringToFront(a.g);
        break;
      }
      case 'move': {
        if (this.drag && this.drag.g === a.g) return;
        this._glide(a.g, a.x, a.y, MOVE_MS, t);
        this._invalidate(false); // a gliding group is live: the static layer stays valid
        return;
      }
      case 'drop': {
        const pieces = Array.isArray(a.pieces) && a.pieces.length ? a.pieces : [a.g];
        const involved = this.model.groupsOfPieces(pieces);
        if (this.drag && involved.has(this.drag.g)) this.cancelLocalDrag();
        // A plain move (no merge) keeps gliding; a merge snaps into place.
        let from = null;
        if (involved.size === 1 && involved.has(a.g)) {
          const { x, y } = this._pos(this.model.group(a.g), t);
          from = { x, y };
        }
        for (const id of involved) { this.peerHeld.delete(id); this.anim.delete(id); }
        this.peerHeld.delete(a.g);
        const id = this.model.applyDrop(a.g, a.x, a.y, pieces);
        if (from && id !== null) this.anim.set(id, { fx: from.x, fy: from.y, t0: t, dur: MOVE_MS });
        this._changed();
        break;
      }
      case 'scatter': {
        for (const mv of a.moves || []) {
          if (!(this.drag && this.drag.g === mv.g)) this._glide(mv.g, mv.x, mv.y, SCATTER_MS, t);
        }
        this._changed();
        break;
      }
      default:
        return;
    }
    this._invalidate();
  }

  // End a local drag without emitting drop; the group stays where it is.
  cancelLocalDrag() {
    if (!this.drag) return;
    this.drag = null;
    this._invalidate();
  }

  isDragging() { return !!this.drag; }

  draggingGroup() { return this.drag ? this.drag.g : null; }

  setPeerCursor(c) {
    this.peerCursor = c && Number.isFinite(c.x) && Number.isFinite(c.y) ? { x: c.x, y: c.y, name: c.name || '' } : null;
    this._invalidate(false);
  }

  clearPeerHolds() {
    this.peerHeld.clear();
    this._invalidate();
  }

  hash() { return this.model.hash(); }

  setEdgeOnly(on) {
    this.edgeOnly = !!on;
    this._invalidate();
  }

  setGhost(on) {
    this.ghost = !!on;
    this._invalidate();
  }

  zoomBy(f) { this._zoomAt({ x: this.cssW / 2, y: this.cssH / 2 }, f); }

  fitView() {
    if (!this.cssW || !this.cssH) { this.needFit = true; return; }
    const b = this._bounds();
    const bw = b.x1 - b.x0, bh = b.y1 - b.y0, pad = 12;
    const s = Math.max(1e-4, Math.min((this.cssW - 2 * pad) / bw, (this.cssH - 2 * pad) / bh));
    this.view.s = s;
    this.view.tx = this.cssW / 2 - (b.x0 + bw / 2) * s;
    this.view.ty = this.cssH / 2 - (b.y0 + bh / 2) * s;
    this._followDrag();
    this._invalidate();
  }

  // Spread loose single pieces around the frame; emits one scatter action.
  shuffleLoose() {
    const exclude = new Set(this.peerHeld);
    if (this.drag) exclude.add(this.drag.g);
    const t = now();
    const before = new Map();
    for (const g of this.model.groups.values()) {
      if (g.pieces.length === 1) {
        const { x, y } = this._pos(g, t);
        before.set(g.id, { x, y });
      }
    }
    const moves = this.model.scatterLoose((Math.random() * 4294967296) >>> 0, exclude);
    for (const mv of moves) {
      const b = before.get(mv.g);
      this.anim.set(mv.g, { fx: b.x, fy: b.y, t0: t, dur: SCATTER_MS });
    }
    if (moves.length) this.emit({ type: 'scatter', moves });
    this._changed();
    this._invalidate();
    return moves;
  }

  resize() {
    if (this.destroyed) return;
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(DPR_MAX, globalThis.devicePixelRatio || 1);
    const bw = Math.round(w * dpr), bh = Math.round(h * dpr);
    if (this.canvas.width !== bw) this.canvas.width = bw;
    if (this.canvas.height !== bh) this.canvas.height = bh;
    if (this.cssW && !this.needFit) { // keep the world point at the screen centre
      const c = this._toWorld({ x: this.cssW / 2, y: this.cssH / 2 });
      this.view.tx = w / 2 - c.x * this.view.s;
      this.view.ty = h / 2 - c.y * this.view.s;
    }
    this.cssW = w;
    this.cssH = h;
    this.dpr = dpr;
    if (this.needFit) { this.needFit = false; this.fitView(); }
    this._invalidate();
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    clearTimeout(this.cursorTimer);
    if (this.ro) this.ro.disconnect();
    for (const [target, type, fn, opt] of this.listeners) target.removeEventListener(type, fn, opt);
    for (const pages of this.levels) pages.forEach(freeCanvas);
    this.levels = [];
    for (const sp of this.sprites.values()) freeCanvas(sp.canvas);
    this.sprites.clear();
    freeCanvas(this.layer);
    this.layer = null;
    if (this.ghostLv) this.ghostLv.slice(1).forEach(freeCanvas); // [0] is the photo itself
    this.ghostLv = null;
    this.pointers.clear();
    this.drag = null;
  }

  // ---------- piece bitmaps ----------

  // Every piece is rendered once into shared atlas pages (uniform cells, few textures, fast
  // drawImage), then each page is halved MIP_LEVELS - 1 times.
  _buildAtlas() {
    const { pw, ph, tm } = this;
    const n = this.model.total;
    const fw = pw + 2 * tm, fh = ph + 2 * tm;
    const bs = Math.min(2, Math.sqrt(BITMAP_BUDGET / (n * fw * fh)), (ATLAS_MAX - 4) / Math.max(fw, fh));
    const cw = Math.ceil(fw * bs) + 2, ch = Math.ceil(fh * bs) + 2; // 1 px gutter each side
    const perRow = Math.floor(ATLAS_MAX / cw), per = perRow * Math.floor(ATLAS_MAX / ch);
    const m = Math.min(pw, ph) * bs;
    this.bs = bs;
    this.srcW = fw * bs;
    this.srcH = fh * bs;
    this.cells = [];
    const pages = [];
    for (let first = 0; first < n; first += per) {
      const count = Math.min(per, n - first);
      const w = Math.min(count, perRow) * cw, h = Math.ceil(count / perRow) * ch;
      const clean = makeCanvas(w, h);
      const cctx = clean.getContext('2d');
      for (let k = 0; k < count; k++) {
        const cell = { a: pages.length, sx: (k % perRow) * cw + 1, sy: Math.floor(k / perRow) * ch + 1 };
        this.cells.push(cell);
        this._renderPiece(cctx, first + k, cell.sx, cell.sy);
      }
      // Baked soft drop shadow: one blur for the whole page instead of one per piece.
      const page = makeCanvas(w, h);
      const x = page.getContext('2d');
      x.shadowColor = 'rgba(0,0,0,0.38)';
      x.shadowBlur = 0.05 * m;
      x.shadowOffsetX = 0.01 * m;
      x.shadowOffsetY = 0.025 * m;
      x.drawImage(clean, 0, 0);
      x.shadowColor = 'transparent';
      x.drawImage(clean, 0, 0);
      freeCanvas(clean);
      pages.push(page);
    }
    this.levels = [pages];
    for (let lv = 1; lv < MIP_LEVELS; lv++) {
      this.levels.push(this.levels[lv - 1].map((c) => halve(c, c.width, c.height)));
    }
  }

  _renderPiece(ctx, i, ox, oy) {
    const { pw, ph, tm, bs, imgW, imgH } = this;
    const { col, row } = this.edges[i];
    const path = this.paths[i];
    const m = Math.min(pw, ph);
    ctx.save();
    ctx.setTransform(bs, 0, 0, bs, ox + tm * bs, oy + tm * bs); // piece-local coords
    // Photo region clipped to the outline (source rect clamped to the image).
    ctx.save();
    ctx.clip(path);
    const x0 = Math.max(0, col * pw - tm), y0 = Math.max(0, row * ph - tm);
    const x1 = Math.min(imgW, (col + 1) * pw + tm), y1 = Math.min(imgH, (row + 1) * ph + tm);
    ctx.drawImage(this.image, x0, y0, x1 - x0, y1 - y0, x0 - col * pw, y0 - row * ph, x1 - x0, y1 - y0);
    // Bevel: a stroke shifted by half its width shows only on one side inside the clip.
    const d = 0.02 * m;
    ctx.lineJoin = 'round';
    for (const [sign, rgb] of [[1, '255,255,255'], [-1, '0,0,0']]) { // light top-left, dark bottom-right
      for (const [w, alpha] of [[4 * d, 0.1], [2 * d, 0.16]]) {
        ctx.save();
        ctx.translate((sign * w) / 2, (sign * w) / 2);
        ctx.strokeStyle = `rgba(${rgb},${alpha})`;
        ctx.lineWidth = w;
        ctx.stroke(path);
        ctx.restore();
      }
    }
    ctx.restore();
    // Thin dark outline so neighbouring pieces read as separate.
    ctx.lineWidth = Math.max(0.9 / bs, 0.012 * m);
    ctx.strokeStyle = 'rgba(0,0,0,0.42)';
    ctx.stroke(path);
    ctx.restore();
  }

  _sidePath(p, side) {
    const key = p * 4 + side;
    let path = this.sidePaths.get(key);
    if (!path) {
      const pts = edgeCurve(this.edges[p], SIDES[side], this.pw, this.ph);
      path = new Path2D();
      path.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i += 3) {
        path.bezierCurveTo(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], pts[i + 2][0], pts[i + 2][1]);
      }
      this.sidePaths.set(key, path);
    }
    return path;
  }

  // ---------- rendering ----------

  // full = false: only live things changed (dragged or gliding group, cursor); the static layer
  // stays valid. Anything else may have changed static groups and must bump the version.
  _invalidate(full = true) {
    if (full) this.ver++;
    if (!this.raf && !this.destroyed) this.raf = requestAnimationFrame(this._frame);
  }

  _frame() {
    this.raf = 0;
    if (this.destroyed) return;
    const t = now();
    const d = this.drag;
    if (d && d.pending) { // at most one move action per frame
      d.pending = false;
      const g = this.model.group(d.g);
      if (g) this.emit({ type: 'move', g: d.g, x: r1(g.x), y: r1(g.y) });
    }
    let animating = false;
    for (const [id, a] of this.anim) {
      if (!this.model.group(id) || t - a.t0 >= a.dur) this.anim.delete(id); // ended: static again
      else animating = true;
    }
    this._draw(t);
    if (animating) this._invalidate(false);
  }

  // Displayed offset of a group (glides toward the model offset after remote moves).
  _pos(g, t) {
    const a = this.anim.get(g.id);
    if (!a) return g;
    const k = Math.min(1, (t - a.t0) / a.dur);
    return { x: a.fx + (g.x - a.fx) * k, y: a.fy + (g.y - a.fy) * k };
  }

  _hidden(g) {
    return this.edgeOnly && g.pieces.length === 1 && !this.model.isEdgePiece(g.pieces[0])
      && !(this.drag && this.drag.g === g.id);
  }

  // Live = may move this frame: dragged here, held by the partner, or gliding.
  _live(id) {
    return (this.drag !== null && this.drag.g === id) || this.peerHeld.has(id) || this.anim.has(id);
  }

  _draw(t) {
    const { ctx, canvas, dpr, cssW, cssH } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height); // the table itself is styled by the page
    if (!cssW || !cssH) return;
    const { s, tx, ty } = this.view;
    const order = this.model.order;
    const k = firstLive(order, (id) => this._live(id));
    const vk = `${s},${tx},${ty},${canvas.width},${canvas.height}`;
    const still = vk === this.lastView; // while panning or zooming the layer would be rebuilt every frame
    this.lastView = vk;
    if (still && k > 0) {
      const key = `${vk},${k},${this.ver}`;
      if (this.layerKey !== key) {
        this._paintLayer(k, t);
        this.layerKey = key;
      }
      ctx.drawImage(this.layer, 0, 0);
    } else {
      this._drawStatic(ctx, k, t);
    }
    // Live groups in z order; the local drag stays on top of everything.
    const vis = this._world(ctx);
    const dragId = this.drag ? this.drag.g : null;
    for (let i = k; i < order.length; i++) {
      const id = order[i];
      if (id === dragId) continue;
      const g = this.model.group(id);
      if (this._hidden(g)) continue;
      const pos = this._pos(g, t);
      if (!this.peerHeld.has(id)) this._drawPieces(ctx, g, pos, vis);
      else if (!this._blit(this._sprite(g, 'held'), pos)) {
        this._drawPieces(ctx, g, pos, vis);
        this._drawHeld(ctx, g, pos, dpr * s, dpr * tx, dpr * ty);
      }
    }
    const dg = dragId === null ? null : this.model.group(dragId);
    if (dg && !this._blit(this._sprite(dg, 'lift'), dg)) this._drawPieces(ctx, dg, dg, vis);
    for (const [id, sp] of this.sprites) { // drop bitmaps of groups that stopped moving
      if (id !== dragId && !this.peerHeld.has(id)) {
        freeCanvas(sp.canvas);
        this.sprites.delete(id);
      }
    }
    if (this.peerCursor) this._drawCursor();
  }

  // World transform on a device-px context; returns the visible world rectangle.
  _world(c) {
    const { dpr, cssW, cssH } = this;
    const { s, tx, ty } = this.view;
    c.setTransform(dpr * s, 0, 0, dpr * s, dpr * tx, dpr * ty);
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'low'; // see the header: never 'medium' / 'high'
    return { x0: -tx / s, y0: -ty / s, x1: (cssW - tx) / s, y1: (cssH - ty) / s };
  }

  // Frame and the groups below z index k (none of them is live).
  _drawStatic(c, k, t) {
    const vis = this._world(c);
    this._drawFrame(c);
    const order = this.model.order;
    for (let i = 0; i < k; i++) {
      const g = this.model.group(order[i]);
      if (!this._hidden(g)) this._drawPieces(c, g, this._pos(g, t), vis);
    }
  }

  _paintLayer(k, t) {
    const { width, height } = this.canvas;
    if (!this.layer) this.layer = makeCanvas(width, height);
    const L = this.layer;
    if (L.width !== width) L.width = width;
    if (L.height !== height) L.height = height;
    const c = L.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, width, height);
    this._drawStatic(c, k, t);
  }

  _drawFrame(c) {
    const { imgW, imgH } = this;
    const s = this.view.s;
    c.fillStyle = 'rgba(255,255,255,0.12)';
    c.fillRect(0, 0, imgW, imgH);
    if (this.ghost) {
      const { img, f } = this._ghostSrc(s * this.dpr);
      c.globalAlpha = 0.18;
      c.drawImage(img, 0, 0, imgW * f, imgH * f, 0, 0, imgW, imgH);
      c.globalAlpha = 1;
    }
    c.lineWidth = 2 / s;
    c.strokeStyle = 'rgba(0,0,0,0.22)';
    c.strokeRect(0, 0, imgW, imgH);
    c.lineWidth = 1 / s;
    c.strokeStyle = 'rgba(255,255,255,0.5)';
    c.strokeRect(1.5 / s, 1.5 / s, imgW - 3 / s, imgH - 3 / s);
  }

  // Photo mip levels for the preview (built on first use).
  _ghostSrc(k) {
    if (!this.ghostLv) {
      this.ghostLv = [this.image];
      let w = this.imgW, h = this.imgH;
      for (let lv = 1; lv < MIP_LEVELS; lv++) {
        this.ghostLv.push(halve(this.ghostLv[lv - 1], w, h));
        w /= 2;
        h /= 2;
      }
    }
    const lv = mipLevel(1, k, this.ghostLv.length);
    return { img: this.ghostLv[lv], f: 1 / (1 << lv) };
  }

  // Pieces of a group at offset pos, drawn from the atlas level that fits k (device px per world
  // unit; default: the current view). vis = visible world rectangle for culling, or null.
  _drawPieces(c, g, pos, vis, k = this.view.s * this.dpr) {
    const { pw, ph, tm, cols, cells } = this;
    const lv = mipLevel(this.bs, k, this.levels.length);
    const pages = this.levels[lv], f = 1 / (1 << lv);
    const sw = this.srcW * f, sh = this.srcH * f;
    const fw = pw + 2 * tm, fh = ph + 2 * tm;
    for (const p of g.pieces) {
      const col = p % cols;
      const x = pos.x + col * pw - tm, y = pos.y + ((p - col) / cols) * ph - tm;
      if (vis && (x > vis.x1 || y > vis.y1 || x + fw < vis.x0 || y + fh < vis.y0)) continue; // cull
      const cell = cells[p];
      c.drawImage(pages[cell.a], cell.sx * f, cell.sy * f, sw, sh, x, y, fw, fh);
    }
  }

  // Rose outline along the outer boundary of a group the partner is holding.
  // Device px = (ox, oy) + k * world.
  _drawHeld(c, g, pos, k, ox, oy) {
    const { dpr, cols, pw, ph, model } = this;
    const rows = model.rows;
    c.save();
    c.strokeStyle = PEER;
    c.lineJoin = 'round';
    c.lineCap = 'round';
    for (const [w, alpha] of [[7, 0.3], [2.5, 1]]) {
      c.globalAlpha = alpha;
      c.lineWidth = (w * dpr) / k; // w CSS px
      for (const p of g.pieces) {
        const col = p % cols, row = Math.floor(p / cols);
        const nb = [row > 0 ? p - cols : -1, col < cols - 1 ? p + 1 : -1, row < rows - 1 ? p + cols : -1, col > 0 ? p - 1 : -1];
        let placed = false;
        for (let side = 0; side < 4; side++) {
          if (nb[side] >= 0 && model.owner[nb[side]] === g.id) continue; // inner seam
          if (!placed) {
            c.setTransform(k, 0, 0, k, ox + k * (pos.x + col * pw), oy + k * (pos.y + row * ph));
            placed = true;
          }
          c.stroke(this._sidePath(p, side));
        }
      }
    }
    c.restore();
  }

  // One bitmap for a moving group at the current scale: 'lift' = dragged here, with a drop shadow;
  // 'held' = held by the partner, with the rose outline. Rebuilt when the members (a new pieces
  // array after every merge or state load) or the scale change. null: too big, draw piece by piece.
  _sprite(g, mode) {
    const k = this.view.s * this.dpr;
    const old = this.sprites.get(g.id);
    if (old && old.pieces === g.pieces && old.k === k && old.mode === mode) return old.canvas ? old : null;
    if (old) freeCanvas(old.canvas);
    const { cols, pw, ph, tm, dpr } = this;
    let c0 = Infinity, r0 = Infinity, c1 = -Infinity, r1 = -Infinity;
    for (const p of g.pieces) {
      const col = p % cols, row = (p - col) / cols;
      if (col < c0) c0 = col;
      if (col > c1) c1 = col;
      if (row < r0) r0 = row;
      if (row > r1) r1 = row;
    }
    const pad = Math.ceil((mode === 'lift' ? LIFT_PAD : HELD_PAD) * dpr);
    const bx0 = c0 * pw - tm, by0 = r0 * ph - tm;
    const w = Math.ceil(((c1 - c0 + 1) * pw + 2 * tm) * k) + 2 * pad;
    const h = Math.ceil(((r1 - r0 + 1) * ph + 2 * tm) * k) + 2 * pad;
    const sp = { pieces: g.pieces, k, mode, bx0, by0, pad, canvas: null };
    this.sprites.set(g.id, sp);
    if (w * h > SPRITE_PX || w > ATLAS_MAX || h > ATLAS_MAX) return null;
    const ox = pad - bx0 * k, oy = pad - by0 * k;
    const paint = (c) => {
      const x = c.getContext('2d');
      x.setTransform(k, 0, 0, k, ox, oy);
      x.imageSmoothingEnabled = true;
      x.imageSmoothingQuality = 'low';
      this._drawPieces(x, g, ORIGIN, null, k);
      if (mode === 'held') this._drawHeld(x, g, ORIGIN, k, ox, oy);
    };
    sp.canvas = makeCanvas(w, h);
    if (mode === 'lift') { // shadow pass, then the clean group on top
      const tmp = makeCanvas(w, h);
      paint(tmp);
      const x = sp.canvas.getContext('2d');
      x.shadowColor = 'rgba(0,0,0,0.3)';
      x.shadowBlur = LIFT_BLUR * dpr;
      x.shadowOffsetY = LIFT_DY * dpr;
      x.drawImage(tmp, 0, 0);
      x.shadowColor = 'transparent';
      x.drawImage(tmp, 0, 0);
      freeCanvas(tmp);
    } else {
      paint(sp.canvas);
    }
    return sp;
  }

  // Draw a sprite with its group offset at pos (whole device px: stays sharp). false: no sprite.
  _blit(sp, pos) {
    if (!sp) return false;
    const { ctx, dpr } = this;
    const { s, tx, ty } = this.view;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(sp.canvas,
      Math.round(dpr * (tx + s * (pos.x + sp.bx0))) - sp.pad,
      Math.round(dpr * (ty + s * (pos.y + sp.by0))) - sp.pad);
    this._world(ctx);
    return true;
  }

  _drawCursor() {
    const { ctx, dpr } = this;
    const { s, tx, ty } = this.view;
    const c = this.peerCursor;
    const x = tx + c.x * s, y = ty + c.y * s;
    if (x < -60 || y < -60 || x > this.cssW + 60 || y > this.cssH + 60) return;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    heartPath(ctx, x, y, 9);
    ctx.fillStyle = PEER;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
    if (c.name) {
      const label = String(c.name).slice(0, 24);
      ctx.font = `600 12px ${this.font}`;
      const w = ctx.measureText(label).width + 14;
      pillPath(ctx, x + 12, y + 8, w, 20);
      ctx.fillStyle = PEER;
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x + 19, y + 18.5);
    }
    ctx.restore();
  }

  // ---------- camera ----------

  _toWorld(pt) {
    const { s, tx, ty } = this.view;
    return { x: (pt.x - tx) / s, y: (pt.y - ty) / s };
  }

  _pt(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  _bounds() {
    const b = this.model.bounds(), m = this.tm;
    return { x0: b.x0 - m, y0: b.y0 - m, x1: b.x1 + m, y1: b.y1 + m };
  }

  // Zoom out to half of "fit all"; zoom in until the short screen side spans ~3 pieces.
  _clampScale(s) {
    const b = this._bounds();
    const fit = Math.min(this.cssW / (b.x1 - b.x0), this.cssH / (b.y1 - b.y0));
    const max = Math.max(fit, Math.min(this.cssW, this.cssH) / (3 * Math.max(this.pw, this.ph)));
    return Math.min(max, Math.max(fit * 0.5, s));
  }

  _zoomAt(pt, f) {
    if (!this.cssW || !this.cssH || !(f > 0)) return;
    const w = this._toWorld(pt);
    const s = this._clampScale(this.view.s * f);
    this.view.s = s;
    this.view.tx = pt.x - w.x * s;
    this.view.ty = pt.y - w.y * s;
    this._followDrag();
    this._invalidate();
  }

  // Keep a dragged group under its pointer when the camera changes mid-drag.
  _followDrag() {
    const d = this.drag;
    const pt = d && this.pointers.get(d.pointerId);
    if (!pt) return;
    const w = this._toWorld(pt);
    this.model.move(d.g, w.x - d.dx, w.y - d.dy);
    d.pending = true;
  }

  // ---------- input ----------

  _onDown(e) {
    if (this.destroyed) return;
    e.preventDefault();
    const pt = this._pt(e);
    try { this.canvas.setPointerCapture(e.pointerId); } catch { /* pointer already released */ }
    this.pointers.set(e.pointerId, pt);
    if (e.isPrimary) this._cursor(pt);
    if (this.pointers.size === 1) {
      const w = this._toWorld(pt);
      const slop = e.pointerType === 'touch' ? Math.min(10 / this.view.s, 0.25 * Math.min(this.pw, this.ph)) : 0;
      const id = e.button === 0 ? this._hit(w.x, w.y, slop) : null;
      if (id !== null && !this.peerHeld.has(id)) this._startDrag(id, e.pointerId, w);
      else this.pan = { id: e.pointerId, last: pt };
    } else if (this.pointers.size === 2) {
      if (this.drag) {
        if (now() - this.drag.t0 > PINCH_GRACE_MS) return; // established drag: ignore the extra finger
        this._abortDrag();
      }
      this.pan = null;
      this._startPinch();
    }
  }

  _onMove(e) {
    if (this.destroyed) return;
    const pt = this._pt(e);
    if (e.isPrimary) this._cursor(pt);
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.set(e.pointerId, pt);
    const d = this.drag;
    if (d && d.pointerId === e.pointerId) {
      const w = this._toWorld(pt);
      this.model.move(d.g, w.x - d.dx, w.y - d.dy);
      d.pending = true;
      this._invalidate(false); // only the dragged group moved
    } else if (this.pinch) {
      this._updatePinch();
    } else if (this.pan && this.pan.id === e.pointerId) {
      this.view.tx += pt.x - this.pan.last.x;
      this.view.ty += pt.y - this.pan.last.y;
      this.pan.last = pt;
      this._invalidate();
    }
  }

  _onUp(e) {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.delete(e.pointerId);
    if (this.drag && this.drag.pointerId === e.pointerId) this._endDrag();
    if (this.pinch) {
      this.pinch = null;
      if (this.pointers.size >= 2) this._startPinch();
      else if (this.pointers.size === 1) {
        const [[id, last]] = this.pointers;
        this.pan = { id, last };
      }
    } else if (this.pan && this.pan.id === e.pointerId) {
      this.pan = null;
    }
  }

  _onWheel(e) {
    e.preventDefault();
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    const dy = Math.max(-300, Math.min(300, e.deltaY * unit));
    this._zoomAt(this._pt(e), Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0015))); // ctrl = trackpad pinch
  }

  // Topmost visible group under a world point. `slop` (touch) adds a rectangle fallback.
  _hit(wx, wy, slop) {
    const { model, pw, ph, tm, cols } = this;
    const t = now();
    const visible = [];
    for (let i = model.order.length - 1; i >= 0; i--) {
      const g = model.group(model.order[i]);
      if (this._hidden(g)) continue;
      const pos = this._pos(g, t);
      visible.push([g, pos]);
      for (const p of g.pieces) {
        const lx = wx - pos.x - (p % cols) * pw, ly = wy - pos.y - Math.floor(p / cols) * ph;
        if (lx < -tm || ly < -tm || lx > pw + tm || ly > ph + tm) continue;
        if (this.hitCtx.isPointInPath(this.paths[p], lx, ly)) return g.id;
      }
    }
    if (slop > 0) {
      for (const [g, pos] of visible) {
        for (const p of g.pieces) {
          const lx = wx - pos.x - (p % cols) * pw, ly = wy - pos.y - Math.floor(p / cols) * ph;
          if (lx >= -slop && ly >= -slop && lx <= pw + slop && ly <= ph + slop) return g.id;
        }
      }
    }
    return null;
  }

  _startDrag(id, pointerId, w) {
    const g = this.model.group(id);
    const { x, y } = this._pos(g, now()); // grab what is on screen, even mid-glide
    this.anim.delete(id);
    this.model.move(id, x, y);
    this.model.bringToFront(id);
    this.drag = { g: id, pointerId, dx: w.x - x, dy: w.y - y, ox: x, oy: y, t0: now(), pending: false };
    this.pan = null;
    this.emit({ type: 'grab', g: id });
    this._invalidate();
  }

  _endDrag() {
    const d = this.drag;
    this.drag = null;
    const r = this.model.snap(d.g, this.peerHeld);
    if (!r) return;
    this.emit({ type: 'drop', g: r.g, x: r.x, y: r.y, pieces: r.pieces });
    if (r.merged || r.framed) this.onSnap();
    this._changed();
    this._invalidate();
  }

  // A pinch right after a grab: put the group back and release it.
  _abortDrag() {
    const d = this.drag;
    this.drag = null;
    const g = this.model.group(d.g);
    if (!g) return;
    this.model.move(d.g, r1(d.ox), r1(d.oy));
    this.emit({ type: 'drop', g: d.g, x: g.x, y: g.y, pieces: g.pieces.slice() });
    this._invalidate();
  }

  _startPinch() {
    const [a, b] = this.pointers.values();
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    this.pinch = { d0: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), s0: this.view.s, w0: this._toWorld(mid) };
  }

  _updatePinch() {
    const [a, b] = this.pointers.values();
    const p = this.pinch;
    const s = this._clampScale((p.s0 * Math.hypot(a.x - b.x, a.y - b.y)) / p.d0);
    this.view.s = s;
    this.view.tx = (a.x + b.x) / 2 - p.w0.x * s;
    this.view.ty = (a.y + b.y) / 2 - p.w0.y * s;
    this._invalidate();
  }

  // Cursor action: at most one per CURSOR_MS, trailing position is not lost.
  _cursor(pt) {
    const w = this._toWorld(pt);
    this.cursorPending = { type: 'cursor', x: r1(w.x), y: r1(w.y) };
    const wait = CURSOR_MS - (now() - this.cursorAt);
    if (wait <= 0) this._flushCursor();
    else if (!this.cursorTimer) this.cursorTimer = setTimeout(() => this._flushCursor(), wait);
  }

  _flushCursor() {
    clearTimeout(this.cursorTimer);
    this.cursorTimer = 0;
    const a = this.cursorPending;
    if (!a || this.destroyed) return;
    this.cursorPending = null;
    this.cursorAt = now();
    this.emit(a);
  }

  // ---------- helpers ----------

  _glide(id, x, y, dur, t) {
    const g = this.model.group(id);
    if (!g) return;
    const cur = this._pos(g, t);
    const from = { x: cur.x, y: cur.y }; // copy: _pos may return the live group
    this.model.move(id, x, y);
    this.anim.set(id, { fx: from.x, fy: from.y, t0: t, dur });
  }

  _changed() {
    this.onProgress(this.model.progress());
    if (!this.model.isComplete()) this.completed = false;
    else if (!this.completed) {
      this.completed = true;
      this.onComplete();
    }
  }
}
