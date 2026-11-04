// Yavrumuz yaş evreleri: büyük aşamadan sonra 1 ay, 3 ay, 6 ay, 1 yaş (saf mantık, DOM yok, Node'da test edilir).
// Yaş çatlama gününden sayılır. Her evre: unvan + açılan eşya (var olan kıyafet; yeni çizim yok) + kısa sahne (buyume-sahne.js).
// Belgede alan: evre: { [evreId]: { at } }. Eşya evreye dek mağazada kilitli (urunKilidi), evrede 'dolap.<id>' { fiyat: 0 } gelir.
// Daha önce alınmış kıyafet ve bedeli korunur. Yazım mutlak: iki cihaz aynı yamayı yazar. Eski belgede alan yok: yaşı gelince yazılır.
// y: mantik.js oku() sonucu ya da ham belge verisi.
import { durationParts, toDay } from '../../js/core/gunler.js';
import { dogumGunu, SAHNE_SURE } from './mantik.js';

export const EVRELER = Object.freeze([
  Object.freeze({ id: 'ay1', ay: 1, unvan: 'Meraklı minik', urun: 'atki' }),
  Object.freeze({ id: 'ay3', ay: 3, unvan: 'Küçük kâşif', urun: 'gozluk' }),
  Object.freeze({ id: 'ay6', ay: 6, unvan: 'Neşeli yumurcak', urun: 'elbise' }),
  Object.freeze({ id: 'yas1', ay: 12, unvan: 'Evimizin neşesi', urun: 'tac' }),
]);

const nesne = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
const yazildi = (y, id) => Object.hasOwn(nesne(y?.evre), id);

/** Tamamlanan ay sayısı (çatlama gününden). Yumurtada 0. */
export function ayYasi(y, simdi) {
  const g = dogumGunu(y);
  if (!g) return 0;
  const { years, months } = durationParts(g, toDay(new Date(simdi)));
  return years * 12 + months;
}

/** Belgeye yazılmış en yüksek evre | null. */
export function evreSon(y) {
  return [...EVRELER].reverse().find((e) => yazildi(y, e.id)) || null;
}

/**
 * Hak edilen, yazılmamış evreleri belgeye yazan yama. -> null | { yama, evre: en yüksek yeni evre }
 * Küçük aşamada beklerse büyüyünce birikenler birlikte yazılır.
 */
export function evreYamasi(y, { kim, simdi }) {
  if (y?.asama !== 'buyuk') return null;
  const yas = ayYasi(y, simdi);
  const yeni = EVRELER.filter((e) => e.ay <= yas && !yazildi(y, e.id));
  if (!yeni.length) return null;
  const at = new Date(simdi).toISOString();
  const yama = {};
  for (const e of yeni) {
    yama[`evre.${e.id}`] = { at };
    if (!Object.hasOwn(nesne(y.dolap), e.urun)) yama[`dolap.${e.urun}`] = { at, kim, fiyat: 0 };
  }
  return { yama, evre: yeni[yeni.length - 1] };
}

/** Ürün mağazada kilitli mi? -> evre tanımı | null. Dolaptaki ürün kilitli sayılmaz. */
export function urunKilidi(y, urun) {
  if (Object.hasOwn(nesne(y?.dolap), urun)) return null;
  const e = EVRELER.find((x) => x.urun === urun);
  return e && !yazildi(y, e.id) ? e : null;
}

/** Evre sahnesi oynasın mı: son evre, son SAHNE_SURE içinde yazılmış ve bu cihaz görmemiş. -> evre | null */
export function evreSahnesiGerekli(y, gorulen, simdi = Date.now()) {
  const e = evreSon(y);
  if (!e || e.id === gorulen) return null;
  const t = Date.parse(nesne(y.evre)[e.id]?.at);
  return Number.isFinite(t) && simdi - t < SAHNE_SURE ? e : null;
}
