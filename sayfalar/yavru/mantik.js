// Yavrumuz: saf mantık (DOM yok, Node'da test edilir). Sayfa (app.js) ve ana sayfa kartı (kart.js) paylaşır.
// Veri: tür 'yavru', tek belge 'bizim':
//   { asama: 'yumurta'|'kucuk'|'buyuk', ad, renk (1–6), dogum (ISO), catlama?, buyume?,
//     ihtiyac: { tokluk|mutluluk|temizlik|enerji: { v, t } }, uyku: { bas, bit } | null,
//     puan: { [clientId]: n }, isitma: { [clientId]: [ISO] (son 10) },
//     son: { [clientId]: { [eylem]: ISO, sevGun?, sevPuan? } } }
// Değer saklanmaz, hesaplanır: şimdiki = v − düşüş × geçen saat (uyku aralığı ayrı), 0–100 kırpılır.
// Yazım yalnız alan düzeyinde yama (veri.js patch; anahtar en çok iki düzey: 'ihtiyac.tokluk', 'son.<clientId>').
// Bakım günlüğü: tür 'yavrubakim', id uuid, { eylem, kim, at, deger? }.
import { toDay } from '../../js/core/gunler.js';
import { hashStr } from '../gunun-sorusu/mantik.js';

export const TUR = 'yavru';
export const BAKIM_TUR = 'yavrubakim';
export const BELGE_ID = 'bizim';

export const DK = 60_000;
export const SAAT = 60 * DK;
export const GUN = 24 * SAAT;

export const IHTIYACLAR = ['tokluk', 'mutluluk', 'temizlik', 'enerji'];
export const DUSUS = { tokluk: 4, mutluluk: 3, temizlik: 2, enerji: 3 }; // saatlik
export const UYKU_ENERJI = 12; // uyurken enerji saatte artar; diğerleri yarı hızla düşer
export const UYKU_SURE = 8 * SAAT;
export const DUSUK = 25; // bunun altı "ihtiyaç var"
export const MUTLU = 60; // hepsi bunun üstündeyse mutlu
export const ISITMA_ARALIK = 10 * DK;
export const ISITMA_GEREK = 3;
export const ISITMA_TUT = 10;
export const YUMURTA_SURE = 24 * SAAT;
export const BUYUME_GUN = 7;
export const BUYUME_TOPLAM = 60;
export const BUYUME_KISI = 15;
export const SEV_GUNLUK = 5;
export const BILDIRIM_ARALIK = 30 * DK;
export const OZLEDI_SURE = 12 * SAAT;
export const RENK_SAYISI = 6;
export const AD_MAX = 20;
// Çatlayınca: biraz aç doğar, ilk bakım hemen başlasın.
export const BASLANGIC_IHTIYAC = { tokluk: 50, mutluluk: 80, temizlik: 70, enerji: 70 };

/** fiil: [üçüncü kişi, "Sen" için] (Son bakımlar listesi). */
export const EYLEMLER = {
  mama: { ad: 'Mama', emoji: '🍼', etki: { tokluk: 30 }, bekleme: 20 * DK, fiil: ['besledi', 'besledin'], tok: 'Karnı tok 😊' },
  meyve: { ad: 'Meyve', emoji: '🍎', etki: { tokluk: 20, mutluluk: 5 }, bekleme: 20 * DK, fiil: ['besledi', 'besledin'], tok: 'Karnı tok 😊' },
  tatli: { ad: 'Tatlı', emoji: '🍰', etki: { tokluk: 10, mutluluk: 15 }, bekleme: 60 * DK, fiil: ['besledi', 'besledin'], tok: 'Karnı tok 😊' },
  oyna: { ad: 'Oyna', emoji: '⚽', etki: { mutluluk: 25, enerji: -10 }, bekleme: 20 * DK, fiil: ['oynadı', 'oynadın'], tok: 'Keyfi zaten yerinde 😊' },
  yika: { ad: 'Yıka', emoji: '🫧', etki: { temizlik: 40 }, bekleme: 30 * DK, fiil: ['yıkadı', 'yıkadın'], tok: 'Zaten tertemiz ✨' },
  sev: { ad: 'Sev', emoji: '🤍', etki: { mutluluk: 5 }, bekleme: 2 * DK, fiil: ['sevdi', 'sevdin'], tok: null },
  uyut: { ad: 'Uyut', emoji: '🌙', fiil: ['uyuttu', 'uyuttun'], tok: null },
  uyandir: { ad: 'Uyandır', emoji: '☀️', fiil: ['uyandırdı', 'uyandırdın'], tok: null },
};
const ISIT = { emoji: '🥚', fiil: ['ısıttı', 'ısıttın'] };

const IHTIYAC_RUH = { tokluk: 'ac', mutluluk: 'uzgun', temizlik: 'kirli', enerji: 'uykulu' };
const DURUM = {
  uyuyor: 'Mışıl mışıl uyuyor', ac: 'Karnı acıkmış', kirli: 'Banyo vakti gelmiş', uykulu: 'Uykusu gelmiş',
  uzgun: 'Biraz ilgi istiyor', mutlu: 'Keyfi yerinde', normal: 'İyi görünüyor',
};

// ---------- Küçük yardımcılar ----------

const zaman = (s) => {
  if (typeof s !== 'string' || !s) return NaN;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : NaN;
};
const gecerli = (s) => Number.isFinite(zaman(s));
const iso = (ms) => new Date(ms).toISOString();
const kirp = (x) => Math.min(100, Math.max(0, x));
const yuvarla = (x) => Math.round(x * 10) / 10;
const nesne = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});

/** Oda kimliğinden tohumlu renk: 1–6 (cizim.js --yv-r1..6). Kararlı. */
export function renkSec(roomId) {
  return (hashStr(`yavru:${roomId ?? ''}`) % RENK_SAYISI) + 1;
}

/** İlk açan cihazın yazdığı yeni yumurta (doc_put verisi). */
export function yeniYumurta({ roomId, simdi = Date.now() }) {
  return {
    asama: 'yumurta', ad: '', renk: renkSec(roomId), dogum: iso(simdi),
    uyku: null, puan: {}, isitma: {}, son: {},
  };
}

/** Belge verisini güvenli biçime getirir (bozuk alanlar varsayılana düşer). */
export function oku(data) {
  const d = nesne(data);
  const ihtiyac = {};
  for (const ad of IHTIYACLAR) {
    const k = nesne(nesne(d.ihtiyac)[ad]);
    ihtiyac[ad] = { v: Number.isFinite(k.v) ? k.v : 0, t: gecerli(k.t) ? k.t : null };
  }
  const uyku = nesne(d.uyku);
  const puan = {};
  for (const [kim, n] of Object.entries(nesne(d.puan))) if (Number.isFinite(n) && n > 0) puan[kim] = n;
  const isitma = {};
  for (const [kim, l] of Object.entries(nesne(d.isitma))) isitma[kim] = Array.isArray(l) ? l.filter(gecerli) : [];
  const son = {};
  for (const [kim, s] of Object.entries(nesne(d.son))) son[kim] = { ...nesne(s) };
  return {
    asama: ['yumurta', 'kucuk', 'buyuk'].includes(d.asama) ? d.asama : 'yumurta',
    ad: typeof d.ad === 'string' ? d.ad : '',
    renk: Number.isInteger(d.renk) && d.renk >= 1 && d.renk <= RENK_SAYISI ? d.renk : 1,
    dogum: gecerli(d.dogum) ? d.dogum : null,
    catlama: gecerli(d.catlama) ? d.catlama : null,
    buyume: gecerli(d.buyume) ? d.buyume : null,
    ihtiyac,
    uyku: gecerli(uyku.bas) && gecerli(uyku.bit) ? { bas: uyku.bas, bit: uyku.bit } : null,
    puan, isitma, son,
  };
}

// ---------- İhtiyaçlar ----------

/**
 * Şimdiki değer. kayit = { v, t }. Uyku aralığında enerji +12/sa, diğerleri yarı hız.
 * Dilimler sırayla (uyanık → uyku → uyanık) işlenir; her dilimden sonra 0–100 kırpılır.
 */
export function ihtiyacDegeri(kayit, ad, uyku, simdi) {
  const v = Number(kayit?.v);
  if (!Number.isFinite(v)) return 0;
  const t = zaman(kayit?.t);
  if (!Number.isFinite(t) || simdi <= t) return kirp(v);
  const hiz = DUSUS[ad] ?? 0;
  const uykuHiz = ad === 'enerji' ? -UYKU_ENERJI : hiz / 2;
  const bas = zaman(uyku?.bas);
  const bit = zaman(uyku?.bit);
  const dilimler = [];
  if (Number.isFinite(bas) && Number.isFinite(bit) && bit > bas) {
    const u1 = Math.max(t, bas);
    const u2 = Math.min(simdi, bit);
    if (u2 > u1) {
      dilimler.push([t, u1, hiz], [u1, u2, uykuHiz], [u2, simdi, hiz]);
    }
  }
  if (!dilimler.length) dilimler.push([t, simdi, hiz]);
  let x = kirp(v);
  for (const [a, b, h] of dilimler) if (b > a) x = kirp(x - (h * (b - a)) / SAAT);
  return x;
}

/** Dört ihtiyacın şimdiki değerleri (yuvarlanmamış). */
export function ihtiyaclar(y, simdi) {
  const out = {};
  for (const ad of IHTIYACLAR) out[ad] = ihtiyacDegeri(y?.ihtiyac?.[ad], ad, y?.uyku, simdi);
  return out;
}

/** Uyuyor mu? Uyku 8 saat sonra kendiliğinden biter (bit). */
export function uyuyorMu(uyku, simdi) {
  const bas = zaman(uyku?.bas);
  const bit = zaman(uyku?.bit);
  return Number.isFinite(bas) && Number.isFinite(bit) && simdi >= bas && simdi < bit;
}

/** Tüm ihtiyaçları şimdiki değerle o ana sabitleyen yama (uyku başlarken ve biterken). */
function sabitle(y, simdi) {
  const d = ihtiyaclar(y, simdi);
  const yama = {};
  for (const ad of IHTIYACLAR) yama[`ihtiyac.${ad}`] = { v: yuvarla(d[ad]), t: iso(simdi) };
  return yama;
}

/** 'yumurta' | 'uyuyor' | 'ac' | 'kirli' | 'uykulu' | 'uzgun' | 'mutlu' | 'normal' */
export function ruhHali(y, simdi) {
  if (!y || y.asama === 'yumurta') return 'yumurta';
  if (uyuyorMu(y.uyku, simdi)) return 'uyuyor';
  const d = ihtiyaclar(y, simdi);
  let enAz = IHTIYACLAR[0];
  for (const ad of IHTIYACLAR) if (d[ad] < d[enAz]) enAz = ad;
  if (d[enAz] < DUSUK) return IHTIYAC_RUH[enAz];
  return IHTIYACLAR.every((ad) => d[ad] > MUTLU) ? 'mutlu' : 'normal';
}

/** Son bakım (ihtiyaçların en yeni zamanı) 12 saatten eskiyse: "Sizi özledi". Uyurken değil. */
export function ozledi(y, simdi) {
  if (!y || y.asama === 'yumurta' || uyuyorMu(y.uyku, simdi)) return false;
  const son = Math.max(...IHTIYACLAR.map((ad) => zaman(y.ihtiyac?.[ad]?.t)).filter(Number.isFinite));
  return Number.isFinite(son) && simdi - son >= OZLEDI_SURE;
}

/** Kısa durum cümlesi (sahne altı ve ana sayfa kartı). y null: belge yok. */
export function durumMetni(y, simdi) {
  if (!y) return 'Bir yumurtanız var 🥚 Isıtalım mı?';
  if (y.asama === 'yumurta') return catlamaHazir(y, simdi) ? 'Çatlamaya hazır! 🐣' : 'Isıtılmayı bekliyor 🥚';
  if (ozledi(y, simdi)) return 'Sizi özledi 🥺';
  return DURUM[ruhHali(y, simdi)] || DURUM.normal;
}

// ---------- Eylemler ----------

/** Kişinin bu eylem için kalan beklemesi (ms; 0 = hazır). */
export function kalanBekleme(y, kim, eylem, simdi) {
  const bekleme = EYLEMLER[eylem]?.bekleme || 0;
  const t = zaman(y?.son?.[kim]?.[eylem]);
  if (!bekleme || !Number.isFinite(t)) return 0;
  return Math.max(0, Math.min(bekleme, t + bekleme - simdi));
}

/**
 * Bakım eylemi. -> { hata: 'bilinmiyor'|'yumurta'|'uyuyor'|'uyanik'|'bekle', kalan? }
 *                | { yama, puan: bool, mesaj: string|null, kayit: { eylem, kim, at } }
 * Bekleme kişi başınadır. Değer 100'deyse eylem yapılır ama puan vermez. Sev günde en çok 5 puan.
 * Uyut puanı kişi başına 8 saatte bir (uyut/uyandır döngüsüyle puan toplanmasın).
 */
export function eylemYap(y, { eylem, kim, simdi }) {
  const tanim = EYLEMLER[eylem];
  if (!tanim) return { hata: 'bilinmiyor' };
  if (y.asama === 'yumurta') return { hata: 'yumurta' };
  const uyuyor = uyuyorMu(y.uyku, simdi);
  if (uyuyor && eylem !== 'sev' && eylem !== 'uyandir') return { hata: 'uyuyor' };
  if (!uyuyor && eylem === 'uyandir') return { hata: 'uyanik' };
  const kalan = kalanBekleme(y, kim, eylem, simdi);
  if (kalan > 0) return { hata: 'bekle', kalan };

  const at = iso(simdi);
  const d = ihtiyaclar(y, simdi);
  const benimSon = { ...(y.son?.[kim] || {}) };
  let yama = {};
  let etkili;
  if (eylem === 'uyut') {
    yama = { ...sabitle(y, simdi), uyku: { bas: at, bit: iso(simdi + UYKU_SURE) } };
    const onceki = zaman(benimSon.uyut);
    etkili = Math.round(d.enerji) < 100 && !(Number.isFinite(onceki) && simdi - onceki < UYKU_SURE);
  } else if (eylem === 'uyandir') {
    yama = { ...sabitle(y, simdi), uyku: null };
    etkili = false;
  } else {
    etkili = false;
    for (const [ad, artis] of Object.entries(tanim.etki)) {
      if (artis > 0 && Math.round(d[ad]) < 100) etkili = true;
      yama[`ihtiyac.${ad}`] = { v: yuvarla(kirp(d[ad] + artis)), t: at };
    }
  }
  benimSon[eylem] = at;
  if (eylem === 'sev' && etkili) {
    const gun = toDay(new Date(simdi));
    const sayi = benimSon.sevGun === gun ? Number(benimSon.sevPuan) || 0 : 0;
    etkili = sayi < SEV_GUNLUK;
    if (etkili) {
      benimSon.sevGun = gun;
      benimSon.sevPuan = sayi + 1;
    }
  }
  yama[`son.${kim}`] = benimSon;
  if (etkili) yama[`puan.${kim}`] = (y.puan?.[kim] || 0) + 1;
  return { yama, puan: etkili, mesaj: etkili ? null : tanim.tok, kayit: { eylem, kim, at } };
}

// ---------- Yumurta ----------

/** 10 dakikadan sık ısıtmalar tek sayılır. */
export function isitmaSayisi(liste) {
  const zamanlar = (Array.isArray(liste) ? liste : []).map(zaman).filter(Number.isFinite).sort((a, b) => a - b);
  let n = 0;
  let son = -Infinity;
  for (const t of zamanlar) {
    if (t - son >= ISITMA_ARALIK) {
      n++;
      son = t;
    }
  }
  return n;
}

/** Isıt. -> { hata: 'catladi'|'erken', kalan? } | { yama, kayit } */
export function isit(y, { kim, simdi }) {
  if (y.asama !== 'yumurta') return { hata: 'catladi' };
  const liste = y.isitma?.[kim] || [];
  const son = Math.max(...liste.map(zaman).filter(Number.isFinite));
  if (Number.isFinite(son) && simdi - son < ISITMA_ARALIK) {
    return { hata: 'erken', kalan: Math.min(ISITMA_ARALIK, son + ISITMA_ARALIK - simdi) };
  }
  const at = iso(simdi);
  return { yama: { [`isitma.${kim}`]: [...liste, at].slice(-ISITMA_TUT) }, kayit: { eylem: 'isit', kim, at } };
}

/** Kişi başına geçerli ısıtma sayıları, çoktan aza. */
function isitanlar(y) {
  return Object.entries(y?.isitma || {})
    .map(([id, l]) => ({ id, n: isitmaSayisi(l) }))
    .sort((a, b) => b.n - a.n || (a.id < b.id ? -1 : 1));
}

/** Yumurta en az 24 saatlik ve iki kişinin her biri en az 3 kez ısıtmış mı? */
export function catlamaHazir(y, simdi) {
  if (y?.asama !== 'yumurta') return false;
  const dogum = zaman(y.dogum);
  if (!Number.isFinite(dogum) || simdi - dogum < YUMURTA_SURE) return false;
  return isitanlar(y).filter((k) => k.n >= ISITMA_GEREK).length >= 2;
}

/** Yumurta ilerlemesi: { ben, partnerId, partner, gerek, kalan (ms, 24 saate), hazir } */
export function yumurtaDurumu(y, { benId, simdi }) {
  const p = isitanlar(y).find((k) => k.id !== benId) || null;
  const dogum = zaman(y?.dogum);
  return {
    ben: isitmaSayisi(y?.isitma?.[benId]),
    partnerId: p?.id || null,
    partner: p?.n || 0,
    gerek: ISITMA_GEREK,
    kalan: Number.isFinite(dogum) ? Math.max(0, dogum + YUMURTA_SURE - simdi) : YUMURTA_SURE,
    hazir: catlamaHazir(y, simdi),
  };
}

/** Çatlama yaması: küçük aşama, başlangıç ihtiyaçları, renk (oda kimliğinden). */
export function catlamaYamasi(y, { roomId, simdi }) {
  const at = iso(simdi);
  const ihtiyac = {};
  for (const ad of IHTIYACLAR) ihtiyac[ad] = { v: BASLANGIC_IHTIYAC[ad], t: at };
  return { asama: 'kucuk', catlama: at, renk: renkSec(roomId), ihtiyac, uyku: null };
}

// ---------- Büyüme ----------

/** -> { hazir, kalanGun, toplam, gerekToplam, gerekKisi, kisiler: [{ id, puan }] (çoktan aza) } */
export function buyumeDurumu(y, simdi) {
  const kisiler = Object.entries(y?.puan || {})
    .map(([id, puan]) => ({ id, puan }))
    .sort((a, b) => b.puan - a.puan || (a.id < b.id ? -1 : 1));
  const toplam = kisiler.reduce((n, k) => n + k.puan, 0);
  const catlama = zaman(y?.catlama);
  const gecen = Number.isFinite(catlama) ? simdi - catlama : 0;
  const kalanGun = Math.max(0, Math.ceil((BUYUME_GUN * GUN - gecen) / GUN));
  const hazir = y?.asama === 'kucuk' && Number.isFinite(catlama) && gecen >= BUYUME_GUN * GUN
    && toplam >= BUYUME_TOPLAM && kisiler.filter((k) => k.puan >= BUYUME_KISI).length >= 2;
  return { hazir, kalanGun, toplam, gerekToplam: BUYUME_TOPLAM, gerekKisi: BUYUME_KISI, kisiler };
}

export function buyumeYamasi(simdi) {
  return { asama: 'buyuk', buyume: iso(simdi) };
}

// ---------- Metinler ----------

/** Ad: boşluklar teke iner, en çok 20 harf (emoji bölünmez). -> { ad } | { hata } */
export function adTemizle(s) {
  const temiz = String(s ?? '').replace(/\s+/g, ' ').trim();
  if (!temiz) return { hata: 'Bir ad yaz.' };
  return { ad: [...temiz].slice(0, AD_MAX).join('').trim() };
}

/** "5 saatlik", "3 günlük", "Yeni doğdu". */
export function yasMetni(y, simdi) {
  if (y?.asama === 'yumurta') {
    const gecen = simdi - zaman(y.dogum);
    if (!(gecen >= SAAT)) return 'Yeni yumurta';
    if (gecen < GUN) return `${Math.floor(gecen / SAAT)} saatlik`;
    return `${Math.floor(gecen / GUN)} günlük`;
  }
  const gecen = simdi - zaman(y?.catlama || y?.dogum);
  if (!(gecen >= GUN)) return 'Yeni doğdu';
  return `${Math.floor(gecen / GUN)} günlük`;
}

/** Bekleme: "12 dk", "1 sa 15 dk". */
export function kalanMetni(ms) {
  if (!(ms > 0)) return '';
  const dk = Math.ceil(ms / DK);
  if (dk < 60) return `${dk} dk`;
  const sa = Math.floor(dk / 60);
  return dk % 60 ? `${sa} sa ${dk % 60} dk` : `${sa} sa`;
}

/** Yumurta: "14 saat kaldı", "20 dk kaldı". */
export function saatKalanMetni(ms) {
  if (!(ms > 0)) return '';
  return ms >= SAAT ? `${Math.ceil(ms / SAAT)} saat kaldı` : `${Math.ceil(ms / DK)} dk kaldı`;
}

// ---------- Hatırlatıcı ve bildirim ----------

/** Tokluğun 25'e ineceği an (ms). Zaten 25 altındaysa ya da yumurtaysa null. Uyku yarı hız. */
export function acikmaZamani(y, simdi) {
  if (!y || y.asama === 'yumurta') return null;
  let x = ihtiyacDegeri(y.ihtiyac?.tokluk, 'tokluk', y.uyku, simdi);
  if (x < DUSUK) return null;
  let t = simdi;
  if (uyuyorMu(y.uyku, simdi)) {
    const bit = zaman(y.uyku.bit);
    const hiz = DUSUS.tokluk / 2;
    const gerek = ((x - DUSUK) / hiz) * SAAT;
    if (t + gerek <= bit) return Math.round(t + gerek);
    x -= (hiz * (bit - t)) / SAAT;
    t = bit;
  }
  return Math.round(t + ((x - DUSUK) / DUSUS.tokluk) * SAAT);
}

/** Yerel hatırlatıcılar (mobil.js yerelHatirlaticilar, grup 'yavru'). */
export function hatirlaticiOlaylari(y, simdi) {
  if (!y || y.asama === 'yumurta') return [];
  const out = [];
  const ac = acikmaZamani(y, simdi);
  if (ac != null) out.push({ id: 'ac', baslik: 'Yavrumuz', metin: 'Yavrunuz acıktı 🍼', zaman: iso(ac) });
  if (uyuyorMu(y.uyku, simdi)) out.push({ id: 'uyandi', baslik: 'Yavrumuz', metin: 'Yavrunuz uyandı ☀️', zaman: y.uyku.bit });
  return out;
}

const ONEMLI = new Set(['catlama', 'buyume', 'ad']);

/** Partnere anlık bildirim: kişi başına 30 dk'da bir; çatlama, büyüme ve ad her zaman. son = ms | null. */
export function bildirimGerekli({ son = null, simdi, eylem = null }) {
  if (ONEMLI.has(eylem)) return true;
  return !Number.isFinite(son) || simdi - son >= BILDIRIM_ARALIK;
}

/** Bildirim metni: "Gül yavrunuzu besledi 🍼". */
export function bildirimMetni({ ad, eylem, deger = '', yavruAd = '' }) {
  const kim = String(ad || '').trim() || 'Sevgilin';
  const e = EYLEMLER[eylem];
  switch (eylem) {
    case 'mama': case 'meyve': case 'tatli': return `${kim} yavrunuzu besledi ${e.emoji}`;
    case 'oyna': return `${kim} yavrunuzla oynadı ⚽`;
    case 'yika': return `${kim} yavrunuzu yıkadı 🫧`;
    case 'sev': return `${kim} yavrunuzu sevdi 🤍`;
    case 'uyut': return `${kim} yavrunuzu uyuttu 🌙`;
    case 'uyandir': return `${kim} yavrunuzu uyandırdı ☀️`;
    case 'isit': return `${kim} yumurtanızı ısıttı 🥚`;
    case 'catlama': return 'Yumurtanız çatladı! Yavrunuz dünyaya geldi 🐣';
    case 'buyume': return `${String(yavruAd || '').trim() || 'Yavrunuz'} büyüdü ✨`;
    case 'ad': return `${kim} yavrunuza “${deger}” adını verdi 💛`;
    default: return '';
  }
}

/** Son bakımlar satırı: "Gül besledi 🍼", "Sen yıkadın 🫧". ad === 'Sen' ise ikinci tekil. */
export function bakimSatiri({ eylem, ad, deger = '' }) {
  const sen = ad === 'Sen';
  if (eylem === 'catlama') return 'Yumurta çatladı 🐣';
  if (eylem === 'buyume') return 'Yavrumuz büyüdü ✨';
  if (eylem === 'ad') return `${ad} adını “${deger}” ${sen ? 'koydun' : 'koydu'}`;
  const e = eylem === 'isit' ? ISIT : EYLEMLER[eylem];
  if (!e) return '';
  return `${ad} ${e.fiil[sen ? 1 : 0]} ${e.emoji}`;
}

/** İki cihaz yumurtayı aynı anda oluşturduysa en erken doğum kalsın: düzeltme gerekirse benimki, yoksa null. */
export function dogumBirlestir(mevcut, benim) {
  const b = zaman(benim);
  if (!Number.isFinite(b)) return null;
  const m = zaman(mevcut);
  return !Number.isFinite(m) || b < m ? benim : null;
}
