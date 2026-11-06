// Yavrumuz: giydirme (saf mantık, DOM yok, Node'da test edilir).
// Belgede: giyim: { bas?, goz?, boyun?, govde?, agiz?, kucak? } = ürün id | yok. Yama alan düzeyinde: 'giyim.<yuva>'
// (çıkarınca null). Yalnız dolapta olan kıyafet giyilir (dolap: jeton.js). Dolapta olmayan ya da yuvasına uymayan değer
// okunurken yok sayılır. Baş yuvası boşsa çizim varsayılan pembe fiyonku, gövde yuvası boşsa benekli tulumu gösterir (bebek.js).
// Satın alınan kıyafet hemen giyilir: satinAlGiyYamasi tek yama (dolap + giyim) döndürür.
// y: mantik.js oku() sonucu + ham 'giyim' alanı, ya da ham belge verisi.
import { URUNLER, dolaptaMi, satinAl } from './jeton.js';

/** yuva → giyilebilen ürün id'leri. */
export const YUVALAR = Object.freeze({
  bas: Object.freeze(['fiyonk', 'tac', 'sapka', 'noelbant', 'kovasapka', 'bere', 'cicektac']),
  goz: Object.freeze(['gozluk', 'kalpgozluk']),
  boyun: Object.freeze(['atki', 'onluk', 'papyon']),
  govde: Object.freeze(['pijama', 'ayicik', 'elbise', 'ayitulum', 'tavsan', 'yagmurluk', 'noelelbise', 'cileksalopet', 'cilekbodi',
    'firfirbodi', 'lalepijama', 'ciftrenk', 'denizci', 'salopet']),
  agiz: Object.freeze(['emzik', 'yildizemzik']),
  kucak: Object.freeze(['battaniye', 'pelus']),
});

const nesne = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});

/** Ürünün yuvası ('bas'|'goz'|'boyun'|'govde'|'agiz'|'kucak') ya da null (yiyecek, bilinmeyen). */
export function yuvaBul(urun) {
  for (const [yuva, liste] of Object.entries(YUVALAR)) if (liste.includes(urun)) return yuva;
  return null;
}

/** Geçerli giyim: { bas, goz, boyun, govde, agiz, kucak } (her biri ürün id | null). */
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

/**
 * Kıyafeti satın al ve hemen giy (tek yazım). -> satinAl hatası | { yama, kayit }
 * yama = satinAl yaması ('dolap.<id>') + 'giyim.<yuva>': urun. Yiyecekte satinAl sonucu aynen döner.
 */
export function satinAlGiyYamasi(y, { kim, urun, simdi }) {
  const r = satinAl(y, { kim, urun, simdi });
  const yuva = r.hata ? null : yuvaBul(urun);
  if (!yuva) return r;
  return { yama: { ...r.yama, [`giyim.${yuva}`]: urun }, kayit: r.kayit };
}
