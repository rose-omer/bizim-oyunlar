// Ayarlar sayfasının saf mantığı (Node'da test edilir; DOM yok).
import { countdown } from '../../js/core/gunler.js';
import { ID_RE, checkData } from '../../js/core/veri.js';

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
};
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
      hatalar.push(`${TUR_ADLARI[tur]}: okunamadı`);
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
    if (atlanan) hatalar.push(`${TUR_ADLARI[tur]}: ${atlanan} kayıt atlandı`);
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
