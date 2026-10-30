// Birlikte Sudoku: saf durum makinesi. DOM yok; Node'da test edilir.
//
// İki kişi aynı tahtayı aynı anda doldurur (tek kişi de oynar). Ev sahibi hamleleri sırayla uygular.
// Çakışma: her hücrenin sürümü (sur) ve son değiştireni (son) var. Misafirin hamlesi gördüğü sürümü (v) taşır;
// hücre o arada başkasınca değiştiyse hamle reddedilir. Ev sahibinin hamlesi hep geçer: aynı hücrede ev sahibi kazanır.
// Geri al: her oyuncunun kendi yığını; hücre o hamleden sonra değiştiyse o kayıt atlanır.
// Süre: sure (biten oturumların toplamı, ms) + basla (bu oturumun başı). Yeni oturum (oturum) öncekini son
// hamleye (at) kadar sayar; boşta geçen zaman sayılmaz.
import { uret, ipucuSayisi, ZORLUKLAR } from './uretici.js';
import { seat, isNewer } from '../duello/koltuk.js';

export { ipucuSayisi, ZORLUKLAR };
export const KIND = 'sudoku';
export const GERI_SINIR = 40;
const FAZLAR = new Set(['secim', 'oyun', 'bitti']);

const bos81 = (v) => new Array(81).fill(v);

export function initialState({ players, names = {}, now = null }) {
  return {
    v: 1,
    kind: KIND,
    no: 0,
    seq: 1,
    at: now,
    kimlik: 0,
    players: players.slice(0, 2),
    names: { ...names },
    faz: 'secim',
    zorluk: null,
    bulmaca: '',
    cozum: '',
    deger: [],
    notlar: [],
    sur: [],
    son: [],
    geri: [[], []],
    hata: [0, 0],
    sure: 0,
    basla: null,
  };
}

function bump(s, now, patch) {
  return { ...s, ...patch, seq: s.seq + 1, at: now ?? s.at };
}

const hucreMi = (i) => Number.isInteger(i) && i >= 0 && i < 81;
const rakamMi = (d) => Number.isInteger(d) && d >= 1 && d <= 9;

/** Aday maskesi → [rakamlar] */
export function adaylar(maske) {
  const out = [];
  for (let d = 1; d <= 9; d++) if (maske & (1 << (d - 1))) out.push(d);
  return out;
}

/** Hücrenin görünen değeri: ipucu ya da girilen (0 boş). */
export function deger(s, i) {
  const g = s.bulmaca.charCodeAt(i) - 48;
  return g || s.deger[i] || 0;
}

export function doluMu(s) {
  for (let i = 0; i < 81; i++) if (!deger(s, i)) return false;
  return true;
}

function bittiMi(s) {
  for (let i = 0; i < 81; i++) if (deger(s, i) !== s.cozum.charCodeAt(i) - 48) return false;
  return true;
}

/** Yanlış girilmiş hücreler (ipucu olmayan, çözüme uymayan). */
export function hatalilar(s) {
  const out = [];
  if (!s.cozum) return out;
  for (let i = 0; i < 81; i++) if (s.deger[i] && s.deger[i] !== s.cozum.charCodeAt(i) - 48) out.push(i);
  return out;
}

/** Her rakamdan tahtada kaç tane eksik (dizin 1–9; 0 kullanılmaz). */
export function kalanSayilar(s) {
  const say = new Array(10).fill(0);
  for (let i = 0; i < 81; i++) say[deger(s, i)]++;
  return say.map((n, d) => (d === 0 ? 0 : Math.max(0, 9 - n)));
}

/** Kim kaç hücre doldurdu: [oyuncu0, oyuncu1] */
export function katki(s) {
  const out = [0, 0];
  for (let i = 0; i < 81; i++) if (s.deger[i] && (s.son[i] === 0 || s.son[i] === 1)) out[s.son[i]]++;
  return out;
}

export function gecenSure(s, now) {
  if (s.faz !== 'oyun' || s.basla == null) return s.sure;
  return s.sure + Math.max(0, now - s.basla);
}

/** Misafirin hamlesi bu hücrede geçerli mi? (ev sahibi hep geçer) */
function izinli(s, a, idx) {
  return a.ev || a.v === s.sur[a.i] || s.son[a.i] === idx;
}

/** Değişiklik sonrası: tahta doğru dolduysa biter (süre kesinleşir), değilse yalnız seq artar. */
function sonrasi(next, d, now) {
  if (d && bittiMi(next)) {
    const sure = gecenSure(next, now ?? next.at ?? 0);
    return bump(next, now, { faz: 'bitti', sure, basla: null, bitti: now });
  }
  return bump(next, now, {});
}

/** Hücreyi değiştirir; geri kaydı ve bitiş denetimi. */
function degistir(s, a, idx, d1, n1) {
  const i = a.i;
  const d0 = s.deger[i];
  const n0 = s.notlar[i];
  if (d0 === d1 && n0 === n1) return s;
  const deger = s.deger.slice();
  const notlar = s.notlar.slice();
  const sur = s.sur.slice();
  const son = s.son.slice();
  deger[i] = d1;
  notlar[i] = n1;
  sur[i] += 1;
  son[i] = idx;
  const yigin = [...s.geri[idx], { i, d0, n0, d1, n1 }].slice(-GERI_SINIR);
  const geri = s.geri.map((g, k) => (k === idx ? yigin : g));
  let hata = s.hata;
  if (d1 && d1 !== d0 && d1 !== s.cozum.charCodeAt(i) - 48) hata = s.hata.map((h, k) => (k === idx ? h + 1 : h));
  return sonrasi({ ...s, deger, notlar, sur, son, geri, hata }, d1, a.now);
}

export function reduce(s, a) {
  switch (a?.type) {
    case 'yaz':
    case 'not':
    case 'sil': {
      if (s.faz !== 'oyun' || !hucreMi(a.i) || s.bulmaca[a.i] !== '0') return s;
      const idx = s.players.indexOf(a.by);
      if (idx < 0 || !izinli(s, a, idx)) return s;
      if (a.type === 'sil') return degistir(s, a, idx, 0, 0);
      if (!rakamMi(a.d)) return s;
      if (a.type === 'yaz') return degistir(s, a, idx, s.deger[a.i] === a.d ? 0 : a.d, 0);
      if (s.deger[a.i]) return s; // dolu hücreye not yazılmaz
      return degistir(s, a, idx, 0, s.notlar[a.i] ^ (1 << (a.d - 1)));
    }
    case 'geri': {
      if (s.faz !== 'oyun') return s;
      const idx = s.players.indexOf(a.by);
      if (idx < 0) return s;
      const yigin = s.geri[idx].slice();
      while (yigin.length) {
        const e = yigin.pop();
        if (s.deger[e.i] !== e.d1 || s.notlar[e.i] !== e.n1) continue; // hücre sonradan değişti: atla
        const deger = s.deger.slice();
        const notlar = s.notlar.slice();
        const sur = s.sur.slice();
        const son = s.son.slice();
        deger[e.i] = e.d0;
        notlar[e.i] = e.n0;
        sur[e.i] += 1;
        son[e.i] = idx;
        return sonrasi({ ...s, deger, notlar, sur, son, geri: s.geri.map((g, k) => (k === idx ? yigin : g)) }, e.d0, a.now);
      }
      if (!s.geri[idx].length) return s;
      return bump(s, a.now, { geri: s.geri.map((g, k) => (k === idx ? [] : g)) });
    }
    case 'yeni': {
      // a.no = isteyenin gördüğü oyun: iki taraf aynı anda isterse ikincisi yok sayılır.
      if (a.no !== s.no) return s;
      const p = uret(a.seed >>> 0, a.zorluk);
      return {
        ...initialState({ players: s.players, names: s.names, now: a.now }),
        no: s.no + 1,
        seq: s.seq + 1,
        kimlik: a.seed >>> 0,
        faz: 'oyun',
        zorluk: p.zorluk,
        bulmaca: p.bulmaca,
        cozum: p.cozum,
        deger: bos81(0),
        notlar: bos81(0),
        sur: bos81(0),
        son: bos81(-1),
        basla: a.now ?? null,
      };
    }
    case 'oturum': {
      if (s.faz !== 'oyun') return s;
      const once = s.basla != null ? Math.max(0, (s.at ?? s.basla) - s.basla) : 0;
      return bump(s, a.now, { sure: s.sure + once, basla: a.now ?? null });
    }
    case 'seat':
      return seat(s, a.ids, a.names);
    case 'load':
      return isNewer(a.s, s) && a.s.kind === s.kind ? a.s : s;
    default:
      return s;
  }
}

/** Ev sahibi: niyeti eyleme çevirir. by = gönderenin clientId'si. null = yok say. */
export function toAction(intent, by, s, { hostId, now = null, seed = 0 } = {}) {
  const ev = !!by && by === hostId;
  switch (intent?.type) {
    case 'yaz':
    case 'not':
      return hucreMi(intent.i) && rakamMi(intent.d) ? { type: intent.type, by, i: intent.i, d: intent.d, v: intent.v, ev, now } : null;
    case 'sil':
      return hucreMi(intent.i) ? { type: 'sil', by, i: intent.i, v: intent.v, ev, now } : null;
    case 'geri':
      return { type: 'geri', by, now };
    case 'yeni':
      return s.players.includes(by) ? { type: 'yeni', no: intent.no, zorluk: intent.zorluk, seed, now } : null;
    case 'oturum':
      return ev ? { type: 'oturum', now } : null;
    case 'seat':
      return ev ? { type: 'seat', ids: intent.ids, names: intent.names } : null;
    case 'load':
      return ev ? { type: 'load', s: intent.s } : null;
    default:
      return null;
  }
}

export function gecerliKayit(d) {
  if (!d || d.kind !== KIND || d.v !== 1 || typeof d.seq !== 'number' || !FAZLAR.has(d.faz)) return false;
  if (!Array.isArray(d.players) || !d.players.length || !Array.isArray(d.geri) || d.geri.length !== 2) return false;
  if (d.faz === 'secim') return true;
  const tam = (x) => Array.isArray(x) && x.length === 81;
  return typeof d.bulmaca === 'string' && d.bulmaca.length === 81 && typeof d.cozum === 'string' && d.cozum.length === 81
    && tam(d.deger) && tam(d.notlar) && tam(d.sur) && tam(d.son);
}

/** logGame için küçük özet. */
export function resultOf(s) {
  return { zorluk: s.zorluk, sure: Math.round(s.sure / 1000), katki: katki(s), hata: s.hata, no: s.no };
}
