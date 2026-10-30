// Masa oyunu koltuk yardımcıları (Kelime Düellosu ve Birlikte Sudoku ortak). Saf; DOM yok.
// games/dama/masa.js (bootMasa) bu iki işlevi bekler: seat(s, ids, names) ve isNewer(x, y).
export { isNewer } from '../dama/oyun.js';

/**
 * Koltukları gerçek kimliklerle eşler: ids = [ben, partner]. Kayıtta biri varsa öbür koltuğa diğeri oturur
 * (ör. '?' yer tutucu ya da başka cihaz). Değişiklik yoksa aynı nesne döner; değişince seq artar (kayda girsin).
 */
export function seat(s, ids, names) {
  const [a, b] = ids || [];
  if (!s || !a || !b || a === b) return s;
  const has = (x) => s.players.includes(x);
  let players = s.players;
  if (has(a) && !has(b)) players = s.players.map((x) => (x === a ? a : b));
  else if (has(b) && !has(a)) players = s.players.map((x) => (x === b ? b : a));
  const nm = { ...s.names, ...(names || {}) };
  const sameNames = Object.keys(nm).every((k) => s.names?.[k] === nm[k]);
  if (players === s.players && sameNames) return s;
  return { ...s, players, names: nm, seq: s.seq + 1 };
}
