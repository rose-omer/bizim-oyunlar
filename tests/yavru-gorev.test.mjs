// Yavrumuz günlük ortak görev: saf mantık (sayfalar/yavru/gorev.js). DOM yok.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GOREVLER, GOREV_BONUS, GOREV_TUT, gununGorevi, gorevDurumu, odulYamasi, odullendiMi, gorevOzeti,
} from '../sayfalar/yavru/gorev.js';
import { EYLEMLER, oku } from '../sayfalar/yavru/mantik.js';
import { applyPatch } from '../js/core/veri.js';
import { toDay, addDays } from '../js/core/gunler.js';

const A = 'omer-test-id';
const B = 'gul-test-id';
const ODA = 'testpaka23';
const GUN = '2026-10-31';
const KISILER = [A, B];
// Yerel saatle kurulur: gün sınırı testi saat diliminden bağımsız olsun.
const an = (gun, sa, dk = 0) => {
  const [y, m, d] = gun.split('-').map(Number);
  return new Date(y, m - 1, d, sa, dk).toISOString();
};
const k = (eylem, kim, at = an(GUN, 12)) => ({ eylem, kim, at });
const gorev = (id) => GOREVLER.find((g) => g.id === id);
const durum = (id, kayitlar, kisiler = KISILER) => gorevDurumu(gorev(id), kayitlar, { gun: GUN, kisiler });

/** Ham belge verisi (oku() 'gorev' alanını taşımaz; ödül kontrolü ham veriyle). */
const kucukVeri = (ek = {}) => ({
  asama: 'kucuk', ad: 'Pamuk', renk: 3, dogum: an('2026-10-28', 9), catlama: an('2026-10-29', 9),
  ihtiyac: {}, uyku: null, puan: { [A]: 10, [B]: 7 }, isitma: {}, son: {}, ...ek,
});

test('görev havuzu: 8–12 görev, tekil id, metin, emoji, geçerli koşul', () => {
  assert.ok(GOREVLER.length >= 8 && GOREVLER.length <= 12, `${GOREVLER.length}`);
  assert.equal(new Set(GOREVLER.map((g) => g.id)).size, GOREVLER.length);
  for (const g of GOREVLER) {
    assert.match(g.id, /^[a-z0-9-]+$/);
    assert.ok(typeof g.metin === 'string' && g.metin.trim() === g.metin && g.metin.length > 5, g.id);
    assert.ok(typeof g.emoji === 'string' && g.emoji.length > 0, g.id);
    const kosul = g.kosul;
    assert.ok(['herkes', 'toplam', 'ayri'].includes(kosul.tur), g.id);
    const listeler = kosul.tur === 'ayri' ? kosul.roller : [kosul.eylemler];
    if (kosul.tur === 'ayri') assert.equal(kosul.roller.length, 2, g.id);
    else assert.ok(Number.isInteger(kosul.adet) && kosul.adet >= 1, g.id);
    for (const l of listeler) {
      assert.ok(l.length > 0, g.id);
      for (const e of l) assert.ok(EYLEMLER[e], `${g.id}: ${e}`);
      assert.ok(!l.includes('uyandir'), `${g.id}: uyandırmak bakım sayılmaz`);
    }
  }
});

test('gununGorevi: oda + gün ile deterministik, iki cihaz aynı görevi görür', () => {
  const g = gununGorevi(ODA, GUN);
  assert.ok(GOREVLER.includes(g));
  assert.equal(gununGorevi(ODA, GUN), g, 'aynı girdi aynı görev');
  assert.equal(gununGorevi(ODA, new Date(2026, 9, 31, 23, 59)), g, 'Date (yerel gün) de olur');
  assert.equal(gununGorevi(ODA, 'bozuk'), null);
  // Ardışık günlerde bir turda (havuz uzunluğu) tekrar yok; tur sınırında art arda aynı görev yok.
  const n = GOREVLER.length;
  const seri = Array.from({ length: 3 * n }, (_, i) => gununGorevi(ODA, addDays('2026-01-01', i)).id);
  for (let t = 0; t < 3; t++) assert.equal(new Set(seri.slice(t * n, (t + 1) * n)).size, n, `tur ${t}`);
  for (let i = 1; i < seri.length; i++) assert.notEqual(seri[i], seri[i - 1], `gün ${i}`);
  // Odalar farklı sıra görür.
  const baska = Array.from({ length: n }, (_, i) => gununGorevi('baskaoda99', addDays('2026-01-01', i)).id);
  assert.notDeepEqual(baska, seri.slice(0, n));
});

test('gorevDurumu herkes: ikisi de en az bir kez besler', () => {
  let d = durum('ikisi-besle', []);
  assert.deepEqual(d, { tamam: false, ilerleme: { n: 0, gerek: 2 }, kisiBasi: { [A]: 0, [B]: 0 } });
  d = durum('ikisi-besle', [k('mama', A), k('meyve', A), k('oyna', B)]);
  assert.deepEqual(d, { tamam: false, ilerleme: { n: 1, gerek: 2 }, kisiBasi: { [A]: 2, [B]: 0 } });
  d = durum('ikisi-besle', [k('mama', A), k('tatli', B)]);
  assert.equal(d.tamam, true);
  assert.deepEqual(d.ilerleme, { n: 2, gerek: 2 });
});

test('gorevDurumu herkes adet 3: kişi başı en çok 3 sayılır', () => {
  const d = durum('ikisi-sev-3', [...Array(5).fill(k('sev', A)), k('sev', B), k('sev', B)]);
  assert.equal(d.tamam, false);
  assert.deepEqual(d.ilerleme, { n: 5, gerek: 6 });
  assert.deepEqual(d.kisiBasi, { [A]: 5, [B]: 2 });
  assert.equal(durum('ikisi-sev-3', [...Array(3).fill(k('sev', A)), ...Array(3).fill(k('sev', B))]).tamam, true);
});

test('gorevDurumu toplam: birlikte 3 bakım, ikisi de katkı vermeli', () => {
  let d = durum('birlikte-3', [k('mama', A), k('oyna', A), k('yika', A)]);
  assert.equal(d.tamam, false, 'tek kişi yetmez');
  assert.deepEqual(d.ilerleme, { n: 2, gerek: 3 });
  d = durum('birlikte-3', [k('mama', A), k('oyna', A), k('sev', B)]);
  assert.equal(d.tamam, true);
  assert.deepEqual(d.ilerleme, { n: 3, gerek: 3 });
  d = durum('birlikte-3', [k('mama', A), k('uyandir', B), k('isit', B), k('ad', B)]);
  assert.deepEqual(d.ilerleme, { n: 1, gerek: 3 }, 'uyandır, ısıt, ad bakım sayılmaz');
});

test('gorevDurumu ayri: biri yıkasın biri oynasın (farklı kişiler)', () => {
  assert.equal(durum('yika-oyna', [k('yika', A), k('oyna', A)]).tamam, false, 'aynı kişi iki rolü alamaz');
  assert.deepEqual(durum('yika-oyna', [k('yika', A), k('oyna', A)]).ilerleme, { n: 1, gerek: 2 });
  assert.equal(durum('yika-oyna', [k('yika', A), k('oyna', B)]).tamam, true);
  assert.equal(durum('yika-oyna', [k('oyna', A), k('yika', B)]).tamam, true, 'roller ters de olur');
  assert.equal(durum('yika-oyna', [k('yika', A), k('oyna', A), k('yika', B)]).tamam, true);
  const d = durum('yika-oyna', [k('yika', A), k('yika', B)]);
  assert.deepEqual(d, { tamam: false, ilerleme: { n: 1, gerek: 2 }, kisiBasi: { [A]: 1, [B]: 1 } });
  assert.deepEqual(durum('yika-oyna', []).ilerleme, { n: 0, gerek: 2 });
});

test('gorevDurumu: yalnız o günün kayıtları (yerel gün sınırı)', () => {
  const dun = an(addDays(GUN, -1), 23, 59);
  const yarin = an(addDays(GUN, 1), 0, 0);
  assert.equal(toDay(new Date(an(GUN, 0, 0))), GUN);
  assert.equal(durum('ikisi-besle', [k('mama', A, dun), k('mama', B, an(GUN, 0, 0))]).tamam, false, 'dün sayılmaz');
  assert.equal(durum('ikisi-besle', [k('mama', A, an(GUN, 23, 59)), k('mama', B, yarin)]).tamam, false, 'yarın sayılmaz');
  assert.equal(durum('ikisi-besle', [k('mama', A, an(GUN, 0, 0)), k('mama', B, an(GUN, 23, 59))]).tamam, true);
});

test('gorevDurumu: belge biçimi, silinmiş, bozuk ve yabancı kayıtlar', () => {
  const docs = [
    { id: '1', data: k('mama', A) },
    { id: '2', data: k('mama', B), deleted: true },
    { id: '3', data: { eylem: 'mama', kim: B, at: 'bozuk' } },
    { id: '4', data: k('mama', 'yabanci-id') },
    null, { id: '5' },
  ];
  const d = durum('ikisi-besle', docs);
  assert.equal(d.tamam, false);
  assert.deepEqual(d.kisiBasi, { [A]: 1, [B]: 0 });
  assert.equal(durum('ikisi-besle', [...docs, { id: '6', data: k('meyve', B) }]).tamam, true);
  assert.equal(durum('ikisi-besle', null).tamam, false);
});

test('gorevDurumu: partner yoksa (tek kişi) görev tamamlanmaz', () => {
  const d = durum('birlikte-3', [k('mama', A), k('oyna', A), k('sev', A)], [A]);
  assert.equal(d.tamam, false);
  assert.equal(durum('yika-oyna', [k('yika', A), k('oyna', A)], [A, null]).tamam, false);
  assert.equal(gorevDurumu(null, [], { gun: GUN, kisiler: KISILER }), null);
});

test('odulYamasi: iki kişiye bonus + gün işareti; yama iki düzeyi geçmez', () => {
  const veri = kucukVeri();
  const yama = odulYamasi(veri, GUN, KISILER, { gorevId: 'ikisi-besle', simdi: Date.parse(an(GUN, 13)) });
  assert.deepEqual(yama, {
    [`puan.${A}`]: 10 + GOREV_BONUS,
    [`puan.${B}`]: 7 + GOREV_BONUS,
    [`gorev.${GUN}`]: { id: 'ikisi-besle', at: an(GUN, 13) },
  });
  for (const anahtar of Object.keys(yama)) assert.ok(anahtar.split('.').length <= 2, anahtar);
  const sonra = applyPatch(veri, yama);
  assert.equal(odullendiMi(sonra, GUN), true);
  assert.equal(odulYamasi(sonra, GUN, KISILER), null, 'aynı gün ikinci ödül yok');
  assert.ok(odulYamasi(sonra, addDays(GUN, 1), KISILER), 'ertesi gün yeni ödül');
  assert.deepEqual(oku(sonra).puan, { [A]: 10 + GOREV_BONUS, [B]: 7 + GOREV_BONUS }, 'mantik.js oku puanı görür');
});

test('odulYamasi: çift cihaz yarışında puan bir kez artar (mutlak değer, aynı taban)', () => {
  const veri = kucukVeri({ puan: {} });
  const y1 = odulYamasi(veri, GUN, KISILER, { gorevId: 'x', simdi: Date.parse(an(GUN, 13)) });
  const y2 = odulYamasi(veri, GUN, [B, A], { gorevId: 'x', simdi: Date.parse(an(GUN, 13, 1)) });
  const son = applyPatch(applyPatch(veri, y1), y2);
  assert.deepEqual(son.puan, { [A]: GOREV_BONUS, [B]: GOREV_BONUS });
  assert.equal(Object.keys(son.gorev).length, 1);
});

test('odulYamasi: yumurta, eksik kişi, bozuk gün -> null', () => {
  assert.equal(odulYamasi(kucukVeri({ asama: 'yumurta' }), GUN, KISILER), null);
  assert.equal(odulYamasi(null, GUN, KISILER), null);
  assert.equal(odulYamasi(kucukVeri(), GUN, [A]), null);
  assert.equal(odulYamasi(kucukVeri(), GUN, [A, A]), null, 'aynı kişi iki kez sayılmaz');
  assert.equal(odulYamasi(kucukVeri(), '2026-13-01', KISILER), null);
});

test('odulYamasi: eski gün işaretleri budanır (en çok GOREV_TUT gün kalır)', () => {
  const gorev = {};
  for (let i = 1; i <= GOREV_TUT + 2; i++) gorev[addDays(GUN, -i)] = { id: 'x', at: an(addDays(GUN, -i), 12) };
  const veri = kucukVeri({ gorev });
  const yama = odulYamasi(veri, GUN, KISILER);
  const son = applyPatch(veri, yama);
  const gunler = Object.keys(son.gorev).sort();
  assert.equal(gunler.length, GOREV_TUT);
  assert.equal(gunler.at(-1), GUN);
  assert.equal(gunler[0], addDays(GUN, -(GOREV_TUT - 1)));
  for (const anahtar of Object.keys(yama)) assert.ok(anahtar.split('.').length <= 2, anahtar);
});

test('gorevOzeti: yumurtada görev yok; küçük/büyükte görev, durum ve ödül bilgisi', () => {
  const kayitlar = [k('mama', A), k('meyve', B), k('sev', A), k('sev', B), k('oyna', A), k('yika', B), k('uyut', A), k('sev', B), k('sev', A), k('sev', A)];
  const ozet = (veri) => gorevOzeti(veri, { roomId: ODA, gun: GUN, kayitlar, kisiler: KISILER });
  assert.equal(ozet(kucukVeri({ asama: 'yumurta' })), null);
  assert.equal(ozet(null), null);
  const o = ozet(kucukVeri());
  assert.equal(o.gorev, gununGorevi(ODA, GUN));
  assert.deepEqual({ tamam: o.tamam, ilerleme: o.ilerleme, kisiBasi: o.kisiBasi }, durum(o.gorev.id, kayitlar));
  assert.equal(o.odullendi, false);
  assert.equal(ozet(kucukVeri({ asama: 'buyuk', gorev: { [GUN]: { id: o.gorev.id, at: an(GUN, 9) } } })).odullendi, true);
});
