// Soru oyunlarının ortak saf yardımcıları. DOM'a dokunmaz.
// Koltuk (seat): 0 = ev sahibi, 1 = misafir. Aynı telefonda: 0 = 1. oyuncu, 1 = 2. oyuncu.

export const NAME_MAX = 24;

export const isSeat = (x) => x === 0 || x === 1;

/** İki koltuklu oyuncu listesi. */
export function makePlayers(players = []) {
  return [0, 1].map((i) => ({
    id: String(players[i]?.id ?? ''),
    name: String(players[i]?.name ?? '').trim().slice(0, NAME_MAX),
  }));
}

/** { idx, id?, name? } → koltuğu günceller. Boş ad eski adı korur. Değişiklik yoksa aynı nesne. */
export function seat(s, a) {
  if (!s || !a || !isSeat(a.idx)) return s;
  const cur = s.players[a.idx] || { id: '', name: '' };
  const name = String(a.name ?? '').trim().slice(0, NAME_MAX) || cur.name || '';
  const id = a.id == null ? cur.id : String(a.id);
  if (cur.id === id && cur.name === name) return s;
  const players = s.players.slice();
  players[a.idx] = { id, name };
  return { ...s, players };
}

/** Tam sayı yüzde (0 paydada 0). */
export function percent(n, d) {
  return d > 0 ? Math.round((100 * n) / d) : 0;
}

/** table = [[min, ad], ...] büyükten küçüğe. */
export function tier(pct, table) {
  for (const [min, title] of table) if (pct >= min) return title;
  return table[table.length - 1][1];
}
