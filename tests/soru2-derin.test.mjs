// Derin Sohbet — saf durum makinesi ve ev sahibi senkronu.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { reduce, initialState, speaker, questionById, PERS, DEFAULT_PER, STAGES, taskOf, summary } from '../games/derin/logic.js';
import { createSync } from '../games/_soru/sync.js';

const P = [{ id: 'omer', name: 'Ömer' }, { id: 'gul', name: 'Gül' }];

function start({ per = 6, from = 0, seed = 4 } = {}) {
  let s = initialState({ players: P });
  if (per !== s.per) s = reduce(s, { type: 'config', per });
  if (from !== s.from) s = reduce(s, { type: 'config', from });
  return reduce(s, { type: 'start', seed });
}

/** Şu anki soruyu iki kişi de cevaplar. */
function answer(s) {
  s = reduce(s, { type: 'pass', by: speaker(s), idx: s.idx, half: 0 });
  return reduce(s, { type: 'pass', by: speaker(s), idx: s.idx, half: 1 });
}

test('kurulum: varsayılanlar ve config', () => {
  assert.deepEqual(PERS, [6, 12, 36]);
  assert.equal(DEFAULT_PER, 6);
  assert.equal(STAGES, 3);
  const s = initialState({ players: P });
  assert.equal(s.game, 'derin');
  assert.equal(s.phase, 'setup');
  assert.equal(s.per, 6);
  assert.equal(s.from, 0);
  assert.equal(reduce(s, { type: 'config', per: 7 }), s);
  assert.equal(reduce(s, { type: 'config', from: 3 }), s);
  assert.equal(reduce(s, { type: 'config', per: 6 }), s, 'değişiklik yoksa aynı nesne');
  assert.equal(reduce(s, { type: 'config', per: 36 }).per, 36);
  assert.equal(reduce(s, { type: 'config', from: 2 }).from, 2);
});

test('start: seçilen aşamadan, o aşamanın sorularıyla başlar', () => {
  const s = start({ per: 12, from: 1, seed: 9 });
  assert.equal(s.phase, 'ask');
  assert.equal(s.stage, 1);
  assert.equal(s.qs.length, 12);
  assert.equal(new Set(s.qs).size, 12);
  for (const id of s.qs) assert.equal(questionById(id)?.stage, 1);
  assert.equal(s.idx, 0);
  assert.equal(s.half, 0);
  assert.equal(s.first, 9 & 1);
  assert.equal(speaker(s), s.first);
  assert.equal(reduce(s, { type: 'config', per: 6 }), s, 'oyunda config yok');
});

test('pass: önce okuyan, "Sıra sende" ile diğeri; sonra yeni soru ve sıra değişir', () => {
  let s = start({ seed: 2 });
  const a = s.first;
  const b = 1 - a;
  assert.equal(reduce(s, { type: 'pass', by: b, idx: 0, half: 0 }), s, 'sırası olmayan geçemez');
  assert.equal(reduce(s, { type: 'pass', by: a, idx: 1, half: 0 }), s, 'yanlış soru');
  assert.equal(reduce(s, { type: 'pass', by: a, idx: 0, half: 1 }), s, 'yanlış yarı');
  s = reduce(s, { type: 'pass', by: a, idx: 0, half: 0 });
  assert.equal(s.half, 1);
  assert.equal(speaker(s), b);
  assert.equal(reduce(s, { type: 'pass', by: a, idx: 0, half: 0 }), s, 'ikinci dokunuş etkisiz');
  s = reduce(s, { type: 'pass', by: b, idx: 0, half: 1 });
  assert.equal(s.idx, 1);
  assert.equal(s.half, 0);
  assert.equal(s.answered, 1);
  assert.equal(speaker(s), b, 'yeni soruyu diğeri başlatır');
});

test('skip: soruyu sayar, sırayı değiştirmez; yanlış soruda etkisiz', () => {
  let s = start();
  const first = s.first;
  assert.equal(reduce(s, { type: 'skip', idx: 3 }), s);
  s = reduce(s, { type: 'skip', idx: 0, by: 1 - first });
  assert.equal(s.idx, 1);
  assert.equal(s.skipped, 1);
  assert.equal(s.answered, 0);
  assert.equal(s.first, first);
});

test('aşama sonu ara ekranı; ikisi de "Hazırım" deyince sonraki aşama', () => {
  let s = start({ per: 6, seed: 8 });
  for (let i = 0; i < 6; i++) s = answer(s);
  assert.equal(s.phase, 'ara');
  assert.equal(s.stage, 0);
  assert.equal(s.stagesDone, 1);
  assert.equal(s.answered, 6);
  assert.equal(typeof taskOf(s), 'string');
  assert.ok(taskOf(s).length > 0);
  assert.equal(reduce(s, { type: 'pass', by: speaker(s), idx: 6, half: 0 }), s, 'arada soru yok');
  s = reduce(s, { type: 'ready', by: 0 });
  assert.deepEqual(s.ready, [true, false]);
  assert.equal(reduce(s, { type: 'ready', by: 0 }), s);
  s = reduce(s, { type: 'ready', by: 1 });
  assert.equal(s.phase, 'ask');
  assert.equal(s.stage, 1);
  assert.equal(s.idx, 0);
  assert.ok(s.qs.every((id) => questionById(id)?.stage === 1));
});

test('son aşama bitince end; özet sayar', () => {
  let s = start({ per: 6, from: 1, seed: 3 });
  for (let i = 0; i < 6; i++) s = answer(s);
  s = reduce(reduce(s, { type: 'ready', by: 0 }), { type: 'ready', by: 1 });
  for (let i = 0; i < 5; i++) s = answer(s);
  s = reduce(s, { type: 'skip', idx: 5 });
  assert.equal(s.phase, 'end');
  const r = summary(s);
  assert.deepEqual(r, { answered: 11, skipped: 1, stagesDone: 2, per: 6, from: 1 });
});

test('finish: erken bitirir; hiç soru geçmediyse kuruluma döner; restart', () => {
  const s0 = start();
  assert.equal(reduce(s0, { type: 'finish' }).phase, 'setup');
  const s1 = reduce(answer(s0), { type: 'finish' });
  assert.equal(s1.phase, 'end');
  assert.equal(s1.answered, 1);
  assert.equal(reduce(s1, { type: 'finish' }), s1);
  const r = reduce(s1, { type: 'restart' });
  assert.equal(r.phase, 'setup');
  assert.equal(r.per, 6);
  const again = reduce(r, { type: 'start', seed: 4 });
  assert.equal(again.answered, 0);
  assert.equal(again.stagesDone, 0);
  assert.ok(again.qs.every((id) => !s0.qs.includes(id)), 'yeni oyun aynı soruları tekrar etmez');
});

// ---- Ev sahibi otoritesi: misafir niyeti koltuğuna göre uygulanır, yenilemede durum geri gelir ----

const live = [];
afterEach(() => live.splice(0).forEach((x) => x.destroy()));
const flush = () => new Promise((r) => setTimeout(r, 0));

function fakePair(ns) {
  const make = (clientId, name) => {
    const handlers = { message: new Set(), presence: new Set() };
    const room = {
      me: { clientId, name },
      peer: null,
      present: null,
      on(ev, fn) {
        handlers[ev].add(fn);
        if (ev === 'presence') fn(room.present);
        return () => handlers[ev].delete(fn);
      },
      partner: () => room.present,
      send(msg) {
        const peer = room.peer;
        if (!peer || !room.present) return false;
        const copy = structuredClone(msg);
        queueMicrotask(() => peer.deliver(copy, { clientId, name }));
        return true;
      },
      deliver(msg, from) {
        for (const fn of handlers.message) fn(msg, from);
      },
    };
    return room;
  };
  const host = make('omer', 'Ömer');
  const guest = make('gul', 'Gül');
  host.peer = guest;
  guest.peer = host;
  host.present = { clientId: 'gul', name: 'Gül', page: ns };
  guest.present = { clientId: 'omer', name: 'Ömer', page: ns };
  return { host, guest };
}

test('senkron: misafir yalnız kendi sırasında geçer; yenilenen misafir durumu geri alır', async () => {
  const { host, guest } = fakePair('derin');
  const base = { ns: 'derin', roomId: 'oda1', reduce, initial: (players) => initialState({ players }), storage: null, onChange: () => {} };
  const h = createSync({ ...base, room: host, isHost: true });
  let g = createSync({ ...base, room: guest, isHost: false, hostId: 'omer' });
  live.push(h, g);
  await flush();
  h.dispatch({ type: 'start' });
  await flush();
  assert.equal(g.state.phase, 'ask');
  const s = h.state;
  const guestTurn = speaker(s) === 1;
  g.dispatch({ type: 'pass', idx: 0, half: 0, by: 0 }); // by misafirde yok sayılır → 1
  await flush();
  assert.equal(h.state.half, guestTurn ? 1 : 0);

  // Yenileme: misafir senkronu yok olur, yenisi join ile aynı durumu alır.
  g.destroy();
  g = createSync({ ...base, room: guest, isHost: false, hostId: 'omer' });
  live.push(g);
  await flush();
  assert.deepEqual(g.state, h.state);
  assert.equal(g.ctx().mySeat, 1);
});
