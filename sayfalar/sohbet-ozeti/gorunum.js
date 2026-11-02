// Sohbet Özetimiz: ekran için saf yardımcılar (DOM yok; Node'da test edilir).
import { AY_ADLARI } from '../anilar/mantik.js';

const pad = (n) => String(n).padStart(2, '0');
const gunMs = (g) => { const [y, m, d] = g.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const msGun = (ms) => { const t = new Date(ms); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`; };
const GUN = 86400e3;

/** Dakika → "45 dk", "3 sa 12 dk", "2 gün 4 sa". */
export function sureYaz(dk) {
  const d = Math.max(0, Math.round(Number(dk) || 0));
  if (d < 60) return `${d} dk`;
  if (d < 1440) {
    const s = Math.floor(d / 60);
    const k = d % 60;
    return k ? `${s} sa ${k} dk` : `${s} sa`;
  }
  const g = Math.floor(d / 1440);
  const s = Math.floor((d % 1440) / 60);
  return s ? `${g} gün ${s} sa` : `${g} gün`;
}

/** Ortalama cevap için kısa yazım: 1 dk altı "1 dk'dan az". */
export function cevapYaz(dk) {
  if (dk == null) return '—';
  if (dk < 1) return '1 dk\'dan az';
  return sureYaz(dk);
}

const ILK_SOZLER = [
  ['seviyorum', 'İlk “seviyorum”'],
  ['askim', 'İlk “aşkım”'],
  ['sevgilim', 'İlk “sevgilim”'],
  ['ozledim', 'İlk “özledim”'],
  ['gunaydin', 'İlk “günaydın”'],
];

/** İlkler zaman çizelgesi, eskiden yeniye. -> [{ anahtar, baslik, kim, an|null, gun }] */
export function ilkler(ozet, ids) {
  const out = [];
  if (ozet?.ilkMesaj) out.push({ anahtar: 'mesaj', baslik: 'İlk mesaj', kim: ozet.ilkMesaj.kim, an: null, gun: ozet.ilkMesaj.gun });
  for (const [anahtar, baslik] of ILK_SOZLER) {
    let en = null;
    for (const id of ids || []) {
      const an = ozet?.kisi?.[id]?.sozIlk?.[anahtar];
      if (an && (!en || an < en.an)) en = { anahtar, baslik, kim: id, an };
    }
    if (en) {
      const t = new Date(en.an);
      out.push({ ...en, gun: `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}` });
    }
  }
  return out.sort((a, b) => (a.an || `${a.gun}T00`).localeCompare(b.an || `${b.gun}T00`) || (a.anahtar === 'mesaj' ? -1 : 1));
}

const toplamMedya = (k) => Object.values(k?.medya || {}).reduce((s, n) => s + n, 0);

const KATEGORILER = [
  ['mesaj', 'Mesaj', (k) => k.mesaj],
  ['kelime', 'Kelime', (k) => k.kelime],
  ['medya', 'Medya', toplamMedya],
  ['acma', 'Sohbeti açan', (k) => k.sohbetAcma],
  ['ilk', 'Günün ilk mesajı', (k) => k.gununIlk],
  ['son', 'Günün son mesajı', (k) => k.gununSon],
  ['gece', 'Gece mesajı', (k) => k.gece],
  ['soru', 'Soru', (k) => k.soru],
  ['seviyorum', '“Seviyorum”', (k) => k.soz?.seviyorum],
  ['ozledim', '“Özledim”', (k) => k.soz?.ozledim],
  ['gulme', 'Gülme', (k) => k.soz?.gulme],
  ['muah', 'Öpücük', (k) => k.soz?.muah],
  ['artarda', 'Art arda mesaj', (k) => k.artArda],
  ['silinen', 'Silinen mesaj', (k) => k.silinen],
];

export const MEDYA_ADLARI = {
  foto: 'Fotoğraf', ses: 'Sesli mesaj', cikartma: 'Çıkartma', video: 'Video', gif: 'GIF',
  not: 'Görüntülü not', belge: 'Belge', konum: 'Konum', medya: 'Diğer medya',
};

/**
 * "Kim daha çok?" satırları. İkisi de 0 olan atlanır. -> [{ id, ad, a, b, oran (a payı 0..1), onde: 0|1|null }]
 * Medya türü biliniyorsa (iPhone) "Medya" satırı türlere ayrılır.
 */
export function kategoriler(ozet, ids) {
  const [x, y] = ids || [];
  const ka = ozet?.kisi?.[x];
  const kb = ozet?.kisi?.[y];
  if (!ka || !kb) return [];
  const satirlar = ozet.kaynak?.medyaTuru
    ? KATEGORILER.flatMap((r) => (r[0] !== 'medya' ? [r]
      : Object.keys(MEDYA_ADLARI).map((t) => [`medya-${t}`, MEDYA_ADLARI[t], (k) => k.medya?.[t]])))
    : KATEGORILER;
  const out = [];
  for (const [id, ad, f] of satirlar) {
    const a = f(ka) || 0;
    const b = f(kb) || 0;
    if (!a && !b) continue;
    out.push({ id, ad, a, b, oran: a / (a + b), onde: a === b ? null : a > b ? 0 : 1 });
  }
  return out;
}

/** Yıl yıl: toplam, kişi payı, günlük ortalama (dosya aralığındaki gün sayısına göre). */
export function yillar(ozet) {
  const ilk = ozet?.kaynak?.ilk;
  const son = ozet?.kaynak?.son;
  if (!ilk || !son) return [];
  const map = new Map();
  for (const [ay, kisiler] of Object.entries(ozet.aylik || {})) {
    const yil = Number(ay.slice(0, 4));
    let r = map.get(yil);
    if (!r) { r = { yil, toplam: 0, pay: {} }; map.set(yil, r); }
    for (const [id, n] of Object.entries(kisiler)) {
      r.toplam += n;
      r.pay[id] = (r.pay[id] || 0) + n;
    }
  }
  return [...map.values()].sort((a, b) => a.yil - b.yil).map((r) => {
    const bas = Math.max(gunMs(ilk), Date.UTC(r.yil, 0, 1));
    const bit = Math.min(gunMs(son), Date.UTC(r.yil, 11, 31));
    const gun = Math.max(1, Math.round((bit - bas) / GUN) + 1);
    return { ...r, gun, gunlukOrt: Math.round((r.toplam / gun) * 10) / 10 };
  });
}

/** İlk aydan son aya her ay (boş aylar 0). -> [{ ay: 'YYYY-MM', toplam }] */
export function aylikSeri(ozet) {
  const ilk = ozet?.kaynak?.ilk;
  const son = ozet?.kaynak?.son;
  if (!ilk || !son) return [];
  let y = Number(ilk.slice(0, 4));
  let m = Number(ilk.slice(5, 7));
  const sy = Number(son.slice(0, 4));
  const sm = Number(son.slice(5, 7));
  const out = [];
  while (y < sy || (y === sy && m <= sm)) {
    const ay = `${y}-${pad(m)}`;
    const toplam = Object.values(ozet.aylik?.[ay] || {}).reduce((s, n) => s + n, 0);
    out.push({ ay, toplam });
    if (++m > 12) { m = 1; y++; }
  }
  return out;
}

export const kisaAy = (ay) => `${AY_ADLARI[Number(ay.slice(5, 7)) - 1].slice(0, 3)} ${ay.slice(2, 4)}`;

/**
 * Takvim ısı haritası: haftalar sütun, Pzt–Paz satır.
 * -> { haftalar: [{ ay: 'Oca'|null, gunler: [{ gun, n, seviye 0..4 } | null] x7 }], enCok }
 * Aralık dışındaki hücre null. Seviye: mesajlı günlerin çeyreklerine göre (1..4); mesajsız gün 0.
 */
export function isiHaritasi(gunluk, ilk, son) {
  if (!ilk || !son) return { haftalar: [], enCok: 0 };
  const degerler = Object.values(gunluk || {}).filter((n) => n > 0).sort((a, b) => a - b);
  const q = (p) => degerler[Math.floor(p * (degerler.length - 1))] || 0;
  const esik = [q(0.25), q(0.5), q(0.75)];
  const seviye = (n) => (n <= 0 ? 0 : n <= esik[0] ? 1 : n <= esik[1] ? 2 : n <= esik[2] ? 3 : 4);
  const basMs = gunMs(ilk);
  const sonMs = gunMs(son);
  const hgun = (new Date(basMs).getUTCDay() + 6) % 7; // Pzt = 0
  const haftalar = [];
  let oncekiAy = null;
  for (let ms = basMs - hgun * GUN; ms <= sonMs; ms += 7 * GUN) {
    const gunler = [];
    let ay = null;
    for (let i = 0; i < 7; i++) {
      const t = ms + i * GUN;
      if (t < basMs || t > sonMs) { gunler.push(null); continue; }
      const gun = msGun(t);
      const n = gunluk?.[gun] || 0;
      gunler.push({ gun, n, seviye: seviye(n) });
      const a = gun.slice(0, 7);
      if (a !== oncekiAy) { ay = AY_ADLARI[Number(gun.slice(5, 7)) - 1].slice(0, 3); oncekiAy = a; }
    }
    haftalar.push({ ay, gunler });
  }
  return { haftalar, enCok: degerler.at(-1) || 0 };
}

/** Toplam medya (gösterim). */
export { toplamMedya };
