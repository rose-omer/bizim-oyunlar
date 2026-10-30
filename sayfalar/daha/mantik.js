// "Daha" sayfasının saf mantığı (Node'da test edilir; DOM yok).

export const APK_URL = 'https://github.com/rose-omer/bizim-oyunlar/releases/latest/download/BizIkimiz.apk';

/** iPhone'da ana ekrana ekleme adımları (Daha ve Ayarlar > Bildirimler kullanır). İlk adımın yanına Paylaş simgesi çizilir. */
export const IOS_ADIMLARI = [
  'Safari\'de alttaki Paylaş düğmesine dokun.',
  'Listeden “Ana Ekrana Ekle”yi seç.',
  'Sağ üstte “Ekle”ye dokun.',
];

/** Kutucuk olarak gösterilecek sayfalar: hepsi, 'biz' ve 'daha' hariç; kayıt sırası korunur. */
export function dahaOgeleri(sayfalar) {
  return (sayfalar || []).filter((s) => s && s.path && s.id !== 'biz' && s.id !== 'daha');
}

/** APK bağlantısı yalnız Android tarayıcıda (uygulamanın içinde değil). */
export function apkGoster(ua, native) {
  return !native && /Android/i.test(String(ua || ''));
}

/** Kurulum kartı: 'kurulabilir' | 'ios-elle' | null (gizle). Uygulamanın içindeyken hep gizli. */
export function kurulumGorunum(durum, native) {
  if (native) return null;
  return durum === 'kurulabilir' || durum === 'ios-elle' ? durum : null;
}
