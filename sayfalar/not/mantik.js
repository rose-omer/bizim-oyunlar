// Not Bırak: saf mantık (DOM yok; Node'da test edilir). Tür 'not', id uuid (SOZLESME §26):
// { tur: 'yazi'|'cizim'|'foto', metin?, foto? (url), kime, kimden, surpriz: bool, acildi?: ISO }
// kimden = yazan (belge.author son yazandır; alıcı 'acildi' yazınca değişir).
export const TUR = 'not';
export const METIN_MAX = 200;
export const NOT_TURLERI = ['yazi', 'cizim', 'foto'];

const uzunluk = (s) => [...String(s ?? '')].length;
const zaman = (s) => {
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : 0;
};

/** Notu bırakanın clientId'si. */
export function yazan(doc) {
  return doc?.data?.kimden || doc?.author || null;
}

/** 'giden' (ben bıraktım) | 'gelen'. */
export function yon(doc, myId) {
  return yazan(doc) === myId ? 'giden' : 'gelen';
}

/** Bana gelen, sürpriz ve henüz açılmamış: kapalı kart. */
export function kapaliMi(doc, myId) {
  const d = doc?.data || {};
  return yon(doc, myId) === 'gelen' && d.surpriz === true && !d.acildi;
}

/** Notlar en yeni önce (gelen ve giden birlikte). */
export function siralanmis(docs) {
  return [...(docs || [])].filter((d) => d?.data).sort((a, b) => zaman(b.created_at) - zaman(a.created_at));
}

/** Sevgilinin bana bıraktığı en son not (ana sayfa kartı) | null. */
export function sonGelen(docs, myId) {
  return siralanmis(docs).find((d) => yon(d, myId) === 'gelen') || null;
}

/** -> Türkçe hata | null. gorselVar: çizim/fotoğraf hazır mı. */
export function notDogrula({ tur, metin, gorselVar = false } = {}) {
  if (!NOT_TURLERI.includes(tur)) return 'Not türünü seç.';
  const m = String(metin ?? '').trim();
  if (uzunluk(m) > METIN_MAX) return `Not en çok ${METIN_MAX} karakter olabilir.`;
  if (tur === 'yazi' && !m) return 'Notuna birkaç kelime yaz.';
  if (tur === 'cizim' && !gorselVar) return 'Önce bir şey çiz.';
  if (tur === 'foto' && !gorselVar) return 'Önce bir fotoğraf seç.';
  return null;
}

/** Kaydedilecek veri. Boş metin ve yazı notunda foto yazılmaz. */
export function notVerisi({ tur, metin, foto, surpriz } = {}, { kime, kimden } = {}) {
  const out = { tur };
  const m = String(metin ?? '').trim();
  if (m) out.metin = m;
  if (tur !== 'yazi' && foto) out.foto = foto;
  if (kime) out.kime = kime;
  if (kimden) out.kimden = kimden;
  out.surpriz = surpriz === true;
  return out;
}

/** Sürpriz açılınca yazılan yama. */
export function acYamasi(simdi = new Date()) {
  return { acildi: new Date(simdi).toISOString() };
}

/** Metni n karakterde (kod noktası) keser, sonuna … koyar. */
export function kisalt(s, n) {
  const k = [...String(s ?? '').replace(/\s+/g, ' ').trim()];
  return k.length <= n ? k.join('') : `${k.slice(0, Math.max(1, n - 1)).join('').trimEnd()}…`;
}

/** Sevgiliye bildirim. Sürpriz notun içeriği ve çizim/fotoğraf ayrıntısı bildirime girmez. */
export function bildirimMetni(data, ad) {
  const kim = String(ad || '').trim() || 'Sevgilin';
  const baslik = `${kim} sana bir not bıraktı ✍️`;
  let metin;
  if (data?.surpriz) metin = 'Sürpriz! Açmak için dokun 🎁';
  else if (data?.tur === 'cizim') metin = 'Sana bir çizim yaptı 🎨';
  else if (data?.tur === 'foto') metin = 'Sana bir fotoğraf bıraktı 📷';
  else metin = kisalt(data?.metin, 90);
  return { baslik, metin };
}

/** Giden sürprizin durumu: 'kapali' (henüz açmadı) | 'acildi' | null (sürpriz değil). */
export function surprizDurumu(data) {
  if (!data?.surpriz) return null;
  return data.acildi ? 'acildi' : 'kapali';
}
