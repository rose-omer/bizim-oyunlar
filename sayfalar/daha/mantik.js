// "Daha" sayfasının saf mantığı (Node'da test edilir; DOM yok).

// Son APK sitede (.github/workflows/pages.yml koyar); depo gizli, Releases girişsiz indirilemez.
export const APK_URL = 'https://rose-omer.github.io/bizim-oyunlar/indir/BizIkimiz.apk';

/** iPhone'da ana ekrana ekleme adımları (Daha ve Ayarlar > Bildirimler kullanır). İlk adımın yanına Paylaş simgesi çizilir. */
export const IOS_ADIMLARI = [
  'Safari\'de alttaki Paylaş düğmesine dokun.',
  'Listeden “Ana Ekrana Ekle”yi seç.',
  'Sağ üstte “Ekle”ye dokun.',
];

/** Daha'daki gruplar. Grup üyeliği yalnız burada; grup içi sıra bu sıradır. */
export const DAHA_GRUPLARI = [
  { id: 'konusalim', baslik: 'Konuşalım', uyeler: ['mektup', 'gunsorusu', 'haftalik', 'gunfoto'] },
  { id: 'planlayalim', baslik: 'Planlayalım', uyeler: ['listeler', 'randevu', 'harcama'] },
  { id: 'biz', baslik: 'Biz', uyeler: ['ruh', 'sevgidili', 'yilimiz', 'rozetler', 'skor'] },
  { id: 'birlikte', baslik: 'Birlikte', uyeler: ['izle', 'oyunlar'] },
];
const DIGER = { id: 'diger', baslik: 'Diğer' };
// Ayarlar listede değil: başlığın sağında ikon düğme.
const DAHA_DISI = ['ayarlar'];

/**
 * SAYFALAR → [{ id, baslik, sayfalar: [sayfa] }]. Alt çubuktaki sayfalar (sekmeler) ve Ayarlar çıkar.
 * Haritada olmayan sayfa "Diğer" grubuna düşer (kayıt sırasıyla). Boş grup dönmez.
 */
export function dahaGruplari(sayfalar, sekmeler = []) {
  const liste = (sayfalar || []).filter((s) => s?.id && s.path && !DAHA_DISI.includes(s.id) && !sekmeler.includes(s.id));
  const byId = new Map(liste.map((s) => [s.id, s]));
  const gruplar = DAHA_GRUPLARI.map((g) => ({
    id: g.id, baslik: g.baslik, sayfalar: g.uyeler.map((id) => byId.get(id)).filter(Boolean),
  }));
  const grupta = new Set(DAHA_GRUPLARI.flatMap((g) => g.uyeler));
  gruplar.push({ ...DIGER, sayfalar: liste.filter((s) => !grupta.has(s.id)) });
  return gruplar.filter((g) => g.sayfalar.length);
}

/** "Sevgilini davet et" satırı: sevgili henüz hiç görünmediyse (knownPartner) ve profili yoksa. */
export function davetGoster(bilinenPartner, profilPartner) {
  return !bilinenPartner?.clientId && !profilPartner?.clientId;
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
