// Ce-e: saf mantık (DOM yok, tohumlu, Node'da test edilir).
// Her tur: bebek bir battaniyenin altında görünür, battaniyeler örtülür, yer değiştirir; oyuncu bebeği bulur.
// Fazlar: goster → ortu → karistir → sec → sonuc → (sonraki tur | bitti).
// Battaniye k'nin yeri yer[k] (yuva 0..n-1). Takas [a, b]: a ve b yuvasındaki battaniyeler yer değiştirir.
// Zorluk turla artar: battaniye sayısı (3→5), takas sayısı, takas hızı. Doğru bulma 2 + tur puan.
import { mulberry32 } from '../../../games/hafiza/rng.js';

export const TUR_SAYISI = 6;
export const GOSTER_MS = 1100;
export const ORTU_MS = 450;
export const SEC_MS = 6000; // süre dolarsa yanlış sayılır
export const SONUC_MS = 1150;
const YAVAS = 1.35;

/** Tur (1'den) ayarı: battaniye sayısı, takas sayısı, bir takasın süresi (ms). */
export function turAyar(tur) {
  return {
    n: tur <= 2 ? 3 : tur <= 4 ? 4 : 5,
    takas: 3 + tur,
    takasMs: Math.max(260, 580 - tur * 50),
  };
}

export const turPuan = (tur) => 2 + tur;

function takaslarUret(rnd, n, adet, bebekYuva) {
  const out = [];
  let yuva = bebekYuva;
  let onceki = '';
  while (out.length < adet) {
    // Takasların en az yarısı bebeğin yuvasına dokunsun: izlemek anlamlı olsun.
    let a = rnd() < 0.55 ? yuva : Math.floor(rnd() * n);
    let b = Math.floor(rnd() * (n - 1));
    if (b >= a) b++;
    if (a > b) [a, b] = [b, a];
    const anahtar = `${a}-${b}`;
    if (anahtar === onceki) continue;
    onceki = anahtar;
    out.push([a, b]);
    if (yuva === a) yuva = b; else if (yuva === b) yuva = a;
  }
  return out;
}

function turKur(s) {
  const a = turAyar(s.tur);
  s.n = a.n;
  s.takasMs = Math.round(a.takasMs * s.carpan);
  s.yer = Array.from({ length: a.n }, (_, i) => i);
  s.bebek = Math.floor(s.rnd() * a.n);
  s.takaslar = takaslarUret(s.rnd, a.n, a.takas, s.bebek);
  s.takasNo = 0;
  s.secilen = null;
  s.faz = 'goster';
  s.fazT = 0;
}

export function yeni({ tohum = 1, yavas = false } = {}) {
  const s = { rnd: mulberry32(tohum), tur: 1, skor: 0, dogru: 0, carpan: yavas ? YAVAS : 1, bitti: false, olaylar: [] };
  turKur(s);
  return s;
}

function takasUygula(s, [a, b]) {
  s.yer = s.yer.map((y) => (y === a ? b : y === b ? a : y));
}

function fazaGec(s, faz) {
  s.faz = faz;
  s.fazT = 0;
  s.olaylar.push({ tur: 'faz', faz });
}

/** Zamanı ilerletir (dt ms, en çok 100). Faz değişimleri s.olaylar'a eklenir. */
export function adim(s, dt) {
  if (s.bitti) return s;
  s.fazT += Math.min(100, Math.max(0, dt));
  if (s.faz === 'goster' && s.fazT >= GOSTER_MS) fazaGec(s, 'ortu');
  else if (s.faz === 'ortu' && s.fazT >= ORTU_MS) fazaGec(s, 'karistir');
  else if (s.faz === 'karistir') {
    while (s.takasNo < s.takaslar.length && s.fazT >= (s.takasNo + 1) * s.takasMs) {
      takasUygula(s, s.takaslar[s.takasNo]);
      s.takasNo++;
    }
    if (s.takasNo >= s.takaslar.length) fazaGec(s, 'sec');
  } else if (s.faz === 'sec' && s.fazT >= SEC_MS) sonuclandir(s, -1);
  else if (s.faz === 'sonuc' && s.fazT >= SONUC_MS) {
    if (s.tur >= TUR_SAYISI) { s.bitti = true; s.olaylar.push({ tur: 'faz', faz: 'bitti' }); return s; }
    s.tur++;
    turKur(s);
    s.olaylar.push({ tur: 'faz', faz: 'goster' });
  }
  return s;
}

function sonuclandir(s, k) {
  const dogru = k === s.bebek;
  const puan = dogru ? turPuan(s.tur) : 0;
  s.secilen = k;
  s.skor += puan;
  if (dogru) s.dogru++;
  fazaGec(s, 'sonuc');
  s.olaylar.push({ tur: 'secim', dogru, puan, k });
}

/** Battaniye k'yı seç (yalnız 'sec' fazında). -> { dogru, puan } | null */
export function sec(s, k) {
  if (s.bitti || s.faz !== 'sec' || !Number.isInteger(k) || k < 0 || k >= s.n) return null;
  sonuclandir(s, k);
  const o = s.olaylar[s.olaylar.length - 1];
  return { dogru: o.dogru, puan: o.puan };
}

/** Battaniye k'nın görünür yuvası (karışırken ara değer) ve kalkma payı (0..1, takas yayı için). */
export function konumlar(s) {
  const out = s.yer.map((y) => ({ yuva: y, kalk: 0 }));
  if (s.faz !== 'karistir' || s.takasNo >= s.takaslar.length) return out;
  const p = Math.min(1, Math.max(0, (s.fazT - s.takasNo * s.takasMs) / s.takasMs));
  const e = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2; // yumuşak giriş-çıkış
  const [a, b] = s.takaslar[s.takasNo];
  s.yer.forEach((y, k) => {
    if (y === a) out[k] = { yuva: a + (b - a) * e, kalk: Math.sin(Math.PI * e) };
    else if (y === b) out[k] = { yuva: b + (a - b) * e, kalk: -Math.sin(Math.PI * e) };
  });
  return out;
}

/** Bebek görünür mü (gösterme ve sonuç fazında). */
export const bebekGorunur = (s) => s.faz === 'goster' || s.faz === 'sonuc';
