// Ninni ritmi: saf mantık (DOM yok, tohumlu, Node'da test edilir).
// Gökte 5 yıldız. Ninni bir dizi çalar (yıldızlar sırayla yanar); oyuncu aynı sırayla dokunur.
// Doğru biten her dizi bir nota uzar ve tempo hızlanır. Yanlış dokunuş bir bulut getirir; dizi yeniden çalar.
// 3 bulut ayı örterse ya da süre biterse oyun biter. Puan: doğru dokunuş +1, biten dizi + uzunluğu.
// Fazlar: dinle → cal → (iyi | hata) → dinle ... → bitti.
import { mulberry32 } from '../../../games/hafiza/rng.js';

export const YILDIZ = 5;
export const SURE = 40000;
export const CAN = 3;
export const ILK_UZUNLUK = 3;
export const EN_UZUN = 12;
export const ARA_MS = 140; // iki nota arası sessizlik
export const BASLA_MS = 500; // dinle fazının başındaki bekleme
export const IYI_MS = 650;
export const HATA_MS = 950;
const YAVAS = 1.3;

/** Uzunluğa göre bir notanın yanma süresi (ms): dizi uzadıkça kısalır. */
export function notaMs(uzunluk) {
  return Math.max(280, 600 - (uzunluk - ILK_UZUNLUK) * 45);
}

/** Tohumlu dizi: art arda en çok iki aynı yıldız. */
export function diziUret(rnd, adet = EN_UZUN) {
  const out = [];
  while (out.length < adet) {
    const i = Math.floor(rnd() * YILDIZ);
    const n = out.length;
    if (n >= 2 && out[n - 1] === i && out[n - 2] === i) continue;
    out.push(i);
  }
  return out;
}

export function yeni({ tohum = 1, yavas = false } = {}) {
  return {
    dizi: diziUret(mulberry32(tohum)), uzunluk: ILK_UZUNLUK, girilen: 0, t: 0, faz: 'dinle', fazT: 0,
    skor: 0, can: CAN, carpan: yavas ? YAVAS : 1, bitti: false, olaylar: [],
  };
}

const adimMs = (s) => Math.round(notaMs(s.uzunluk) * s.carpan) + ARA_MS;

/** Dinle fazında şu an yanan yıldız (yoksa -1). */
export function yanan(s) {
  if (s.faz !== 'dinle' || s.fazT < BASLA_MS) return -1;
  const g = s.fazT - BASLA_MS;
  const i = Math.floor(g / adimMs(s));
  if (i >= s.uzunluk) return -1;
  return g - i * adimMs(s) < adimMs(s) - ARA_MS ? s.dizi[i] : -1;
}

/** Dinle fazının toplam süresi. */
export const dinleMs = (s) => BASLA_MS + s.uzunluk * adimMs(s);

function fazaGec(s, faz) {
  s.faz = faz;
  s.fazT = 0;
  s.olaylar.push({ tur: 'faz', faz });
}

function bitir(s) {
  s.bitti = true;
  s.olaylar.push({ tur: 'faz', faz: 'bitti' });
}

/** Zamanı ilerletir (dt ms, en çok 100). Nota başlangıçları ve fazlar s.olaylar'a eklenir. */
export function adim(s, dt) {
  if (s.bitti) return s;
  const d = Math.min(100, Math.max(0, dt));
  const onceYanan = yanan(s);
  s.t = Math.min(SURE, s.t + d);
  s.fazT += d;
  if (s.t >= SURE) return bitir(s), s;
  if (s.faz === 'dinle') {
    const y = yanan(s);
    if (y >= 0 && y !== onceYanan) s.olaylar.push({ tur: 'nota', yildiz: y });
    if (s.fazT >= dinleMs(s)) { s.girilen = 0; fazaGec(s, 'cal'); }
  } else if (s.faz === 'iyi' && s.fazT >= IYI_MS) fazaGec(s, 'dinle');
  else if (s.faz === 'hata' && s.fazT >= HATA_MS) {
    if (s.can <= 0) bitir(s); else fazaGec(s, 'dinle');
  }
  return s;
}

/** Yıldız i'ye dokun (yalnız 'cal' fazında). -> { dogru, tamam } | null */
export function dokun(s, i) {
  if (s.bitti || s.faz !== 'cal' || !Number.isInteger(i) || i < 0 || i >= YILDIZ) return null;
  if (s.dizi[s.girilen] !== i) {
    s.can--;
    s.olaylar.push({ tur: 'hata', yildiz: i, can: s.can });
    fazaGec(s, 'hata');
    return { dogru: false, tamam: false };
  }
  s.skor += 1;
  s.girilen++;
  if (s.girilen < s.uzunluk) return { dogru: true, tamam: false };
  s.skor += s.uzunluk;
  s.olaylar.push({ tur: 'tamam', uzunluk: s.uzunluk });
  if (s.uzunluk >= EN_UZUN) { bitir(s); return { dogru: true, tamam: true }; }
  s.uzunluk++;
  fazaGec(s, 'iyi');
  return { dogru: true, tamam: true };
}

export const kalanMs = (s) => SURE - s.t;
