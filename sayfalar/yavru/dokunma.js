// Yavrumuz: bebeğe dokunma tepkileri (saf mantık, DOM yok, Node'da test edilir).
// Tepki geçici görsel durumdur: belgeye yazılmaz. Yalnız baş okşama ve karın gıdıklama var olan 'sev'
// eylemini dener (sev: true; bekleme ve günlük puan sınırı mantik.js eylemYap'ta). Yumurtada ve uykuda yok (app.js).
// Koordinatlar bebek.js viewBox'ında (0 0 200 200): büyükte yüz merkezi (100, 75), küçükte (100, 98) × 0.72.

export const DURTME_PENCERE = 3000; // bu süre içinde
export const DURTME_SINIR = 6; // bu kadar dokunuş (bu dahil) → ağlar

const elips = (cx, cy, rx, ry) => (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
const daire = (cx, cy, r) => elips(cx, cy, r, r);
const ya = (...l) => (x, y) => l.some((f) => f(x, y));

// Sıra önemli: küçük bölgeler önce (burun yanağın, el karnın üstünde).
const BOLGE_SEKIL = {
  buyuk: [
    ['burun', daire(100, 89.5, 7)],
    ['yanak', ya(elips(69, 93, 12, 9), elips(131, 93, 12, 9))],
    ['el', ya(daire(67, 160, 11), daire(133, 160, 11))],
    ['ayak', ya(daire(86, 176, 12), daire(114, 176, 12))],
    ['bas', (x, y) => y <= 118 && elips(100, 66, 58, 54)(x, y)],
    ['karin', elips(100, 148, 46, 36)],
  ],
  kucuk: [
    ['burun', daire(100, 108.4, 5.5)],
    ['yanak', ya(daire(77.7, 111, 8.5), daire(122.3, 111, 8.5))],
    ['bas', (x, y) => y <= 132 && elips(100, 92, 50, 48)(x, y)],
    ['karin', elips(100, 156, 54, 28)],
  ],
};

const KISAYOL_SIRA = ['bas', 'karin', 'yanak', 'burun', 'el', 'ayak'];

/** Aşamanın dokunulabilir bölgeleri, klavye kısayolu sırasıyla (okşa ve gıdıkla önce). Yumurtada []. */
export function bolgeler(asama) {
  const var_ = new Set((BOLGE_SEKIL[asama] || []).map(([ad]) => ad));
  return KISAYOL_SIRA.filter((ad) => var_.has(ad));
}

/** (x, y) viewBox noktası hangi bölgede? -> 'bas'|'burun'|'yanak'|'karin'|'el'|'ayak' | null */
export function bolgeBul(x, y, asama) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  for (const [ad, icinde] of BOLGE_SEKIL[asama] || []) if (icinde(x, y)) return ad;
  return null;
}

/** Klavye ve ekran okuyucu kısayolunun adı. */
export const BOLGE_ADI = Object.freeze({
  bas: 'Başını okşa', karin: 'Karnını gıdıkla', burun: 'Burnuna dokun', yanak: 'Yanağını sık', el: 'Elini salla', ayak: 'Ayağını salla',
});

// ruh: bebek.js ifadesi; sure: ms; animasyon: style.css data-dokunma değeri; metin: sahne altı (aria-live).
const TEPKILER = {
  karin: { ruh: 'kahkaha', sure: 1800, animasyon: 'gidik', sev: true, metin: 'Kıkır kıkır! 😆' },
  bas: { ruh: 'huzur', sure: 2200, animasyon: 'oksa', sev: true, metin: 'Gözlerini kapadı, keyfi yerinde ☺️' },
  burun: { ruh: 'hapsu', sure: 1200, animasyon: 'hapsu', sev: false, metin: 'Hapşu! 🤧' },
  yanak: { ruh: 'sasirma', sure: 1400, animasyon: 'sik', sev: false, metin: 'Yanakları sıkıldı, şaşırdı 😮' },
  el: { ruh: 'mutlu', sure: 1600, animasyon: 'salla', sev: false, metin: 'El salladı 👋' },
  ayak: { ruh: 'mutlu', sure: 1600, animasyon: 'salla', sev: false, metin: 'Ayaklarını salladı' },
};
const AGLAMA = { ruh: 'aglama', sure: 4000, animasyon: 'agla', sev: false, metin: 'Çok dürttük, ağladı 😢' };

/** Bu dokunuşla birlikte son DURTME_PENCERE içinde DURTME_SINIR ya da daha çok dokunuş var mı? gecmis: önceki anlar (ms). */
export function cokDurtuldu(gecmis, simdi) {
  const n = (Array.isArray(gecmis) ? gecmis : []).filter((t) => Number.isFinite(t) && t <= simdi && simdi - t < DURTME_PENCERE).length;
  return n + 1 >= DURTME_SINIR;
}

/** Geçmişe bu dokunuşu ekler; pencere dışını atar. -> yeni dizi */
export function gecmisEkle(gecmis, simdi) {
  const l = (Array.isArray(gecmis) ? gecmis : []).filter((t) => Number.isFinite(t) && t <= simdi && simdi - t < DURTME_PENCERE);
  return [...l, simdi].slice(-DURTME_SINIR * 2);
}

/**
 * Geçici tepki. bolge: bolgeBul sonucu; gecmis: bu dokunuştan önceki anlar (ms).
 * -> { bolge, ruh, sure, animasyon, sev, metin } | null (bölge yok)
 * Art arda çok dürtme (3 sn'de 6+) bölgeden bağımsız ağlatır; ağlarken sev denenmez.
 */
export function tepki(bolge, gecmis, simdi) {
  if (!Object.hasOwn(TEPKILER, bolge ?? '')) return null;
  return { bolge, ...(cokDurtuldu(gecmis, simdi) ? AGLAMA : TEPKILER[bolge]) };
}
