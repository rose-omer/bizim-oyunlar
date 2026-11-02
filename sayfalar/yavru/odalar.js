// Yavrumuz: odalar ve sürükle-bırak bakımın saf parçaları (DOM yok, Node'da test edilir).
// Oda: sekme sırası, kaydırma (swipe) yönü, son oda okuma, ihtiyaç noktası. Oda seçimi belgeye yazılmaz (cihaz başı).
// Sürükleme: istemci noktası → bebek viewBox'ı (bebek.js, 0 0 200 200), ağız ve kutu isabeti, köpük ilerlemesi.
// Eylemin kendisi değişmez: sürükleme bitince app.js var olan eylemTikla yolunu çağırır.
import { DUSUK } from './mantik.js';

/** Sekme sırası. eylemler: odanın eylem düğmeleri (uyut düğmesi uyurken 'uyandir' olur). kisa: sekme yazısı. */
export const ODALAR = Object.freeze([
  Object.freeze({ id: 'mutfak', ad: 'Mutfak', kisa: 'Mutfak', emoji: '🍼', eylemler: Object.freeze(['mama', 'meyve', 'tatli']), ipucu: 'Yemeği ağzına sürükle ya da dokun' }),
  Object.freeze({ id: 'banyo', ad: 'Banyo', kisa: 'Banyo', emoji: '🫧', eylemler: Object.freeze(['yika']), ipucu: 'Sabunu yavrunun üstünde gezdir' }),
  Object.freeze({ id: 'tuvalet', ad: 'Tuvalet', kisa: 'Tuvalet', emoji: '🚽', eylemler: Object.freeze(['lazimlik']), ipucu: 'Yavruyu lazımlığa taşı ya da lazımlığa dokun' }),
  Object.freeze({ id: 'yatak', ad: 'Yatak odası', kisa: 'Yatak', emoji: '🌙', eylemler: Object.freeze(['uyut']), ipucu: '' }),
  Object.freeze({ id: 'oyun', ad: 'Oyun odası', kisa: 'Oyun', emoji: '⚽', eylemler: Object.freeze(['oyna', 'sev']), ipucu: '' }),
]);
export const ODA_IDLERI = Object.freeze(ODALAR.map((o) => o.id));
export const VARSAYILAN_ODA = 'mutfak';
const ODA = Object.fromEntries(ODALAR.map((o) => [o.id, o]));

/** Kayıtlı değer (localStorage) → geçerli oda id'si; bozuksa varsayılan. */
export function odaOku(deger) {
  return typeof deger === 'string' && Object.hasOwn(ODA, deger) ? deger : VARSAYILAN_ODA;
}

/** Oda tanımı (bilinmeyen id: varsayılan oda). */
export const odaTanimi = (id) => ODA[odaOku(id)];

/** Eylemin odası (uyandir → yatak; ilac her odada: null). */
export function eylemOdasi(eylem) {
  const e = eylem === 'uyandir' ? 'uyut' : eylem;
  return ODALAR.find((o) => o.eylemler.includes(e))?.id ?? null;
}

/** Komşu oda: yon +1 sonraki, -1 önceki. Uçta null (dolanmaz). */
export function komsuOda(id, yon) {
  const i = ODA_IDLERI.indexOf(odaOku(id)) + Math.sign(yon);
  return i >= 0 && i < ODA_IDLERI.length ? ODA_IDLERI[i] : null;
}

export const KAYDIRMA_ESIK = 48; // px
/**
 * Yatay kaydırma → oda yönü. Parmak sola giderse (dx < 0) sonraki oda (+1), sağa giderse önceki (-1).
 * Yatay hareket eşiği geçmeli ve dikeyin 1.5 katından büyük olmalı (sayfa kaydırması sayılmasın); değilse 0.
 */
export function kaydirmaYonu(dx, dy, esik = KAYDIRMA_ESIK) {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return 0;
  if (Math.abs(dx) < esik || Math.abs(dx) <= Math.abs(dy) * 1.5) return 0;
  return dx < 0 ? 1 : -1;
}

/**
 * İhtiyacı olan odalar (sekmede küçük nokta). ihtiyac: mantik.js ihtiyaclar(); cisVar: tuvalet.js tuvaletDurumu.
 * Uyurken yalnız yemek ve temizlik noktası kalır (uyku, oyun ve tuvalet uyanınca).
 */
export function odaNoktalari({ ihtiyac = {}, cisVar = false, uyuyor = false } = {}) {
  const az = (ad) => Number.isFinite(ihtiyac[ad]) && ihtiyac[ad] < DUSUK;
  const n = [];
  if (az('tokluk')) n.push('mutfak');
  if (az('temizlik')) n.push('banyo');
  if (cisVar && !uyuyor) n.push('tuvalet');
  if (az('enerji') && !uyuyor) n.push('yatak');
  if (az('mutluluk') && !uyuyor) n.push('oyun');
  return n;
}

// ---------- Sürükleme ----------

export const SURUKLE_ESIK = 8; // px: bundan az hareket dokunuştur (tık yolu çalışır)
/** Basılı tutup bu kadar kayınca sürükleme başlar. */
export const surukleBasladi = (dx, dy, esik = SURUKLE_ESIK) => Math.hypot(dx, dy) >= esik;

/** İstemci noktası → bebek viewBox'ı (0..200). kutu: SVG'nin getBoundingClientRect(). Kutu bozuksa null. */
export function vbNokta(x, y, kutu) {
  if (!kutu || !(kutu.width > 0) || !(kutu.height > 0)) return null;
  return { x: ((x - kutu.left) / kutu.width) * 200, y: ((y - kutu.top) / kutu.height) * 200 };
}

/** Ağız merkezi ve isabet yarıçapı (viewBox): bebek.js yüz konumu + ağız y 27 (küçükte ölçek 0.72). */
export const AGIZ = Object.freeze({
  buyuk: Object.freeze({ x: 100, y: 102, r: 26 }),
  kucuk: Object.freeze({ x: 100, y: 117.5, r: 22 }),
});
/** Ağza uzaklık / yarıçap (1 = kenar). Aşama bilinmiyorsa Infinity. */
export function agizUzaklik(nokta, asama) {
  const a = Object.hasOwn(AGIZ, asama) ? AGIZ[asama] : null;
  if (!a || !nokta) return Infinity;
  return Math.hypot(nokta.x - a.x, nokta.y - a.y) / a.r;
}
export const agizIsabet = (nokta, asama) => agizUzaklik(nokta, asama) <= 1;
/** Ağız açılır: yiyecek ağza yaklaşınca (yarıçapın 2.2 katı). */
export const agizYakin = (nokta, asama) => agizUzaklik(nokta, asama) <= 2.2;

/** Nokta kutunun içinde mi (pay: her yandan genişletme, px). */
export function kutuIsabet(x, y, kutu, pay = 0) {
  if (!kutu || !Number.isFinite(x) || !Number.isFinite(y)) return false;
  return x >= kutu.left - pay && x <= kutu.left + kutu.width + pay && y >= kutu.top - pay && y <= kutu.top + kutu.height + pay;
}

// ---------- Köpük (banyo) ----------

export const KOPUK_YOL = 700; // viewBox birimi: sabun yavrunun üstünde bu kadar gezince köpük tamam
export const KABARCIK_ARALIK = 40; // bu kadar yolda bir kabarcık
export const KOPUK_ADIM = 50; // tek harekette en çok sayılan yol (sıçrama ya da ilk temas yolu şişirmesin)

export const kopukBaslat = () => ({ yol: 0, son: null });

/**
 * Sabun hareketi. nokta: viewBox noktası; ustunde: bebeğin üstünde mi (dokunma.js bolgeBul !== null).
 * Yol yalnız üstündeyken ve önceki nokta da üstündeyken birikir. -> { k (yeni durum), yeni (eklenecek kabarcık sayısı) }
 */
export function kopukIlerle(k, nokta, ustunde) {
  const onceki = k?.yol > 0 ? k.yol : 0;
  if (!nokta || !ustunde) return { k: { yol: onceki, son: null }, yeni: 0 };
  const adim = k?.son ? Math.min(KOPUK_ADIM, Math.hypot(nokta.x - k.son.x, nokta.y - k.son.y)) : 0;
  const yol = Math.min(KOPUK_YOL, onceki + adim);
  const yeni = Math.floor(yol / KABARCIK_ARALIK) - Math.floor(onceki / KABARCIK_ARALIK);
  return { k: { yol, son: { x: nokta.x, y: nokta.y } }, yeni };
}

/** Köpük oranı 0..1. */
export const kopukOrani = (k) => Math.min(1, Math.max(0, (k?.yol || 0) / KOPUK_YOL));
export const kopukTamam = (k) => kopukOrani(k) >= 1;
