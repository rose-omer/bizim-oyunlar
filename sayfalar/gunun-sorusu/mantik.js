// Günün Sorusu: saf mantık (DOM yok, Node'da test edilir).
// Veri: tür 'gs', id `<gunNo>-<clientId>`, data { gun: number, cevap: string }.
import { daysBetween, toDay, addDays } from '../../js/core/gunler.js';
import { shuffle, mix } from '../../games/_soru/rng.js';

export const BASLANGIC = '2026-01-01';
export const CEVAP_MAX = 1000;
export const MIN_SORU = 400;
export const KATEGORILER = { hafif: 'Hafif', ani: 'Anılar', hayal: 'Hayaller', iliski: 'Biz', derin: 'Derin' };

/** 2026-01-01'den bu yana yerel gün sayısı. date: Date ya da 'YYYY-MM-DD'. */
export function gunNo(date = new Date()) {
  return daysBetween(BASLANGIC, typeof date === 'string' ? date : toDay(date));
}

/** Gün numarası → 'YYYY-MM-DD'. */
export function gunTarihi(no) {
  return addDays(BASLANGIC, no);
}

/** FNV-1a 32 bit: oda kimliğinden tohum. */
export function hashStr(s) {
  let h = 0x811c9dc5;
  const str = String(s ?? '');
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Oda için gün → soru seçicisi. Her tur (sorular.length gün) tohumlu yeni bir karışık sıradır;
 * turda tekrar yoktur. Tur sınırında aynı soru art arda gelmez.
 */
export function soruSecici(sorular, roomId) {
  const n = sorular.length;
  const tohum = hashStr(roomId);
  const turlar = new Map();
  const sira = (tur) => {
    if (turlar.has(tur)) return turlar.get(tur);
    const s = shuffle(sorular, mix(tohum, tur >>> 0));
    if (n > 1) {
      const onceki = shuffle(sorular, mix(tohum, (tur - 1) >>> 0));
      if (s[0] === onceki[n - 1]) [s[0], s[1]] = [s[1], s[0]];
    }
    turlar.set(tur, s);
    return s;
  };
  return (no) => {
    if (!n || !Number.isFinite(no)) return null;
    const tur = Math.floor(no / n);
    return sira(tur)[no - tur * n];
  };
}

/** Odanın o günkü sorusu (iki cihazda aynı). */
export function gununSorusu(sorular, roomId, no) {
  return soruSecici(sorular, roomId)(no);
}

export const docId = (no, clientId) => `${no}-${clientId}`;

/** Belge → { gun, kim, cevap, at } | null (boş cevap ya da bozuk belge null). */
export function cevapOku(doc) {
  const gun = doc?.data?.gun;
  if (!Number.isInteger(gun)) return null;
  const onek = `${gun}-`;
  const id = String(doc.id || '');
  const kim = id.startsWith(onek) ? id.slice(onek.length) : doc.author || '';
  const cevap = typeof doc.data.cevap === 'string' ? doc.data.cevap.trim() : '';
  if (!kim || !cevap) return null;
  return { gun, kim, cevap, at: doc.updated_at || doc.created_at || '' };
}

/** Belgeler → Map<gun, Map<kim, { cevap, at }>>. */
export function gunlereGore(docs) {
  const m = new Map();
  for (const d of docs || []) {
    const c = cevapOku(d);
    if (!c) continue;
    if (!m.has(c.gun)) m.set(c.gun, new Map());
    m.get(c.gun).set(c.kim, { cevap: c.cevap, at: c.at });
  }
  return m;
}

/** O günün durumu. partner = benden farklı en yeni cevap (partnerin birden çok cihazı olabilir). */
export function gunDurumu(harita, no, benId) {
  const gun = harita.get(no);
  if (!gun) return { ben: null, partner: null, ikisi: false };
  const ben = gun.get(benId) || null;
  let partner = null;
  for (const [kim, c] of gun) {
    if (kim === benId) continue;
    if (!partner || Date.parse(c.at) > Date.parse(partner.at)) partner = { kim, ...c };
  }
  return { ben, partner, ikisi: !!(ben && partner) };
}

/** İki ayrı kişinin cevapladığı günler. */
export function ortakGunler(harita) {
  const out = new Set();
  for (const [gun, kisiler] of harita) if (kisiler.size >= 2) out.add(gun);
  return out;
}

/** Seri: ikisinin de cevapladığı ardışık günler (bugün ya da dün biten) ve en uzun seri. */
export function seri(gunler, bugun) {
  const set = new Set([...(gunler || [])].filter((g) => Number.isInteger(g) && g <= bugun));
  let simdi = 0;
  const bas = set.has(bugun) ? bugun : set.has(bugun - 1) ? bugun - 1 : null;
  if (bas !== null) for (let g = bas; set.has(g); g--) simdi++;
  let enUzun = 0;
  let run = 0;
  let prev = null;
  for (const g of [...set].sort((a, b) => a - b)) {
    run = prev !== null && g === prev + 1 ? run + 1 : 1;
    prev = g;
    if (run > enUzun) enUzun = run;
  }
  return { simdi, enUzun, bugunTamam: set.has(bugun) };
}

/** Son n gün (eskiden yeniye): { gun, tarih, durum: 'ikisi'|'ben'|'partner'|'yok' }. */
export function haftaSeridi(harita, bugun, benId, n = 7) {
  const out = [];
  for (let g = bugun - n + 1; g <= bugun; g++) {
    const d = gunDurumu(harita, g, benId);
    const durum = d.ikisi ? 'ikisi' : d.ben ? 'ben' : d.partner ? 'partner' : 'yok';
    out.push({ gun: g, tarih: gunTarihi(g), durum });
  }
  return out;
}

/** Türkçe küçük harf, tek boşluk. */
export function normalize(s) {
  return String(s ?? '').toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim();
}

/**
 * Geçmiş günler (bugün hariç), yeniden eskiye. En az bir cevabı olan günler.
 * -> [{ gun, tarih, soru, ben: string|null, partner: string|null }]
 */
export function arsiv(harita, { bugun, benId, sorular, roomId, ara = '' }) {
  const sec = soruSecici(sorular, roomId);
  const q = normalize(ara);
  const out = [];
  const gunler = [...harita.keys()].filter((g) => g < bugun).sort((a, b) => b - a);
  for (const gun of gunler) {
    const d = gunDurumu(harita, gun, benId);
    const soru = sec(gun);
    const satir = { gun, tarih: gunTarihi(gun), soru, ben: d.ben?.cevap ?? null, partner: d.partner?.cevap ?? null };
    if (q && ![soru?.s, satir.ben, satir.partner].some((t) => t && normalize(t).includes(q))) continue;
    out.push(satir);
  }
  return out;
}

/** Cevap metni geçerli mi? -> hata metni | null */
export function cevapHatasi(metin) {
  const t = String(metin ?? '').trim();
  if (!t) return 'Önce birkaç kelime yaz.';
  if (t.length > CEVAP_MAX) return `Cevap en çok ${CEVAP_MAX} karakter olabilir.`;
  return null;
}

/** Soru bankası doğrulaması. -> hata listesi (boşsa geçerli). */
export function bankaHatalari(sorular) {
  const errs = [];
  const ids = new Set();
  const metinler = new Set();
  if (!Array.isArray(sorular) || sorular.length < MIN_SORU) {
    errs.push(`en az ${MIN_SORU} soru gerekli (${sorular?.length ?? 0})`);
  }
  for (const q of sorular || []) {
    const id = q?.id;
    if (typeof id !== 'string' || !id.trim()) { errs.push('id boş'); continue; }
    if (ids.has(id)) errs.push(`tekrarlanan id ${id}`);
    ids.add(id);
    if (!Object.hasOwn(KATEGORILER, q.k)) errs.push(`${id}: geçersiz kategori ${q.k}`);
    const s = q.s;
    if (typeof s !== 'string' || !s.trim()) { errs.push(`${id}: metin boş`); continue; }
    if (s !== s.trim()) errs.push(`${id}: baş/son boşluk`);
    if (!s.trim().endsWith('?')) errs.push(`${id}: soru işaretiyle bitmeli`);
    if (s.length < 10 || s.length > 160) errs.push(`${id}: uzunluk ${s.length}`);
    const n = normalize(s);
    if (metinler.has(n)) errs.push(`${id}: tekrarlanan metin`);
    metinler.add(n);
  }
  return errs;
}
