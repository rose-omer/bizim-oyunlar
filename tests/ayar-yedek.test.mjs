// Ayarlar › Verilerimiz: yedekten geri yükleme saf mantığı (sayfalar/ayarlar/mantik.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { yedekVerisi, yedektenBelgeler, parcala, yedekOzeti } from '../sayfalar/ayarlar/mantik.js';

const T = '2026-10-01T10:00:00.000Z';
const belge = (id, data = { metin: id }) => ({ id, data, author: 'omer', created_at: T, updated_at: T });

test('yedektenBelgeler: yedekVerisi çıktısını geri okur (gidiş-dönüş)', () => {
  const yedek = yedekVerisi({
    sonuclar: { mesaj: [belge('m1'), belge('m2')], ani: [belge('a1', { baslik: 'Deniz', fotolar: [] })], cift: [belge('cift')] },
    simdi: new Date(T),
  });
  const { belgeler, hatalar, sayilar } = yedektenBelgeler(JSON.parse(JSON.stringify(yedek)));
  assert.deepEqual(hatalar, []);
  assert.deepEqual(sayilar, { cift: 1, mesaj: 2, ani: 1 });
  assert.equal(belgeler.length, 4);
  assert.deepEqual(belgeler.find((b) => b.id === 'm1'), { kind: 'mesaj', id: 'm1', data: { metin: 'm1' }, author: 'omer', created_at: T, updated_at: T });
});

test('yedektenBelgeler: metin de kabul eder; yedek olmayan dosya ve yeni sürüm reddedilir', () => {
  const yedek = yedekVerisi({ sonuclar: { gun: [belge('g1')] } });
  assert.equal(yedektenBelgeler(JSON.stringify(yedek)).belgeler.length, 1);
  for (const kotu of [null, 'bozuk{', [], { uygulama: 'Başka' }, { uygulama: 'Biz İkimiz', surum: '2.0' }]) {
    const r = yedektenBelgeler(kotu);
    assert.deepEqual(r.belgeler, []);
    assert.match(r.hatalar[0], /Biz İkimiz yedeği değil/);
  }
  const yeni = yedektenBelgeler({ ...yedek, surum: '3.0' });
  assert.deepEqual(yeni.belgeler, []);
  assert.match(yeni.hatalar[0], /daha yeni bir sürüm/);
});

test('yedektenBelgeler: bozuk kayıtlar ve bilinmeyen türler atlanır, sayılır', () => {
  const r = yedektenBelgeler({
    uygulama: 'Biz İkimiz', surum: '2.0', alindi: T,
    turler: {
      liste: [
        belge('l1'),
        { id: 'kötü id', data: {} },
        { id: 'l2', data: 'metin' },
        { id: 'l3', data: { x: 'y'.repeat(40 * 1024) } },
        { id: 'l4', data: { metin: 'tarihsiz' }, author: '<script>', created_at: 'dün', updated_at: 5 },
      ],
      hack: [belge('h1')],
      mesaj: 'dizi değil',
    },
  });
  assert.deepEqual(r.sayilar, { liste: 2 });
  assert.deepEqual(r.belgeler.map((b) => b.id), ['l1', 'l4']);
  assert.deepEqual(r.belgeler[1], { kind: 'liste', id: 'l4', data: { metin: 'tarihsiz' } });
  assert.equal(r.hatalar.length, 3);
  assert.ok(r.hatalar.some((h) => /3 kayıt/.test(h)));
});

test('parcala: n\'lik parçalar', () => {
  assert.deepEqual(parcala([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(parcala([], 200), []);
  assert.equal(parcala(new Array(450).fill(0), 200).map((p) => p.length).join(','), '200,200,50');
});

test('yedekOzeti: toplam ve en çok olan türler', () => {
  assert.equal(yedekOzeti({ mesaj: 800, ani: 40, cift: 1, gun: 393 }), '1.234 kayıt: 800 mesaj, 393 özel gün, 40 anı, 1 çift bilgisi');
  assert.equal(yedekOzeti({ mesaj: 5, ani: 4, gun: 3, liste: 2, kisi: 1 }), '15 kayıt: 5 mesaj, 4 anı, 3 özel gün, 2 liste öğesi …');
  assert.equal(yedekOzeti({}), 'Yedekte kayıt yok.');
});
