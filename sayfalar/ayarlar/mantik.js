// Ayarlar sayfasının saf mantığı (Node'da test edilir; DOM yok).
import { countdown } from '../../js/core/gunler.js';
import { ID_RE, checkData, timeOf } from '../../js/core/veri.js';
import { formatDay, locative } from '../../js/core/ui.js';
import { paraMetni } from '../harcama/mantik.js';

export const SURUM = '2.0';

// ---------- Görünüm ----------
// localStorage 'bizim.tema' = { renk, mod }. Okuma ve uygulama ui.js'te (readTema, parseTema, applyTheme).
// Kimlikler ui.js TEMA_RENKLER / TEMA_MODLAR ile aynı olmalı (test eder).
// Renkler base.css açık tema --rk-accent değerleri; yalnız örnek göstermek için.
export const K_TEMA = 'bizim.tema';
export const TEMA_RENKLERI = [
  { id: 'pembe', ad: 'Pembe', renk: '#C2375C' },
  { id: 'mor', ad: 'Mor', renk: '#8A3FB0' },
  { id: 'kirmizi', ad: 'Kırmızı', renk: '#C4262E' },
  { id: 'mercan', ad: 'Mercan', renk: '#C24A33' },
  { id: 'mavi', ad: 'Mavi', renk: '#2F5FB3' },
];
export const TEMA_MODLARI = [
  { id: 'otomatik', ad: 'Otomatik' },
  { id: 'acik', ad: 'Açık' },
  { id: 'koyu', ad: 'Koyu' },
];

// Kişi rengi (kisi.renk): CSS renk dizesi olarak saklanır; başka sayfalar doğrudan kullanabilir.
export const KISI_RENKLERI = [
  { ad: 'Gül', renk: '#C2375C' },
  { ad: 'Erik', renk: '#5E2B4F' },
  { ad: 'Mercan', renk: '#D9573F' },
  { ad: 'Gece mavisi', renk: '#2F6DB5' },
  { ad: 'Orman', renk: '#2E7D5B' },
  { ad: 'Bal', renk: '#A8741A' },
];

// ---------- Katlanır bölümler ----------
// localStorage: açık bölümlerin id dizisi (JSON). İlk açılışta yalnız Profilim açık.
export const K_ACIK_BOLUMLER = 'bizim.ayarlar.acik';
const VARSAYILAN_ACIK = ['profil'];

/** Depodaki metin → açık bölüm id'leri. Bozuk ya da yoksa varsayılan. */
export function acikBolumler(raw) {
  let v = null;
  try { v = JSON.parse(raw); } catch { v = null; }
  if (!Array.isArray(v)) return [...VARSAYILAN_ACIK];
  return [...new Set(v.filter((x) => typeof x === 'string' && /^[a-z]{2,20}$/.test(x)))];
}

/** Bir bölüm açılınca / kapanınca yeni liste. */
export function acikGuncelle(liste, id, acik) {
  const s = new Set(liste || []);
  if (acik) s.add(id);
  else s.delete(id);
  return [...s];
}

// ---------- Biz: buluşma ----------
const GUN_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const SAAT_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const pad = (n) => String(n).padStart(2, '0');

/** Yerel tarih + saat → ISO (UTC). Geçersizse null. Saat boşsa 20:00. */
export function bulusmaIso(tarih, saat) {
  const g = GUN_RE.exec(tarih || '');
  if (!g) return null;
  const s = SAAT_RE.exec(saat || '20:00');
  if (!s) return null;
  const d = new Date(+g[1], +g[2] - 1, +g[3], +s[1], +s[2]);
  if (d.getFullYear() !== +g[1] || d.getMonth() !== +g[2] - 1 || d.getDate() !== +g[3]) return null;
  return d.toISOString();
}

/** ISO → yerel { tarih: 'YYYY-MM-DD', saat: 'HH:MM' }. Geçersizse boş dizeler. */
export function bulusmaAyir(iso) {
  const d = new Date(iso || '');
  if (!iso || Number.isNaN(d.getTime())) return { tarih: '', saat: '' };
  return {
    tarih: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    saat: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

/** Buluşmaya kalan süre, kısa Türkçe. */
export function bulusmaMetni(iso, simdi = new Date()) {
  const c = countdown(iso, simdi);
  if (!c) return '';
  if (c.past) return 'Bu buluşmanın zamanı geçti. Yenisini planlayalım mı?';
  if (c.days > 0) return `${c.days} gün ${c.hours} saat kaldı`;
  if (c.hours > 0) return `${c.hours} saat ${c.minutes} dakika kaldı`;
  return `${Math.max(1, c.minutes)} dakika kaldı`;
}

// ---------- Mesafe ----------
/** 2 ondalık (~1 km). */
export function yuvarla2(x) {
  return Math.round(Number(x) * 100) / 100;
}

/** Konum belgesi verisi. Koordinat geçersizse null. */
export function konumVerisi(coords, simdi = new Date()) {
  const lat = Number(coords?.latitude ?? coords?.lat);
  const lng = Number(coords?.longitude ?? coords?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat: yuvarla2(lat), lng: yuvarla2(lng), at: new Date(simdi).toISOString() };
}

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

export function mesafeMetni(km) {
  if (km == null || !Number.isFinite(km)) return '';
  if (km < 1.5) return 'Yan yanasınız';
  const sayi = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: km < 10 ? 1 : 0 }).format(km);
  return `Aranızda yaklaşık ${sayi} km var`;
}

// ---------- Konum izni: yol gösterme ----------
export const GUVENLI_ADRES = 'rose-omer.github.io';
export const KONUM_SECENEK = { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 };

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

// ---------- Bildirim ----------
/** bildirimDestegi() + bildirimDurumu() → gösterilecek durum. */
export function bildirimGorunum(destek, durum) {
  if (destek === 'ana-ekran-gerek') return 'ana-ekran-gerek';
  if (destek !== 'var') return 'yok';
  return ['acik', 'kapali', 'engelli'].includes(durum) ? durum : 'yok';
}

// ---------- Yedek ----------
export const YEDEK_TURLERI = [
  'kisi', 'cift', 'gun', 'mesaj', 'okundu', 'ani', 'mektup', 'liste',
  'randevu', 'gs', 'sevgidili', 'ruh', 'dokunus', 'konum', 'oyunkayit',
  'ruhgecmis',
  'skor',
  'gunfoto', 'haftalik', 'harcama',
  'yavru', 'yavrubakim',
  'kupon', 'bilgi',
];

/**
 * sonuclar: { [tür]: belgeler[] }, hatalar: { [tür]: mesaj }.
 * → { uygulama, surum, alindi, turler: { [tür]: [{ id, data, author, created_at, updated_at }] }, eksik? }
 * Silinmiş belgeler alınmaz. Oda kodu dosyaya yazılmaz.
 */
export function yedekVerisi({ sonuclar = {}, hatalar = {}, simdi = new Date(), surum = SURUM } = {}) {
  const turler = {};
  for (const tur of YEDEK_TURLERI) {
    const docs = sonuclar[tur];
    if (!Array.isArray(docs)) continue;
    turler[tur] = docs
      .filter((d) => d && !d.deleted)
      .map(({ id, data, author, created_at, updated_at }) => ({ id, data, author, created_at, updated_at }));
  }
  const out = { uygulama: 'Biz İkimiz', surum, alindi: new Date(simdi).toISOString(), turler };
  const eksik = Object.keys(hatalar || {}).filter((t) => YEDEK_TURLERI.includes(t));
  if (eksik.length) out.eksik = eksik;
  return out;
}

export function yedekSayisi(yedek) {
  return Object.values(yedek?.turler || {}).reduce((n, l) => n + l.length, 0);
}

export function yedekDosyaAdi(simdi = new Date()) {
  const d = new Date(simdi);
  return `biz-ikimiz-yedek-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
}

// ---------- Yedekten geri yükleme ----------
const TUR_ADLARI = {
  kisi: 'profil', cift: 'çift bilgisi', gun: 'özel gün', mesaj: 'mesaj', okundu: 'okundu bilgisi', ani: 'anı',
  mektup: 'mektup', liste: 'liste öğesi', randevu: 'randevu fikri', gs: 'soru cevabı', sevgidili: 'sevgi dili sonucu',
  ruh: 'ruh hâli', dokunus: 'dokunuş', konum: 'konum', oyunkayit: 'oyun kaydı',
  ruhgecmis: 'ruh hâli geçmişi', skor: 'skor', gunfoto: 'günün fotoğrafı', haftalik: 'haftalık kontrol',
  harcama: 'harcama', yavru: 'yavru', yavrubakim: 'yavru bakımı', kupon: 'kupon', bilgi: 'kişi bilgisi',
};
const turAdi = (tur) => TUR_ADLARI[tur] || tur;
const YEDEK_DEGIL = 'Bu dosya bir Biz İkimiz yedeği değil.';
const tarihMi = (v) => typeof v === 'string' && Number.isFinite(Date.parse(v));

/**
 * Yedek dosyası (yedekVerisi biçimi; nesne ya da JSON metni) → doc_ice_aktar belgeleri.
 * -> { belgeler: [{ kind, id, data, author?, created_at?, updated_at? }], hatalar: [metin], sayilar: { [tür]: n } }
 * Dosya yedek değilse ya da daha yeni bir sürümdense belgeler boş, hatalar[0] nedeni söyler.
 * Bozuk kayıtlar ve bilinmeyen türler atlanır (hatalarda sayılır).
 */
export function yedektenBelgeler(json) {
  let y = json;
  if (typeof y === 'string') {
    try { y = JSON.parse(y); } catch { y = null; }
  }
  const bos = (metin) => ({ belgeler: [], hatalar: [metin], sayilar: {} });
  if (!y || typeof y !== 'object' || Array.isArray(y) || y.uygulama !== 'Biz İkimiz'
    || typeof y.surum !== 'string' || !y.turler || typeof y.turler !== 'object' || Array.isArray(y.turler)) {
    return bos(YEDEK_DEGIL);
  }
  if (!/^2(\.\d+)*$/.test(y.surum)) {
    return bos(/^\d/.test(y.surum) && parseInt(y.surum, 10) > 2
      ? `Bu yedek daha yeni bir sürümden (${y.surum.slice(0, 10)}). Önce uygulamayı güncelle.`
      : YEDEK_DEGIL);
  }
  const belgeler = [];
  const hatalar = [];
  const sayilar = {};
  for (const [tur, docs] of Object.entries(y.turler)) {
    if (!YEDEK_TURLERI.includes(tur)) {
      hatalar.push(`Bilinmeyen tür atlandı: ${String(tur).slice(0, 20)}`);
      continue;
    }
    if (!Array.isArray(docs)) {
      hatalar.push(`${turAdi(tur)}: okunamadı`);
      continue;
    }
    let atlanan = 0;
    for (const d of docs) {
      if (!d || typeof d !== 'object' || !ID_RE.test(d.id || '') || checkData(d.data)) {
        atlanan++;
        continue;
      }
      const b = { kind: tur, id: d.id, data: d.data };
      if (typeof d.author === 'string' && ID_RE.test(d.author)) b.author = d.author;
      if (tarihMi(d.created_at)) b.created_at = d.created_at;
      if (tarihMi(d.updated_at)) b.updated_at = d.updated_at;
      belgeler.push(b);
      sayilar[tur] = (sayilar[tur] || 0) + 1;
    }
    if (atlanan) hatalar.push(`${turAdi(tur)}: ${atlanan} kayıt atlandı`);
  }
  return { belgeler, hatalar, sayilar };
}

/** Diziyi n'lik parçalara böler. */
export function parcala(dizi, n) {
  const out = [];
  const k = Math.max(1, Math.floor(n) || 1);
  for (let i = 0; i < (dizi?.length || 0); i += k) out.push(dizi.slice(i, i + k));
  return out;
}

/** { [tür]: n } → "1.234 kayıt: 800 mesaj, 40 anı …" (en çok olan dört tür). */
export function yedekOzeti(sayilar) {
  const liste = Object.entries(sayilar || {}).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  const toplam = liste.reduce((t, [, n]) => t + n, 0);
  if (!toplam) return 'Yedekte kayıt yok.';
  const f = (n) => n.toLocaleString('tr-TR');
  const parcalar = liste.slice(0, 4).map(([t, n]) => `${f(n)} ${TUR_ADLARI[t] || t}`).join(', ');
  return `${f(toplam)} kayıt: ${parcalar}${liste.length > 4 ? ' …' : ''}`;
}

// ---------- Son silinenler ----------
// Silme veriyi korur (deleted = true, data kalır). Geri al = putDoc(roomId, tür, id, data).
export const COP_TURLERI = ['mesaj', 'ani', 'mektup', 'gun', 'liste', 'randevu', 'harcama', 'kupon', 'gunfoto'];
const COP_EN_COK = 50;
const ONIZLEME_MAX = 80;

const doluMu = (d) => !!d && typeof d === 'object' && !Array.isArray(d) && Object.keys(d).length > 0;
const yazi = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');
const fotoOf = (v) => (typeof v === 'string' && v ? v : null);
const buyukBas = (s) => s.charAt(0).toLocaleUpperCase('tr') + s.slice(1);
function kisalt(s, n = ONIZLEME_MAX) {
  const k = [...s];
  return k.length > n ? `${k.slice(0, n - 1).join('').trimEnd()}…` : s;
}

/**
 * sonuclar: { [tür]: belgeler[] } (listDocs). -> [{ tur, id, data, author, updated_at }]
 * Yalnız içerik türlerinin silinmiş ve verisi dolu belgeleri (eski silmeler {} taşır); en yeni silinen önce.
 */
export function copListesi(sonuclar, { enCok = COP_EN_COK } = {}) {
  const out = [];
  for (const tur of COP_TURLERI) {
    for (const d of sonuclar?.[tur] || []) {
      if (!d?.deleted || typeof d.id !== 'string' || !doluMu(d.data)) continue;
      out.push({ tur, id: d.id, data: d.data, author: d.author || null, updated_at: d.updated_at });
    }
  }
  return out.sort((a, b) => timeOf(b.updated_at) - timeOf(a.updated_at)).slice(0, enCok);
}

/** Satır önizlemesi. -> { tur: 'Mesaj', metin (tek satır, en çok 80 karakter), foto: url | null } */
export function copOnizleme(tur, data) {
  const d = data && typeof data === 'object' ? data : {};
  const ad = buyukBas(turAdi(tur));
  let metin = '';
  let foto = null;
  if (tur === 'mesaj') {
    foto = fotoOf(d.foto);
    metin = yazi(d.metin) || (d.ses ? 'Sesli mesaj' : foto ? 'Fotoğraf' : '');
  } else if (tur === 'ani') {
    foto = Array.isArray(d.fotolar) ? fotoOf(d.fotolar[0]) : null;
    metin = yazi(d.baslik) || yazi(d.not);
  } else if (tur === 'mektup') {
    metin = yazi(d.baslik) || yazi(d.metin);
  } else if (tur === 'gun' || tur === 'kupon') {
    metin = [yazi(d.emoji), yazi(d.baslik)].filter(Boolean).join(' ');
  } else if (tur === 'harcama') {
    metin = [yazi(d.baslik), Number.isFinite(d.tutar) ? paraMetni(d.tutar) : ''].filter(Boolean).join(' · ');
  } else if (tur === 'gunfoto') {
    foto = fotoOf(d.foto);
    metin = yazi(d.not);
  } else {
    metin = yazi(d.metin);
  }
  return { tur: ad, metin: kisalt(metin || ad), foto };
}

/**
 * Kim, ne zaman sildi: "Dün sildin", "Gül dün sildi", "Gül 12 Ekim'de sildi", "12 Ekim 2025 tarihinde sildin".
 * adlar: { [clientId]: ad } (kisi belgeleri). Adı bilinmeyen: "Sevgilin".
 */
export function copKimZaman(author, iso, { benId = null, adlar = {}, simdi = new Date() } = {}) {
  const gun = formatDay(iso, simdi);
  const zaman = !gun || /^(bugün|dün|\d+ gün önce)$/.test(gun) ? gun
    : /\d{4}$/.test(gun) ? `${gun} tarihinde` : locative(gun);
  if (author && author === benId) return buyukBas([zaman, 'sildin'].filter(Boolean).join(' '));
  const ad = (author && yazi(adlar?.[author])) || 'Sevgilin';
  return [ad, zaman, 'sildi'].filter(Boolean).join(' ');
}
