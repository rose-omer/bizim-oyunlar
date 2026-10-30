// Android uygulamasında FCM (js/core/mobil.js) ve bildirim.js'in uygulama yolu; sahte Capacitor köprüsüyle.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  fcmVar, fcmAc, fcmKapat, fcmBaslat, fcmKayit, fcmIzin, fcmHedef, FCM_KANAL, FCM_TOKEN_RE,
} from '../js/core/mobil.js';
import { SITE_ROOT, me } from '../js/core/identity.js';
import { kimlik } from '../js/core/uyelik.js';
import { bildirimDestegi, bildirimDurumu, bildirimAc } from '../js/core/bildirim.js';

const ODA = 'abcdefgh23';
const TOKEN = `dQw4w9WgXcQ:APA91b${'H'.repeat(140)}`;
const TOKEN2 = `eRt5y6:APA91b${'K'.repeat(140)}`;

afterEach(() => {
  delete globalThis.Capacitor;
  delete globalThis.dispatchEvent;
});

/** Sahte PushNotifications eklentisi: çağrıları kaydeder; register() belirteci olay olarak yollar. */
function sahteFcm({ izin = 'granted', izinSonra = 'granted', token = TOKEN, hata = null, kanalHata = false } = {}) {
  const kayit = [];
  const dinleyici = {};
  const yay = (olay, veri) => (dinleyici[olay] || []).forEach((f) => f(veri));
  const p = {
    addListener: (olay, f) => {
      (dinleyici[olay] ||= []).push(f);
      return { remove: async () => {} };
    },
    checkPermissions: async () => { kayit.push(['check']); return { receive: izin }; },
    requestPermissions: async () => { kayit.push(['request']); return { receive: izinSonra }; },
    createChannel: async (o) => {
      kayit.push(['kanal', o]);
      if (kanalHata) throw new Error('not available');
    },
    register: async () => {
      kayit.push(['register']);
      setTimeout(() => (hata ? yay('registrationError', { error: hata }) : token && yay('registration', { value: token })), 1);
    },
    unregister: async () => { kayit.push(['unregister']); },
  };
  globalThis.Capacitor = { isNativePlatform: () => true, Plugins: { PushNotifications: p } };
  return { kayit, yay, dinleyici };
}

function sahteDepo() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
}

function sahteRpc({ hata = null } = {}) {
  const cagri = [];
  const rpc = async (ad, args) => {
    cagri.push([ad, args]);
    if (hata) throw new Error(hata);
    return true;
  };
  return { rpc, cagri };
}

const bekle = (ms = 5) => new Promise((r) => setTimeout(r, ms));

test('fcmVar: web\'de, eski APK\'da ve FCM\'siz derlemede false', () => {
  assert.equal(fcmVar(), false);
  globalThis.Capacitor = { isNativePlatform: () => true, Plugins: {} };
  assert.equal(fcmVar(), false);
  sahteFcm();
  assert.equal(fcmVar(), true);
  globalThis.Capacitor.isNativePlatform = () => false;
  assert.equal(fcmVar(), false);
});

test('FCM_TOKEN_RE: gerçek biçim; boşluk, eğik çizgi ve kısa değer yok', () => {
  assert.ok(FCM_TOKEN_RE.test(TOKEN));
  for (const kotu of ['', 'kisa:APA91b', `${TOKEN} `, `${TOKEN}/x`, 'a'.repeat(4097)]) assert.ok(!FCM_TOKEN_RE.test(kotu), kotu);
});

test('fcmAc: izin sorar, kanal kurar, belirteci fcm_kaydet ile kaydeder', async () => {
  const { kayit } = sahteFcm({ izin: 'prompt' });
  const { rpc, cagri } = sahteRpc();
  const depo = sahteDepo();
  assert.equal(await fcmAc(ODA, { rpc, depo }), true);
  assert.deepEqual(kayit.map((k) => k[0]), ['check', 'request', 'kanal', 'register']);
  assert.deepEqual(kayit[2][1], {
    id: FCM_KANAL, name: 'Anlık bildirimler', description: 'Sevgilinin mesajları, dokunuşları ve hatırlatmalar',
    importance: 4, vibration: true,
  });
  // Cihaz anahtarı (js/core/uyelik.js kimlik) gider: koruma altındaki odada sunucu onu doğrular.
  const { p_anahtar } = kimlik(ODA);
  assert.match(p_anahtar, /^[A-Za-z0-9_-]{43}$/);
  assert.deepEqual(cagri, [['fcm_kaydet', { p_room: ODA, p_client: me().clientId, p_token: TOKEN, p_anahtar }]]);
  assert.deepEqual(fcmKayit(depo), { room: ODA, token: TOKEN });
});

test('fcmAc: kimlik yoksa (eski sunucu, yerel mod) p_anahtar gönderilmez', async () => {
  sahteFcm();
  const { rpc, cagri } = sahteRpc();
  assert.equal(await fcmAc(ODA, { rpc, depo: sahteDepo(), kimlikAl: () => ({}) }), true);
  assert.deepEqual(cagri, [['fcm_kaydet', { p_room: ODA, p_client: me().clientId, p_token: TOKEN }]]);
});

test('fcmAc: izin verilmezse belirteç istenmez', async () => {
  for (const [izin, izinSonra, beklenen] of [['denied', 'denied', ['check']], ['prompt-with-rationale', 'denied', ['check', 'request']]]) {
    const { kayit } = sahteFcm({ izin, izinSonra });
    const { rpc, cagri } = sahteRpc();
    assert.equal(await fcmAc(ODA, { rpc, depo: sahteDepo() }), false);
    assert.deepEqual(kayit.map((k) => k[0]), beklenen);
    assert.equal(cagri.length, 0);
  }
});

test('fcmAc: kayıt hatası, belirteç gelmemesi ya da sunucu hatası → false, kayıt yazılmaz', async (t) => {
  t.mock.method(console, 'warn', () => {});
  sahteFcm({ hata: 'SERVICE_NOT_AVAILABLE' });
  let r = sahteRpc();
  let depo = sahteDepo();
  assert.equal(await fcmAc(ODA, { rpc: r.rpc, depo }), false);
  assert.equal(r.cagri.length, 0);

  sahteFcm({ token: null });
  assert.equal(await fcmAc(ODA, { rpc: r.rpc, depo, bekleMs: 30 }), false);

  sahteFcm({ token: 'bozuk belirtec' });
  assert.equal(await fcmAc(ODA, { rpc: r.rpc, depo }), false);
  assert.equal(r.cagri.length, 0);

  sahteFcm();
  r = sahteRpc({ hata: 'fcm_kaydet: cok fazla kayit' });
  depo = sahteDepo();
  assert.equal(await fcmAc(ODA, { rpc: r.rpc, depo }), false);
  assert.equal(r.cagri.length, 1);
  assert.equal(fcmKayit(depo), null);
});

test('fcmAc: Android 7\'de kanal yok (createChannel reddeder) yine açılır', async () => {
  sahteFcm({ kanalHata: true });
  const { rpc } = sahteRpc();
  assert.equal(await fcmAc(ODA, { rpc, depo: sahteDepo() }), true);
});

test('belirteç yenilenince: açıksa yeniden kaydedilir; kapalıysa ya da aynıysa dokunulmaz', async () => {
  const { yay } = sahteFcm();
  const { rpc, cagri } = sahteRpc();
  const depo = sahteDepo();
  fcmBaslat({ rpc, depo });
  yay('registration', { value: TOKEN2 });
  await bekle();
  assert.equal(cagri.length, 0, 'kapalıyken kaydetmez');

  assert.equal(await fcmAc(ODA, { rpc, depo }), true);
  yay('registration', { value: TOKEN });
  await bekle();
  assert.equal(cagri.length, 1, 'aynı belirteç');
  yay('registration', { value: TOKEN2 });
  await bekle();
  assert.deepEqual(cagri[1], ['fcm_kaydet', { p_room: ODA, p_client: me().clientId, p_token: TOKEN2, p_anahtar: kimlik(ODA).p_anahtar }]);
  assert.deepEqual(fcmKayit(depo), { room: ODA, token: TOKEN2 });
});

test('fcmKapat: unregister, fcm_sil, yerel kayıt silinir; sunucu hatası yutulur', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const { kayit } = sahteFcm();
  const depo = sahteDepo();
  const acik = sahteRpc();
  await fcmAc(ODA, { rpc: acik.rpc, depo });
  const { rpc, cagri } = sahteRpc({ hata: 'ağ yok' });
  assert.equal(await fcmKapat(ODA, { rpc, depo }), true);
  assert.equal(kayit.at(-1)[0], 'unregister');
  assert.deepEqual(cagri, [['fcm_sil', { p_token: TOKEN }]]);
  assert.equal(fcmKayit(depo), null);
  // Kayıt yoksa sunucuya gidilmez; eklenti yoksa hiçbir şey yapılmaz.
  assert.equal(await fcmKapat(ODA, { rpc, depo }), true);
  assert.equal(cagri.length, 1);
  globalThis.Capacitor = { isNativePlatform: () => true, Plugins: {} };
  assert.equal(await fcmKapat(ODA, { rpc, depo }), true);
});

test('fcmHedef: yalnız site içi adres', () => {
  assert.equal(fcmHedef('sayfalar/sohbet/', 'https://x.github.io/bizim/'), 'https://x.github.io/bizim/sayfalar/sohbet/');
  assert.equal(fcmHedef('sayfalar/mektup/?id=a#son', SITE_ROOT), `${SITE_ROOT}sayfalar/mektup/?id=a#son`);
  for (const kotu of ['', '  ', null, 42, 'https://kotu.com/', '//kotu.com/x', '../x', 'javascript:alert(1)']) {
    assert.equal(fcmHedef(kotu, 'https://x.github.io/bizim/'), null, String(kotu));
  }
});

test('bildirime dokununca data.url açılır; uygulama açıkken gelen bildirim bizim:bildirim olayı olur', () => {
  const { yay } = sahteFcm();
  const gidilen = [];
  const olaylar = [];
  globalThis.dispatchEvent = (e) => olaylar.push(e);
  fcmBaslat({ rpc: sahteRpc().rpc, depo: sahteDepo(), git: (u) => gidilen.push(u) });
  fcmBaslat({ git: () => assert.fail('dinleyiciler bir kez kurulmalı') });

  yay('pushNotificationActionPerformed', { actionId: 'tap', notification: { data: { url: 'sayfalar/sohbet/', tur: 'mesaj' } } });
  yay('pushNotificationActionPerformed', { notification: { data: { url: 'https://kotu.com/' } } });
  yay('pushNotificationActionPerformed', { notification: { data: {} } });
  assert.deepEqual(gidilen, [`${SITE_ROOT}sayfalar/sohbet/`]);

  yay('pushNotificationReceived', { title: 'Ömer', body: 'Selam 💗', data: { url: 'sayfalar/sohbet/', tur: 'mesaj' } });
  assert.equal(olaylar.length, 1);
  assert.equal(olaylar[0].type, 'bizim:bildirim');
  assert.deepEqual(olaylar[0].detail, { tur: 'mesaj', baslik: 'Ömer', metin: 'Selam 💗', url: `${SITE_ROOT}sayfalar/sohbet/` });
});

test('bildirim.js uygulamada: FCM eklentisi varsa destek var; durum izin + kayıttan', async (t) => {
  t.mock.method(console, 'warn', () => {});
  globalThis.Capacitor = { isNativePlatform: () => true, Plugins: {} };
  assert.equal(bildirimDestegi(), 'yok', 'eski APK');
  assert.equal(await bildirimDurumu(), 'yok');

  sahteFcm({ izin: 'denied' });
  assert.equal(bildirimDestegi(), 'var');
  assert.equal(await fcmIzin(), 'denied');
  assert.equal(await bildirimDurumu(), 'engelli');
  assert.equal(await bildirimAc(ODA), false, 'izin yoksa açılmaz');
  assert.equal(await bildirimAc('KOTU'), false);

  sahteFcm({ izin: 'prompt' });
  assert.equal(await bildirimDurumu(), 'kapali', 'kayıtlı belirteç yok');
});
