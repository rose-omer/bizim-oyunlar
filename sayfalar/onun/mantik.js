// Onun Hakkında: saf mantık (DOM yok; Node'da test edilir). Tür 'bilgi', id = clientId (SOZLESME §26).
// Her kişi yalnız kendi belgesini yazar, alan düzeyinde (veri.js patch). data: { <alan>: metin, sorular?: { <alan>: ISO } }
// sorular = benim sevgilime sorduklarım ("Sor" düğmesi); karşı taraf kendi kartında "merak ediyor" olarak görür.

export const KISA_MAX = 60;
export const UZUN_MAX = 400;
export const SORU_ARALIK_MS = 24 * 60 * 60 * 1000; // aynı alan günde bir kez sorulur

export const GRUPLAR = [
  { id: 'olcu', ad: 'Ölçüler' },
  { id: 'sevdikleri', ad: 'Sevdikleri' },
  { id: 'dikkat', ad: 'Dikkat' },
  { id: 'hayal', ad: 'Hayaller ve notlar' },
];

/**
 * merak: "Ömer … merak ediyor" cümlesinde (2. tekil iyelik), yazdi: "Gül … yazdı" cümlesinde (3. tekil iyelik).
 * uzun: çok satırlı alan. sorulur: "Sor" düğmesi var mı.
 */
export const ALANLAR = [
  { id: 'ust', grup: 'olcu', emoji: '👕', ad: 'Üst beden', ipucu: 'ör. M ya da 38', merak: 'üst beden ölçünü', yazdi: 'üst beden ölçüsünü' },
  { id: 'alt', grup: 'olcu', emoji: '👖', ad: 'Alt beden', ipucu: 'ör. 30/32 ya da 38', merak: 'alt beden ölçünü', yazdi: 'alt beden ölçüsünü' },
  { id: 'ayakkabi', grup: 'olcu', emoji: '👟', ad: 'Ayakkabı', ipucu: 'ör. 39', merak: 'ayakkabı numaranı', yazdi: 'ayakkabı numarasını' },
  { id: 'yuzuk', grup: 'olcu', emoji: '💍', ad: 'Yüzük ölçüsü', ipucu: 'ör. 14 ya da 54 mm', merak: 'yüzük ölçünü', yazdi: 'yüzük ölçüsünü' },
  { id: 'cicek', grup: 'sevdikleri', emoji: '💐', ad: 'Çiçek', ipucu: 'ör. Papatya', merak: 'sevdiğin çiçeği', yazdi: 'sevdiği çiçeği' },
  { id: 'renk', grup: 'sevdikleri', emoji: '🎨', ad: 'Renk', ipucu: 'ör. Lavanta moru', merak: 'sevdiğin rengi', yazdi: 'sevdiği rengi' },
  { id: 'yemek', grup: 'sevdikleri', emoji: '🍝', ad: 'Yemek', ipucu: 'ör. Mantı', merak: 'sevdiğin yemeği', yazdi: 'sevdiği yemeği' },
  { id: 'tatli', grup: 'sevdikleri', emoji: '🍰', ad: 'Tatlı', ipucu: 'ör. Fırın sütlaç', merak: 'sevdiğin tatlıyı', yazdi: 'sevdiği tatlıyı' },
  { id: 'icecek', grup: 'sevdikleri', emoji: '☕', ad: 'Kahve siparişi', ipucu: 'ör. Yulaf sütlü latte, şekersiz', merak: 'kahve siparişini', yazdi: 'kahve siparişini' },
  { id: 'markalar', grup: 'sevdikleri', emoji: '🛍️', ad: 'Markalar ve parfüm', ipucu: 'Sevdiğin markalar, kokular', merak: 'sevdiğin markaları', yazdi: 'sevdiği markaları', uzun: true },
  { id: 'sevmedikleri', grup: 'dikkat', emoji: '🙅', ad: 'Sevmedikleri', ipucu: 'ör. Kişniş, korku filmleri', merak: 'sevmediklerini', yazdi: 'sevmediklerini', uzun: true },
  { id: 'alerji', grup: 'dikkat', emoji: '🌿', ad: 'Alerjiler', ipucu: 'ör. Fıstık, polen', merak: 'alerjilerini', yazdi: 'alerjilerini', uzun: true },
  { id: 'hediye', grup: 'hayal', emoji: '🎁', ad: 'Hayalindeki hediye', ipucu: 'Bir gün alınsa çok sevinirdim dediğin şey', merak: 'hayalindeki hediyeyi', yazdi: 'hayalindeki hediyeyi', uzun: true },
  { id: 'not', grup: 'hayal', emoji: '📝', ad: 'Not', ipucu: 'Bilmesini istediğin başka bir şey', uzun: true },
].map((a) => ({ ...a, sorulur: !!a.merak }));

export function alanById(id) {
  return ALANLAR.find((a) => a.id === id) || null;
}

/** Belgedeki alan değeri (kırpılmış) | ''. */
export function deger(data, id) {
  const v = data && typeof data === 'object' ? data[id] : null;
  return typeof v === 'string' ? v.trim() : '';
}

/** Kaç alan dolu (yalnız bilinen alanlar). */
export function doluSayisi(data) {
  return ALANLAR.reduce((n, a) => n + (deger(data, a.id) ? 1 : 0), 0);
}

/** Girdi → kaydedilecek metin | null (boş). Uzunluk sınırlanır, art arda boş satırlar teke iner. */
export function temizle(id, metin) {
  const a = alanById(id);
  let s = String(metin ?? '').replace(/\r\n?/g, '\n').trim();
  if (a?.uzun) s = s.replace(/\n{3,}/g, '\n\n');
  else s = s.replace(/\s+/g, ' ');
  if (!s) return null;
  const max = a?.uzun ? UZUN_MAX : KISA_MAX;
  const harfler = [...s];
  return harfler.length > max ? harfler.slice(0, max).join('').trim() : s;
}

/** Tek alanın yaması (boş → null: alan silinir). */
export function alanYamasi(id, metin) {
  if (!alanById(id)) throw new Error(`Bilinmeyen alan: ${id}`);
  return { [id]: temizle(id, metin) };
}

/** "Sor" kaydı: kendi belgeme sorular.<alan> = ISO. */
export function soruYamasi(id, simdi = Date.now()) {
  if (!alanById(id)?.sorulur) throw new Error(`Sorulamaz alan: ${id}`);
  return { [`sorular.${id}`]: new Date(simdi).toISOString() };
}

const ad = (s) => String(s || '').trim() || 'Sevgilin';

/** 'Ömer ayakkabı numaranı merak ediyor 👟' */
export function soruMetni(soranAd, id) {
  const a = alanById(id);
  return `${ad(soranAd)} ${a?.merak || 'bir şeyi'} merak ediyor ${a?.emoji || '💝'}`;
}

/** 'Gül ayakkabı numarasını yazdı 👟' */
export function cevapMetni(yazanAd, id) {
  const a = alanById(id);
  return `${ad(yazanAd)} ${a?.yazdi || 'kartını'} yazdı ${a?.emoji || '💝'}`;
}

/** Aynı alanı yeniden sorabilir miyim? (hiç sorulmadıysa ya da 1 günden eskiyse) */
export function sorabilirMi(sorulanIso, simdi = Date.now()) {
  const t = Date.parse(sorulanIso);
  return !Number.isFinite(t) || simdi - t > SORU_ARALIK_MS;
}

/** Partner bu alanı sordu ve benim alanım hâlâ boş mu? */
export function merakEdiyorMu(partnerData, benimData, id) {
  return !!partnerData?.sorular?.[id] && !deger(benimData, id);
}
