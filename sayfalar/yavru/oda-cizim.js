// Yavrumuz: oda arka planları ve sahne eşyaları (kodla SVG; dış görsel yok). Saf metin üretir, DOM yok.
// Her oda kendi dosyasında (oda/*.js); çerçeve ve renk jetonları oda/ortak.js.
// Diğer temaların çizimleri temalar/<id>/oda/ altında (dev/tema-uret.mjs); odaTemaYukle çalışma anında geçirir.
import { ORTAK_CSS } from './oda/ortak.js';
import * as mutfak from './oda/mutfak.js';
import * as banyo from './oda/banyo.js';
import * as tuvalet from './oda/tuvalet.js';
import * as yatak from './oda/yatak.js';
import * as oyun from './oda/oyun.js';

const VARSAYILAN = { ORTAK_CSS, ODA: { mutfak, banyo, tuvalet, yatak, oyun } };
let ODA = VARSAYILAN.ODA;

/** Odanın arka plan SVG'si; bilinmeyen oda: boş. */
export function odaSvg(id) {
  return Object.hasOwn(ODA, id ?? '') ? ODA[id].sahne() : '';
}

export let { KUVET_SVG, SABUN_SVG } = banyo;
export let { LAZIMLIK_SVG } = tuvalet;
const cssOf = (t) => t.ORTAK_CSS + Object.values(t.ODA).map((o) => o.CSS).join('');
export let ODA_CSS = cssOf(VARSAYILAN);

/** Temanın oda çizimlerini geçirir. Varsayılan tema ek dosya yüklemez. */
export async function odaTemaYukle(tema) {
  let t = VARSAYILAN;
  if (tema && tema !== 'pamuk') {
    const al = (ad) => import(`./temalar/${tema}/oda/${ad}.js`);
    const [ortak, m, b, tu, ya, oy] = await Promise.all(['ortak', 'mutfak', 'banyo', 'tuvalet', 'yatak', 'oyun'].map(al));
    t = { ORTAK_CSS: ortak.ORTAK_CSS, ODA: { mutfak: m, banyo: b, tuvalet: tu, yatak: ya, oyun: oy } };
  }
  ODA = t.ODA;
  ({ KUVET_SVG, SABUN_SVG } = t.ODA.banyo);
  ({ LAZIMLIK_SVG } = t.ODA.tuvalet);
  ODA_CSS = cssOf(t);
}
