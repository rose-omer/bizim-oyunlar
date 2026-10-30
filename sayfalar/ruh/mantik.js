// Ruh hâli geçmişi: saf mantık (DOM yok; Node'da test edilir).
// Tür 'ruhgecmis', id '<YYYY-MM-DD>-<clientId>', data { emoji, not?, at } = o günün son seçimi.
// Eski 'ruh' belgesi (id clientId, son ruh hâli) geçmişte olmayan günü doldurur.
import { parseDay, toDay, addDays } from '../../js/core/gunler.js';

export const GECMIS_TURU = 'ruhgecmis';
export const NOT_MAX = 80; // hub.js MOOD_NOTE_MAX ile aynı

/** Ruh hâli seçenekleri: js/hub.js MOODS ile birebir aynı (test denetler; hub.js tarayıcıda içe aktarılamaz). */
export const MOODLAR = [
  { emoji: '🥰', ad: 'Aşık' },
  { emoji: '😊', ad: 'Mutlu' },
  { emoji: '😌', ad: 'Huzurlu' },
  { emoji: '🤩', ad: 'Heyecanlı' },
  { emoji: '😴', ad: 'Yorgun' },
  { emoji: '😔', ad: 'Hüzünlü' },
];

export const GUN_KISA = ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz'];

export function ruhBilgisi(emoji) {
  return MOODLAR.find((m) => m.emoji === emoji) || null;
}

const ID_RE = /^(\d{4}-\d{2}-\d{2})-([A-Za-z0-9_-]+)$/;
const zaman = (iso) => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : NaN;
};

export function gecmisId(gun, clientId) {
  if (!parseDay(gun) || !clientId) throw new Error('Geçersiz gün ya da kişi.');
  return `${gun}-${clientId}`;
}

/** '2026-10-31-<clientId>' → { gun, clientId } | null */
export function gecmisIdCoz(id) {
  const m = ID_RE.exec(String(id ?? ''));
  if (!m || !parseDay(m[1])) return null;
  return { gun: m[1], clientId: m[2] };
}

/** Ruh seçimi → geçmiş verisi { emoji, not?, at }. Emoji ya da zaman yoksa null. */
export function gecmisVerisi(ruh) {
  const emoji = typeof ruh?.emoji === 'string' ? ruh.emoji.trim() : '';
  if (!emoji || !Number.isFinite(zaman(ruh?.at))) return null;
  const not = [...String(ruh.not ?? '').replace(/\s+/g, ' ').trim()].slice(0, NOT_MAX).join('');
  return not ? { emoji, not, at: ruh.at } : { emoji, at: ruh.at };
}

/** ISO an → yerel takvim günü 'YYYY-MM-DD' | null */
export function gunAnahtari(iso) {
  const t = zaman(iso);
  return Number.isFinite(t) ? toDay(new Date(t)) : null;
}

/**
 * Belgeler → Map<clientId, Map<gün, { emoji, not?, at }>>.
 * gecmisDocs: 'ruhgecmis' belgeleri; ruhDocs: 'ruh' belgeleri (id = clientId). Aynı günde daha yeni 'at' kazanır.
 */
export function ruhGunleri(gecmisDocs, ruhDocs) {
  const out = new Map();
  const koy = (kim, gun, data) => {
    const v = gecmisVerisi(data);
    if (!kim || !gun || !v) return;
    if (!out.has(kim)) out.set(kim, new Map());
    const gunler = out.get(kim);
    const eski = gunler.get(gun);
    if (!eski || zaman(v.at) >= zaman(eski.at)) gunler.set(gun, v);
  };
  for (const d of gecmisDocs || []) {
    const k = gecmisIdCoz(d?.id);
    if (k) koy(k.clientId, k.gun, d.data);
  }
  for (const d of ruhDocs || []) koy(d?.id, gunAnahtari(d?.data?.at), d?.data);
  return out;
}

/** Benden farklı, en son paylaşan kişinin clientId'si | null. */
export function digerKisi(harita, myId) {
  let enIyi = null;
  let enSon = -Infinity;
  for (const [kim, gunler] of harita || []) {
    if (kim === myId) continue;
    for (const v of gunler.values()) {
      const t = zaman(v.at);
      if (t > enSon) { enSon = t; enIyi = kim; }
    }
  }
  return enIyi;
}

/** Kişinin en son paylaştığı gün: { gun, emoji, not?, at } | null */
export function sonRuh(kisiGunleri) {
  let son = null;
  for (const gun of kisiGunleri?.keys() || []) if (!son || gun > son) son = gun;
  return son ? { gun: son, ...kisiGunleri.get(son) } : null;
}

/** Pazartesi = 0 … Pazar = 6 */
function haftaGunu(gun) {
  const p = parseDay(gun);
  return (new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay() + 6) % 7;
}

/**
 * Son n günün takvim ızgarası (Pazartesi başlar).
 * -> { baslangic, bitis, haftalar: [[{ gun, gunNo, ay, aralikta, gelecek, bugun, ayBasi }] × 7] }
 * aralikta: son n gün içinde. ayBasi: ayın 1'i ya da aralığın ilk günü (ay etiketi için).
 */
export function takvim(bugun, n) {
  const baslangic = addDays(bugun, -(Math.max(1, n) - 1));
  const ilk = addDays(baslangic, -haftaGunu(baslangic));
  const son = addDays(bugun, 6 - haftaGunu(bugun));
  const haftalar = [];
  for (let gun = ilk; gun <= son; gun = addDays(gun, 1)) {
    if (!haftalar.length || haftalar[haftalar.length - 1].length === 7) haftalar.push([]);
    const p = parseDay(gun);
    const aralikta = gun >= baslangic && gun <= bugun;
    haftalar[haftalar.length - 1].push({
      gun, gunNo: p.d, ay: p.m, aralikta,
      gelecek: gun > bugun, bugun: gun === bugun, ayBasi: p.d === 1 || gun === baslangic,
    });
  }
  return { baslangic, bitis: bugun, haftalar };
}

/** Emoji sayımı: çoktan aza; eşitlikte en son seçilen önce. -> [{ emoji, sayi }] */
function say(kayitlar) {
  const m = new Map();
  for (const { gun, ruh } of kayitlar) {
    const c = m.get(ruh.emoji) || { emoji: ruh.emoji, sayi: 0, son: '' };
    c.sayi += 1;
    if (gun > c.son) c.son = gun;
    m.set(ruh.emoji, c);
  }
  return [...m.values()]
    .sort((a, b) => b.sayi - a.sayi || (a.son < b.son ? 1 : a.son > b.son ? -1 : 0))
    .map(({ emoji, sayi }) => ({ emoji, sayi }));
}

/**
 * Bu hafta (Pazartesi–Pazar, bugünü içeren).
 * -> { gunler: [{ gun, ruh|null, gelecek, bugun }] × 7, paylasilan, gecen, baskin: emoji|null, baskinSayi }
 */
export function haftaOzeti(kisiGunleri, bugun) {
  const pzt = addDays(bugun, -haftaGunu(bugun));
  const gunler = [];
  for (let i = 0; i < 7; i++) {
    const gun = addDays(pzt, i);
    const gelecek = gun > bugun;
    gunler.push({ gun, ruh: gelecek ? null : kisiGunleri?.get(gun) || null, gelecek, bugun: gun === bugun });
  }
  const dolu = gunler.filter((g) => g.ruh);
  const sayim = say(dolu);
  return {
    gunler,
    paylasilan: dolu.length,
    gecen: haftaGunu(bugun) + 1,
    baskin: sayim[0]?.emoji || null,
    baskinSayi: sayim[0]?.sayi || 0,
  };
}

/** Haftalık özet cümlesi. -> { baslik, alt } */
export function haftaCumlesi(ozet, { ben = false, ad = '' } = {}) {
  const kim = ad || 'Sevgilin';
  if (!ozet?.baskin) {
    return { baslik: ben ? 'Bu hafta henüz paylaşmadın' : `${kim} bu hafta henüz paylaşmadı`, alt: '' };
  }
  const bas = ben ? 'Bu hafta' : `${kim} bu hafta`;
  // Her his birer kez: baskın yok; say() eşitlikte en son seçileni öne alır.
  if (ozet.baskinSayi < 2 && ozet.paylasilan > 1) {
    return { baslik: `${bas} karışık, en son ${ozet.baskin}`, alt: `${ozet.paylasilan} farklı his` };
  }
  const r = ruhBilgisi(ozet.baskin);
  return {
    baslik: `${bas} ${ozet.paylasilan > 1 ? 'çoğunlukla' : 'şimdilik'} ${ozet.baskin}`,
    alt: [r?.ad, `${ozet.baskinSayi} gün`].filter(Boolean).join(' · '),
  };
}

/** Son n gün: { paylasilan, dagilim: [{ emoji, sayi }] } */
export function donemOzeti(kisiGunleri, bugun, n) {
  const baslangic = addDays(bugun, -(Math.max(1, n) - 1));
  const kayitlar = [];
  for (const [gun, ruh] of kisiGunleri || []) {
    if (gun >= baslangic && gun <= bugun) kayitlar.push({ gun, ruh });
  }
  return { paylasilan: kayitlar.length, dagilim: say(kayitlar) };
}

/** Son n günde ikisinin aynı emojiyi seçtiği gün sayısı. */
export function ayniGunSayisi(benim, onun, bugun, n) {
  if (!benim || !onun) return 0;
  const baslangic = addDays(bugun, -(Math.max(1, n) - 1));
  let s = 0;
  for (const [gun, ruh] of benim) {
    if (gun >= baslangic && gun <= bugun && onun.get(gun)?.emoji === ruh.emoji) s += 1;
  }
  return s;
}

export function dagilimYazi(dagilim) {
  return (dagilim || []).map((d) => `${d.emoji} ${d.sayi} gün`).join(', ');
}

const GUN_BICIM = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' });
const AY_KISA = new Intl.DateTimeFormat('tr-TR', { month: 'short' });

/** '2026-10-31' → '31 Ekim Cumartesi' */
export function gunBasligi(gun) {
  const p = parseDay(gun);
  return p ? GUN_BICIM.format(new Date(p.y, p.m - 1, p.d, 12)) : '';
}

/** Ay kısaltması: 10 → 'Eki' */
export function ayKisa(ay) {
  return AY_KISA.format(new Date(2026, ay - 1, 1, 12));
}

