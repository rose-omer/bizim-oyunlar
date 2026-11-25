// Reversi: durum makinesi (saf). Ev sahibi uygular, misafir yalnız çizer.
//
// 8×8 tahta; board 64 öğe: -1 boş, 0 ilk oyuncunun (koyu), 1 ikincinin (açık) taşı. Kare = satır*8 + sütun.
// Kurallar: taşını, rakip taşlarını kendi taşınla sıkıştıracak kareye koyarsın; sıkışanlar senin olur.
// Hamlesi olmayan oyuncu pas geçer (kendiliğinden). İkisinin de hamlesi yoksa oyun biter; çok taşı olan kazanır.
// Durum: players [koyu, açık], board, turn, ply, last { by, sq, flips, pass: koltuk | null } | null,
//  phase 'play' | 'end', result { winner: 0|1|-1, reason: 'bitti'|'teslim' }, tally, seq.
import { seat, isNewer } from '../dama/oyun.js';

export { seat, isNewer };

const DIRS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];

export function startBoard() {
  const b = new Array(64).fill(-1);
  b[27] = 1; b[28] = 0; b[35] = 0; b[36] = 1;
  return b;
}

/** p bu kareye koyarsa dönecek taşlar ([] = geçersiz). */
export function flipsFor(board, p, sq) {
  if (!Number.isInteger(sq) || sq < 0 || sq > 63 || board[sq] !== -1) return [];
  const r0 = sq >> 3, c0 = sq & 7;
  const out = [];
  for (const [dr, dc] of DIRS) {
    const line = [];
    let r = r0 + dr, c = c0 + dc;
    while (r >= 0 && r < 8 && c >= 0 && c < 8 && board[r * 8 + c] === 1 - p) {
      line.push(r * 8 + c);
      r += dr; c += dc;
    }
    if (line.length && r >= 0 && r < 8 && c >= 0 && c < 8 && board[r * 8 + c] === p) out.push(...line);
  }
  return out;
}

/** Yasal kareler. */
export function legalMoves(board, p) {
  const out = [];
  for (let sq = 0; sq < 64; sq++) if (board[sq] === -1 && flipsFor(board, p, sq).length) out.push(sq);
  return out;
}

/** Taş sayıları: [koyu, açık]. */
export function counts(board) {
  const out = [0, 0];
  for (const x of board) if (x === 0 || x === 1) out[x] += 1;
  return out;
}

export const sqName = (sq) => `${'abcdefgh'[sq & 7]}${(sq >> 3) + 1}`;

export function newGame({ players, names = {}, no = 1, tally = {}, seq = 0, now = null }) {
  return {
    v: 1,
    kind: 'reversi',
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
      const flips = flipsFor(s.board, s.turn, a.sq);
      if (!flips.length) return s;
      const board = s.board.slice();
      board[a.sq] = s.turn;
      for (const f of flips) board[f] = s.turn;
      const other = 1 - s.turn;
      let turn = other;
      let pass = null;
      let result = null;
      if (!legalMoves(board, other).length) {
        if (legalMoves(board, s.turn).length) {
          turn = s.turn;
          pass = other;
        } else {
          const [x, y] = counts(board);
          result = { winner: x === y ? -1 : x > y ? 0 : 1, reason: 'bitti' };
        }
      }
      return bump(s, a.now, {
        board,
        turn,
        ply: s.ply + 1,
        last: { by: s.turn, sq: a.sq, flips, pass },
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
      return Number.isInteger(intent.sq) ? { type: 'move', by, sq: intent.sq, now } : null;
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
  return Array.isArray(d?.board) && d.board.length === 64 && d.board.every((x) => x === -1 || x === 0 || x === 1)
    && Array.isArray(d.players) && (d.turn === 0 || d.turn === 1);
}

/** Sıra partnere geçince ona gidecek bildirim. by = değişikliği yapan, ad(id) = görünen ad. */
export function notice(prev, s, { by, ad }) {
  const [x, y] = counts(s.board);
  if (s.phase === 'end' && prev.phase !== 'end') {
    const r = s.result || {};
    let metin = `Berabere bitti (${x}–${y})`;
    if (r.reason === 'teslim') metin = `${ad(s.players[1 - r.winner])} teslim oldu`;
    else if (r.winner >= 0) metin = `${ad(s.players[r.winner])} kazandı (${Math.max(x, y)}–${Math.min(x, y)})`;
    return { baslik: 'Reversi bitti', metin };
  }
  if (s.no !== prev.no) return { baslik: 'Yeni oyun', metin: `Reversi: ${ad(by)} yeni oyun başlattı · ilk hamle senin` };
  const n = s.last?.flips?.length || 0;
  return { baslik: 'Sıra sende', metin: `Reversi: ${ad(by)} oynadı · ${n} taş çevirdi` };
}

export function resultOf(s) {
  const r = s.result || {};
  return { winner: r.winner ?? -1, reason: r.reason ?? null, plies: s.ply, no: s.no, taslar: counts(s.board) };
}
