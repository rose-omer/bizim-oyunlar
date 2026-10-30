import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  katla, eslesmeler, vurguParcalari, mesajAra, yildizlilar, eskiSayfalardaAra, ARA_EN_COK_SAYFA,
} from '../sayfalar/sohbet/arama.js';

const mesaj = (id, kimden, at, data = {}) => ({
  id, author: kimden, data: { metin: id, kimden, ...data }, created_at: at, updated_at: at,
});
const at = (gun, saat = 12) => new Date(Date.UTC(2026, 9, gun, saat)).toISOString();

test('katla: Türkçe büyük/küçük harf ve aksan duyarsız, boşluk sade', () => {
  assert.equal(katla('IĞDIR ışık İzmir').s, 'igdir isik izmir');
  assert.equal(katla('Şeker Çiçek Göz Üzüm Öykü').s, 'seker cicek goz uzum oyku');
  assert.equal(katla('Kâğıt Hûri Îman').s, 'kagit huri iman');
  assert.equal(katla('Café NAÏVE').s, 'cafe naive');
  assert.equal(katla('a  \n\t b').s, 'a b');
  assert.equal(katla('').s, '');
  assert.equal(katla(null).s, '');
  // ayrışık (NFD) yazılmış harf de aynı sonucu verir
  assert.equal(katla('şeker').s, 'seker');
});

test('katla: her katlanmış harf asıl metindeki yerini bilir', () => {
  const k = katla('İyi  Ş');
  assert.equal(k.s, 'iyi s');
  assert.deepEqual(k.bas, [0, 1, 2, 3, 5]);
  assert.deepEqual(k.son, [1, 2, 3, 4, 6]);
  const e = katla('😀 ok');
  assert.equal(e.s, '😀 ok');
  assert.deepEqual(e.bas, [0, 0, 2, 3, 4]); // dizinler UTF-16 birimi: emoji 2 birim
});

test('eslesmeler: asıl metindeki aralıklar, örtüşmeden, soldan sağa', () => {
  assert.deepEqual(eslesmeler('Seni SEVİYORUM, seni!', 'seni'), [[0, 4], [16, 20]]);
  assert.deepEqual(eslesmeler('Işıl ışıl', 'isil'), [[0, 4], [5, 9]]);
  assert.deepEqual(eslesmeler('aaaa', 'aa'), [[0, 2], [2, 4]]);
  assert.deepEqual(eslesmeler('şeker', 'şek'), [[0, 4]]); // ayrışık ş: 2 birim
  assert.deepEqual(eslesmeler('iyi geceler', 'İYİ   GECE'), [[0, 8]]);
  assert.deepEqual(eslesmeler('merhaba', 'xyz'), []);
  assert.deepEqual(eslesmeler('merhaba', '   '), []);
  assert.deepEqual(eslesmeler(null, 'a'), []);
});

test('vurguParcalari: eşleşme vurgulu, uzun metin ilk eşleşme çevresinde kısalır', () => {
  assert.deepEqual(vurguParcalari('Günaydın sevgilim', 'SEVGİ'), [
    { metin: 'Günaydın ', vurgu: false },
    { metin: 'sevgi', vurgu: true },
    { metin: 'lim', vurgu: false },
  ]);
  const uzun = `${'a'.repeat(100)} kalp ${'b'.repeat(100)}`;
  const p = vurguParcalari(uzun, 'kalp', { pencere: 40 });
  assert.equal(p.find((x) => x.vurgu).metin, 'kalp');
  assert.ok(p[0].metin.startsWith('…'));
  assert.ok(p[p.length - 1].metin.endsWith('…'));
  const toplam = p.map((x) => x.metin).join('');
  assert.ok(toplam.length <= 40 + 2, `uzunluk ${toplam.length}`);
  // eşleşme yoksa baştan kısaltılmış düz metin
  assert.deepEqual(vurguParcalari('kısa', 'yok'), [{ metin: 'kısa', vurgu: false }]);
  // satır sonları tek boşluk
  assert.deepEqual(vurguParcalari('a\n\nkalp', 'kalp'), [{ metin: 'a ', vurgu: false }, { metin: 'kalp', vurgu: true }]);
});

test('mesajAra: yalnız metinde arar, yeniden eskiye, silinmiş ve boş sorgu yok', () => {
  const docs = [
    mesaj('m1', 'a', at(1), { metin: 'Bugün çok güzeldi' }),
    mesaj('m2', 'b', at(2), { foto: 'local:x' }), // metinsiz
    mesaj('m3', 'b', at(3), { metin: 'GÜZEL bir gün' }),
    mesaj('m4', 'a', at(4), { metin: 'tamam' }),
  ];
  const r = mesajAra(docs, 'guzel');
  assert.deepEqual(r.map((x) => x.doc.id), ['m3', 'm1']);
  assert.ok(r[0].parcalar.some((p) => p.vurgu && p.metin === 'GÜZEL'));
  assert.deepEqual(mesajAra(docs, '  '), []);
  assert.deepEqual(mesajAra(docs, 'yok'), []);
  assert.deepEqual(mesajAra(null, 'a'), []);
  assert.equal(mesajAra(docs, 'u').length, 2);
  assert.equal(mesajAra(docs, 'u', { enCok: 1 }).length, 1);
});

test('yildizlilar: iki kişinin yıldızları, kime göre süzgeç, yeniden eskiye', () => {
  const docs = [
    mesaj('m1', 'a', at(1), { yildiz: { a: true } }),
    mesaj('m2', 'b', at(2), { yildiz: { b: true } }),
    mesaj('m3', 'b', at(3)),
    mesaj('m4', 'a', at(4), { yildiz: { a: true, b: true } }),
    mesaj('m5', 'a', at(5), { yildiz: { a: false } }), // bozuk/false sayılmaz
  ];
  assert.deepEqual(yildizlilar(docs, { benId: 'a' }).map((d) => d.id), ['m4', 'm2', 'm1']);
  assert.deepEqual(yildizlilar(docs, { benId: 'a', kim: 'ben' }).map((d) => d.id), ['m4', 'm1']);
  assert.deepEqual(yildizlilar(docs, { benId: 'a', kim: 'o' }).map((d) => d.id), ['m4', 'm2']);
  assert.deepEqual(yildizlilar([], { benId: 'a' }), []);
});

test('eskiSayfalardaAra: yeni sonuç bulunca, eski kalmayınca ya da sınırda durur; ilerleme bildirir', async () => {
  // 3 sayfa var, 2. sayfada sonuç çıkar
  let sayfa = 0;
  let sonuc = 0;
  const ilerleme = [];
  const r = await eskiSayfalardaAra({
    yukle: async () => { sayfa++; if (sayfa === 2) sonuc++; return 50; },
    dahaVar: () => sayfa < 3,
    sonucSayisi: () => sonuc,
    ilerleme: (x) => ilerleme.push(x.taranan),
  });
  assert.deepEqual(r, { sayfa: 2, taranan: 100, yeni: 1, bitti: false, durduruldu: false });
  assert.deepEqual(ilerleme, [50, 100]);

  // hiç sonuç yok: sınırda durur
  let n = 0;
  const r2 = await eskiSayfalardaAra({ yukle: async () => { n++; return 50; }, dahaVar: () => true, sonucSayisi: () => 0 });
  assert.equal(r2.sayfa, ARA_EN_COK_SAYFA);
  assert.equal(n, ARA_EN_COK_SAYFA);
  assert.equal(r2.bitti, false);

  // eski kalmadı
  let k = 0;
  const r3 = await eskiSayfalardaAra({ yukle: async () => { k++; return 7; }, dahaVar: () => k < 1, sonucSayisi: () => 0 });
  assert.deepEqual(r3, { sayfa: 1, taranan: 7, yeni: 0, bitti: true, durduruldu: false });

  // kullanıcı durdurdu
  let d = 0;
  const r4 = await eskiSayfalardaAra({ yukle: async () => { d++; return 50; }, dahaVar: () => true, sonucSayisi: () => 0, durdu: () => d >= 2 });
  assert.equal(r4.sayfa, 2);
  assert.equal(r4.durduruldu, true);

  // en az bir sayfa yüklenince durmaz: istenirse sonuç bulunsa da devam (dur: false)
  let e = 0;
  const r5 = await eskiSayfalardaAra({ yukle: async () => { e++; return 50; }, dahaVar: () => e < 3, sonucSayisi: () => e, ilkSonuctaDur: false });
  assert.equal(r5.sayfa, 3);
  assert.equal(r5.bitti, true);
});
