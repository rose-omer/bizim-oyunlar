import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_METIN, gunAnahtari, gunEtiketi, saatEtiketi, gonderen, satirlar, baglantilar, kisalt, ozet,
  metniTemizle, metinHatasi, tepkiDegistir, tepkiOzeti, okunduHedefi, gorulduBilgisi, sadeceEmoji,
  yaziyorGonderilsinMi, altaYakinMi,
} from '../sayfalar/sohbet/mantik.js';

// Yerel saatle tarih üret (testler saat diliminden bağımsız kalsın).
const an = (y, mo, d, h = 12, mi = 0) => new Date(y, mo - 1, d, h, mi).toISOString();
const mesaj = (id, kimden, at, data = {}) => ({
  id, author: kimden, data: { metin: id, kimden, ...data }, created_at: at, updated_at: at,
});

test('gün anahtarı ve saat yerel zamana göre', () => {
  assert.equal(gunAnahtari(an(2026, 10, 30, 23, 59)), '2026-10-30');
  assert.equal(gunAnahtari(an(2026, 1, 5, 0, 1)), '2026-01-05');
  assert.equal(gunAnahtari('olmaz'), '');
  assert.equal(saatEtiketi(an(2026, 10, 30, 9, 5)), '09:05');
  assert.equal(saatEtiketi(an(2026, 10, 30, 21, 40)), '21:40');
  assert.equal(saatEtiketi(null), '');
});

test('gün etiketi: Bugün, Dün, gün ay, başka yılda yıl da', () => {
  const simdi = new Date(2026, 9, 30, 10, 0);
  assert.equal(gunEtiketi(an(2026, 10, 30, 1), simdi), 'Bugün');
  assert.equal(gunEtiketi(an(2026, 10, 29, 23, 50), simdi), 'Dün');
  assert.equal(gunEtiketi(an(2026, 10, 12), simdi), '12 Ekim');
  assert.equal(gunEtiketi(an(2026, 2, 1), simdi), '1 Şubat');
  assert.equal(gunEtiketi(an(2025, 12, 31), simdi), '31 Aralık 2025');
  assert.equal(gunEtiketi(an(2026, 1, 1), new Date(2026, 0, 2, 0, 30)), 'Dün');
});

test('gonderen: data.kimden önce, yoksa author', () => {
  assert.equal(gonderen({ author: 'b', data: { kimden: 'a' } }), 'a');
  assert.equal(gonderen({ author: 'b', data: {} }), 'b');
  assert.equal(gonderen(null), null);
});

test('satirlar: gün ayırıcı + art arda mesaj gruplama', () => {
  const simdi = new Date(2026, 9, 30, 18, 0);
  const docs = [
    mesaj('m1', 'a', an(2026, 10, 29, 22, 0)),
    mesaj('m2', 'a', an(2026, 10, 30, 9, 0)),
    mesaj('m3', 'a', an(2026, 10, 30, 9, 2)),
    mesaj('m4', 'b', an(2026, 10, 30, 9, 3)),
    mesaj('m5', 'a', an(2026, 10, 30, 9, 4)),
    mesaj('m6', 'a', an(2026, 10, 30, 9, 30)), // 26 dk ara: yeni grup
  ];
  const r = satirlar(docs, { benId: 'a', simdi });
  assert.deepEqual(r.map((x) => (x.tur === 'gun' ? `#${x.etiket}` : x.doc.id)),
    ['#Dün', 'm1', '#Bugün', 'm2', 'm3', 'm4', 'm5', 'm6']);
  const by = Object.fromEntries(r.filter((x) => x.tur === 'mesaj').map((x) => [x.doc.id, x]));
  assert.deepEqual([by.m1.ilk, by.m1.son], [true, true]); // gün değişince grup kopar
  assert.deepEqual([by.m2.ilk, by.m2.son], [true, false]);
  assert.deepEqual([by.m3.ilk, by.m3.son], [false, true]);
  assert.deepEqual([by.m4.ilk, by.m4.son, by.m4.benim], [true, true, false]);
  assert.deepEqual([by.m5.ilk, by.m5.son], [true, true]);
  assert.deepEqual([by.m6.ilk, by.m6.son, by.m6.benim], [true, true, true]);
  assert.equal(r[0].anahtar, 'gun-2026-10-29');
  assert.equal(by.m2.anahtar, 'm2');
  assert.deepEqual(satirlar([], { benId: 'a' }), []);
});

test('satirlar: tepki yazan karşı taraf olsa da gönderen değişmez', () => {
  const d = { id: 'x', author: 'b', data: { metin: 'selam', kimden: 'a', tepki: { b: '❤️' } }, created_at: an(2026, 10, 30), updated_at: an(2026, 10, 30, 13) };
  assert.equal(satirlar([d], { benId: 'a' })[1].benim, true);
});

test('baglantilar: yalnız http/https, sondaki noktalama dışarıda', () => {
  assert.deepEqual(baglantilar('merhaba'), [{ tur: 'metin', metin: 'merhaba' }]);
  assert.deepEqual(baglantilar('bak https://ornek.com/a?b=1. güzel'), [
    { tur: 'metin', metin: 'bak ' },
    { tur: 'baglanti', metin: 'https://ornek.com/a?b=1', href: 'https://ornek.com/a?b=1' },
    { tur: 'metin', metin: '. güzel' },
  ]);
  assert.deepEqual(baglantilar('(http://x.com/y)'), [
    { tur: 'metin', metin: '(' },
    { tur: 'baglanti', metin: 'http://x.com/y', href: 'http://x.com/y' },
    { tur: 'metin', metin: ')' },
  ]);
  const wiki = baglantilar('https://tr.wikipedia.org/wiki/Kedi_(hayvan)');
  assert.equal(wiki.length, 1);
  assert.equal(wiki[0].metin, 'https://tr.wikipedia.org/wiki/Kedi_(hayvan)');
  for (const kotu of ['javascript:alert(1)', 'data:text/html,x', 'ftp://a.com', 'www.a.com', 'https://']) {
    assert.ok(baglantilar(kotu).every((s) => s.tur === 'metin'), kotu);
  }
  assert.equal(baglantilar('<img src=x onerror=alert(1)>')[0].tur, 'metin');
  const iki = baglantilar('https://a.com ve https://b.com!');
  assert.deepEqual(iki.filter((s) => s.tur === 'baglanti').map((s) => s.href), ['https://a.com/', 'https://b.com/']);
  assert.deepEqual(baglantilar(''), []);
});

test('kisalt ve ozet', () => {
  assert.equal(kisalt('kısa', 10), 'kısa');
  assert.equal(kisalt('abcdefghij', 5), 'abcd…');
  assert.equal(kisalt('a😀😀😀😀', 3), 'a😀…'); // emoji ortadan bölünmez
  assert.equal(kisalt('  boşluklu\n\nmetin  ', 50), 'boşluklu metin');
  assert.equal(ozet({ metin: 'x'.repeat(100) }).length, 80);
  assert.equal(ozet({ foto: 'local:1' }), '📷 Fotoğraf');
  assert.equal(ozet({ foto: 'local:1', metin: 'alt yazı' }), '📷 alt yazı');
  assert.equal(ozet({}), '');
  assert.equal(ozet(null), '');
});

test('metin temizleme ve sınırlar', () => {
  assert.equal(metniTemizle('  selam \n\n'), 'selam');
  assert.equal(metniTemizle('a\r\nb'), 'a\nb');
  assert.equal(metniTemizle(null), '');
  assert.equal(metinHatasi(''), 'Boş mesaj gönderilemez.');
  assert.equal(metinHatasi('x'.repeat(MAX_METIN)), null);
  assert.match(metinHatasi('x'.repeat(MAX_METIN + 1)), /4000/);
  assert.equal(MAX_METIN, 4000);
});

test('tepki değiştir: ekle, değiştir, aynısıyla kaldır; özet', () => {
  let t = tepkiDegistir(undefined, 'a', '❤️');
  assert.deepEqual(t, { a: '❤️' });
  t = tepkiDegistir(t, 'b', '❤️');
  assert.deepEqual(t, { a: '❤️', b: '❤️' });
  t = tepkiDegistir(t, 'a', '😂');
  assert.deepEqual(t, { a: '😂', b: '❤️' });
  assert.deepEqual(tepkiOzeti(t, 'a'), [{ emoji: '😂', sayi: 1, benim: true }, { emoji: '❤️', sayi: 1, benim: false }]);
  assert.deepEqual(tepkiOzeti({ a: '❤️', b: '❤️' }, 'b'), [{ emoji: '❤️', sayi: 2, benim: true }]);
  t = tepkiDegistir({ a: '❤️' }, 'a', '❤️');
  assert.equal(t, null);
  assert.deepEqual(tepkiOzeti(null, 'a'), []);
  assert.deepEqual(tepkiOzeti({ a: 5, b: '' }, 'a'), []); // bozuk değerler yok sayılır
});

test('okunduHedefi: karşı tarafın en son (gönderilmiş) mesajı, yalnız ilerlerken', () => {
  const docs = [mesaj('m1', 'b', an(2026, 10, 30, 9)), mesaj('m2', 'a', an(2026, 10, 30, 10)), mesaj('m3', 'b', an(2026, 10, 30, 11)), mesaj('m4', 'a', an(2026, 10, 30, 12))];
  assert.equal(okunduHedefi(docs, 'a', null), 'm3');
  assert.equal(okunduHedefi(docs, 'a', 'm1'), 'm3');
  assert.equal(okunduHedefi(docs, 'a', 'm3'), null);
  assert.equal(okunduHedefi(docs, 'a', 'm4'), null); // zaten daha ilerisi
  assert.equal(okunduHedefi(docs.filter((d) => d.data.kimden === 'a'), 'a', null), null);
  const bekleyen = [...docs, { ...mesaj('m5', 'b', an(2026, 10, 30, 13)), pending: true }];
  assert.equal(okunduHedefi(bekleyen, 'a', 'm3'), null);
});

test('gorulduBilgisi: son mesaj benimse durumunu verir', () => {
  const docs = [mesaj('m1', 'b', an(2026, 10, 30, 9)), mesaj('m2', 'a', an(2026, 10, 30, 10)), mesaj('m3', 'a', an(2026, 10, 30, 11))];
  const okb = (son, at) => ({ id: 'b', data: { son, at } });
  assert.deepEqual(gorulduBilgisi(docs, [], 'a'), { id: 'm3', durum: 'gonderildi', at: null });
  assert.deepEqual(gorulduBilgisi(docs, [okb('m2', an(2026, 10, 30, 10, 5))], 'a').durum, 'gonderildi');
  assert.deepEqual(gorulduBilgisi(docs, [okb('m3', an(2026, 10, 30, 11, 1))], 'a'), { id: 'm3', durum: 'goruldu', at: an(2026, 10, 30, 11, 1) });
  // kendi okundu belgem sayılmaz
  assert.equal(gorulduBilgisi(docs, [{ id: 'a', data: { son: 'm3', at: an(2026, 10, 30, 12) } }], 'a').durum, 'gonderildi');
  // son mesaj onunsa durum gösterilmez
  assert.equal(gorulduBilgisi([...docs, mesaj('m4', 'b', an(2026, 10, 30, 12))], [], 'a'), null);
  // bekleyen
  const bek = [...docs.slice(0, 2), { ...mesaj('m9', 'a', an(2026, 10, 30, 13)), pending: true }];
  assert.equal(gorulduBilgisi(bek, [okb('m2', an(2026, 10, 30, 12))], 'a').durum, 'gonderiliyor');
  // 'son' silinmiş/yüklenmemiş: zamana bak
  assert.equal(gorulduBilgisi(docs, [okb('yok', an(2026, 10, 30, 11, 30))], 'a').durum, 'goruldu');
  assert.equal(gorulduBilgisi(docs, [okb('yok', an(2026, 10, 30, 10, 30))], 'a').durum, 'gonderildi');
  assert.equal(gorulduBilgisi([], [], 'a'), null);
});

test('sadeceEmoji: 1–3 emoji büyük gösterilir', () => {
  assert.equal(sadeceEmoji('❤️'), true);
  assert.equal(sadeceEmoji(' 😂😂 '), true);
  assert.equal(sadeceEmoji('👩‍❤️‍👨'), true);
  assert.equal(sadeceEmoji('🇹🇷'), true);
  assert.equal(sadeceEmoji('😀😀😀😀'), false);
  assert.equal(sadeceEmoji('selam ❤️'), false);
  assert.equal(sadeceEmoji('123'), false);
  assert.equal(sadeceEmoji(''), false);
});

test('yazıyor sinyali en çok 2 sn\'de bir', () => {
  assert.equal(yaziyorGonderilsinMi(0, 5000), true);
  assert.equal(yaziyorGonderilsinMi(5000, 6999), false);
  assert.equal(yaziyorGonderilsinMi(5000, 7000), true);
});

test('altaYakinMi', () => {
  assert.equal(altaYakinMi({ scrollHeight: 2000, scrollTop: 1300, clientHeight: 600 }), true);
  assert.equal(altaYakinMi({ scrollHeight: 2000, scrollTop: 1000, clientHeight: 600 }), false);
  assert.equal(altaYakinMi({ scrollHeight: 500, scrollTop: 0, clientHeight: 600 }), true);
});
