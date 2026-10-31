// Aşk Kuponları: saf mantık (DOM yok; Node'da test edilir). Tür 'kupon', id uuid (SOZLESME §26):
// { baslik, emoji, aciklama?, veren, alan, durum: 'verildi'|'kullanildi'|'tamam', verildi, kullanildi?, tamam?, son? }
// son = son gün 'YYYY-MM-DD' (o gün dahil kullanılabilir).
import { parseDay, daysBetween } from '../../js/core/gunler.js';

export const BASLIK_MAX = 50;
export const ACIKLAMA_MAX = 200;

/** Hazır kuponlar. id yalnız arayüz içindir; belgeye başlık ve emoji yazılır. */
export const SABLONLAR = [
  { id: 'kahvalti', emoji: '🥐', baslik: 'Yatağa kahvaltı', aciklama: 'Gözünü açtığında tepsi hazır: çay, simit, bir de öpücük.' },
  { id: 'masaj', emoji: '💆', baslik: 'Masaj', aciklama: 'Yirmi dakika sırt ve omuz masajı. Söylenmek yok.' },
  { id: 'film', emoji: '🎬', baslik: 'Film seçme hakkı', aciklama: 'Bu akşamın filmini sen seçiyorsun, itiraz yok.' },
  { id: 'bulasik', emoji: '🍽️', baslik: 'Bulaşık benden', aciklama: 'Bir akşamın bulaşığı tamamen bende.' },
  { id: 'dilek', emoji: '🌠', baslik: 'Bir dilek', aciklama: 'Makul her dileğin kabulümdür.' },
  { id: 'sarilma', emoji: '🤗', baslik: 'Sarılma seansı', aciklama: 'Sen "yeter" diyene kadar sarılıyoruz.' },
  { id: 'yemek', emoji: '🍝', baslik: 'Akşam yemeği benden', aciklama: 'İster pişiririm ister ısmarlarım, sen yalnız masaya otur.' },
  { id: 'tembellik', emoji: '🛋️', baslik: 'Tembellik günü', aciklama: 'Bütün gün kanepe. İşleri ben hallederim.' },
  { id: 'kahve', emoji: '☕', baslik: 'Kahven benden', aciklama: 'En sevdiğin kahve, tam istediğin gibi.' },
  { id: 'piknik', emoji: '🧺', baslik: 'Piknik', aciklama: 'Sepeti ben hazırlarım, yeri sen seç.' },
  { id: 'liste', emoji: '🎧', baslik: 'Sana özel çalma listesi', aciklama: 'Senin için seçtiğim şarkılar, sırasıyla.' },
  { id: 'sofor', emoji: '🚗', baslik: 'Şoförün olurum', aciklama: 'Nereye istersen götürür, getiririm.' },
  { id: 'cicek', emoji: '💐', baslik: 'Çiçek sürprizi', aciklama: 'Bir demet çiçek, sebepsiz.' },
  { id: 'sonsoz', emoji: '🙊', baslik: 'Son söz senin', aciklama: 'Bir tartışmada son sözü sen söylersin.' },
  { id: 'evisi', emoji: '🧹', baslik: 'Ev işi benden', aciklama: 'Seçtiğin bir ev işini ben yaparım.' },
  { id: 'telefonsuz', emoji: '📵', baslik: 'Telefonsuz akşam', aciklama: 'Telefonlar kapalı, bir akşam yalnız ikimiz.' },
  { id: 'yuruyus', emoji: '🌅', baslik: 'Gün batımı yürüyüşü', aciklama: 'El ele, acele etmeden.' },
  { id: 'tatli', emoji: '🍫', baslik: 'Tatlı krizi', aciklama: 'Canın ne tatlı isterse hemen getiririm.' },
  { id: 'mektup', emoji: '💌', baslik: 'Elle yazılmış mektup', aciklama: 'Kâğıda, kalemle, sana.' },
  { id: 'uyku', emoji: '😴', baslik: 'Uyku hakkı', aciklama: 'Bir hafta sonu sabahı istediğin kadar uyu, kimse uyandırmaz.' },
];

/** Kendi kuponunu yazarken seçilebilen emojiler. */
export const EMOJILER = ['💝', '🌹', '🎁', '✨', '🫶', '🍓', '🍿', '🎈', '🌙', '🧸', '💃', '🍰'];

const AY = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const uzunluk = (s) => [...String(s ?? '')].length;
const zaman = (s) => {
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : 0;
};
const isoOf = (simdi) => new Date(simdi instanceof Date ? simdi.getTime() : simdi).toISOString();

export function sablonById(id) {
  return SABLONLAR.find((s) => s.id === id) || null;
}

/** Emoji seçenekleri: seçili emoji listede yoksa başa gelir. */
export function emojiSecenekleri(secili) {
  return secili && !EMOJILER.includes(secili) ? [secili, ...EMOJILER] : [...EMOJILER];
}

/** -> Türkçe hata | null. bugun = 'YYYY-MM-DD' (yerel). */
export function kuponDogrula({ baslik, emoji, aciklama, son } = {}, bugun) {
  const b = String(baslik ?? '').trim();
  if (!b) return 'Kuponuna bir ad ver.';
  if (uzunluk(b) > BASLIK_MAX) return `Kupon adı en çok ${BASLIK_MAX} karakter olabilir.`;
  if (!String(emoji ?? '').trim()) return 'Bir emoji seç.';
  if (uzunluk(String(aciklama ?? '').trim()) > ACIKLAMA_MAX) return `Açıklama en çok ${ACIKLAMA_MAX} karakter olabilir.`;
  if (son) {
    if (!parseDay(son)) return 'Son gün için geçerli bir tarih seç.';
    if (son < bugun) return 'Son gün geçmiş bir tarih olamaz.';
  }
  return null;
}

/** Formdan kaydedilecek veri. Boş açıklama ve son gün yazılmaz. */
export function kuponVerisi({ baslik, emoji, aciklama, son } = {}, { veren, alan, simdi = Date.now() } = {}) {
  const out = { baslik: String(baslik ?? '').trim(), emoji: String(emoji ?? '').trim() };
  const a = String(aciklama ?? '').trim();
  if (a) out.aciklama = a;
  out.veren = veren;
  out.alan = alan;
  out.durum = 'verildi';
  out.verildi = isoOf(simdi);
  if (son) out.son = son;
  return out;
}

/** Oda iki kişiliktir: veren bensem 'verdigim', değilse 'bana'. */
export function yon(doc, myId) {
  return doc?.data?.veren === myId ? 'verdigim' : 'bana';
}

/** Verilmiş ama kullanılmamış kuponun son günü geçtiyse true. */
export function suresiDoldu(data, bugun) {
  return (data?.durum || 'verildi') === 'verildi' && !!data?.son && data.son < bugun;
}

/** -> 'hazir' | 'suresi' | 'kullanildi' | 'tamam' */
export function gorunum(data, bugun) {
  if (data?.durum === 'tamam') return 'tamam';
  if (data?.durum === 'kullanildi') return 'kullanildi';
  return suresiDoldu(data, bugun) ? 'suresi' : 'hazir';
}

/** Alan kişi, geçerli kuponu kullanabilir. */
export function kullanabilir(doc, myId, bugun) {
  return yon(doc, myId) === 'bana' && gorunum(doc?.data, bugun) === 'hazir';
}

/** Veren kişi, kullanılan kuponu "yerine getirdim" diye kapatabilir. */
export function tamamlayabilir(doc, myId) {
  return yon(doc, myId) === 'verdigim' && doc?.data?.durum === 'kullanildi';
}

export const kullanYamasi = (simdi = Date.now()) => ({ durum: 'kullanildi', kullanildi: isoOf(simdi) });
export const tamamYamasi = (simdi = Date.now()) => ({ durum: 'tamam', tamam: isoOf(simdi) });
export const geriAlYamasi = () => ({ durum: 'kullanildi', tamam: null });

const BOLUM_ADLARI = {
  bana: { hazir: 'Kullanabileceklerin', kullanildi: 'Kullandıkların', bitti: 'Tamamlananlar' },
  verdiklerim: { kullanildi: 'Sıra sende', hazir: 'Henüz kullanılmadı', bitti: 'Tamamlananlar' },
};
const BOLUM_SIRASI = { bana: ['hazir', 'kullanildi', 'bitti'], verdiklerim: ['kullanildi', 'hazir', 'bitti'] };

/**
 * Sekmedeki kuponlar bölüm bölüm; boş bölüm gelmez. sekme: 'bana' | 'verdiklerim'.
 * -> [{ id: 'hazir'|'kullanildi'|'bitti', baslik, docs }]
 * hazir: son günü yakın olan önce, sonra yeni verilen önce. kullanildi: en uzun bekleyen önce. bitti: en yeni önce.
 */
export function bolumler(docs, myId, sekme, bugun) {
  const istenen = sekme === 'verdiklerim' ? 'verdigim' : 'bana';
  const gruplar = { hazir: [], kullanildi: [], bitti: [] };
  for (const d of docs || []) {
    if (!d?.data || yon(d, myId) !== istenen) continue;
    const g = gorunum(d.data, bugun);
    gruplar[g === 'tamam' || g === 'suresi' ? 'bitti' : g].push(d);
  }
  gruplar.hazir.sort((a, b) => {
    const sa = a.data.son || '9999-12-31';
    const sb = b.data.son || '9999-12-31';
    if (sa !== sb) return sa < sb ? -1 : 1;
    return zaman(b.data.verildi || b.created_at) - zaman(a.data.verildi || a.created_at);
  });
  gruplar.kullanildi.sort((a, b) => zaman(a.data.kullanildi) - zaman(b.data.kullanildi));
  const bitis = (d) => zaman(d.data.tamam) || zaman(d.data.son) || zaman(d.data.verildi || d.created_at);
  gruplar.bitti.sort((a, b) => bitis(b) - bitis(a));
  const ad = BOLUM_ADLARI[sekme === 'verdiklerim' ? 'verdiklerim' : 'bana'];
  return BOLUM_SIRASI[sekme === 'verdiklerim' ? 'verdiklerim' : 'bana']
    .filter((id) => gruplar[id].length)
    .map((id) => ({ id, baslik: ad[id], docs: gruplar[id] }));
}

/** Sekme rozetleri: bana = kullanılabilir kupon, verdiklerim = yerine getirilmeyi bekleyen. */
export function rozetler(docs, myId, bugun) {
  let bana = 0;
  let verdiklerim = 0;
  for (const d of docs || []) {
    if (kullanabilir(d, myId, bugun)) bana += 1;
    else if (tamamlayabilir(d, myId)) verdiklerim += 1;
  }
  return { bana, verdiklerim };
}

/** Son gün metni (kullanılmamış kupon için). */
export function sonTarihYazi(son, bugun) {
  const p = parseDay(son);
  if (!p) return '';
  const n = daysBetween(bugun, son);
  if (n < 0) return 'Süresi doldu';
  if (n === 0) return 'Bugün son gün';
  if (n === 1) return 'Yarın son gün';
  if (n <= 7) return `${n} gün kaldı`;
  const yil = parseDay(bugun)?.y;
  return `Son gün ${p.d} ${AY[p.m - 1]}${yil && yil !== p.y ? ` ${p.y}` : ''}`;
}

/** Bildirim başlığı ve metni. olay: 'verildi' | 'kullanildi' | 'tamam'. ad = olayı yapan kişinin adı. */
export function bildirimMetni(olay, ad, data) {
  const kim = String(ad || '').trim() || 'Sevgilin';
  const baslik = String(data?.baslik || '').trim();
  const emoji = String(data?.emoji || '').trim();
  const son = emoji ? ` ${emoji}` : '';
  if (olay === 'kullanildi') return { baslik: 'Kupon kullanıldı 🎟️', metin: `${kim} '${baslik}' kuponunu kullandı${son}` };
  if (olay === 'tamam') return { baslik: 'Söz yerine geldi 💛', metin: `${kim} '${baslik}' kuponunun sözünü tuttu${son}` };
  return { baslik: 'Sana bir kupon var 🎟️', metin: `${kim} sana '${baslik}' kuponu verdi${son}` };
}

/** Kupon rengi: kimliğe göre kararlı 1–6 (css --tint-N). */
export function renkSirasi(id) {
  let h = 0;
  for (const ch of String(id || '')) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return (h % 6) + 1;
}
