// Supabase arka ucu: sahte istemciyle durum eşleme, presence, zarf, yeniden bağlanma.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { openSupabaseRoom } from '../js/core/room.js';

const ME = { clientId: 'A', name: 'Ali' };
const flush = () => new Promise((r) => setImmediate(r));

function fakeClient() {
  const all = [];
  const client = {
    all,
    beats: 0,
    realtime: { sendHeartbeat() { this.owner.beats++; } },
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
  client.realtime.owner = client;
  return client;
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
    assert.deepEqual(c.tracked, { clientId: 'A', name: 'Ali', page: 'yapboz', host: null, gorunur: true });

    c.state = {
      A: [{ clientId: 'A', name: 'Ali', page: 'yapboz' }],
      B: [{ clientId: 'B', name: 'Ayşe', page: 'lobby' }],
    };
    c.fire('presence', 'sync');
    assert.deepEqual(room.partner(), { clientId: 'B', name: 'Ayşe', page: 'lobby', host: null, gorunur: true });
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

test("supabase: presence yükünde host; partnerin host'u okunur", async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  const client = fakeClient();
  const { room } = openSupabaseRoom({ roomId: 'abcdefghij', ns: 'yapboz', me: ME, host: 'B', getClient: async () => client });
  try {
    await flush();
    const c = client.all[0];
    c.cb('SUBSCRIBED');
    assert.deepEqual(c.tracked, { clientId: 'A', name: 'Ali', page: 'yapboz', host: 'B', gorunur: true });
    c.state = { B: [{ clientId: 'B', name: 'Ayşe', page: 'yapboz', host: 'A' }] };
    c.fire('presence', 'sync');
    assert.deepEqual(room.partner(), { clientId: 'B', name: 'Ayşe', page: 'yapboz', host: 'A', gorunur: true });
    await room.leave();
  } finally {
    mock.timers.reset();
  }
});

test('supabase: ağ dönünce hemen kalp atışı, 4 sn sonra bir daha', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  const hadWindow = 'window' in globalThis;
  globalThis.window = new EventTarget();
  const client = fakeClient();
  const { room } = openSupabaseRoom({ roomId: 'abcdefghij', ns: 'lobby', me: ME, getClient: async () => client });
  try {
    await flush();
    client.all[0].cb('SUBSCRIBED');
    assert.equal(client.beats, 0);
    window.dispatchEvent(new Event('online'));
    assert.equal(client.beats, 1);
    mock.timers.tick(3999);
    assert.equal(client.beats, 1);
    mock.timers.tick(1);
    assert.equal(client.beats, 2);
    // üst üste tazeleme: bekleyen ikinci atış yenisiyle değişir, birikmez
    window.dispatchEvent(new Event('online'));
    window.dispatchEvent(new Event('online'));
    assert.equal(client.beats, 4);
    mock.timers.tick(4000);
    assert.equal(client.beats, 5);
    // ayrılınca bekleyen atış gitmez
    window.dispatchEvent(new Event('online'));
    await room.leave();
    mock.timers.tick(4000);
    assert.equal(client.beats, 6);
  } finally {
    mock.timers.reset();
    if (!hadWindow) delete globalThis.window;
  }
});

test('supabase: sekme gizlenince/öne gelince presence gorunur ile yeniden track', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  const hadDoc = 'document' in globalThis;
  const oldDoc = globalThis.document;
  const fakeDoc = new EventTarget();
  fakeDoc.visibilityState = 'visible';
  globalThis.document = fakeDoc;
  const client = fakeClient();
  const { room } = openSupabaseRoom({ roomId: 'abcdefghij', ns: 'sohbet', me: ME, getClient: async () => client });
  try {
    await flush();
    const c = client.all[0];
    fakeDoc.dispatchEvent(new Event('visibilitychange')); // bağlanmadan: track yok
    assert.equal(c.tracked, null);
    c.cb('SUBSCRIBED');
    assert.equal(c.tracked.gorunur, true);
    fakeDoc.visibilityState = 'hidden';
    fakeDoc.dispatchEvent(new Event('visibilitychange'));
    assert.deepEqual(c.tracked, { clientId: 'A', name: 'Ali', page: 'sohbet', host: null, gorunur: false });
    fakeDoc.visibilityState = 'visible';
    fakeDoc.dispatchEvent(new Event('visibilitychange'));
    assert.equal(c.tracked.gorunur, true);
    // partnerin gorunur değişimi presence olayı doğurur
    const seen = [];
    room.on('presence', (p) => seen.push(p?.gorunur));
    c.state = { B: [{ clientId: 'B', name: 'Ayşe', page: 'sohbet', gorunur: false }] };
    c.fire('presence', 'join');
    c.state = { B: [{ clientId: 'B', name: 'Ayşe', page: 'sohbet', gorunur: true }] };
    c.fire('presence', 'join');
    assert.deepEqual(seen, [undefined, false, true]);
    await room.leave();
  } finally {
    mock.timers.reset();
    if (hadDoc) globalThis.document = oldDoc; else delete globalThis.document;
  }
});

// ---------- Cihaz üyeliği (TALIMAT §5.3) ----------
function sahteUyelik(ilk) {
  const u = {
    sonucDeger: ilk, tazele: 0, dinleyiciler: new Set(),
    sonuc: async () => u.sonucDeger,
    dinle: (fn) => { u.dinleyiciler.add(fn); return () => u.dinleyiciler.delete(fn); },
    tazeleFn: () => { u.tazele++; },
    yay(s) { u.sonucDeger = s; for (const fn of u.dinleyiciler) fn(s); },
  };
  return u;
}
const K1 = 'a'.repeat(32);
const K2 = 'b'.repeat(32);

test('üyelik: konu gizli kanaldan; kanal değişince eskisini bırakıp yenisine katılır; onay kalkınca ayrılır', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const client = fakeClient();
  const u = sahteUyelik({ durum: 'onayli', kanal: K1 });
  const { room } = openSupabaseRoom({
    roomId: 'abcdefghij', ns: 'lobby', me: ME, getClient: async () => client,
    uyelik: { sonuc: u.sonuc, dinle: u.dinle, tazele: u.tazeleFn },
  });
  try {
    await flush();
    assert.equal(client.all[0].topic, 'realtime:oda:' + K1);
    client.all[0].cb('SUBSCRIBED');
    assert.equal(room.send({ t: 'x' }), true);

    u.yay({ durum: 'onayli', kanal: K1 }); // aynı kanal: dokunma
    await flush();
    assert.equal(client.all.length, 1);

    u.yay({ durum: 'onayli', kanal: K2 });
    await flush();
    // Kanaldan ayrılmadan önce eski kanaldakilere haber: durumlarını tazelesinler.
    assert.deepEqual(client.all[0].sent.at(-1), { type: 'broadcast', event: 'm', payload: { ns: '*', from: ME, m: { t: 'uyelik' } } });
    assert.equal(client.all[0].removed, true);
    assert.equal(client.all[1].topic, 'realtime:oda:' + K2);
    client.all[0].cb('SUBSCRIBED'); // eski kanalın geç geri çağrısı yok sayılır
    client.all[1].cb('SUBSCRIBED');

    const st = [];
    room.on('status', (s, d) => st.push([s, d]));
    u.yay({ durum: 'yok', kanal: null });
    await flush();
    assert.equal(client.all[1].removed, true);
    assert.deepEqual(st.at(-1), ['error', 'Bu cihaz onay bekliyor.']);
    assert.equal(room.send({ t: 'x' }), false);
    mock.timers.tick(120000);
    await flush();
    assert.equal(client.all.length, 2, 'onaysızken yeniden bağlanmaz');
    assert.ok(u.tazele >= 2, '60 sn\'de bir durum tazelenir');

    u.yay({ durum: 'onayli', kanal: K2 }); // yeniden onaylandı
    await flush();
    assert.equal(client.all.length, 3);
    assert.equal(client.all[2].topic, 'realtime:oda:' + K2);
    await room.leave();
    const once = u.tazele;
    mock.timers.tick(120000);
    assert.equal(u.tazele, once, 'ayrılınca tazeleme durur');
    assert.equal(u.dinleyiciler.size, 0);
  } finally {
    mock.timers.reset();
  }
});

test('üyelik: bekleyen cihaz kanala katılmaz; eski sunucu ve çevrimdışı', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  try {
    const c1 = fakeClient();
    const u1 = sahteUyelik({ durum: 'bekliyor', kanal: null });
    const r1 = openSupabaseRoom({ roomId: 'abcdefghij', ns: 'lobby', me: ME, getClient: async () => c1, uyelik: { sonuc: u1.sonuc, dinle: u1.dinle, tazele: u1.tazeleFn } });
    await flush();
    await r1.settled;
    const st = [];
    r1.room.on('status', (s, d) => st.push([s, d]));
    assert.deepEqual(st, [['error', 'Bu cihaz onay bekliyor.']]);
    assert.equal(c1.all.length, 0);
    await r1.room.leave();

    const c2 = fakeClient();
    const u2 = sahteUyelik({ durum: 'eski-sunucu', kanal: 'abcdefghij' });
    const r2 = openSupabaseRoom({ roomId: 'abcdefghij', ns: 'lobby', me: ME, getClient: async () => c2, uyelik: { sonuc: u2.sonuc, dinle: u2.dinle, tazele: u2.tazeleFn } });
    await flush();
    assert.equal(c2.all[0].topic, 'realtime:oda:abcdefghij');
    // odadaki 'uyelik' haberi durumu tazeletir
    c2.all[0].cb('SUBSCRIBED');
    c2.all[0].fire('broadcast', 'm', { payload: { ns: '*', from: { clientId: 'B', name: 'Ayşe' }, m: { t: 'uyelik' } } });
    assert.equal(u2.tazele, 1);
    await r2.room.leave();

    const c3 = fakeClient();
    const u3 = sahteUyelik({ durum: 'cevrimdisi', onceki: null, kanal: null });
    const r3 = openSupabaseRoom({ roomId: 'abcdefghij', ns: 'lobby', me: ME, getClient: async () => c3, uyelik: { sonuc: u3.sonuc, dinle: u3.dinle, tazele: u3.tazeleFn } });
    await flush();
    const st3 = [];
    r3.room.on('status', (s) => st3.push(s));
    assert.deepEqual(st3, ['error']);
    u3.sonucDeger = { durum: 'cevrimdisi', onceki: 'onayli', kanal: K1 };
    mock.timers.tick(2000); // yeniden dener
    await flush();
    assert.equal(c3.all[0].topic, 'realtime:oda:' + K1);
    await r3.room.leave();
  } finally {
    mock.timers.reset();
  }
});

test('supabase: setAlan yükü yeniden track eder; bağlanmadan önce verilen alan ilk track’te gider', async () => {
  const client = fakeClient();
  const { room } = openSupabaseRoom({ roomId: 'abcdefghij', ns: 'yavru', me: ME, getClient: async () => client });
  await flush();
  const c = client.all[0];
  room.setAlan('mutfak'); // bağlı değil: track yok
  assert.equal(c.tracked, null);
  c.cb('SUBSCRIBED');
  assert.deepEqual(c.tracked, { clientId: 'A', name: 'Ali', page: 'yavru', host: null, gorunur: true, alan: 'mutfak' });
  room.setAlan('yatak');
  assert.equal(c.tracked.alan, 'yatak');
  room.setAlan(null);
  assert.equal('alan' in c.tracked, false);
  c.state = { B: [{ clientId: 'B', name: 'Ayşe', page: 'yavru', alan: 'banyo' }] };
  c.fire('presence', 'sync');
  assert.equal(room.partner().alan, 'banyo');
  await room.leave();
});
