// Yavrumuz: giydirme (saf mantık, DOM yok, Node'da test edilir).
// Belgede: giyim: { bas?, goz?, boyun? } = ürün id | yok. Yama alan düzeyinde: 'giyim.<yuva>' (çıkarınca null).
// Yalnız dolapta olan kıyafet giyilir (dolap: jeton.js). Dolapta olmayan ya da yuvasına uymayan değer okunurken
// yok sayılır. Baş yuvası boşsa çizim varsayılan pembe fiyonku (saç bandı) gösterir (bebek.js).
// y: mantik.js oku() sonucu + ham 'giyim' alanı, ya da ham belge verisi.
import { URUNLER, dolaptaMi } from './jeton.js';

/** yuva → giyilebilen ürün id'leri. */
export const YUVALAR = Object.freeze({
  bas: Object.freeze(['fiyonk', 'tac', 'sapka']),
  goz: Object.freeze(['gozluk']),
  boyun: Object.freeze(['atki']),
});

const nesne = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});

/** Ürünün yuvası ('bas'|'goz'|'boyun') ya da null (yiyecek, bilinmeyen). */
export function yuvaBul(urun) {
  for (const [yuva, liste] of Object.entries(YUVALAR)) if (liste.includes(urun)) return yuva;
  return null;
}

/** Geçerli giyim: { bas, goz, boyun } (her biri ürün id | null). */
export function giyimOku(y) {
  const g = nesne(y?.giyim);
  const sonuc = {};
  for (const [yuva, liste] of Object.entries(YUVALAR)) {
    const id = g[yuva];
    sonuc[yuva] = typeof id === 'string' && liste.includes(id) && dolaptaMi(y, id) ? id : null;
  }
  return sonuc;
}

/** Giy. -> { yama: { 'giyim.<yuva>': urun } } | { hata: 'bilinmiyor'|'dolapta-yok' }. Yuvadakinin yerine geçer. */
export function giyYamasi(y, { urun } = {}) {
  const yuva = Object.hasOwn(URUNLER, urun ?? '') ? yuvaBul(urun) : null;
  if (!yuva) return { hata: 'bilinmiyor' };
  if (!dolaptaMi(y, urun)) return { hata: 'dolapta-yok' };
  return { yama: { [`giyim.${yuva}`]: urun } };
}

/** Çıkar. -> { yama: { 'giyim.<yuva>': null } } | { hata: 'bilinmiyor' }. */
export function cikarYamasi(y, { yuva } = {}) {
  if (!Object.hasOwn(YUVALAR, yuva ?? '')) return { hata: 'bilinmiyor' };
  return { yama: { [`giyim.${yuva}`]: null } };
}
