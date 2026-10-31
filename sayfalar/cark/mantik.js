// Karar Çarkı: saf mantık (DOM yok; Node'da test edilir).
// Eşzamanlı döndürme: döndüren cihaz sonucu ve tohumu seçer, oda yayınıyla (room.send) gönderir.
// Mesaj: { t: 'cevir', cark, baslik, secenekler: [2–12 metin], sonuc: dilim no, tohum: uint32, at: ms }.
// Alıcı aynı seçeneklerle aynı hedef açıyı (hedefAci) hesaplar: ikisinde de çark aynı dilimde durur.
// Yeni veri türü yok. "Kendi çarkım" yalnız bu cihazın yerel deposunda (kendiOku).
import { mulberry32, randomSeed, shuffle } from '../../games/_soru/rng.js';

export const MIN_SECENEK = 2;
export const MAX_SECENEK = 12;
export const SECENEK_MAX = 40;   // karakter (kod noktası)
export const BASLIK_MAX = 60;
export const FIKIR_MAX = 34;     // "Ne yapalım?" çarkına giren randevu fikri en çok bu kadar karakter
export const SURE_MS = 3600;     // dönme süresi
export const KENDI_ANAHTAR = 'bizim.cark.kendi';

export const YEMEKLER = [
  'Pizza 🍕', 'Döner 🥙', 'Lahmacun 🫓', 'Mantı 🥟', 'Hamburger 🍔', 'Sushi 🍣',
  'Makarna 🍝', 'Kebap 🍢', 'Balık 🐟', 'Köfte 🍖', 'Tavuk 🍗', 'Ev yemeği 🍲',
];

// on: sonuç cümlesinin başı. ek: sonuca eklenen emoji (yemeklerde zaten var).
export const CARKLAR = [
  { id: 'yemek', ad: 'Ne yesek?', emoji: '🍕', on: 'Bu akşam:', ek: '' },
  { id: 'izle', ad: 'Ne izlesek?', emoji: '🎬', on: 'Bu akşam:', ek: '🎬', liste: 'izlenecek' },
  { id: 'git', ad: 'Nereye gidelim?', emoji: '📍', on: 'Sıradaki rota:', ek: '📍', liste: 'gidilecek' },
  { id: 'yap', ad: 'Ne yapalım?', emoji: '🌹', on: 'Bu akşam:', ek: '🌹' },
  { id: 'kendi', ad: 'Kendi çarkım', emoji: '🎡', on: 'Çark dedi ki:', ek: '🎡' },
];

export function carkById(id) {
  return CARKLAR.find((c) => c.id === id) || null;
}

const tekSatir = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const kes = (s, max) => {
  const k = Array.from(s);
  return k.length > max ? k.slice(0, max).join('').trim() : s;
};
const anahtar = (s) => s.toLocaleLowerCase('tr');

/** Metinleri tek satıra indirir, kısaltır; boş ve (büyük/küçük harf duyarsız) yinelenenleri atar. */
function temizle(list, max = Infinity) {
  const out = [];
  const gorulen = new Set();
  for (const x of list || []) {
    if (typeof x !== 'string') continue;
    const m = kes(tekSatir(x), SECENEK_MAX);
    if (!m || gorulen.has(anahtar(m))) continue;
    gorulen.add(anahtar(m));
    out.push(m);
    if (out.length >= max) break;
  }
  return out;
}

/** 'liste' belgelerinden o listenin yapılmamış öğeleri (belge sırasıyla). */
export function listeSecenekleri(docs, liste) {
  return temizle((docs || []).filter((d) => d?.data?.liste === liste && !d.data.yapildi).map((d) => d.data.metin));
}

/** Liste n'den uzunsa tohumla n tane seçer (ikinizde aynı); değilse olduğu gibi. */
export function ornekle(list, n, seed) {
  const l = list || [];
  return l.length <= n ? l.slice() : shuffle(l, seed).slice(0, n);
}

/** Gün + ek metinden kararlı 32 bit tohum (FNV-1a). Aynı gün ikinizde aynı örnek. */
export function gunTohumu(gun, ek = '') {
  let h = 0x811c9dc5;
  for (const c of `${gun}|${ek}`) {
    h ^= c.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Randevu fikirlerinden çarka sığan kısa olanlar, tohumla n tane. */
export function fikirSecenekleri(fikirler, seed, n = 8) {
  const kisa = (fikirler || []).map((f) => tekSatir(f?.metin)).filter((m) => m && m.length <= FIKIR_MAX);
  return ornekle(kisa, n, seed);
}

/** Çarkın seçenekleri. ort = { docs ('liste' belgeleri), fikirler, kendi, gun, oda }. */
export function secenekler(carkId, { docs = [], fikirler = [], kendi = [], gun = '', oda = '' } = {}) {
  const c = carkById(carkId);
  if (!c) return [];
  if (c.id === 'yemek') return YEMEKLER.slice();
  if (c.liste) return ornekle(listeSecenekleri(docs, c.liste), MAX_SECENEK, gunTohumu(gun, `${oda}|${c.liste}`));
  if (c.id === 'yap') return fikirSecenekleri(fikirler, gunTohumu(gun, `${oda}|yap`));
  return temizle(kendi, MAX_SECENEK);
}

// ---------- Kendi çarkım (yerel depo) ----------
/** Depodaki JSON → temiz liste. Bozuksa boş. */
export function kendiOku(raw) {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? temizle(v, MAX_SECENEK) : [];
  } catch {
    return [];
  }
}

/** -> { liste } | { hata } */
export function kendiEkle(liste, metin) {
  const m = kes(tekSatir(metin), SECENEK_MAX);
  if (!m) return { hata: 'Önce bir seçenek yaz.' };
  if (liste.some((x) => anahtar(x) === anahtar(m))) return { hata: 'Bu seçenek zaten çarkta.' };
  if (liste.length >= MAX_SECENEK) return { hata: `En çok ${MAX_SECENEK} seçenek olabilir.` };
  return { liste: [...liste, m] };
}

export function kendiCikar(liste, i) {
  return liste.filter((_, j) => j !== i);
}

// ---------- Döndürme ----------
/** Döndüren cihaz: sonuç dilimi ve animasyon tohumu. */
export function cevirmeHazirla(n, rnd = Math.random) {
  return { sonuc: Math.min(n - 1, Math.floor(rnd() * n)), tohum: randomSeed() >>> 0 };
}

const mod = (a, m) => ((a % m) + m) % m;

/**
 * Çarkın son açısı (derece, saat yönü). İbre üstte (0°); dilim i, [i·s, (i+1)·s] aralığında.
 * Tohum: dilim içindeki konum (merkezden ±%35) ve tur sayısı (5–6). bas: şu anki açı.
 */
export function hedefAci(bas, n, sonuc, tohum) {
  const s = 360 / n;
  const r = mulberry32(tohum);
  const kayma = (r() - 0.5) * 0.7;
  const tur = 5 + Math.floor(r() * 2);
  const hedef = mod(-(sonuc + 0.5 + kayma) * s, 360);
  return bas + tur * 360 + mod(hedef - bas, 360);
}

/** Açıda ibrenin gösterdiği dilim. */
export function aciSonuc(aci, n) {
  return Math.min(n - 1, Math.floor(mod(-aci, 360) / (360 / n)));
}

// ---------- Oda mesajı ----------
export function mesajKur({ cark, baslik, secenekler: liste, sonuc, tohum, at }) {
  return { t: 'cevir', cark, baslik, secenekler: liste, sonuc, tohum, at };
}

/** Gelen mesajı denetler ve temizler. -> mesaj | null */
export function mesajGecerli(m) {
  if (!m || typeof m !== 'object' || m.t !== 'cevir') return null;
  if (!carkById(m.cark)) return null;
  if (!Array.isArray(m.secenekler) || m.secenekler.some((x) => typeof x !== 'string')) return null;
  const liste = temizle(m.secenekler);
  if (liste.length !== m.secenekler.length) return null; // boş ya da yinelenen: dilimler kayar
  if (liste.length < MIN_SECENEK || liste.length > MAX_SECENEK) return null;
  if (!Number.isInteger(m.sonuc) || m.sonuc < 0 || m.sonuc >= liste.length) return null;
  if (!Number.isInteger(m.tohum) || m.tohum < 0 || m.tohum >= 2 ** 32) return null;
  if (typeof m.at !== 'number' || !Number.isFinite(m.at)) return null;
  const baslik = kes(tekSatir(m.baslik), BASLIK_MAX);
  return mesajKur({ cark: m.cark, baslik, secenekler: liste, sonuc: m.sonuc, tohum: m.tohum, at: m.at });
}

/** İki cihaz aynı anda çevirirse: önce başlayan (eşitte küçük clientId) geçerli. İki taraf da aynı sonuca varır. */
export function onceGelir(a, b) {
  if (a.at !== b.at) return a.at < b.at;
  return String(a.from) < String(b.from);
}

// ---------- Görünüm yardımcıları ----------
/** "Bu akşam: Pizza 🍕" → { on: 'Bu akşam:', deger: 'Pizza 🍕' } */
export function sonucParcalari(carkId, secenek) {
  const c = carkById(carkId);
  if (!c) return { on: 'Çark dedi ki:', deger: secenek };
  return { on: c.on, deger: c.ek ? `${secenek} ${c.ek}` : secenek };
}

/** Dilim etiketi: kelime sınırında kısaltır, sona "…". */
export function etiketKisalt(s, max = 14) {
  const k = Array.from(s);
  if (k.length <= max) return s;
  const parca = k.slice(0, max - 1).join('');
  const bosluk = parca.lastIndexOf(' ');
  return `${(bosluk > 3 ? parca.slice(0, bosluk) : parca).trim()}…`;
}

/** Dilim etiketi satırları: kelime kelime sarar (uzun kelime bölünür); sığmayan son satır "…" ile biter. */
export function etiketSatirlari(s, max = 14, satirSayisi = 2) {
  const parcalar = [];
  for (const k of tekSatir(s).split(' ').filter(Boolean)) {
    const harf = Array.from(k);
    for (let i = 0; i < harf.length; i += max) parcalar.push(harf.slice(i, i + max).join(''));
  }
  const satirlar = [];
  for (const p of parcalar) {
    const son = satirlar.at(-1);
    if (son != null && Array.from(son).length + 1 + Array.from(p).length <= max) satirlar[satirlar.length - 1] = `${son} ${p}`;
    else satirlar.push(p);
  }
  if (satirlar.length <= satirSayisi) return satirlar;
  const kalan = satirlar.slice(satirSayisi - 1).join(' ');
  return [...satirlar.slice(0, satirSayisi - 1), etiketKisalt(kalan, max)];
}

/** Dilim rengi 1–6 (--tint-N). Komşu dilimler, sondan başa da, farklı. */
export function dilimRenk(i, n) {
  if (i === n - 1 && n > 1 && i % 6 === 0) return 3;
  return (i % 6) + 1;
}
