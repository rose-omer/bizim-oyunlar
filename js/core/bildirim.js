// Anlık bildirim (Web Push). Sahip: Sunucu ajanı. Şimdilik yer tutucu.
/** -> 'var' | 'ana-ekran-gerek' (iPhone'da Safari sekmesi) | 'yok' */
export function bildirimDestegi() { return 'yok'; }
/** -> 'acik' | 'kapali' | 'engelli' | 'yok' */
export async function bildirimDurumu() { return 'yok'; }
/** Kullanıcı tıklamasıyla çağrılır: izin ister, aboneliği kaydeder. -> başarılı mı */
export async function bildirimAc(roomId) { return false; }
export async function bildirimKapat(roomId) {}
/** Partnerin cihazlarına bildirim. Hata fırlatmaz. tur: 'dokunus'|'mesaj'|'mektup'|'ani'|'gun'|'oyun'|'soru'|'liste'|'izle' */
export async function bildir(roomId, { tur, baslik, metin, url } = {}) {}
