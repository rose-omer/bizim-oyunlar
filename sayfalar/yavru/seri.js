// Yavrumuz görev serisi: saf mantık (DOM yok, Node'da test edilir). Görev ödülü gorev.js odulYamasi'nda yazılır.
// Belgede alan: gorevSeri: { n, son: gün, en, telafi?: gün } — n: üst üste tamamlanan gün, en: rekor,
// telafi: affedilen son kaçan gün. Tek kaçan gün haftada bir affedilir. Yalnız görev tamamlanınca yazılır;
// kırık seri okurken 0 görünür. Eski belgede alan yok: 0'dan başlar. Yazım mutlak: iki cihaz aynı tabandan aynı sonucu üretir.
// veri: ham belge verisi ya da mantik.js oku() sonucu.
import { addDays, daysBetween, parseDay } from '../../js/core/gunler.js';

export const GOREV_JETON = 15; // kişi başı, her görev
export const TELAFI_ARALIK = 7; // gün
/** Rekorda bir kez. kiyafet dolapta yoksa bedava gelir; varsa yerine kişi başı jeton. */
export const SERI_ODUL = Object.freeze({
  7: Object.freeze({ jeton: 30 }),
  30: Object.freeze({ kiyafet: 'ayicik', jeton: 100 }),
  100: Object.freeze({ kiyafet: 'pijama', jeton: 150 }),
});

const nesne = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
const sayi = (x) => (Number.isInteger(x) && x > 0 ? x : 0);
const gunMu = (x) => (parseDay(x) ? x : null);

/** Ham alanı güvenli biçime getirir. */
export function seriOku(x) {
  const d = nesne(x);
  return { n: sayi(d.n), son: gunMu(d.son), en: sayi(d.en), telafi: gunMu(d.telafi) };
}

/** Kaçan gün için telafi hakkı var mı (son telafiden bu yana en az TELAFI_ARALIK gün)? */
const telafiVar = (s, kacan) => !s.telafi || daysBetween(s.telafi, kacan) >= TELAFI_ARALIK;

/** Görev o gün tamamlanınca yeni seri kaydı. Aynı gün ve geçmiş gün kaydı değiştirmez. */
export function seriIlerle(veri, gun) {
  const s = seriOku(nesne(veri).gorevSeri);
  const kayit = (n, telafi) => ({ n, son: gun, en: Math.max(s.en, n), ...(telafi ? { telafi } : {}) });
  if (!s.son) return kayit(1, null);
  const fark = daysBetween(s.son, gun);
  if (fark <= 0) return { n: s.n, son: s.son, en: s.en, ...(s.telafi ? { telafi: s.telafi } : {}) };
  if (fark === 1) return kayit(s.n + 1, s.telafi);
  const kacan = addDays(s.son, 1);
  return fark === 2 && telafiVar(s, kacan) ? kayit(s.n + 1, kacan) : kayit(1, s.telafi);
}

/** Bu n için ödül: { jeton } | { kiyafet } | null. dolap: belge alanı. */
export function seriOdulu(n, dolap) {
  const o = Object.hasOwn(SERI_ODUL, n) ? SERI_ODUL[n] : null;
  if (!o) return null;
  return o.kiyafet && !Object.hasOwn(nesne(dolap), o.kiyafet) ? { kiyafet: o.kiyafet } : { jeton: o.jeton };
}

/** Arayüz için: { n (kırıksa 0), en, bugun, telafiBekliyor, sonraki: { gun, kalan } | null }. */
export function seriDurumu(veri, gun) {
  const s = seriOku(nesne(veri).gorevSeri);
  const fark = s.son ? daysBetween(s.son, gun) : Infinity;
  const telafiBekliyor = fark === 2 && telafiVar(s, addDays(s.son, 1));
  const n = fark <= 1 || telafiBekliyor ? s.n : 0;
  const hedef = Object.keys(SERI_ODUL).map(Number).find((g) => g > n);
  return { n, en: s.en, bugun: fark === 0, telafiBekliyor, sonraki: hedef ? { gun: hedef, kalan: hedef - n } : null };
}
