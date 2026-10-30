// Mektuplar: saf mantık (DOM yok; Node'da test edilir). data = 'mektup' türü (SOZLESME §17):
// { baslik, metin, kime: clientId, acilis?: ISO, acildi?: ISO, zarf?: renk adı }
import { parseDay, daysInMonth, countdown } from '../../js/core/gunler.js';

export const MAX_BASLIK = 80;
export const MAX_METIN = 6000;
export const SABAH_SAATI = 9;

/** Zarf renkleri: id belgeye yazılır, renk CSS'te (style.css) değişkenle çizilir. */
export const ZARFLAR = [
  { id: 'gul', ad: 'Gül' },
  { id: 'erik', ad: 'Erik' },
  { id: 'seftali', ad: 'Şeftali' },
  { id: 'adacayi', ad: 'Adaçayı' },
  { id: 'gece', ad: 'Gece mavisi' },
  { id: 'krem', ad: 'Krem' },
];

const AY = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const pad = (n) => String(n).padStart(2, '0');
const ms = (v) => (v instanceof Date ? v.getTime() : Number(v));
const zaman = (s) => {
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : 0;
};

export function zarfRengi(id) {
  return ZARFLAR.some((z) => z.id === id) ? id : ZARFLAR[0].id;
}

/**
 * Mektubu yazanın clientId'si: data.kimden. (belge.author son yazandır; alıcı 'acildi' yazınca değişir.
 * kimden'i olmayan eski belgede author'a düşülür.)
 */
export function yazan(doc) {
  return doc?.data?.kimden || doc?.author || null;
}

/**
 * Yön: yazan bensem 'giden', değilse 'gelen'. Oda iki kişiliktir; 'kime' kayıt içindir.
 * (Aynı kişinin ikinci cihazı ayrı clientId taşır; o cihazda kendi mektupları 'gelen' görünür.)
 */
export function yon(doc, myId) {
  return yazan(doc) === myId ? 'giden' : 'gelen';
}

/** Açılış zamanı gelmediyse kilitli. */
export function kilitliMi(data, simdi = Date.now()) {
  const t = Date.parse(data?.acilis);
  return Number.isFinite(t) && t > ms(simdi);
}

/** gelen: 'kilitli' | 'yeni' | 'okundu';  giden: 'kilitli' | 'gonderildi' | 'okundu' */
export function durum(doc, myId, simdi = Date.now()) {
  const d = doc?.data || {};
  if (d.acildi) return 'okundu';
  if (kilitliMi(d, simdi)) return 'kilitli';
  return yon(doc, myId) === 'gelen' ? 'yeni' : 'gonderildi';
}

const SIRA = { yeni: 0, kilitli: 1, okundu: 2, gonderildi: 0 };

/** -> { gelen, giden }. Gelen: yeni (yeni önce) → kilitli (en yakın açılış önce) → okundu. Giden: yeniden eskiye. */
export function ayir(docs, myId, simdi = Date.now()) {
  const gelen = [];
  const giden = [];
  for (const d of docs || []) (yon(d, myId) === 'giden' ? giden : gelen).push(d);
  const yeniOnce = (a, b) => zaman(b.created_at) - zaman(a.created_at);
  gelen.sort((a, b) => {
    const sa = SIRA[durum(a, myId, simdi)];
    const sb = SIRA[durum(b, myId, simdi)];
    if (sa !== sb) return sa - sb;
    if (sa === SIRA.kilitli) return zaman(a.data.acilis) - zaman(b.data.acilis);
    return yeniOnce(a, b);
  });
  giden.sort(yeniOnce);
  return { gelen, giden };
}

/** countdown() sonucu → '3 gün 4 sa' | '2 sa 5 dk' | '5 dk 6 sn' | '9 sn' */
export function geriSayimYazi(cd) {
  if (!cd) return '';
  if (cd.days > 0) return `${cd.days} gün ${cd.hours} sa`;
  if (cd.hours > 0) return `${cd.hours} sa ${cd.minutes} dk`;
  if (cd.minutes > 0) return `${cd.minutes} dk ${cd.seconds} sn`;
  return `${cd.seconds} sn`;
}

/** Kilitli mektubun kalan süresi metni; kilitli değilse ''. */
export function kalanYazi(data, simdi = Date.now()) {
  if (!kilitliMi(data, simdi)) return '';
  return geriSayimYazi(countdown(data.acilis, new Date(ms(simdi))));
}

/** ISO → '14 Şubat 2027, 09:05' (yerel saat). */
export function acilisYazi(isoStr) {
  const t = Date.parse(isoStr);
  if (!Number.isFinite(t)) return '';
  const d = new Date(t);
  return `${d.getDate()} ${AY[d.getMonth()]} ${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** -> Türkçe hata | null */
export function mektupDogrula({ baslik, metin, acilis } = {}, simdi = Date.now()) {
  const b = String(baslik ?? '').trim();
  if (!b) return 'Mektubuna bir başlık ver.';
  if ([...b].length > MAX_BASLIK) return `Başlık en çok ${MAX_BASLIK} karakter olabilir.`;
  const m = String(metin ?? '').trim();
  if (!m) return 'Mektup boş kalmasın.';
  if ([...m].length > MAX_METIN) return `Mektup en çok ${MAX_METIN} karakter olabilir.`;
  if (acilis != null && acilis !== '') {
    const t = Date.parse(acilis);
    if (!Number.isFinite(t)) return 'Açılış için geçerli bir tarih seç.';
    if (t <= ms(simdi)) return 'Açılış zamanı ileri bir tarih olmalı.';
  }
  return null;
}

const sabah = (y, m, d) => new Date(y, m - 1, Math.min(d, daysInMonth(y, m)), SABAH_SAATI, 0, 0, 0);

/** Bir sonraki yıl dönümü sabahı (09:00, yerel). -> { iso, n } | null. 29 Şubat → artık olmayan yılda 28 Şubat. */
export function yilDonumuAcilis(baslangic, simdi = Date.now()) {
  const s = parseDay(baslangic);
  if (!s) return null;
  const now = ms(simdi);
  for (let y = Math.max(s.y + 1, new Date(now).getFullYear()); y < s.y + 200; y++) {
    const t = sabah(y, s.m, s.d);
    if (t.getTime() > now) return { iso: t.toISOString(), n: y - s.y };
  }
  return null;
}

/** Hazır açılış seçenekleri: [{ ad, iso }] */
export function hazirAcilislar(simdi = Date.now(), baslangic = null) {
  const n = new Date(ms(simdi));
  const y = n.getFullYear(), m = n.getMonth() + 1, d = n.getDate();
  const ileri = (yy, mm, dd) => {
    const t = new Date(yy, mm - 1, 1);
    return sabah(t.getFullYear(), t.getMonth() + 1, dd);
  };
  const out = [
    { ad: 'Yarın sabah', iso: new Date(y, m - 1, d + 1, SABAH_SAATI).toISOString() },
    { ad: '1 ay sonra', iso: ileri(y, m + 1, d).toISOString() },
    { ad: '1 yıl sonra', iso: ileri(y + 1, m, d).toISOString() },
  ];
  const yd = yilDonumuAcilis(baslangic, simdi);
  if (yd) out.push({ ad: `${yd.n}. yıl dönümümüzde`, iso: yd.iso });
  return out;
}

/** ISO → datetime-local girdi değeri 'YYYY-MM-DDTHH:MM' (yerel). */
export function girdiDegeri(isoStr) {
  const t = Date.parse(isoStr);
  if (!Number.isFinite(t)) return '';
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** datetime-local değeri (yerel) → ISO | null */
export function girdidenIso(deger) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(deger || ''));
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

/** Bildirimde mektubun içeriği gösterilmez: başlık ya da kapsülün açılış zamanı. */
export function bildirimMetni(data) {
  return data?.acilis ? `Açılış: ${acilisYazi(data.acilis)}` : String(data?.baslik || '');
}

/**
 * Özel isme Türkçe hâl eki (kesme işaretiyle): ek 'e' (yönelme) ya da 'den' (ayrılma).
 * Gül → Gül'e / Gül'den; Ayşe → Ayşe'ye / Ayşe'den; Can → Can'a / Can'dan; Ahmet → Ahmet'e / Ahmet'ten.
 */
export function ek(ad, tur) {
  const s = String(ad || '').trim();
  if (!s) return '';
  const k = s.toLocaleLowerCase('tr');
  const unluler = k.match(/[aeıioöuü]/g);
  const son = unluler ? unluler[unluler.length - 1] : 'e';
  const v = 'aıou'.includes(son) ? 'a' : 'e';
  const sonHarf = k[k.length - 1];
  const unluyleBiter = 'aeıioöuü'.includes(sonHarf);
  if (tur === 'den') return `${s}'${'fstkçşhp'.includes(sonHarf) ? 't' : 'd'}${v}n`;
  return `${s}'${unluyleBiter ? 'y' : ''}${v}`;
}

/** Formdan kaydedilecek veri. kime / kimden yoksa alan yazılmaz. */
export function mektupVerisi(form, kime, kimden = null) {
  const out = { baslik: String(form.baslik || '').trim(), metin: String(form.metin || '').trim() };
  if (kime) out.kime = kime;
  if (kimden) out.kimden = kimden;
  out.zarf = zarfRengi(form.zarf);
  if (form.acilis) out.acilis = form.acilis;
  return out;
}
