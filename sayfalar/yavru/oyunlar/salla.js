// Birlikte Salla: saf mantık (DOM yok, rastgele yok, Node'da test edilir).
// Işık sağa sola gider; ortadan her geçişi bir vuruştur (b: 0, 1, 2...). İki cihaz aynı formülle (indeks → süre) ilerler.
// Saat karşılaştırma yok: isabet her cihazda yerel hesaplanır, cihazlar yalnız vuruş indeksini eşleştirir.
// Puan: isabet +1; ikiniz de aynı vuruşu tutturursanız o vuruş toplam +2 (uyum). 35 vuruşta en çok 70;
// ikiniz de %80 tutturursanız ≈ 50 puan. Birikimli +3 olsaydı aynı oyun ≈ 73 eder ve jeton sınırına takılırdı.
// Fazlar: bekle → oyun → bitti. bekle fazında süre akmaz.

export const SURE = 30000;
export const VURUS_SAYISI = 35; // son vuruş 29150. ms: geç gelen eş mesajına bitişe kadar zaman kalır
export const PENCERE = 180;
export const PENCERE_YAVAS = 260;
export const PUAN_ISABET = 1;
export const PUAN_UYUM = 2; // uyumlu vuruşun toplamı
export const BASLA_YINELE_MS = 10000; // lider bu süreye kadar kaybolan 'basla' mesajını yineler
const ILK_ARA = 1000;
const SON_ARA = 700;
const AZALMA = 10;

/** b. vuruşa varan aralık (ms): 1000'den 10'ar iner, 30. vuruştan sonra 700. */
export const araMs = (b) => Math.max(SON_ARA, ILK_ARA - b * AZALMA);

/** b. vuruşun oyun içi anı (ms). Oyun başı (t = 0) sayılmayan bir ortadan geçiştir. */
export function vurusZamani(b) {
  let t = 0;
  for (let i = 0; i <= b; i++) t += araMs(i);
  return t;
}

export function yeni({ yavas = false } = {}) {
  return {
    faz: 'bekle', t: 0, skor: 0, isabet: 0, uyum: 0, pencere: yavas ? PENCERE_YAVAS : PENCERE,
    sira: 0, // sıradaki vuruş
    oncekiT: 0, // bir önceki ortadan geçişin anı
    vurulan: new Set(), isabetler: new Set(), esIsabet: new Set(), olaylar: [],
  };
}

/** Oyunu başlatır. Yalnız bekle fazından geçer; başladıysa true. */
export function basla(s) {
  if (s.faz !== 'bekle') return false;
  s.faz = 'oyun';
  s.olaylar.push({ tur: 'faz', faz: 'oyun' });
  return true;
}

/** Zamanı ilerletir (dt ms, en çok 100). Vuruşlar ve bitiş s.olaylar'a eklenir. */
export function adim(s, dt) {
  if (s.faz !== 'oyun') return s;
  s.t = Math.min(SURE, s.t + Math.min(100, Math.max(0, dt)));
  while (s.t >= s.oncekiT + araMs(s.sira)) {
    s.oncekiT += araMs(s.sira);
    if (s.sira < VURUS_SAYISI) s.olaylar.push({ tur: 'vurus', b: s.sira });
    s.sira++;
  }
  if (s.t >= SURE) {
    s.faz = 'bitti';
    s.olaylar.push({ tur: 'faz', faz: 'bitti' });
  }
  return s;
}

/** Şu ana en yakın vuruş ve ona uzaklık (ms). b geçersiz olabilir (ilk yarım aralıkta -1, sonda VURUS_SAYISI). */
function yakin(s) {
  const sonraki = s.oncekiT + araMs(s.sira);
  return s.t - s.oncekiT < sonraki - s.t
    ? { b: s.sira - 1, fark: s.t - s.oncekiT }
    : { b: s.sira, fark: sonraki - s.t };
}

const hakVar = (s, b) => s.faz === 'oyun' && b >= 0 && b < VURUS_SAYISI && !s.vurulan.has(b);

function uyumYaz(s, b) {
  s.uyum++;
  s.skor += PUAN_UYUM - PUAN_ISABET;
  s.olaylar.push({ tur: 'uyum', b });
}

/** Dokunuş. Vuruş başına bir kez sayılır. -> { b, isabet } | null. Pencere dışı dokunuş cezasızdır, o vuruşun hakkı gider. */
export function vur(s) {
  const { b, fark } = yakin(s);
  if (!hakVar(s, b)) return null;
  s.vurulan.add(b);
  const isabet = fark <= s.pencere;
  if (!isabet) {
    s.olaylar.push({ tur: 'kacti', b });
    return { b, isabet };
  }
  s.isabet++;
  s.skor += PUAN_ISABET;
  s.isabetler.add(b);
  s.olaylar.push({ tur: 'isabet', b });
  if (s.esIsabet.has(b)) uyumYaz(s, b);
  return { b, isabet };
}

/** Eşin dokunuşu. Ağdan gelir: geçersizi yok sayar. Bu çağrı uyum yazdıysa true. */
export function esVurdu(s, { b, isabet } = {}) {
  if (s.faz === 'bitti' || !Number.isInteger(b) || b < 0 || b >= VURUS_SAYISI) return false;
  if (isabet !== true || s.esIsabet.has(b)) return false;
  s.esIsabet.add(b);
  s.olaylar.push({ tur: 'es', b });
  if (!s.isabetler.has(b)) return false;
  uyumYaz(s, b);
  return true;
}

/**
 * El sıkışma mesajı ('hazir' | 'basla'). -> karşıya 'basla' gönderilmeli mi.
 * Lider hazir görünce başlar; oyunun başında hazir sürerse basla kaybolmuştur, yineler.
 * Oyunun geç anındaki hazir karşının yeni oyunudur: yanıtlanmaz, iki oyun birbirine karışmaz.
 */
export function elSikis(s, a, lider) {
  if (a === 'basla') { basla(s); return false; }
  if (a !== 'hazir' || !lider) return false;
  return basla(s) || (s.faz === 'oyun' && s.t < BASLA_YINELE_MS);
}

/** Işık konumu: -1 (sol uç) .. 1 (sağ uç); 0 ortada. Her vuruşta ortadan geçip öbür yana sürer. */
export function isik(s) {
  const yon = s.sira % 2 === 0 ? 1 : -1;
  return yon * Math.sin(Math.PI * (s.t - s.oncekiT) / araMs(s.sira));
}

/** Hedef bölgenin yarı genişliği (ışık konumu birimiyle): ışık bu bölgedeyken dokunuş isabettir. */
export const hedefYari = (s) => Math.sin(Math.PI * s.pencere / araMs(s.sira));

/** Şimdi dokunsa isabet olur mu? Hak kullanılınca söner. */
export function pencerede(s) {
  const { b, fark } = yakin(s);
  return hakVar(s, b) && fark <= s.pencere;
}

export const kalanMs = (s) => SURE - s.t;
