// Yavrumuz görev serisi ve görev jetonu (sayfalar/yavru/seri.js, gorev.js). Saf mantık, DOM yok.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays } from '../js/core/gunler.js';
import { applyPatch } from '../js/core/veri.js';
import { oku } from '../sayfalar/yavru/mantik.js';
import { GOREV_JETON, SERI_ODUL, seriOku, seriDurumu, seriIlerle, seriOdulu } from '../sayfalar/yavru/seri.js';
import { odulYamasi, odullendiMi, gorevJetonTopla } from '../sayfalar/yavru/gorev.js';
import { jetonBakiye, jetonKaydi, jetonKazan, GUNLUK_SINIR, URUNLER } from '../sayfalar/yavru/jeton.js';

const A = 'omer-test-id';
const B = 'gul-test-id';
const GUN = '2026-11-10';
const AN = new Date(2026, 10, 10, 12).getTime();
const KISILER = [A, B];
const veri = (ek = {}) => ({ asama: 'buyuk', ad: 'Pamuk', renk: 2, catlama: '2026-10-01T09:00:00.000Z', puan: { [A]: 10, [B]: 7 }, ...ek });

/** n gün üst üste ödül: son belge. */
function gunlerBoyu(d, bas, n) {
  let x = d;
  for (let i = 0; i < n; i++) x = applyPatch(x, odulYamasi(x, addDays(bas, i), KISILER, { gorevId: 'x', simdi: AN }));
  return x;
}

test('seriOku: eski ve bozuk alan güvenli', () => {
  assert.deepEqual(seriOku(undefined), { n: 0, son: null, en: 0, telafi: null });
  assert.deepEqual(seriOku({ n: 'x', son: 'dün', en: -3, telafi: 5 }), { n: 0, son: null, en: 0, telafi: null });
  assert.deepEqual(seriOku({ n: 4, son: GUN, en: 9 }), { n: 4, son: GUN, en: 9, telafi: null });
});

test('seriIlerle: ardışık artar, en tutulur, aynı ve eski gün değiştirmez', () => {
  const k1 = seriIlerle({}, GUN);
  assert.deepEqual(k1, { n: 1, son: GUN, en: 1 });
  const k2 = seriIlerle({ gorevSeri: k1 }, addDays(GUN, 1));
  assert.deepEqual(k2, { n: 2, son: addDays(GUN, 1), en: 2 });
  assert.deepEqual(seriIlerle({ gorevSeri: k2 }, addDays(GUN, 1)), k2, 'aynı gün');
  assert.deepEqual(seriIlerle({ gorevSeri: k2 }, GUN), k2, 'saati geri cihaz');
});

test('telafi: tek kaçan gün haftada bir affedilir; ikinci kaçış ve iki gün kırar', () => {
  const k = { n: 5, son: GUN, en: 5 };
  const t = seriIlerle({ gorevSeri: k }, addDays(GUN, 2));
  assert.deepEqual(t, { n: 6, son: addDays(GUN, 2), en: 6, telafi: addDays(GUN, 1) });
  // 7 gün dolmadan ikinci kaçış: seri 1'e döner, en kalır.
  const kir = seriIlerle({ gorevSeri: t }, addDays(GUN, 4));
  assert.equal(kir.n, 1);
  assert.equal(kir.en, 6);
  // 7 gün sonra telafi yine var.
  const yine = seriIlerle({ gorevSeri: { ...t, son: addDays(GUN, 7) } }, addDays(GUN, 9));
  assert.equal(yine.n, 7);
  assert.equal(yine.telafi, addDays(GUN, 8));
  // İki gün üst üste kaçan telafi edilmez.
  assert.equal(seriIlerle({ gorevSeri: k }, addDays(GUN, 3)).n, 1);
});

test('seriDurumu: bugün, dün, telafi bekliyor, kırık; sonraki ödül', () => {
  const v = { gorevSeri: { n: 5, son: GUN, en: 5 } };
  const d0 = seriDurumu(v, GUN);
  assert.equal(d0.n, 5);
  assert.equal(d0.bugun, true);
  assert.deepEqual(d0.sonraki, { gun: 7, kalan: 2 });
  assert.equal(seriDurumu(v, addDays(GUN, 1)).n, 5);
  assert.equal(seriDurumu(v, addDays(GUN, 1)).bugun, false);
  const t = seriDurumu(v, addDays(GUN, 2));
  assert.equal(t.n, 5, 'telafi hakkı varken seri görünür');
  assert.equal(t.telafiBekliyor, true);
  assert.equal(seriDurumu({ gorevSeri: { ...v.gorevSeri, telafi: addDays(GUN, -1) } }, addDays(GUN, 2)).n, 0, 'telafi yok');
  assert.equal(seriDurumu(v, addDays(GUN, 3)).n, 0);
  assert.equal(seriDurumu(v, addDays(GUN, 3)).en, 5);
  assert.deepEqual(seriDurumu({}, GUN), { n: 0, en: 0, bugun: false, telafiBekliyor: false, sonraki: { gun: 7, kalan: 7 } });
  assert.equal(seriDurumu({ gorevSeri: { n: 150, son: GUN, en: 150 } }, GUN).sonraki, null);
});

test('seriOdulu: 7/30/100; kıyafet dolaptaysa jeton', () => {
  assert.deepEqual(Object.keys(SERI_ODUL), ['7', '30', '100']);
  assert.equal(seriOdulu(6, {}), null);
  assert.deepEqual(seriOdulu(7, {}), { jeton: SERI_ODUL[7].jeton });
  const k30 = SERI_ODUL[30].kiyafet;
  assert.ok(URUNLER[k30]?.tur === 'kiyafet');
  assert.deepEqual(seriOdulu(30, {}), { kiyafet: k30 });
  assert.deepEqual(seriOdulu(30, { [k30]: { fiyat: 90 } }), { jeton: SERI_ODUL[30].jeton });
  assert.deepEqual(seriOdulu(100, {}), { kiyafet: SERI_ODUL[100].kiyafet });
  for (const o of Object.values(SERI_ODUL)) assert.ok(GOREV_JETON + o.jeton < GUNLUK_SINIR, 'tek gün sınıra sığar');
});

test('odulYamasi: puan yerine jeton kaydı; puan değişmez; seri yazılır', () => {
  const yama = odulYamasi(veri(), GUN, KISILER, { gorevId: 'ikisi-besle', simdi: AN });
  assert.equal(yama[`puan.${A}`], undefined);
  assert.deepEqual(yama.gorevSeri, { n: 1, son: GUN, en: 1 });
  assert.equal(yama[`gorev.${GUN}`].jeton, GOREV_JETON);
  assert.equal(yama[`gorev.${GUN}`].id, 'ikisi-besle');
  const sonra = applyPatch(veri(), yama);
  assert.deepEqual(oku(sonra).puan, { [A]: 10, [B]: 7 });
  assert.ok(odullendiMi(sonra, GUN));
  assert.equal(odulYamasi(sonra, GUN, KISILER), null);
});

test('iki cihaz aynı tabandan yazar: tek seri artışı, kişi başı tek jeton', () => {
  const d = veri({ gorevSeri: { n: 6, son: addDays(GUN, -1), en: 6 } });
  const y1 = odulYamasi(d, GUN, [A, B], { gorevId: 'x', simdi: AN });
  const y2 = odulYamasi(d, GUN, [B, A], { gorevId: 'x', simdi: AN + 900 });
  // A yazdı, A kendi jetonunu aldı, B'nin geç gelen yaması üstüne yazdı.
  let son = applyPatch(d, y1);
  const al = gorevJetonTopla(oku(son), { kim: A, simdi: AN });
  son = applyPatch(son, al.yama);
  son = applyPatch(son, y2);
  assert.equal(son.gorevSeri.n, 7);
  assert.equal(gorevJetonTopla(oku(son), { kim: A, simdi: AN }), null, 'A ikinci kez alamaz');
  const bAl = gorevJetonTopla(oku(son), { kim: B, simdi: AN });
  son = applyPatch(son, bAl.yama);
  assert.equal(gorevJetonTopla(oku(son), { kim: B, simdi: AN }), null);
  const beklenen = GOREV_JETON + SERI_ODUL[7].jeton;
  assert.equal(jetonKaydi(son, A).kazanc, beklenen);
  assert.equal(jetonKaydi(son, B).kazanc, beklenen);
  assert.equal(jetonBakiye(son), beklenen * 2);
});

test('seri ödülü: 7. gün jeton, 30. gün bedava kıyafet (bakiye düşmez), rekor olmadan tekrar yok', () => {
  const d7 = gunlerBoyu(veri(), GUN, 7);
  assert.equal(d7.gorevSeri.n, 7);
  assert.equal(d7.gorev[addDays(GUN, 6)].jeton, GOREV_JETON + SERI_ODUL[7].jeton);
  assert.equal(d7.gorev[addDays(GUN, 6)].seri, 7);
  const d30 = gunlerBoyu(veri(), GUN, 30);
  const k = SERI_ODUL[30].kiyafet;
  assert.equal(d30.dolap[k].fiyat, 0);
  assert.equal(d30.gorev[addDays(GUN, 29)].kiyafet, k);
  assert.equal(jetonBakiye(d30), 0);
  // Seri kırıldı, yeniden 7'ye vardı: en 30 olduğundan ödül yok.
  const kirik = veri({ gorevSeri: { n: 6, son: GUN, en: 30 } });
  const yama = odulYamasi(kirik, addDays(GUN, 1), KISILER, { gorevId: 'x', simdi: AN });
  assert.equal(yama[`gorev.${addDays(GUN, 1)}`].jeton, GOREV_JETON);
  assert.equal(yama[`gorev.${addDays(GUN, 1)}`].seri, undefined);
});

test('gorevJetonTopla: eski kayıt (jetonsuz) sayılmaz; birikmiş günler; işaret korunur', () => {
  const eski = veri({ gorev: { '2026-11-01': { id: 'x', at: 'a' } } });
  assert.equal(gorevJetonTopla(oku(eski), { kim: A, simdi: AN }), null);
  const d = veri({ gorev: { [GUN]: { id: 'x', at: 'a', jeton: 15 }, [addDays(GUN, 1)]: { id: 'y', at: 'a', jeton: 45, seri: 7 } } });
  const r = gorevJetonTopla(oku(d), { kim: A, simdi: AN });
  assert.equal(r.eklenen, 60);
  assert.equal(r.gunler.length, 2);
  assert.equal(r.gunler[1].seri, 7);
  assert.deepEqual(Object.keys(r.yama), [`jeton.${A}`]);
  assert.equal(r.yama[`jeton.${A}`].gorevGun, addDays(GUN, 1));
  // Sonraki kazanç ve satın alma işareti silmez.
  const sonra = applyPatch(d, r.yama);
  const k = jetonKazan(oku(sonra), { kim: A, kaynak: 'oyun', miktar: 5, simdi: AN });
  assert.equal(k.yama[`jeton.${A}`].gorevGun, addDays(GUN, 1));
});

test('gorevJetonTopla: günlük sınıra sığmayan gün yarına kalır, kaybolmaz', () => {
  const gun = '2026-11-10';
  const d = veri({
    gorev: { [gun]: { id: 'x', at: 'a', jeton: 15 } },
    jeton: { [A]: { kazanc: 195, harcama: 0, gun, bugun: 195 } },
  });
  assert.equal(gorevJetonTopla(oku(d), { kim: A, simdi: AN }), null);
  const yarin = new Date(2026, 10, 11, 12).getTime();
  assert.equal(gorevJetonTopla(oku(d), { kim: A, simdi: yarin }).eklenen, 15);
});

test('oku gorevSeri ve evre alanlarını taşır; eski belgede boş', () => {
  assert.deepEqual(oku({ asama: 'kucuk' }).gorevSeri, {});
  assert.deepEqual(oku({ asama: 'kucuk' }).evre, {});
  assert.equal(oku({ gorevSeri: { n: 3 } }).gorevSeri.n, 3);
});

test('belge sınırı: en dolu yeni alanlarla 32 KB altında', () => {
  const gun = (i) => addDays(GUN, i);
  const gorev = Object.fromEntries(Array.from({ length: 7 }, (_, i) => [gun(i), { id: 'lazimlik-oyna', at: new Date(AN).toISOString(), jeton: 165, seri: 100, kiyafet: 'pijama' }]));
  const dolap = Object.fromEntries(Object.keys(URUNLER).map((u) => [u, { at: new Date(AN).toISOString(), kim: A, fiyat: 150 }]));
  const d = veri({
    gorev, dolap, gorevSeri: { n: 999, son: GUN, en: 999, telafi: GUN },
    evre: { ay1: { at: new Date(AN).toISOString() }, ay3: { at: new Date(AN).toISOString() }, ay6: { at: new Date(AN).toISOString() }, yas1: { at: new Date(AN).toISOString() } },
    jeton: { [A]: { kazanc: 99999, harcama: 99999, gun: GUN, bugun: 200, gorevGun: GUN }, [B]: { kazanc: 99999, harcama: 99999, gun: GUN, bugun: 200, gorevGun: GUN } },
  });
  assert.ok(new TextEncoder().encode(JSON.stringify(d)).length < 32 * 1024);
});
