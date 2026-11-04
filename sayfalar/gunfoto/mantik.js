// Günün Fotoğrafı: saf mantık (DOM yok, Node'da test edilir).
// Veri: tür 'gunfoto', id `<YYYY-MM-DD>-<clientId>`, data { foto: url, not?, at: ISO }.
// Bugün: partnerin fotoğrafı ben gönderene dek kilitli. Geçmiş günler açık (gün bitti).
import { parseDay } from '../../js/core/gunler.js';

export const NOT_MAX = 140;

const zaman = (s) => {
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : 0;
};

export const docId = (gun, clientId) => `${gun}-${clientId}`;

/** Belge → { gun, kim, foto, not, at } | null. Gün ve kişi id'den okunur. */
export function fotoOku(doc) {
  const id = String(doc?.id || '');
  const gun = id.slice(0, 10);
  const kim = id.slice(11);
  if (id[10] !== '-' || !parseDay(gun) || !kim) return null;
  const foto = doc.data?.foto;
  if (typeof foto !== 'string' || !foto) return null;
  const not = typeof doc.data.not === 'string' ? doc.data.not.trim() : '';
  return { gun, kim, foto, not, at: doc.data.at || doc.updated_at || doc.created_at || '' };
}

/** Belgeler → Map<gun, Map<kim, { foto, not, at, guncel }>>. guncel = belgenin son yazılma anı. */
export function gunlereGore(docs) {
  const m = new Map();
  for (const d of docs || []) {
    const f = fotoOku(d);
    if (!f) continue;
    if (!m.has(f.gun)) m.set(f.gun, new Map());
    m.get(f.gun).set(f.kim, { foto: f.foto, not: f.not, at: f.at, guncel: d.updated_at || f.at });
  }
  return m;
}

/** O günün durumu. partner = benden farklı en yeni fotoğraf (partnerin birden çok cihazı olabilir). */
export function gunDurumu(harita, gun, benId) {
  const kisiler = harita.get(gun);
  if (!kisiler) return { ben: null, partner: null, ikisi: false };
  const ben = kisiler.get(benId) || null;
  let partner = null;
  for (const [kim, f] of kisiler) {
    if (kim === benId) continue;
    if (!partner || zaman(f.guncel) > zaman(partner.guncel)) partner = { kim, ...f };
  }
  return { ben, partner, ikisi: !!(ben && partner) };
}

/** Kartlar nasıl görünür? -> { ben: 'acik'|'bos', partner: 'acik'|'kilitli'|'bos' } */
export function gorunum(durum, gun, bugun) {
  const ben = durum.ben ? 'acik' : 'bos';
  let partner = 'bos';
  if (durum.partner) partner = gun === bugun && !durum.ben ? 'kilitli' : 'acik';
  return { ben, partner };
}

/** Yeni kayıt verisi. -> { data } | { hata } */
export function yeniKayit({ foto, not, simdi = new Date() }) {
  if (typeof foto !== 'string' || !foto) return { hata: 'Önce bir fotoğraf seç.' };
  const n = String(not ?? '').replace(/\s+/g, ' ').trim();
  if (n.length > NOT_MAX) return { hata: `Not en çok ${NOT_MAX} harf olsun.` };
  const data = { foto };
  if (n) data.not = n;
  data.at = new Date(simdi).toISOString();
  return { data };
}

/**
 * Geçmiş günler (bugün hariç), ay ay yeniden eskiye.
 * -> [{ ay: 'YYYY-MM', ortak: sayı, gunler: [{ gun, ben, partner, ikisi }] }]
 */
export function arsiv(harita, { bugun, benId }) {
  const aylar = new Map();
  const gunler = [...harita.keys()].filter((g) => g < bugun).sort().reverse();
  for (const gun of gunler) {
    const d = gunDurumu(harita, gun, benId);
    if (!d.ben && !d.partner) continue;
    const ay = gun.slice(0, 7);
    if (!aylar.has(ay)) aylar.set(ay, { ay, ortak: 0, gunler: [] });
    const a = aylar.get(ay);
    a.gunler.push({ gun, ...d });
    if (d.ikisi) a.ortak += 1;
  }
  return [...aylar.values()];
}

/**
 * "Anı yap" taslağı: o gün görebildiğim fotoğraflar (benimki önce) ve notlar.
 * Kilitli partner fotoğrafı girmez. g = gorunum(durum, gun, bugun). -> { fotolar, not }
 */
export function aniTaslagi(durum, g) {
  const acik = [g.ben === 'acik' ? durum.ben : null, g.partner === 'acik' ? durum.partner : null].filter(Boolean);
  return { fotolar: acik.map((f) => f.foto), not: acik.map((f) => f.not).filter(Boolean).join('\n') };
}

/** Gönderince partnere giden bildirim. */
export function bildirimMetni({ benAd, partnerGonderdi }) {
  const ad = String(benAd || '').trim() || 'Sevgilin';
  if (partnerGonderdi) {
    return { baslik: 'Fotoğraflarınız açıldı', metin: `${ad} de gönderdi. İkisi birden açıldı, bak bakalım.` };
  }
  return { baslik: 'Günün fotoğrafı', metin: `${ad} bugünün fotoğrafını gönderdi. Seninkini gönder, ikisi birden açılsın.` };
}
