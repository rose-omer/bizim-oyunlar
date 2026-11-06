// Yavrumuz: oda arka planları ve sahne eşyaları (kodla SVG; dış görsel yok). Saf metin üretir, DOM yok.
// Her oda kendi dosyasında (oda/*.js); çerçeve ve renk jetonları oda/ortak.js.
import { ORTAK_CSS } from './oda/ortak.js';
import * as mutfak from './oda/mutfak.js';
import * as banyo from './oda/banyo.js';
import * as tuvalet from './oda/tuvalet.js';
import * as yatak from './oda/yatak.js';
import * as oyun from './oda/oyun.js';

const ODA = { mutfak, banyo, tuvalet, yatak, oyun };

/** Odanın arka plan SVG'si; bilinmeyen oda: boş. */
export function odaSvg(id) {
  return Object.hasOwn(ODA, id ?? '') ? ODA[id].sahne() : '';
}

export const { KUVET_SVG, SABUN_SVG } = banyo;
export const { LAZIMLIK_SVG } = tuvalet;
export const ODA_CSS = ORTAK_CSS + Object.values(ODA).map((o) => o.CSS).join('');
