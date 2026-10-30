import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSync } from '../games/hafiza/sync.js';
import * as T from '../games/tavla/oyun.js';

// ---- Ev sahibi otoritesi: gerçek tavla reducer'ı ile iki uçlu sahte oda ----
function fakeRoom(id) {
  const hs = { message: [], presence: [] };
  const room = {
    me: { clientId: id, name: id },
    roomId: 'oda',
    peer: null,
    present: null,
    send(msg) {
      if (!room.peer) return false;
      const copy = JSON.parse(JSON.stringify(msg));
      queueMicrotask(() => room.peer._emit('message', copy, room.me));
      return true;
    },
    on(ev, fn) {
      hs[ev].push(fn);
      if (ev === 'presence') fn(room.present);
      return () => { hs[ev] = hs[ev].filter((f) => f !== fn); };
    },
    partner: () => room.present,
    _emit(ev, ...args) { for (const f of hs[ev]) f(...args); },
  };
  return room;
}
const tick = () => new Promise((r) => setTimeout(r, 5));

test('tavla senkron: misafir zar tohumunu görmez; zar ev sahibinde atılır', async () => {
  const H = 'host', G = 'guest';
  const h = fakeRoom(H), g = fakeRoom(G);
  h.peer = g; g.peer = h;
  h.present = { clientId: G, name: G, page: 'tavla' };
  g.present = { clientId: H, name: H, page: 'tavla' };
  const toAction = (i, by, s) => T.toAction(i, by, s, { hostId: H, now: 1, seed: 4242 });
  const host = createSync({ room: h, ns: 'tavla', isHost: true, reduce: T.reduce, toAction, view: T.view, schedule: T.schedule,
    initial: T.initialState({ players: [H, G], names: {} }) });
  const guest = createSync({ room: g, ns: 'tavla', hostId: H, isHost: false, reduce: T.reduce, toAction });
  host.start(); guest.start();
  guest.dispatch({ type: 'match', target: 3, match: 0 });
  await tick();
  assert.equal(host.state.phase, 'roll');
  assert.equal(host.state.seed, 4242);
  assert.equal(guest.state.seed, null);
  const cur = host.state.players[host.state.turn];
  (cur === G ? guest : host).dispatch({ type: 'roll', dice: [6, 6] });
  await tick();
  assert.deepEqual(guest.state.dice, T.diceAt(4242, 0));
  host.destroy(); guest.destroy();
});

test('tavla senkron: misafirin geçersiz adımı ve sırasız zarı yok sayılır; geri al çalışır', async () => {
  const H = 'host', G = 'guest';
  const h = fakeRoom(H), g = fakeRoom(G);
  h.peer = g; g.peer = h;
  h.present = { clientId: G, name: G, page: 'tavla' };
  g.present = { clientId: H, name: H, page: 'tavla' };
  const toAction = (i, by, s) => T.toAction(i, by, s, { hostId: H, now: 1, seed: 7 });
  const host = createSync({ room: h, ns: 'tavla', isHost: true, reduce: T.reduce, toAction, view: T.view,
    initial: T.initialState({ players: [H, G], names: {} }) });
  const guest = createSync({ room: g, ns: 'tavla', hostId: H, isHost: false, reduce: T.reduce, toAction });
  host.start(); guest.start();
  host.dispatch({ type: 'match', target: 5, match: 0 });
  await tick();
  const turnId = host.state.players[host.state.turn];
  const [mine, other] = turnId === G ? [guest, host] : [host, guest];
  other.dispatch({ type: 'roll' });
  await tick();
  assert.equal(host.state.phase, 'roll', 'sırası olmayan zar atamaz');
  mine.dispatch({ type: 'roll' });
  await tick();
  assert.equal(host.state.phase, 'move');
  const seq = host.state.seq;
  mine.dispatch({ type: 'play', steps: [{ from: 3, die: 9 }] });
  await tick();
  assert.equal(host.state.seq, seq, 'geçersiz adım');
  if (!host.state.noMove) {
    const st = T.legalSteps(T.posOf(host.state), host.state.turn, host.state.left)[0];
    mine.dispatch({ type: 'play', steps: [{ from: st.from, die: st.die }] });
    await tick();
    if (host.state.phase === 'move') {
      assert.equal(host.state.steps.length, 1);
      mine.dispatch({ type: 'undo' });
      await tick();
      assert.equal(guest.state.steps.length, 0);
    }
  }
  host.destroy(); guest.destroy();
});

test('tavla senkron: kayıttan (tohumsuz) sürdürülen maçta ev sahibi yeni tohumla zar atar; misafir görmez', async () => {
  const H = 'host', G = 'guest';
  const h = fakeRoom(H), g = fakeRoom(G);
  h.peer = g; g.peer = h;
  h.present = { clientId: G, name: G, page: 'tavla' };
  g.present = { clientId: H, name: H, page: 'tavla' };
  const started = T.reduce(T.initialState({ players: [H, G], names: {} }), { type: 'match', by: H, target: 3, seed: 11, match: 0, now: 1 });
  const saved = T.view(started); // kayda yazılan
  assert.equal(saved.seed, null);
  const toAction = (i, by, s) => T.toAction(i, by, s, { hostId: H, now: 2, seed: 98765 });
  const host = createSync({ room: h, ns: 'tavla', isHost: true, reduce: T.reduce, toAction, view: T.view, initial: saved });
  const guest = createSync({ room: g, ns: 'tavla', hostId: H, isHost: false, reduce: T.reduce, toAction });
  host.start(); guest.start();
  const cur = saved.players[saved.turn];
  (cur === G ? guest : host).dispatch({ type: 'roll' });
  await tick();
  assert.equal(host.state.phase, 'move');
  assert.equal(host.state.seed, 98765);
  assert.equal(guest.state.seed, null);
  assert.deepEqual(guest.state.dice, T.diceAt(98765, saved.rolls));
  host.destroy(); guest.destroy();
});
