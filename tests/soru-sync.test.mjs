// Ev sahibi otoritesi: join → state, intent → reducer → state yayını. Sahte oda ile.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createSync } from '../games/_soru/sync.js';
import { reduce, initialState, subjectOf } from '../games/tanis/logic.js';

const NS = 'tanis';
const flush = () => new Promise((r) => setTimeout(r, 0));

// Zamanlayıcılar açık kalmasın: test başarısız olsa da her senkron kapatılır.
const live = [];
afterEach(() => live.splice(0).forEach((s) => s.destroy()));
const track = (s) => (live.push(s), s);

/** İki uçlu sahte oda. Mesajlar mikro görevde, kopyalanarak iletilir. */
function fakePair() {
  const make = (clientId, name) => {
    const handlers = { message: new Set(), presence: new Set() };
    const room = {
      me: { clientId, name },
      sent: [],
      peer: null,
      present: null,
      on(ev, fn) {
        handlers[ev].add(fn);
        if (ev === 'presence') fn(room.present);
        return () => handlers[ev].delete(fn);
      },
      partner: () => room.present,
      send(msg) {
        room.sent.push(msg);
        const peer = room.peer;
        if (!peer || !room.present) return false;
        const copy = structuredClone(msg);
        queueMicrotask(() => peer.deliver(copy, { clientId, name }));
        return true;
      },
      deliver(msg, from) {
        for (const fn of handlers.message) fn(msg, from);
      },
      setPresence(p) {
        room.present = p;
        for (const fn of handlers.presence) fn(p);
      },
    };
    return room;
  };
  const host = make('h', 'Ayşe');
  const guest = make('g', 'Mehmet');
  host.peer = guest;
  guest.peer = host;
  host.present = { clientId: 'g', name: 'Mehmet', page: NS };
  guest.present = { clientId: 'h', name: 'Ayşe', page: NS };
  return { host, guest };
}

function setup({ storage = null } = {}) {
  const { host, guest } = fakePair();
  const seen = { host: [], guest: [] };
  const base = { ns: NS, roomId: 'oda1', reduce, initial: (players) => initialState({ players }), storage };
  const h = track(createSync({ ...base, room: host, isHost: true, onChange: (s, c) => seen.host.push([s, c]) }));
  const g = track(createSync({ ...base, room: guest, isHost: false, onChange: (s, c) => seen.guest.push([s, c]) }));
  return { host, guest, h, g, seen, stop: () => { h.destroy(); g.destroy(); } };
}

test('misafir join gönderir, ev sahibi durumu yollar; oyuncular doğru koltukta', async () => {
  const t = setup();
  await flush();
  assert.ok(t.guest.sent.some((m) => m.t === 'join'));
  assert.deepEqual(t.g.state, t.h.state);
  assert.deepEqual(t.h.state.players, [{ id: 'h', name: 'Ayşe' }, { id: 'g', name: 'Mehmet' }]);
  assert.equal(t.h.ctx().mySeat, 0);
  assert.equal(t.g.ctx().mySeat, 1);
  assert.equal(t.g.ctx().partnerHere, true);
  t.stop();
});

test('niyetler ev sahibinde uygulanır; koltuk gönderene göre atanır', async () => {
  const t = setup();
  await flush();
  t.g.dispatch({ type: 'config', count: 6 });
  await flush();
  assert.equal(t.h.state.count, 6);
  t.h.dispatch({ type: 'start' });
  await flush();
  assert.equal(t.g.state.phase, 'pick');
  assert.equal(typeof t.h.state.seed, 'number');

  // Misafir by=0 diye yalan söylese de koltuğu 1 sayılır.
  t.g.dispatch({ type: 'pick', by: 0, choice: 3 });
  await flush();
  assert.deepEqual(t.h.state.picks, [null, 3]);
  t.h.dispatch({ type: 'pick', choice: 3 });
  await flush();
  assert.equal(t.g.state.phase, 'reveal');
  assert.equal(t.g.state.scores[1 - subjectOf(t.g.state)], 1);
  assert.deepEqual(t.g.state, t.h.state);
  t.stop();
});

test('misafir ev sahibine özel eylem gönderemez', async () => {
  const t = setup();
  await flush();
  assert.equal(t.g.dispatch({ type: 'seat', idx: 0, name: 'Hacker' }), false);
  t.guest.send({ t: 'intent', a: { type: 'seat', idx: 0, id: 'x', name: 'Hacker' } });
  await flush();
  assert.equal(t.h.state.players[0].name, 'Ayşe');
  t.stop();
});

test('aynı durum tekrar gelirse misafir yeniden çizmez', async () => {
  const t = setup();
  await flush();
  const before = t.seen.guest.length;
  t.host.send({ t: 'state', s: t.h.state, now: Date.now() });
  await flush();
  assert.equal(t.seen.guest.length, before);
  t.stop();
});

test('niyet sonrası aynı durum gelirse misafir bir kez yeniden çizer (iyimser kilit çözülür)', async () => {
  const t = setup();
  await flush();
  // Kurulumda seçim geçersiz: ev sahibinde durum değişmez, yanıt da gelmez.
  t.g.dispatch({ type: 'pick', by: 1, choice: 0 });
  await flush();
  const before = t.seen.guest.length;
  // Nabız: aynı durum. Misafir arayüzü tazelemeli ki dokunuşla kilitlenen düğmeler çözülsün.
  t.host.send({ t: 'state', s: t.h.state, now: Date.now() });
  await flush();
  assert.equal(t.seen.guest.length, before + 1);
  t.host.send({ t: 'state', s: t.h.state, now: Date.now() });
  await flush();
  assert.equal(t.seen.guest.length, before + 1);
  t.stop();
});

test('partner geri gelince misafir yeniden join gönderir; yokken durum bilgisi düşer', async () => {
  const t = setup();
  await flush();
  t.guest.setPresence(null);
  assert.equal(t.g.ctx().partnerHere, false);
  const joins = t.guest.sent.filter((m) => m.t === 'join').length;
  t.guest.setPresence({ clientId: 'h', name: 'Ayşe', page: NS });
  assert.equal(t.guest.sent.filter((m) => m.t === 'join').length, joins + 1);
  t.guest.setPresence({ clientId: 'h', name: 'Ayşe', page: 'lobby' });
  assert.equal(t.g.ctx().partnerHere, false);
  t.stop();
});

test('ev sahibi durumu saklar ve yenilemede geri yükler', async () => {
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  const t1 = setup({ storage });
  await flush();
  t1.h.dispatch({ type: 'config', count: 16 });
  t1.h.dispatch({ type: 'start' });
  const saved = t1.h.state;
  t1.stop();
  const t2 = setup({ storage });
  await flush();
  assert.equal(t2.h.state.phase, 'pick');
  assert.deepEqual(t2.h.state.qs, saved.qs);
  assert.deepEqual(t2.g.state, t2.h.state);
  t2.stop();
});

test('aynı telefonda: ağ yok, by arayüzden gelir', async () => {
  const { host } = fakePair();
  let last = null;
  const s = track(createSync({
    room: host, ns: NS, solo: true, isHost: true, reduce, storage: null,
    initial: () => initialState({ players: [{ id: '1', name: 'A' }, { id: '2', name: 'B' }] }),
    onChange: (st) => { last = st; },
  }));
  await flush();
  assert.equal(last.phase, 'setup');
  s.dispatch({ type: 'start' });
  s.dispatch({ type: 'pick', by: 1, choice: 2 });
  assert.deepEqual(s.state.picks, [null, 2]);
  assert.equal(host.sent.length, 0);
  s.destroy();
});
