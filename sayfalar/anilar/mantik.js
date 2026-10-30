// Anılar: saf mantık (DOM yok; Node'da test edilir). Belge = veri.js belgesi, data = 'ani' türü (SOZLESME §17).
import { parseDay, daysInMonth } from '../../js/core/gunler.js';

export const MAX_FOTO = 10;
export const MAX_BASLIK = 80;
export const MAX_YER = 80;
export const MAX_NOT = 2000;
export const MAX_ETIKET = 12;
export const MAX_ETIKET_UZUNLUK = 24;

export const AY_ADLARI = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

const zaman = (s) => {
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : 0;
};

/** 'YYYY-MM-DD' → '12 Ekim 2025' (yil:false → '12 Ekim'). Geçersizse ''. */
export function gunYazi(gun, { yil = true } = {}) {
  const p = parseDay(gun);
  if (!p) return '';
  return `${p.d} ${AY_ADLARI[p.m - 1]}${yil ? ` ${p.y}` : ''}`;
}

/** Arama için Türkçe küçük harf, kırpılmış. */
export function aramaMetni(s) {
  return String(s ?? '').trim().toLocaleLowerCase('tr');
}

const etiketleri = (d) => (Array.isArray(d?.data?.etiketler) ? d.data.etiketler : []);

/** { etiket?, yil?, ara? } süzgeci. Sıra korunur. */
export function filtrele(docs, { etiket = '', yil = '', ara = '' } = {}) {
  const e = aramaMetni(etiket);
  const y = yil ? Number(yil) : 0;
  const q = aramaMetni(ara);
  return (docs || []).filter((d) => {
    const data = d?.data || {};
    if (e && !etiketleri(d).some((t) => aramaMetni(t) === e)) return false;
    if (y && parseDay(data.tarih)?.y !== y) return false;
    if (q) {
      const metin = [data.baslik, data.yer, data.not, ...etiketleri(d)].map(aramaMetni).join('\n');
      if (!metin.includes(q)) return false;
    }
    return true;
  });
}

/** Yeniden eskiye: tarih, sonra oluşturma zamanı. Tarihi bozuk olanlar en sonda. */
export function siralaYeniOnce(docs) {
  return [...(docs || [])].sort((a, b) => {
    const ta = parseDay(a?.data?.tarih) ? a.data.tarih : '';
    const tb = parseDay(b?.data?.tarih) ? b.data.tarih : '';
    if (ta !== tb) return ta < tb ? 1 : -1;
    return zaman(b?.created_at) - zaman(a?.created_at);
  });
}

/**
 * Zaman çizelgesi: [{ yil, sayi, aylar: [{ ay, ad, anilar: [belge] }] }], yeniden eskiye.
 * Tarihi geçersiz belgeler atlanır.
 */
export function zamanCizelgesi(docs) {
  const out = [];
  for (const d of siralaYeniOnce(docs)) {
    const p = parseDay(d?.data?.tarih);
    if (!p) continue;
    let y = out[out.length - 1];
    if (!y || y.yil !== p.y) out.push((y = { yil: p.y, sayi: 0, aylar: [] }));
    let m = y.aylar[y.aylar.length - 1];
    if (!m || m.ay !== p.m) y.aylar.push((m = { ay: p.m, ad: AY_ADLARI[p.m - 1], anilar: [] }));
    m.anilar.push(d);
    y.sayi += 1;
  }
  return out;
}

/**
 * "N yıl önce bugün": aynı gün-ay, geçmiş yıllar. 29 Şubat anısı artık olmayan yılda 28 Şubat'ta gelir.
 * -> [{ yilOnce, ani }] en yakın yıl önce.
 */
export function buGunGecmisYillar(docs, bugun) {
  const t = parseDay(bugun);
  if (!t) return [];
  const out = [];
  for (const d of docs || []) {
    const p = parseDay(d?.data?.tarih);
    if (!p || p.y >= t.y || p.m !== t.m) continue;
    const gun = Math.min(p.d, daysInMonth(t.y, t.m));
    if (gun !== t.d) continue;
    out.push({ yilOnce: t.y - p.y, ani: d });
  }
  return out.sort((a, b) => a.yilOnce - b.yilOnce || zaman(b.ani.created_at) - zaman(a.ani.created_at));
}

export function buGunBasligi(yilOnce) {
  return yilOnce === 1 ? 'Geçen yıl bugün' : `${yilOnce} yıl önce bugün`;
}

/** Tüm etiketler: [{ etiket, sayi }] çoktan aza; büyük/küçük harf birleşir, ilk görülen yazım kalır. */
export function tumEtiketler(docs) {
  const map = new Map();
  for (const d of docs || []) {
    for (const t of etiketleri(d)) {
      const k = aramaMetni(t);
      if (!k) continue;
      const cur = map.get(k);
      if (cur) cur.sayi += 1;
      else map.set(k, { etiket: String(t).trim(), sayi: 1 });
    }
  }
  return [...map.values()].sort((a, b) => b.sayi - a.sayi || a.etiket.localeCompare(b.etiket, 'tr'));
}

/** Anıların yılları, yeniden eskiye. */
export function yillar(docs) {
  const s = new Set();
  for (const d of docs || []) {
    const p = parseDay(d?.data?.tarih);
    if (p) s.add(p.y);
  }
  return [...s].sort((a, b) => b - a);
}

/** Albüm: tüm fotoğraflar [{ url, aniId, sira, baslik, tarih }]; yeni anı önce, anı içi sıra korunur. */
export function albumFotolari(docs) {
  const out = [];
  for (const d of siralaYeniOnce(docs)) {
    const fotolar = Array.isArray(d?.data?.fotolar) ? d.data.fotolar : [];
    fotolar.forEach((url, sira) => {
      if (typeof url === 'string' && url) out.push({ url, aniId: d.id, sira, baslik: d.data.baslik || '', tarih: d.data.tarih || '' });
    });
  }
  return out;
}

/** Etiketi temizler: '#' ve fazla boşluk gider, en çok 24 karakter. */
export function etiketTemizle(s) {
  return [...String(s ?? '').replace(/^[\s#]+/, '').replace(/[,\s]+$/, '').replace(/\s+/g, ' ').trim()]
    .slice(0, MAX_ETIKET_UZUNLUK).join('').trim();
}

/** Etiket ekler (büyük/küçük harf duyarsız tekil, en çok 12). Yeni dizi döner. */
export function etiketEkle(liste, s) {
  const l = Array.isArray(liste) ? [...liste] : [];
  const t = etiketTemizle(s);
  if (!t || l.length >= MAX_ETIKET) return l;
  if (l.some((x) => aramaMetni(x) === aramaMetni(t))) return l;
  l.push(t);
  return l;
}

/** Form verisi geçerli mi? -> Türkçe hata | null */
export function aniDogrula(data) {
  const baslik = String(data?.baslik ?? '').trim();
  if (!baslik) return 'Anına bir başlık ver.';
  if ([...baslik].length > MAX_BASLIK) return `Başlık en çok ${MAX_BASLIK} karakter olabilir.`;
  if (!parseDay(data?.tarih)) return 'Geçerli bir tarih seç.';
  if ([...String(data?.yer ?? '')].length > MAX_YER) return `Yer en çok ${MAX_YER} karakter olabilir.`;
  if ([...String(data?.not ?? '')].length > MAX_NOT) return `Not en çok ${MAX_NOT} karakter olabilir.`;
  if ((data?.fotolar || []).length > MAX_FOTO) return `Bir anıya en çok ${MAX_FOTO} fotoğraf eklenebilir.`;
  return null;
}

/**
 * Formdan kaydedilecek 'ani' verisi: boş isteğe bağlı alanlar atılır; önceki beğeni korunur.
 * ekleyen: anıyı ilk ekleyenin clientId'si (belge.author son yazandır; beğeni de yazar). Düzenlemede korunur.
 */
export function aniVerisi(form, onceki = {}, ekleyen = null) {
  const out = { baslik: String(form.baslik || '').trim(), tarih: form.tarih };
  const ilk = onceki.ekleyen || ekleyen;
  if (ilk) out.ekleyen = ilk;
  const yer = String(form.yer || '').trim();
  const not = String(form.not || '').trim();
  if (yer) out.yer = yer;
  if (not) out.not = not;
  out.fotolar = [...(form.fotolar || [])];
  if (form.etiketler?.length) out.etiketler = [...form.etiketler];
  if (onceki.begeni && Object.keys(onceki.begeni).length) out.begeni = { ...onceki.begeni };
  return out;
}

/**
 * Düzenleme yaması (veri.js patch): yalnız formdaki alanlar; boş alan null (silinir).
 * Beğeniye dokunmaz: partnerin aynı anda verdiği beğeni ezilmez. ekleyen yalnız eksikse yazılır.
 */
export function aniYamasi(form, onceki = {}, ekleyen = null) {
  const v = aniVerisi(form, {}, null);
  const yama = {
    baslik: v.baslik, tarih: v.tarih, yer: v.yer ?? null, not: v.not ?? null,
    fotolar: v.fotolar, etiketler: v.etiketler ?? null,
  };
  if (!onceki.ekleyen && ekleyen) yama.ekleyen = ekleyen;
  return yama;
}

/** Beğeni yaması: { 'begeni.<clientId>': true | null } (aç/kapa, yalnız kendi alanım). */
export function begeniYamasi(begeni, clientId) {
  return { [`begeni.${clientId}`]: begeni?.[clientId] ? null : true };
}

/** i'deki fotoğrafı yon (-1 / +1) kadar kaydırır. Yeni dizi. */
export function fotoTasi(liste, i, yon) {
  const l = [...(liste || [])];
  const j = i + yon;
  if (i < 0 || i >= l.length || j < 0 || j >= l.length) return l;
  [l[i], l[j]] = [l[j], l[i]];
  return l;
}

export function fotoKaldir(liste, i) {
  return (liste || []).filter((_, k) => k !== i);
}

/** URL sorgusundan doldurulmuş ekleme formu: ?yeni=1&baslik=...&tarih=YYYY-MM-DD */
export function formParametreleri(search, bugun) {
  const p = new URLSearchParams(search || '');
  const tarih = p.get('tarih');
  return {
    yeni: p.get('yeni') === '1',
    baslik: [...String(p.get('baslik') || '').trim()].slice(0, MAX_BASLIK).join(''),
    tarih: parseDay(tarih) ? tarih : bugun,
  };
}

export function begeniSayisi(begeni) {
  return begeni && typeof begeni === 'object' ? Object.values(begeni).filter(Boolean).length : 0;
}

/**
 * Önizleme boyu (onizleme.js). kisa: kısa kenar sınırı, uzun: uzun kenar sınırı (px).
 * Fotoğraf hedeften en çok %20 büyükse yeniden kodlanmaz (kucult: false). -> { en, boy, kucult }
 */
export function onizlemeBoyu(en, boy, { kisa = Infinity, uzun = Infinity } = {}) {
  const w = Math.max(0, Math.round(Number(en) || 0));
  const h = Math.max(0, Math.round(Number(boy) || 0));
  if (!w || !h) return { en: w, boy: h, kucult: false };
  const k = Math.min(1, kisa / Math.min(w, h), uzun / Math.max(w, h));
  if (k >= 1 / 1.2) return { en: w, boy: h, kucult: false };
  return { en: Math.max(1, Math.round(w * k)), boy: Math.max(1, Math.round(h * k)), kucult: true };
}
