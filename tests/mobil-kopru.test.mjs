import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  isNative, titret, titresimAdimlari, hatirlaticiId, bildirimListesi, yerelHatirlaticilar,
  renkHex, cubukStili, mobilBaslat, paylas,
} from '../js/core/mobil.js';

const SIMDI = Date.parse('2026-10-30T12:00:00.000Z');
const ileri = (dk) => new Date(SIMDI + dk * 60000).toISOString();

const NAV_ASIL = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
afterEach(() => {
  delete globalThis.Capacitor;
  if (NAV_ASIL) Object.defineProperty(globalThis, 'navigator', NAV_ASIL);
  else delete globalThis.navigator;
});

/** Sahte Capacitor köprüsü: çağrıları sırayla kaydeder. */
function sahteKopru({ izin = 'granted', izinSonra = 'granted', bekleyen = [] } = {}) {
  const kayit = [];
  const ln = {
    checkPermissions: async () => { kayit.push(['check']); return { display: izin }; },
    requestPermissions: async () => { kayit.push(['request']); return { display: izinSonra }; },
    getPending: async () => { kayit.push(['pending']); return { notifications: bekleyen }; },
    cancel: async (o) => { kayit.push(['cancel', o]); },
    schedule: async (o) => { kayit.push(['schedule', o]); return { notifications: o.notifications.map((n) => ({ id: n.id })) }; },
  };
  const haptics = { vibrate: async (o) => { kayit.push(['vibrate', o.duration]); } };
  globalThis.Capacitor = { isNativePlatform: () => true, Plugins: { LocalNotifications: ln, Haptics: haptics } };
  return kayit;
}

test('isNative: köprü yoksa ya da web platformuysa false', () => {
  assert.equal(isNative(), false);
  globalThis.Capacitor = { isNativePlatform: () => false };
  assert.equal(isNative(), false);
  globalThis.Capacitor = { isNativePlatform: () => true, Plugins: {} };
  assert.equal(isNative(), true);
});

test('hatirlaticiId: kararlı, pozitif 31 bit tamsayı', () => {
  assert.equal(hatirlaticiId('a'), 1678518572); // FNV-1a 32 ('a') = 0xe40c292c, işaret biti atılır
  const uuid = '3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c';
  assert.equal(hatirlaticiId(uuid), hatirlaticiId(uuid));
  assert.equal(hatirlaticiId(42), hatirlaticiId('42'));
  for (const s of ['', 'x', uuid, 'gun-2026-02-14-7', 'ğüşıöç İ']) {
    const id = hatirlaticiId(s);
    assert.ok(Number.isInteger(id) && id >= 1 && id <= 0x7fffffff, `${s} -> ${id}`);
  }
  assert.notEqual(hatirlaticiId('gun-1'), hatirlaticiId('gun-2'));
  // Grup kimliğe girer: aynı olay kimliği iki grupta farklı bildirim kimliği alır.
  assert.equal(hatirlaticiId('a', 'gunler'), hatirlaticiId('gunler:a'));
  assert.notEqual(hatirlaticiId('ac', 'yavru'), hatirlaticiId('ac', 'gunler'));
  assert.equal(hatirlaticiId('a', null), hatirlaticiId('a'));
});

test('bildirimListesi: geçmişi, geçersizi ve kimliksizi atar; sıralar; Capacitor biçimi', () => {
  const liste = bildirimListesi([
    { id: 'b', baslik: 'Yıldönümü', metin: 'Yarın 1. yılımız', zaman: ileri(120) },
    { id: 'a', baslik: ' Doğum günü ', metin: 'Bugün!', zaman: ileri(5) },
    { id: 'gecmis', baslik: 'Eski', zaman: ileri(-1) },
    { id: 'tam-simdi', baslik: 'Şimdi', zaman: ileri(0) },
    { id: 'bozuk', baslik: 'Bozuk', zaman: 'yarın' },
    { id: 'zamansiz', baslik: 'Zamansız' },
    { baslik: 'Kimliksiz', zaman: ileri(10) },
    { id: '  ', baslik: 'Boş kimlik', zaman: ileri(10) },
    null, 'metin', 7,
  ], SIMDI);
  assert.deepEqual(liste.map((n) => n.extra.kaynak), ['a', 'b']);
  assert.deepEqual(liste[0], {
    id: hatirlaticiId('a', 'gunler'),
    title: 'Doğum günü',
    body: 'Bugün!',
    schedule: { at: ileri(5), allowWhileIdle: true },
    isExactNotification: false,
    extra: { kaynak: 'a', grup: 'gunler' },
  });
  // Android eklentisi "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'" (UTC) bekler.
  assert.match(liste[1].schedule.at, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
});

test('bildirimListesi: aynı kimlikten ilk geçerli olan; başlıksız olana uygulama adı', () => {
  const liste = bildirimListesi([
    { id: 'x', baslik: 'Geçmiş kopya', zaman: ileri(-5) },
    { id: 'x', baslik: 'İlk geçerli', zaman: ileri(30) },
    { id: 'x', baslik: 'İkinci', zaman: ileri(10) },
    { id: 'y', zaman: new Date(SIMDI + 60000) },
  ], SIMDI);
  assert.deepEqual(liste.map((n) => [n.extra.kaynak, n.title, n.body]), [['y', 'Biz İkimiz', ''], ['x', 'İlk geçerli', '']]);
});

test('bildirimListesi: en çok 64, en yakınlar kalır; giriş dizi değilse boş', () => {
  const olaylar = Array.from({ length: 80 }, (_, i) => ({ id: `g${i}`, baslik: 'G', zaman: ileri(80 - i) }));
  const liste = bildirimListesi(olaylar, SIMDI);
  assert.equal(liste.length, 64);
  assert.equal(liste[0].extra.kaynak, 'g79');
  assert.equal(liste[63].extra.kaynak, 'g16');
  assert.equal(new Set(liste.map((n) => n.id)).size, 64);
  assert.deepEqual(bildirimListesi(undefined, SIMDI), []);
  assert.deepEqual(bildirimListesi({ id: 'a' }, SIMDI), []);
});

test('bildirimListesi: kimlik çakışırsa ikincisi sonraki sayıyı alır (sıradan bağımsız)', () => {
  assert.equal(hatirlaticiId('g35158', 'gunler'), hatirlaticiId('g530826', 'gunler')); // bilinen FNV çakışması
  const h = hatirlaticiId('g35158', 'gunler');
  const olay = (id) => ({ id, baslik: id, zaman: ileri(id === 'g35158' ? 1 : 2) });
  const a = bildirimListesi([olay('g35158'), olay('g530826')], SIMDI);
  const b = bildirimListesi([olay('g530826'), olay('g35158')], SIMDI, { grup: 'gunler' });
  assert.deepEqual(a.map((n) => n.id), [h, h + 1]);
  assert.deepEqual(b, a);
});

test('bildirimListesi: grup kimliğe ve extra alanına girer; başka grubun dolu kimliği atlanır', () => {
  const ac = { id: 'ac', baslik: 'Yavrumuz', metin: 'Yavrunuz acıktı 🍼', zaman: ileri(30) };
  const [n] = bildirimListesi([ac], SIMDI, { grup: 'yavru' });
  assert.equal(n.id, hatirlaticiId('ac', 'yavru'));
  assert.deepEqual(n.extra, { kaynak: 'ac', grup: 'yavru' });
  const [m] = bildirimListesi([ac], SIMDI, { grup: 'yavru', dolu: [n.id, n.id + 1] });
  assert.equal(m.id, n.id + 2, 'Özel Günler hatırlatıcısının kimliği ezilmez');
});

test('titresimAdimlari: sayı, desen, sınırlar', () => {
  assert.deepEqual(titresimAdimlari(), [{ sure: 200, bekle: 0 }]);
  assert.deepEqual(titresimAdimlari(30), [{ sure: 30, bekle: 0 }]);
  assert.deepEqual(titresimAdimlari([100, 50, 200]), [{ sure: 100, bekle: 50 }, { sure: 200, bekle: 0 }]);
  assert.deepEqual(titresimAdimlari([100, 50, 0, 70, 80]), [{ sure: 100, bekle: 120 }, { sure: 80, bekle: 0 }]);
  assert.deepEqual(titresimAdimlari([5000, -3, 'x']), [{ sure: 1000, bekle: 0 }]);
  assert.deepEqual(titresimAdimlari(0), []);
  assert.deepEqual(titresimAdimlari([]), []);
  assert.equal(titresimAdimlari(Array(40).fill(10)).length, 10);
});

test('titret: tarayıcıda navigator.vibrate, uygulamada Haptics sırayla', (t) => {
  const eski = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const verilen = [];
  Object.defineProperty(globalThis, 'navigator', { value: { vibrate: (d) => verilen.push(d) }, configurable: true });
  try {
    titret([50, 30, 50]);
    assert.deepEqual(verilen, [[50, 30, 50]]);
  } finally {
    if (eski) Object.defineProperty(globalThis, 'navigator', eski);
  }

  t.mock.timers.enable({ apis: ['setTimeout'] });
  const kayit = sahteKopru();
  titret([100, 50, 200]);
  assert.deepEqual(kayit, [['vibrate', 100]]);
  t.mock.timers.tick(149);
  assert.equal(kayit.length, 1);
  t.mock.timers.tick(1);
  assert.deepEqual(kayit, [['vibrate', 100], ['vibrate', 200]]);
});

test('yerelHatirlaticilar: web\'de hiçbir şey yapmaz', async () => {
  assert.equal(await yerelHatirlaticilar([{ id: 'a', baslik: 'A', zaman: ileri(10) }]), 0);
});

test('yerelHatirlaticilar: önce eskileri iptal eder, izin ister, yenileri planlar', async () => {
  const zaman = new Date(Date.now() + 3600000).toISOString();
  const kayit = sahteKopru({ izin: 'prompt', izinSonra: 'granted', bekleyen: [{ id: 5 }, { id: 9 }] });
  const n = await yerelHatirlaticilar([{ id: 'gun1', baslik: 'Yarın yıldönümü', metin: 'Hazır mısın?', zaman }]);
  assert.equal(n, 1);
  assert.deepEqual(kayit.map((k) => k[0]), ['pending', 'cancel', 'check', 'request', 'schedule']);
  assert.deepEqual(kayit[1][1], { notifications: [{ id: 5 }, { id: 9 }] });
  const [bildirim] = kayit[4][1].notifications;
  assert.equal(bildirim.id, hatirlaticiId('gun1', 'gunler'));
  assert.equal(bildirim.extra.grup, 'gunler', 'grup verilmezse Özel Günler');
  assert.equal(bildirim.title, 'Yarın yıldönümü');
  assert.equal(bildirim.schedule.at, zaman);
});

test('yerelHatirlaticilar: izin yoksa planlamaz; boş listede izin sormaz', async () => {
  const zaman = new Date(Date.now() + 3600000).toISOString();
  let kayit = sahteKopru({ izin: 'denied', bekleyen: [{ id: 1 }] });
  assert.equal(await yerelHatirlaticilar([{ id: 'a', baslik: 'A', zaman }]), 0);
  assert.deepEqual(kayit.map((k) => k[0]), ['pending', 'cancel', 'check']);

  kayit = sahteKopru({ izin: 'prompt', izinSonra: 'denied' });
  assert.equal(await yerelHatirlaticilar([{ id: 'a', baslik: 'A', zaman }]), 0);
  assert.deepEqual(kayit.map((k) => k[0]), ['pending', 'check', 'request']);

  kayit = sahteKopru({ bekleyen: [{ id: 3 }] });
  assert.equal(await yerelHatirlaticilar([]), 0);
  assert.deepEqual(kayit.map((k) => k[0]), ['pending', 'cancel']);
});

test('yerelHatirlaticilar: eklenti hatası fırlamaz; çağrılar sırayla işlenir', async (t) => {
  const uyari = t.mock.method(console, 'warn', () => {});
  const zaman = new Date(Date.now() + 3600000).toISOString();
  const kayit = sahteKopru();
  const ln = globalThis.Capacitor.Plugins.LocalNotifications;
  const asilSchedule = ln.schedule;
  let ilk = true;
  ln.schedule = async (o) => {
    if (ilk) { ilk = false; await new Promise((r) => setTimeout(r, 20)); throw new Error('kapalı'); }
    return asilSchedule(o);
  };
  const [a, b] = await Promise.all([
    yerelHatirlaticilar([{ id: 'a', baslik: 'A', zaman }]),
    yerelHatirlaticilar([{ id: 'b', baslik: 'B', zaman }]),
  ]);
  assert.equal(a, 0);
  assert.equal(b, 1);
  assert.equal(uyari.mock.callCount(), 1);
  // İkinci çağrı, birincinin planlaması bitmeden bekleyenleri okumaz.
  assert.deepEqual(kayit.map((k) => k[0]), ['pending', 'check', 'pending', 'check', 'schedule']);
});

test('yerelHatirlaticilar: grup yalnız kendi bekleyenlerini iptal eder; grupsuz eski bekleyen Özel Günler sayılır', async () => {
  const zaman = new Date(Date.now() + 3600000).toISOString();
  const bekleyen = [
    { id: 11 }, // eski sürümden: grubu yok → 'gunler'
    { id: 12, extra: { kaynak: 'g1', grup: 'gunler' } },
    { id: 13, extra: { kaynak: 'ac', grup: 'yavru' } },
  ];
  let kayit = sahteKopru({ bekleyen });
  assert.equal(await yerelHatirlaticilar([{ id: 'ac', baslik: 'Yavrumuz', zaman }], { grup: 'yavru' }), 1);
  assert.deepEqual(kayit.find((k) => k[0] === 'cancel')[1], { notifications: [{ id: 13 }] });
  const [yeni] = kayit.find((k) => k[0] === 'schedule')[1].notifications;
  assert.equal(yeni.extra.grup, 'yavru');

  kayit = sahteKopru({ bekleyen });
  assert.equal(await yerelHatirlaticilar([{ id: 'g1', baslik: 'Yarın', zaman }], { grup: 'gunler' }), 1);
  assert.deepEqual(kayit.find((k) => k[0] === 'cancel')[1], { notifications: [{ id: 11 }, { id: 12 }] });

  // Boş liste: yalnız o grubun bekleyenleri gider, izin sorulmaz.
  kayit = sahteKopru({ bekleyen });
  assert.equal(await yerelHatirlaticilar([], { grup: 'yavru' }), 0);
  assert.deepEqual(kayit.map((k) => k[0]), ['pending', 'cancel']);
  assert.deepEqual(kayit[1][1], { notifications: [{ id: 13 }] });

  // Başka grubun bekleyeni yoksa iptal çağrılmaz.
  kayit = sahteKopru({ bekleyen: [{ id: 11 }] });
  await yerelHatirlaticilar([], { grup: 'yavru' });
  assert.deepEqual(kayit.map((k) => k[0]), ['pending']);
});

test('yerelHatirlaticilar: yeni kimlik başka grubun bekleyen kimliğiyle çakışmaz', async () => {
  const zaman = new Date(Date.now() + 3600000).toISOString();
  const carpisan = hatirlaticiId('ac', 'yavru');
  const kayit = sahteKopru({ bekleyen: [{ id: carpisan, extra: { kaynak: 'x', grup: 'gunler' } }] });
  assert.equal(await yerelHatirlaticilar([{ id: 'ac', baslik: 'Yavrumuz', zaman }], { grup: 'yavru' }), 1);
  assert.equal(kayit.some((k) => k[0] === 'cancel'), false, 'Özel Günler hatırlatıcısı silinmez');
  const [yeni] = kayit.find((k) => k[0] === 'schedule')[1].notifications;
  assert.equal(yeni.id, carpisan + 1);
});

test('renkHex: hex ve rgb biçimleri', () => {
  assert.equal(renkHex('#FBF4EE'), '#FBF4EE');
  assert.equal(renkHex(' #fbf4ee '), '#FBF4EE');
  assert.equal(renkHex('#abc'), '#AABBCC');
  assert.equal(renkHex('#1c1120ff'), '#1C1120');
  assert.equal(renkHex('rgb(28, 17, 32)'), '#1C1120');
  assert.equal(renkHex('rgb(251 244 238 / 0.9)'), '#FBF4EE');
  assert.equal(renkHex('rgba(0, 0, 0, 0)'), null);
  assert.equal(renkHex('#00000000'), null);
  assert.equal(renkHex('transparent'), null);
  assert.equal(renkHex('#12345'), null);
  assert.equal(renkHex(''), null);
  assert.equal(renkHex(undefined), null);
});

test('cubukStili: koyu zemine açık yazı, açık zemine koyu yazı', () => {
  assert.equal(cubukStili('#FBF4EE'), 'LIGHT'); // açık tema --bg
  assert.equal(cubukStili('#1C1120'), 'DARK'); // koyu tema --bg
  assert.equal(cubukStili('#C2375C'), 'DARK');
  assert.equal(cubukStili('#FFFFFF'), 'LIGHT');
  assert.equal(cubukStili('rgb(0, 0, 0)'), 'DARK');
  assert.equal(cubukStili('yok'), 'DEFAULT');
});

test('mobilBaslat: tarayıcıda ve Node\'da hiçbir şey yapmaz', () => {
  assert.doesNotThrow(() => mobilBaslat());
});

/** navigator'ı geçici değiştirir; afterEach asıl değeri geri koyar. */
function sahteNavigator(deger) {
  Object.defineProperty(globalThis, 'navigator', { value: deger, configurable: true });
}

const METIN = "Biz İkimiz'de odamıza gel.";
const URL_ = 'https://rose-omer.github.io/bizim-oyunlar/?oda=abc';

test('paylas: tarayıcıda navigator.share; yoksa "yok"', async () => {
  sahteNavigator({});
  assert.equal(await paylas(METIN, URL_), 'yok');

  const verilen = [];
  sahteNavigator({ share: async (o) => { verilen.push(o); } });
  assert.equal(await paylas(METIN, URL_), 'shared');
  assert.deepEqual(verilen, [{ title: 'Biz İkimiz', text: METIN, url: URL_ }]);
});

test('paylas: tarayıcıda vazgeçme "cancelled", başka hata "failed"', async (t) => {
  t.mock.method(console, 'warn', () => {});
  sahteNavigator({ share: async () => { throw new DOMException('iptal', 'AbortError'); } });
  assert.equal(await paylas(METIN, URL_), 'cancelled');
  sahteNavigator({ share: async () => { throw new DOMException('izin yok', 'NotAllowedError'); } });
  assert.equal(await paylas(METIN, URL_), 'failed');
});

test('paylas: uygulamada Share eklentisi (Android WebView\'da navigator.share yok)', async () => {
  sahteNavigator({ share: async () => { throw new Error('çağrılmamalı'); } });
  const verilen = [];
  globalThis.Capacitor = { isNativePlatform: () => true, Plugins: { Share: { share: async (o) => { verilen.push(o); return { activityType: 'com.whatsapp' }; } } } };
  assert.equal(await paylas(METIN, URL_), 'shared');
  assert.deepEqual(verilen, [{ title: 'Biz İkimiz', text: METIN, url: URL_, dialogTitle: 'Paylaş' }]);
});

test('paylas: uygulamada menüyü kapatma "cancelled", eklenti hatası "failed"', async (t) => {
  const uyari = t.mock.method(console, 'warn', () => {});
  sahteNavigator({});
  globalThis.Capacitor = { isNativePlatform: () => true, Plugins: { Share: { share: async () => { throw new Error('Share canceled'); } } } };
  assert.equal(await paylas(METIN, URL_), 'cancelled');
  globalThis.Capacitor.Plugins.Share.share = async () => { throw new Error("Can't share while sharing is in progress"); };
  assert.equal(await paylas(METIN, URL_), 'failed');
  assert.equal(uyari.mock.callCount(), 1);
  // Eski APK'da eklenti yok: tarayıcı yoluna düşer.
  globalThis.Capacitor = { isNativePlatform: () => true, Plugins: {} };
  assert.equal(await paylas(METIN, URL_), 'yok');
});

test('disariAc: uygulamada Browser eklentisi, yoksa paylaşım; tarayıcıda aynı sekme', async () => {
  const { disariAc } = await import('../js/core/mobil.js');
  const eski = globalThis.Capacitor;
  try {
    let acilan = null;
    globalThis.Capacitor = { isNativePlatform: () => true, Plugins: { Browser: { open: async ({ url }) => { acilan = url; } } } };
    assert.equal(await disariAc('https://ornek.test/a.apk'), 'browser');
    assert.equal(acilan, 'https://ornek.test/a.apk');
    let paylasilan = null;
    globalThis.Capacitor = { isNativePlatform: () => true, Plugins: { Share: { share: async (o) => { paylasilan = o.url; return {}; } } } };
    assert.equal(await disariAc('https://ornek.test/b.apk'), 'paylas');
    assert.equal(paylasilan, 'https://ornek.test/b.apk');
    globalThis.Capacitor = undefined;
    let gidilen = null;
    assert.equal(await disariAc('https://ornek.test/c.apk', { git: (u) => { gidilen = u; } }), 'sayfa');
    assert.equal(gidilen, 'https://ornek.test/c.apk');
  } finally {
    globalThis.Capacitor = eski;
  }
});
