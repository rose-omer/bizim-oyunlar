// Mangala: durum makinesi (saf). Ev sahibi uygular, misafir yalnız çizer.
//
// Tahta 14 göz: 0–5 ilk oyuncunun kuyuları, 6 onun hazinesi; 7–12 ikinci oyuncunun kuyuları, 13 onun hazinesi.
// Taşlar artan sırayla (saat yönünün tersine) dağıtılır; rakibin hazinesi atlanır.
// Kurallar (Türk mangalası):
//  - Kuyudaki taşların hepsi alınır; ilki aynı kuyuya bırakılır, kalanı sıradakilere birer birer.
//    Kuyuda tek taş varsa o taş bir sonraki kuyuya geçer.
//  - Son taş kendi hazinene düşerse bir hamle daha yaparsın.
//  - Son taş rakibin kuyusunda sayıyı çift yaparsa o kuyudaki taşların hepsi hazinene girer.
//  - Son taş kendi boş kuyuna düşerse ve karşıdaki rakip kuyusu doluysa ikisi birden hazinene girer.
//  - Bir tarafın kuyuları boşalınca oyun biter; kuyuları boşalan oyuncu rakibin kuyularında kalanları da alır.
//  - Hazinesinde çok taş olan kazanır; 24–24 berabere.
// Durum: players [ilk oynayan, ikinci], board (14), turn, ply, last { by, pit, end, extra, cap, capPits, sweep } | null,
//  phase 'play' | 'end', result { winner: 0|1|-1, reason: 'bitti'|'teslim' }, tally, seq.
import { seat, isNewer } from '../dama/oyun.js';

export { seat, isNewer };

export const PITS = 6;
export const START = 4;
export const TOTAL = PITS * 2 * START;
export const storeOf = (p) => p * 7 + 6;
export const pitIndex = (p, k) => p * 7 + k;
/** Gözün sahibi (0 | 1). */
export const ownerOf = (i) => (i < 7 ? 0 : 1);
export const isStore = (i) => i === 6 || i === 13;
/** Kuyunun karşısındaki rakip kuyusu. */
export const across = (i) => 12 - i;

export function startBoard() {
  const b = new Array(14).fill(START);
  b[6] = 0;
  b[13] = 0;
  return b;
}

/** Oyuncunun kuyularındaki taş toplamı. */
export function sideSum(board, p) {
  let n = 0;
  for (let k = 0; k < PITS; k++) n += board[pitIndex(p, k)];
  return n;
}

const next = (i, p) => {
  let j = (i + 1) % 14;
  if (j === storeOf(1 - p)) j = (j + 1) % 14;
  return j;
};

/** Oynanabilir kuyular (yerel numara 0–5). */
export function legalPits(board, p) {
  const out = [];
  for (let k = 0; k < PITS; k++) if (board[pitIndex(p, k)] > 0) out.push(k);
  return out;
}

/**
 * Bir hamle: p oyuncusu kendi k kuyusunu oynar. Geçersizse null.
 * -> { board, end, extra, cap, capPits, sweep: { to, n } | null, over }
 */
export function sow(board, p, k) {
  if (!Number.isInteger(k) || k < 0 || k >= PITS) return null;
  const b = board.slice();
  const from = pitIndex(p, k);
  const n = b[from];
  if (!n) return null;
  b[from] = 0;
  let i = from;
  if (n === 1) {
    i = next(from, p);
    b[i] += 1;
  } else {
    b[from] = 1;
    for (let r = 1; r < n; r++) {
      i = next(i, p);
      b[i] += 1;
    }
  }
  const store = storeOf(p);
  const extra = i === store;
  let cap = 0;
  let capPits = [];
  if (!extra && !isStore(i)) {
    if (ownerOf(i) !== p && b[i] % 2 === 0) {
      cap = b[i];
      capPits = [i];
      b[i] = 0;
    } else if (ownerOf(i) === p && b[i] === 1 && b[across(i)] > 0) {
      cap = 1 + b[across(i)];
      capPits = [i, across(i)];
      b[i] = 0;
      b[across(i)] = 0;
    }
    b[store] += cap;
  }
  let sweep = null;
  const empty = [sideSum(b, 0) === 0, sideSum(b, 1) === 0];
  const over = empty[0] || empty[1];
  if (over && empty[0] !== empty[1]) {
    const to = empty[0] ? 0 : 1;
    const from2 = 1 - to;
    const left = sideSum(b, from2);
    for (let x = 0; x < PITS; x++) b[pitIndex(from2, x)] = 0;
    b[storeOf(to)] += left;
    sweep = left ? { to, n: left } : null;
  }
  return { board: b, end: i, extra, cap, capPits, sweep, over };
}

/** Bitmiş tahtada kazanan: 0 | 1 | -1 (berabere). */
export function winnerOf(board) {
  const a = board[storeOf(0)], b = board[storeOf(1)];
  return a === b ? -1 : a > b ? 0 : 1;
}

export function newGame({ players, names = {}, no = 1, tally = {}, seq = 0, now = null }) {
  return {
    v: 1,
    kind: 'mangala',
    no,
    seq: seq + 1,
    at: now,
    startedAt: now,
    players: players.slice(0, 2),
    names: { ...names },
    board: startBoard(),
    turn: 0,
    ply: 0,
    last: null,
    phase: 'play',
    result: null,
    tally: { ...tally },
  };
}

export function initialState({ players, names, now = null }) {
  return newGame({ players, names, now });
}

function bump(s, now, patch) {
  return { ...s, ...patch, seq: s.seq + 1, at: now ?? s.at };
}

function addWin(s, result) {
  const tally = { ...s.tally };
  if (result && result.winner >= 0) {
    const id = s.players[result.winner];
    tally[id] = (tally[id] || 0) + 1;
  }
  return tally;
}

export function reduce(s, a) {
  switch (a?.type) {
    case 'move': {
      if (s.phase !== 'play' || s.players[s.turn] !== a.by) return s;
      const m = sow(s.board, s.turn, a.pit);
      if (!m) return s;
      const result = m.over ? { winner: winnerOf(m.board), reason: 'bitti' } : null;
      return bump(s, a.now, {
        board: m.board,
        turn: result || m.extra ? s.turn : 1 - s.turn,
        ply: s.ply + 1,
        last: { by: s.turn, pit: a.pit, end: m.end, extra: m.extra && !result, cap: m.cap, capPits: m.capPits, sweep: m.sweep },
        phase: result ? 'end' : 'play',
        result,
        tally: addWin(s, result),
        startedAt: s.startedAt ?? a.now ?? null,
      });
    }
    case 'resign': {
      const i = s.players.indexOf(a.by);
      if (s.phase !== 'play' || i < 0) return s;
      const result = { winner: 1 - i, reason: 'teslim' };
      return bump(s, a.now, { phase: 'end', result, tally: addWin(s, result) });
    }
    case 'new': {
      // a.no = isteyenin gördüğü oyun: iki taraf aynı anda "Rövanş" derse ikincisi yok sayılır.
      if (!s.players.includes(a.by) || a.no !== s.no) return s;
      return newGame({
        players: [s.players[1], s.players[0]],
        names: s.names,
        no: s.no + 1,
        tally: s.tally,
        seq: s.seq,
        now: a.now,
      });
    }
    case 'seat':
      return seat(s, a.ids, a.names);
    case 'load':
      return isNewer(a.s, s) && a.s.kind === s.kind ? a.s : s;
    default:
      return s;
  }
}

// Ev sahibi: niyeti eyleme çevirir. null = yok say.
export function toAction(intent, by, s, { hostId, now }) {
  switch (intent?.type) {
    case 'move':
      return Number.isInteger(intent.pit) ? { type: 'move', by, pit: intent.pit, now } : null;
    case 'resign':
      return { type: 'resign', by, now };
    case 'new':
      return { type: 'new', by, no: intent.no, now };
    case 'seat':
      return by === hostId ? { type: 'seat', ids: intent.ids, names: intent.names } : null;
    case 'load':
      return by === hostId ? { type: 'load', s: intent.s } : null;
    default:
      return null;
  }
}

/** Kayıttan gelen durum geçerli mi? */
export function validSaved(d) {
  return Array.isArray(d?.board) && d.board.length === 14 && d.board.every((x) => Number.isInteger(x) && x >= 0)
    && d.board.reduce((n, x) => n + x, 0) === TOTAL && Array.isArray(d.players) && (d.turn === 0 || d.turn === 1);
}

/** Sıra partnere geçince ona gidecek bildirim. by = değişikliği yapan, ad(id) = görünen ad. */
export function notice(prev, s, { by, ad }) {
  if (s.phase === 'end' && prev.phase !== 'end') {
    const r = s.result || {};
    let metin = `Berabere bitti (${s.board[6]}–${s.board[13]})`;
    if (r.reason === 'teslim') metin = `${ad(s.players[1 - r.winner])} teslim oldu`;
    else if (r.winner >= 0) metin = `${ad(s.players[r.winner])} kazandı (${s.board[storeOf(r.winner)]}–${s.board[storeOf(1 - r.winner)]})`;
    return { baslik: 'Mangala bitti', metin };
  }
  if (s.no !== prev.no) return { baslik: 'Yeni oyun', metin: `Mangala: ${ad(by)} yeni oyun başlattı · ilk hamle senin` };
  const cap = s.last?.cap ? ` · ${s.last.cap} taş aldı` : '';
  return { baslik: 'Sıra sende', metin: `Mangala: ${ad(by)} oynadı${cap}` };
}

export function resultOf(s) {
  const r = s.result || {};
  return { winner: r.winner ?? -1, reason: r.reason ?? null, plies: s.ply, no: s.no, hazine: [s.board[6], s.board[13]] };
}
