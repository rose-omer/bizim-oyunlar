// Yavrumuz: kişilik (saf mantık, DOM yok). Çatlama anında bir kez seçilir, belgeye yazılır:
//   yavru.kisilik = 'obur'|'uykucu'|'neseli'|'titiz'  (eski belgelerde yok → kişiliksiz, etki yok)
// Seçim yumurtanın ısıtma geçmişinden: her geçerli ısıtma, Türkiye saatindeki dilimine bir puan verir.
// En çok puan alan kazanır; eşitlikte oda kimliğinden tohum. Aynı belge → aynı kişilik (iki cihaz).
// Etki küçük: bazı ihtiyaçların düşüşü ×0.8–1.25; favori yiyecek ek mutluluk verir.
// mantik.js'ten import YOK: mantik.js bu modülü içe alabilsin (döngü olmasın).
import { hashStr } from '../gunun-sorusu/mantik.js';

/** Saat dilimleri cihazdan bağımsız olsun diye sabit Türkiye saati (UTC+3, yaz saati yok). */
export const TR_SAAT_FARK = 3 * 60 * 60_000;
export const FAVORI_BONUS = 5; // favori yiyecekte ek mutluluk
const ISITMA_ARALIK = 10 * 60_000; // mantik.js ISITMA_ARALIK ile aynı (testte denetlenir)

/** carpan: { ihtiyac: düşüş çarpanı } (yazılmayan ihtiyaç 1). favori: EYLEMLER yiyecek anahtarı. */
export const KISILIKLER = Object.freeze({
  obur: Object.freeze({
    ad: 'Obur', emoji: '😋', aciklama: 'Çabuk acıkır, yemek görünce keyfi yerine gelir.',
    favori: 'mama', carpan: Object.freeze({ tokluk: 1.25, mutluluk: 0.9 }),
  }),
  uykucu: Object.freeze({
    ad: 'Uykucu', emoji: '😴', aciklama: 'Çabuk yorulur, ama pek kirlenmez.',
    favori: 'tatli', carpan: Object.freeze({ enerji: 1.25, temizlik: 0.9 }),
  }),
  neseli: Object.freeze({
    ad: 'Neşeli', emoji: '😄', aciklama: 'Keyfi uzun sürer, oynadıkça enerjisi tükenir.',
    favori: 'meyve', carpan: Object.freeze({ mutluluk: 0.8, enerji: 1.15 }),
  }),
  titiz: Object.freeze({
    ad: 'Titiz', emoji: '🧼', aciklama: 'Temizliğe düşkün, azla yetinir.',
    favori: 'meyve', carpan: Object.freeze({ temizlik: 1.25, tokluk: 0.9 }),
  }),
});
export const KISILIK_ADLARI = Object.freeze(Object.keys(KISILIKLER));

const has = (k) => typeof k === 'string' && Object.hasOwn(KISILIKLER, k);

/** Türkiye saatine göre dilim → kişilik: gece uykucu, sabah titiz, öğle neşeli, akşam obur. */
function dilim(ms) {
  const sa = new Date(ms + TR_SAAT_FARK).getUTCHours();
  if (sa >= 22 || sa < 6) return 'uykucu';
  if (sa < 12) return 'titiz';
  if (sa < 18) return 'neseli';
  return 'obur';
}

/** Kişinin geçerli ısıtma anları (mantik.js isitmaSayisi kuralı: 10 dakikadan sıkı tek sayılır). */
function gecerliIsitmalar(liste) {
  const zamanlar = (Array.isArray(liste) ? liste : [])
    .map((s) => (typeof s === 'string' ? Date.parse(s) : NaN))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const out = [];
  for (const t of zamanlar) if (!out.length || t - out[out.length - 1] >= ISITMA_ARALIK) out.push(t);
  return out;
}

/** Isıtma geçmişinden kişilik puanları: { obur, uykucu, neseli, titiz }. Sıra bağımsız. */
export function kisilikPuanlari(y) {
  const puan = Object.fromEntries(KISILIK_ADLARI.map((k) => [k, 0]));
  const isitma = y?.isitma && typeof y.isitma === 'object' ? y.isitma : {};
  for (const liste of Object.values(isitma)) for (const t of gecerliIsitmalar(liste)) puan[dilim(t)]++;
  return puan;
}

/** Çatlama anındaki belgeden kişilik. Eşitlikte (hiç ısıtma yoksa dördü eşit) oda kimliği seçer. */
export function kisilikSec(y, roomId) {
  const puan = kisilikPuanlari(y);
  const enCok = Math.max(...Object.values(puan));
  const adaylar = KISILIK_ADLARI.filter((k) => puan[k] === enCok);
  return adaylar[hashStr(`yavru-kisilik:${roomId ?? ''}`) % adaylar.length];
}

/** İhtiyacın düşüş çarpanı (0.8–1.25). Kişiliksiz ya da tanımsızsa 1. */
export function kisilikCarpan(kisilik, ihtiyac) {
  if (!has(kisilik)) return 1;
  const c = KISILIKLER[kisilik].carpan;
  return Object.hasOwn(c, ihtiyac) ? c[ihtiyac] : 1;
}

/** Favori yiyecekte ek mutluluk (FAVORI_BONUS), değilse 0. */
export function favoriBonus(kisilik, eylem) {
  return has(kisilik) && KISILIKLER[kisilik].favori === eylem ? FAVORI_BONUS : 0;
}

/** Belgedeki değeri doğrular: geçerli ad ya da null (eski/bozuk belge kişiliksiz kalır). */
export function kisilikOku(deger) {
  return has(deger) ? deger : null;
}
