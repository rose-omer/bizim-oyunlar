// Top yakala: saf mantık (DOM yok, tohumlu, Node'da test edilir).
// Oyuncaklar yukarıdan düşer; sepet alt kenarda yatay kayar. Sepete giren oyuncak +1, yıldız +3.
// Arka arkaya her 5 yakalamada +2 seri ödülü. Kaçan oyuncak seriyi sıfırlar (puan düşmez).
// Zorluk zamanla artar: daha sık düşer, daha hızlı düşer.
import { mulberry32 } from '../../../games/hafiza/rng.js';

export const SURE = 30000;
export const GEN = 100;
export const YUK = 180;
export const SEPET_G = 26; // sepet genişliği
export const SEPET_Y = 162; // sepet ağzı (üst kenar)
export const TURLER = Object.freeze(['top', 'kup', 'cingirak', 'ayicik', 'yildiz']);
export const PUAN = Object.freeze({ top: 1, kup: 1, cingirak: 1, ayicik: 1, yildiz: 3 });
export const SERI_ODUL = 2;
export const SERI_ADIM = 5;
const YAVAS = 0.75;

/** t (ms) anındaki zorluk: aralık (ms), düşme hızı (birim/sn), yıldız olasılığı. */
export function zorluk(t) {
  const k = Math.min(1, Math.max(0, t / SURE));
  return { aralik: Math.round(900 - 400 * k), hiz: 46 + 34 * k, yildiz: 0.08 };
}

export function yeni({ tohum = 1, yavas = false } = {}) {
  return {
    rnd: mulberry32(tohum), t: 0, skor: 0, esyalar: [], sonraki: 200, id: 0, sepetX: GEN / 2,
    seri: 0, yakalanan: 0, kacan: 0, olaylar: [], carpan: yavas ? YAVAS : 1, bitti: false,
  };
}

const sinirla = (x) => Math.min(GEN - SEPET_G / 2, Math.max(SEPET_G / 2, x));

/** Sepeti x'e koyar (sürükleme, dokunulan yer). */
export function sepetKonum(s, x) {
  if (Number.isFinite(x)) s.sepetX = sinirla(x);
  return s;
}
/** Sepeti dx kadar kaydırır (klavye). */
export function sepetKaydir(s, dx) {
  return sepetKonum(s, s.sepetX + dx);
}

function uret(s, t) {
  const z = zorluk(t);
  const tur = s.rnd() < z.yildiz ? 'yildiz' : TURLER[Math.floor(s.rnd() * 4)];
  const r = tur === 'yildiz' ? 5.5 : 6;
  s.esyalar.push({
    id: ++s.id, tur, r, x: r + 2 + s.rnd() * (GEN - 2 * r - 4), y: -r,
    vy: z.hiz * (tur === 'yildiz' ? 1.2 : 0.92 + s.rnd() * 0.16), don: (s.rnd() - 0.5) * 3,
  });
}

/** Zamanı ilerletir (dt ms, en çok 100). Yakalama/kaçma s.olaylar'a eklenir (görünüm boşaltır). */
export function adim(s, dt) {
  if (s.bitti) return s;
  const d = Math.min(100, Math.max(0, dt));
  s.t = Math.min(SURE, s.t + d);
  while (s.sonraki <= s.t && s.sonraki < SURE) {
    uret(s, s.sonraki);
    s.sonraki += zorluk(s.sonraki).aralik;
  }
  const kalan = [];
  for (const e of s.esyalar) {
    const once = e.y;
    e.y += (e.vy * s.carpan * d) / 1000;
    if (once < SEPET_Y && e.y >= SEPET_Y && Math.abs(e.x - s.sepetX) <= SEPET_G / 2 + e.r * 0.5) {
      s.seri++;
      s.yakalanan++;
      const odul = s.seri % SERI_ADIM === 0 ? SERI_ODUL : 0;
      s.skor += PUAN[e.tur] + odul;
      s.olaylar.push({ tur: 'yakalandi', esya: e.tur, puan: PUAN[e.tur] + odul, seri: s.seri, x: e.x });
      continue;
    }
    if (e.y - e.r > YUK) {
      s.seri = 0;
      s.kacan++;
      s.olaylar.push({ tur: 'kacti', esya: e.tur, x: e.x });
      continue;
    }
    kalan.push(e);
  }
  s.esyalar = kalan;
  if (s.t >= SURE) s.bitti = true;
  return s;
}

export const kalanMs = (s) => SURE - s.t;
