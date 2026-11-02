// Balon patlat: saf mantık (DOM yok, tohumlu, Node'da test edilir).
// Alan GEN×YUK mantıksal birim; balonlar alttan doğar, yukarı süzülür, hafif sallanır.
// Dokunulan balon patlar: normal +1, altın +5, dikenli −3 (skor 0'ın altına inmez). Kaçan balon ceza değil.
// Zorluk zamanla artar: daha sık doğar, daha hızlı yükselir, dikenli payı büyür.
import { mulberry32 } from '../../../games/hafiza/rng.js';

export const SURE = 30000;
export const GEN = 100;
export const YUK = 180;
export const PUAN = Object.freeze({ normal: 1, altin: 5, diken: -3 });
const PAY = 2; // dokunma toleransı (birim): parmak balonun kenarına değse de sayılır
const YAVAS = 0.72; // hareket azaltma: daha yavaş yükselir

/** t (ms) anındaki zorluk: aralık (ms), hız (birim/sn), dikenli ve altın olasılığı. */
export function zorluk(t) {
  const k = Math.min(1, Math.max(0, t / SURE));
  return { aralik: Math.round(820 - 420 * k), hiz: 26 + 28 * k, diken: 0.12 + 0.13 * k, altin: 0.07 };
}

export function yeni({ tohum = 1, yavas = false } = {}) {
  return {
    rnd: mulberry32(tohum), t: 0, skor: 0, balonlar: [], sonraki: 250, id: 0,
    patlayan: 0, kacan: 0, carpan: yavas ? YAVAS : 1, bitti: false,
  };
}

function uret(s, t) {
  const z = zorluk(t);
  const z1 = s.rnd();
  const tur = z1 < z.altin ? 'altin' : z1 < z.altin + z.diken ? 'diken' : 'normal';
  const r = tur === 'altin' ? 7 : tur === 'diken' ? 9 : 8 + s.rnd() * 2;
  const x0 = r + 3 + s.rnd() * (GEN - 2 * r - 6);
  const hiz = z.hiz * (tur === 'altin' ? 1.3 : 0.9 + s.rnd() * 0.2);
  s.balonlar.push({ id: ++s.id, tur, r, x0, x: x0, y: YUK + r, vy: hiz, faz: s.rnd() * Math.PI * 2, renk: Math.floor(s.rnd() * 4) });
}

/** Zamanı ilerletir (dt ms, en çok 100). Bitince s.bitti. */
export function adim(s, dt) {
  if (s.bitti) return s;
  const d = Math.min(100, Math.max(0, dt));
  s.t = Math.min(SURE, s.t + d);
  while (s.sonraki <= s.t && s.sonraki < SURE) {
    uret(s, s.sonraki);
    s.sonraki += zorluk(s.sonraki).aralik;
  }
  const kalan = [];
  for (const b of s.balonlar) {
    b.y -= (b.vy * s.carpan * d) / 1000;
    b.x = b.x0 + Math.sin(s.t / 650 + b.faz) * 2.2;
    if (b.y + b.r * 2.2 < 0) { s.kacan++; continue; } // ip de çıktı
    kalan.push(b);
  }
  s.balonlar = kalan;
  if (s.t >= SURE) s.bitti = true;
  return s;
}

/** (x, y) noktasına dokunuş. En yakın balon patlar -> { tur, puan, x, y, r } | null. */
export function dokun(s, x, y) {
  if (s.bitti) return null;
  let en = -1;
  let enUz = Infinity;
  s.balonlar.forEach((b, i) => {
    const uz = Math.hypot(b.x - x, b.y - y);
    if (uz <= b.r + PAY && uz < enUz) { en = i; enUz = uz; }
  });
  if (en < 0) return null;
  const [b] = s.balonlar.splice(en, 1);
  const puan = PUAN[b.tur];
  s.skor = Math.max(0, s.skor + puan);
  s.patlayan++;
  return { tur: b.tur, puan, x: b.x, y: b.y, r: b.r };
}

export const kalanMs = (s) => SURE - s.t;
