// Hatırlatma hesaplama (supabase/functions/_shared/mantik.js): sabah ve akşam içerikleri, oda planı.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  istanbulGunu, gunNo, sabahOlaylari, aksamOlaylari, cihazMesaji, odaPlani, odayaGore, BASLIK_MAX, METIN_MAX,
} from '../supabase/functions/_shared/mantik.js';

const BUGUN = '2026-10-30';
const gun = (id, data) => ({ kind: 'gun', id, data });
const kisi = (id, data) => ({ kind: 'kisi', id, data });

test('istanbulGunu: UTC gece yarısı civarı Türkiye günü (UTC+3)', () => {
  assert.equal(istanbulGunu(new Date('2026-10-29T20:59:00Z')), '2026-10-29');
  assert.equal(istanbulGunu(new Date('2026-10-29T21:00:00Z')), '2026-10-30');
  assert.equal(istanbulGunu(new Date('2026-10-30T06:00:00Z')), '2026-10-30');
  assert.equal(istanbulGunu(new Date('2026-12-31T22:30:00Z')), '2027-01-01');
});

test('gunNo: 2026-01-01 = 0', () => {
  assert.equal(gunNo('2026-01-01'), 0);
  assert.equal(gunNo('2026-01-02'), 1);
  assert.equal(gunNo('2026-10-30'), 302);
});

test('sabah: özel gün kendi hatirlat listesine göre (yoksa yalnız gününde)', () => {
  const gunler = [
    gun('a', { baslik: 'İlk buluşma', tarih: '2024-10-30', tekrar: 'yil', tur: 'yildonumu', emoji: '💞' }),
    gun('b', { baslik: 'Konser', tarih: '2026-10-31', tekrar: 'yok', tur: 'plan', emoji: '🎵', hatirlat: [1] }),
    gun('c', { baslik: 'Tatil', tarih: '2026-11-06', tekrar: 'yok', tur: 'plan', emoji: '🏖️', hatirlat: [0, 7] }),
    gun('d', { baslik: 'Sessiz', tarih: '2026-10-31', tekrar: 'yok', tur: 'plan', emoji: '🙂' }),
    gun('e', { baslik: 'Geç uyarı', tarih: '2026-11-02', tekrar: 'yok', tur: 'plan', emoji: '🙂', hatirlat: [3] }),
  ];
  const o = sabahOlaylari({ bugun: BUGUN, gunler });
  assert.deepEqual(o.map((x) => x.baslik), ['Bugün: İlk buluşma 💞', 'Yarın: Konser 🎵', '7 gün kaldı: Tatil 🏖️']);
  assert.equal(o[0].metin, '2. yıl dönümü, kutlu olsun 💗');
  assert.equal(o[0].url, 'sayfalar/gunler/');
  assert.ok(o.every((x) => x.tur === 'gun' && !x.kime && !x.haric));
});

test('sabah: doğum günü kişiye kutlama, partnere hatırlatma; elle eklenen varsa atlanır', () => {
  const kisiler = [kisi('omer', { ad: 'Ömer', dogum: '1998-10-30' }), kisi('gul', { ad: 'Gül', dogum: '1999-10-31' })];
  const o = sabahOlaylari({ bugun: BUGUN, kisiler });
  assert.equal(o.length, 3);
  assert.deepEqual(cihazMesaji(o, 'omer'), {
    tur: 'gun', baslik: 'İyi ki doğdun, Ömer! 🎂', url: '',
    metin: 'Bugün senin günün. Nice mutlu yıllara 💗 · Ayrıca: Yarın sevgilinin doğum günü 🎁',
  });
  assert.equal(cihazMesaji(o, 'gul').baslik, 'Bugün sevgilinin doğum günü 🎂');
  assert.equal(cihazMesaji(o, 'gul').metin, 'Ömer için güzel bir gün yapalım 💗');

  const elle = [gun('x', { baslik: 'Ömer doğdu', tarih: '1998-10-30', tur: 'dogumgunu', emoji: '🎂' })];
  const o2 = sabahOlaylari({ bugun: BUGUN, gunler: elle, kisiler: [kisiler[0]] });
  assert.deepEqual(o2.map((x) => x.baslik), ['Bugün: Ömer doğdu 🎂']);
  assert.equal(o2[0].metin, '28. yaş, kutlu olsun 💗');
});

test('sabah: kilometre taşları gününde (gün, yıl, ay)', () => {
  assert.deepEqual(sabahOlaylari({ bugun: BUGUN, cift: { baslangic: '2026-07-23' } }).map((x) => x.baslik), ['Bugün 100. günümüz 💞']);
  assert.deepEqual(sabahOlaylari({ bugun: BUGUN, cift: { baslangic: '2025-10-30' } }).map((x) => x.baslik), ['Bugün 1. yıl dönümümüz 💞']);
  assert.deepEqual(sabahOlaylari({ bugun: BUGUN, cift: { baslangic: '2026-08-30' } }).map((x) => x.baslik), ['Bugün 2. ayımız 💞']);
  assert.deepEqual(sabahOlaylari({ bugun: BUGUN, cift: { baslangic: '2026-10-29' } }), []);
  assert.deepEqual(sabahOlaylari({ bugun: BUGUN, cift: { baslangic: 'bozuk' } }), []);
});

test('cihazMesaji: birden çok olay tek bildirimde, sınırlar içinde', () => {
  const olaylar = Array.from({ length: 8 }, (_, i) => ({ baslik: `Olay ${i} ${'x'.repeat(70)}`, metin: 'm', url: 'u', tur: 'gun', sira: i }));
  const m = cihazMesaji(olaylar, 'a');
  assert.ok([...m.baslik].length <= BASLIK_MAX);
  assert.ok([...m.metin].length <= METIN_MAX);
  assert.ok(m.metin.endsWith('…'));
  assert.equal(cihazMesaji([], 'a'), null);
  assert.equal(cihazMesaji([{ baslik: 'x', metin: '', kime: 'b' }], 'a'), null);
});

test('akşam: günün sorusu cevap durumuna göre', () => {
  const n = gunNo(BUGUN);
  const gs = (client, cevap = 'evet', g = n) => ({ kind: 'gs', id: `${g}-${client}`, data: { gun: g, cevap } });
  assert.equal(aksamOlaylari({ bugun: BUGUN, gs: [] }).olaylar[0].baslik, 'Günün sorusu seni bekliyor 💭');
  const bir = aksamOlaylari({ bugun: BUGUN, gs: [gs('omer'), gs('gul', 'x', n - 1)] });
  assert.equal(bir.olaylar[0].baslik, 'Sevgilin günün sorusunu cevapladı 💌');
  assert.deepEqual([...bir.cevaplayan], ['omer']);
  assert.equal(aksamOlaylari({ bugun: BUGUN, gs: [gs('omer'), gs('gul')] }).olaylar.length, 0);
  assert.equal(aksamOlaylari({ bugun: BUGUN, gs: [gs('omer'), gs('gul', '  ')] }).olaylar.length, 1, 'boş cevap sayılmaz');
});

test('odaPlani: sabah ve akşam kime ne gider', () => {
  const aboneler = [
    { client: 'omer', endpoint: 'https://fcm.googleapis.com/fcm/send/1' },
    { client: 'gul', endpoint: 'https://web.push.apple.com/2' },
  ];
  const belgeler = [kisi('omer', { ad: 'Ömer', dogum: '1998-10-30' }), { kind: 'cift', id: 'cift', data: { baslangic: '2026-07-23' } }];
  const sabah = odaPlani({ slot: 'sabah', bugun: BUGUN, belgeler, aboneler });
  assert.deepEqual(sabah.map((p) => [p.abone.client, p.mesaj.baslik]), [
    ['omer', 'İyi ki doğdun, Ömer! 🎂'],
    ['gul', 'Bugün sevgilinin doğum günü 🎂'],
  ]);
  assert.match(sabah[1].mesaj.metin, /Ayrıca: Bugün 100\. günümüz/);
  assert.deepEqual(odaPlani({ slot: 'sabah', bugun: '2026-10-28', belgeler, aboneler }), []);

  const gs = [{ kind: 'gs', id: `${gunNo(BUGUN)}-gul`, data: { cevap: 'a' } }];
  const aksam = odaPlani({ slot: 'aksam', bugun: BUGUN, belgeler: gs, aboneler });
  assert.deepEqual(aksam.map((p) => [p.abone.client, p.mesaj.tur, p.mesaj.url]), [['omer', 'soru', 'sayfalar/gunun-sorusu/']]);
  assert.deepEqual(odaPlani({ slot: 'gece', bugun: BUGUN, belgeler, aboneler }), []);
});

test('odayaGore', () => {
  const m = odayaGore([{ room: 'a', x: 1 }, { room: 'b', x: 2 }, { room: 'a', x: 3 }]);
  assert.deepEqual([...m.keys()], ['a', 'b']);
  assert.deepEqual(m.get('a').map((r) => r.x), [1, 3]);
  assert.equal(odayaGore(null).size, 0);
});
