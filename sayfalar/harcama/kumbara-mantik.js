// Ortak Kumbara: saf mantık (DOM yok, Node'da test edilir). Para hep kuruş, hep tamsayı.
// Veri: tür 'kumbara', id uuid: { baslik, emoji, hedef: kuruş, son?: gün, tamam?: ISO (hedefe ilk ulaşılan an) }
//       tür 'katki',   id uuid: { kumbara: id, tutar: kuruş (eksi = çekim), kim: clientId, not?, tarih: gün }
// Benden farklı her kimlik partner sayılır (partnerin eski cihazı da), harcama kodundaki gibi.
import { parseDay, daysBetween } from '../../js/core/gunler.js';
import { tutarCoz, paraMetni } from './mantik.js';

export const EMOJILER = ['🐷', '✈️', '🏖️', '🏠', '💍', '🚗', '🎁', '🐶', '📱', '🎓', '🎄', '💐'];
export const KUMBARA_BASLIK_MAX = 40;
export const NOT_MAX = 80;

const NB = ' ';
const tekSatir = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const zaman = (s) => {
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : 0;
};
const kurusMu = (n) => Number.isSafeInteger(n) && n !== 0;

/** Kuruş → "12.000 ₺" (tam lirada kuruş yazılmaz) | "123,45 ₺". Biçim harcama koduyla aynı. */
export function kisaPara(kurus) {
  return paraMetni(kurus).replace(`,00${NB}₺`, `${NB}₺`);
}

/** "12.000 / 20.000 ₺" */
export function ilerlemeMetni(toplam, hedef) {
  return `${kisaPara(Math.max(0, toplam)).replace(`${NB}₺`, '')} / ${kisaPara(hedef)}`;
}

/** Belge → { baslik, emoji, hedef, son, tamam } | null (silinmiş ya da bozuk). */
export function kumbaraOku(doc) {
  if (!doc || doc.deleted) return null;
  const d = doc.data || {};
  if (!Number.isSafeInteger(d.hedef) || d.hedef <= 0) return null;
  return {
    baslik: tekSatir(d.baslik) || 'Kumbara',
    emoji: tekSatir(d.emoji) || '🐷',
    hedef: d.hedef,
    son: parseDay(d.son) ? d.son : null,
    tamam: typeof d.tamam === 'string' && zaman(d.tamam) ? d.tamam : null,
  };
}

/** Belge → { kumbara, tutar, kim, not, tarih } | null. */
export function katkiOku(doc) {
  if (!doc || doc.deleted) return null;
  const d = doc.data || {};
  if (!kurusMu(d.tutar)) return null;
  if (typeof d.kumbara !== 'string' || !d.kumbara || typeof d.kim !== 'string' || !d.kim) return null;
  if (!parseDay(d.tarih)) return null;
  return { kumbara: d.kumbara, tutar: d.tutar, kim: d.kim, not: tekSatir(d.not), tarih: d.tarih };
}

/** Formdan yeni (ya da düzenlenmiş) kumbara. -> { data } | { hata } */
export function yeniKumbara({ baslik, emoji, hedefMetni, son, bugun }) {
  const b = tekSatir(baslik);
  if (!b) return { hata: 'Kumbaranın adını yaz. Örneğin “Tatil”.' };
  if (b.length > KUMBARA_BASLIK_MAX) return { hata: `Ad en çok ${KUMBARA_BASLIK_MAX} harf olsun.` };
  const hedef = tutarCoz(hedefMetni);
  if (hedef == null) return { hata: 'Hedef tutar geçersiz. Örneğin 20.000 yaz.' };
  const data = { baslik: b, emoji: EMOJILER.includes(emoji) ? emoji : EMOJILER[0], hedef };
  if (son) {
    if (!parseDay(son)) return { hata: 'Son gün geçersiz.' };
    if (bugun && daysBetween(bugun, son) < 0) return { hata: 'Son gün bugünden önce olamaz.' };
    data.son = son;
  }
  return { data };
}

/** Formdan katkı. cekim = kumbaradan para alma. mevcut = kumbaradaki toplam. -> { data } | { hata } */
export function yeniKatki({ kumbara, tutarMetni, cekim = false, kim, not = '', tarih, mevcut = 0 }) {
  if (typeof kumbara !== 'string' || !kumbara) return { hata: 'Kumbara bulunamadı.' };
  const tutar = tutarCoz(tutarMetni);
  if (tutar == null) return { hata: 'Tutar geçersiz. Örneğin 500 yaz.' };
  const n = tekSatir(not);
  if (n.length > NOT_MAX) return { hata: `Not en çok ${NOT_MAX} harf olsun.` };
  if (cekim) {
    if (mevcut <= 0) return { hata: 'Kumbara şu an boş.' };
    if (tutar > mevcut) return { hata: `Kumbarada ${kisaPara(mevcut)} var. Daha fazlasını alamazsın.` };
  }
  const data = { kumbara, tutar: cekim ? -tutar : tutar, kim, tarih };
  if (n) data.not = n;
  return { data };
}

/**
 * Bir kumbaranın durumu. -> { toplam, ben, o, oran (0–100, aşağı yuvarlı), kalan, ulasti,
 *   katkilar: [{ id, ...katki }] yeniden eskiye (aynı gün son eklenen üstte) }
 */
export function kumbaraOzeti(kumbaraId, hedef, katkiDocs, benId) {
  const katkilar = [];
  let toplam = 0;
  let ben = 0;
  for (const doc of katkiDocs || []) {
    const k = katkiOku(doc);
    if (!k || k.kumbara !== kumbaraId) continue;
    toplam += k.tutar;
    if (k.kim === benId) ben += k.tutar;
    katkilar.push({ id: doc.id, at: doc.created_at, ...k });
  }
  katkilar.sort((a, b) => (a.tarih === b.tarih ? zaman(b.at) - zaman(a.at) : a.tarih < b.tarih ? 1 : -1));
  return {
    toplam,
    ben,
    o: toplam - ben,
    oran: hedef > 0 ? Math.min(100, Math.floor((100 * Math.max(0, toplam)) / hedef)) : 0,
    kalan: Math.max(0, hedef - toplam),
    ulasti: hedef > 0 && toplam >= hedef,
    katkilar: katkilar.map(({ at, ...k }) => k),
  };
}

/** İlerleme çubuğunda kişi dilimleri (% genişlik). Dolu kısım artı paylara oranla bölünür. */
export function cubukPaylari({ toplam, ben, o }, hedef) {
  const pb = Math.max(0, ben);
  const po = Math.max(0, o);
  const dolu = hedef > 0 ? (100 * Math.min(Math.max(0, toplam), hedef)) / hedef : 0;
  if (!(pb + po) || !dolu) return { ben: 0, o: 0 };
  const yuvarla = (x) => Math.round(x * 100) / 100;
  return { ben: yuvarla((dolu * pb) / (pb + po)), o: yuvarla((dolu * po) / (pb + po)) };
}

/** Son gün metni: '' | 'Son gün geçti' | 'Bugün son gün' | 'Yarın son gün' | 'N gün kaldı'. */
export function sonGunMetni(son, bugun) {
  if (!parseDay(son)) return '';
  const n = daysBetween(bugun, son);
  if (n < 0) return 'Son gün geçti';
  if (n === 0) return 'Bugün son gün';
  if (n === 1) return 'Yarın son gün';
  return `${n} gün kaldı`;
}

/** Son güne yetişmek için düzenli birikim. -> { birim: 'ay'|'hafta', tutar: kuruş (tam liraya yukarı) } | null */
export function birikimOnerisi(kalan, bugun, son) {
  if (!(kalan > 0) || !parseDay(son)) return null;
  const gun = daysBetween(bugun, son);
  if (!(gun >= 7)) return null;
  const birim = gun >= 60 ? 'ay' : 'hafta';
  const adet = Math.floor(gun / (birim === 'ay' ? 30 : 7));
  return { birim, tutar: Math.ceil(kalan / adet / 100) * 100 };
}

/**
 * Düzenlemeden sonra `tamam`. Hedef aynıysa eski değer korunur (ulaşıp harcadıysanız da "ulaşıldı" kalır).
 * Hedef değiştiyse: toplam yeni hedefe yetiyorsa eski ya da şimdiki an, yetmiyorsa null.
 */
export function duzenTamam({ eskiTamam = null, eskiHedef, yeniHedef, toplam, simdi }) {
  if (eskiHedef === yeniHedef) return eskiTamam || null;
  return toplam >= yeniHedef ? eskiTamam || simdi : null;
}

/** Geçerli kumbaralar: süren hedefler önce (yeni kurulan önce), ulaşılanlar sonra (son ulaşılan önce). */
export function kumbaraSirala(docs) {
  const gecerli = (docs || []).filter((d) => kumbaraOku(d));
  const suren = gecerli.filter((d) => !kumbaraOku(d).tamam).sort((a, b) => zaman(b.created_at) - zaman(a.created_at));
  const biten = gecerli.filter((d) => kumbaraOku(d).tamam).sort((a, b) => zaman(b.data.tamam) - zaman(a.data.tamam));
  return [...suren, ...biten];
}

/** Bildirim: "Gül kumbaraya 500 ₺ koydu 🐷" | "Ömer kumbaradan 200 ₺ aldı". */
export function bildirimMetni(ad, tutar, kumbara) {
  const kim = tekSatir(ad) || 'Sevgilin';
  const k = kumbaraOku({ data: { hedef: 1, ...kumbara } });
  return {
    baslik: `${k.emoji} ${k.baslik}`,
    metin: tutar < 0 ? `${kim} kumbaradan ${kisaPara(-tutar)} aldı` : `${kim} kumbaraya ${kisaPara(tutar)} koydu 🐷`,
  };
}
