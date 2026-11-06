// Giydirme Siparişi: saf mantık (DOM yok, tohumlu, Node'da test edilir).
// Yavru sipariş verir (1-3 parça, her biri farklı yuvada); oyuncu 6 seçenekten siparişi bulup giydirir.
// Puan: doğru parça +2; sipariş bitince uzunluk × 2 bonus; art arda hatasız siparişte +1. Yanlış parça süreden 3 sn yer.
// Fazlar: sec → kutla → sec ... → bitti. Süre kutlamada da akar. Her siparişte bebek baştan giydirilir.
import { mulberry32, shuffle } from '../../../games/hafiza/rng.js';
import { YUVALAR } from '../giyim.js';

export const SURE = 45000;
export const CEZA_MS = 3000;
export const KUTLA_MS = 1000;
export const SECENEK = 6;
export const EN_UZUN = 3;
export const PARCA_PUAN = 2;
export const BONUS_CARPAN = 2;
export const SERI_PUAN = 1;
const YAVAS = 1.2;

/** Bilinmeyen yuvayı, boş listeyi ve tekrarı atar. Hiç parça kalmazsa varsayılan katalog. */
function katalogOku(katalog) {
  const temiz = {};
  for (const yuva of Object.keys(YUVALAR)) {
    const liste = [...new Set(katalog?.[yuva] ?? [])];
    if (liste.length) temiz[yuva] = liste;
  }
  return Object.keys(temiz).length ? temiz : YUVALAR;
}

/** Biten sipariş sayısına göre uzunluk: 1, 1, 2, 2, 3, 3, 3 ... Katalogdaki yuva sayısını aşmaz. */
const uzunluk = (s) => Math.min(EN_UZUN, Object.keys(s.katalog).length, 1 + Math.floor(s.tamam / 2));

function secenekUret(s) {
  const havuz = shuffle(Object.keys(s.yuvasi).filter((id) => !s.siparis.includes(id)), s.rnd);
  const secilen = [...s.siparis];
  // Her sipariş parçasına aynı yuvadan bir çeldirici: uzun siparişte benzerler çoğalır.
  for (const id of s.siparis) {
    const i = havuz.findIndex((x) => s.yuvasi[x] === s.yuvasi[id]);
    if (i >= 0) secilen.push(havuz.splice(i, 1)[0]);
  }
  return shuffle([...secilen, ...havuz].slice(0, SECENEK), s.rnd);
}

function yeniSiparis(s) {
  const yuvalar = shuffle(Object.keys(s.katalog), s.rnd).slice(0, uzunluk(s));
  s.siparis = yuvalar.map((yuva) => {
    const liste = s.katalog[yuva];
    const taze = liste.filter((id) => !s.siparis.includes(id)); // bir önceki siparişteki parça tekrar istenmez
    const aday = taze.length ? taze : liste;
    return aday[Math.floor(s.rnd() * aday.length)];
  });
  s.secenekler = secenekUret(s);
  s.giyilenler = {};
  s.hatasiz = true;
  s.no++;
  s.faz = 'sec';
  s.fazT = 0;
  s.olaylar.push({ tur: 'siparis', parcalar: [...s.siparis] });
}

export function yeni({ tohum = 1, yavas = false, katalog = YUVALAR } = {}) {
  const k = katalogOku(katalog);
  const yuvasi = {};
  for (const [yuva, liste] of Object.entries(k)) for (const id of liste) yuvasi[id] = yuva;
  const s = {
    rnd: mulberry32(tohum), katalog: k, yuvasi, t: 0, sure: yavas ? SURE * YAVAS : SURE, kutlaMs: yavas ? KUTLA_MS * YAVAS : KUTLA_MS,
    faz: 'sec', fazT: 0, skor: 0, no: 0, tamam: 0, seri: 0, hatasiz: true, siparis: [], secenekler: [], giyilenler: {}, bitti: false, olaylar: [],
  };
  yeniSiparis(s);
  return s;
}

function bitir(s) {
  s.bitti = true;
  s.faz = 'bitti';
  s.olaylar.push({ tur: 'bitti' });
}

/** Zamanı ilerletir (dt ms, en çok 100). */
export function adim(s, dt) {
  if (s.bitti) return s;
  const d = Math.min(100, Math.max(0, dt));
  s.t = Math.min(s.sure, s.t + d);
  s.fazT += d;
  if (s.t >= s.sure) bitir(s);
  else if (s.faz === 'kutla' && s.fazT >= s.kutlaMs) yeniSiparis(s);
  return s;
}

/** Parça bu siparişte giyildi mi? */
export const giyildiMi = (s, urun) => s.giyilenler[s.yuvasi[urun]] === urun;

/**
 * Seçenek urun'e bas (yalnız 'sec' fazında). -> { dogru, tamam, puan } | { dogru: false } | null
 * Giyilmiş parçaya basmak puan da ceza da vermez. giyilenler yalnız değişince yeni nesne olur (ekran buna bakıp çizer).
 */
export function sec(s, urun) {
  if (s.bitti || s.faz !== 'sec' || !s.secenekler.includes(urun)) return null;
  if (!s.siparis.includes(urun)) {
    s.hatasiz = false;
    s.seri = 0;
    s.t = Math.min(s.sure, s.t + CEZA_MS);
    s.olaylar.push({ tur: 'yanlis', urun });
    if (s.t >= s.sure) bitir(s);
    return { dogru: false };
  }
  if (giyildiMi(s, urun)) return { dogru: true, tamam: false, puan: 0 };
  s.giyilenler = { ...s.giyilenler, [s.yuvasi[urun]]: urun };
  s.skor += PARCA_PUAN;
  const tamam = s.siparis.every((id) => giyildiMi(s, id));
  s.olaylar.push({ tur: 'dogru', urun, tamam });
  if (!tamam) return { dogru: true, tamam: false, puan: PARCA_PUAN };
  if (s.hatasiz) s.seri++;
  const bonus = s.siparis.length * BONUS_CARPAN;
  const seriPuan = s.seri >= 2 ? SERI_PUAN : 0;
  s.skor += bonus + seriPuan;
  s.tamam++;
  s.faz = 'kutla';
  s.fazT = 0;
  s.olaylar.push({ tur: 'tamam', uzunluk: s.siparis.length, bonus, seriPuan });
  return { dogru: true, tamam: true, puan: PARCA_PUAN + bonus + seriPuan };
}

export const kalanMs = (s) => s.sure - s.t;
export const ilerleme = (s) => s.t / s.sure;
