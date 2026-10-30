// Sohbet: saf mantık (DOM yok; Node'da test edilir).
// Mesaj belgesi: { id, author, data: { metin?, foto?, en?, boy?, yanit?, tepki?, duzenlendi?, kimden }, created_at, pending? }
// data.kimden = gönderenin clientId'si. Gerekli: karşı taraf tepki yazınca belge 'author'u değişir.

export const MAX_METIN = 4000;
export const GRUP_MS = 5 * 60 * 1000;
export const YAZIYOR_GONDER_MS = 2000;
export const YAZIYOR_GOSTER_MS = 4000;
export const HIZLI_TEPKILER = ['❤️', '😂', '😍', '😮', '😢', '👍'];

const zaman = (s) => {
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : NaN;
};
const iki = (n) => String(n).padStart(2, '0');

/** Yerel gün 'YYYY-MM-DD' ('' geçersizse). */
export function gunAnahtari(deger) {
  const t = zaman(deger);
  if (Number.isNaN(t)) return '';
  const d = new Date(t);
  return `${d.getFullYear()}-${iki(d.getMonth() + 1)}-${iki(d.getDate())}`;
}

/** 'Bugün' | 'Dün' | '12 Ekim' | '31 Aralık 2025' */
export function gunEtiketi(deger, simdi = new Date()) {
  const t = zaman(deger);
  if (Number.isNaN(t)) return '';
  const d = new Date(t);
  const gun = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
  const fark = Math.round((gun(simdi) - gun(d)) / 864e5);
  if (fark === 0) return 'Bugün';
  if (fark === 1) return 'Dün';
  // Intl.DateTimeFormat yerine sabit adlar: ilk kurulumu telefonda açılışı onlarca ms uzatıyor.
  const s = `${d.getDate()} ${AYLAR[d.getMonth()]}`;
  return d.getFullYear() !== simdi.getFullYear() ? `${s} ${d.getFullYear()}` : s;
}

const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

/** '09:05' */
export function saatEtiketi(deger) {
  const t = zaman(deger);
  if (deger == null || Number.isNaN(t)) return '';
  const d = new Date(t);
  return `${iki(d.getHours())}:${iki(d.getMinutes())}`;
}

/** Mesajı gönderen clientId. */
export function gonderen(doc) {
  if (!doc) return null;
  return doc.data?.kimden || doc.author || null;
}

/**
 * Ekran satırları: gün ayırıcıları + gruplanmış mesajlar.
 * -> [{ tur:'gun', anahtar, etiket } | { tur:'mesaj', anahtar, doc, benim, ilk, son }]
 * Grup: aynı kişi, aynı gün, ardışık iki mesaj arası ≤ grupMs.
 */
export function satirlar(docs, { benId, grupMs = GRUP_MS, simdi = new Date() } = {}) {
  const out = [];
  let onceki = null;
  let oncekiGun = '';
  let oncekiSatir = null;
  for (const doc of docs || []) {
    const gun = gunAnahtari(doc.created_at);
    if (gun !== oncekiGun) {
      out.push({ tur: 'gun', anahtar: `gun-${gun}`, etiket: gunEtiketi(doc.created_at, simdi) });
      oncekiGun = gun;
      onceki = null;
    }
    const kim = gonderen(doc);
    const ayni = onceki && gonderen(onceki) === kim && zaman(doc.created_at) - zaman(onceki.created_at) <= grupMs;
    if (!ayni && oncekiSatir) oncekiSatir.son = true;
    const satir = { tur: 'mesaj', anahtar: doc.id, doc, benim: kim === benId, ilk: !ayni, son: true };
    if (ayni && oncekiSatir) oncekiSatir.son = false;
    out.push(satir);
    oncekiSatir = satir;
    onceki = doc;
  }
  return out;
}

/**
 * Çizim penceresi: satirlar'ın hangi indeksinden itibaren DOM'a basılacağı (telefonda açılışta yüzlerce
 * balonun yerleşimi hesaplanmasın). anahtar verilir ve bulunursa pencere o satırdan başlar (yeni mesaj
 * gelince üstteki balonlar kaybolmaz); yoksa son n mesaj. Bir mesajın gün ayırıcısı onunla birlikte gelir.
 */
export function pencereBasi(satirlar, n, anahtar = null) {
  const list = satirlar || [];
  let i = anahtar != null ? list.findIndex((r) => r.anahtar === anahtar) : -1;
  if (i < 0) {
    let kalan = n;
    i = 0;
    for (let k = list.length - 1; k >= 0; k--) {
      if (list[k].tur !== 'mesaj') continue;
      if (--kalan === 0) { i = k; break; }
    }
    if (kalan > 0) return 0;
  }
  return i > 0 && list[i - 1].tur === 'gun' && list[i].tur === 'mesaj' ? i - 1 : i;
}

const URL_RE = /https?:\/\/[^\s<>"'`]+/gi;
const SON_NOKTALAMA = /[.,;:!?…'"»”’\]]$/;

function sayi(s, c) {
  let n = 0;
  for (const ch of s) if (ch === c) n++;
  return n;
}

/** Metni parçalara böler: [{ tur:'metin', metin } | { tur:'baglanti', metin, href }]. Yalnız http/https. */
export function baglantilar(metin) {
  const s = String(metin ?? '');
  const out = [];
  const ekle = (m) => {
    if (!m) return;
    const son = out[out.length - 1];
    if (son && son.tur === 'metin') son.metin += m;
    else out.push({ tur: 'metin', metin: m });
  };
  let i = 0;
  for (const m of s.matchAll(URL_RE)) {
    let ham = m[0];
    // Sondaki noktalama ve eşi olmayan kapanış parantezi bağlantıya dahil değil.
    for (;;) {
      if (SON_NOKTALAMA.test(ham)) ham = ham.slice(0, -1);
      else if (ham.endsWith(')') && sayi(ham, ')') > sayi(ham, '(')) ham = ham.slice(0, -1);
      else break;
    }
    ekle(s.slice(i, m.index));
    let href = null;
    try {
      const u = new URL(ham);
      if ((u.protocol === 'http:' || u.protocol === 'https:') && u.hostname) href = u.href;
    } catch { /* geçersiz: düz metin */ }
    if (href) out.push({ tur: 'baglanti', metin: ham, href });
    else ekle(ham);
    i = m.index + ham.length;
  }
  ekle(s.slice(i));
  return out;
}

let bolucu = null;
function harfler(s) {
  if (typeof Intl.Segmenter === 'function') {
    bolucu ||= new Intl.Segmenter('tr', { granularity: 'grapheme' });
    return [...bolucu.segment(s)].map((x) => x.segment);
  }
  return Array.from(s);
}

/** Boşlukları sadeleştirir; n harften uzunsa '…' ile keser (sonuç ≤ n harf). */
export function kisalt(metin, n) {
  const s = String(metin ?? '').replace(/\s+/g, ' ').trim();
  const h = harfler(s);
  if (h.length <= n) return s;
  return h.slice(0, Math.max(0, n - 1)).join('').trimEnd() + '…';
}

/** Bildirim / yanıt önizlemesi: metnin ilk n harfi ya da '📷 Fotoğraf'. */
export function ozet(data, n = 80) {
  if (!data) return '';
  const metin = typeof data.metin === 'string' ? data.metin : '';
  if (data.foto) return metin.trim() ? kisalt(`📷 ${metin}`, n) : '📷 Fotoğraf';
  return kisalt(metin, n);
}

/** Satır sonlarını birleştirir, baştaki/sondaki boşluğu atar. */
export function metniTemizle(metin) {
  return String(metin ?? '').replace(/\r\n?/g, '\n').trim();
}

/** -> null | Türkçe hata */
export function metinHatasi(metin) {
  const s = metniTemizle(metin);
  if (!s) return 'Boş mesaj gönderilemez.';
  if (s.length > MAX_METIN) return `Mesaj çok uzun (en çok ${MAX_METIN} karakter).`;
  return null;
}

/**
 * Tepki yaması (veri.js patch, alan düzeyinde): { 'tepki.<benId>': emoji | null }. Aynı emoji kaldırır.
 * Yalnız kendi tepkimi yazar; partnerin aynı anda verdiği tepki ezilmez. Eski belgede gönderen korunur.
 */
export function tepkiYamasi(doc, benId, emoji) {
  const yama = { [`tepki.${benId}`]: doc?.data?.tepki?.[benId] === emoji ? null : emoji };
  if (doc && !doc.data?.kimden) {
    const kimden = gonderen(doc);
    if (kimden) yama.kimden = kimden; // yazan değişince 'author' değişir
  }
  return yama;
}

/** -> [{ emoji, sayi, benim }] ilk görülme sırasıyla */
export function tepkiOzeti(tepki, benId) {
  const out = [];
  if (!tepki || typeof tepki !== 'object') return out;
  for (const [kim, emoji] of Object.entries(tepki)) {
    if (typeof emoji !== 'string' || !emoji) continue;
    let s = out.find((x) => x.emoji === emoji);
    if (!s) out.push((s = { emoji, sayi: 0, benim: false }));
    s.sayi++;
    if (kim === benId) s.benim = true;
  }
  return out;
}

/** Okundu olarak işaretlenecek mesaj: karşı tarafın son gönderilmiş mesajı. Gerek yoksa null. */
export function okunduHedefi(docs, benId, mevcutSon) {
  const list = docs || [];
  let hedef = -1;
  for (let i = list.length - 1; i >= 0; i--) {
    const d = list[i];
    if (!d.pending && gonderen(d) !== benId) { hedef = i; break; }
  }
  if (hedef < 0) return null;
  if (mevcutSon) {
    const m = list.findIndex((d) => d.id === mevcutSon);
    if (m >= hedef) return null;
  }
  return list[hedef].id;
}

/**
 * Son mesaj benimse durumu: 'gonderiliyor' | 'gonderildi' | 'goruldu'. Değilse null.
 * okunduDocs: 'okundu' belgeleri (id = clientId, data { son, at }). Karşı tarafınki = id'si benden farklı, en yeni 'at'.
 */
export function gorulduBilgisi(docs, okunduDocs, benId) {
  const list = docs || [];
  const son = list[list.length - 1];
  if (!son || gonderen(son) !== benId) return null;
  if (son.pending) return { id: son.id, durum: 'gonderiliyor', at: null };
  let partner = null;
  for (const o of okunduDocs || []) {
    if (!o || o.id === benId || !o.data) continue;
    if (!partner || zaman(o.data.at) > zaman(partner.data.at)) partner = o;
  }
  if (partner) {
    const benimIdx = list.length - 1;
    const idx = list.findIndex((d) => d.id === partner.data.son);
    const goruldu = idx >= 0 ? idx >= benimIdx : zaman(partner.data.at) >= zaman(son.created_at);
    if (goruldu) return { id: son.id, durum: 'goruldu', at: partner.data.at || null };
  }
  return { id: son.id, durum: 'gonderildi', at: null };
}

/** Yalnız 1–3 emojiden mi oluşuyor (büyük gösterilir)? */
export function sadeceEmoji(metin) {
  const s = String(metin ?? '').replace(/\s+/g, '');
  if (!s) return false;
  const h = harfler(s);
  if (h.length > 3) return false;
  return h.every((g) => /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(g));
}

export function yaziyorGonderilsinMi(sonGonderim, simdi, aralik = YAZIYOR_GONDER_MS) {
  return simdi - sonGonderim >= aralik;
}

/** Kaydırma kutusu en alta yakın mı? */
export function altaYakinMi({ scrollHeight, scrollTop, clientHeight }, esik = 120) {
  return scrollHeight - scrollTop - clientHeight <= esik;
}
