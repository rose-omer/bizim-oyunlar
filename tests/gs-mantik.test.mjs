// Günün Sorusu: saf mantık (gün numarası, soru seçimi, durum, seri, arşiv).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BASLANGIC, CEVAP_MAX, gunNo, gunTarihi, hashStr, gununSorusu, soruSecici, docId, cevapOku,
  gunlereGore, gunDurumu, ortakGunler, seri, seriMetni, haftaSeridi, arsiv, normalize, cevapHatasi,
} from '../sayfalar/gunun-sorusu/mantik.js';

const S = Array.from({ length: 12 }, (_, i) => ({ id: `q${i}`, k: 'hafif', s: `Soru ${i}?` }));
const doc = (gun, kim, cevap, at = '2026-10-30T10:00:00.000Z') => ({
  id: docId(gun, kim), data: { gun, cevap }, author: kim, created_at: at, updated_at: at,
});

test('gunNo: 2026-01-01 = 0, yerel gün; yaz saatinden etkilenmez', () => {
  assert.equal(BASLANGIC, '2026-01-01');
  assert.equal(gunNo('2026-01-01'), 0);
  assert.equal(gunNo('2026-01-02'), 1);
  assert.equal(gunNo('2026-10-30'), 302);
  assert.equal(gunNo('2025-12-31'), -1);
  assert.equal(gunNo(new Date(2026, 9, 30, 23, 59)), 302);
  assert.equal(gunNo(new Date(2026, 9, 31, 0, 1)), 303);
  assert.equal(gunTarihi(302), '2026-10-30');
  assert.equal(gunTarihi(0), '2026-01-01');
});

test('hashStr kararlı ve 32 bit', () => {
  assert.equal(hashStr('testpaka23'), hashStr('testpaka23'));
  assert.notEqual(hashStr('testpaka23'), hashStr('testpaka24'));
  const v = hashStr('');
  assert.ok(Number.isInteger(v) && v >= 0 && v < 2 ** 32);
});

test('gununSorusu: aynı oda + aynı gün = aynı soru (iki cihaz)', () => {
  assert.equal(gununSorusu(S, 'odaa', 5).id, gununSorusu(S, 'odaa', 5).id);
  assert.equal(gununSorusu([], 'odaa', 5), null);
  // Farklı odalar farklı sıra görür.
  const a = Array.from({ length: 12 }, (_, g) => gununSorusu(S, 'odaa', g).id).join();
  const b = Array.from({ length: 12 }, (_, g) => gununSorusu(S, 'odab', g).id).join();
  assert.notEqual(a, b);
});

test('gununSorusu: bir turda tekrar yok; tur geçişinde ardışık aynı soru yok', () => {
  for (const oda of ['testpaka23', 'abcdefghjk', 'zzzz']) {
    const sec = soruSecici(S, oda);
    for (let tur = -1; tur < 6; tur++) {
      const ids = S.map((_, i) => sec(tur * S.length + i).id);
      assert.equal(new Set(ids).size, S.length, `${oda} tur ${tur}`);
    }
    for (let g = -30; g < 80; g++) assert.notEqual(sec(g).id, sec(g + 1).id, `${oda} gün ${g}`);
  }
});

test('docId ve cevapOku', () => {
  assert.equal(docId(302, 'omer-test-id'), '302-omer-test-id');
  assert.deepEqual(cevapOku(doc(302, 'omer-test-id', '  Merhaba  ')),
    { gun: 302, kim: 'omer-test-id', cevap: 'Merhaba', at: '2026-10-30T10:00:00.000Z' });
  assert.equal(cevapOku({ id: '302-x', data: { gun: 302, cevap: '   ' } }), null, 'boş cevap sayılmaz');
  assert.equal(cevapOku({ id: 'bozuk', data: { cevap: 'a' } }), null);
  assert.equal(cevapOku(null), null);
  // Negatif gün (saat yanlışsa) de okunur.
  assert.equal(cevapOku(doc(-3, 'a-b', 'x')).kim, 'a-b');
});

test('gunDurumu: ben / partner / ikisi', () => {
  const docs = [doc(302, 'ben', 'Benim'), doc(302, 'o', 'Onun'), doc(301, 'o', 'Dün')];
  const m = gunlereGore(docs);
  const d = gunDurumu(m, 302, 'ben');
  assert.equal(d.ben.cevap, 'Benim');
  assert.equal(d.partner.cevap, 'Onun');
  assert.equal(d.partner.kim, 'o');
  assert.equal(d.ikisi, true);
  const dun = gunDurumu(m, 301, 'ben');
  assert.equal(dun.ben, null);
  assert.equal(dun.partner.cevap, 'Dün');
  assert.equal(dun.ikisi, false);
  assert.deepEqual(gunDurumu(m, 100, 'ben'), { ben: null, partner: null, ikisi: false });
});

test('gunDurumu: partnerin birden çok cihazı varsa en yeni cevap', () => {
  const m = gunlereGore([
    doc(5, 'o1', 'eski', '2026-01-06T08:00:00.000Z'),
    doc(5, 'o2', 'yeni', '2026-01-06T09:00:00.000Z'),
  ]);
  assert.equal(gunDurumu(m, 5, 'ben').partner.cevap, 'yeni');
});

test('seri: bugün ya da dün biten ardışık ortak günler; en uzun', () => {
  assert.deepEqual(seri(new Set(), 10), { simdi: 0, enUzun: 0, bugunTamam: false });
  assert.deepEqual(seri(new Set([10]), 10), { simdi: 1, enUzun: 1, bugunTamam: true });
  assert.deepEqual(seri(new Set([8, 9]), 10), { simdi: 2, enUzun: 2, bugunTamam: false }, 'dün biten seri sürer');
  assert.deepEqual(seri(new Set([7, 8]), 10), { simdi: 0, enUzun: 2, bugunTamam: false }, 'iki gün boşluk seriyi bitirir');
  assert.deepEqual(seri(new Set([1, 2, 3, 4, 6, 9, 10]), 10), { simdi: 2, enUzun: 4, bugunTamam: true });
  assert.deepEqual(seri([3, 4, 5], 5), { simdi: 3, enUzun: 3, bugunTamam: true }, 'dizi de kabul');
  assert.deepEqual(seri(new Set([11, 12, 13]), 10), { simdi: 0, enUzun: 0, bugunTamam: false }, 'gelecek sayılmaz');
});

test('seriMetni: nazik dil; kırılınca "Yeniden başlayalım", alev yok, rekor yalnız varsa', () => {
  const tamam = seriMetni({ simdi: 3, enUzun: 5, bugunTamam: true });
  assert.deepEqual(tamam, { simge: '🌿', sayi: 3, durum: 'gün üst üste', rekor: 5,
    not: 'Bugün birlikte cevapladınız. Yarın yeni bir soru gelecek.' });
  assert.equal(seriMetni({ simdi: 2, enUzun: 2, bugunTamam: false }).not, 'Bugün de cevaplarsanız 3 gün olacak.');
  const kirildi = seriMetni({ simdi: 0, enUzun: 4, bugunTamam: false });
  assert.deepEqual(kirildi, { simge: '🌱', sayi: null, durum: 'Yeniden başlayalım', rekor: 4,
    not: 'İkiniz de bugün cevaplayınca yeni günler başlar.' });
  const ilk = seriMetni({ simdi: 0, enUzun: 0, bugunTamam: false });
  assert.deepEqual(ilk, { simge: '🌱', sayi: null, durum: 'Hadi başlayalım', rekor: null,
    not: 'İkiniz de bugün cevaplayınca ilk gününüz sayılır.' });
  assert.deepEqual(seriMetni(undefined), ilk);
  for (const s of [tamam, kirildi, ilk]) {
    const metin = `${s.durum} ${s.not}`;
    assert.doesNotMatch(metin, /🔥|kırıl|kaybet|kaçır|bozul/i);
  }
});

test('ortakGunler: yalnız iki ayrı kişinin dolu cevabı olan günler', () => {
  const m = gunlereGore([
    doc(1, 'a', 'x'), doc(1, 'b', 'y'),
    doc(2, 'a', 'x'),
    doc(3, 'a', 'x'), doc(3, 'b', '  '),
  ]);
  assert.deepEqual([...ortakGunler(m)], [1]);
});

test('haftaSeridi: son 7 gün, eskiden yeniye, durumlarla', () => {
  const m = gunlereGore([doc(302, 'ben', 'a'), doc(302, 'o', 'b'), doc(301, 'ben', 'c'), doc(300, 'o', 'd')]);
  const w = haftaSeridi(m, 302, 'ben');
  assert.equal(w.length, 7);
  assert.equal(w[6].gun, 302);
  assert.equal(w[6].tarih, '2026-10-30');
  assert.deepEqual(w.slice(4).map((x) => x.durum), ['partner', 'ben', 'ikisi']);
  assert.equal(w[0].durum, 'yok');
});

test('arsiv: bugün hariç, yeniden eskiye, arama soru ve cevaplarda', () => {
  const m = gunlereGore([
    doc(10, 'ben', 'Deniz kenarı'), doc(10, 'o', 'Dağ evi'),
    doc(9, 'o', 'İstanbul'),
    doc(8, 'ben', 'Kış'),
    doc(11, 'ben', 'bugünkü'),
  ]);
  const hepsi = arsiv(m, { bugun: 11, benId: 'ben', sorular: S, roomId: 'oda' });
  assert.deepEqual(hepsi.map((x) => x.gun), [10, 9, 8]);
  assert.equal(hepsi[0].ben, 'Deniz kenarı');
  assert.equal(hepsi[0].partner, 'Dağ evi');
  assert.equal(hepsi[1].ben, null);
  assert.equal(hepsi[0].soru.id, gununSorusu(S, 'oda', 10).id);
  assert.equal(hepsi[0].tarih, gunTarihi(10));
  // Türkçe büyük/küçük harf: "istanbul" → "İstanbul"
  assert.deepEqual(arsiv(m, { bugun: 11, benId: 'ben', sorular: S, roomId: 'oda', ara: 'istanbul' }).map((x) => x.gun), [9]);
  assert.deepEqual(arsiv(m, { bugun: 11, benId: 'ben', sorular: S, roomId: 'oda', ara: 'DAĞ' }).map((x) => x.gun), [10]);
  const q = gununSorusu(S, 'oda', 8).s;
  assert.ok(arsiv(m, { bugun: 11, benId: 'ben', sorular: S, roomId: 'oda', ara: q }).some((x) => x.gun === 8));
  assert.deepEqual(arsiv(m, { bugun: 11, benId: 'ben', sorular: S, roomId: 'oda', ara: 'yokböyle' }), []);
});

test('normalize: Türkçe küçük harf, boşluk sadeleşir', () => {
  assert.equal(normalize('  İSTANBUL   Işık '), 'istanbul ışık');
  assert.equal(normalize(null), '');
});

test('cevapHatasi: boş ve çok uzun', () => {
  assert.equal(CEVAP_MAX, 1000);
  assert.ok(cevapHatasi('   '));
  assert.equal(cevapHatasi('Selam'), null);
  assert.equal(cevapHatasi('a'.repeat(1000)), null);
  assert.ok(cevapHatasi('a'.repeat(1001)));
});
