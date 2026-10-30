// Ayarlar → Mesafe: konum izni reddedilince yol gösterme (saf mantık).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { konumHataTuru, konumPlatformu, konumRehberi, KONUM_SECENEK, GUVENLI_ADRES } from '../sayfalar/ayarlar/mantik.js';

const UA = {
  android: 'Mozilla/5.0 (Linux; Android 14; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  ipad: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0',
};

test('konumHataTuru: 1 izin, 2 servis kapalı, 3 zaman aşımı', () => {
  assert.equal(konumHataTuru({ code: 1 }), 'izin');
  assert.equal(konumHataTuru({ code: 2 }), 'kapali');
  assert.equal(konumHataTuru({ code: 3 }), 'zaman');
  assert.equal(konumHataTuru(new Error('x')), 'diger');
  assert.equal(konumHataTuru(null), 'diger');
});

test('konumPlatformu: Android uygulaması önce; iPhone, iPadOS, Android, masaüstü', () => {
  assert.equal(konumPlatformu({ native: true, ua: UA.android }), 'uygulama');
  assert.equal(konumPlatformu({ ua: UA.android }), 'android');
  assert.equal(konumPlatformu({ ua: UA.iphone }), 'ios');
  assert.equal(konumPlatformu({ ua: UA.ipad, dokunmatik: 5 }), 'ios');
  assert.equal(konumPlatformu({ ua: UA.ipad, dokunmatik: 0 }), 'masaustu');
  assert.equal(konumPlatformu({ ua: UA.windows }), 'masaustu');
  assert.equal(konumPlatformu(), 'masaustu');
});

test('konumRehberi izin: Android uygulamasında telefon ayarları yolu', () => {
  const r = konumRehberi('izin', { platform: 'uygulama' });
  assert.equal(r.tur, 'izin');
  assert.equal(r.baslik, 'Konum izni kapalı');
  const yol = r.adimlar.join(' ');
  for (const parca of ['Ayarlar', 'Uygulamalar', 'Biz İkimiz', 'İzinler', 'Konum', 'kullanırken izin ver']) {
    assert.ok(yol.includes(parca), parca);
  }
});

test('konumRehberi izin: Android Chrome kilit → İzinler → Konum; iPhone Safari Web Siteleri', () => {
  const a = konumRehberi('izin', { platform: 'android' });
  assert.match(a.adimlar.join(' '), /kilit/);
  assert.match(a.adimlar.join(' '), /İzinler → Konum/);
  assert.ok(a.not);
  const i = konumRehberi('izin', { platform: 'ios' });
  const yol = i.adimlar.join(' ');
  for (const parca of ['Gizlilik ve Güvenlik', 'Konum Servisleri', 'Safari Web Siteleri', 'Uygulama Kullanılırken']) {
    assert.ok(yol.includes(parca), parca);
  }
  assert.match(i.not, /ana ekran/i);
  const m = konumRehberi('izin', { platform: 'masaustu' });
  assert.ok(m.adimlar.length >= 1);
  assert.deepEqual(konumRehberi('izin', { platform: 'bilinmeyen' }).adimlar, m.adimlar);
});

test('konumRehberi: servis kapalı ve zaman aşımı ayrı mesaj', () => {
  const k = konumRehberi('kapali', { platform: 'android' });
  assert.equal(k.baslik, 'Konum servisleri kapalı');
  assert.ok(k.adimlar.length === 1);
  const z = konumRehberi('zaman', { platform: 'ios' });
  assert.equal(z.baslik, 'Konum zamanında gelmedi');
  assert.deepEqual(z.adimlar, []);
  assert.notEqual(k.metin, z.metin);
  assert.equal(konumRehberi('diger').baslik, 'Konum alınamadı');
});

test('konumRehberi: http:// adreste güvenli adres notu her şeyden önce', () => {
  for (const tur of ['izin', 'kapali', 'zaman', 'diger']) {
    const r = konumRehberi(tur, { platform: 'android', guvenli: false });
    assert.equal(r.tur, 'guvensiz');
    assert.equal(r.metin, `Konum yalnız güvenli adreste çalışır: ${GUVENLI_ADRES}`);
  }
});

test('KONUM_SECENEK: düşük doğruluk, 15 sn zaman aşımı, 10 dk önbellek', () => {
  assert.deepEqual(KONUM_SECENEK, { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 });
});
