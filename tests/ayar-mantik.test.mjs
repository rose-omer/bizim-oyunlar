import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TEMA_RENKLER, TEMA_MODLAR } from '../js/core/ui.js';
import {
  K_TEMA, TEMA_RENKLERI, TEMA_MODLARI, KISI_RENKLERI, bulusmaIso, bulusmaAyir, bulusmaMetni,
  yuvarla2, konumVerisi, mesafeKm, mesafeMetni, bildirimGorunum,
  YEDEK_TURLERI, yedekVerisi, yedekSayisi, yedekDosyaAdi,
} from '../sayfalar/ayarlar/mantik.js';
import { APK_URL, dahaOgeleri, apkGoster, kurulumGorunum } from '../sayfalar/daha/mantik.js';
import { SAYFALAR } from '../js/core/games.js';

test('tema seçenekleri ui.js ile aynı kimlikleri kullanır', () => {
  assert.deepEqual(TEMA_RENKLERI.map((r) => r.id), TEMA_RENKLER);
  assert.deepEqual(TEMA_MODLARI.map((m) => m.id), TEMA_MODLAR);
  assert.equal(K_TEMA, 'bizim.tema');
  for (const r of [...TEMA_RENKLERI, ...KISI_RENKLERI]) assert.match(r.renk, /^#[0-9A-F]{6}$/i);
});

test('bulusmaIso / bulusmaAyir: yerel saat gidiş-dönüş', () => {
  const iso = bulusmaIso('2026-11-14', '19:30');
  assert.ok(iso.endsWith('Z'));
  assert.deepEqual(bulusmaAyir(iso), { tarih: '2026-11-14', saat: '19:30' });
  assert.deepEqual(bulusmaAyir(bulusmaIso('2026-11-14', '')), { tarih: '2026-11-14', saat: '20:00' });
  assert.equal(bulusmaIso('', '19:30'), null);
  assert.equal(bulusmaIso('2026-02-30', '10:00'), null);
  assert.equal(bulusmaIso('2026-11-14', '25:00'), null);
  assert.deepEqual(bulusmaAyir(null), { tarih: '', saat: '' });
  assert.deepEqual(bulusmaAyir('bozuk'), { tarih: '', saat: '' });
});

test('bulusmaMetni: kalan süre ve geçmiş', () => {
  const simdi = new Date('2026-10-30T10:00:00Z');
  assert.equal(bulusmaMetni('2026-11-02T13:00:00Z', simdi), '3 gün 3 saat kaldı');
  assert.equal(bulusmaMetni('2026-10-30T12:15:00Z', simdi), '2 saat 15 dakika kaldı');
  assert.equal(bulusmaMetni('2026-10-30T10:00:20Z', simdi), '1 dakika kaldı');
  assert.match(bulusmaMetni('2026-10-29T10:00:00Z', simdi), /geçti/);
  assert.equal(bulusmaMetni(null, simdi), '');
});

test('konum: 2 ondalık, geçersiz koordinat reddedilir', () => {
  assert.equal(yuvarla2(41.00823), 41.01);
  assert.equal(yuvarla2(-28.97849), -28.98);
  const v = konumVerisi({ latitude: 41.00823, longitude: 28.97836 }, new Date('2026-10-30T10:00:00Z'));
  assert.deepEqual(v, { lat: 41.01, lng: 28.98, at: '2026-10-30T10:00:00.000Z' });
  assert.equal(konumVerisi({ latitude: 91, longitude: 0 }), null);
  assert.equal(konumVerisi({ latitude: NaN, longitude: 0 }), null);
  assert.equal(konumVerisi(null), null);
});

test('mesafeKm ve mesafeMetni', () => {
  const ist = { lat: 41.01, lng: 28.98 };
  const ank = { lat: 39.93, lng: 32.86 };
  const km = mesafeKm(ist, ank);
  assert.ok(km > 345 && km < 355, String(km));
  assert.equal(mesafeKm(ist, ist), 0);
  assert.equal(mesafeKm(ist, { lat: 'x' }), null);
  assert.equal(mesafeMetni(0.4), 'Yan yanasınız');
  assert.equal(mesafeMetni(3.44), 'Aranızda yaklaşık 3,4 km var');
  assert.equal(mesafeMetni(1234.4), 'Aranızda yaklaşık 1.234 km var');
  assert.equal(mesafeMetni(null), '');
});

test('bildirimGorunum: her durum', () => {
  assert.equal(bildirimGorunum('yok', 'acik'), 'yok');
  assert.equal(bildirimGorunum('ana-ekran-gerek', 'yok'), 'ana-ekran-gerek');
  assert.equal(bildirimGorunum('var', 'acik'), 'acik');
  assert.equal(bildirimGorunum('var', 'kapali'), 'kapali');
  assert.equal(bildirimGorunum('var', 'engelli'), 'engelli');
  assert.equal(bildirimGorunum('var', 'yok'), 'yok');
  assert.equal(bildirimGorunum(undefined, undefined), 'yok');
});

test('yedekVerisi: silinenler çıkar, eksik türler not edilir, oda kodu yazılmaz', () => {
  const doc = (id, extra = {}) => ({ id, data: { a: id }, author: 'c1', deleted: false, created_at: 'x', updated_at: 'y', ...extra });
  const y = yedekVerisi({
    sonuclar: { kisi: [doc('k1'), doc('k2', { deleted: true })], mesaj: [doc('m1')], bilinmeyen: [doc('z')] },
    hatalar: { ani: 'ağ hatası' },
    simdi: new Date('2026-10-30T10:00:00Z'),
  });
  assert.equal(y.uygulama, 'Biz İkimiz');
  assert.equal(y.alindi, '2026-10-30T10:00:00.000Z');
  assert.deepEqual(Object.keys(y.turler), ['kisi', 'mesaj']);
  assert.deepEqual(y.turler.kisi, [{ id: 'k1', data: { a: 'k1' }, author: 'c1', created_at: 'x', updated_at: 'y' }]);
  assert.deepEqual(y.eksik, ['ani']);
  assert.equal(yedekSayisi(y), 2);
  assert.ok(!JSON.stringify(y).includes('roomId'));
  assert.equal(YEDEK_TURLERI.length, 17);
});

test('yedekDosyaAdi', () => {
  assert.equal(yedekDosyaAdi(new Date(2026, 0, 5, 12)), 'biz-ikimiz-yedek-2026-01-05.json');
});

test('dahaOgeleri: biz ve daha hariç tüm sayfalar, sıra korunur', () => {
  const ids = dahaOgeleri(SAYFALAR).map((s) => s.id);
  assert.ok(!ids.includes('biz') && !ids.includes('daha'));
  assert.equal(ids.length, SAYFALAR.length - 2);
  assert.ok(ids.includes('ayarlar') && ids.includes('sohbet'));
  assert.deepEqual(dahaOgeleri(null), []);
});

test('apkGoster ve kurulumGorunum', () => {
  const android = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36';
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';
  assert.equal(apkGoster(android, false), true);
  assert.equal(apkGoster(android, true), false);
  assert.equal(apkGoster(iphone, false), false);
  assert.equal(apkGoster('', false), false);
  assert.match(APK_URL, /^https:\/\/github\.com\/rose-omer\/bizim-oyunlar\/releases\/latest\/download\/BizIkimiz\.apk$/);
  assert.equal(kurulumGorunum('kurulabilir', false), 'kurulabilir');
  assert.equal(kurulumGorunum('ios-elle', false), 'ios-elle');
  assert.equal(kurulumGorunum('kurulu', false), null);
  assert.equal(kurulumGorunum('yok', false), null);
  assert.equal(kurulumGorunum('kurulabilir', true), null);
});
