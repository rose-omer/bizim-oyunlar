// Tam yedek: belgeler + fotoğraf ve sesler, parolalı tek dosyada (biçim: js/core/yedek-sifre.js).
// Ağ ve kova işleri dışarıdan verilir (Node'da test edilir).
import { yedekYazici, yedekOkuyucu, YedekHatasi } from '../../js/core/yedek-sifre.js';
import { isAllowedPhotoUrl, medyaYolu } from '../../js/core/storage.js';

/** Değer ağacındaki her metne fn uygular. */
function gez(v, fn) {
  if (typeof v === 'string') fn(v);
  else if (Array.isArray(v)) for (const x of v) gez(x, fn);
  else if (v && typeof v === 'object') for (const x of Object.values(v)) gez(x, fn);
}

/** Yedekteki belgelerin andığı medya başvuruları, tekil (eski adres, kova:, local:). Yazı içindeki adres sayılmaz: tam eşleşme. */
export function yedekMedyalari(yedek) {
  const set = new Set();
  for (const docs of Object.values(yedek?.turler || {})) {
    for (const d of docs) gez(d?.data, (s) => { if (isAllowedPhotoUrl(s)) set.add(s); });
  }
  return [...set];
}

/**
 * -> { blob, medyaSayisi, eksikMedya: [başvuru] }. Alınamayan dosya yedeği durdurmaz; sayılır.
 * indir(başvuru) -> Blob. onIlerleme(biten, toplam): toplam = medya + 1 (belgeler).
 */
export async function tamYedekUret({ yedek, parola, indir, onIlerleme, ayar }) {
  const yazici = await yedekYazici(parola, ayar);
  await yazici.ekle({ tur: 'veri' }, new TextEncoder().encode(JSON.stringify(yedek)));
  const liste = yedekMedyalari(yedek);
  const toplam = liste.length + 1;
  let biten = 1;
  onIlerleme?.(biten, toplam);
  const eksikMedya = [];
  for (const ref of liste) {
    try {
      const b = await indir(ref);
      await yazici.ekle({ tur: 'medya', ref, mime: b.type || '' }, new Uint8Array(await b.arrayBuffer()));
    } catch {
      eksikMedya.push(ref);
    }
    biten++;
    onIlerleme?.(biten, toplam);
  }
  return { blob: await yazici.bitir(), medyaSayisi: liste.length - eksikMedya.length, eksikMedya };
}

/**
 * Dosyayı parolayla açar; belgeleri okur. -> { yedek, medyalar() } (medyalar: async üreteç { ref, blob }).
 * Yanlış parola: YedekHatasi 'parola'.
 */
export async function tamYedekOku(dosya, parola) {
  const o = await yedekOkuyucu(dosya, parola);
  const akis = o.kayitlar();
  const { value: ilk, done } = await akis.next();
  if (done || ilk.meta.tur !== 'veri') throw new YedekHatasi('bicim', 'Bu dosya bir Biz İkimiz yedeği değil.');
  let yedek;
  try {
    yedek = JSON.parse(new TextDecoder().decode(ilk.veri));
  } catch {
    throw new YedekHatasi('bicim', 'Bu dosya bir Biz İkimiz yedeği değil.');
  }
  return {
    yedek,
    async* medyalar() {
      for await (const { meta, veri } of akis) {
        if (meta.tur === 'medya' && typeof meta.ref === 'string') {
          yield { ref: meta.ref, blob: new Blob([veri], { type: meta.mime || '' }) };
        }
      }
    },
  };
}

/**
 * Dosyaları kovaya geri koyar. Bu odanın yolu aynı yola yazılır (belgedeki başvuru değişmez); varOlan'daki atlanır.
 * Başka oda ya da yerel başvuru yeni dosya olur: harita eski → yeni başvuru. Bir dosyanın hatası diğerlerini durdurmaz.
 * -> { harita, yuklenen, atlanan, hata, ilkHata }
 */
export async function medyaEsle({ roomId, yerel, varOlan = new Set(), medyalar, geriYukle, yeniFoto, yeniSes, onIlerleme }) {
  const harita = new Map();
  const s = { harita, yuklenen: 0, atlanan: 0, hata: 0, ilkHata: null };
  let i = 0;
  for await (const { ref, blob } of medyalar) {
    const yol = medyaYolu(ref);
    try {
      if (!yerel && yol && yol.startsWith(`${roomId}/`)) {
        if (varOlan.has(yol)) s.atlanan++;
        else if ((await geriYukle(blob, roomId, yol)) === 'vardi') s.atlanan++;
        else s.yuklenen++;
      } else {
        const yeni = await (blob.type.startsWith('audio/') ? yeniSes(blob, roomId) : yeniFoto(blob, roomId));
        harita.set(ref, yeni);
        s.yuklenen++;
      }
    } catch (e) {
      s.hata++;
      s.ilkHata ||= e?.message || 'hata';
    }
    onIlerleme?.(++i);
  }
  return s;
}

/** Belgelerdeki eski başvuruları yenisiyle değiştirir (yeni nesne). Harita boşsa aynı dizi. */
export function belgelereUygula(belgeler, harita) {
  if (!harita?.size) return belgeler;
  const cevir = (v) => {
    if (typeof v === 'string') return harita.get(v) ?? v;
    if (Array.isArray(v)) return v.map(cevir);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, cevir(x)]));
    return v;
  };
  return belgeler.map((b) => ({ ...b, data: cevir(b.data) }));
}
