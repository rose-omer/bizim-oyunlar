// Rozetler: mevcut veriden hesap (saklanmaz). Eşikler, ilerleme, durum metni, özet, mesaj taraması.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GRUPLAR, ROZET_MESAJ_SINIRI, rozetHesapla, rozetOzeti, mesajRozetVerisi, mesajYeter, yilDonumu,
} from '../sayfalar/rozetler/mantik.js';

const TAM = {
  baslangic: '2025-02-14',
  enUzunSeri: 12,
  oyunSayisi: 55,
  aniSayisi: 9,
  mektupSayisi: 1,
  dokunusSayisi: 140,
  mesaj: { sayi: 1200, foto: true, ses: false, tamam: true },
};
const bul = (list, id) => list.find((r) => r.id === id);

test('gruplar ve tarama sınırı', () => {
  assert.deepEqual(GRUPLAR.map((g) => g.id), ['birlikte', 'seri', 'oyun', 'ani', 'ilk', 'sohbet']);
  assert.equal(ROZET_MESAJ_SINIRI, 5000);
});

test('yilDonumu: 29 Şubat artık olmayan yılda 28 Şubat', () => {
  assert.equal(yilDonumu('2025-02-14', 1), '2026-02-14');
  assert.equal(yilDonumu('2024-02-29', 1), '2025-02-28');
  assert.equal(yilDonumu('2024-02-29', 4), '2028-02-29');
});

test('gün rozetleri: 100/365/1000; açılınca tarih, değilse kalan gün', () => {
  const r = rozetHesapla(TAM, { bugun: '2026-10-31' }); // 625. gün
  assert.equal(bul(r, 'gun-100').acik, true);
  assert.equal(bul(r, 'gun-100').tarih, '2025-05-24');
  assert.equal(bul(r, 'gun-100').durum, '24 Mayıs 2025');
  assert.equal(bul(r, 'gun-365').acik, true);
  const bin = bul(r, 'gun-1000');
  assert.equal(bin.acik, false);
  assert.equal(bin.deger, 625);
  assert.equal(bin.oran, 0.625);
  assert.equal(bin.durum, '375 gün kaldı');
});

test('yıl dönümü rozetleri: geçenler + sıradaki', () => {
  const r = rozetHesapla(TAM, { bugun: '2026-10-31' });
  const yil = r.filter((x) => x.grup === 'birlikte' && x.id.startsWith('yil-'));
  assert.deepEqual(yil.map((x) => [x.id, x.acik]), [['yil-1', true], ['yil-2', false]]);
  assert.equal(yil[0].baslik, '1. yıl dönümü');
  assert.equal(yil[1].durum, '106 gün kaldı');
  assert.ok(yil[1].oran > 0.5 && yil[1].oran < 1);
});

test('başlangıç tarihi yoksa gün ve yıl rozetleri kilitli, yol gösterir', () => {
  const r = rozetHesapla({ ...TAM, baslangic: null }, { bugun: '2026-10-31' });
  const g = bul(r, 'gun-100');
  assert.equal(g.acik, false);
  assert.equal(g.oran, 0);
  assert.match(g.durum, /Ayarlar/);
  assert.deepEqual(r.filter((x) => x.id.startsWith('yil-')).map((x) => x.id), ['yil-1']);
});

test('sayı rozetleri: seri, oyun, anı, mektup, sohbet; durum "n / hedef"', () => {
  const r = rozetHesapla(TAM, { bugun: '2026-10-31' });
  assert.deepEqual(['seri-7', 'seri-30', 'seri-100'].map((id) => bul(r, id).acik), [true, false, false]);
  assert.equal(bul(r, 'seri-30').durum, '12 / 30');
  assert.deepEqual(['oyun-10', 'oyun-50', 'oyun-100'].map((id) => bul(r, id).acik), [true, true, false]);
  assert.deepEqual(['ani-10', 'ani-50', 'ani-100'].map((id) => bul(r, id).acik), [false, false, false]);
  assert.equal(bul(r, 'ani-10').oran, 0.9);
  assert.equal(bul(r, 'mektup-1').acik, true);
  assert.equal(bul(r, 'foto-1').acik, true);
  assert.equal(bul(r, 'ses-1').acik, false);
  assert.equal(bul(r, 'mesaj-1000').acik, true);
  assert.equal(bul(r, 'mesaj-1000').durum, 'Açıldı');
  assert.equal(bul(r, 'dokunus-100').acik, true);
  for (const x of r) {
    assert.ok(x.oran >= 0 && x.oran <= 1, x.id);
    assert.ok(GRUPLAR.some((g) => g.id === x.grup), x.id);
    assert.ok(x.simge && x.baslik && x.aciklama, x.id);
  }
});

test('mesaj taraması bitmediyse mesaj rozetleri "bakılıyor"', () => {
  const r = rozetHesapla({ ...TAM, mesaj: null }, { bugun: '2026-10-31' });
  assert.equal(bul(r, 'foto-1').bekliyor, true);
  assert.equal(bul(r, 'foto-1').durum, 'Bakılıyor…');
  assert.equal(bul(r, 'oyun-10').bekliyor, undefined);
  // Tarama sınırda durduysa ve rozet kilitliyse: tamam değil ama bekliyor da değil.
  const r2 = rozetHesapla({ ...TAM, mesaj: { sayi: 5000, foto: false, ses: false, tamam: false } }, { bugun: '2026-10-31' });
  assert.equal(bul(r2, 'ses-1').bekliyor, undefined);
  assert.equal(bul(r2, 'ses-1').acik, false);
});

test('rozetOzeti: açık sayısı ve en yakın kilitli rozet', () => {
  const r = rozetHesapla(TAM, { bugun: '2026-10-31' });
  const o = rozetOzeti(r);
  assert.equal(o.toplam, r.length);
  assert.equal(o.acik, r.filter((x) => x.acik).length);
  assert.equal(o.siradaki.id, 'ani-10'); // %90
  assert.equal(rozetOzeti([]).siradaki, null);
});

test('mesajRozetVerisi ve mesajYeter', () => {
  const docs = [{ data: { metin: 'a' } }, { data: { foto: 'local:1' } }, { data: { ses: 'local:2' } }];
  assert.deepEqual(mesajRozetVerisi(docs), { sayi: 3, foto: true, ses: true });
  assert.deepEqual(mesajRozetVerisi([]), { sayi: 0, foto: false, ses: false });
  assert.equal(mesajYeter(docs), false); // 1000'e ulaşmadı
  const cok = Array.from({ length: 1000 }, () => ({ data: { metin: 'x' } }));
  assert.equal(mesajYeter([...cok, ...docs]), true);
  assert.equal(mesajYeter(cok), false);
});
