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
  { id: 'pembe', ad: 'Pembe', renk: '#E8478B' },
  { id: 'mor', ad: 'Mor', renk: '#A963EE' },
  { id: 'kirmizi', ad: 'Kırmızı', renk: '#F0505A' },
  { id: 'mercan', ad: 'Mercan', renk: '#EE5F35' },
  { id: 'mavi', ad: 'Mavi', renk: '#4C8DF0' },
];
export const TEMA_MODLARI = [
  { id: 'otomatik', ad: 'Otomatik' },
  { id: 'acik', ad: 'Açık' },
  { id: 'koyu', ad: 'Koyu' },
];

// Kişi rengi (kisi.renk): CSS renk dizesi olarak saklanır; başka sayfalar doğrudan kullanabilir.
export const KISI_RENKLERI = [
  { ad: 'Gül', renk: '#E8478B' },
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

// ---------- Bildirim ----------
/** bildirimDestegi() + bildirimDurumu() → gösterilecek durum. */
export function bildirimGorunum(destek, durum) {
  if (destek === 'ana-ekran-gerek') return 'ana-ekran-gerek';
  if (destek !== 'var') return 'yok';
  return ['acik', 'kapali', 'engelli'].includes(durum) ? durum : 'yok';
}

// ---------- Yedek ----------
/** dosyaPaylas sonucu → toast metni. iptal: mesaj yok. yok ve hata başarı demez. */
export function yedekSonucMesaji(sonuc, { sayi, eksik = false }) {
  if (sonuc === 'iptal') return null;
  if (sonuc === 'indirildi') return eksik ? `Yedek indirildi (${sayi} kayıt). Bazı bölümler alınamadı.` : `Yedek indirildi: ${sayi} kayıt.`;
  if (sonuc === 'paylasildi') return eksik ? `Yedek paylaşıldı (${sayi} kayıt). Bazı bölümler alınamadı.` : `Yedek paylaşıldı: ${sayi} kayıt.`;
  if (sonuc === 'yok') return 'Yedek bu uygulama sürümünde kaydedilemiyor. Uygulamayı güncelle ya da siteyi tarayıcıda aç.';
  return 'Yedek kaydedilemedi. Tekrar dener misin?';
}

export const YEDEK_TURLERI = [
  'kisi', 'cift', 'gun', 'mesaj', 'okundu', 'ani', 'mektup', 'liste',
  'randevu', 'gs', 'sevgidili', 'ruh', 'dokunus', 'konum', 'oyunkayit',
  'ruhgecmis',
  'skor',
  'gunfoto', 'haftalik', 'harcama',
  'yavru', 'yavrubakim',
  'kupon', 'bilgi',
  'kumbara', 'katki',
  'not',
  'sohbetozet',
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

export function tamYedekDosyaAdi(simdi = new Date()) {
  const d = new Date(simdi);
  return `biz-ikimiz-tam-yedek-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.bizyedek`;
}

/** Parola formu: hata metni | null. */
export function parolaHatasi(parola, tekrar) {
  if (String(parola || '').length < 8) return 'Parola en az 8 karakter olmalı.';
  if (parola !== tekrar) return 'Parolalar eşleşmiyor.';
  return null;
}

/** Son tam yedek satırı. */
export function yedekSonGun(iso, simdi = new Date()) {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return 'Henüz tam yedek almadın.';
  const gun = Math.floor((new Date(simdi).getTime() - t) / 86_400_000);
  return `Son tam yedek: ${gun <= 0 ? 'bugün' : gun === 1 ? 'dün' : `${gun} gün önce`}.`;
}

// ---------- Kullanım göstergesi ----------
const mb = (bayt) => {
  const n = bayt / (1024 * 1024);
  return `${(n >= 10 || n === 0 ? Math.round(n) : Math.round(n * 10) / 10).toLocaleString('tr-TR')} MB`;
};

/** medya_kullanim → { oran (0–1), metin, alt, uyari } | null. */
export function kullanimGorunum(k) {
  if (!k) return null;
  const oran = k.sinir > 0 ? Math.min(1, k.bayt / k.sinir) : 1;
  return {
    oran,
    metin: `${mb(k.bayt)} / ${mb(k.sinir)}`,
    alt: `${Number(k.dosya).toLocaleString('tr-TR')} dosya${k.ses_bayt ? `, sesli mesaj ${mb(k.ses_bayt)}` : ''}`,
    uyari: oran >= 0.9 ? 'Yer azaldı. Son silinenleri kalıcı silmek yer açar.' : null,
  };
}

// ---------- Odayı tamamen sil ----------
/** oda_sil_durum → 'yok' (bu modda yok) | 'bos' | 'bekliyorum' (ikinci cihazın onayı bekleniyor) | 'onayla'. */
export function odaSilGorunum(d) {
  if (!d) return 'yok';
  if (!d.bekliyor) return 'bos';
  return d.ben && !d.tek ? 'bekliyorum' : 'onayla';
}

// ---------- Yedekten geri yükleme ----------
const TUR_ADLARI = {
  kisi: 'profil', cift: 'çift bilgisi', gun: 'özel gün', mesaj: 'mesaj', okundu: 'okundu bilgisi', ani: 'anı',
  mektup: 'mektup', liste: 'liste öğesi', randevu: 'randevu fikri', gs: 'soru cevabı', sevgidili: 'sevgi dili sonucu',
  ruh: 'ruh hâli', dokunus: 'dokunuş', konum: 'konum', oyunkayit: 'oyun kaydı',
  ruhgecmis: 'ruh hâli geçmişi', skor: 'skor', gunfoto: 'günün fotoğrafı', haftalik: 'haftalık kontrol',
  harcama: 'harcama', yavru: 'yavru', yavrubakim: 'yavru bakımı', kupon: 'kupon', bilgi: 'kişi bilgisi',
  kumbara: 'kumbara', katki: 'kumbara hareketi',
  not: 'not',
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
export const COP_TURLERI = ['mesaj', 'ani', 'mektup', 'gun', 'liste', 'randevu', 'harcama', 'kupon', 'gunfoto', 'kumbara', 'not'];
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
