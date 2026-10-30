import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SURELER, CAN, ONAY_MS, RED_MIN_MS, DEVAM_MIN_MS, MODLAR, KATEGORILER,
  kucuk, buyuk, sonHarf, sonHarfYeri, kontrol, ipucuSec, puanYaz,
  initialState, reduce, toAction, schedule, resultOf, toplamPuan,
} from '../games/kelime/oyun.js';
import { ONERILER } from '../games/kelime/oneriler.js';

const A = 'aaa', B = 'bbb';
const T0 = 1_000_000;
const yeni = (ayar = {}, ek = {}) => initialState({ players: [A, B], names: { [A]: 'Ömer', [B]: 'Gül' }, ayar, ...ek });
const basla = (s, now = T0) => reduce(s, { type: 'yeni', oyun: s.oyun, now });
const sirada = (s) => s.players[s.sira];
const partner = (s) => s.players[1 - s.sira];
// Sıradaki oyuncu yazar, partner onaylar.
function kelimeEkle(s, k, now = T0, { ipucu = false } = {}) {
  s = reduce(s, { type: 'kelime', by: sirada(s), k, ipucu, now });
  assert.equal(s.faz, 'onay', `"${k}" onaya gitmeli`);
  return reduce(s, { type: 'onay', by: partner(s), evet: true, no: s.bekleyen.no, now });
}

// ---------- Türkçe kurallar ----------
test('Türkçe küçük harf: I → ı, İ → i; kırpar', () => {
  assert.equal(kucuk('  IRMAK '), 'ırmak');
  assert.equal(kucuk('İSTANBUL'), 'istanbul');
  assert.equal(kucuk('Iğdır'), 'ığdır');
  assert.equal(kucuk('İnci'), 'inci', 'ayrık noktalı İ de i olur');
  assert.equal(buyuk('i'), 'İ');
  assert.equal(buyuk('ı'), 'I');
});

test('son harf; ğ ile biterse önceki harf; şapkalı harf düz sayılır', () => {
  assert.equal(sonHarf('elma'), 'a');
  assert.equal(sonHarf('Kitap'), 'p');
  assert.equal(sonHarf('dağ'), 'a');
  assert.equal(sonHarf('Dağ'), 'a');
  assert.equal(sonHarf('çiğ'), 'i');
  assert.equal(sonHarf('sığ'), 'ı');
  assert.equal(sonHarf('BAĞ'), 'a');
  assert.equal(sonHarf('kâğ'), 'a', 'â → a');
  assert.equal(sonHarf('MERCİ'), 'i');
  assert.equal(sonHarf('KAPI'), 'ı');
  assert.equal(sonHarfYeri('dağ'), 1);
  assert.equal(sonHarfYeri('kalem'), 4);
  assert.equal(sonHarf(''), null);
});

test('kontrol: en az 2 harf, yalnız harf, başlangıç harfi, tekrar yasağı', () => {
  assert.equal(kontrol('').neden, 'bos');
  assert.equal(kontrol('a').neden, 'kisa');
  assert.equal(kontrol('el').ok, true);
  assert.equal(kontrol('el ma').neden, 'harf');
  assert.equal(kontrol('elma1').neden, 'harf');
  assert.equal(kontrol('elma!').neden, 'harf');
  assert.equal(kontrol('show').neden, 'harf', 'w Türk alfabesinde yok');
  assert.equal(kontrol('a'.repeat(31)).neden, 'uzun');
  assert.deepEqual(kontrol('  ARMUT ', { harf: 'a' }), { ok: true, kelime: 'armut' });
  const k = kontrol('kiraz', { harf: 'a' });
  assert.equal(k.neden, 'baslangic');
  assert.match(k.mesaj, /^A ile/);
  assert.equal(kontrol('İnek', { harf: 'i' }).ok, true, 'İ → i');
  assert.equal(kontrol('Irmak', { harf: 'ı' }).ok, true, 'I → ı');
  assert.equal(kontrol('Irmak', { harf: 'i' }).neden, 'baslangic', 'ı ≠ i');
  assert.equal(kontrol('ilik', { harf: 'ı' }).neden, 'baslangic');
  assert.equal(kontrol('âşık', { harf: 'a' }).ok, true, 'â, a yerine geçer');
  assert.equal(kontrol('ELMA', { kullanilan: ['elma'] }).neden, 'tekrar');
  assert.equal(kontrol('elma', { kullanilan: ['ELMA'] }).neden, 'tekrar');
  assert.equal(kontrol('kâr', { kullanilan: ['kar'] }).ok, true, 'kâr ile kar ayrı kelime');
});

test('öneri listesi: ğ dışında her harf 20+ kelime; hepsi geçerli, tekrarsız, harfiyle başlar', () => {
  const alfabe = 'abcçdefghıijklmnoöprsştuüvyz'.split('');
  assert.deepEqual(Object.keys(ONERILER).sort(), alfabe.slice().sort());
  for (const h of alfabe) {
    const list = ONERILER[h];
    assert.ok(list.length >= 20, `${h}: ${list.length}`);
    assert.equal(new Set(list).size, list.length, `${h}: tekrar var`);
    for (const k of list) {
      assert.equal(kontrol(k, { harf: h }).ok, true, `${h}: ${k}`);
      assert.equal(kucuk(k), k, `${k} küçük harf olmalı`);
    }
  }
});

test('ipucuSec: harfe uyar, kullanılanı vermez, biterse null', () => {
  const k = ipucuSec('j', [], () => 0);
  assert.equal(k, ONERILER.j[0]);
  const hepsiBirden = ONERILER.j.slice(0, -1);
  assert.equal(ipucuSec('j', hepsiBirden, () => 0.99), ONERILER.j.at(-1));
  assert.equal(ipucuSec('j', ONERILER.j), null);
  assert.equal(ipucuSec('ğ', []), null);
  assert.ok(ipucuSec(null, []), 'serbest harfte de öneri var');
  assert.equal(ipucuSec('k', ['KALEM'], () => 0), ONERILER.k[1], 'büyük harfle yazılmışı da sayar');
});

test('puanYaz: yarım puan virgülle', () => {
  assert.equal(puanYaz(11.5), '11,5');
  assert.equal(puanYaz(3), '3');
  assert.equal(puanYaz(0), '0');
});

// ---------- Akış ----------
test('kurulum → başla: sıra ve süre, ilk kelime serbest', () => {
  let s = yeni();
  assert.equal(s.faz, 'kurulum');
  assert.deepEqual(s.ayar, { mod: 'birlikte', sure: 20, kategori: 'serbest' });
  s = basla(s);
  assert.equal(s.faz, 'oyun');
  assert.equal(s.oyun, 1);
  assert.equal(s.sira, 0);
  assert.equal(s.harf, null);
  assert.deepEqual(s.canlar, [CAN]);
  assert.equal(s.bitis, T0 + 20_000);
  assert.equal(s.olay.tur, 'basla');
});

test('zincir: son harf kuralı, ğ kuralı, sıra değişimi, tekrar yasağı', () => {
  let s = basla(yeni());
  s = kelimeEkle(s, 'Dağ', T0 + 1000);
  assert.equal(s.harf, 'a', 'dağ → a');
  assert.equal(s.sira, 1);
  assert.equal(s.zincir[0].k, 'dağ', 'küçük harfle saklanır');
  assert.equal(s.bitis, T0 + 1000 + 20_000, 'yeni sıra tam süre');
  // yanlış harf: durum değişmez
  assert.equal(reduce(s, { type: 'kelime', by: B, k: 'kiraz', now: T0 + 2000 }), s);
  // sırası olmayan yazamaz
  assert.equal(reduce(s, { type: 'kelime', by: A, k: 'ağaç', now: T0 + 2000 }), s);
  s = kelimeEkle(s, 'AĞAÇ', T0 + 2000);
  assert.equal(s.harf, 'ç');
  s = kelimeEkle(s, 'çilek', T0 + 3000);
  s = kelimeEkle(s, 'kitap', T0 + 4000);
  s = kelimeEkle(s, 'Portakal', T0 + 5000);
  s = kelimeEkle(s, 'limon', T0 + 6000);
  s = kelimeEkle(s, 'nar', T0 + 7000);
  assert.equal(s.zincir.length, 7);
  assert.deepEqual(s.zincir.map((z) => z.by), [0, 1, 0, 1, 0, 1, 0]);
  assert.equal(s.harf, 'r');
  // tekrar yasak (zincirde "reçel" yok, ama "rende" sonra tekrar denenir)
  s = kelimeEkle(s, 'rende', T0 + 8000);
  s = kelimeEkle(s, 'elma', T0 + 9000);
  assert.equal(s.harf, 'a');
  s = kelimeEkle(s, 'armut', T0 + 9500);
  s = kelimeEkle(s, 'tren', T0 + 9600);
  s = kelimeEkle(s, 'nane', T0 + 9700);
  assert.equal(s.harf, 'e');
  const tekrar = reduce(s, { type: 'kelime', by: sirada(s), k: 'ELMA', now: T0 + 9800 });
  assert.equal(tekrar, s, 'aynı kelime iki kez olmaz');
});

test('onay: yalnız partner cevaplar; eski numara yok sayılır', () => {
  let s = basla(yeni());
  s = reduce(s, { type: 'kelime', by: A, k: 'elma', now: T0 + 1000 });
  assert.equal(s.faz, 'onay');
  assert.equal(s.bitis, null, 'onayda sıra süresi durur');
  assert.equal(s.bekleyen.bitis, T0 + 1000 + ONAY_MS);
  assert.equal(s.bekleyen.kalan, 19_000);
  assert.equal(s.olay.tur, 'yazdi');
  assert.equal(reduce(s, { type: 'onay', by: A, evet: true, no: s.bekleyen.no, now: T0 + 1500 }), s, 'yazan kendini onaylayamaz');
  assert.equal(reduce(s, { type: 'onay', by: B, evet: true, no: s.bekleyen.no - 1, now: T0 + 1500 }), s, 'eski soru');
  // onay beklerken yeni kelime yazılmaz
  assert.equal(reduce(s, { type: 'kelime', by: A, k: 'armut', now: T0 + 1500 }), s);
  const ok = reduce(s, { type: 'onay', by: B, evet: true, no: s.bekleyen.no, now: T0 + 1500 });
  assert.equal(ok.faz, 'oyun');
  assert.equal(ok.olay.tur, 'kabul');
  assert.equal(ok.olay.oto, false);
});

test('itiraz: sıra yazanda kalır, kalan süre korunur (en az 5 sn), yeniden dener', () => {
  let s = basla(yeni());
  s = reduce(s, { type: 'kelime', by: A, k: 'elmaa', now: T0 + 17_000 });
  const no = s.bekleyen.no;
  s = reduce(s, { type: 'onay', by: B, evet: false, no, now: T0 + 18_000 });
  assert.equal(s.faz, 'oyun');
  assert.equal(s.sira, 0, 'sıra yazanda');
  assert.equal(s.zincir.length, 0, 'kelime eklenmedi');
  assert.equal(s.olay.tur, 'red');
  assert.equal(s.olay.k, 'elmaa');
  assert.equal(s.bitis, T0 + 18_000 + RED_MIN_MS, 'kalan 3 sn → en az 5 sn');
  assert.deepEqual(s.canlar, [CAN], 'itiraz can almaz');
  // aynı soruya ikinci cevap etkisiz
  assert.equal(reduce(s, { type: 'onay', by: B, evet: true, no, now: T0 + 18_100 }), s);
  s = kelimeEkle(s, 'elma', T0 + 19_000);
  assert.equal(s.zincir.length, 1);
  assert.equal(s.sira, 1);
  // bol süreyle itiraz: kalan aynen döner
  let t = reduce(s, { type: 'kelime', by: B, k: 'ayva', now: T0 + 21_000 });
  t = reduce(t, { type: 'onay', by: A, evet: false, no: t.bekleyen.no, now: T0 + 22_000 });
  assert.equal(t.bitis, T0 + 22_000 + 18_000);
});

test('onay süresi: 5 sn cevap yoksa kabul (zamanlayıcı)', () => {
  let s = basla(yeni());
  s = reduce(s, { type: 'kelime', by: A, k: 'elma', now: T0 + 1000 });
  const plan = schedule(s);
  assert.equal(plan.action.type, 'onayZaman');
  assert.equal(plan.at, T0 + 1000 + ONAY_MS);
  assert.equal(reduce(s, { ...plan.action, now: plan.at - 1 }), s, 'erken uyanma etkisiz');
  s = reduce(s, { ...plan.action, now: plan.at });
  assert.equal(s.faz, 'oyun');
  assert.equal(s.zincir[0].k, 'elma');
  assert.equal(s.olay.oto, true);
  assert.equal(s.sira, 1);
});

test('süre: biterse can gider, sıra öbürüne geçer, harf aynı; sınırsızda zamanlayıcı yok', () => {
  let s = basla(yeni());
  s = kelimeEkle(s, 'elma', T0 + 1000);
  const plan = schedule(s);
  assert.equal(plan.action.type, 'sure');
  assert.equal(reduce(s, { type: 'sure', now: plan.at - 1 }), s);
  s = reduce(s, { type: 'sure', now: plan.at });
  assert.deepEqual(s.canlar, [CAN - 1]);
  assert.equal(s.olay.tur, 'sure');
  assert.equal(s.olay.by, 1);
  assert.equal(s.sira, 0);
  assert.equal(s.harf, 'a');
  assert.equal(s.bitis, plan.at + 20_000);
  assert.notEqual(schedule(s).key, plan.key, 'yeni süre yeni anahtar');
  // geç gelen kelime yok sayılır
  const gec = reduce(s, { type: 'kelime', by: A, k: 'armut', now: s.bitis });
  assert.equal(gec, s);
  // süre ayarı 10 sn ve sınırsız
  const on = basla(yeni({ sure: 10 }));
  assert.equal(on.bitis, T0 + 10_000);
  const sinirsiz = basla(yeni({ sure: 0 }));
  assert.equal(sinirsiz.bitis, null);
  assert.equal(schedule(sinirsiz), null);
  assert.deepEqual(SURELER, [10, 20, 30, 0]);
});

test('birlikte: ortak 3 can biterse oyun biter, rekor güncellenir', () => {
  let s = basla(yeni({ sure: 10 }, { rekor: 1 }));
  s = kelimeEkle(s, 'elma', T0);
  s = kelimeEkle(s, 'armut', T0, { ipucu: true });
  assert.deepEqual(s.puan, [1, 0.5], 'ipucu yarım puan');
  assert.equal(toplamPuan(s), 1.5);
  s = reduce(s, { type: 'sure', now: s.bitis });             // Ömer'in süresi: ortak can 2
  s = reduce(s, { type: 'pas', by: sirada(s), now: T0 + 30_000 }); // Gül pas: ortak can 1
  assert.deepEqual(s.canlar, [1]);
  assert.equal(s.olay.tur, 'pas');
  assert.equal(s.faz, 'oyun');
  s = reduce(s, { type: 'sure', now: s.bitis });
  assert.equal(s.faz, 'bitti');
  assert.deepEqual(s.canlar, [0]);
  assert.equal(s.kazanan, null);
  assert.equal(s.rekor, 2);
  assert.equal(s.yeniRekor, true);
  assert.equal(schedule(s), null);
  const r = resultOf(s);
  assert.equal(r.mod, 'birlikte');
  assert.equal(r.zincir, 2);
  assert.equal(r.rekor, 2);
  assert.equal(r.toplam, 1.5);
  assert.equal(r.yeniRekor, true);
  // rekor geçilmezse yeniRekor yok
  let t = basla(s, T0 + 60_000);
  for (let i = 0; i < 3; i++) t = reduce(t, { type: 'pas', by: sirada(t), now: T0 + 60_000 });
  assert.equal(t.faz, 'bitti');
  assert.equal(t.rekor, 2);
  assert.equal(t.yeniRekor, false);
});

test('karşı karşıya: her oyuncunun 3 canı; canı biten kaybeder', () => {
  let s = basla(yeni({ mod: 'karsi' }));
  assert.deepEqual(s.canlar, [CAN, CAN]);
  s = kelimeEkle(s, 'kalem', T0);                     // Ömer → Gül
  s = reduce(s, { type: 'sure', now: s.bitis });      // Gül -1, sıra Ömer
  assert.deepEqual(s.canlar, [3, 2]);
  assert.equal(s.harf, 'm');
  s = kelimeEkle(s, 'masa', T0 + 21_000);             // Ömer → Gül
  s = reduce(s, { type: 'pas', by: B, now: T0 + 22_000 }); // Gül -1
  assert.deepEqual(s.canlar, [3, 1]);
  assert.equal(sirada(s), A);
  s = reduce(s, { type: 'pas', by: A, now: T0 + 23_000 }); // Ömer -1
  assert.deepEqual(s.canlar, [2, 1]);
  s = reduce(s, { type: 'pas', by: B, now: T0 + 24_000 }); // Gül 0 → Ömer kazanır
  assert.equal(s.faz, 'bitti');
  assert.equal(s.kazanan, 0);
  assert.equal(s.rekor, 0, 'karşı karşıya rekor tutmaz');
  const r = resultOf(s);
  assert.equal(r.kazanan, 0);
  assert.deepEqual(r.canlar, [2, 0]);
  assert.equal(r.zincir, 2);
});

test('numaralı tekrar: aynı anda iki "Tekrar" tek oyun açar; başlayan değişir', () => {
  let s = basla(yeni({ sure: 10 }));
  for (let i = 0; i < 3; i++) s = reduce(s, { type: 'pas', by: sirada(s), now: T0 });
  assert.equal(s.faz, 'bitti');
  const g = s.oyun;
  const a1 = toAction({ type: 'yeni', oyun: g }, A, s, { hostId: A, now: T0 + 1 });
  const b1 = toAction({ type: 'yeni', oyun: g }, B, s, { hostId: A, now: T0 + 2 });
  s = reduce(s, a1);
  assert.equal(s.oyun, g + 1);
  assert.equal(s.faz, 'oyun');
  assert.equal(s.baslayan, 1, '2. oyunu Gül başlar');
  const once = s;
  s = reduce(s, b1);
  assert.equal(s, once, 'ikinci istek yok sayılır');
  // oyun sürerken "yeni" etkisiz
  assert.equal(reduce(s, { type: 'yeni', oyun: s.oyun, now: T0 }), s);
});

test('kurulum ve ayar: oyun sürerken ayar değişmez; kuruluma dönüş numaralı', () => {
  let s = yeni();
  s = reduce(s, toAction({ type: 'ayar', ayar: { mod: 'karsi', sure: 30, kategori: 'hayvan' } }, B, s, { hostId: A, now: T0 }));
  assert.deepEqual(s.ayar, { mod: 'karsi', sure: 30, kategori: 'hayvan' });
  const ayni = reduce(s, { type: 'ayar', ayar: { mod: 'yok', sure: 15, kategori: 'x' } });
  assert.equal(ayni, s, 'geçersiz ayar yok sayılır');
  s = basla(s);
  assert.equal(reduce(s, { type: 'ayar', ayar: { sure: 10 } }), s);
  assert.equal(reduce(s, { type: 'kurulum', oyun: s.oyun - 1 }), s, 'eski oyun numarası');
  s = reduce(s, { type: 'kurulum', oyun: s.oyun });
  assert.equal(s.faz, 'kurulum');
  assert.equal(s.bitis, null);
  assert.equal(schedule(s), null);
  s = reduce(s, { type: 'ayar', ayar: { sure: 0 } });
  assert.equal(s.ayar.sure, 0);
  assert.ok(MODLAR.birlikte && MODLAR.karsi);
  assert.equal(KATEGORILER.length, 5);
});

test('ara: partner yokken süre durur; dönünce kalan (en az 3 sn) sürer', () => {
  let s = basla(yeni());
  s = reduce(s, { type: 'durdur', now: T0 + 4000 });
  assert.deepEqual(s.durak, { ms: 16_000 });
  assert.equal(schedule(s), null);
  assert.equal(reduce(s, { type: 'kelime', by: A, k: 'elma', now: T0 + 5000 }), s, 'arada oynanmaz');
  assert.equal(reduce(s, { type: 'durdur', now: T0 + 5000 }), s);
  s = reduce(s, { type: 'devam', now: T0 + 60_000 });
  assert.equal(s.durak, null);
  assert.equal(s.bitis, T0 + 76_000);
  // süresi geçmiş ara (ev sahibi yenilendi): en az 3 sn
  let t = reduce(s, { type: 'durdur', now: s.bitis + 500 });
  t = reduce(t, { type: 'devam', now: T0 + 90_000 });
  assert.equal(t.bitis, T0 + 90_000 + DEVAM_MIN_MS);
  // onayda ara: onay süresi durur
  let o = reduce(s, { type: 'kelime', by: A, k: 'elma', now: T0 + 61_000 });
  o = reduce(o, { type: 'durdur', now: T0 + 62_000 });
  assert.equal(o.bekleyen.bitis, null);
  assert.equal(reduce(o, { type: 'onay', by: B, evet: true, no: o.bekleyen.no, now: T0 + 62_500 }), o);
  o = reduce(o, { type: 'devam', now: T0 + 70_000 });
  assert.equal(o.bekleyen.bitis, T0 + 70_000 + 4000);
  // durdur/devam yalnız ev sahibinden
  assert.equal(toAction({ type: 'durdur' }, B, s, { hostId: A, now: 1 }), null);
  assert.deepEqual(toAction({ type: 'durdur' }, A, s, { hostId: A, now: 1 }), { type: 'durdur', now: 1 });
  // kurulumda ara etkisiz
  assert.equal(reduce(yeni(), { type: 'durdur', now: 1 }).durak, null);
});

test('rekor niyeti: yalnız daha büyük tam sayı kabul', () => {
  let s = yeni({}, { rekor: 5 });
  assert.equal(s.rekor, 5);
  assert.equal(reduce(s, { type: 'rekor', n: 4 }), s);
  assert.equal(reduce(s, { type: 'rekor', n: 'x' }), s);
  assert.equal(reduce(s, { type: 'rekor', n: 9 }).rekor, 9);
  assert.equal(yeni({}, { rekor: -3 }).rekor, 0);
});

test('koltuk: başka cihazdan dönen partner oyundaki yerine oturur', () => {
  let s = basla(yeni());
  s = kelimeEkle(s, 'elma', T0);
  const yeniId = 'ccc';
  const a = toAction({ type: 'seat', ids: [A, yeniId], names: { [yeniId]: 'Gül' } }, A, s, { hostId: A, now: T0 });
  s = reduce(s, a);
  assert.deepEqual(s.players, [A, yeniId]);
  assert.equal(s.zincir.length, 1);
  assert.equal(toAction({ type: 'seat', ids: [B, A] }, B, s, { hostId: A, now: T0 }), null, 'misafir koltuk değiştiremez');
});

test('toAction: bilinmeyen ve bozuk niyetler null', () => {
  const s = yeni();
  assert.equal(toAction({ type: 'yok' }, A, s, { hostId: A, now: 1 }), null);
  assert.equal(toAction(null, A, s, { hostId: A, now: 1 }), null);
  assert.equal(toAction({ type: 'kelime', k: 5 }, A, s, { hostId: A, now: 1 }), null);
  assert.equal(toAction({ type: 'ayar' }, A, s, { hostId: A, now: 1 }), null);
  assert.equal(toAction({ type: 'sure' }, A, s, { hostId: A, now: 1 }), null, 'zamanlayıcı eylemi niyetle gelmez');
});
