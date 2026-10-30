// Skor tablosu: rekabetçi oyunlarda kim kaç kez kazandı.
// Veri: tür 'skor', id = oyun id. data = { [clientId]: galibiyet, berabere: n,
//   y<YYYY>: { [clientId]: n, berabere: n } (o yılın sayaçları), son: { kazanan: clientId | null, at: ISO } }.
// Yalnız ev sahibi yazar (skorKaydet); patch yalnız ilgili sayacı yazar (mevcut değer + 1).
import { openCollection } from './veri.js';

export const SKOR_KIND = 'skor';
/** Bitişte skor yazan oyunlar (tablo sırası). */
export const SKOR_OYUNLARI = ['dama', 'tavla', 'dorttas', 'amiral', 'hafiza'];

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const YIL_RE = /^y\d{4}$/;
const yilAnahtari = (yil) => `y${yil}`;
const sayi = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
const nesne = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const zaman = (s) => { const t = Date.parse(s); return Number.isFinite(t) ? t : NaN; };

// ---------- Saf mantık ----------

/** Kazanan → sayaç anahtarı: clientId ya da 'berabere' (kazanan yok). Geçersizse null. */
export function skorAnahtari(kazanan) {
  if (kazanan == null) return 'berabere';
  if (typeof kazanan !== 'string' || !ID_RE.test(kazanan)) return null;
  if (kazanan === 'berabere' || kazanan === 'son' || YIL_RE.test(kazanan)) return null;
  return kazanan;
}

/** Bir oyun sonucunun yaması: ilgili sayaç + 1, o yılın sayacı + 1, son sonuç. Geçersiz kazanan → null. */
export function skorYamasi(data, kazanan, simdi = new Date()) {
  const k = skorAnahtari(kazanan);
  if (!k) return null;
  const d = nesne(data);
  const y = yilAnahtari(simdi.getFullYear());
  return {
    [k]: sayi(d[k]) + 1,
    [`${y}.${k}`]: sayi(nesne(d[y])[k]) + 1,
    son: { kazanan: k === 'berabere' ? null : k, at: simdi.toISOString() },
  };
}

/** Sayaçlar { [clientId]: n, berabere: n }. yil verilirse o yılın sayaçları. */
export function sayaclar(data, { yil = null } = {}) {
  const src = yil ? nesne(nesne(data)[yilAnahtari(yil)]) : nesne(data);
  const out = {};
  for (const [k, v] of Object.entries(src)) {
    if (k === 'son' || YIL_RE.test(k)) continue;
    const n = sayi(v);
    if (n) out[k] = n;
  }
  return out;
}

/** -> { kisiler: [{ id, n }], berabere, toplam } (toplam: bu oyunda kaydedilen tüm sonuçlar). */
export function skorOku(data, ids, { yil = null } = {}) {
  const c = sayaclar(data, { yil });
  return {
    kisiler: (ids || []).map((id) => ({ id, n: (id && c[id]) || 0 })),
    berabere: c.berabere || 0,
    toplam: Object.values(c).reduce((a, b) => a + b, 0),
  };
}

/** Kutlama satırı: "Toplam: Ömer 5 · Gül 3 · 1 berabere". Hiç sonuç yoksa ''. kisiler = [{ id, ad }]. */
export function toplamMetni(data, kisiler) {
  const list = kisiler || [];
  const s = skorOku(data, list.map((x) => x.id));
  if (!s.toplam) return '';
  const parca = s.kisiler.map((x, i) => `${list[i].ad || 'Sevgilin'} ${x.n}`);
  if (s.berabere) parca.push(`${s.berabere} berabere`);
  return `Toplam: ${parca.join(' · ')}`;
}

/** Belgeler → { [oyunId]: data }. */
export function skorHaritasi(docs) {
  const out = {};
  for (const d of docs || []) if (d && typeof d.id === 'string' && !d.deleted) out[d.id] = nesne(d.data);
  return out;
}

/**
 * Tablo: kayıtlı oyunlar (SKOR_OYUNLARI sırası) + veride olan başka oyunlar.
 * -> { oyunlar: [{ oyun, kisiler: [n, n], berabere, toplam, son }], genel: { kisiler: [n, n], berabere, toplam } }
 */
export function skorTablosu(harita, ids, { yil = null } = {}) {
  const h = nesne(harita);
  const sira = [...SKOR_OYUNLARI, ...Object.keys(h).filter((k) => !SKOR_OYUNLARI.includes(k))];
  const genel = { kisiler: (ids || []).map(() => 0), berabere: 0, toplam: 0 };
  const oyunlar = sira.map((oyun) => {
    const s = skorOku(h[oyun], ids, { yil });
    s.kisiler.forEach((x, i) => { genel.kisiler[i] += x.n; });
    genel.berabere += s.berabere;
    genel.toplam += s.toplam;
    const son = nesne(h[oyun]).son;
    return { oyun, kisiler: s.kisiler.map((x) => x.n), berabere: s.berabere, toplam: s.toplam, son: son && son.at ? son : null };
  });
  return { oyunlar, genel };
}

/** Son oynananlar: [{ oyun, kazanan, at }] son sonuca göre yeniden eskiye. */
export function sonOynananlar(harita, limit = 5) {
  return Object.entries(nesne(harita))
    .map(([oyun, d]) => ({ oyun, son: nesne(nesne(d).son) }))
    .filter((x) => Number.isFinite(zaman(x.son.at)))
    .sort((a, b) => zaman(b.son.at) - zaman(a.son.at))
    .slice(0, limit)
    .map((x) => ({ oyun: x.oyun, kazanan: x.son.kazanan || null, at: x.son.at }));
}

/** [benId, partnerId]. Partner bilinmiyorsa veride en çok sonucu olan öbür kişi (yoksa null). */
export function kisilerOf(harita, benId, partnerId = null) {
  if (partnerId) return [benId, partnerId];
  const top = new Map();
  for (const d of Object.values(nesne(harita))) {
    for (const [k, n] of Object.entries(sayaclar(d))) {
      if (k !== 'berabere' && k !== benId) top.set(k, (top.get(k) || 0) + n);
    }
  }
  const [en] = [...top.entries()].sort((a, b) => b[1] - a[1]);
  return [benId, en ? en[0] : null];
}

// ---------- Veri (veri.js) ----------

const acik = new WeakMap(); // room → Promise<koleksiyon>: sayfa başına bir 'skor' koleksiyonu

/** Odanın 'skor' koleksiyonu (sayfa içinde paylaşılır). */
export function skorKoleksiyonu(room) {
  if (!acik.has(room)) {
    const p = openCollection(room, SKOR_KIND);
    p.catch(() => acik.delete(room));
    acik.set(room, p);
  }
  return acik.get(room);
}

/** Paylaşılan koleksiyonu kapatır (testler ve sayfa kapanışı). */
export function skorKapat(room) {
  const p = acik.get(room);
  acik.delete(room);
  p?.then((col) => col.close()).catch(() => {});
}

/**
 * Oyun sonucunu yazar. Yalnız ev sahibi çağırır. kazanan = clientId | null (berabere).
 * Önce sunucudan tazeler, sonra yalnız ilgili sayaçları (mevcut + 1) patch'ler.
 * -> yeni data | null. Hata fırlatmaz (logGame gibi).
 */
export async function skorKaydet(room, oyunId, { kazanan = null } = {}) {
  if (!room?.roomId || typeof oyunId !== 'string' || !ID_RE.test(oyunId) || !skorAnahtari(kazanan)) return null;
  try {
    const col = await skorKoleksiyonu(room);
    await col.refresh();
    const yama = skorYamasi(col.get(oyunId)?.data, kazanan);
    await col.patch(oyunId, yama);
    return col.get(oyunId)?.data || null;
  } catch (e) {
    console.warn('[skor] kaydedilemedi:', e?.message || e);
    return null;
  }
}

/** Okuma: { [oyunId]: data } (sunucudan tazelenmiş). Oda yoksa ya da hata olursa {}. */
export async function skorlar(room) {
  if (!room?.roomId) return {};
  try {
    const col = await skorKoleksiyonu(room);
    await col.refresh();
    return skorHaritasi(col.all());
  } catch (e) {
    console.warn('[skor] okunamadı:', e?.message || e);
    return {};
  }
}

const BEKLE_MS = 2500;

function ilkDegisim(col, ms) {
  return new Promise((res) => {
    const bitir = () => { off(); clearTimeout(t); res(); };
    const off = col.on('change', bitir);
    const t = setTimeout(bitir, ms);
  });
}

/**
 * Kutlama satırı (celebrate lines içine konur): "Toplam: Ömer 5 · Gül 3"; veri değişince kendini günceller.
 * ids = oyuncuların clientId'leri, adlar = { [clientId]: ad } (benim adım room.me.name).
 * kayit = ev sahibinin skorKaydet sözü: önce o biter. Misafir ilk değişikliği en çok BEKLE_MS bekler
 * (eski toplam bir an görünmesin). Metin boşken satırın <p>'si gizlenir. DOM gerekir.
 */
export function toplamSatiri(room, oyunId, ids, adlar = {}, kayit = null) {
  const el = document.createElement('span');
  el.className = 'skor-toplam';
  const gizle = () => { const p = el.parentElement; if (p) p.hidden = !el.textContent; };
  queueMicrotask(gizle); // celebrate satırı eşzamanlı ekler
  if (!room?.roomId) return el;
  const meId = room.me?.clientId;
  const kisiler = [...(ids || [])]
    .sort((a, b) => (a === meId ? -1 : b === meId ? 1 : 0))
    .map((id) => ({ id, ad: (id === meId && room.me?.name) || adlar?.[id] || (id === meId ? 'Sen' : 'Sevgilin') }));
  skorKoleksiyonu(room).then(async (col) => {
    if (kayit) await kayit;
    else await ilkDegisim(col, BEKLE_MS);
    const yaz = () => { el.textContent = toplamMetni(col.get(oyunId)?.data, kisiler); gizle(); };
    yaz();
    const off = col.on('change', () => { if (el.isConnected) yaz(); else off(); });
    if (!kayit) setTimeout(() => col.refresh(), BEKLE_MS); // misafir: geç gelen yazmayı yakala
  }).catch(() => {});
  return el;
}

/** "Ömer önde, 2 galibiyet farkla" | "Başa baş gidiyorsunuz" | '' (hiç galibiyet yok). */
export function liderMetni(kisiler, adlar) {
  const [a = 0, b = 0] = kisiler || [];
  if (!a && !b) return '';
  if (a === b) return 'Başa baş gidiyorsunuz';
  const i = a > b ? 0 : 1;
  return `${adlar?.[i] || 'Sevgilin'} önde, ${Math.abs(a - b)} galibiyet farkla`;
}
