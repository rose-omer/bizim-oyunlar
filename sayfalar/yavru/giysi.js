// Yavrumuz: yeni giysi ve aksesuar kayıtlarını birleştirir (bebek.js kullanır). Çizimler giysi/*.js'te.
// GIYSILER: { [id]: { renk, kutu?, ciz: (k, f) => ({ govde, bacak, kol, ayak?, baslik? }) } }. renk: --yvb-k-<renk> jetonu.
// AKSESUAR: { [id]: { yuva, cizim, yer, kutu, kucuk? (baş yuvasında kundak yerleşimi) } }.
import { ORTAK_CSS } from './giysi/ortak.js';
import * as kapuson from './giysi/kapuson.js';
import * as cilek from './giysi/cilek.js';
import * as tulum from './giysi/tulum.js';
import * as noel from './giysi/noel.js';
import * as aksesuar from './giysi/aksesuar.js';

const PARCALAR = [kapuson, cilek, tulum, noel, aksesuar];
export const GIYSILER = Object.assign({}, ...PARCALAR.map((p) => p.GIYSILER));
export const AKSESUAR = Object.assign({}, ...PARCALAR.map((p) => p.AKSESUAR));
export const GIYSI_CSS = ORTAK_CSS + PARCALAR.map((p) => p.CSS).join('');
