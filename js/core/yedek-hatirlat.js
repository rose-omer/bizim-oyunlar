// Aylık tam yedek hatırlatması (cihaz başına; sunucuya yazılmaz). Üst kısım saf.
import { readStore, writeStore, pageUrl } from './identity.js';

const GUN = 86_400_000;
const AY = 30 * GUN;
const ERTELE = 7 * GUN;
const zamanOf = (s) => {
  const t = Date.parse(s || '');
  return Number.isFinite(t) ? t : null;
};
export const kSon = (oda) => `bizim.yedek.son.${oda}`;
const kIlk = (oda) => `bizim.yedek.ilk.${oda}`;
const kErtele = (oda) => `bizim.yedek.ertele.${oda}`;

/** Saf. son: son tam yedek; ilk: bu cihazın odayı ilk gördüğü an; ertelendi: son hatırlatma (haftada en çok bir). */
export function yedekHatirlatGerekli({ son, ilk, ertelendi = null, simdi = Date.now() }) {
  const dayanak = zamanOf(son) ?? zamanOf(ilk);
  if (dayanak == null || simdi - dayanak < AY) return false;
  const e = zamanOf(ertelendi);
  return e == null || simdi - e >= ERTELE;
}

/** Tam yedek alınınca. */
export function yedekAlindi(oda, an = new Date()) {
  writeStore('local', kSon(oda), new Date(an).toISOString());
}

export const sonYedek = (oda) => readStore('local', kSon(oda));

/** Sayfa açılışında: gerekliyse bir kez toast. toast ui.js'ten verilir (bu modül ui.js'e bağlanmaz). */
export function yedekHatirlat(oda, toast) {
  if (!oda) return;
  const simdi = new Date();
  if (!readStore('local', kIlk(oda))) writeStore('local', kIlk(oda), simdi.toISOString());
  if (!yedekHatirlatGerekli({
    son: sonYedek(oda), ilk: readStore('local', kIlk(oda)), ertelendi: readStore('local', kErtele(oda)), simdi: simdi.getTime(),
  })) return;
  writeStore('local', kErtele(oda), simdi.toISOString());
  toast('Son tam yedeğin üzerinden bir ay geçti. Fotoğraflarınızı da yedekleyelim mi?', {
    action: { label: 'Yedek al', onClick: () => { location.href = `${pageUrl('sayfalar/ayarlar/')}#ayar-veri`; } },
    ms: 12000,
  });
}
