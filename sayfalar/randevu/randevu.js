// Randevu Fikirleri: saf mantık (DOM yok; Node'da test edilir).
// Fikir: { id, metin, kategoriler: [KATEGORI id], sure, butce: '₺' | '₺₺' | '₺₺₺' }
// Belge türü 'randevu' (SÖZLEŞME §17): { fikirId?, metin, plan?: 'YYYY-MM-DD', yapildi?: ISO }
//   Belge var = kaydedildi (favori). plan = takvime kondu. yapildi = yaptık.
import { parseDay, daysBetween, leftText } from '../../js/core/gunler.js';
import { mulberry32 } from '../../games/_soru/rng.js';

export const KATEGORILER = [
  { id: 'evde', ad: 'Evde', emoji: '🏠' },
  { id: 'disarida', ad: 'Dışarıda', emoji: '🌳' },
  { id: 'uzaktan', ad: 'Uzaktan', emoji: '💻' },
  { id: 'ucretsiz', ad: 'Ücretsiz', emoji: '🪙' },
  { id: 'macera', ad: 'Macera', emoji: '🧭' },
  { id: 'romantik', ad: 'Romantik', emoji: '🕯️' },
  { id: 'ozelgun', ad: 'Özel gün', emoji: '🎉' },
];
export const BUTCELER = ['₺', '₺₺', '₺₺₺'];
export const MIN_FIKIR = 180;
export const MAX_METIN = 140;

const KAT_IDS = new Set(KATEGORILER.map((k) => k.id));
const ID_RE = /^[a-z0-9-]{1,32}$/;
const tekSatir = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const zaman = (s) => {
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : 0;
};

export function kategoriById(id) {
  return KATEGORILER.find((k) => k.id === id) || null;
}

/** Fikir havuzunu denetler. -> hata metinleri (boşsa geçerli). */
export function fikirleriDogrula(fikirler, { min = MIN_FIKIR } = {}) {
  const hatalar = [];
  const list = Array.isArray(fikirler) ? fikirler : [];
  if (list.length < min) hatalar.push(`En az ${min} fikir gerek; ${list.length} var.`);
  const idler = new Set();
  const metinler = new Set();
  for (const f of list) {
    const id = f?.id;
    if (typeof id !== 'string' || !ID_RE.test(id)) hatalar.push(`Geçersiz id: ${id}`);
    if (idler.has(id)) hatalar.push(`Yinelenen id: ${id}`);
    idler.add(id);
    const metin = tekSatir(f?.metin);
    if (!metin) hatalar.push(`Metin boş: ${id}`);
    else if (metin.length > MAX_METIN) hatalar.push(`Metin çok uzun: ${id}`);
    const anahtar = metin.toLocaleLowerCase('tr');
    if (metin && metinler.has(anahtar)) hatalar.push(`Yinelenen metin: ${id}`);
    metinler.add(anahtar);
    const kat = Array.isArray(f?.kategoriler) ? f.kategoriler : [];
    if (!kat.length) hatalar.push(`Kategori yok: ${id}`);
    for (const k of kat) if (!KAT_IDS.has(k)) hatalar.push(`Geçersiz kategori: ${id} (${k})`);
    if (new Set(kat).size !== kat.length) hatalar.push(`Yinelenen kategori: ${id}`);
    if (!BUTCELER.includes(f?.butce)) hatalar.push(`Geçersiz bütçe: ${id}`);
    if (kat.includes('ucretsiz') && f?.butce !== '₺') hatalar.push(`Ücretsiz fikrin bütçesi ₺ olmalı: ${id}`);
    if (!tekSatir(f?.sure)) hatalar.push(`Süre yok: ${id}`);
  }
  return hatalar;
}

/** kategori / butce null = hepsi. */
export function filtrele(fikirler, { kategori = null, butce = null } = {}) {
  return (fikirler || []).filter((f) =>
    (!kategori || f.kategoriler.includes(kategori)) && (!butce || f.butce === butce));
}

/**
 * Tohumlu çekiliş. haric: atlanacak fikir id'leri (hepsi hariçse havuzun tamamı kullanılır).
 * -> null | { secilen, seri } — seri animasyonda dönen fikirler, son öğe = secilen.
 */
export function cekilis(havuz, seed, { haric = [], adim = 14 } = {}) {
  const list = havuz || [];
  if (!list.length) return null;
  const h = new Set(haric);
  const aday = list.filter((f) => !h.has(f.id));
  const kaynak = aday.length ? aday : list;
  const rnd = mulberry32(seed);
  const secilen = kaynak[Math.floor(rnd() * kaynak.length)];
  const seri = [];
  for (let i = 0; i < adim - 1; i++) {
    let x = list[Math.floor(rnd() * list.length)];
    if (list.length > 1 && x === (seri.at(-1) || secilen)) x = list[(list.indexOf(x) + 1) % list.length];
    seri.push(x);
  }
  seri.push(secilen);
  return { secilen, seri };
}

/** Kaydedilmiş fikirler: fikirId → belge (kendi fikirleri hariç). */
/** Hazır fikrin belge id'si: aynı fikir iki kez (iki cihazdan aynı anda) kaydedilmesin. */
export function fikirDocId(fikir) {
  return 'f-' + fikir.id;
}

export function kayitlar(docs) {
  const m = new Map();
  for (const d of docs || []) if (d?.data?.fikirId) m.set(d.data.fikirId, d);
  return m;
}

/** Yapılmamış kayıtlar. takvim: tarihi olanlar (yakın önce); birGun: tarihsizler (yeni önce). */
export function planlananlar(docs) {
  const acik = (docs || []).filter((d) => !d?.data?.yapildi);
  const takvim = acik.filter((d) => parseDay(d.data.plan))
    .sort((a, b) => (a.data.plan < b.data.plan ? -1 : a.data.plan > b.data.plan ? 1 : 0));
  const birGun = acik.filter((d) => !parseDay(d.data.plan))
    .sort((a, b) => zaman(b.created_at) - zaman(a.created_at));
  return { takvim, birGun };
}

/** Yapılanlar, son yapılan üstte. */
export function yapilanlar(docs) {
  return (docs || []).filter((d) => d?.data?.yapildi)
    .sort((a, b) => zaman(b.data.yapildi) - zaman(a.data.yapildi));
}

/** 'Bugün' | 'Yarın' | 'N gün kaldı' | 'Tarihi geçti' | '' */
export function planMetni(plan, bugun) {
  if (!parseDay(plan)) return '';
  const n = daysBetween(bugun, plan);
  if (!Number.isFinite(n)) return '';
  if (n < 0) return 'Tarihi geçti';
  return leftText(n);
}

/** Yeni kayıt verisi: hazır fikirden ya da kendi metninden. -> { data } | { hata } */
export function yeniRandevu({ fikir = null, metin = '', plan = '' } = {}) {
  const m = tekSatir(fikir ? fikir.metin : metin);
  if (!m) return { hata: 'Önce fikrini yaz.' };
  if (m.length > MAX_METIN) return { hata: `En çok ${MAX_METIN} harf olsun.` };
  if (plan && !parseDay(plan)) return { hata: 'Tarih geçersiz.' };
  const data = fikir ? { fikirId: fikir.id, metin: m } : { metin: m };
  if (plan) data.plan = plan;
  return { data };
}

export function butceMetni(fikir) {
  return fikir?.kategoriler?.includes('ucretsiz') ? 'Ücretsiz' : fikir?.butce || '';
}
