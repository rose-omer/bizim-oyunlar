// Mama Tarifi: saf mantık (DOM yok, tohumlu, Node'da test edilir).
// Kart tarifi kısa süre gösterir, sonra kapanır. Oyuncu malzemeleri aynı sırayla tencereye ekler.
// Doğru malzeme +2. Biten tarif uzunluk × 3 bonus verir; sonraki tarif yeni ve bir uzun olur (en çok 7).
// Yanlış malzeme bir can götürür, mama taşar, aynı tarif yeniden gösterilir. 3 can biter ya da süre dolarsa oyun biter.
// Fazlar: goster → ekle → (iyi | tasti) → goster ... → bitti. goster fazında süre durur: uzun kart süre yemez.
import { mulberry32 } from '../../../games/hafiza/rng.js';

export const MALZEMELER = Object.freeze([
  { emoji: '🍌', ad: 'Muz' },
  { emoji: '🍎', ad: 'Elma' },
  { emoji: '🥕', ad: 'Havuç' },
  { emoji: '🥛', ad: 'Süt' },
  { emoji: '🍓', ad: 'Çilek' },
  { emoji: '🍯', ad: 'Bal' },
  { emoji: '🥣', ad: 'Yulaf' },
  { emoji: '🍐', ad: 'Armut' },
]);
export const SURE = 45000;
export const CAN = 3;
export const ILK_UZUNLUK = 3;
export const EN_UZUN = 7;
export const KART_MS = 900; // malzeme başına kartın açık kalma süresi
export const IYI_MS = 800;
export const TASTI_MS = 1100;
export const DOGRU_PUAN = 2;
export const BONUS_KAT = 3;
const YAVAS = 1.3;

/** Tohumlu tarif: malzeme tekrar edebilir, art arda aynısı olmaz. */
export function tarifUret(rnd, uzunluk) {
  const out = [];
  while (out.length < uzunluk) {
    const m = Math.floor(rnd() * MALZEMELER.length);
    if (m !== out[out.length - 1]) out.push(m);
  }
  return out;
}

export function yeni({ tohum = 1, yavas = false } = {}) {
  const rnd = mulberry32(tohum);
  return {
    rnd, tarif: tarifUret(rnd, ILK_UZUNLUK), girilen: 0, t: 0, faz: 'goster', fazT: 0,
    skor: 0, can: CAN, carpan: yavas ? YAVAS : 1, bitti: false, olaylar: [],
  };
}

/** Kartın bu tarifte açık kalma süresi (ms). */
export const gosterMs = (s) => Math.round(s.tarif.length * KART_MS * s.carpan);

function fazaGec(s, faz) {
  s.faz = faz;
  s.fazT = 0;
  s.olaylar.push({ tur: 'faz', faz });
}

function bitir(s) {
  s.bitti = true;
  fazaGec(s, 'bitti');
}

function kartiAc(s) {
  s.girilen = 0;
  fazaGec(s, 'goster');
}

/** Zamanı ilerletir (dt ms, en çok 100). Süre goster fazında durur. */
export function adim(s, dt) {
  if (s.bitti) return s;
  const d = Math.min(100, Math.max(0, dt));
  s.fazT += d;
  if (s.faz === 'goster') {
    if (s.fazT >= gosterMs(s)) fazaGec(s, 'ekle');
    return s;
  }
  s.t = Math.min(SURE, s.t + d);
  if (s.t >= SURE) return bitir(s), s;
  if (s.faz === 'iyi' && s.fazT >= IYI_MS) {
    s.tarif = tarifUret(s.rnd, Math.min(EN_UZUN, s.tarif.length + 1));
    kartiAc(s);
  } else if (s.faz === 'tasti' && s.fazT >= TASTI_MS) {
    if (s.can <= 0) bitir(s); else kartiAc(s);
  }
  return s;
}

/** Malzeme m'yi tencereye ekler (yalnız 'ekle' fazında). -> { dogru, tamam } | null */
export function ekle(s, m) {
  if (s.faz !== 'ekle' || !Number.isInteger(m) || m < 0 || m >= MALZEMELER.length) return null;
  if (s.tarif[s.girilen] !== m) {
    s.can--;
    s.olaylar.push({ tur: 'yanlis', malzeme: m, can: s.can });
    fazaGec(s, 'tasti');
    return { dogru: false, tamam: false };
  }
  s.skor += DOGRU_PUAN;
  s.girilen++;
  s.olaylar.push({ tur: 'dogru', malzeme: m, girilen: s.girilen });
  if (s.girilen < s.tarif.length) return { dogru: true, tamam: false };
  const bonus = s.tarif.length * BONUS_KAT;
  s.skor += bonus;
  s.olaylar.push({ tur: 'tamam', uzunluk: s.tarif.length, bonus });
  fazaGec(s, 'iyi');
  return { dogru: true, tamam: true };
}

export const kalanMs = (s) => SURE - s.t;
