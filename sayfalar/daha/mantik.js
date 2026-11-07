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
  { id: 'konusalim', baslik: 'Konuşalım', uyeler: ['mektup', 'gunsorusu', 'haftalik', 'gunfoto', 'not'] },
  { id: 'planlayalim', baslik: 'Planlayalım', uyeler: ['listeler', 'randevu', 'harcama', 'onun', 'cark'] },
  { id: 'biz', baslik: 'Biz', uyeler: ['ruh', 'sevgidili', 'yilimiz', 'sohbetozet', 'rozetler', 'skor', 'konum'] },
  { id: 'birlikte', baslik: 'Birlikte', uyeler: ['yavru', 'kupon', 'izin', 'izle', 'oyunlar'] },
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

// ---------- Arama ----------
const HARF_KATLA = { ı: 'i', ğ: 'g', ü: 'u', ş: 's', ö: 'o', ç: 'c' };
/** Küçük harf, Türkçe harfler sade: telefonda "gunun fotografi" de bulsun. */
const katla = (s) => String(s ?? '').toLocaleLowerCase('tr').replace(/[ığüşöç]/g, (c) => HARF_KATLA[c]);
// Aramada yok: Biz ana sayfa, Daha bu sayfa. Sekmeler ve Ayarlar bulunur: kullanıcı onları da arar.
const ARAMA_DISI = ['biz', 'daha'];

/** Sayfa araması: tüm kelimeler başlık ya da açıklamada. Sıra: başlık başı, başlık içi, açıklama; eşitlikte kayıt sırası. */
export function dahaAra(sayfalar, sorgu) {
  const kelimeler = katla(sorgu).split(/\s+/).filter(Boolean);
  if (!kelimeler.length) return [];
  const puanli = [];
  for (const s of sayfalar || []) {
    if (!s?.id || !s.path || ARAMA_DISI.includes(s.id)) continue;
    const baslik = katla(s.title);
    const metin = `${baslik} ${katla(s.desc)}`;
    if (!kelimeler.every((k) => metin.includes(k))) continue;
    const yer = baslik.indexOf(kelimeler[0]);
    puanli.push({ s, puan: yer === 0 ? 0 : yer > 0 ? 1 : 2 });
  }
  return puanli.sort((a, b) => a.puan - b.puan).map((x) => x.s);
}

// ---------- Son kullandıkların (yerel kayıt) ----------
export const SON_EN_COK = 4;

/** localStorage metni → kimlik listesi. Bozuk kayıt boş liste. */
export function sonOku(metin) {
  try {
    const v = JSON.parse(metin);
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x) : [];
  } catch {
    return [];
  }
}

/** En yeni başa; tekrar yok; en çok SON_EN_COK. */
export function sonEkle(liste, id) {
  return [id, ...(liste || []).filter((x) => x !== id)].slice(0, SON_EN_COK);
}

/** Kimlikler → Daha listesindeki sayfalar, kayıt sırasıyla. Sekme, Ayarlar ve artık olmayan sayfa düşer. */
export function sonSayfalar(ids, gruplar) {
  const byId = new Map((gruplar || []).flatMap((g) => g.sayfalar).map((s) => [s.id, s]));
  return (ids || []).map((id) => byId.get(id)).filter(Boolean);
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
