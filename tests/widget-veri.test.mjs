// Ana ekran widget'ı: web tarafı (js/core/mobil.js widgetVerisi, widgetGuncelle).
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { widgetVerisi, widgetGuncelle } from '../js/core/mobil.js';

afterEach(() => { delete globalThis.Capacitor; });

/** Sahte köprü: BizWidget.guncelle çağrılarını kaydeder. */
function sahteWidget({ hata = null } = {}) {
  const cagrilar = [];
  const BizWidget = {
    guncelle: async (o) => {
      cagrilar.push(o);
      if (hata) throw hata;
    },
  };
  globalThis.Capacitor = { isNativePlatform: () => true, Plugins: { BizWidget } };
  return cagrilar;
}

test('widgetVerisi: geçerli alanlar; buluşma epoch ms; adlar " & " ile', () => {
  assert.deepEqual(
    widgetVerisi({ baslangic: '2024-02-14', bulusma: '2026-11-03T18:00:00.000Z', adlar: ['Ömer', 'Gül'] }),
    { v: 1, baslangic: '2024-02-14', bulusma: Date.parse('2026-11-03T18:00:00.000Z'), adlar: 'Ömer & Gül' },
  );
});

test('widgetVerisi: geçersiz ya da eksik alan null / boş', () => {
  const bos = { v: 1, baslangic: null, bulusma: null, adlar: '' };
  assert.deepEqual(widgetVerisi(), bos);
  assert.deepEqual(widgetVerisi({}), bos);
  assert.deepEqual(widgetVerisi({ baslangic: '', bulusma: '', adlar: [] }), bos);
  for (const b of ['2024-02-30', '2024-13-01', '14.02.2024', '2024-02-14T00:00:00Z', 20240214, null]) {
    assert.equal(widgetVerisi({ baslangic: b }).baslangic, null, String(b));
  }
  for (const b of ['yarın', 'abc', {}, NaN, true]) {
    assert.equal(widgetVerisi({ bulusma: b }).bulusma, null, String(b));
  }
});

test('widgetVerisi: adlar kırpılır, boşluk sadeleşir, boşlar atılır, en çok iki ad', () => {
  assert.equal(widgetVerisi({ adlar: ['  Ömer  ', '', null, 'Gül'] }).adlar, 'Ömer & Gül');
  assert.equal(widgetVerisi({ adlar: ['Ömer'] }).adlar, 'Ömer');
  assert.equal(widgetVerisi({ adlar: ['', 'Gül'] }).adlar, 'Gül');
  assert.equal(widgetVerisi({ adlar: 'Ömer  Can' }).adlar, 'Ömer Can');
  assert.equal(widgetVerisi({ adlar: ['A', 'B', 'C'] }).adlar, 'A & B');
  const uzun = 'Ç'.repeat(40);
  assert.equal(widgetVerisi({ adlar: [uzun] }).adlar, 'Ç'.repeat(24));
  // Emoji (vekil çift) ortadan bölünmez.
  const emojili = `${'a'.repeat(23)}💞💞`;
  assert.equal(widgetVerisi({ adlar: [emojili] }).adlar, `${'a'.repeat(23)}💞`);
});

test('widgetGuncelle: web ve eski APK (eklenti yok) → false, hata yok', async () => {
  assert.equal(await widgetGuncelle({ baslangic: '2024-02-14' }), false);
  globalThis.Capacitor = { isNativePlatform: () => false, Plugins: { BizWidget: { guncelle: () => assert.fail('web') } } };
  assert.equal(await widgetGuncelle({ baslangic: '2024-02-14' }), false);
  globalThis.Capacitor = { isNativePlatform: () => true, Plugins: {} };
  assert.equal(await widgetGuncelle({ baslangic: '2024-02-14' }), false);
});

test('widgetGuncelle: JSON metni yazar; aynı veriyi tekrar yazmaz', async () => {
  const cagrilar = sahteWidget();
  const girdi = { baslangic: '2023-05-01', bulusma: '2026-12-24T19:30:00.000Z', adlar: ['Ömer', 'Gül'] };
  assert.equal(await widgetGuncelle(girdi), true);
  assert.equal(cagrilar.length, 1);
  assert.equal(typeof cagrilar[0].veri, 'string');
  assert.deepEqual(JSON.parse(cagrilar[0].veri), widgetVerisi(girdi));
  assert.equal(await widgetGuncelle({ ...girdi }), false);
  assert.equal(cagrilar.length, 1);
  assert.equal(await widgetGuncelle({ ...girdi, bulusma: null }), true);
  assert.equal(cagrilar.length, 2);
  assert.equal(JSON.parse(cagrilar[1].veri).bulusma, null);
});

test('widgetGuncelle: eklenti hata verirse false; sonraki çağrı yeniden dener', async () => {
  const uyari = console.warn;
  console.warn = () => {};
  try {
    sahteWidget({ hata: new Error('yok') });
    const girdi = { baslangic: '2022-01-02', adlar: ['X'] };
    assert.equal(await widgetGuncelle(girdi), false);
    const cagrilar = sahteWidget();
    assert.equal(await widgetGuncelle(girdi), true);
    assert.equal(cagrilar.length, 1);
  } finally {
    console.warn = uyari;
  }
});
