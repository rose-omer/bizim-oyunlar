// Yavrumuz: otomatik yazımların tazelik kapısı (saf mantık, DOM yok, Node'da test edilir).
// Sorun: veri.js önbellekle hemen açılır; app.js ciz() eski veriyle mutlak yama yazıp partnerin bakımını silebilir.
// Kural: kaza, çatlama, büyüme, görev ödülü, görev jetonu ve evre yalnız bu görünümde başarılı bir tazelemeden sonra yazılır.
// Arka plana gidince kapı kapanır, öne gelince önce tazelenir. Tazeleme başarısızsa kapı kapalı kalır; yeniden deneme
// aralıklıdır (dene: en çok 30 sn'de bir, hemenDene: bağlantı olaylarında en çok 5 sn'de bir). Düğmeler bu kapıya bakmaz.
import { kazaYamasi } from './tuvalet.js';

export const TAZELEME_ARALIK_MS = 30_000;
const HEMEN_ARALIK_MS = 5000;

/** Otomatik yazım yapılabilir mi? */
export function otoYazimIzinli({ tazelendi = false, cevrimici = true } = {}) {
  return tazelendi === true && cevrimici === true;
}

/** Kaza yazılacak mı? -> null | tuvalet.js kazaYamasi sonucu. */
export function kazaKarari({ tazelendi, y, kim, simdi }) {
  if (!otoYazimIzinli({ tazelendi }) || !y || y.asama === 'yumurta') return null;
  return kazaYamasi(y, { kim, simdi });
}

/**
 * Tazelik durumu. tazele: async () => boolean. tazelenince: başarılı tazelemeden sonra bir kez çağrılır (yeniden çizim).
 * Başarısızlık tazelenince'yi çağırmaz: çizim → deneme → çizim döngüsü oluşmaz.
 */
export function tazelikIzleyici({ tazele, tazelenince, saat = Date.now, gizli = false }) {
  let taze = false;
  let arkada = gizli;
  let nesil = 0; // arka plana her gidişte artar: önceki nesilde başlayan tazeleme sayılmaz
  let suren = null; // süren tazelemenin nesli
  let sonDeneme = -Infinity;

  async function calistir() {
    const n = nesil;
    suren = n;
    sonDeneme = saat();
    let ok = false;
    try {
      ok = (await tazele()) === true;
    } catch {
      ok = false;
    }
    if (suren === n) suren = null;
    if (ok && n === nesil) {
      taze = true;
      tazelenince?.();
    }
  }
  const dene = (aralik) => {
    if (taze || arkada || suren === nesil || saat() - sonDeneme < aralik) return;
    calistir();
  };

  return {
    taze: () => taze,
    /** Çizimde çağrılır: tazeleme yoksa ve aralık dolduysa dener. */
    dene: () => dene(TAZELEME_ARALIK_MS),
    /** Bağlantı geri geldi. */
    hemenDene: () => dene(HEMEN_ARALIK_MS),
    /** Bağlantı koptu ya da yazma, okuma hatası geldi: yeniden tazelenene dek kapalı. */
    koptu: () => { taze = false; },
    gizlendi: () => { arkada = true; taze = false; nesil++; },
    gorundu: () => { arkada = false; taze = false; nesil++; dene(0); },
  };
}
