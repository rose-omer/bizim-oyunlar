// Mobil uygulama köprüsü (Capacitor). Sahip: Mobil ajanı. Web'de güvenli yedekler.
/** Android uygulamasının içinde mi? */
export function isNative() {
  return !!globalThis.Capacitor?.isNativePlatform?.();
}
/** Titreşim: uygulamada Haptics, tarayıcıda navigator.vibrate (iPhone Safari desteklemez). */
export function titret(desen = 200) {
  try { globalThis.navigator?.vibrate?.(desen); } catch { /* yok */ }
}
/** Cihazda yerel hatırlatıcı planla (yalnız uygulamada). olaylar: [{ id, baslik, metin, zaman: ISO }] */
export async function yerelHatirlaticilar(olaylar) {}
