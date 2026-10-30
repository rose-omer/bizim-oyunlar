// Hiç … Yaptın mı? — saf durum makinesi. DOM'a dokunmaz.
// İkisi aynı anda "Yaptım" ya da "Yapmadım" seçer; birlikte açılır.
// Açılışta "Yaptım" diyene karşı taraf "Anlat!" der (sözlü; yalnız istem).
// Ortak eylemler ../kimdaha/secim.js; ek eylem: ask {by} (by, karşı taraftan anlatmasını ister).
import { LISTE, SEVIYELER } from './ifadeler.js';
import { secimOyunu, COUNTS, DEFAULT_COUNT } from '../kimdaha/secim.js';
import { isSeat, percent } from '../_soru/common.js';

export { COUNTS, DEFAULT_COUNT };
export const CHOICES = ['yaptim', 'yapmadim'];
export const DEFAULT_CATS = ['tatli', 'eglenceli'];

const oyun = secimOyunu({
  game: 'hicyaptin',
  items: LISTE,
  cats: SEVIYELER,
  defaultCats: DEFAULT_CATS,
  choices: CHOICES,
  agree: (p) => p[0] === p[1],
});

export const { itemById } = oyun;

export function initialState(opts) {
  return { ...oyun.initialState(opts), ask: [false, false] };
}

export function reduce(s, a) {
  if (!s || !a) return s;
  if (a.type === 'ask') {
    if (s.phase !== 'reveal' || !isSeat(a.by)) return s;
    const who = 1 - a.by;
    if (s.picks[who] !== 'yaptim' || s.ask?.[who]) return s;
    const ask = (s.ask || [false, false]).slice();
    ask[who] = true;
    return { ...s, ask };
  }
  const n = oyun.reduce(s, a);
  // Yeni tura geçince "Anlat!" istekleri sıfırlanır.
  if (n !== s && n.phase === 'pick' && (s.phase !== 'pick' || n.round !== s.round)) return { ...n, ask: [false, false] };
  return n;
}

/** Bitiş özeti: did[i] = i'nin "Yaptım" sayısı; both = ikinizin de yaptığı; none = ikinizin de yapmadığı. */
export function result(s) {
  const played = s.log.length;
  const did = [0, 0];
  let both = 0;
  let none = 0;
  for (const e of s.log) {
    e.p.forEach((v, i) => { if (v === 'yaptim') did[i] += 1; });
    if (e.p[0] === 'yaptim' && e.p[1] === 'yaptim') both += 1;
    if (e.p[0] === 'yapmadim' && e.p[1] === 'yapmadim') none += 1;
  }
  return { played, did, both, none, same: s.matches, percent: percent(s.matches, played) };
}
