// Yılımız: saf hesap (yıl seçimi, mesaj/anı/soru/oyun/dokunuş özetleri, kartlar, görsel).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MESAJ_SINIRI, sayiYaz, yilSecenekleri, varsayilanYil, birlikteGun, mesajOzeti, aniOzeti, soruOzeti,
  dokunusOzeti, oyunOzeti, kilometreTaslari, yilOzeti, hikayeKartlari, gorselOzeti,
} from '../sayfalar/yilimiz/mantik.js';
import { gunNo } from '../sayfalar/gunun-sorusu/mantik.js';

const at = (y, mo, d, h = 12, mi = 0) => new Date(y, mo - 1, d, h, mi).toISOString();
let n = 0;
const mesaj = (iso, kimden, data = {}) => ({ id: `m${++n}`, author: kimden, data: { metin: 'x', kimden, ...data }, created_at: iso, updated_at: iso });
const KISILER = [{ id: 'ali', ad: 'Ömer' }, { id: 'ayse', ad: 'Gül' }];

test('sınır ve sayı yazımı', () => {
  assert.equal(MESAJ_SINIRI, 20000);
  assert.equal(sayiYaz(12480), '12.480');
  assert.equal(sayiYaz(7), '7');
});

test('yilSecenekleri: başlangıç yılından bu yıla, yeniden eskiye; ek yıllar; gelecek yok', () => {
  assert.deepEqual(yilSecenekleri({ baslangic: '2024-05-01', bugun: '2026-10-31' }), [2026, 2025, 2024]);
  assert.deepEqual(yilSecenekleri({ baslangic: null, bugun: '2026-10-31' }), [2026]);
  assert.deepEqual(yilSecenekleri({ baslangic: '2026-02-01', bugun: '2026-10-31', ekYillar: [2023, 2030] }), [2026, 2023]);
  assert.deepEqual(yilSecenekleri({ baslangic: '2027-01-01', bugun: '2026-10-31' }), [2026]);
});

test('varsayilanYil: ocakta geçen yıl, sonra bu yıl', () => {
  assert.equal(varsayilanYil([2026, 2025], '2026-01-12'), 2025);
  assert.equal(varsayilanYil([2026], '2026-01-12'), 2026);
  assert.equal(varsayilanYil([2026, 2025], '2026-10-31'), 2026);
});

test('birlikteGun: yıl içinde birlikte geçen günler (bugüne dek)', () => {
  assert.equal(birlikteGun('2024-05-01', 2025, '2026-10-31'), 365);
  assert.equal(birlikteGun('2026-10-01', 2026, '2026-10-31'), 31);
  assert.equal(birlikteGun('2026-01-01', 2026, '2026-01-01'), 1);
  assert.equal(birlikteGun('2027-01-01', 2026, '2026-10-31'), 0);
  assert.equal(birlikteGun(null, 2026, '2026-10-31'), 0);
});

test('mesajOzeti: o yılın mesajları, kişi başı, en yoğun gün ve ay, gece, tepki, foto, ses', () => {
  const docs = [
    mesaj(at(2025, 12, 31, 23, 59), 'ali'), // geçen yıl
    mesaj(at(2026, 2, 14, 10), 'ali', { tepki: { ayse: '❤️' } }),
    mesaj(at(2026, 2, 14, 11), 'ayse', { tepki: { ali: '❤️', ayse: '😂' } }),
    mesaj(at(2026, 2, 14, 2, 30), 'ayse', { foto: 'local:1' }),
    mesaj(at(2026, 3, 1, 5, 59), 'ali', { ses: 'local:2' }),
    mesaj(at(2026, 3, 2, 6, 0), 'ali', { tepki: { ayse: '😂' } }),
    mesaj(at(2026, 3, 3, 21), 'ali'),
    mesaj(at(2027, 1, 1, 0, 1), 'ali'), // gelecek yıl
  ];
  const o = mesajOzeti(docs, 2026);
  assert.equal(o.sayi, 6);
  assert.deepEqual(o.kisiler, { ali: 4, ayse: 2 });
  assert.deepEqual(o.enYogunGun, { gun: '2026-02-14', sayi: 3 });
  assert.deepEqual(o.enYogunAy, { ay: 2, sayi: 3 }); // eşitlikte erken ay (Şubat = 2)
  assert.equal(o.gece, 2); // 02.30 ve 05.59; 06.00 gece değil
  assert.deepEqual(o.tepki, { emoji: '❤️', sayi: 2 }); // eşitlikte önce görülen
  assert.equal(o.foto, 1);
  assert.equal(o.ses, 1);
  assert.deepEqual(mesajOzeti([], 2026), { sayi: 0, kisiler: {}, enYogunGun: null, enYogunAy: null, gece: 0, tepki: null, foto: 0, ses: 0 });
});

test('aniOzeti: anı tarihine göre; en sık etiket ve yer; fotoğraf sayısı', () => {
  const ani = (tarih, data = {}) => ({ id: `a${++n}`, data: { baslik: 'x', tarih, fotolar: [], ...data }, created_at: at(2026, 10, 1), updated_at: at(2026, 10, 1) });
  const docs = [
    ani('2026-03-01', { etiketler: ['Tatil', 'deniz'], yer: 'Kadıköy', fotolar: ['a', 'b'] }),
    ani('2026-06-01', { etiketler: ['tatil'], yer: 'kadıköy ' }),
    ani('2026-07-01', { yer: 'Bodrum', fotolar: ['c'] }),
    ani('2025-07-01', { etiketler: ['eski'], yer: 'Bodrum' }),
  ];
  const o = aniOzeti(docs, 2026);
  assert.equal(o.sayi, 3);
  assert.equal(o.foto, 3);
  assert.deepEqual(o.etiket, { etiket: 'Tatil', sayi: 2 });
  assert.deepEqual(o.yer, { yer: 'Kadıköy', sayi: 2 });
  assert.deepEqual(aniOzeti([], 2026), { sayi: 0, foto: 0, etiket: null, yer: null });
});

test('soruOzeti: ikisinin cevapladığı günler ve o yılın en uzun serisi', () => {
  const gs = (tarih, kim) => {
    const g = gunNo(tarih);
    return { id: `${g}-${kim}`, data: { gun: g, cevap: 'evet' }, author: kim, created_at: at(2026, 5, 1), updated_at: at(2026, 5, 1) };
  };
  const docs = [
    ...['2026-03-01', '2026-03-02', '2026-03-03'].flatMap((t) => [gs(t, 'ali'), gs(t, 'ayse')]),
    gs('2026-03-04', 'ali'), // yalnız biri
    gs('2026-04-10', 'ali'), gs('2026-04-10', 'ayse'),
  ];
  assert.deepEqual(soruOzeti(docs, 2026, '2026-10-31'), { gun: 4, enUzun: 3 });
  assert.deepEqual(soruOzeti(docs, 2025, '2026-10-31'), { gun: 0, enUzun: 0 });
});

test('dokunusOzeti: o yılın dokunuşları, gönderen başı, en çok tür', () => {
  const dk = (iso, kimden, tur) => ({ id: `d${++n}`, author: kimden, data: { tur, kime: 'x', at: iso }, created_at: iso, updated_at: iso });
  const docs = [dk(at(2026, 1, 1), 'ali', 'kalp'), dk(at(2026, 2, 1), 'ayse', 'kalp'), dk(at(2026, 2, 2), 'ayse', 'sarilma'), dk(at(2025, 2, 2), 'ayse', 'sarilma')];
  assert.deepEqual(dokunusOzeti(docs, 2026), { sayi: 3, kisiler: { ali: 1, ayse: 2 }, enCok: 'kalp' });
  assert.deepEqual(dokunusOzeti([], 2026), { sayi: 0, kisiler: {}, enCok: null });
});

test('oyunOzeti: o yılın skor sayaçları ve en çok oynanan oyun', () => {
  const skor = { dama: { ali: 9, y2026: { ali: 2, ayse: 1 } }, tavla: { y2026: { ayse: 3, berabere: 1 } }, amiral: { y2025: { ali: 5 } } };
  assert.deepEqual(oyunOzeti(skor, ['ali', 'ayse'], 2026), { toplam: 7, kisiler: [2, 4], berabere: 1, enCok: 'tavla' });
  assert.deepEqual(oyunOzeti({}, ['ali', 'ayse'], 2026), { toplam: 0, kisiler: [0, 0], berabere: 0, enCok: null });
});

test('kilometreTaslari: o yılın geçmiş taşları (bugünden sonrası yok)', () => {
  const t = kilometreTaslari('2025-11-20', 2026, '2026-10-31');
  // 1. yıl dönümü 2026-11-20: henüz gelmedi.
  assert.deepEqual(t.map((x) => [x.baslik, x.date]), [
    ['50. günümüz', '2026-01-08'], ['100. günümüz', '2026-02-27'], ['200. günümüz', '2026-06-07'], ['300. günümüz', '2026-09-15'],
  ]);
  assert.equal(kilometreTaslari(null, 2026, '2026-10-31').length, 0);
  assert.ok(kilometreTaslari('2024-11-20', 2025, '2026-10-31').some((x) => x.baslik === '1. yıl dönümümüz'));
});

const VERI = () => ({
  baslangic: '2025-02-14',
  mesajlar: [mesaj(at(2026, 2, 14, 10), 'ali', { tepki: { ayse: '❤️' } }), mesaj(at(2026, 2, 14, 1), 'ayse')],
  dokunuslar: [],
  anilar: [],
  gs: [],
  skor: { dama: { y2026: { ali: 1 } } },
  mesajAsildi: false,
});

test('yilOzeti: tüm özetleri bir arada kurar', () => {
  const o = yilOzeti(VERI(), { yil: 2026, bugun: '2026-10-31', ids: ['ali', 'ayse'] });
  assert.equal(o.yil, 2026);
  assert.equal(o.buYil, true);
  assert.equal(o.mesaj.sayi, 2);
  assert.equal(o.oyun.toplam, 1);
  assert.equal(o.birlikteGun, 304);
  assert.ok(o.taslar.some((x) => x.baslik === '1. yıl dönümümüz'));
});

test('hikayeKartlari: veri olan kartlar sırayla; kapak ve paylaş her zaman', () => {
  const o = yilOzeti(VERI(), { yil: 2026, bugun: '2026-10-31', ids: ['ali', 'ayse'] });
  const k = hikayeKartlari(o, { kisiler: KISILER, oyunAdi: (id) => ({ dama: 'Dama' }[id] || id) });
  assert.deepEqual(k.map((x) => x.id), ['kapak', 'mesaj', 'tepki', 'gece', 'oyun', 'taslar', 'paylas']);
  for (const c of k) if (c.vurgu) assert.ok(c.baslik.includes(c.vurgu), `${c.id}: vurgu başlıkta`);
  const m = k.find((x) => x.id === 'mesaj');
  assert.equal(m.baslik, 'Birbirinize 2 mesaj yazdınız.');
  assert.ok(m.satirlar.includes('Ömer 1, Gül 1.'));
  assert.ok(m.satirlar.includes('En çok yazıştığınız gün 14 Şubat: 2 mesaj.'));
  assert.equal(m.not, undefined);
  const oy = k.find((x) => x.id === 'oyun');
  assert.ok(oy.satirlar.includes('En çok oynadığınız: Dama.'));
  assert.equal(k[0].vurgu, '2026');
  assert.ok(k[0].baslik.includes('Ömer') && k[0].baslik.includes('Gül'));
});

test('hikayeKartlari: sınır aşıldıysa mesaj kartı söyler; boş yılda nazik kart', () => {
  const v = VERI();
  v.mesajAsildi = true;
  const o = yilOzeti(v, { yil: 2026, bugun: '2026-10-31', ids: ['ali', 'ayse'] });
  const m = hikayeKartlari(o, { kisiler: KISILER }).find((x) => x.id === 'mesaj');
  assert.match(m.not, /20\.000/);
  const bos = yilOzeti({ baslangic: null, mesajlar: [], dokunuslar: [], anilar: [], gs: [], skor: {} }, { yil: 2026, bugun: '2026-10-31', ids: ['ali', 'ayse'] });
  assert.deepEqual(hikayeKartlari(bos, { kisiler: KISILER }).map((x) => x.id), ['kapak', 'bos', 'paylas']);
});

test('gorselOzeti: sıfır olmayan sayılar, en çok 6; ad ve yıl', () => {
  const o = yilOzeti(VERI(), { yil: 2026, bugun: '2026-10-31', ids: ['ali', 'ayse'] });
  const g = gorselOzeti(o, { kisiler: KISILER });
  assert.equal(g.yil, 2026);
  assert.equal(g.adlar, 'Ömer & Gül');
  assert.deepEqual(g.sayilar, [{ deger: '2', etiket: 'mesaj' }, { deger: '1', etiket: 'maç' }, { deger: '304', etiket: 'gün birlikte' }]);
  assert.equal(g.emoji, '❤️');
});

test('fotoGunOzeti: yalnız o yıl, ikinizin de gönderdiği günler', async () => {
  const { fotoGunOzeti } = await import('../sayfalar/yilimiz/mantik.js');
  const d = (gun, kim) => ({ id: gun + '-' + kim, data: { foto: 'x.webp' } });
  const l = [d('2026-03-01', 'ben'), d('2026-03-01', 'o'), d('2026-03-02', 'ben'), d('2025-03-01', 'ben'), d('2025-03-01', 'o')];
  assert.deepEqual(fotoGunOzeti(l, 2026, 'ben'), { gun: 2, ortak: 1 });
  assert.deepEqual(fotoGunOzeti([], 2026, 'ben'), { gun: 0, ortak: 0 });
});

test('mektupOzeti: o yıl yazılanlar; kilitli kapsül sayılmaz ve ele verilmez', async () => {
  const { mektupOzeti } = await import('../sayfalar/yilimiz/mantik.js');
  const simdi = Date.parse('2026-06-01T00:00:00Z');
  const m = (kimden, created_at, data = {}) => ({ author: kimden, created_at, data: { kimden, ...data } });
  const l = [
    m('ben', '2026-02-01T10:00:00Z'), m('o', '2026-03-01T10:00:00Z'), m('o', '2026-04-01T10:00:00Z'),
    m('o', '2026-05-01T10:00:00Z', { acilis: '2027-01-01T00:00:00Z' }),
    m('ben', '2026-02-01T10:00:00Z', { acilis: '2026-05-01T00:00:00Z' }), // açılmış kapsül sayılır
    m('o', '2025-03-01T10:00:00Z'),
  ];
  assert.deepEqual(mektupOzeti(l, 2026, simdi), { sayi: 4, kisiler: { ben: 2, o: 2 } });
});

test('hikayeKartlari: fotoğraf ve mektup kartı yalnız veri varsa, sayfasına bağlantıyla', async () => {
  const { yilOzeti, hikayeKartlari } = await import('../sayfalar/yilimiz/mantik.js');
  const bos = { baslangic: null, mesajlar: [], dokunuslar: [], anilar: [], gs: [], skor: {}, mesajAsildi: false };
  const kisiler = [{ id: 'ben', ad: 'Ömer' }, { id: 'o', ad: 'Gül' }];
  const kimlik = { yil: 2026, bugun: '2026-06-01', ids: ['ben', 'o'] };
  const ids = (v) => hikayeKartlari(yilOzeti(v, kimlik), { kisiler }).map((k) => k.id);
  assert.ok(!ids(bos).includes('gunfoto'));
  assert.ok(!ids(bos).includes('mektup'));
  const dolu = {
    ...bos,
    gunfoto: [{ id: '2026-03-01-ben', data: { foto: 'a' } }, { id: '2026-03-01-o', data: { foto: 'b' } }],
    mektuplar: [{ author: 'ben', created_at: '2026-02-01T10:00:00Z', data: { kimden: 'ben' } }],
  };
  const kartlar = hikayeKartlari(yilOzeti(dolu, kimlik), { kisiler });
  const foto = kartlar.find((k) => k.id === 'gunfoto');
  const mektup = kartlar.find((k) => k.id === 'mektup');
  assert.match(foto.baslik, /1 gün/);
  assert.equal(foto.eylem.yol, 'sayfalar/gunfoto/');
  assert.match(mektup.baslik, /1 mektup/);
  assert.equal(mektup.eylem.yol, 'sayfalar/mektup/');
  assert.ok(!kartlar.some((k) => k.id === 'bos'));
});
