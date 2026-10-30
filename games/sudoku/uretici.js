// Birlikte Sudoku: tohumlu bulmaca üretici ve çözücü. Saf; DOM yok; Node'da test edilir.
// Tahta düz dizi: i = satır * 9 + sütun; 0 boş, 1–9 rakam. Aday kümeleri bit maskesi (rakam d → bit d-1).
import { mulberry32, shuffle } from '../hafiza/rng.js';

// ipucu: hedef ipucu sayısı (üstü). tekli: yalnız tekliklerle (naked + hidden single) çözülebilsin.
export const ZORLUKLAR = {
  kolay: { ad: 'Kolay', ipucu: 40, tekli: true },
  orta: { ad: 'Orta', ipucu: 32, tekli: true },
  zor: { ad: 'Zor', ipucu: 25, tekli: false },
};
const TUM = 0x1ff;

const SATIR = Array.from({ length: 81 }, (_, i) => Math.floor(i / 9));
const SUTUN = Array.from({ length: 81 }, (_, i) => i % 9);
const KUTU = Array.from({ length: 81 }, (_, i) => Math.floor(SATIR[i] / 3) * 3 + Math.floor(SUTUN[i] / 3));
// 27 birim: 9 satır, 9 sütun, 9 kutu
const BIRIMLER = [
  ...Array.from({ length: 9 }, (_, r) => Array.from({ length: 9 }, (_, c) => r * 9 + c)),
  ...Array.from({ length: 9 }, (_, c) => Array.from({ length: 9 }, (_, r) => r * 9 + c)),
  ...Array.from({ length: 9 }, (_, b) => Array.from({ length: 9 }, (_, k) => (Math.floor(b / 3) * 3 + Math.floor(k / 3)) * 9 + (b % 3) * 3 + (k % 3))),
];

function bitSay(m) {
  let n = 0;
  while (m) { m &= m - 1; n++; }
  return n;
}
const bitRakam = (m) => 31 - Math.clz32(m) + 1; // tek bitli maske → rakam

/** Satır/sütun/kutu maskelerini kurar; çelişki varsa null. */
function maskeler(g) {
  const r = new Array(9).fill(0);
  const c = new Array(9).fill(0);
  const b = new Array(9).fill(0);
  for (let i = 0; i < 81; i++) {
    const d = g[i];
    if (!d) continue;
    const bit = 1 << (d - 1);
    if ((r[SATIR[i]] | c[SUTUN[i]] | b[KUTU[i]]) & bit) return null;
    r[SATIR[i]] |= bit;
    c[SUTUN[i]] |= bit;
    b[KUTU[i]] |= bit;
  }
  return { r, c, b };
}

/** Geri izlemeli arama (en az adaylı hücre önce). Her çözümde bul(hücreler) çağrılır; true dönerse durur. */
function ara(g, bul) {
  const m = maskeler(g);
  if (!m) return;
  const h = g.slice();
  const { r, c, b } = m;
  let dur = false;
  const rec = () => {
    let enIyi = -1;
    let enIyiMaske = 0;
    let enAz = 10;
    for (let i = 0; i < 81; i++) {
      if (h[i]) continue;
      const aday = ~(r[SATIR[i]] | c[SUTUN[i]] | b[KUTU[i]]) & TUM;
      const n = bitSay(aday);
      if (n === 0) return; // çıkmaz
      if (n < enAz) {
        enAz = n;
        enIyi = i;
        enIyiMaske = aday;
        if (n === 1) break;
      }
    }
    if (enIyi < 0) {
      if (bul(h)) dur = true;
      return;
    }
    let aday = enIyiMaske;
    while (aday && !dur) {
      const bit = aday & -aday;
      aday ^= bit;
      const ri = SATIR[enIyi], ci = SUTUN[enIyi], bi = KUTU[enIyi];
      h[enIyi] = bitRakam(bit);
      r[ri] |= bit; c[ci] |= bit; b[bi] |= bit;
      rec();
      r[ri] ^= bit; c[ci] ^= bit; b[bi] ^= bit;
      h[enIyi] = 0;
    }
  };
  rec();
}

/** Çözüm sayısı (en çok sinir kadar sayar). Çelişkili tahta 0. */
export function cozumSay(g, sinir = 2) {
  let n = 0;
  ara(g, () => ++n >= sinir);
  return Math.min(n, sinir);
}

/** İlk çözüm (yeni dizi) | null. */
export function coz(g) {
  let sonuc = null;
  ara(g, (h) => { sonuc = h.slice(); return true; });
  return sonuc;
}

/**
 * Yalnız teklik kurallarıyla çözmeyi dener: tek adaylı hücre (naked single) ve bir birimde tek yere
 * sığan rakam (hidden single). Çözerse dolu dizi, takılırsa ya da çelişirse null.
 */
export function tekliklerleCoz(g) {
  const m = maskeler(g);
  if (!m) return null;
  const h = g.slice();
  const { r, c, b } = m;
  const koy = (i, d) => {
    const bit = 1 << (d - 1);
    h[i] = d;
    r[SATIR[i]] |= bit; c[SUTUN[i]] |= bit; b[KUTU[i]] |= bit;
  };
  const aday = (i) => ~(r[SATIR[i]] | c[SUTUN[i]] | b[KUTU[i]]) & TUM;
  let ilerledi = true;
  while (ilerledi) {
    ilerledi = false;
    for (let i = 0; i < 81; i++) {
      if (h[i]) continue;
      const a = aday(i);
      if (!a) return null;
      if (bitSay(a) === 1) { koy(i, bitRakam(a)); ilerledi = true; }
    }
    for (const birim of BIRIMLER) {
      for (let d = 1; d <= 9; d++) {
        const bit = 1 << (d - 1);
        let yer = -1;
        let say = 0;
        let var_ = false;
        for (const i of birim) {
          if (h[i] === d) { var_ = true; break; }
          if (!h[i] && aday(i) & bit) { say++; yer = i; }
        }
        if (var_) continue;
        if (say === 0) return null;
        if (say === 1) { koy(yer, d); ilerledi = true; }
      }
    }
  }
  return h.every(Boolean) ? h : null;
}

/** Satır, sütun ya da kutuda aynı rakamı paylaşan dolu hücreler. -> Set<i> */
export function cakisanlar(g) {
  const out = new Set();
  for (const birim of BIRIMLER) {
    const gor = new Map();
    for (const i of birim) {
      const d = g[i];
      if (!d) continue;
      if (gor.has(d)) { out.add(i); out.add(gor.get(d)); } else gor.set(d, i);
    }
  }
  return out;
}

export function ipucuSayisi(bulmaca) {
  let n = 0;
  for (const ch of bulmaca) if (ch !== '0') n++;
  return n;
}

function tamTahta(rnd) {
  const g = new Array(81).fill(0);
  const rakam = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const uygun = (i, d) => {
    for (let k = 0; k < 81; k++) {
      if (g[k] === d && (SATIR[k] === SATIR[i] || SUTUN[k] === SUTUN[i] || KUTU[k] === KUTU[i])) return false;
    }
    return true;
  };
  const doldur = (i) => {
    if (i === 81) return true;
    for (const d of shuffle(rakam, rnd)) {
      if (!uygun(i, d)) continue;
      g[i] = d;
      if (doldur(i + 1)) return true;
    }
    g[i] = 0;
    return false;
  };
  doldur(0);
  return g;
}

/**
 * Tohumlu bulmaca. Aynı (seed, zorluk) hep aynı bulmacayı verir. Tek çözümlülük cozumSay ile denetlenir.
 * Önce simetrik çiftler, sonra tek hücreler çıkarılır; hedef ipucuna inince durur.
 * -> { bulmaca: '81 hane, 0 boş', cozum: '81 hane', zorluk, ipucu }
 */
export function uret(seed, zorluk = 'kolay') {
  const z = Object.prototype.hasOwnProperty.call(ZORLUKLAR, zorluk) ? zorluk : 'kolay';
  const ayar = ZORLUKLAR[z];
  const rnd = mulberry32(seed);
  const cozum = tamTahta(rnd);
  const g = cozum.slice();
  let ipucu = 81;
  const uygun = () => cozumSay(g, 2) === 1 && (!ayar.tekli || !!tekliklerleCoz(g));
  const sira = shuffle(Array.from({ length: 81 }, (_, i) => i), rnd);
  for (const tur of ['cift', 'tek']) {
    for (const i of sira) {
      if (ipucu <= ayar.ipucu) break;
      const j = tur === 'cift' ? 80 - i : i;
      if (!g[i]) continue;
      const eski = [g[i], g[j]];
      const giden = i === j || !g[j] ? 1 : 2;
      g[i] = 0;
      g[j] = 0;
      if (uygun()) ipucu -= giden;
      else { g[i] = eski[0]; g[j] = eski[1]; }
    }
  }
  return { bulmaca: g.join(''), cozum: cozum.join(''), zorluk: z, ipucu };
}
