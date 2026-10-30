// js/core/bildirim.js ve js/core/pwa.js saf yardımcıları + bildir() isteği (sahte fetch).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  destekKarari, durumKarari, anahtarBaytlari, ayniAnahtar, aboneJson, bildirGovdesi, bildirAdresi,
  istekBasliklari, kisitla, bildir, bildirimDestegi, bildirimDurumu, bildirimAc, TURLER,
} from '../js/core/bildirim.js';
import { iosMu, kurulumKarari, kurulumDurumu, registerPwa, SW_URL, KOK_URL } from '../js/core/pwa.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, VAPID_PUBLIC_KEY } from '../js/config.js';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const IPAD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36';

test('iosMu: iPhone, iPadOS (Mac kılığında, dokunmatik), Mac ve Android', () => {
  assert.ok(iosMu(IPHONE, 5));
  assert.ok(iosMu(IPAD, 5));
  assert.ok(!iosMu(IPAD, 0));
  assert.ok(!iosMu(ANDROID, 5));
  assert.ok(!iosMu());
});

test('destekKarari', () => {
  const tam = { sw: true, push: true, bildirim: true, guvenli: true };
  assert.equal(destekKarari(tam), 'var');
  assert.equal(destekKarari({ ...tam, ios: true }), 'ana-ekran-gerek');
  assert.equal(destekKarari({ ...tam, ios: true, standalone: true }), 'var');
  assert.equal(destekKarari({ ios: true, standalone: true }), 'yok', 'eski iOS: ana ekranda da push yok');
  assert.equal(destekKarari({ ...tam, push: false }), 'yok');
  assert.equal(destekKarari({ ...tam, guvenli: false }), 'yok');
  assert.equal(destekKarari({ ...tam, native: true }), 'yok');
  assert.equal(destekKarari({ ...tam, sunucu: false, ios: true }), 'yok');
});

test('durumKarari', () => {
  assert.equal(durumKarari({ destek: 'yok', izin: 'granted', abonelik: true }), 'yok');
  assert.equal(durumKarari({ destek: 'ana-ekran-gerek', izin: 'default' }), 'yok');
  assert.equal(durumKarari({ destek: 'var', izin: 'denied', abonelik: true }), 'engelli');
  assert.equal(durumKarari({ destek: 'var', izin: 'granted', abonelik: true }), 'acik');
  assert.equal(durumKarari({ destek: 'var', izin: 'granted', abonelik: false }), 'kapali');
  assert.equal(durumKarari({ destek: 'var', izin: 'default', abonelik: false }), 'kapali');
});

test('kurulumKarari', () => {
  assert.equal(kurulumKarari({ standalone: true, istemVar: true }), 'kurulu');
  assert.equal(kurulumKarari({ kuruldu: true }), 'kurulu');
  assert.equal(kurulumKarari({ native: true }), 'kurulu');
  assert.equal(kurulumKarari({ istemVar: true }), 'kurulabilir');
  assert.equal(kurulumKarari({ ios: true }), 'ios-elle');
  assert.equal(kurulumKarari({}), 'yok');
});

test('VAPID anahtarı: config.js\'te 65 baytlık P-256 noktası; ayniAnahtar', () => {
  assert.match(VAPID_PUBLIC_KEY, /^[A-Za-z0-9_-]{87}$/);
  const b = anahtarBaytlari(VAPID_PUBLIC_KEY);
  assert.equal(b.length, 65);
  assert.equal(b[0], 4);
  assert.ok(ayniAnahtar(b.buffer, VAPID_PUBLIC_KEY));
  assert.ok(ayniAnahtar(null, VAPID_PUBLIC_KEY));
  const farkli = new Uint8Array(b);
  farkli[10] ^= 1;
  assert.ok(!ayniAnahtar(farkli.buffer, VAPID_PUBLIC_KEY));
  assert.deepEqual(anahtarBaytlari('APv_Pj8B'), new Uint8Array([0, 251, 255, 62, 63, 1]));
});

test('özel VAPID anahtarı depoda yok', () => {
  const config = readFileSync(new URL('../js/config.js', import.meta.url), 'utf8');
  assert.ok(!/PRIVATE/i.test(config));
  assert.equal((config.match(/VAPID/g) || []).length, 1);
});

test('aboneJson, bildirGovdesi, adres ve başlıklar', () => {
  const sub = { toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/x', expirationTime: null, keys: { p256dh: 'P', auth: 'A' } }) };
  assert.deepEqual(aboneJson(sub), { endpoint: 'https://fcm.googleapis.com/fcm/send/x', keys: { p256dh: 'P', auth: 'A' } });
  assert.deepEqual(bildirGovdesi('abcdefgh23', 'me', { tur: 'mesaj', baslik: 'Ömer', metin: 'x'.repeat(500), url: 'sayfalar/sohbet/' }),
    { room: 'abcdefgh23', from: 'me', tur: 'mesaj', baslik: 'Ömer', metin: 'x'.repeat(300), url: 'sayfalar/sohbet/' });
  assert.equal(bildirGovdesi('abcdefgh23', 'me', { tur: 'spam' }), null);
  assert.deepEqual(bildirGovdesi('abcdefgh23', 'me', { tur: 'gun' }), { room: 'abcdefgh23', from: 'me', tur: 'gun', baslik: '', metin: '', url: '' });
  assert.equal(bildirAdresi('https://x.supabase.co/'), 'https://x.supabase.co/functions/v1/bildir');
  assert.deepEqual(istekBasliklari('sb_publishable_a'), { 'Content-Type': 'application/json', apikey: 'sb_publishable_a' });
  assert.equal(istekBasliklari('eyJabc').Authorization, 'Bearer eyJabc');
  assert.deepEqual(TURLER, ['dokunus', 'mesaj', 'mektup', 'ani', 'gun', 'oyun', 'soru', 'liste', 'izle']);
});

test('kisitla: aynı tür 10 sn içinde bir kez', () => {
  const son = new Map();
  assert.ok(kisitla(son, 'mesaj', 1000));
  assert.ok(!kisitla(son, 'mesaj', 5000));
  assert.ok(kisitla(son, 'dokunus', 5000));
  assert.ok(kisitla(son, 'mesaj', 11000));
});

test('sw.js ve kök adresi: pwa.js\'e göre site kökü', () => {
  assert.equal(SW_URL.href, new URL('../sw.js', import.meta.url).href);
  assert.equal(KOK_URL.href, new URL('../', import.meta.url).href);
});

test('Node\'da (tarayıcı yok): destek yok, kayıt null, hata yok', async () => {
  assert.equal(bildirimDestegi(), 'yok');
  assert.equal(await bildirimDurumu(), 'yok');
  assert.equal(await bildirimAc('abcdefgh23'), false);
  assert.equal(await registerPwa(), null);
  assert.equal(kurulumDurumu().durum, 'yok');
  assert.equal(await kurulumDurumu().kur(), false);
});

test('Android uygulaması (Capacitor): kurulu, kur yok, push yok, service worker yok', async (t) => {
  const tamTarayici = {
    navigator: { userAgent: ANDROID, maxTouchPoints: 5, serviceWorker: { register: () => assert.fail('uygulamada kayıt olmamalı') } },
    isSecureContext: true, PushManager: function PushManager() {}, Notification: { permission: 'default' },
  };
  const eski = {};
  for (const k of [...Object.keys(tamTarayici), 'Capacitor']) eski[k] = Object.getOwnPropertyDescriptor(globalThis, k);
  t.after(() => {
    for (const [k, d] of Object.entries(eski)) {
      if (d) Object.defineProperty(globalThis, k, d);
      else delete globalThis[k];
    }
  });
  for (const [k, v] of Object.entries(tamTarayici)) Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
  globalThis.Capacitor = { isNativePlatform: () => true };
  assert.equal(bildirimDestegi(), 'yok');
  const k = kurulumDurumu();
  assert.equal(k.durum, 'kurulu');
  assert.equal(await k.kur(), false);
  globalThis.Capacitor = { isNativePlatform: () => false };
  assert.equal(bildirimDestegi(), 'var', 'aynı ortam tarayıcıda destekli');
});

test('bildir: Edge Function\'a doğru istek; geçersizde istek yok; hata fırlatmaz', async (t) => {
  const istekler = [];
  const asil = globalThis.fetch;
  t.after(() => { globalThis.fetch = asil; });
  globalThis.fetch = async (url, init) => {
    istekler.push({ url, init });
    return new Response('{"ok":true}', { status: 200 });
  };
  assert.ok(SUPABASE_URL && SUPABASE_ANON_KEY, 'config dolu olmalı');
  assert.equal(await bildir('abcdefgh23', { tur: 'dokunus', baslik: 'Kalp', metin: '💗', url: 'sayfalar/' }), true);
  assert.equal(istekler.length, 1);
  assert.equal(istekler[0].url, bildirAdresi(SUPABASE_URL));
  assert.equal(istekler[0].init.method, 'POST');
  assert.equal(istekler[0].init.headers.apikey, SUPABASE_ANON_KEY);
  assert.equal(istekler[0].init.keepalive, true);
  const govde = JSON.parse(istekler[0].init.body);
  assert.equal(govde.room, 'abcdefgh23');
  assert.equal(govde.tur, 'dokunus');
  assert.match(govde.from, /^[A-Za-z0-9_-]{1,64}$/);

  assert.equal(await bildir('abcdefgh23', { tur: 'dokunus' }), false, '10 sn kısıtı');
  assert.equal(await bildir('KOTU', { tur: 'mesaj' }), false);
  assert.equal(await bildir('abcdefgh23', { tur: 'yok' }), false);
  assert.equal(istekler.length, 1);

  globalThis.fetch = async () => { throw new Error('ağ yok'); };
  assert.equal(await bildir('abcdefgh23', { tur: 'mesaj' }), false);
  globalThis.fetch = async () => new Response('', { status: 429 });
  assert.equal(await bildir('abcdefgh23', { tur: 'ani' }), false);
});
