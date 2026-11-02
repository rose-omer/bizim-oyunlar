// Yavrumuz: tuvalet ihtiyacı (saf mantık, DOM yok, Node'da test edilir). Ceza nazik: ölüm yok, puan kesilmez.
// Belgede alan: tuvalet: { v, t, kaza? } — sıkışıklık v (0–100) t anında; kaza = son kazanın anı (ISO).
// Değer saklanmaz, hesaplanır: v + TUVALET_ARTIS × geçen saat (uykuda yarı hız), 0–100 kırpılır.
// Yemek (mama/meyve/tatlı) sıkışıklığı YEMEK_ARTIS kadar artırır. ESIK'e varınca "Çişi var"; KAZA_SURE içinde
// lazımlığa götürülmezse kaza: temizlik KAZA_TEMIZLIK düşer, sıkışıklık sıfırlanır.
// Kaza anı kayıttan belirlenir (hesaplanır). Kaza yaması mutlak değer yazar ({ v: 0, t: kazaAnı }, temizlik o andaki
// değer − düşüş): iki cihaz aynı tabandan aynı yamayı üretir, kaza bir kez uygulanır; yazılınca kayıt kazadan sonraya
// geçer, aynı kaza bir daha hesaplanmaz. Kaza anından sonra yıkanmışsa (temizlik kaydı daha yeni) temizlik düşmez.
// Uykuda kaza olmaz: kaza anı uykuya düşerse uyanıştan KAZA_SURE sonraya kayar.
// Eski belgede alan yoksa { v: 0, t: null }: ilk yemek ya da lazımlık yazana dek artmaz. Yumurtada yok.
// y: mantik.js oku() sonucu (ham 'tuvalet' alanını taşır) ya da ham belge verisi.
// Yazım alan düzeyinde yama: 'tuvalet', 'ihtiyac.temizlik', 'son.<clientId>', 'puan.<clientId>'.
import { DK, SAAT, ihtiyacDegeri, uyuyorMu, LAZIMLIK, CIS_VAR, KAZA_METNI } from './mantik.js';

export const TUVALET_ARTIS = 2; // saatlik (uykuda yarı)
export const ESIK = 70; // bu ve üstü "Çişi var"
export const KAZA_SURE = 2 * SAAT; // eşikten sonra kazaya kadar
export const KAZA_TEMIZLIK = 20; // kazada temizlik düşüşü
export const KAZA_GOSTER = 60 * DK; // "ufak bir kaza" mesajı bu kadar görünür
export const KAZA_MAX = 10; // bir hesapta en çok bu kadar kaza (uzun yoklukta)
/** Yiyecek eylemlerinin sıkışıklık artışı (jeton.js ürünleri kendi artışını taşır). */
export const YEMEK_ARTIS = Object.freeze({ mama: 20, meyve: 15, tatli: 10 });
/** EYLEMLER biçiminde. fiil: [üçüncü kişi, "Sen" için]. Tanım ve metinler mantik.js'te (durum, bakım satırı, bildirim). */
export { LAZIMLIK, CIS_VAR, KAZA_METNI };

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

/** Ham alanı güvenli biçime getirir: { v, t, kaza }. Bozuk/eksik: { v: 0, t: null, kaza: null }. */
export function tuvaletOku(x) {
  const d = nesne(x);
  return {
    v: Number.isFinite(d.v) ? kirp(d.v) : 0,
    t: gecerli(d.t) ? d.t : null,
    kaza: gecerli(d.kaza) ? d.kaza : null,
  };
}

/** Kayıttan sonraki dilimler [başlangıç, bitiş, hız]; son dilim sonsuza gider. */
function dilimler(t, uyku) {
  const bas = zaman(uyku?.bas);
  const bit = zaman(uyku?.bit);
  if (Number.isFinite(bas) && Number.isFinite(bit) && bit > Math.max(t, bas)) {
    const u1 = Math.max(t, bas);
    return [[t, u1, TUVALET_ARTIS], [u1, bit, TUVALET_ARTIS / 2], [bit, Infinity, TUVALET_ARTIS]];
  }
  return [[t, Infinity, TUVALET_ARTIS]];
}

/** Kayda göre an'daki sıkışıklık (kaza hesaba katılmaz). */
function kayitDegeri(kayit, uyku, an) {
  const t = zaman(kayit.t);
  if (!Number.isFinite(t) || an <= t) return kayit.v;
  let x = kayit.v;
  for (const [a, b, h] of dilimler(t, uyku)) if (an > a) x += (h * (Math.min(an, b) - a)) / SAAT;
  return kirp(x);
}

/** Kaydın ESIK'e vardığı an (ms) | null (zamansız kayıt). */
function esikAni(kayit, uyku) {
  const t = zaman(kayit.t);
  if (!Number.isFinite(t)) return null;
  if (kayit.v >= ESIK) return t;
  let x = kayit.v;
  for (const [a, b, h] of dilimler(t, uyku)) {
    const son = a + ((ESIK - x) / h) * SAAT;
    if (son <= b) return Math.round(son);
    x += (h * (b - a)) / SAAT;
  }
  return null;
}

/** Kaydın kaza anı (ms) | null. Uykuya düşerse uyanıştan KAZA_SURE sonra. */
function kazaAni(kayit, uyku) {
  const e = esikAni(kayit, uyku);
  if (e == null) return null;
  const k = e + KAZA_SURE;
  const bas = zaman(uyku?.bas);
  const bit = zaman(uyku?.bit);
  return Number.isFinite(bas) && Number.isFinite(bit) && k >= bas && k < bit ? bit + KAZA_SURE : k;
}

/**
 * simdi'ye kadar olmuş kazaları uygular. -> { kayit, temizlik: { v, t } | null (değiştiyse), kazalar: [ms] }
 * Temizlik kaydı kaza anından yeniyse (sonra yıkanmış) o kazada temizlik düşmez.
 */
function ilerlet(y, simdi) {
  let kayit = tuvaletOku(y?.tuvalet);
  const kazalar = [];
  let tem = y?.ihtiyac?.temizlik ?? null;
  let temDegisti = false;
  if (!y || y.asama === 'yumurta') return { kayit, temizlik: null, kazalar };
  while (kazalar.length < KAZA_MAX) {
    const k = kazaAni(kayit, y.uyku);
    if (k == null || k > simdi) break;
    kazalar.push(k);
    kayit = { v: 0, t: iso(k), kaza: iso(k) };
    const tt = zaman(tem?.t);
    if (!(tt > k)) {
      const d = ihtiyacDegeri(tem, 'temizlik', y.uyku, k, y.kisilik);
      tem = { v: yuvarla(Math.max(0, d - KAZA_TEMIZLIK)), t: iso(k) };
      temDegisti = true;
    }
  }
  return { kayit, temizlik: temDegisti ? tem : null, kazalar };
}

/** Kaza parçaları (tuvalet kaydı dahil değil). */
const temizlikYamasi = (b) => (b.temizlik ? { 'ihtiyac.temizlik': b.temizlik } : {});

/** Şimdiki sıkışıklık (0–100; olmuş kazalar sonrası). Yumurtada 0. */
export function tuvaletDegeri(y, simdi) {
  if (!y || y.asama === 'yumurta') return 0;
  return kayitDegeri(ilerlet(y, simdi).kayit, y.uyku, simdi);
}

/**
 * Arayüz için durum. -> null (yumurta/belge yok)
 *   | { deger, cisVar, kazaAn: ms|null, kalan: ms|null (çişi varken kazaya), sonKaza: ISO|null, yeniKaza }
 */
export function tuvaletDurumu(y, simdi) {
  if (!y || y.asama === 'yumurta') return null;
  const { kayit } = ilerlet(y, simdi);
  const deger = kayitDegeri(kayit, y.uyku, simdi);
  const cisVar = deger >= ESIK;
  const kazaAn = kazaAni(kayit, y.uyku);
  const sonKaza = kayit.kaza;
  return {
    deger: yuvarla(deger),
    cisVar,
    kazaAn,
    kalan: cisVar && kazaAn != null ? Math.max(0, kazaAn - simdi) : null,
    sonKaza,
    yeniKaza: !!sonKaza && simdi - zaman(sonKaza) < KAZA_GOSTER,
  };
}

/**
 * Olmuş kaza(lar)ı belgeye yazan yama. -> null (kaza yok) | { yama, kayit, kayitId }
 * kayit = bakım günlüğü ('yavrubakim') { eylem: 'kaza', kim, at: son kaza }; kayitId = 'kaza-<ms>' (iki cihaz
 * aynı kaydı yazar, günlükte çift görünmez). Yama mutlak değerdir; iki kez uygulanması sonucu değiştirmez.
 */
export function kazaYamasi(y, { kim, simdi }) {
  const b = ilerlet(y, simdi);
  if (!b.kazalar.length) return null;
  const son = b.kazalar[b.kazalar.length - 1];
  return {
    yama: { ...temizlikYamasi(b), tuvalet: b.kayit },
    kayit: { eylem: 'kaza', kim, at: iso(son) },
    kayitId: `kaza-${son}`,
  };
}

/**
 * Sıkışıklığı simdi'ye sabitleyen (artis eklenmiş) yama; olmuş kazalar dahil. Yumurtada null.
 * Yemekte artis = YEMEK_ARTIS[eylem]; uyut/uyandır'da 0 (uyku aralığı değişmeden önce sabitlensin).
 * app.js eylemYap yamasının ARKASINA ekler: { ...r.yama, ...tuvaletYamasi(y, { simdi, artis }) }.
 */
export function tuvaletYamasi(y, { simdi, artis = 0 }) {
  if (!y || y.asama === 'yumurta') return null;
  const b = ilerlet(y, simdi);
  const v = yuvarla(kirp(kayitDegeri(b.kayit, y.uyku, simdi) + artis));
  const kayit = { v, t: iso(simdi) };
  if (b.kayit.kaza) kayit.kaza = b.kayit.kaza;
  return { ...temizlikYamasi(b), tuvalet: kayit };
}

/** Kişinin lazımlık için kalan beklemesi (ms; 0 = hazır). */
export function lazimlikKalan(y, kim, simdi) {
  const t = zaman(y?.son?.[kim]?.lazimlik);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.min(LAZIMLIK.bekleme, t + LAZIMLIK.bekleme - simdi));
}

/**
 * Lazımlık. -> { hata: 'yumurta'|'uyuyor'|'bekle', kalan? }
 *            | { yama, puan: bool, mesaj: string|null, kayit: { eylem: 'lazimlik', kim, at } }
 * Sıkışıklık sıfırlanır. Puan yalnız çişi varken (ESIK ve üstü). Bekleme kişi başınadır.
 * puanArtis: saglik.js puanArtisi (keyifsizken 0.5).
 */
export function lazimlikEylemi(y, { kim, simdi, puanArtis = 1 }) {
  if (!y || y.asama === 'yumurta') return { hata: 'yumurta' };
  if (uyuyorMu(y.uyku, simdi)) return { hata: 'uyuyor' };
  const kalan = lazimlikKalan(y, kim, simdi);
  if (kalan > 0) return { hata: 'bekle', kalan };

  const at = iso(simdi);
  const b = ilerlet(y, simdi);
  const etkili = kayitDegeri(b.kayit, y.uyku, simdi) >= ESIK;
  const kayit = { v: 0, t: at };
  if (b.kayit.kaza) kayit.kaza = b.kayit.kaza;
  const yama = { ...temizlikYamasi(b), tuvalet: kayit, [`son.${kim}`]: { ...(y.son?.[kim] || {}), lazimlik: at } };
  if (etkili) yama[`puan.${kim}`] = (y.puan?.[kim] || 0) + puanArtis;
  return { yama, puan: etkili, mesaj: etkili ? null : LAZIMLIK.tok, kayit: { eylem: 'lazimlik', kim, at } };
}
