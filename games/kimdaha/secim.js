// Gizli seçim oyunları için ortak saf durum makinesi. DOM'a dokunmaz.
// Kullananlar: Kim Daha Çok? (kimdaha), Hiç … Yaptın mı? (hicyaptin).
// İkisi aynı anda iki seçenekten birini gizlice seçer; ikisi de seçince açılır. Süre yok.
// Eylemler: seat, config {count?, cats?}, start {seed}, pick {by, choice}, next {round},
//   finish, restart.
import { drawOrder } from '../_soru/rng.js';
import { seat, isSeat, makePlayers } from '../_soru/common.js';

export const COUNTS = [10, 20, 30];
export const DEFAULT_COUNT = 10;

/**
 * items = [{ id, cat, text }], cats = kategori sırası, choices = [x, y],
 * agree(picks) → iki seçim "anlaşma" mı? -> { initialState, reduce, itemById }
 */
export function secimOyunu({ game, items, cats, defaultCats, choices, agree }) {
  const byId = new Map(items.map((it) => [it.id, it]));

  const cleanCats = (list) => {
    if (!Array.isArray(list)) return null;
    const out = cats.filter((c) => list.includes(c));
    return out.length ? out : null;
  };
  const poolIds = (list) => items.filter((it) => list.includes(it.cat)).map((it) => it.id);

  function initialState({ players, count = DEFAULT_COUNT, cats: chosen = defaultCats } = {}) {
    return {
      game,
      phase: 'setup',
      players: makePlayers(players),
      count: COUNTS.includes(count) ? count : DEFAULT_COUNT,
      cats: cleanCats(chosen) || defaultCats.slice(),
      seed: 0,
      qs: [],
      round: 0,
      picks: [null, null],
      matches: 0,
      log: [],
      used: [],
    };
  }

  function config(s, a) {
    if (s.phase !== 'setup') return s;
    let next = s;
    if (a.count !== undefined) {
      if (!COUNTS.includes(a.count)) return s;
      if (a.count !== s.count) next = { ...next, count: a.count };
    }
    if (a.cats !== undefined) {
      const list = cleanCats(a.cats);
      if (!list) return s;
      if (list.join() !== s.cats.join()) next = { ...next, cats: list };
    }
    return next;
  }

  function reduce(s, a) {
    if (!s || !a) return s;
    switch (a.type) {
      case 'seat':
        return seat(s, a);

      case 'config':
        return config(s, a);

      case 'start': {
        if (s.phase !== 'setup') return s;
        const seed = Number(a.seed) >>> 0;
        const { order, used } = drawOrder(poolIds(s.cats), s.count, seed, s.used);
        return { ...s, phase: 'pick', seed, qs: order, used, round: 0, picks: [null, null], matches: 0, log: [] };
      }

      case 'pick': {
        if (s.phase !== 'pick' || !isSeat(a.by) || s.picks[a.by] !== null || !choices.includes(a.choice)) return s;
        const picks = s.picks.slice();
        picks[a.by] = a.choice;
        if (picks[0] === null || picks[1] === null) return { ...s, picks };
        const m = !!agree(picks);
        return {
          ...s,
          picks,
          phase: 'reveal',
          matches: s.matches + (m ? 1 : 0),
          log: [...s.log, { q: s.qs[s.round], p: picks, m }],
        };
      }

      case 'next':
        if (s.phase !== 'reveal' || a.round !== s.round) return s;
        if (s.round + 1 >= s.qs.length) return { ...s, phase: 'end' };
        return { ...s, phase: 'pick', round: s.round + 1, picks: [null, null] };

      case 'finish':
        if (s.phase !== 'pick' && s.phase !== 'reveal') return s;
        if (!s.log.length) return { ...s, phase: 'setup', qs: [], round: 0, picks: [null, null] };
        return { ...s, phase: 'end' };

      case 'restart':
        if (s.phase === 'setup') return s;
        return { ...s, phase: 'setup', qs: [], round: 0, picks: [null, null] };

      default:
        return s;
    }
  }

  return { initialState, reduce, itemById: (id) => byId.get(id) || null };
}
