// Supabase arka ucu: sahte istemciyle durum eşleme, presence, zarf, yeniden bağlanma.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { openSupabaseRoom } from '../js/core/room.js';

const ME = { clientId: 'A', name: 'Ali' };
const flush = () => new Promise((r) => setImmediate(r));

function fakeClient() {
  const all = [];
  return {
    all,
    heartbeats: 0,
    realtime: { sendHeartbeat() {} },
    getChannels: () => all.filter((c) => !c.removed),
    channel(name, opts) {
      const c = {
        topic: 'realtime:' + name, opts, handlers: [], sent: [], tracked: null, state: {}, removed: false, cb: null,
        on(type, filter, fn) { this.handlers.push({ type, event: filter.event, fn }); return this; },
        subscribe(cb) { this.cb = cb; return this; },
        track(p) { this.tracked = p; return Promise.resolve('ok'); },
        presenceState() { return this.state; },
        send(msg) { this.sent.push(msg); return Promise.resolve('ok'); },
        fire(type, event, payload) {
          for (const h of this.handlers) if (h.type === type && h.event === event) h.fn(payload);
        },
      };
      all.push(c);
      return c;
    },
    async removeChannel(c) {
      c.removed = true;
      c.cb?.('CLOSED');
      return 'ok';
    },
  };
}

test('supabase: kanal ayarı, durumlar, presence, zarf, yeniden bağlanma', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  const client = fakeClient();
  const { room, settled } = openSupabaseRoom({ roomId: 'abcdefghij', ns: 'yapboz', me: ME, getClient: async () => client });
  try {
    assert.equal(room.backend, 'supabase');
    const statuses = [];
    const partners = [];
    const msgs = [];
    room.on('status', (s, d) => statuses.push([s, d]));
    room.on('presence', (p) => partners.push(p));
    room.on('message', (m, from) => msgs.push([m, from]));
    assert.deepEqual(statuses, [['connecting', 'Bağlanıyor…']]);
    assert.deepEqual(partners, [null]);
    assert.equal(room.send({ t: 'erken' }), false); // bağlı değil

    await flush();
    const c = client.all[0];
    assert.equal(c.topic, 'realtime:oda:abcdefghij');
    assert.deepEqual(c.opts, { config: { broadcast: { self: false, ack: false }, presence: { key: 'A' } } });

    c.cb('SUBSCRIBED');
    await settled;
    assert.deepEqual(statuses.at(-1), ['online', '']);
    assert.deepEqual(c.tracked, { clientId: 'A', name: 'Ali', page: 'yapboz' });

    c.state = {
      A: [{ clientId: 'A', name: 'Ali', page: 'yapboz' }],
      B: [{ clientId: 'B', name: 'Ayşe', page: 'lobby' }],
    };
    c.fire('presence', 'sync');
    assert.deepEqual(room.partner(), { clientId: 'B', name: 'Ayşe', page: 'lobby' });
    c.state.B = [{ clientId: 'B', name: 'Ayşe', page: 'yapboz' }];
    c.fire('presence', 'join');
    assert.equal(room.partner().page, 'yapboz');
    assert.equal(partners.length, 3);

    assert.equal(room.send({ t: 'join' }), true);
    assert.equal(room.sendAll({ t: 'go' }), true);
    assert.deepEqual(c.sent, [
      { type: 'broadcast', event: 'm', payload: { ns: 'yapboz', from: ME, m: { t: 'join' } } },
      { type: 'broadcast', event: 'm', payload: { ns: '*', from: ME, m: { t: 'go' } } },
    ]);

    const from = { clientId: 'B', name: 'Ayşe' };
    c.fire('broadcast', 'm', { payload: { ns: 'yapboz', from, m: { t: 'state' } } });
    c.fire('broadcast', 'm', { payload: { ns: 'ciz', from, m: { t: 'baska' } } });
    c.fire('broadcast', 'm', { payload: { ns: '*', from, m: { t: 'go' } } });
    c.fire('broadcast', 'm', { payload: { ns: 'yapboz', from: ME, m: { t: 'kendim' } } });
    assert.deepEqual(msgs, [[{ t: 'state' }, from], [{ t: 'go' }, from]]);

    // Hata: durum 'error', partner düşer, gönderim false; 2 sn sonra kanal baştan kurulur
    c.cb('CHANNEL_ERROR');
    assert.equal(statuses.at(-1)[0], 'error');
    assert.equal(room.partner(), null);
    assert.equal(room.send({ t: 'x' }), false);
    mock.timers.tick(2000);
    await flush();
    assert.equal(c.removed, true);
    assert.equal(client.all.length, 2);
    const c2 = client.all[1];
    c.cb('SUBSCRIBED'); // eski kanalın geç geri çağrısı yok sayılır
    assert.equal(statuses.at(-1)[0], 'connecting');
    c2.cb('SUBSCRIBED');
    assert.equal(statuses.at(-1)[0], 'online');

    // Kütüphane kendi toparlarsa bekçi yeni kanal kurmaz
    c2.cb('TIMED_OUT');
    assert.equal(statuses.at(-1)[0], 'error');
    c2.cb('SUBSCRIBED');
    mock.timers.tick(30000);
    await flush();
    assert.equal(client.all.length, 2);

    // CLOSED → offline
    c2.cb('CLOSED');
    assert.equal(statuses.at(-1)[0], 'offline');

    const before = statuses.length;
    await room.leave();
    assert.equal(c2.removed, true);
    assert.equal(statuses.length, before); // ayrılınca dinleyiciler susar
    mock.timers.tick(60000);
    await flush();
    assert.equal(client.all.length, 2); // ayrıldıktan sonra yeniden bağlanmaz
  } finally {
    mock.timers.reset();
  }
});

test('supabase: istemci yüklenemezse error ve yeniden deneme', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0;
  const client = fakeClient();
  const getClient = async () => {
    calls++;
    if (calls === 1) throw new Error('ağ yok');
    return client;
  };
  const { room, settled } = openSupabaseRoom({ roomId: 'abcdefghij', ns: 'lobby', me: ME, getClient });
  try {
    await flush();
    await settled;
    const st = [];
    room.on('status', (s) => st.push(s));
    assert.deepEqual(st, ['error']);
    mock.timers.tick(2000);
    await flush();
    assert.equal(calls, 2);
    client.all[0].cb('SUBSCRIBED');
    assert.equal(st.at(-1), 'online');
    await room.leave();
  } finally {
    mock.timers.reset();
  }
});
