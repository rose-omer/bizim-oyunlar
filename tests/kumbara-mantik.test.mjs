import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EMOJILER, KUMBARA_BASLIK_MAX, NOT_MAX, kisaPara, ilerlemeMetni, kumbaraOku, katkiOku, yeniKumbara, yeniKatki,
  kumbaraOzeti, cubukPaylari, sonGunMetni, birikimOnerisi, duzenTamam, kumbaraSirala, bildirimMetni,
} from '../sayfalar/harcama/kumbara-mantik.js';

const O = 'omer-test-id';
const G = 'gul-test-id';
const NB = ' ';
let seq = 0;
const doc = (data, { id, at, deleted = false } = {}) => {
  seq += 1;
  const t = at || new Date(Date.UTC(2026, 9, 1, 10, seq)).toISOString();
  return { id: id || `d${seq}`, author: O, deleted, created_at: t, updated_at: t, data };
};
const katki = (kumbara, tutar, kim, ek = {}, opt = {}) => doc({ kumbara, tutar, kim, tarih: '2026-10-12', ...ek }, opt);

test('EMOJILER: domuzcuk başta, tekrarsız', () => {
  assert.equal(EMOJILER[0], '🐷');
  assert.equal(new Set(EMOJILER).size, EMOJILER.length);
});

test('kisaPara: tam lirada kuruş yazılmaz, kesirde yazılır', () => {
  assert.equal(kisaPara(1200000), `12.000${NB}₺`);
  assert.equal(kisaPara(50000), `500${NB}₺`);
  assert.equal(kisaPara(12345), `123,45${NB}₺`);
  assert.equal(kisaPara(0), `0${NB}₺`);
  assert.equal(kisaPara(-20000), `-200${NB}₺`);
});

test('ilerlemeMetni: "12.000 / 20.000 ₺", eksi toplam sıfır görünür', () => {
  assert.equal(ilerlemeMetni(1200000, 2000000), `12.000 / 20.000${NB}₺`);
  assert.equal(ilerlemeMetni(-500, 2000000), `0 / 20.000${NB}₺`);
  assert.equal(ilerlemeMetni(150, 10000), `1,50 / 100${NB}₺`);
});

test('kumbaraOku: geçerli kumbara okunur; silinmiş ya da bozuk olan null', () => {
  const k = kumbaraOku(doc({ baslik: '  Tatil  ', emoji: '✈️', hedef: 2000000, son: '2027-06-01' }));
  assert.deepEqual(k, { baslik: 'Tatil', emoji: '✈️', hedef: 2000000, son: '2027-06-01', tamam: null });
  assert.equal(kumbaraOku(doc({ baslik: 'X', emoji: '🐷', hedef: 0 })), null);
  assert.equal(kumbaraOku(doc({ baslik: 'X', emoji: '🐷', hedef: 1.5 })), null);
  assert.equal(kumbaraOku(doc({ baslik: 'X', emoji: '🐷', hedef: 100 }, { deleted: true })), null);
  assert.equal(kumbaraOku(null), null);
  const v = kumbaraOku(doc({ baslik: '', emoji: '', hedef: 100, son: 'bozuk', tamam: '2026-10-01T10:00:00.000Z' }));
  assert.equal(v.baslik, 'Kumbara');
  assert.equal(v.emoji, '🐷');
  assert.equal(v.son, null);
  assert.equal(v.tamam, '2026-10-01T10:00:00.000Z');
});

test('katkiOku: tutar sıfırdan farklı tamsayı, kumbara ve kim dolu olmalı', () => {
  assert.deepEqual(katkiOku(katki('k1', 50000, G, { not: ' tatil için ' })),
    { kumbara: 'k1', tutar: 50000, kim: G, not: 'tatil için', tarih: '2026-10-12' });
  assert.equal(katkiOku(katki('k1', -2000, O)).tutar, -2000);
  assert.equal(katkiOku(katki('k1', 0, O)), null);
  assert.equal(katkiOku(katki('k1', 10.5, O)), null);
  assert.equal(katkiOku(katki('', 100, O)), null);
  assert.equal(katkiOku(katki('k1', 100, '')), null);
  assert.equal(katkiOku(katki('k1', 100, O, { tarih: 'dün' })), null);
  assert.equal(katkiOku(katki('k1', 100, O, {}, { deleted: true })), null);
});

test('yeniKumbara: doğrular ve kuruşa çevirir', () => {
  const r = yeniKumbara({ baslik: ' Kapadokya  tatili ', emoji: '🏖️', hedefMetni: '20.000', son: '2027-01-10', bugun: '2026-10-31' });
  assert.deepEqual(r, { data: { baslik: 'Kapadokya tatili', emoji: '🏖️', hedef: 2000000, son: '2027-01-10' } });
  const sonsuz = yeniKumbara({ baslik: 'Yüzük', emoji: '💍', hedefMetni: '5000', son: '', bugun: '2026-10-31' });
  assert.deepEqual(sonsuz, { data: { baslik: 'Yüzük', emoji: '💍', hedef: 500000 } });
  assert.match(yeniKumbara({ baslik: ' ', emoji: '🐷', hedefMetni: '10', bugun: '2026-10-31' }).hata, /adını/);
  assert.match(yeniKumbara({ baslik: 'a'.repeat(KUMBARA_BASLIK_MAX + 1), emoji: '🐷', hedefMetni: '10', bugun: '2026-10-31' }).hata, /en çok/);
  assert.match(yeniKumbara({ baslik: 'Tatil', emoji: '🐷', hedefMetni: 'abc', bugun: '2026-10-31' }).hata, /Hedef/);
  assert.match(yeniKumbara({ baslik: 'Tatil', emoji: '🐷', hedefMetni: '10', son: '2026-10-30', bugun: '2026-10-31' }).hata, /Son gün/);
  assert.match(yeniKumbara({ baslik: 'Tatil', emoji: '🐷', hedefMetni: '10', son: 'bozuk', bugun: '2026-10-31' }).hata, /Son gün/);
  // Listede olmayan emoji domuzcuğa döner.
  assert.equal(yeniKumbara({ baslik: 'Tatil', emoji: '<b>', hedefMetni: '10', bugun: '2026-10-31' }).data.emoji, '🐷');
});

test('kumbaraOzeti: toplam, kişi payları, oran ve son katkılar', () => {
  const docs = [
    katki('k1', 700000, O, { tarih: '2026-10-01' }),
    katki('k1', 500000, G, { tarih: '2026-10-05', not: 'maaş' }),
    katki('k1', -100000, O, { tarih: '2026-10-07' }),
    katki('k2', 999900, G),
    katki('k1', 300000, 'gul-eski-cihaz', { tarih: '2026-10-07' }),
    katki('k1', 1, O, {}, { deleted: true }),
  ];
  const oz = kumbaraOzeti('k1', 2000000, docs, O);
  assert.equal(oz.toplam, 1400000);
  assert.equal(oz.ben, 600000);
  assert.equal(oz.o, 800000); // benden farklı her kimlik partnerdir
  assert.equal(oz.oran, 70);
  assert.equal(oz.kalan, 600000);
  assert.equal(oz.ulasti, false);
  // Yeniden eskiye; aynı gün son eklenen üstte.
  assert.deepEqual(oz.katkilar.map((k) => k.tutar), [300000, -100000, 500000, 700000]);
  assert.equal(oz.katkilar[0].id, docs[4].id);
});

test('kumbaraOzeti: oran aşağı yuvarlanır, 100 ile sınırlı; boş kumbara sıfır', () => {
  assert.equal(kumbaraOzeti('k', 1000, [katki('k', 999, O)], O).oran, 99);
  const tam = kumbaraOzeti('k', 1000, [katki('k', 1500, O)], O);
  assert.equal(tam.oran, 100);
  assert.equal(tam.kalan, 0);
  assert.equal(tam.ulasti, true);
  const bos = kumbaraOzeti('k', 1000, [], O);
  assert.deepEqual([bos.toplam, bos.ben, bos.o, bos.oran, bos.ulasti, bos.katkilar.length], [0, 0, 0, 0, false, 0]);
});

test('cubukPaylari: dolu kısım kişilere bölünür, eksi pay görünmez', () => {
  assert.deepEqual(cubukPaylari({ toplam: 1000, ben: 600, o: 400 }, 2000), { ben: 30, o: 20 });
  assert.deepEqual(cubukPaylari({ toplam: 3000, ben: 1500, o: 1500 }, 2000), { ben: 50, o: 50 });
  assert.deepEqual(cubukPaylari({ toplam: 600, ben: 700, o: -100 }, 1000), { ben: 60, o: 0 });
  assert.deepEqual(cubukPaylari({ toplam: 0, ben: 0, o: 0 }, 1000), { ben: 0, o: 0 });
  const p = cubukPaylari({ toplam: 1, ben: 1, o: 0 }, 3);
  assert.equal(p.ben, 33.33);
});

test('yeniKatki: koyma artı, çekme eksi; kumbarada olandan fazlası çekilemez', () => {
  const koy = yeniKatki({ kumbara: 'k1', tutarMetni: '500', cekim: false, kim: G, not: '  ilk  ', tarih: '2026-10-31', mevcut: 0 });
  assert.deepEqual(koy, { data: { kumbara: 'k1', tutar: 50000, kim: G, not: 'ilk', tarih: '2026-10-31' } });
  const cek = yeniKatki({ kumbara: 'k1', tutarMetni: '200', cekim: true, kim: O, tarih: '2026-10-31', mevcut: 50000 });
  assert.deepEqual(cek, { data: { kumbara: 'k1', tutar: -20000, kim: O, tarih: '2026-10-31' } });
  assert.match(yeniKatki({ kumbara: 'k1', tutarMetni: '600', cekim: true, kim: O, tarih: '2026-10-31', mevcut: 50000 }).hata,
    new RegExp(`500${NB}₺`));
  assert.match(yeniKatki({ kumbara: 'k1', tutarMetni: '1', cekim: true, kim: O, tarih: '2026-10-31', mevcut: 0 }).hata, /boş/);
  assert.match(yeniKatki({ kumbara: 'k1', tutarMetni: '0', kim: O, tarih: '2026-10-31', mevcut: 0 }).hata, /Tutar/);
  assert.match(yeniKatki({ kumbara: 'k1', tutarMetni: '5', kim: O, not: 'x'.repeat(NOT_MAX + 1), tarih: '2026-10-31', mevcut: 0 }).hata, /Not/);
  assert.match(yeniKatki({ kumbara: '', tutarMetni: '5', kim: O, tarih: '2026-10-31', mevcut: 0 }).hata, /Kumbara/);
});

test('sonGunMetni', () => {
  assert.equal(sonGunMetni(null, '2026-10-31'), '');
  assert.equal(sonGunMetni('2026-10-30', '2026-10-31'), 'Son gün geçti');
  assert.equal(sonGunMetni('2026-10-31', '2026-10-31'), 'Bugün son gün');
  assert.equal(sonGunMetni('2026-11-01', '2026-10-31'), 'Yarın son gün');
  assert.equal(sonGunMetni('2026-12-15', '2026-10-31'), '45 gün kaldı');
});

test('birikimOnerisi: kalan güne göre haftalık ya da aylık, yukarı yuvarlanmış tam lira', () => {
  assert.deepEqual(birikimOnerisi(600000, '2026-10-31', '2027-01-29'), { birim: 'ay', tutar: 200000 }); // 90 gün → 3 ay
  assert.deepEqual(birikimOnerisi(100001, '2026-10-31', '2026-11-28'), { birim: 'hafta', tutar: 25100 }); // 28 gün → 4 hafta
  assert.equal(birikimOnerisi(100000, '2026-10-31', '2026-11-03'), null); // bir haftadan az
  assert.equal(birikimOnerisi(0, '2026-10-31', '2027-01-29'), null);
  assert.equal(birikimOnerisi(100000, '2026-10-31', null), null);
});

test('duzenTamam: hedef değişmezse tamam korunur; değişirse yeniden hesaplanır', () => {
  const T = '2026-10-01T10:00:00.000Z';
  const S = '2026-10-31T10:00:00.000Z';
  assert.equal(duzenTamam({ eskiTamam: T, eskiHedef: 1000, yeniHedef: 1000, toplam: 0, simdi: S }), T);
  assert.equal(duzenTamam({ eskiTamam: null, eskiHedef: 1000, yeniHedef: 1000, toplam: 5000, simdi: S }), null);
  assert.equal(duzenTamam({ eskiTamam: T, eskiHedef: 1000, yeniHedef: 9000, toplam: 5000, simdi: S }), null);
  assert.equal(duzenTamam({ eskiTamam: null, eskiHedef: 9000, yeniHedef: 4000, toplam: 5000, simdi: S }), S);
  assert.equal(duzenTamam({ eskiTamam: T, eskiHedef: 9000, yeniHedef: 4000, toplam: 5000, simdi: S }), T);
});

test('kumbaraSirala: süren hedefler önce (yeni önce), ulaşılanlar sonra (son ulaşılan önce)', () => {
  const a = doc({ baslik: 'A', emoji: '🐷', hedef: 100 }, { at: '2026-10-01T00:00:00.000Z' });
  const b = doc({ baslik: 'B', emoji: '🐷', hedef: 100 }, { at: '2026-10-05T00:00:00.000Z' });
  const c = doc({ baslik: 'C', emoji: '🐷', hedef: 100, tamam: '2026-10-02T00:00:00.000Z' });
  const d = doc({ baslik: 'D', emoji: '🐷', hedef: 100, tamam: '2026-10-09T00:00:00.000Z' });
  const bozuk = doc({ baslik: 'E', emoji: '🐷', hedef: -1 });
  assert.deepEqual(kumbaraSirala([a, c, bozuk, b, d]).map((x) => x.data.baslik), ['B', 'A', 'D', 'C']);
});

test('bildirimMetni: koyma ve çekme', () => {
  assert.deepEqual(bildirimMetni('Gül', 50000, { baslik: 'Tatil', emoji: '✈️' }),
    { baslik: '✈️ Tatil', metin: `Gül kumbaraya 500${NB}₺ koydu 🐷` });
  assert.deepEqual(bildirimMetni('Ömer', -20000, { baslik: 'Tatil', emoji: '✈️' }),
    { baslik: '✈️ Tatil', metin: `Ömer kumbaradan 200${NB}₺ aldı` });
  assert.equal(bildirimMetni('', 100, {}).metin, `Sevgilin kumbaraya 1${NB}₺ koydu 🐷`);
});
