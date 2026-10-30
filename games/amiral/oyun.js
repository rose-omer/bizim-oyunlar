// Amiral Battı: saf mantık. DOM yok.
// Hile önleme: her oyuncunun filosu yalnız kendi cihazında durur. Ev sahibinin ortak durumu
// yalnız sırayı, atışları ve sonuçlarını taşır; filolar oyun bitince açılır.
// Akış: saldıran { t:'atis', x, y } niyeti → ev sahibi `bekleyen` yapar → savunan cihaz kendi
// filosuna bakıp { t:'sonuc', x, y, vurdu, batti? } niyeti yollar → ev sahibi işler.

export const N = 10;
export const FILO = [
  { id: 'ucak', ad: 'Uçak gemisi', boy: 5 },
  { id: 'zirhli', ad: 'Zırhlı', boy: 4 },
  { id: 'kruvazor', ad: 'Kruvazör', boy: 3 },
  { id: 'denizalti', ad: 'Denizaltı', boy: 3 },
  { id: 'muhrip', ad: 'Muhrip', boy: 2 },
];
const HARFLER = 'ABCDEFGHIJ';

export function gemiTanim(id) {
  return FILO.find((g) => g.id === id) || null;
}

/** 'C5' gibi okunur koordinat: sütun harfi + satır numarası. */
export function koord(x, y) {
  return `${HARFLER[x] ?? '?'}${y + 1}`;
}

const icinde = (x, y) => Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < N && y < N;

/** Gemi: { id, x, y, yon: 'y' (yatay) | 'd' (dikey) } → [[x, y], ...] (pruvadan başlayarak). */
export function hucreler(g) {
  const t = gemiTanim(g?.id);
  if (!t) return [];
  const out = [];
  for (let k = 0; k < t.boy; k++) out.push(g.yon === 'd' ? [g.x, g.y + k] : [g.x + k, g.y]);
  return out;
}

/**
 * Gemiyi filonun geri kalanına göre dener. -> null (uygun) | 'disari' | 'cakisma' | 'temas'.
 * temasYok: gemiler kenardan ve çaprazdan da değmez.
 */
export function yerlesimHatasi(filo, gemi, { temasYok = true } = {}) {
  const h = hucreler(gemi);
  if (!h.length || h.some(([x, y]) => !icinde(x, y))) return 'disari';
  const dolu = new Set();
  const komsu = new Set();
  for (const g of filo || []) {
    if (g.id === gemi.id) continue;
    for (const [x, y] of hucreler(g)) {
      dolu.add(`${x},${y}`);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) komsu.add(`${x + dx},${y + dy}`);
    }
  }
  if (h.some(([x, y]) => dolu.has(`${x},${y}`))) return 'cakisma';
  if (temasYok && h.some(([x, y]) => komsu.has(`${x},${y}`))) return 'temas';
  return null;
}

/** Tam ve kurala uygun filo mu? (5 gemi, her tür bir kez) */
export function filoGecerli(filo, kural = {}) {
  if (!Array.isArray(filo) || filo.length !== FILO.length) return false;
  const ids = new Set(filo.map((g) => g?.id));
  if (ids.size !== FILO.length || FILO.some((t) => !ids.has(t.id))) return false;
  return filo.every((g) => (g.yon === 'y' || g.yon === 'd') && yerlesimHatasi(filo, g, kural) === null);
}

/** Tohumlu rastgeleyle tam filo (büyükten küçüğe). rnd: () => [0,1) */
export function rastgeleFilo(rnd, kural = {}) {
  for (let deneme = 0; deneme < 200; deneme++) {
    const filo = [];
    let ok = true;
    for (const t of FILO) {
      let konuldu = false;
      for (let i = 0; i < 300 && !konuldu; i++) {
        const yon = rnd() < 0.5 ? 'y' : 'd';
        const g = { id: t.id, x: Math.floor(rnd() * N), y: Math.floor(rnd() * N), yon };
        if (yerlesimHatasi(filo, g, kural) === null) { filo.push(g); konuldu = true; }
      }
      if (!konuldu) { ok = false; break; }
    }
    if (ok) return filo;
  }
  throw new Error('Filo yerleştirilemedi');
}

/** Gemiyi pruvası sabit kalarak döndürür. */
export function dondur(g) {
  return { ...g, yon: g.yon === 'd' ? 'y' : 'd' };
}

/**
 * Savunan cihaz: atışın sonucu. oncekiler = bu filoya daha önce yapılan atışlar [{ x, y, vurdu }].
 * -> { vurdu, batti: null | { id, ad, boy, hucreler }, bitti }
 */
export function atisSonucu(filo, oncekiler, x, y) {
  const vurulan = new Set((oncekiler || []).filter((a) => a.vurdu).map((a) => `${a.x},${a.y}`));
  vurulan.add(`${x},${y}`);
  const gemi = (filo || []).find((g) => hucreler(g).some(([gx, gy]) => gx === x && gy === y));
  if (!gemi) return { vurdu: false, batti: null, bitti: false };
  const h = hucreler(gemi);
  const batti = h.every(([gx, gy]) => vurulan.has(`${gx},${gy}`));
  const bitti = filo.every((g) => hucreler(g).every(([gx, gy]) => vurulan.has(`${gx},${gy}`)));
  const t = gemiTanim(gemi.id);
  return { vurdu: true, batti: batti ? { id: t.id, ad: t.ad, boy: t.boy, hucreler: h } : null, bitti };
}

/** Kayıtlı sonuçlar açılan filoyla tutarlı mı? (oyun sonunda hile/yanlışlık denetimi) */
export function dogrula(filo, atislar) {
  if (!Array.isArray(filo)) return false;
  const once = [];
  for (const a of atislar || []) {
    const r = atisSonucu(filo, once, a.x, a.y);
    if (r.vurdu !== !!a.vurdu) return false;
    if (!!r.batti !== !!a.batti || (r.batti && r.batti.id !== a.batti.id)) return false;
    once.push(a);
  }
  return true;
}

/** Benim atışlarımla batırdığım gemilerin kimlikleri. */
export function batanlar(atislar) {
  return new Set((atislar || []).filter((a) => a.batti).map((a) => a.batti.id));
}

// ---------- Ortak durum (ev sahibi) ----------

export function initialState({ players = [], names = {}, kimlik = 1 } = {}) {
  return {
    v: 1,
    faz: 'yerlesim', // 'yerlesim' | 'oyun' | 'bitti'
    players,
    names,
    temasYok: true,
    kimlik, // bu oyunun kimliği: yerel filo bu anahtarla saklanır
    tur: 1,
    baslayan: 0,
    sira: 0,
    hazir: [false, false],
    atislar: [[], []], // atislar[k] = k. oyuncunun yaptığı atışlar
    bekleyen: null, // { idx, x, y } sonucu beklenen atış
    kazanan: -1,
    filolar: [null, null], // bitince açılır
    skor: [0, 0],
  };
}

function temizBatti(b) {
  const t = gemiTanim(b?.id);
  if (!t || !Array.isArray(b.hucreler) || b.hucreler.length !== t.boy) return null;
  const h = b.hucreler.map((p) => [p?.[0], p?.[1]]);
  if (h.some(([x, y]) => !icinde(x, y))) return null;
  return { id: t.id, ad: t.ad, boy: t.boy, hucreler: h };
}

function temizFilo(f) {
  if (!Array.isArray(f) || f.length !== FILO.length) return null;
  const out = f.map((g) => ({ id: g?.id, x: g?.x, y: g?.y, yon: g?.yon === 'd' ? 'd' : 'y' }));
  return out.every((g) => gemiTanim(g.id) && icinde(g.x, g.y)) ? out : null;
}

const okIdx = (s, i) => i === 0 || i === 1;

export function reduce(s, a) {
  switch (a?.type) {
    case 'kural': {
      if (s.faz !== 'yerlesim' || s.hazir.some(Boolean)) return s;
      const temasYok = !!a.temasYok;
      return temasYok === s.temasYok ? s : { ...s, temasYok };
    }
    case 'hazir': {
      if (s.faz !== 'yerlesim' || !okIdx(s, a.idx)) return s;
      const hazir = s.hazir.slice();
      hazir[a.idx] = !!a.hazir;
      if (hazir[0] && hazir[1]) return { ...s, hazir, faz: 'oyun', sira: s.baslayan, bekleyen: null };
      return { ...s, hazir };
    }
    case 'atis': {
      if (s.faz !== 'oyun' || s.bekleyen || a.idx !== s.sira || !icinde(a.x, a.y)) return s;
      if (s.atislar[a.idx].some((t) => t.x === a.x && t.y === a.y)) return s;
      return { ...s, bekleyen: { idx: a.idx, x: a.x, y: a.y } };
    }
    case 'sonuc': {
      const b = s.bekleyen;
      if (s.faz !== 'oyun' || !b || a.idx !== 1 - b.idx || a.x !== b.x || a.y !== b.y) return s;
      const vurdu = !!a.vurdu;
      const batti = vurdu && a.batti ? temizBatti(a.batti) : null;
      const atis = batti ? { x: b.x, y: b.y, vurdu, batti } : { x: b.x, y: b.y, vurdu };
      const atislar = s.atislar.map((l, k) => (k === b.idx ? [...l, atis] : l));
      if (vurdu && a.bitti) {
        const skor = s.skor.slice();
        skor[b.idx] += 1;
        const filolar = s.filolar.slice();
        filolar[a.idx] = temizFilo(a.filo);
        return { ...s, atislar, bekleyen: null, faz: 'bitti', kazanan: b.idx, skor, filolar };
      }
      return { ...s, atislar, bekleyen: null, sira: vurdu ? b.idx : a.idx };
    }
    case 'filo': {
      if (s.faz !== 'bitti' || !okIdx(s, a.idx) || s.filolar[a.idx]) return s;
      const f = temizFilo(a.filo);
      if (!f) return s;
      const filolar = s.filolar.slice();
      filolar[a.idx] = f;
      return { ...s, filolar };
    }
    case 'yeni': {
      const tur = s.tur + 1;
      const baslayan = (tur - 1) % 2;
      return {
        ...s, faz: 'yerlesim', kimlik: a.kimlik ?? s.kimlik + 1, tur, baslayan, sira: baslayan,
        hazir: [false, false], atislar: [[], []], bekleyen: null, kazanan: -1, filolar: [null, null],
      };
    }
    default:
      return s;
  }
}

/** Ev sahibi: niyeti eyleme çevirir. by = gönderenin clientId'si. null = yok say. */
export function toAction(intent, by, s, { kimlik } = {}) {
  const idx = s.players.indexOf(by);
  if (idx < 0) return null;
  switch (intent?.t) {
    case 'kural': return { type: 'kural', temasYok: !!intent.temasYok };
    case 'hazir': return { type: 'hazir', idx, hazir: !!intent.hazir };
    case 'atis': return { type: 'atis', idx, x: intent.x, y: intent.y };
    case 'sonuc':
      return { type: 'sonuc', idx, x: intent.x, y: intent.y, vurdu: !!intent.vurdu, batti: intent.batti || null, bitti: !!intent.bitti, filo: intent.filo || null };
    case 'filo': return { type: 'filo', idx, filo: intent.filo };
    case 'yeni': return { type: 'yeni', kimlik };
    default: return null;
  }
}

/** Savunan cihaz: bekleyen atış bana mı? Öyleyse yollanacak sonuç niyeti; değilse null. */
export function cevapla(s, benIdx, filo) {
  const b = s?.bekleyen;
  if (!b || s.faz !== 'oyun' || 1 - b.idx !== benIdx || !Array.isArray(filo)) return null;
  const r = atisSonucu(filo, s.atislar[b.idx], b.x, b.y);
  const out = { t: 'sonuc', x: b.x, y: b.y, vurdu: r.vurdu };
  if (r.batti) out.batti = r.batti;
  if (r.bitti) { out.bitti = true; out.filo = filo; }
  return out;
}

export function resultOf(s) {
  return { kazanan: s.kazanan, atis: s.atislar.map((l) => l.length), skor: s.skor, temasYok: s.temasYok };
}
