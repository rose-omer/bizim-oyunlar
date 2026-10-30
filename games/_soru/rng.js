// Tohumlu rastgelelik. Saf; DOM'a dokunmaz.

/** [0,1) üreten tohumlu üreteç. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Yeni 32 bit tohum (yalnız ev sahibi çağırır). */
export function randomSeed() {
  const c = globalThis.crypto;
  if (c && typeof c.getRandomValues === 'function') return c.getRandomValues(new Uint32Array(1))[0];
  return (Math.random() * 4294967296) >>> 0;
}

/** Tohum + sayaç → yeni tohum (her çekiliş ayrı üreteç). */
export function mix(seed, n) {
  let h = (seed ^ Math.imul((n + 1) >>> 0, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  return (h ^ (h >>> 13)) >>> 0;
}

/** Fisher–Yates; girdiyi değiştirmez. */
export function shuffle(list, seed) {
  const out = list.slice();
  const r = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * `count` tekil id seçer; önce `used` dışındakilerden. Yetmezse baştan (used sıfırlanır).
 * -> { order, used }
 */
export function drawOrder(ids, count, seed, used = []) {
  const seen = new Set(used);
  const fresh = ids.filter((id) => !seen.has(id));
  const reset = fresh.length < count;
  const order = shuffle(reset ? ids : fresh, seed).slice(0, count);
  return { order, used: reset ? order : [...used, ...order] };
}
