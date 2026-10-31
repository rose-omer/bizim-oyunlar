// Konum sayfası ve ana sayfa kartının saf mantığı (Node'da test edilir; DOM yok).
// Belge 'konum' (id = clientId), iki biçim:
//   paylaşıyor: { lat, lng, hassas: 'yaklasik'|'tam', dogruluk?, yer?, pil?, sarj?, canli?: ISO (bitiş), at: ISO }
//   kapalı:     { kapali: true, at }  (koordinat yok; durdurma removeDoc değil putDoc ile yazılır)
// Eski belge { lat, lng, sehir?, at } yaklaşık sayılır.
import { formatDay } from '../../js/core/ui.js';

export const TUR = 'konum';
/** "Ben kapatana dek" canlı paylaşımın bitişi. */
export const SURESIZ = '9999-12-31T00:00:00Z';
export const HASSASLIKLAR = [
  { id: 'yaklasik', ad: 'Yaklaşık', ipucu: '≈1 km', ondalik: 2 },
  { id: 'tam', ad: 'Tam', ipucu: '≈10 m', ondalik: 5 },
];
const DK = 60000;
const SAAT = 60 * DK;
export const CANLI_SURELER = [
  { id: '1s', ad: '1 saat', ms: SAAT },
  { id: '8s', ad: '8 saat', ms: 8 * SAAT },
  { id: 'surekli', ad: 'Ben kapatana dek', ms: null },
];
/** Canlı yazım sınırı: en çok dakikada 1; 50 m'den az hareket ve 3 dk'dan taze kayıt varsa yazma. */
export const YAZIM = { enAzMs: DK, hareketM: 50, tazeMs: 3 * DK };
/** Açılışta bir kez güncelleme eşiği. */
export const BAYAT_MS = 10 * DK;
/**
 * "Canlı" rozeti için son kaydın en çok yaşı: 3 dk (durağan cihazın yeniden yazma aralığı) + 1 dk pay
 * (yazım en çok dakikada 1; konum gelişi birkaç saniye sürer). Pay olmasa rozet her 3 dk'da bir söner.
 */
export const CANLI_TAZE_MS = 4 * DK;
export const SOR_ARALIK_MS = 10 * DK;
/** Nominatim: en çok dakikada 1 istek. */
export const YER_ARALIK_MS = DK;
const YER_MAX = 80;

const sonlu = (x) => typeof x === 'number' && Number.isFinite(x);
const tarihMi = (v) => typeof v === 'string' && Number.isFinite(Date.parse(v));
const sifirsiz = (x) => x || 0; // -0 yazılmasın

// ---------- Hassasiyet ve belge ----------
/** 2 ondalık (~1 km). */
export function yuvarla2(x) {
  return Math.round(Number(x) * 100) / 100;
}

/** 'tam' → 5 ondalık (~1 m), başka her şey → 2 ondalık (~1 km). */
export function yuvarla(x, hassas) {
  const k = hassas === 'tam' ? 1e5 : 1e2;
  return sifirsiz(Math.round(Number(x) * k) / k);
}

const hassasOf = (v) => (v === 'tam' ? 'tam' : 'yaklasik');
const yerTemiz = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, YER_MAX) : '');
const pilTemiz = (v) => (sonlu(v) && v >= 0 && v <= 100 ? Math.round(v) : undefined);

/**
 * Konum belgesi verisi. Koordinat geçersizse null.
 * ek yoksa eski biçim { lat, lng, at } (2 ondalık). ek = { hassas, yer?, pil?, sarj?, canli? } → yeni biçim.
 * Doğruluk (coords.accuracy) yalnız 'tam'da yazılır.
 */
export function konumVerisi(coords, simdi = new Date(), ek = null) {
  const lat = Number(coords?.latitude ?? coords?.lat);
  const lng = Number(coords?.longitude ?? coords?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const iso = new Date(simdi).toISOString();
  if (!ek) return { lat: yuvarla2(lat), lng: yuvarla2(lng), at: iso };
  const hassas = hassasOf(ek.hassas);
  const v = { lat: yuvarla(lat, hassas), lng: yuvarla(lng, hassas), hassas };
  const dogruluk = Number(coords?.accuracy);
  if (hassas === 'tam' && Number.isFinite(dogruluk) && dogruluk > 0) v.dogruluk = Math.min(100000, Math.max(1, Math.round(dogruluk)));
  const yer = yerTemiz(ek.yer);
  if (yer) v.yer = yer;
  const pil = pilTemiz(ek.pil);
  if (pil !== undefined) {
    v.pil = pil;
    if (typeof ek.sarj === 'boolean') v.sarj = ek.sarj;
  }
  if (tarihMi(ek.canli)) v.canli = ek.canli;
  v.at = iso;
  return v;
}

/** Paylaşımı durdurma verisi: koordinat yok. */
export function kapaliVeri(simdi = new Date()) {
  return { kapali: true, at: new Date(simdi).toISOString() };
}

/**
 * Belge verisi → null (belge yok / bozuk) | { kapali: true, at } | { lat, lng, hassas, dogruluk?, yer?, pil?, sarj?, canli?, at }.
 * at geçersizse null olur.
 */
export function konumOku(data) {
  if (!data || typeof data !== 'object') return null;
  const at = tarihMi(data.at) ? data.at : null;
  if (data.kapali) return { kapali: true, at };
  const { lat, lng } = data;
  if (!sonlu(lat) || !sonlu(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const k = { lat, lng, hassas: hassasOf(data.hassas) };
  if (k.hassas === 'tam' && sonlu(data.dogruluk) && data.dogruluk > 0) k.dogruluk = data.dogruluk;
  const yer = yerTemiz(data.yer) || yerTemiz(data.sehir);
  if (yer) k.yer = yer;
  const pil = pilTemiz(data.pil);
  if (pil !== undefined) k.pil = pil;
  if (typeof data.sarj === 'boolean') k.sarj = data.sarj;
  if (tarihMi(data.canli)) k.canli = data.canli;
  k.at = at;
  return k;
}

/** konumOku sonucu paylaşıyor mu? (kapalı değil, koordinat geçerli) */
export function paylasiyor(k) {
  return !!k && !k.kapali && sonlu(k.lat) && sonlu(k.lng);
}

const veriOf = (doc) => (doc && typeof doc === 'object' && doc.data && typeof doc.data === 'object'
  && !('lat' in doc) && !('kapali' in doc) ? (doc.deleted ? null : doc.data) : doc);

/** Belge ya da belge verisi paylaşıyor mu? (silinmiş, kapalı, koordinatsız → false) */
export function paylasiyorMu(doc) {
  return paylasiyor(konumOku(veriOf(doc)));
}

/** Yer adı ("Kadıköy, İstanbul") ya da ''. Paylaşmıyorsa ''. */
export function yerKisa(data) {
  const k = konumOku(veriOf(data));
  return paylasiyor(k) ? k.yer || '' : '';
}

/** Kapalı / Yaklaşık / Tam / Canlı (Ayarlar satırı). */
export function durumEtiketi(k, simdi = Date.now()) {
  if (!paylasiyor(k)) return 'Kapalı';
  if (canliAcik(k, simdi)) return 'Canlı';
  return k.hassas === 'tam' ? 'Tam' : 'Yaklaşık';
}

// ---------- Canlı ----------
/** Süre seçimi → bitiş ISO. Bilinmeyen seçim 1 saat. */
export function canliBitis(sureId, simdi = new Date()) {
  const s = CANLI_SURELER.find((x) => x.id === sureId) || CANLI_SURELER[0];
  if (s.ms == null) return SURESIZ;
  return new Date(new Date(simdi).getTime() + s.ms).toISOString();
}

const zamanOf = (s) => +new Date(s);

/** Canlı paylaşım açık mı? (paylaşıyor ve canlı bitişi gelecekte; tazelik bakılmaz: sahibinin kendi durumu) */
export function canliAcik(k, simdi = Date.now()) {
  return paylasiyor(k) && !!k.canli && Date.parse(k.canli) > zamanOf(simdi);
}

/** Canlı alanı var ama süresi dolmuş (sahibi alanı silmeli). */
export function canliBitti(k, simdi = Date.now()) {
  return paylasiyor(k) && !!k.canli && Date.parse(k.canli) <= zamanOf(simdi);
}

/**
 * "Canlı" rozeti: canlı bitişi gelecekte ve son kayıt taze (CANLI_TAZE_MS). Uygulaması kapanınca rozet söner.
 * data: belge verisi (ya da konumOku sonucu).
 */
export function canliMi(data, simdi = Date.now()) {
  const k = konumOku(veriOf(data));
  if (!canliAcik(k, simdi)) return false;
  const t = Date.parse(k.at);
  return Number.isFinite(t) && zamanOf(simdi) - t < CANLI_TAZE_MS;
}

/** Veriden canlı alanını çıkarır (son konum kalır). Girdi değişmez. */
export function canliDusur(data) {
  const { canli: _c, ...geri } = data || {};
  return geri;
}

/** "1 saat 20 dk kaldı" | "Sen kapatana dek" | "" */
export function canliKalanMetni(k, simdi = Date.now()) {
  if (!canliAcik(k, simdi)) return '';
  if (k.canli === SURESIZ) return 'Sen kapatana dek';
  const dk = Math.max(1, Math.ceil((Date.parse(k.canli) - zamanOf(simdi)) / DK));
  const sa = Math.floor(dk / 60);
  const kalan = dk % 60;
  if (!sa) return `${dk} dk kaldı`;
  return kalan ? `${sa} saat ${kalan} dk kaldı` : `${sa} saat kaldı`;
}

// ---------- Yazım kararı ----------
/**
 * Canlı izlemede yeni konum yazılsın mı? onceki: konumOku sonucu ya da ham veri; yeni: konumVerisi sonucu.
 * İlk kayıt ya da kapalıdan sonra hemen; sonra en çok dakikada 1; 50 m'den az hareket ve 3 dk'dan taze kayıtsa hayır.
 */
export function yazilsinMi(onceki, yeni, simdi = Date.now()) {
  if (!yeni) return false;
  const o = onceki && 'hassas' in onceki ? onceki : konumOku(onceki);
  if (!paylasiyor(o)) return true;
  const gecen = zamanOf(simdi) - Date.parse(o.at);
  if (!Number.isFinite(gecen) || gecen < 0) return true;
  if (gecen < YAZIM.enAzMs) return false;
  if (o.hassas !== hassasOf(yeni.hassas)) return true;
  const m = (mesafeKm(o, yeni) ?? Infinity) * 1000;
  return !(m < YAZIM.hareketM && gecen < YAZIM.tazeMs);
}

/** Uygulama açılınca bir kez güncelle: paylaşım açık ve son kayıt 10 dakikadan eski (ya da tarihsiz). */
export function acilistaGuncellensinMi(k, simdi = Date.now()) {
  if (!paylasiyor(k)) return false;
  const t = Date.parse(k.at);
  return !Number.isFinite(t) || zamanOf(simdi) - t > BAYAT_MS;
}

// ---------- Mesafe ----------
/** İki nokta arası kuş uçuşu km (haversine). */
export function mesafeKm(a, b) {
  if (![a?.lat, a?.lng, b?.lat, b?.lng].every(Number.isFinite)) return null;
  const R = 6371;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

const sayiYaz = (n, ondalik) => new Intl.NumberFormat('tr-TR', { maximumFractionDigits: ondalik }).format(n);

export function mesafeMetni(km) {
  if (km == null || !Number.isFinite(km)) return '';
  if (km < 1.5) return 'Yan yanasınız';
  return `Aranızda yaklaşık ${sayiYaz(km, km < 10 ? 1 : 0)} km var`;
}

/**
 * Büyük mesafe yazısı. tam = ikisi de tam konum (metre gösterilir, eşik 30 m); değilse eşik 1,5 km.
 * -> { yakin, sayi, birim, metin } | null
 */
export function mesafeYazi(km, { tam = false } = {}) {
  if (km == null || !Number.isFinite(km) || km < 0) return null;
  const yakin = { yakin: true, sayi: '', birim: '', metin: 'Yan yanasınız' };
  if (tam ? km < 0.03 : km < 1.5) return yakin;
  if (tam && km < 1) {
    const m = Math.round((km * 1000) / 10) * 10;
    return { yakin: false, sayi: sayiYaz(m, 0), birim: 'm', metin: `Aranızda ${sayiYaz(m, 0)} m` };
  }
  const sayi = sayiYaz(km, km < 100 ? 1 : 0);
  return { yakin: false, sayi, birim: 'km', metin: `Aranızda ${sayi} km` };
}

// ---------- Metinler ----------
/** "şimdi" / "5 dk önce" / "3 saat önce" / "dün" / "12 Ekim". */
export function tazelikMetni(iso, simdi = new Date()) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const s = (zamanOf(simdi) - t) / 1000;
  if (s < 60) return 'şimdi';
  if (s < 3600) return `${Math.floor(s / 60)} dk önce`;
  if (s < 86400) return `${Math.floor(s / 3600)} saat önce`;
  return formatDay(t, new Date(simdi));
}

/** navigator.getBattery() sonucu → { pil: 0–100, sarj } | null */
export function pilVerisi(b) {
  const l = Number(b?.level);
  if (!b || !Number.isFinite(l) || l < 0 || l > 1) return null;
  return { pil: Math.round(l * 100), sarj: !!b.charging };
}

/** "%64 · şarjda" | "%64" | "" */
export function pilMetni(k) {
  if (!sonlu(k?.pil)) return '';
  return `%${k.pil}${k.sarj ? ' · şarjda' : ''}`;
}

/** Google Haritalar yol tarifi; yalnız tam konumda. */
export function yolTarifiUrl(k) {
  if (!paylasiyor(k) || k.hassas !== 'tam') return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${k.lat},${k.lng}`;
}

/** Kişi rengi (kisi.renk) yalnız #RRGGBB ise. */
export function renkGecerli(r) {
  return typeof r === 'string' && /^#[0-9A-Fa-f]{6}$/.test(r) ? r : null;
}

// ---------- Yer adı (OpenStreetMap Nominatim) ----------
/** Önbellek anahtarı ve sorgu koordinatı: 3 ondalık (~100 m). */
export function yerAnahtari(lat, lng) {
  return `${Number(lat).toFixed(3)},${Number(lng).toFixed(3)}`;
}

export function nominatimUrl(lat, lng) {
  const [la, lo] = yerAnahtari(lat, lng).split(',');
  return `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&accept-language=tr&lat=${la}&lon=${lo}`;
}

/** Nominatim jsonv2 → "Kadıköy, İstanbul" (ilçe ya da mahalle, şehir) | null */
export function yerAdi(json) {
  if (!json || typeof json !== 'object' || json.error) return null;
  const a = json.address && typeof json.address === 'object' ? json.address : {};
  const ilk = (...anahtarlar) => anahtarlar.map((x) => yerTemiz(a[x])).find(Boolean) || '';
  const ilce = ilk('town', 'city_district', 'district', 'county', 'suburb', 'municipality', 'village', 'neighbourhood', 'quarter');
  const sehir = ilk('province', 'city', 'state');
  const parcalar = [ilce, sehir].filter(Boolean)
    .filter((p, i, l) => l.findIndex((x) => x.toLocaleLowerCase('tr') === p.toLocaleLowerCase('tr')) === i);
  const ad = parcalar.join(', ') || yerTemiz(json.name);
  return ad ? ad.slice(0, YER_MAX) : null;
}

// ---------- Konumunu sor ----------
/** Yeniden sormak için kalan ms (0 = sorabilir). */
export function sorBekleme(sonIso, simdi = Date.now()) {
  const t = Date.parse(sonIso);
  if (!Number.isFinite(t)) return 0;
  return Math.min(SOR_ARALIK_MS, Math.max(0, t + SOR_ARALIK_MS - zamanOf(simdi)));
}

export function sorBildirimi(ad) {
  return { baslik: 'Biz İkimiz', metin: `${yerTemiz(ad) || 'Sevgilin'} nerede olduğunu merak ediyor 📍` };
}

// ---------- Konum izni: seçenekler ve yol gösterme ----------
export const GUVENLI_ADRES = 'rose-omer.github.io';
export const KONUM_SECENEK = { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 };

/** getCurrentPosition / watchPosition seçenekleri. */
export function konumSecenek(hassas, { canli = false } = {}) {
  const tam = hassas === 'tam';
  if (canli) return { enableHighAccuracy: tam, timeout: 30000, maximumAge: tam ? 10000 : 60000 };
  return tam ? { enableHighAccuracy: true, timeout: 20000, maximumAge: 30000 } : KONUM_SECENEK;
}

/** GeolocationPositionError → 'izin' (1) | 'kapali' (2, POSITION_UNAVAILABLE) | 'zaman' (3) | 'diger'. */
export function konumHataTuru(e) {
  return { 1: 'izin', 2: 'kapali', 3: 'zaman' }[e?.code] || 'diger';
}

/** Hangi adımlar? 'uygulama' (Android uygulaması) | 'android' (Chrome) | 'ios' | 'masaustu'. */
export function konumPlatformu({ native = false, ua = '', dokunmatik = 0 } = {}) {
  if (native) return 'uygulama';
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && dokunmatik > 1)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'masaustu';
}

const IZIN_ADIMLARI = {
  uygulama: [
    'Telefonun Ayarlar uygulamasını aç.',
    'Uygulamalar → Biz İkimiz → İzinler → Konum.',
    '“Uygulamayı kullanırken izin ver”i seç.',
  ],
  android: [
    'Adres çubuğunun solundaki kilit (ya da ayar) simgesine dokun.',
    'İzinler → Konum’u aç.',
  ],
  ios: [
    'Ayarlar → Gizlilik ve Güvenlik → Konum Servisleri.',
    'Safari Web Siteleri → “Uygulama Kullanılırken”.',
  ],
  masaustu: [
    'Adres çubuğundaki kilit (site bilgisi) simgesine tıkla.',
    'Konum iznini “İzin ver” yap.',
  ],
};
const IZIN_NOTU = {
  android: 'Ana ekrandan açtıysan: Chrome → Ayarlar → Site ayarları → Konum.',
  ios: 'Ana ekrandan açtığın uygulamada da aynı ayar geçerli.',
};
const SERVIS_ADIMLARI = {
  uygulama: ['Ekranın üstünden aşağı kaydır, “Konum”u aç.'],
  android: ['Ekranın üstünden aşağı kaydır, “Konum”u aç.'],
  ios: ['Ayarlar → Gizlilik ve Güvenlik → Konum Servisleri’ni aç.'],
  masaustu: ['Bilgisayarın konum servisini aç (Windows: Ayarlar → Gizlilik ve güvenlik → Konum).'],
};

/**
 * Konum alınamayınca gösterilecek yol: { tur, baslik, metin, adimlar: [], not? }.
 * guvenli = false (http:// adres) her şeyden önce gelir: tarayıcı orada konum vermez.
 */
export function konumRehberi(tur, { platform = 'masaustu', guvenli = true } = {}) {
  const p = IZIN_ADIMLARI[platform] ? platform : 'masaustu';
  if (!guvenli) {
    return {
      tur: 'guvensiz',
      baslik: 'Konum bu adreste çalışmaz',
      metin: `Konum yalnız güvenli adreste çalışır: ${GUVENLI_ADRES}`,
      adimlar: [],
      not: 'Biz İkimiz’i oradan açınca konumunu paylaşabilirsin.',
    };
  }
  if (tur === 'izin') {
    return {
      tur,
      baslik: 'Konum izni kapalı',
      metin: p === 'uygulama' ? 'Biz İkimiz’in konum izni yok. Şöyle açabilirsin:' : 'Tarayıcı bu siteye konum izni vermedi. Şöyle açabilirsin:',
      adimlar: IZIN_ADIMLARI[p],
      not: IZIN_NOTU[p] || null,
    };
  }
  if (tur === 'kapali') {
    return {
      tur,
      baslik: 'Konum servisleri kapalı',
      metin: 'Cihaz konumu bulamadı. Konum servisini açıp tekrar dene:',
      adimlar: SERVIS_ADIMLARI[p],
      not: null,
    };
  }
  if (tur === 'zaman') {
    return {
      tur,
      baslik: 'Konum zamanında gelmedi',
      metin: 'Sinyal zayıf olabilir. Wi-Fi’yi açıp biraz sonra tekrar dener misin?',
      adimlar: [],
      not: null,
    };
  }
  return { tur: 'diger', baslik: 'Konum alınamadı', metin: 'Biraz sonra tekrar dener misin?', adimlar: [], not: null };
}
