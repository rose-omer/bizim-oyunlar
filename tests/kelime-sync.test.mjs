// Kelime Zinciri + ortak eşitleme (games/hafiza/sync.js): iki uç, sahte oda.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSync } from '../games/hafiza/sync.js';
import { initialState, reduce, toAction, schedule, ONAY_MS, CAN } from '../games/kelime/oyun.js';

const NS = 'kelime';
function fakeRoom(id) {
  const h = { message: [], presence: [] };
  const room = {
    me: { clientId: id, name: id },
    peer: null,
    present: null,
    sent: [],
    send(msg) {
      room.sent.push(msg);
      if (!room.peer) return false;
      const copy = JSON.parse(JSON.stringify(msg));
      queueMicrotask(() => room.peer._emit('message', copy, room.me));
      return true;
    },
    on(ev, fn) {
      h[ev].push(fn);
      if (ev === 'presence') fn(room.present);
      return () => { h[ev] = h[ev].filter((f) => f !== fn); };
    },
    partner: () => room.present,
    _emit(ev, ...args) { for (const f of h[ev]) f(...args); },
  };
  return room;
}
function pair() {
  const h = fakeRoom('H'), g = fakeRoom('G');
  h.peer = g; g.peer = h;
  h.present = { clientId: 'G', name: 'Gül', page: NS };
  g.present = { clientId: 'H', name: 'Ömer', page: NS };
  return { h, g };
}
const tick = () => new Promise((r) => setTimeout(r, 5));
const players = ['H', 'G'];

function kur({ h, g }, ayar = {}) {
  const host = createSync({
    room: h, ns: NS, isHost: true, solo: false, reduce, schedule,
    toAction: (i, by, s) => toAction(i, by, s, { hostId: 'H', now: Date.now() }),
    initial: initialState({ players, names: { H: 'Ömer', G: 'Gül' }, ayar }),
  });
  const misafir = () => createSync({
    room: g, ns: NS, hostId: 'H', isHost: false, solo: false, reduce, schedule,
    toAction: (i, by, s) => toAction(i, by, s, { hostId: 'H', now: Date.now() }),
  });
  return { host, misafir };
}

test('misafir durumu alır; kelime yazar, ev sahibi onaylar; zincir iki tarafta aynı', async () => {
  const r = pair();
  const { host, misafir } = kur(r, { sure: 0 });
  const guest = misafir();
  host.start(); guest.start();
  await tick();
  assert.equal(guest.state.faz, 'kurulum');
  // misafir ayar değiştirir, başlatır
  guest.dispatch({ type: 'ayar', ayar: { mod: 'karsi' } });
  await tick();
  assert.equal(host.state.ayar.mod, 'karsi');
  guest.dispatch({ type: 'yeni', oyun: guest.state.oyun });
  await tick();
  assert.equal(guest.state.faz, 'oyun');
  assert.equal(guest.state.sira, 0, 'ilk oyunu ev sahibi başlar');
  host.dispatch({ type: 'kelime', k: 'Elma' });
  await tick();
  assert.equal(guest.state.faz, 'onay');
  assert.equal(guest.state.bekleyen.k, 'elma');
  guest.dispatch({ type: 'onay', evet: true, no: guest.state.bekleyen.no });
  await tick();
  assert.equal(host.state.zincir.length, 1);
  guest.dispatch({ type: 'kelime', k: 'ARMUT' });
  await tick();
  host.dispatch({ type: 'onay', evet: true, no: host.state.bekleyen.no });
  await tick();
  assert.deepEqual(guest.state.zincir.map((z) => z.k), ['elma', 'armut']);
  assert.equal(guest.state.harf, 't');
  assert.deepEqual(guest.state, host.state);
  host.destroy(); guest.destroy();
});

test('itiraz akışı ağ üzerinden: sıra yazanda kalır, yeniden dener', async () => {
  const r = pair();
  const { host, misafir } = kur(r, { sure: 0 });
  const guest = misafir();
  host.start(); guest.start();
  await tick();
  host.dispatch({ type: 'yeni', oyun: 0 });
  host.dispatch({ type: 'kelime', k: 'dağ' });
  host.dispatch({ type: 'onay', evet: true, no: host.state.bekleyen?.no }); // yazan onaylayamaz
  assert.equal(host.state.faz, 'onay');
  await tick();
  guest.dispatch({ type: 'onay', evet: true, no: guest.state.bekleyen.no });
  await tick();
  assert.equal(guest.state.harf, 'a', 'dağ → a');
  guest.dispatch({ type: 'kelime', k: 'asdfg' });
  await tick();
  host.dispatch({ type: 'onay', evet: false, no: host.state.bekleyen.no });
  await tick();
  assert.equal(guest.state.olay.tur, 'red');
  assert.equal(guest.state.sira, 1, 'sıra Gül\'de kalır');
  assert.equal(guest.state.zincir.length, 1);
  guest.dispatch({ type: 'kelime', k: 'ağaç' });
  await tick();
  host.dispatch({ type: 'onay', evet: true, no: host.state.bekleyen.no });
  await tick();
  assert.deepEqual(guest.state.zincir.map((z) => z.k), ['dağ', 'ağaç']);
  host.destroy(); guest.destroy();
});

test('aynı anda iki "Tekrar": tek yeni oyun', async () => {
  const r = pair();
  const { host, misafir } = kur(r, { sure: 10 });
  const guest = misafir();
  host.start(); guest.start();
  await tick();
  host.dispatch({ type: 'yeni', oyun: 0 });
  for (let i = 0; i < CAN; i++) {
    const s = host.state;
    if (s.sira === 0) host.dispatch({ type: 'pas' });
    else { guest.dispatch({ type: 'pas' }); await tick(); }
  }
  await tick();
  assert.equal(guest.state.faz, 'bitti');
  const g = guest.state.oyun;
  guest.dispatch({ type: 'yeni', oyun: g }); // ağdan gelir
  host.dispatch({ type: 'yeni', oyun: g });  // yerelde hemen
  await tick();
  assert.equal(host.state.oyun, g + 1);
  assert.equal(guest.state.oyun, g + 1);
  assert.equal(host.state.zincir.length, 0);
  host.destroy(); guest.destroy();
});

test('misafir yenilenince durum ev sahibinden geri gelir', async () => {
  const r = pair();
  const { host, misafir } = kur(r, { sure: 0 });
  let guest = misafir();
  host.start(); guest.start();
  await tick();
  host.dispatch({ type: 'yeni', oyun: 0 });
  host.dispatch({ type: 'kelime', k: 'kalem' });
  await tick();
  guest.dispatch({ type: 'onay', evet: true, no: guest.state.bekleyen.no });
  await tick();
  guest.destroy();
  guest = misafir(); // sayfa yenilendi: boş durumla başlar, join yollar
  assert.equal(guest.state, null);
  guest.start();
  await tick();
  assert.deepEqual(guest.state.zincir.map((z) => z.k), ['kalem']);
  assert.equal(guest.state.harf, 'm');
  host.destroy(); guest.destroy();
});

test('zamanlayıcı: onay 5 sn içinde gelmezse kabul; sıra süresi dolunca can gider', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 });
  const host = createSync({
    room: null, ns: NS, isHost: true, solo: false, reduce, schedule,
    toAction: (i, by, s) => toAction(i, by, s, { hostId: 'me', now: Date.now() }),
    initial: initialState({ players: ['me', 'G'], ayar: { sure: 10 } }),
  });
  host.start();
  host.dispatch({ type: 'yeni', oyun: 0 });
  host.dispatch({ type: 'kelime', k: 'elma' });
  assert.equal(host.state.faz, 'onay');
  t.mock.timers.tick(ONAY_MS - 1);
  assert.equal(host.state.faz, 'onay');
  t.mock.timers.tick(1);
  assert.equal(host.state.faz, 'oyun');
  assert.equal(host.state.olay.oto, true);
  assert.equal(host.state.sira, 1);
  t.mock.timers.tick(10_000);
  assert.deepEqual(host.state.canlar, [CAN - 1]);
  assert.equal(host.state.olay.tur, 'sure');
  assert.equal(host.state.sira, 0);
  host.destroy();
});
