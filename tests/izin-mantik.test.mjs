// İzin Belgesi: saf mantık.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as K from '../sayfalar/izin/mantik.js';

const form = (o = {}) => ({
  tur: 'hanim', tarih: '2026-11-07', ad: 'Ali', soyad: '', kisi: 'Veli', yer: 'Kadıköy', neden: 'Maç', cikis: '18:00', varis: '22:00', ...o,
});
const an = (gun, saat, dk = 0) => new Date(2026, 10, gun, saat, dk).getTime();
const belge = (id, data, created_at = '2026-11-01T10:00:00Z') => ({
  id, created_at, data: { ...form(), isteyen: 'a', onaylayan: 'b', durum: 'bekliyor', gonderildi: created_at, ...data },
});

test('belgeBasligi: hanım ve bey; bilinmeyen tür hanım sayılır', () => {
  assert.deepEqual(K.belgeBasligi('hanim'), ['HANIMDAN', 'İZİN BELGESİ']);
  assert.deepEqual(K.belgeBasligi('bey'), ['BEYDEN', 'İZİN BELGESİ']);
  assert.deepEqual(K.belgeBasligi('x'), ['HANIMDAN', 'İZİN BELGESİ']);
});

test('belgeDogrula: dolu form geçer, soyad isteğe bağlı', () => {
  assert.equal(K.belgeDogrula(form()), null);
  assert.equal(K.belgeDogrula(form({ soyad: 'Kaya', tur: 'bey' })), null);
});

test('belgeDogrula: eksik alan adıyla döner', () => {
  for (const alan of ['ad', 'kisi', 'yer', 'neden', 'cikis', 'varis']) {
    const sonuc = K.belgeDogrula(form({ [alan]: '  ' }));
    assert.equal(sonuc?.alan, alan, alan);
    assert.ok(sonuc.mesaj.length > 0, alan);
  }
});

test('belgeDogrula: bozuk tarih, saat, tür ve aşırı uzun metin', () => {
  assert.equal(K.belgeDogrula(form({ tarih: '2026-13-40' }))?.alan, 'tarih');
  assert.equal(K.belgeDogrula(form({ cikis: '25:00' }))?.alan, 'cikis');
  assert.equal(K.belgeDogrula(form({ varis: '18:00' }))?.alan, 'varis');
  assert.equal(K.belgeDogrula(form({ kisi: 'k'.repeat(K.METIN_MAX + 1) }))?.alan, 'kisi');
  assert.equal(K.belgeDogrula(form({ soyad: 's'.repeat(K.AD_MAX + 1) }))?.alan, 'soyad');
  assert.equal(K.belgeDogrula(form({ tur: 'x' }))?.alan, 'tur');
});

test('belgeVerisi: kırpar, boş soyadı yazmaz, bekliyor başlar', () => {
  const d = K.belgeVerisi(form({ ad: ' Ali ', yer: ' Kadıköy ' }), { isteyen: 'a', onaylayan: 'b', simdi: Date.UTC(2026, 10, 7, 9) });
  assert.equal(d.ad, 'Ali');
  assert.equal(d.yer, 'Kadıköy');
  assert.ok(!('soyad' in d));
  assert.equal(d.durum, 'bekliyor');
  assert.equal(d.isteyen, 'a');
  assert.equal(d.onaylayan, 'b');
  assert.equal(d.gonderildi, '2026-11-07T09:00:00.000Z');
  assert.equal(K.belgeVerisi(form({ soyad: ' Kaya ' }), {}).soyad, 'Kaya');
});

test('varisAni: aynı gün; varış çıkıştan küçükse ertesi gün', () => {
  assert.equal(K.varisAni(form()), an(7, 22));
  assert.equal(K.varisAni(form({ cikis: '23:00', varis: '01:30' })), an(8, 1, 30));
  assert.equal(K.varisAni(form({ tarih: 'bozuk' })), null);
});

test('gecDakika: vaktinde 0; geç kalınca dakika; hiç eksi değil', () => {
  assert.equal(K.gecDakika(form(), an(7, 21)), 0);
  assert.equal(K.gecDakika(form(), an(7, 22)), 0);
  assert.equal(K.gecDakika(form(), an(7, 22) + 30_000), 0);
  assert.equal(K.gecDakika(form(), an(7, 22, 47)), 47);
  assert.equal(K.gecDakika(form({ cikis: '23:00', varis: '01:00' }), an(8, 1, 10)), 10);
  assert.equal(K.gecDakika(form({ tarih: 'bozuk' }), an(7, 22)), 0);
});

test('gecMetni: dakika, saat, gün', () => {
  assert.equal(K.gecMetni(1), '1 dakika');
  assert.equal(K.gecMetni(60), '1 saat');
  assert.equal(K.gecMetni(125), '2 saat 5 dakika');
  assert.equal(K.gecMetni(1440), '1 gün');
  assert.equal(K.gecMetni(1500), '1 gün 1 saat');
});

test('donusDogrula: geç kaldıysa sebep zorunlu', () => {
  assert.equal(K.donusDogrula(0, ''), null);
  assert.equal(K.donusDogrula(5, 'Trafik'), null);
  assert.ok(K.donusDogrula(5, '   '));
  assert.ok(K.donusDogrula(5, 's'.repeat(K.SEBEP_MAX + 1)));
});

test('donusYamasi: vaktindeyse sebep yazılmaz', () => {
  const simdi = Date.UTC(2026, 10, 7, 19);
  assert.deepEqual(K.donusYamasi(0, ' yok ', simdi), { durum: 'dondu', donus: '2026-11-07T19:00:00.000Z', gec: 0 });
  assert.deepEqual(K.donusYamasi(47, ' Trafik ', simdi), { durum: 'dondu', donus: '2026-11-07T19:00:00.000Z', gec: 47, sebep: 'Trafik' });
});

test('karar yamaları ve geri alma', () => {
  const simdi = Date.UTC(2026, 10, 7, 19);
  assert.deepEqual(K.kararYamasi(true, simdi), { durum: 'izinli', karar: '2026-11-07T19:00:00.000Z' });
  assert.deepEqual(K.kararYamasi(false, simdi), { durum: 'reddedildi', karar: '2026-11-07T19:00:00.000Z' });
  assert.deepEqual(K.kararGeriAlYamasi(), { durum: 'bekliyor', karar: null });
});

test('yetkiler: isteyen damgalayamaz, onaylayan dönüş yazamaz', () => {
  const bekliyor = belge('1');
  assert.equal(K.damgalayabilir(bekliyor, 'b'), true);
  assert.equal(K.damgalayabilir(bekliyor, 'a'), false);
  assert.equal(K.damgalayabilir(belge('2', { durum: 'izinli' }), 'b'), false);
  const izinli = belge('3', { durum: 'izinli' });
  assert.equal(K.donebilir(izinli, 'a'), true);
  assert.equal(K.donebilir(izinli, 'b'), false);
  assert.equal(K.donebilir(bekliyor, 'a'), false);
  assert.equal(K.silinebilir(bekliyor, 'a'), true);
  assert.equal(K.silinebilir(bekliyor, 'b'), false);
});

test('damgalar: duruma göre; makam belge türünden gelir', () => {
  assert.deepEqual(K.damgalar(form({ durum: 'bekliyor' })), []);
  assert.deepEqual(K.damgalar(form({ durum: 'izinli' })), [{ metin: 'ONAYLANDI', alt: 'HANIM MAKAMI', renk: 'yesil' }]);
  assert.deepEqual(K.damgalar(form({ durum: 'reddedildi', tur: 'bey' })), [{ metin: 'REDDEDİLDİ', alt: 'BEY MAKAMI', renk: 'kirmizi' }]);
  assert.deepEqual(K.damgalar(form({ durum: 'dondu', gec: 0 })).map((d) => d.metin), ['ONAYLANDI', 'TAM VAKTİNDE']);
  assert.deepEqual(K.damgalar(form({ durum: 'dondu', gec: 47 }))[1], { metin: 'GEÇ KALDI', alt: '47 DAKİKA', renk: 'kirmizi' });
});

test('bolumler: kişiye göre gruplar, boş grup yok, yeni önce', () => {
  const docs = [
    belge('kararim', { isteyen: 'b', onaylayan: 'a', gonderildi: '2026-11-01T00:00:00Z' }),
    belge('kararim2', { isteyen: 'b', onaylayan: 'a', gonderildi: '2026-11-02T00:00:00Z' }),
    belge('bekleyen', {}),
    belge('disarida', { durum: 'izinli' }),
    belge('eski', { durum: 'reddedildi', karar: '2026-11-03T00:00:00Z' }),
    belge('yeni', { durum: 'dondu', donus: '2026-11-04T00:00:00Z' }),
    null,
  ];
  assert.deepEqual(K.bolumler(docs, 'a').map((b) => [b.id, b.docs.map((d) => d.id)]), [
    ['karar', ['kararim2', 'kararim']],
    ['bekliyor', ['bekleyen']],
    ['disarida', ['disarida']],
    ['arsiv', ['yeni', 'eski']],
  ]);
  assert.deepEqual(K.bolumler([], 'a'), []);
  assert.deepEqual(K.bolumler([belge('tek')], 'a').map((b) => b.id), ['bekliyor']);
});

test('kimlikOneri: son belgemdeki ad ve soyad', () => {
  const docs = [
    belge('e', { ad: 'Ali', soyad: 'Eski', gonderildi: '2026-11-01T00:00:00Z' }),
    belge('y', { ad: 'Ali', soyad: 'Yeni', gonderildi: '2026-11-02T00:00:00Z' }),
    belge('o', { ad: 'Ayşe', soyad: 'Onun', isteyen: 'b', gonderildi: '2026-11-03T00:00:00Z' }),
  ];
  assert.deepEqual(K.kimlikOneri(docs, 'a'), { ad: 'Ali', soyad: 'Yeni' });
  assert.deepEqual(K.kimlikOneri([], 'a'), { ad: '', soyad: '' });
});

test('tarihYazi ve varisYazi: kâğıttaki biçim', () => {
  assert.equal(K.tarihYazi('2026-11-07'), '07/11/2026');
  assert.equal(K.tarihYazi('bozuk'), '');
  assert.equal(K.varisYazi(form()), '22:00');
  const donus = new Date(2026, 10, 7, 22, 47).toISOString();
  assert.equal(K.varisYazi(form({ donus })), '22:00 (vardığı saat 22:47)');
});

test('bildirimMetni: her olay kendi metniyle', () => {
  assert.match(K.bildirimMetni('gonderildi', 'Ali', form()).metin, /Ali.*Kadıköy/);
  assert.match(K.bildirimMetni('izinli', 'Ayşe', form()).metin, /Ayşe.*Kadıköy/);
  assert.match(K.bildirimMetni('reddedildi', 'Ayşe', form()).baslik, /çıkmadı/);
  assert.match(K.bildirimMetni('dondu', 'Ali', { gec: 47 }).metin, /47 dakika geç/);
  assert.doesNotMatch(K.bildirimMetni('dondu', 'Ali', { gec: 0 }).metin, /geç/);
  assert.match(K.bildirimMetni('dondu', '', { gec: 0 }).metin, /Sevgilin/);
});
