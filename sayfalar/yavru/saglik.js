// Yavrumuz: nazik hastalık ("keyifsiz"). Saf mantık (DOM yok, Node'da test edilir). Ölüm yok, ceza yumuşak.
// Keyifsizlik saklanmaz, ihtiyaç kayıtlarından ({ v, t }) hesaplanır. İyileşme kalıcıdır: ilaç (ya da bakım)
// ihtiyaç kayıtlarını yeniler; düşüklük süresi sıfırdan başlar.
// Yazım mantik.js gibi alan düzeyinde yama: 'ihtiyac.<ad>', 'son.<clientId>', 'puan.<clientId>'.
import {
  DK, SAAT, IHTIYACLAR, DUSUS, UYKU_ENERJI, DUSUK, ihtiyacDegeri, ihtiyaclar, uyuyorMu,
} from './mantik.js';

export const KEYIFSIZ_SURE = 24 * SAAT; // bu kadar süredir DUSUK altındaki ihtiyaç sayılır
export const KEYIFSIZ_SAYI = 2; // en az bu kadar ihtiyaç
export const BITKIN = 5; // hepsi bunun altında ya da eşitse hemen keyifsiz
export const ILAC_TABAN = 50; // ilaçtan sonra her ihtiyaç en az bu
export const KEYIFSIZ_PUAN = 0.5; // keyifsizken bir bakımın büyüme puanı

/** EYLEMLER biçiminde. fiil: [üçüncü kişi, "Sen" için]. */
export const ILAC = { ad: 'İlaç', emoji: '💊', bekleme: 60 * DK, fiil: ['ilaç verdi', 'ilaç verdin'], tok: null };

const zaman = (s) => {
  if (typeof s !== 'string' || !s) return NaN;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : NaN;
};
const iso = (ms) => new Date(ms).toISOString();
const yuvarla = (x) => Math.round(x * 10) / 10;

/**
 * İhtiyacın DUSUK altına indiği an (ms): o andan simdi'ye kadar kesintisiz altında. Şimdi altında değilse null.
 * Dilimler mantik.js ihtiyacDegeri ile aynı (uyanık → uyku → uyanık). Uykuda enerji artar, diğerleri yarı hızla düşer.
 * Kayıt zaten düşükse kayıt anı döner (öncesi bilinmez). Zamanı geçersiz kayıt: null.
 */
export function dusukBaslangic(kayit, ad, uyku, simdi) {
  const t = zaman(kayit?.t);
  if (!Number.isFinite(t)) return null;
  const deger = (an) => ihtiyacDegeri(kayit, ad, uyku, an);
  if (deger(simdi) >= DUSUK) return null;
  if (simdi <= t) return t;
  const hiz = DUSUS[ad] ?? 0;
  const uykuHiz = ad === 'enerji' ? -UYKU_ENERJI : hiz / 2;
  let dilimler = [[t, simdi, hiz]];
  const bas = zaman(uyku?.bas);
  const bit = zaman(uyku?.bit);
  if (Number.isFinite(bas) && Number.isFinite(bit) && bit > bas) {
    const u1 = Math.max(t, bas);
    const u2 = Math.min(simdi, bit);
    if (u2 > u1) dilimler = [[t, u1, hiz], [u1, u2, uykuHiz], [u2, simdi, hiz]];
  }
  // Sondan başa: düşen dilim başında eşik üstündeyse kesişme o dilimde; artan dilim tümüyle altta (sonu altta).
  for (let i = dilimler.length - 1; i >= 0; i--) {
    const [a, b, h] = dilimler[i];
    if (b <= a || h <= 0) continue;
    const ilk = deger(a);
    if (ilk >= DUSUK) return Math.min(b, a + ((ilk - DUSUK) / h) * SAAT);
  }
  return t;
}

/** Keyifsiz mi? En az 2 ihtiyaç 24 saattir DUSUK altında, ya da hepsi ≤ 5. Yumurtada değil. */
export function keyifsizMi(y, simdi) {
  if (!y || y.asama === 'yumurta') return false;
  const d = ihtiyaclar(y, simdi);
  if (IHTIYACLAR.every((ad) => d[ad] <= BITKIN)) return true;
  const uzun = IHTIYACLAR.filter((ad) => {
    const bas = dusukBaslangic(y.ihtiyac?.[ad], ad, y.uyku, simdi);
    return bas != null && simdi - bas >= KEYIFSIZ_SURE;
  });
  return uzun.length >= KEYIFSIZ_SAYI;
}

/** Kişinin ilaç için kalan beklemesi (ms; 0 = hazır). */
export function ilacKalan(y, kim, simdi) {
  const t = zaman(y?.son?.[kim]?.ilac);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.min(ILAC.bekleme, t + ILAC.bekleme - simdi));
}

/**
 * İlaç ver. -> { hata: 'yumurta'|'uyuyor'|'iyi'|'bekle', kalan? }
 *            | { yama, puan: true, mesaj: null, kayit: { eylem: 'ilac', kim, at } }
 * Yalnız keyifsizken. Her ihtiyaç en az ILAC_TABAN olur (üstündekiler o ana sabitlenir). Bekleme kişi başınadır.
 */
export function ilacEylemi(y, { kim, simdi }) {
  if (!y || y.asama === 'yumurta') return { hata: 'yumurta' };
  if (uyuyorMu(y.uyku, simdi)) return { hata: 'uyuyor' };
  if (!keyifsizMi(y, simdi)) return { hata: 'iyi' };
  const kalan = ilacKalan(y, kim, simdi);
  if (kalan > 0) return { hata: 'bekle', kalan };

  const at = iso(simdi);
  const d = ihtiyaclar(y, simdi);
  const yama = {};
  for (const ad of IHTIYACLAR) yama[`ihtiyac.${ad}`] = { v: yuvarla(Math.max(d[ad], ILAC_TABAN)), t: at };
  yama[`son.${kim}`] = { ...(y.son?.[kim] || {}), ilac: at };
  yama[`puan.${kim}`] = (y.puan?.[kim] || 0) + 1;
  return { yama, puan: true, mesaj: null, kayit: { eylem: 'ilac', kim, at } };
}

/** Bir bakımın büyüme puanı: keyifsizken yarım. (Bağlama: eylemYap puan yamasında +1 yerine.) */
export function puanArtisi(y, simdi) {
  return keyifsizMi(y, simdi) ? KEYIFSIZ_PUAN : 1;
}
