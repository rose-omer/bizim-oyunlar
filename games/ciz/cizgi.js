// Çizgi verisi: normalize koordinat, çizgi deposu, parça paketleme, giden kutusu. Saf; DOM yok.
//
// Koordinatlar 0..Q tamsayı (tuval 1:1). Kalınlık w = tuval genişliğinin Q'da biri.
// Mesajlar:
//   { t:'s0', id, c, w, b, p? }  çizgi başı (b = tuval kuşağı; eskiyse alıcı yok sayar)
//   { t:'sp', id, p:[x,y,...] }   100 ms'de bir toplu noktalar
//   { t:'s1', id, p? }            çizgi sonu
//   { t:'undo', id }, { t:'clear' }
//   { t:'ops', list:[...] }       aynı 100 ms'de birden çok işlem
//   { t:'strokes', part, total, b, cg, list }  ev sahibi → katılan misafir, her biri < 60 KB
//                                 (cg = ev sahibinin 'clear' sayacı; durumda da gider)

export const Q = 10_000;
export const PAPER = '#ffffff';
export const PALETTE = [
  { name: 'Siyah', color: '#22202a' },
  { name: 'Kırmızı', color: '#e5383b' },
  { name: 'Turuncu', color: '#f48c06' },
  { name: 'Sarı', color: '#ffd23f' },
  { name: 'Yeşil', color: '#2a9d4b' },
  { name: 'Mavi', color: '#2f6fed' },
  { name: 'Mor', color: '#8e44c9' },
  { name: 'Pembe', color: '#ff5fa2' },
];
export const ERASER = PALETTE.length; // c = 8 → kâğıt rengi
export const BRUSHES = [
  { id: 'ince', name: 'İnce', w: 45 },
  { id: 'orta', name: 'Orta', w: 120 },
  { id: 'kalin', name: 'Kalın', w: 300 },
];
export const ERASER_SCALE = 2.5;
export const MAX_STROKE_PTS = 2000; // daha uzun çizgi gönderen tarafta bölünür
export const MIN_STEP = 18; // bundan yakın noktalar atlanır (Q biriminde)
export const PART_BYTES = 60_000;

export const colorOf = (c) => (c === ERASER ? PAPER : PALETTE[c]?.color ?? PALETTE[0].color);

export function quant(v) {
  return Math.round(Math.min(1, Math.max(0, v)) * Q);
}

export function toNorm(clientX, clientY, rect) {
  return [quant((clientX - rect.left) / rect.width), quant((clientY - rect.top) / rect.height)];
}

export function farEnough(ax, ay, bx, by, min = MIN_STEP) {
  const dx = bx - ax, dy = by - ay;
  return dx * dx + dy * dy >= min * min;
}

function cleanPts(p) {
  if (!Array.isArray(p)) return [];
  const n = p.length - (p.length % 2);
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const v = Math.round(Number(p[i]) || 0);
    out[i] = v < 0 ? 0 : v > Q ? Q : v;
  }
  return out;
}

export class StrokeStore {
  constructor({ maxStrokes = 1500, maxPoints = 100_000 } = {}) {
    this.maxStrokes = maxStrokes;
    this.maxPoints = maxPoints;
    this.list = [];
    this.byId = new Map();
    this.points = 0;
  }

  get(id) {
    return this.byId.get(id) || null;
  }

  // Döner: 'add' (artımlı çiz), 'redraw' (baştan çiz), null (değişmedi).
  apply(op, by) {
    switch (op?.t) {
      case 's0': {
        const c = op.c, w = Number(op.w);
        if (typeof op.id !== 'string' || !op.id || this.byId.has(op.id)) return null;
        if (!Number.isInteger(c) || c < 0 || c > ERASER || !(w > 0 && w <= 2000)) return null;
        const s = { id: op.id, by: by ?? null, c, w, p: cleanPts(op.p), done: false };
        this.list.push(s);
        this.byId.set(s.id, s);
        this.points += s.p.length / 2;
        return this.cap() ? 'redraw' : 'add';
      }
      case 'sp':
      case 's1': {
        const s = this.byId.get(op.id);
        if (!s) return null;
        const p = cleanPts(op.p);
        for (const v of p) s.p.push(v);
        this.points += p.length / 2;
        if (op.t === 's1') s.done = true;
        return this.cap() ? 'redraw' : 'add';
      }
      case 'undo': {
        const s = this.byId.get(op.id);
        if (!s) return null;
        this.list.splice(this.list.indexOf(s), 1);
        this.byId.delete(s.id);
        this.points -= s.p.length / 2;
        return 'redraw';
      }
      case 'clear':
        this.list = [];
        this.byId.clear();
        this.points = 0;
        return 'redraw';
      default:
        return null;
    }
  }

  // Sınır aşılırsa en eski bitmiş çizgileri düşür. Düşürdüyse true.
  cap() {
    let dropped = false;
    while (this.list.length > this.maxStrokes || this.points > this.maxPoints) {
      const i = this.list.findIndex((s, k) => s.done && k < this.list.length - 1);
      if (i < 0) break;
      const [s] = this.list.splice(i, 1);
      this.byId.delete(s.id);
      this.points -= s.p.length / 2;
      dropped = true;
    }
    return dropped;
  }

  lastOwn(by) {
    for (let i = this.list.length - 1; i >= 0; i--) if (this.list[i].by === by) return this.list[i].id;
    return null;
  }

  // Parçalardan gelen listeyi yükler (makeParts biçimi).
  load(list) {
    this.list = [];
    this.byId.clear();
    this.points = 0;
    for (const r of list || []) {
      if (this.apply({ t: 's0', id: r.id, c: r.c, w: r.w, p: r.p }, r.by) && r.d) this.byId.get(r.id).done = true;
    }
  }
}

// Ev sahibinin depodaki çizgileri < PART_BYTES mesajlara böler. Boş liste de bir parça olur.
export function makeParts(list, b, maxBytes = PART_BYTES) {
  const budget = maxBytes - 200;
  const chunks = [[]];
  let size = 0;
  for (const s of list) {
    // p kopyalanır: parçalar kuyrukta beklerken çizgi uzamaya devam edebilir
    const r = { id: s.id, by: s.by, c: s.c, w: s.w, p: s.p.slice(), d: s.done ? 1 : 0 };
    const len = JSON.stringify(r).length + 1;
    if (size + len > budget && chunks.at(-1).length) {
      chunks.push([]);
      size = 0;
    }
    chunks.at(-1).push(r);
    size += len;
  }
  return chunks.map((c, part) => ({ t: 'strokes', part, total: chunks.length, b, list: c }));
}

// 100 ms'lik dilimde biriken işlemleri tek mesaja indirger. Aynı çizginin noktaları birleşir.
export class Outbox {
  constructor() {
    this.ops = [];
  }
  get size() {
    return this.ops.length;
  }
  push(op) {
    const last = this.ops.at(-1);
    if (op.t === 'sp' && last && last.id === op.id && (last.t === 's0' || last.t === 'sp')) {
      last.p = [...(last.p || []), ...op.p];
      return;
    }
    this.ops.push({ ...op, ...(op.p ? { p: [...op.p] } : {}) });
  }
  flush() {
    if (!this.ops.length) return null;
    const ops = this.ops;
    this.ops = [];
    return ops.length === 1 ? ops[0] : { t: 'ops', list: ops };
  }
  reset() {
    this.ops = [];
  }
}

// 100 ms'lik dilimde en çok bir mesaj: önce kuyruk, sonra giden kutusu.
// Gönderilemezse (bağlantı yok) mesaj sıranın başına döner; sonraki dilimde yeniden denenir.
export function flushOne(queue, outbox, send) {
  const m = queue.length ? queue.shift() : outbox.flush();
  if (!m) return null;
  if (send(m)) return m;
  queue.unshift(m);
  return null;
}

// Misafir: anlık görüntü parçalarını sırayla toplar.
// add(m) döner: { b, cg, list } (tamam) | null (sürüyor) | 'lost' (parça 0 ya da aradaki parça kaçtı; set atıldı).
export class PartsIn {
  constructor() {
    this.cur = null;
  }
  get busy() {
    return !!this.cur;
  }
  add(m) {
    if (m.part === 0) this.cur = { b: m.b, cg: m.cg, total: m.total, next: 0, list: [] };
    const cur = this.cur;
    if (!cur || m.part !== cur.next || m.total !== cur.total) {
      this.cur = null;
      return 'lost';
    }
    cur.next++;
    cur.list.push(...(m.list || []));
    if (cur.next < cur.total) return null;
    this.cur = null;
    return { b: cur.b, cg: cur.cg, list: cur.list };
  }
  reset() {
    this.cur = null;
  }
}
