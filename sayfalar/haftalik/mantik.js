// Haftalık ilişki kontrolü: saf mantık (DOM yok, Node'da test edilir).
// Veri: tür 'haftalik', id `<ISO hafta YYYY-Www>-<clientId>`,
//   data { puanlar: { iletisim, yakinlik, eglence, destek } (1–5 tamsayı), not?, at: ISO }.
// Bu hafta: partnerin puanları ben doldurana dek gizli. Geçmiş haftalar açık.
import { parseDay, addDays } from '../../js/core/gunler.js';
import { genitive } from '../../js/core/ui.js';

export const ALANLAR = [
  { id: 'iletisim', ad: 'İletişim', soru: 'Birbirimizi ne kadar iyi duyduk?' },
  { id: 'yakinlik', ad: 'Yakınlık', soru: 'Kendimizi ne kadar yakın hissettik?' },
  { id: 'eglence', ad: 'Eğlence', soru: 'Birlikte ne kadar güldük, eğlendik?' },
  { id: 'destek', ad: 'Destek', soru: 'Birbirimize ne kadar destek olduk?' },
];
export const NOT_MAX = 500;
export const HAFTA_SAYISI = 8;

const HAFTA_RE = /^(\d{4})-W(\d{2})$/;
const MS_GUN = 86400000;
const pad = (n) => String(n).padStart(2, '0');
const zaman = (s) => {
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : 0;
};
const bir = (n) => Math.round(n * 10) / 10;

/** 'YYYY-MM-DD' → ISO 8601 hafta 'YYYY-Www' (hafta pazartesi başlar; yıl = perşembenin yılı). */
export function isoHafta(gun) {
  const p = parseDay(gun);
  if (!p) return null;
  const t = new Date(Date.UTC(p.y, p.m - 1, p.d));
  const gunNo = (t.getUTCDay() + 6) % 7; // pazartesi 0
  const persembe = new Date(t.getTime() + (3 - gunNo) * MS_GUN);
  const yil = persembe.getUTCFullYear();
  const yilinGunu = Math.round((persembe - Date.UTC(yil, 0, 1)) / MS_GUN); // 0 tabanlı
  return `${yil}-W${pad(Math.floor(yilinGunu / 7) + 1)}`;
}

/** 'YYYY-Www' → o haftanın pazartesisi 'YYYY-MM-DD' | null. */
export function haftaPazartesi(hafta) {
  const m = HAFTA_RE.exec(String(hafta ?? ''));
  if (!m) return null;
  const y = +m[1];
  const w = +m[2];
  const ocak4 = new Date(Date.UTC(y, 0, 4)); // 4 Ocak her zaman 1. haftadadır
  const pzt = new Date(ocak4.getTime() - ((ocak4.getUTCDay() + 6) % 7) * MS_GUN + (w - 1) * 7 * MS_GUN);
  return `${pzt.getUTCFullYear()}-${pad(pzt.getUTCMonth() + 1)}-${pad(pzt.getUTCDate())}`;
}

export function haftaKaydir(hafta, n) {
  const pzt = haftaPazartesi(hafta);
  return pzt ? isoHafta(addDays(pzt, n * 7)) : null;
}

/** Son n hafta, eskiden yeniye; son eleman `hafta`. */
export function sonHaftalar(hafta, n = HAFTA_SAYISI) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) out.push(haftaKaydir(hafta, -i));
  return out;
}

export const docId = (hafta, clientId) => `${hafta}-${clientId}`;

function puanlarGecerli(p) {
  return !!p && typeof p === 'object' && ALANLAR.every((a) => Number.isInteger(p[a.id]) && p[a.id] >= 1 && p[a.id] <= 5);
}

/** Belge → { hafta, kim, puanlar, not, at } | null. */
export function kayitOku(doc) {
  const id = String(doc?.id || '');
  const hafta = id.slice(0, 8);
  const kim = id.slice(9);
  if (!HAFTA_RE.test(hafta) || id[8] !== '-' || !kim) return null;
  const p = doc.data?.puanlar;
  if (!puanlarGecerli(p)) return null;
  const puanlar = Object.fromEntries(ALANLAR.map((a) => [a.id, p[a.id]]));
  const not = typeof doc.data.not === 'string' ? doc.data.not.trim() : '';
  return { hafta, kim, puanlar, not, at: doc.data.at || doc.updated_at || doc.created_at || '' };
}

/** Belgeler → Map<hafta, Map<kim, { puanlar, not, at, guncel }>>. */
export function haftalaraGore(docs) {
  const m = new Map();
  for (const d of docs || []) {
    const k = kayitOku(d);
    if (!k) continue;
    if (!m.has(k.hafta)) m.set(k.hafta, new Map());
    m.get(k.hafta).set(k.kim, { puanlar: k.puanlar, not: k.not, at: k.at, guncel: d.updated_at || k.at });
  }
  return m;
}

/** O haftanın durumu. partner = benden farklı en yeni kayıt. */
export function haftaDurumu(harita, hafta, benId) {
  const kisiler = harita.get(hafta);
  if (!kisiler) return { ben: null, partner: null, ikisi: false };
  const ben = kisiler.get(benId) || null;
  let partner = null;
  for (const [kim, k] of kisiler) {
    if (kim === benId) continue;
    if (!partner || zaman(k.guncel) > zaman(partner.guncel)) partner = { kim, ...k };
  }
  return { ben, partner, ikisi: !!(ben && partner) };
}

/** -> { data } | { hata } */
export function yeniKayit({ puanlar, not, simdi = new Date() }) {
  for (const a of ALANLAR) {
    const v = puanlar?.[a.id];
    if (!Number.isInteger(v) || v < 1 || v > 5) return { hata: `${a.ad} için 1 ile 5 arasında bir puan seç.` };
  }
  const n = String(not ?? '').replace(/\r\n?/g, '\n').trim();
  if (n.length > NOT_MAX) return { hata: `Not en çok ${NOT_MAX} harf olsun.` };
  const data = { puanlar: Object.fromEntries(ALANLAR.map((a) => [a.id, puanlar[a.id]])) };
  if (n) data.not = n;
  data.at = new Date(simdi).toISOString();
  return { data };
}

export function ortalama(puanlar) {
  return bir(ALANLAR.reduce((t, a) => t + puanlar[a.id], 0) / ALANLAR.length);
}

/** 4.25 → '4,3' */
export function sayiMetni(n) {
  return bir(n).toFixed(1).replace('.', ',');
}

/** İki kişinin puanları. fark = partner − ben; |fark| ≥ 2 olan alanlar "konuşalım". */
export function karsilastir(ben, partner) {
  const satirlar = ALANLAR.map((a) => ({ id: a.id, ad: a.ad, ben: ben[a.id], partner: partner[a.id], fark: partner[a.id] - ben[a.id] }));
  return {
    satirlar,
    konusalim: satirlar.filter((s) => Math.abs(s.fark) >= 2).map((s) => s.id),
    ayni: satirlar.filter((s) => s.fark === 0).length,
    benOrt: ortalama(ben),
    partnerOrt: ortalama(partner),
  };
}

/** Son n hafta ortalamaları, eskiden yeniye: [{ hafta, ben, partner }] (puan yoksa null). */
export function egilim(harita, { hafta, benId, n = HAFTA_SAYISI }) {
  return sonHaftalar(hafta, n).map((w) => {
    const d = haftaDurumu(harita, w, benId);
    const partnerGizli = w === hafta && !d.ben;
    return {
      hafta: w,
      ben: d.ben ? ortalama(d.ben.puanlar) : null,
      partner: d.partner && !partnerGizli ? ortalama(d.partner.puanlar) : null,
    };
  });
}

function kisiOzeti(degerler, { sen, ad }) {
  const v = degerler.filter((x) => x != null);
  const ozne = sen ? 'Senin ortalaman' : `${genitive(ad)} ortalaması`;
  if (!v.length) return sen ? 'Sen henüz puan vermedin.' : `${ad} henüz puan vermedi.`;
  const ilk = v[0];
  const son = v[v.length - 1];
  if (v.length === 1) return `${ozne} ${sayiMetni(son)} (tek hafta).`;
  const fark = son - ilk;
  if (Math.abs(fark) <= 0.25) return `${ozne} ${sayiMetni(son)} civarında, sabit.`;
  return `${ozne} ${sayiMetni(ilk)} iken ${sayiMetni(son)} oldu, ${fark > 0 ? 'yükselişte' : 'düşüşte'}.`;
}

/** Grafiğin metin özeti (ekran okuyucu ve herkes için). */
export function egilimOzeti(seri, { partnerAd = 'Sevgilin' } = {}) {
  const dolu = seri.filter((s) => s.ben != null || s.partner != null).length;
  if (!dolu) return 'Henüz puanlanmış hafta yok. İlk kontrolü doldurunca eğiliminiz burada görünür.';
  return [
    `Son ${seri.length} haftanın ${dolu} haftasında puan var.`,
    kisiOzeti(seri.map((s) => s.ben), { sen: true }),
    kisiOzeti(seri.map((s) => s.partner), { ad: partnerAd }),
  ].join(' ');
}

const sayi = (n) => String(bir(n));

/**
 * Çizgi grafiği yolu. Değerler 1–5; null'da çizgi kopar.
 * -> { d: 'M..L..', noktalar: [{ x, y, i, v }] }
 */
export function cizgiYolu(degerler, { genislik, yukseklik, min = 1, max = 5 }) {
  const n = degerler.length;
  const x = (i) => (n > 1 ? (i * genislik) / (n - 1) : genislik / 2);
  const y = (v) => ((max - v) / (max - min)) * yukseklik;
  let d = '';
  let onceki = false;
  const noktalar = [];
  degerler.forEach((v, i) => {
    if (v == null) { onceki = false; return; }
    const px = bir(x(i));
    const py = bir(y(v));
    d += `${onceki ? 'L' : 'M'}${sayi(px)} ${sayi(py)}`;
    onceki = true;
    noktalar.push({ x: px, y: py, i, v });
  });
  return { d, noktalar };
}

/** Pazar 18:00'den sonra ve bu hafta doldurulmadıysa hatırlatma kartı. */
export function hatirlatmaGoster({ simdi = new Date(), benDoldurdu }) {
  return !benDoldurdu && simdi.getDay() === 0 && simdi.getHours() >= 18;
}

export function bildirimMetni({ benAd, partnerDoldurdu }) {
  const ad = String(benAd || '').trim() || 'Sevgilin';
  if (partnerDoldurdu) return { baslik: 'Haftalık kontrol açıldı', metin: `${ad} de doldurdu. Karşılaştırmanız açıldı.` };
  return { baslik: 'Haftalık kontrol', metin: `${ad} bu haftayı değerlendirdi. Sen de doldur, karşılaştırma açılsın.` };
}
