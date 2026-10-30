// Satranç kuralları: saf yasal hamle üreteci. DOM yok; Node'da perft ile test edilir.
//
// Konum (pos): { board, turn, castle, ep, half, full }
//  - board: 64 karakterlik dize, indeks = satır*8 + sütun; satır 0 = 8. yatay (a8 = 0, h1 = 63).
//    Beyaz büyük harf (PNBRQK), siyah küçük harf, boş '.'.
//  - turn: 0 beyaz, 1 siyah. castle: 'KQkq' alt kümesi ('' = yok). ep: geçerken alma karesi | -1.
//  - half: son piyon hamlesi/almadan beri yarım hamle (50 hamle kuralı). full: hamle numarası.
// Hamle: { from, to, piece, cap: alınan taş | null, promo: 'q'|'r'|'b'|'n'|null, flag: null|'2'|'ep'|'O-O'|'O-O-O' }

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const EMPTY = '.';
const FILES = 'abcdefgh';
const KNIGHT = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const KING = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const ROOK = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const BISHOP = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const PROMOS = ['q', 'r', 'b', 'n'];

export const sqOf = (name) => (8 - Number(name[1])) * 8 + FILES.indexOf(name[0]);
export const sqName = (sq) => FILES[sq & 7] + (8 - (sq >> 3));
export function colorOf(ch) {
  if (!ch || ch === EMPTY) return -1;
  return ch === ch.toUpperCase() ? 0 : 1;
}
export const typeOf = (ch) => (ch && ch !== EMPTY ? ch.toLowerCase() : null);
const pc = (type, color) => (color === 0 ? type.toUpperCase() : type);
const inside = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;

// ---------- FEN ----------

export function parseFen(fen) {
  const [rows, side, castle, ep, half, full] = String(fen).trim().split(/\s+/);
  let board = '';
  for (const ch of rows.replace(/\//g, '')) board += /\d/.test(ch) ? EMPTY.repeat(Number(ch)) : ch;
  if (board.length !== 64) throw new Error('FEN tahtası 64 kare olmalı');
  return {
    board,
    turn: side === 'b' ? 1 : 0,
    castle: castle && castle !== '-' ? castle : '',
    ep: ep && ep !== '-' ? sqOf(ep) : -1,
    half: Number(half) || 0,
    full: Number(full) || 1,
  };
}

export function toFen(pos) {
  const rows = [];
  for (let r = 0; r < 8; r++) {
    let row = '';
    let gap = 0;
    for (let c = 0; c < 8; c++) {
      const ch = pos.board[r * 8 + c];
      if (ch === EMPTY) { gap++; continue; }
      if (gap) { row += gap; gap = 0; }
      row += ch;
    }
    rows.push(row + (gap || ''));
  }
  return `${rows.join('/')} ${pos.turn ? 'b' : 'w'} ${pos.castle || '-'} ${pos.ep >= 0 ? sqName(pos.ep) : '-'} ${pos.half} ${pos.full}`;
}

// ---------- Tehdit ----------

/** sq karesine `by` rengi bakıyor mu? b: dize ya da dizi. */
export function attacked(b, sq, by) {
  const r = sq >> 3, c = sq & 7;
  const pr = by === 0 ? r + 1 : r - 1; // beyaz piyon yukarı vurur: altındaki çaprazdan gelir
  const P = pc('p', by);
  if (pr >= 0 && pr < 8) {
    if (c > 0 && b[pr * 8 + c - 1] === P) return true;
    if (c < 7 && b[pr * 8 + c + 1] === P) return true;
  }
  const N = pc('n', by), K = pc('k', by), B = pc('b', by), R = pc('r', by), Q = pc('q', by);
  for (const [dr, dc] of KNIGHT) if (inside(r + dr, c + dc) && b[(r + dr) * 8 + c + dc] === N) return true;
  for (const [dr, dc] of KING) if (inside(r + dr, c + dc) && b[(r + dr) * 8 + c + dc] === K) return true;
  for (const [dirs, A] of [[ROOK, R], [BISHOP, B]]) {
    for (const [dr, dc] of dirs) {
      let rr = r + dr, cc = c + dc;
      while (inside(rr, cc)) {
        const ch = b[rr * 8 + cc];
        if (ch !== EMPTY) {
          if (ch === A || ch === Q) return true;
          break;
        }
        rr += dr; cc += dc;
      }
    }
  }
  return false;
}

export function kingSq(b, color) {
  const K = pc('k', color);
  for (let i = 0; i < 64; i++) if (b[i] === K) return i;
  return -1;
}

export function inCheck(pos) {
  const k = kingSq(pos.board, pos.turn);
  return k >= 0 && attacked(pos.board, k, 1 - pos.turn);
}

// ---------- Hamle üretimi ----------

function pseudoMoves(pos, b) {
  const t = pos.turn;
  const out = [];
  const add = (from, to, flag = null) => {
    const piece = b[from];
    const cap = flag === 'ep' ? pc('p', 1 - t) : b[to] === EMPTY ? null : b[to];
    if (typeOf(piece) === 'p' && (to >> 3) === (t === 0 ? 0 : 7)) {
      for (const promo of PROMOS) out.push({ from, to, piece, cap, promo, flag });
    } else {
      out.push({ from, to, piece, cap, promo: null, flag });
    }
  };
  for (let sq = 0; sq < 64; sq++) {
    const ch = b[sq];
    if (colorOf(ch) !== t) continue;
    const r = sq >> 3, c = sq & 7;
    const type = typeOf(ch);
    if (type === 'p') {
      const dir = t === 0 ? -1 : 1;
      const r1 = r + dir;
      if (r1 >= 0 && r1 < 8) {
        if (b[r1 * 8 + c] === EMPTY) {
          add(sq, r1 * 8 + c);
          const r2 = r + 2 * dir;
          if (r === (t === 0 ? 6 : 1) && b[r2 * 8 + c] === EMPTY) add(sq, r2 * 8 + c, '2');
        }
        for (const dc of [-1, 1]) {
          const cc = c + dc;
          if (cc < 0 || cc > 7) continue;
          const to = r1 * 8 + cc;
          if (colorOf(b[to]) === 1 - t) add(sq, to);
          else if (to === pos.ep && b[to] === EMPTY) add(sq, to, 'ep');
        }
      }
      continue;
    }
    if (type === 'n' || type === 'k') {
      for (const [dr, dc] of type === 'n' ? KNIGHT : KING) {
        const rr = r + dr, cc = c + dc;
        if (inside(rr, cc) && colorOf(b[rr * 8 + cc]) !== t) add(sq, rr * 8 + cc);
      }
      if (type === 'k') {
        const home = t === 0 ? 60 : 4;
        const [KS, QS] = t === 0 ? ['K', 'Q'] : ['k', 'q'];
        const R = pc('r', t);
        if (sq === home && pos.castle.includes(KS) && b[home + 1] === EMPTY && b[home + 2] === EMPTY && b[home + 3] === R) add(sq, home + 2, 'O-O');
        if (sq === home && pos.castle.includes(QS) && b[home - 1] === EMPTY && b[home - 2] === EMPTY && b[home - 3] === EMPTY && b[home - 4] === R) add(sq, home - 2, 'O-O-O');
      }
      continue;
    }
    const dirs = type === 'r' ? ROOK : type === 'b' ? BISHOP : [...ROOK, ...BISHOP];
    for (const [dr, dc] of dirs) {
      let rr = r + dr, cc = c + dc;
      while (inside(rr, cc)) {
        const to = rr * 8 + cc;
        const o = colorOf(b[to]);
        if (o === t) break;
        add(sq, to);
        if (o >= 0) break;
        rr += dr; cc += dc;
      }
    }
  }
  return out;
}

// Diziye yerinde uygular.
function applyTo(b, m, t) {
  b[m.to] = m.promo ? pc(m.promo, t) : m.piece;
  b[m.from] = EMPTY;
  if (m.flag === 'ep') b[m.to + (t === 0 ? 8 : -8)] = EMPTY;
  else if (m.flag === 'O-O') { b[m.from + 1] = b[m.from + 3]; b[m.from + 3] = EMPTY; }
  else if (m.flag === 'O-O-O') { b[m.from - 1] = b[m.from - 4]; b[m.from - 4] = EMPTY; }
}

/** Sıradaki tarafın yasal hamleleri. */
export function legalMoves(pos) {
  const t = pos.turn;
  const b = pos.board.split('');
  const king = kingSq(b, t);
  const out = [];
  for (const m of pseudoMoves(pos, b)) {
    if (m.flag === 'O-O' || m.flag === 'O-O-O') {
      const step = m.flag === 'O-O' ? 1 : -1;
      if (attacked(b, m.from, 1 - t) || attacked(b, m.from + step, 1 - t)) continue;
    }
    const c = b.slice();
    applyTo(c, m, t);
    const k = typeOf(m.piece) === 'k' ? m.to : king;
    if (k >= 0 && attacked(c, k, 1 - t)) continue;
    out.push(m);
  }
  return out;
}

/** Hamleyi uygular (yasal olduğu varsayılır) -> yeni konum. */
export function makeMove(pos, m) {
  const t = pos.turn;
  const b = pos.board.split('');
  applyTo(b, m, t);
  let castle = pos.castle;
  if (castle) {
    if (m.piece === 'K') castle = castle.replace(/[KQ]/g, '');
    if (m.piece === 'k') castle = castle.replace(/[kq]/g, '');
    for (const [sq, right] of [[63, 'K'], [56, 'Q'], [7, 'k'], [0, 'q']]) {
      if (m.from === sq || m.to === sq) castle = castle.replace(right, '');
    }
  }
  return {
    board: b.join(''),
    turn: 1 - t,
    castle,
    ep: m.flag === '2' ? (m.from + m.to) >> 1 : -1,
    half: typeOf(m.piece) === 'p' || m.cap ? 0 : pos.half + 1,
    full: t === 1 ? pos.full + 1 : pos.full,
  };
}

/** from→to (terfide promo zorunlu) yasal hamlesi | null. */
export function findMove(pos, from, to, promo = null) {
  return legalMoves(pos).find((m) => m.from === from && m.to === to && (m.promo || null) === (promo || null)) || null;
}

export function perft(pos, depth) {
  if (depth <= 0) return 1;
  const ms = legalMoves(pos);
  if (depth === 1) return ms.length;
  let n = 0;
  for (const m of ms) n += perft(makeMove(pos, m), depth - 1);
  return n;
}

// ---------- Bitiş ----------

/** Mat imkânsız mı? (Ş-Ş, Ş+F/Ş+A - Ş, yalnız filler ve hepsi aynı renk karede) */
export function insufficient(b) {
  const minors = [];
  for (let i = 0; i < 64; i++) {
    const t = typeOf(b[i]);
    if (!t || t === 'k') continue;
    if (t === 'p' || t === 'r' || t === 'q') return false;
    minors.push({ t, shade: ((i >> 3) + (i & 7)) % 2 });
  }
  if (minors.length <= 1) return true;
  return minors.every((m) => m.t === 'b' && m.shade === minors[0].shade);
}

/** null (sürüyor) | { winner: 0|1|-1, reason: 'mat'|'pat'|'malzeme'|'elli' }. Üçlü tekrarı oyun.js izler. */
export function gameStatus(pos) {
  if (!legalMoves(pos).length) return inCheck(pos) ? { winner: 1 - pos.turn, reason: 'mat' } : { winner: -1, reason: 'pat' };
  if (insufficient(pos.board)) return { winner: -1, reason: 'malzeme' };
  if (pos.half >= 100) return { winner: -1, reason: 'elli' };
  return null;
}

/** Tekrar karşılaştırması için konum anahtarı. Geçerken alma karesi yalnız alma yasalsa girer. */
export function posKey(pos) {
  let ep = '-';
  if (pos.ep >= 0 && legalMoves(pos).some((m) => m.flag === 'ep')) ep = sqName(pos.ep);
  return `${pos.board}${pos.turn}${pos.castle || '-'}${ep}`;
}
