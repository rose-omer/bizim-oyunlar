// Dört Taş ve XOX: saf durum makinesi. DOM yok. Ev sahibi uygular, misafir yalnız çizer.
// Tahta düz dizi: i = satir * cols + sutun; satır 0 en üstte. -1 boş, 0/1 oyuncu sırası.

export const MODLAR = {
  dort: { id: 'dort', ad: 'Dört Taş', cols: 7, rows: 6, k: 4 },
  xox: { id: 'xox', ad: 'XOX', cols: 3, rows: 3, k: 3 },
};

export function modBul(id) {
  return Object.prototype.hasOwnProperty.call(MODLAR, id) ? MODLAR[id] : null;
}

export function bosTahta(mod) {
  const m = MODLAR[mod];
  return Array(m.cols * m.rows).fill(-1);
}

/** Sütuna bırakılan taşın ineceği satır; sütun doluysa ya da geçersizse -1. */
export function inecegiSatir(tahta, cols, rows, col) {
  if (!Number.isInteger(col) || col < 0 || col >= cols) return -1;
  for (let r = rows - 1; r >= 0; r--) if (tahta[r * cols + col] === -1) return r;
  return -1;
}

const YONLER = [[1, 0], [0, 1], [1, 1], [1, -1]];

/** i hücresinden geçen, en az k uzunluktaki tüm çizgilerin hücreleri (sıralı) | null. */
export function kazananCizgi(tahta, cols, rows, k, i) {
  const p = tahta[i];
  if (p == null || p < 0) return null;
  const r0 = Math.floor(i / cols);
  const c0 = i % cols;
  const hepsi = new Set();
  for (const [dc, dr] of YONLER) {
    const cizgi = [i];
    for (const s of [1, -1]) {
      let c = c0 + dc * s;
      let r = r0 + dr * s;
      while (c >= 0 && c < cols && r >= 0 && r < rows && tahta[r * cols + c] === p) {
        cizgi.push(r * cols + c);
        c += dc * s;
        r += dr * s;
      }
    }
    if (cizgi.length >= k) cizgi.forEach((x) => hepsi.add(x));
  }
  return hepsi.size ? [...hepsi].sort((a, b) => a - b) : null;
}

/** Tüm tahtayı tarar: { oyuncu, cizgi } | null. */
export function kazananBul(tahta, cols, rows, k) {
  for (let i = 0; i < tahta.length; i++) {
    const c = kazananCizgi(tahta, cols, rows, k, i);
    if (c) return { oyuncu: tahta[i], cizgi: c };
  }
  return null;
}

function bosSkor() {
  return { dort: [0, 0, 0], xox: [0, 0, 0] }; // [oyuncu0, oyuncu1, berabere]
}

function yeniOyun(s, mod) {
  const oyun = (s.oyun || 0) + 1;
  const baslayan = (oyun - 1) % 2; // her oyunda başlayan değişir
  return {
    ...s,
    mod,
    oyun,
    baslayan,
    sira: baslayan,
    tahta: bosTahta(mod),
    faz: 'oyun',
    kazanan: null, // null sürüyor, -1 berabere, 0/1 kazanan
    cizgi: [],
    son: null,
    hamle: 0,
  };
}

export function initialState({ players = [], names = {}, mod = 'dort' } = {}) {
  return yeniOyun({ v: 1, players, names, oyun: 0, skor: bosSkor() }, modBul(mod) ? mod : 'dort');
}

export function reduce(s, a) {
  switch (a?.type) {
    case 'hamle': {
      if (s.faz !== 'oyun') return s;
      if (s.players[s.sira] !== a.by) return s;
      const m = MODLAR[s.mod];
      let i;
      if (s.mod === 'dort') {
        const r = inecegiSatir(s.tahta, m.cols, m.rows, a.x);
        if (r < 0) return s;
        i = r * m.cols + a.x;
      } else {
        i = a.x;
        if (!Number.isInteger(i) || i < 0 || i >= s.tahta.length || s.tahta[i] !== -1) return s;
      }
      const tahta = s.tahta.slice();
      tahta[i] = s.sira;
      const hamle = s.hamle + 1;
      const cizgi = kazananCizgi(tahta, m.cols, m.rows, m.k, i);
      const dolu = tahta.every((x) => x !== -1);
      if (!cizgi && !dolu) return { ...s, tahta, hamle, son: i, sira: 1 - s.sira };
      const kazanan = cizgi ? s.sira : -1;
      const skor = { ...s.skor, [s.mod]: s.skor[s.mod].slice() };
      skor[s.mod][kazanan === -1 ? 2 : kazanan] += 1;
      return { ...s, tahta, hamle, son: i, faz: 'bitti', kazanan, cizgi: cizgi || [], skor };
    }
    case 'yeni':
      return yeniOyun(s, s.mod);
    case 'mod':
      if (!modBul(a.mod) || a.mod === s.mod) return s;
      return yeniOyun(s, a.mod);
    default:
      return s;
  }
}

// Ev sahibi: gelen niyeti (kendi ya da misafir) eyleme çevirir. null = yok say.
export function toAction(intent, by) {
  switch (intent?.type) {
    case 'hamle':
      return Number.isInteger(intent.x) ? { type: 'hamle', by, x: intent.x } : null;
    case 'yeni':
      return { type: 'yeni' };
    case 'mod':
      return modBul(intent.mod) ? { type: 'mod', mod: intent.mod } : null;
    default:
      return null;
  }
}

/** logGame için küçük özet. */
export function resultOf(s) {
  return { mod: s.mod, kazanan: s.kazanan, hamle: s.hamle, skor: s.skor[s.mod] };
}

/** Görüntülenen durumla yeni durum arasında yeni dolan hücreler (animasyon için). */
export function yeniTaslar(onceki, simdiki) {
  if (!simdiki) return [];
  if (!onceki || onceki.oyun !== simdiki.oyun || onceki.mod !== simdiki.mod) {
    return [];
  }
  const out = [];
  for (let i = 0; i < simdiki.tahta.length; i++) if (onceki.tahta[i] === -1 && simdiki.tahta[i] !== -1) out.push(i);
  return out;
}
