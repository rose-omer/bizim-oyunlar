// Yavrumuz: jeton ekonomisi (saf mantık, DOM yok, Node'da test edilir).
// Ortak cüzdan: çiftin tek bakiyesi. Bakiye saklanmaz, hesaplanır:
//   bakiye = Σ kişi kazancı − Σ kişi yiyecek harcaması − Σ dolaptaki kıyafet fiyatı
// Belgede alanlar:
//   jeton: { [clientId]: { kazanc, harcama, gun: 'YYYY-MM-DD', bugun, gorevGun? } }  (sayaç; yalnız sahibi yazar; gorevGun: gorev.js)
//   dolap: { [urunId]: { at, kim, fiyat } }                              (kalıcı kıyafet; fiyat bir kez sayılır)
// Yarış: 'jeton.<clientId>' anahtarını yalnız o kişi yazar; iki kişinin yazımı çakışmaz, jeton kaybolmaz/çoğalmaz.
// Kıyafetin bedeli dolap kaydından sayılır; ikisi aynı anda alırsa tek kayıt kalır, bir kez ödenir.
// Eşzamanlı harcamada bakiye kısa süre eksiye inebilir; eksik sonraki kazançtan düşer (satın alma engellenir).
// y: mantik.js oku() sonucu (ham 'jeton', 'dolap', 'tuvalet' alanlarını taşır) ya da ham belge verisi.
// Yazım alan düzeyinde yama: 'jeton.<clientId>', 'dolap.<urunId>', 'ihtiyac.<ad>', 'tuvalet'.
import { toDay } from '../../js/core/gunler.js';
import { ihtiyaclar, uyuyorMu, ozelGun } from './mantik.js';
import { tuvaletYamasi } from './tuvalet.js';
import { urunKilidi } from './evre.js';

export const GUNLUK_SINIR = 200; // kişi başı, yerel gün
export const KAYNAKLAR = Object.freeze(['oyun', 'gorev', 'bakim', 'hediye']);

/** tur: 'yiyecek' (tüketilir: etki + tuvalet artışı) | 'kiyafet' (kalıcı açılır: dolap.<id>). Fiyat jeton. */
export const URUNLER = Object.freeze({
  cilek: Object.freeze({ ad: 'Çilek', emoji: '🍓', tur: 'yiyecek', fiyat: 10, etki: Object.freeze({ tokluk: 10, mutluluk: 5 }), tuvalet: 5 }),
  kurabiye: Object.freeze({ ad: 'Kurabiye', emoji: '🍪', tur: 'yiyecek', fiyat: 15, etki: Object.freeze({ tokluk: 10, mutluluk: 10 }), tuvalet: 5 }),
  dondurma: Object.freeze({ ad: 'Dondurma', emoji: '🍦', tur: 'yiyecek', fiyat: 20, etki: Object.freeze({ tokluk: 5, mutluluk: 20 }), tuvalet: 10 }),
  pizza: Object.freeze({ ad: 'Pizza', emoji: '🍕', tur: 'yiyecek', fiyat: 30, etki: Object.freeze({ tokluk: 35, mutluluk: 10 }), tuvalet: 20 }),
  pasta: Object.freeze({ ad: 'Pasta', emoji: '🎂', tur: 'yiyecek', fiyat: 40, etki: Object.freeze({ tokluk: 20, mutluluk: 30 }), tuvalet: 15 }),
  fiyonk: Object.freeze({ ad: 'Fiyonk', emoji: '🎀', tur: 'kiyafet', fiyat: 40 }),
  atki: Object.freeze({ ad: 'Atkı', emoji: '🧣', tur: 'kiyafet', fiyat: 50 }),
  sapka: Object.freeze({ ad: 'Şapka', emoji: '🎩', tur: 'kiyafet', fiyat: 60 }),
  gozluk: Object.freeze({ ad: 'Gözlük', emoji: '🕶️', tur: 'kiyafet', fiyat: 80 }),
  tac: Object.freeze({ ad: 'Taç', emoji: '👑', tur: 'kiyafet', fiyat: 150 }),
  emzik: Object.freeze({ ad: 'Emzik', emoji: '👶', tur: 'kiyafet', fiyat: 20 }),
  battaniye: Object.freeze({ ad: 'Battaniyecik', emoji: '☁️', tur: 'kiyafet', fiyat: 35 }),
  pijama: Object.freeze({ ad: 'Yıldızlı pijama', emoji: '🌙', tur: 'kiyafet', fiyat: 70 }),
  ayicik: Object.freeze({ ad: 'Ayıcıklı bodi', emoji: '🧸', tur: 'kiyafet', fiyat: 90 }),
  elbise: Object.freeze({ ad: 'Fırfırlı elbise', emoji: '👗', tur: 'kiyafet', fiyat: 110 }),
  ayitulum: Object.freeze({ ad: 'Ayı kulaklı tulum', emoji: '🐻', tur: 'kiyafet', fiyat: 120 }),
  tavsan: Object.freeze({ ad: 'Tavşan kulaklı tulum', emoji: '🐰', tur: 'kiyafet', fiyat: 120 }),
  yagmurluk: Object.freeze({ ad: 'Sarı yağmurluk', emoji: '☔', tur: 'kiyafet', fiyat: 110 }),
  noelelbise: Object.freeze({ ad: 'Noel elbisesi', emoji: '🎅', tur: 'kiyafet', fiyat: 115 }),
  cileksalopet: Object.freeze({ ad: 'Çilekli salopet', emoji: '🍓', tur: 'kiyafet', fiyat: 105 }),
  cilekbodi: Object.freeze({ ad: 'Çilekli bodi', emoji: '🍓', tur: 'kiyafet', fiyat: 75 }),
  firfirbodi: Object.freeze({ ad: 'Fırfır omuzlu bodi', emoji: '💙', tur: 'kiyafet', fiyat: 80 }),
  lalepijama: Object.freeze({ ad: 'Laleli uyku tulumu', emoji: '🌷', tur: 'kiyafet', fiyat: 85 }),
  ciftrenk: Object.freeze({ ad: 'Çiçekli çift renk tulum', emoji: '🌸', tur: 'kiyafet', fiyat: 95 }),
  denizci: Object.freeze({ ad: 'Denizci takımı', emoji: '⚓', tur: 'kiyafet', fiyat: 100 }),
  salopet: Object.freeze({ ad: 'Kot salopet', emoji: '👖', tur: 'kiyafet', fiyat: 90 }),
  noelbant: Object.freeze({ ad: 'Noel fiyonklu bant', emoji: '🎀', tur: 'kiyafet', fiyat: 45 }),
  kovasapka: Object.freeze({ ad: 'Balıkçı şapka', emoji: '👒', tur: 'kiyafet', fiyat: 45 }),
  bere: Object.freeze({ ad: 'Ponponlu bere', emoji: '🧶', tur: 'kiyafet', fiyat: 50 }),
  cicektac: Object.freeze({ ad: 'Çiçek tacı', emoji: '🌼', tur: 'kiyafet', fiyat: 55 }),
  kalpgozluk: Object.freeze({ ad: 'Kalp gözlük', emoji: '💖', tur: 'kiyafet', fiyat: 65 }),
  onluk: Object.freeze({ ad: 'Kalpli önlük', emoji: '💙', tur: 'kiyafet', fiyat: 30 }),
  papyon: Object.freeze({ ad: 'Papyon', emoji: '🎩', tur: 'kiyafet', fiyat: 30 }),
  yildizemzik: Object.freeze({ ad: 'Yıldızlı emzik', emoji: '⭐', tur: 'kiyafet', fiyat: 25 }),
  pelus: Object.freeze({ ad: 'Peluş ayıcık', emoji: '🧸', tur: 'kiyafet', fiyat: 60 }),
});

const iso = (ms) => new Date(ms).toISOString();
const kirp = (x) => Math.min(100, Math.max(0, x));
const yuvarla = (x) => Math.round(x * 10) / 10;
const nesne = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
const sayi = (x) => (Number.isFinite(x) && x > 0 ? x : 0);
const kimGecerli = (kim) => typeof kim === 'string' && kim.length > 0;

/** Kişinin sayacı (bozuk alanlar 0): { kazanc, harcama, gun, bugun, gorevGun? }. */
export function jetonKaydi(y, kim) {
  const k = nesne(nesne(y?.jeton)[kim]);
  return {
    kazanc: sayi(k.kazanc),
    harcama: sayi(k.harcama),
    gun: typeof k.gun === 'string' ? k.gun : null,
    bugun: sayi(k.bugun),
    ...(typeof k.gorevGun === 'string' ? { gorevGun: k.gorevGun } : {}),
  };
}

/** Ortak bakiye (eksi olabilir: eşzamanlı harcama). */
export function jetonBakiye(y) {
  let n = 0;
  for (const kim of Object.keys(nesne(y?.jeton))) {
    const k = jetonKaydi(y, kim);
    n += k.kazanc - k.harcama;
  }
  for (const d of Object.values(nesne(y?.dolap))) n -= sayi(nesne(d).fiyat);
  return n;
}

/** Kişinin bugün kazanabileceği kalan jeton. */
export function gunlukKalan(y, kim, simdi) {
  const k = jetonKaydi(y, kim);
  const bugun = k.gun === toDay(new Date(simdi)) ? k.bugun : 0;
  return Math.max(0, GUNLUK_SINIR - bugun);
}

/**
 * Jeton kazan (mini oyun, görev...). -> { hata: 'gecersiz'|'sinir' } | { yama, eklenen }
 * miktar pozitif tam sayı; günlük sınırı aşan kısım kesilir (eklenen). Sınır dolmuşsa 'sinir'.
 */
export function jetonKazan(y, { kim, kaynak, miktar, simdi }) {
  if (!kimGecerli(kim) || !KAYNAKLAR.includes(kaynak) || !Number.isInteger(miktar) || miktar <= 0) {
    return { hata: 'gecersiz' };
  }
  const kalan = gunlukKalan(y, kim, simdi);
  if (kalan <= 0) return { hata: 'sinir' };
  const eklenen = Math.min(miktar, kalan);
  const k = jetonKaydi(y, kim);
  const gun = toDay(new Date(simdi));
  const bugun = (k.gun === gun ? k.bugun : 0) + eklenen;
  return { yama: { [`jeton.${kim}`]: { ...k, kazanc: k.kazanc + eklenen, gun, bugun } }, eklenen };
}

/** Kıyafet dolapta mı? */
export function dolaptaMi(y, urun) {
  return Object.hasOwn(nesne(y?.dolap), urun);
}

/** Özel günde kişi başı bir pasta bedava. Hak son.<clientId>.pastaGun ile harcanır (yalnız sahibi yazar). */
export function pastaBedavaMi(y, kim, simdi) {
  const gun = toDay(new Date(simdi));
  return !!ozelGun(y, gun) && nesne(nesne(y?.son)[kim]).pastaGun !== gun;
}

/**
 * Satın al. -> { hata: 'bilinmiyor'|'zaten'|'kilitli'|'yumurta'|'uyuyor'|'yetersiz', eksik?, evre? }
 *            | { yama, kayit: { eylem: 'satinal', kim, at, deger: urunId } }
 * Kıyafet: 'dolap.<id>' = { at, kim, fiyat } (bedel buradan sayılır). Yiyecek: kişinin harcama sayacı artar,
 * etki şimdiki değere eklenir (puan ve bekleme yok), tuvalet artışı tuvalet.js ile. Yiyecek yumurtada ve uykuda verilmez.
 */
export function satinAl(y, { kim, urun, simdi }) {
  const u = Object.hasOwn(URUNLER, urun) ? URUNLER[urun] : null;
  if (!u || !kimGecerli(kim)) return { hata: 'bilinmiyor' };
  if (u.tur === 'kiyafet' && dolaptaMi(y, urun)) return { hata: 'zaten' };
  const evre = urunKilidi(y, urun);
  if (evre) return { hata: 'kilitli', evre };
  if (u.tur === 'yiyecek') {
    if (!y || y.asama === 'yumurta') return { hata: 'yumurta' };
    if (uyuyorMu(y.uyku, simdi)) return { hata: 'uyuyor' };
  }
  const bedava = urun === 'pasta' && pastaBedavaMi(y, kim, simdi);
  const bakiye = jetonBakiye(y);
  if (!bedava && bakiye < u.fiyat) return { hata: 'yetersiz', eksik: u.fiyat - bakiye };

  const at = iso(simdi);
  const kayit = { eylem: 'satinal', kim, at, deger: urun };
  if (u.tur === 'kiyafet') return { yama: { [`dolap.${urun}`]: { at, kim, fiyat: u.fiyat } }, kayit };

  const k = jetonKaydi(y, kim);
  const d = ihtiyaclar(y, simdi);
  const yama = bedava
    ? { [`son.${kim}`]: { ...nesne(nesne(y?.son)[kim]), pastaGun: toDay(new Date(simdi)) } }
    : { [`jeton.${kim}`]: { ...k, harcama: k.harcama + u.fiyat } };
  for (const [ad, artis] of Object.entries(u.etki)) yama[`ihtiyac.${ad}`] = { v: yuvarla(kirp(d[ad] + artis)), t: at };
  Object.assign(yama, tuvaletYamasi(y, { simdi, artis: u.tuvalet }));
  return { yama, kayit };
}
