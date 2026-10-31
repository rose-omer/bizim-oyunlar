// Sohbet: saf mantık (DOM yok; Node'da test edilir).
// Mesaj belgesi: { id, author, data: { metin?, foto?, en?, boy?, ses?, yanit?, tepki?, yildiz?, sabit?, duzenlendi?, kimden }, created_at, pending? }
// ses = { url, sure (sn), tur }; yildiz = { [clientId]: true }; sabit = { at: ISO, kim: clientId } (ikimiz için ortak).
// data.kimden = gönderenin clientId'si. Gerekli: karşı taraf tepki yazınca belge 'author'u değişir.

export const MAX_METIN = 4000;
export const GRUP_MS = 5 * 60 * 1000;
export const YAZIYOR_GONDER_MS = 2000;
export const YAZIYOR_GOSTER_MS = 4000;
export const HIZLI_TEPKILER = ['❤️', '😂', '😍', '😮', '😢', '👍'];
export const SABIT_EN_COK = 10;

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

/** 'Bugün' | 'Dün' | '28 Ekim Çarşamba' | '31 Aralık 2025 Çarşamba' */
export function gunEtiketi(deger, simdi = new Date()) {
  const t = zaman(deger);
  if (Number.isNaN(t)) return '';
  const d = new Date(t);
  const gun = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
  const fark = Math.round((gun(simdi) - gun(d)) / 864e5);
  if (fark === 0) return 'Bugün';
  if (fark === 1) return 'Dün';
  // Intl.DateTimeFormat yerine sabit adlar: ilk kurulumu telefonda açılışı onlarca ms uzatıyor.
  const yil = d.getFullYear() !== simdi.getFullYear() ? ` ${d.getFullYear()}` : '';
  return `${d.getDate()} ${AYLAR[d.getMonth()]}${yil} ${GUNLER[d.getDay()]}`;
}

const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const GUNLER = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

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

/** Bildirim / yanıt önizlemesi: metnin ilk n harfi, '📷 Fotoğraf' ya da '🎤 Sesli mesaj (0:07)'. */
export function ozet(data, n = 80) {
  if (!data) return '';
  const metin = typeof data.metin === 'string' ? data.metin : '';
  if (data.foto) return metin.trim() ? kisalt(`📷 ${metin}`, n) : '📷 Fotoğraf';
  if (data.ses) {
    const sn = Number(data.ses.sure);
    return sn > 0 ? `🎤 Sesli mesaj (${Math.floor(sn / 60)}:${iki(Math.floor(sn % 60))})` : '🎤 Sesli mesaj';
  }
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

// Başkasının yazması belgenin 'author'unu değiştirir: kimden'i olmayan eski belgede gönderen yamaya eklenir.
function gonderenKoru(doc, yama) {
  if (doc && !doc.data?.kimden) {
    const kimden = gonderen(doc);
    if (kimden) yama.kimden = kimden;
  }
  return yama;
}

/**
 * Tepki yaması (veri.js patch, alan düzeyinde): { 'tepki.<benId>': emoji | null }. Aynı emoji kaldırır.
 * Yalnız kendi tepkimi yazar; partnerin aynı anda verdiği tepki ezilmez. Eski belgede gönderen korunur.
 */
export function tepkiYamasi(doc, benId, emoji) {
  return gonderenKoru(doc, { [`tepki.${benId}`]: doc?.data?.tepki?.[benId] === emoji ? null : emoji });
}

/** Yıldız yaması: { 'yildiz.<benId>': true | null } (yıldızlıysa kaldırır). Partnerin yıldızına dokunmaz. */
export function yildizYamasi(doc, benId) {
  return gonderenKoru(doc, { [`yildiz.${benId}`]: doc?.data?.yildiz?.[benId] === true ? null : true });
}

/** Mesaj sabitli mi? sabit = { at: ISO, kim } */
export function sabitMi(doc) {
  const s = doc?.data?.sabit;
  return !!doc && !doc.deleted && !!s && typeof s === 'object' && typeof s.at === 'string' && !!s.at;
}

/** Sabit yaması: { sabit: { at, kim: benId } } ya da sabitse { sabit: null }. Eski belgede gönderen korunur. */
export function sabitYamasi(doc, benId, at = new Date().toISOString()) {
  return gonderenKoru(doc, { sabit: sabitMi(doc) ? null : { at, kim: benId } });
}

const SABIT_ALANLAR = ['id', 'data', 'author', 'created_at', 'updated_at', 'pending'];

/**
 * Sabit mesaj önbelleği (yalnız son 100 mesaj yüklü; eski sabitler kaybolmasın).
 * liste: önbellekteki sabit belgeler; docs: yeni gelen sürümler (silinmiş ya da sabitsiz olabilir).
 * Daha yeni updated_at kazanır; sunucu onaylı sürüm bekleyen (iyimser) sürümü her zaman ezer.
 * -> { liste (en son sabitlenen başta), degisti }
 */
export function sabitBirlestir(liste, docs) {
  const harita = new Map((liste || []).map((d) => [d.id, d]));
  let degisti = false;
  for (const d of docs || []) {
    if (!d || typeof d.id !== 'string' || !d.id) continue;
    const eski = harita.get(d.id);
    if (eski && !(eski.pending && !d.pending) && zaman(d.updated_at) < zaman(eski.updated_at)) continue;
    if (!sabitMi(d)) {
      if (eski) { harita.delete(d.id); degisti = true; }
      continue;
    }
    const yeni = {};
    for (const k of SABIT_ALANLAR) if (d[k] !== undefined) yeni[k] = d[k];
    if (eski && JSON.stringify(eski) === JSON.stringify(yeni)) continue;
    harita.set(d.id, yeni);
    degisti = true;
  }
  const sirali = [...harita.values()].sort((a, b) => zaman(b.data.sabit.at) - zaman(a.data.sabit.at));
  return { liste: sirali, degisti };
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
