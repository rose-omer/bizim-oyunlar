// Derin Sohbet — saf durum makinesi. DOM'a dokunmaz.
// Üç aşama (Tanışma → Yakınlık → Derin). Her soruyu ikisi de sözlü cevaplar:
// önce `first` okur ve cevaplar, "Sıra sende" ile diğeri cevaplar, sonra yeni soru;
// yeni soruyu öbürü başlatır. Aşama bitince ara ekranı: ikisi de "Hazırım" der.
// Eylemler: seat, config {per?, from?}, start {seed}, pass {by, idx, half}, skip {idx},
//   ready {by}, finish, restart.
import { SORULAR, ASAMALAR, ARA_GOREVLERI } from './sorular.js';
import { drawOrder, mulberry32, mix } from '../_soru/rng.js';
import { seat, isSeat, makePlayers } from '../_soru/common.js';

export const PERS = [6, 12, 36];
export const DEFAULT_PER = 6;
export const STAGES = ASAMALAR.length;

const BY_ID = new Map(SORULAR.map((q) => [q.id, q]));
const STAGE_IDS = ASAMALAR.map((_, st) => SORULAR.filter((q) => q.stage === st).map((q) => q.id));

export function questionById(id) {
  return BY_ID.get(id) || null;
}

/** Şu an konuşan koltuk. */
export function speaker(s) {
  return s.half === 0 ? s.first : 1 - s.first;
}

/** Ara ekranındaki nazik görev metni. */
export function taskOf(s) {
  const list = ARA_GOREVLERI[s.stage] || ARA_GOREVLERI[0];
  return list[s.task] || list[0];
}

export function initialState({ players, per = DEFAULT_PER, from = 0 } = {}) {
  return {
    game: 'derin',
    phase: 'setup',
    players: makePlayers(players),
    per: PERS.includes(per) ? per : DEFAULT_PER,
    from: from >= 0 && from < STAGES ? from : 0,
    seed: 0,
    stage: 0,
    qs: [],
    idx: 0,
    half: 0,
    first: 0,
    ready: [false, false],
    task: 0,
    answered: 0,
    skipped: 0,
    stagesDone: 0,
    used: ASAMALAR.map(() => []),
  };
}

function openStage(s, stage) {
  const prevUsed = s.used?.[stage] || [];
  const { order, used } = drawOrder(STAGE_IDS[stage], s.per, mix(s.seed, stage), prevUsed);
  const all = ASAMALAR.map((_, i) => (i === stage ? used : s.used?.[i] || []));
  return { ...s, phase: 'ask', stage, qs: order, used: all, idx: 0, half: 0, ready: [false, false] };
}

/** Soruyu kapatır: cevaplandı ya da atlandı. Aşama bitince ara ya da son. */
function closeQuestion(s, answered) {
  const n = answered
    ? { ...s, answered: s.answered + 1, first: 1 - s.first, half: 0 }
    : { ...s, skipped: s.skipped + 1, half: 0 };
  if (s.idx + 1 < s.qs.length) return { ...n, idx: s.idx + 1 };
  const stagesDone = s.stagesDone + 1;
  if (s.stage + 1 >= STAGES) return { ...n, stagesDone, phase: 'end' };
  const list = ARA_GOREVLERI[s.stage] || [];
  const task = Math.floor(mulberry32(mix(s.seed, 100 + s.stage))() * Math.max(1, list.length));
  return { ...n, stagesDone, phase: 'ara', ready: [false, false], task };
}

export function reduce(s, a) {
  if (!s || !a) return s;
  switch (a.type) {
    case 'seat':
      return seat(s, a);

    case 'config': {
      if (s.phase !== 'setup') return s;
      let next = s;
      if (a.per !== undefined) {
        if (!PERS.includes(a.per)) return s;
        if (a.per !== s.per) next = { ...next, per: a.per };
      }
      if (a.from !== undefined) {
        if (!Number.isInteger(a.from) || a.from < 0 || a.from >= STAGES) return s;
        if (a.from !== s.from) next = { ...next, from: a.from };
      }
      return next;
    }

    case 'start': {
      if (s.phase !== 'setup') return s;
      const seed = Number(a.seed) >>> 0;
      return openStage({ ...s, seed, first: seed & 1, answered: 0, skipped: 0, stagesDone: 0, task: 0 }, s.from);
    }

    case 'pass':
      if (s.phase !== 'ask' || a.idx !== s.idx || a.half !== s.half || a.by !== speaker(s)) return s;
      if (s.half === 0) return { ...s, half: 1 };
      return closeQuestion(s, true);

    case 'skip':
      if (s.phase !== 'ask' || a.idx !== s.idx) return s;
      return closeQuestion(s, false);

    case 'ready': {
      if (s.phase !== 'ara' || !isSeat(a.by) || s.ready[a.by]) return s;
      const ready = s.ready.slice();
      ready[a.by] = true;
      if (!ready[0] || !ready[1]) return { ...s, ready };
      return openStage(s, s.stage + 1);
    }

    case 'finish':
      if (s.phase !== 'ask' && s.phase !== 'ara') return s;
      if (s.answered + s.skipped === 0) return { ...s, phase: 'setup', qs: [], idx: 0, half: 0 };
      return { ...s, phase: 'end' };

    case 'restart':
      if (s.phase === 'setup') return s;
      return { ...s, phase: 'setup', qs: [], idx: 0, half: 0, ready: [false, false] };

    default:
      return s;
  }
}

/** Bitiş özeti (logGame ve kutlama için). */
export function summary(s) {
  return { answered: s.answered, skipped: s.skipped, stagesDone: s.stagesDone, per: s.per, from: s.from };
}
