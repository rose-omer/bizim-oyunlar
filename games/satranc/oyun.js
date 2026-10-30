// Satranç: durum makinesi (saf). Kurallar kurallar.js'te; ev sahibi uygular, misafir yalnız çizer.
//
// Durum bir konumdur (board, turn, castle, ep, half, full) ve üstüne oyun bilgisi taşır:
//  players: [beyazın id'si, siyahın id'si] (bu oyun için; her yeni oyunda renkler yer değiştirir).
//  last: son hamle { by: koltuk, from, to, cap, promo, flag, check } | null.
//  caps: [beyazın aldıkları, siyahın aldıkları] (taş türleri: 'p','n','b','r','q').
//  rep: son geri dönüşsüz hamleden beri konum anahtarlarının özeti (üçlü tekrar). En çok ~100 öğe.
//  offer: beraberlik teklif eden id | null. declined: { by, ply } aynı hamlede ısrarı önler.
//  phase: 'play' | 'end'; result: { winner: 0|1|-1, reason: 'mat'|'pat'|'malzeme'|'elli'|'tekrar'|'teslim'|'anlasma' }.
//  seq her değişimde artar (kayıtlardan hangisi yeni).
// Kural notu: 50 hamle ve üçlü tekrar bu uygulamada istem beklemeden beraberlik sayılır.
import { START_FEN, parseFen, findMove, makeMove, gameStatus, posKey, inCheck } from './kurallar.js';
import { seat, isNewer } from '../dama/oyun.js';

export { seat, isNewer };

const PROMOS = ['q', 'r', 'b', 'n'];
const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9 };

/** Konum anahtarının kısa özeti (FNV-1a 32 bit). */
export function hashKey(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export function newGame({ players, names = {}, no = 1, tally = {}, seq = 0, now = null }) {
  const pos = parseFen(START_FEN);
  return {
    v: 1,
    kind: 'satranc',
    no,
    seq: seq + 1,
    at: now,
    startedAt: now,
    players: players.slice(0, 2),
    names: { ...names },
    ...pos,
    ply: 0,
    last: null,
    caps: [[], []],
    rep: [hashKey(posKey(pos))],
    offer: null,
    declined: null,
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

function finish(s, result) {
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
      if (!Number.isInteger(a.from) || !Number.isInteger(a.to)) return s;
      const m = findMove(s, a.from, a.to, PROMOS.includes(a.promo) ? a.promo : null);
      if (!m) return s;
      const pos = makeMove(s, m);
      const key = hashKey(posKey(pos));
      const rep = pos.half === 0 || pos.castle !== s.castle ? [key] : [...s.rep, key];
      let result = gameStatus(pos);
      if (!result && rep.filter((k) => k === key).length >= 3) result = { winner: -1, reason: 'tekrar' };
      const caps = s.caps.map((l, i) => (i === s.turn && m.cap ? [...l, m.cap.toLowerCase()] : l));
      return bump(s, a.now, {
        ...pos,
        ply: s.ply + 1,
        last: { by: s.turn, from: m.from, to: m.to, cap: m.cap ? m.cap.toLowerCase() : null, promo: m.promo, flag: m.flag, check: inCheck(pos) },
        caps,
        rep,
        offer: null,
        phase: result ? 'end' : 'play',
        result,
        tally: finish(s, result),
        startedAt: s.startedAt ?? a.now ?? null,
      });
    }
    case 'offer': {
      if (s.phase !== 'play' || !s.players.includes(a.by) || s.offer) return s;
      if (s.declined?.by === a.by && s.declined.ply === s.ply) return s;
      return bump(s, a.now, { offer: a.by });
    }
    case 'offerReply': {
      if (s.phase !== 'play' || !s.offer || a.by === s.offer || !s.players.includes(a.by)) return s;
      if (!a.ok) return bump(s, a.now, { offer: null, declined: { by: s.offer, ply: s.ply } });
      const result = { winner: -1, reason: 'anlasma' };
      return bump(s, a.now, { offer: null, phase: 'end', result });
    }
    case 'resign': {
      const i = s.players.indexOf(a.by);
      if (s.phase !== 'play' || i < 0) return s;
      const result = { winner: 1 - i, reason: 'teslim' };
      return bump(s, a.now, { offer: null, phase: 'end', result, tally: finish(s, result) });
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
      return { type: 'move', by, from: intent.from, to: intent.to, promo: PROMOS.includes(intent.promo) ? intent.promo : null, now };
    case 'offer':
      return { type: 'offer', by, now };
    case 'offerReply':
      return { type: 'offerReply', by, ok: !!intent.ok, now };
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

/** Sıra partnere geçince ona gidecek bildirim. by = değişikliği yapan, ad(id) = görünen ad. */
export function notice(prev, s, { by, ad }) {
  if (s.phase === 'end' && prev.phase !== 'end') {
    const r = s.result || {};
    let metin = 'Berabere bitti';
    if (r.reason === 'mat') metin = `${ad(s.players[r.winner])} mat etti`;
    else if (r.reason === 'teslim') metin = `${ad(s.players[1 - r.winner])} teslim oldu`;
    else if (r.winner >= 0) metin = `${ad(s.players[r.winner])} kazandı`;
    return { baslik: 'Satranç bitti', metin };
  }
  if (s.no !== prev.no) return { baslik: 'Yeni oyun', metin: `Satranç: ${ad(by)} yeni oyun başlattı · ilk hamle senin` };
  return { baslik: 'Sıra sende', metin: `Satranç: ${ad(by)} hamlesini yaptı${s.last?.check ? ' · şah!' : ''}` };
}

export function resultOf(s) {
  const r = s.result || {};
  return { winner: r.winner ?? -1, reason: r.reason ?? null, plies: s.ply, no: s.no };
}

/** Alınan taşların puanı: [beyazın aldıkları, siyahın aldıkları]. */
export function material(caps) {
  return caps.map((l) => l.reduce((n, t) => n + (VALUE[t] || 0), 0));
}
