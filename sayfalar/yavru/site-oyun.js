// Yavrumuz: sitedeki iki kişilik oyunların jeton ödülü (saf mantık, DOM yok, Node'da test edilir).
// Biten oyunda iki taraf da kendi sayacına yazar (jeton.js jetonKazan, 'jeton.<clientId>'): iki yazım çakışmaz.
// Kısa oyunla jeton kasılmasın diye kişi başı, oyun başı günde OYUN_HAK ödül. Günlük jeton sınırı (jeton.js) aynen geçerli.
// Hak sayacı sayaçla birlikte durur: jeton.<clientId>.oyunHak = { gun, sayi: { [oyun]: n } }.
// Yazımı js/core/oyun-odul.js yapar. y: mantik.js oku() sonucu ya da ham belge verisi.
import { toDay } from '../../js/core/gunler.js';
import { jetonKaydi, jetonKazan } from './jeton.js';

export const SITE_OYUNLARI = Object.freeze(['amiral', 'dama', 'dorttas', 'satranc', 'tavla', 'pisti', 'duello', 'kelime', 'sudoku',
  'hafiza', 'ciz', 'yapboz', 'tanis', 'aynikafa', 'kimdaha', 'hicyaptin', 'derin', 'dogruluk', 'mangala', 'kutu', 'reversi', 'hikaye']);
/** kazan/kayip/beraber: rekabet; ortak: takım oyunu. */
export const SITE_ODUL = Object.freeze({ kazan: 20, beraber: 15, kayip: 12, ortak: 15 });
export const OYUN_HAK = 3;

const nesne = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});

/** Bugünkü sayaçlar: { [oyun]: n }. Eski güne ait kayıt boş sayılır. */
function bugunku(y, kim, simdi) {
  const h = nesne(jetonKaydi(y, kim).oyunHak);
  return h.gun === toDay(new Date(simdi)) ? nesne(h.sayi) : {};
}

/** Kişinin bu oyundan bugün alabileceği ödül sayısı. */
export function kalanOyunHakki(y, kim, oyun, simdi) {
  const n = bugunku(y, kim, simdi)[oyun];
  return Math.max(0, OYUN_HAK - (Number.isFinite(n) ? n : 0));
}

/**
 * Biten oyunun ödülü. -> { hata: 'gecersiz'|'hak'|'sinir' } | { yama, eklenen, kalanHak }
 * Günlük sınıra takılırsa hak harcanmaz.
 */
export function siteOyunYamasi(y, { kim, oyun, sonuc, simdi }) {
  if (!SITE_OYUNLARI.includes(oyun) || !Object.hasOwn(SITE_ODUL, sonuc ?? '')) return { hata: 'gecersiz' };
  if (typeof kim !== 'string' || !kim) return { hata: 'gecersiz' };
  const kalan = kalanOyunHakki(y, kim, oyun, simdi);
  if (kalan <= 0) return { hata: 'hak' };
  const r = jetonKazan(y, { kim, kaynak: 'oyun', miktar: SITE_ODUL[sonuc], simdi });
  if (r.hata) return r.hata === 'sinir' ? { hata: 'sinir' } : { hata: 'gecersiz' };
  const sayi = bugunku(y, kim, simdi);
  const anahtar = `jeton.${kim}`;
  const oyunHak = { gun: toDay(new Date(simdi)), sayi: { ...sayi, [oyun]: OYUN_HAK - kalan + 1 } };
  return { yama: { [anahtar]: { ...r.yama[anahtar], oyunHak } }, eklenen: r.eklenen, kalanHak: kalan - 1 };
}
