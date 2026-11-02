// Yavrumuz: tuvalet ihtiyacı (sayfalar/yavru/tuvalet.js). Saf mantık, DOM yok.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DK, SAAT, GUN, IHTIYACLAR, EYLEMLER, oku, ihtiyaclar, eylemYap } from '../sayfalar/yavru/mantik.js';
import {
  TUVALET_ARTIS, ESIK, KAZA_SURE, KAZA_TEMIZLIK, KAZA_GOSTER, YEMEK_ARTIS, LAZIMLIK, CIS_VAR, KAZA_METNI,
  tuvaletOku, tuvaletDegeri, tuvaletDurumu, kazaYamasi, tuvaletYamasi, lazimlikKalan, lazimlikEylemi,
} from '../sayfalar/yavru/tuvalet.js';
import { applyPatch } from '../js/core/veri.js';

const A = 'omer-test-id';
const B = 'gul-test-id';
const T0 = Date.UTC(2026, 9, 30, 9, 0, 0);
const iso = (ms) => new Date(ms).toISOString();
const sonra = (dk) => T0 + dk * DK;
const kayit = (v, ms = T0) => ({ v, t: iso(ms) });

/** Ham belge verisi: çatlamış yavru, ihtiyaçlar 100 (T0), tuvalet verilirse. */
function veri(tuvalet, ek = {}) {
  const ihtiyac = {};
  for (const ad of IHTIYACLAR) ihtiyac[ad] = kayit(100);
  const d = {
    asama: 'kucuk', ad: 'Pamuk', renk: 3, dogum: iso(T0 - 2 * GUN), catlama: iso(T0 - GUN),
    ihtiyac, uyku: null, puan: {}, isitma: {}, son: {}, ...ek,
  };
  if (tuvalet !== undefined) d.tuvalet = tuvalet;
  return d;
}
/** Sayfanın kullanacağı biçim: oku() + ham tuvalet alanı. */
const yv = (data) => ({ ...oku(data), tuvalet: data.tuvalet });
const uygula = (data, yama) => applyPatch(data, yama);

test('sabitler ve LAZIMLIK tanımı (EYLEMLER biçimi)', () => {
  assert.equal(TUVALET_ARTIS, 2);
  assert.equal(ESIK, 70);
  assert.equal(KAZA_SURE, 2 * SAAT);
  assert.equal(KAZA_TEMIZLIK, 20);
  assert.deepEqual({ ...YEMEK_ARTIS }, { mama: 20, meyve: 15, tatli: 10 });
  for (const e of Object.keys(YEMEK_ARTIS)) assert.ok(EYLEMLER[e], e);
  assert.equal(LAZIMLIK.ad, 'Lazımlık');
  assert.equal(LAZIMLIK.emoji, '🚽');
  assert.deepEqual(LAZIMLIK.fiil, ['tuvalete götürdü', 'tuvalete götürdün']);
  assert.ok(LAZIMLIK.bekleme > 0 && typeof LAZIMLIK.tok === 'string');
  assert.equal(CIS_VAR, 'Çişi var 🚽');
  assert.ok(KAZA_METNI.length > 0);
});

test('tuvaletOku: eski/bozuk alan varsayılana düşer', () => {
  assert.deepEqual(tuvaletOku(undefined), { v: 0, t: null, kaza: null });
  assert.deepEqual(tuvaletOku({ v: 'x', t: 'dün', kaza: 5 }), { v: 0, t: null, kaza: null });
  assert.deepEqual(tuvaletOku({ v: 150, t: iso(T0) }), { v: 100, t: iso(T0), kaza: null });
});

test('eski belge (alan yok): 0 kalır, kaza yok; ilk yemek kaydı başlatır', () => {
  const d = veri(undefined);
  const y = yv(d);
  assert.equal(tuvaletDegeri(y, sonra(30 * 60)), 0);
  assert.equal(kazaYamasi(y, { kim: A, simdi: sonra(100 * 60) }), null);
  assert.equal(tuvaletDurumu(y, T0).cisVar, false);
  const yama = tuvaletYamasi(y, { simdi: T0, artis: YEMEK_ARTIS.mama });
  assert.deepEqual(yama, { tuvalet: { v: 20, t: iso(T0) } });
  // ham veriyle de çalışır
  assert.deepEqual(tuvaletYamasi(d, { simdi: T0, artis: 20 }), yama);
});

test('yumurtada tuvalet yok', () => {
  const y = yv({ asama: 'yumurta', dogum: iso(T0), tuvalet: kayit(90) });
  assert.equal(tuvaletDegeri(y, sonra(600)), 0);
  assert.equal(tuvaletDurumu(y, T0), null);
  assert.equal(tuvaletYamasi(y, { simdi: T0, artis: 20 }), null);
  assert.equal(kazaYamasi(y, { kim: A, simdi: sonra(6000) }), null);
  assert.deepEqual(lazimlikEylemi(y, { kim: A, simdi: T0 }), { hata: 'yumurta' });
  assert.equal(tuvaletDurumu(null, T0), null);
});

test('zamanla artar (saatte 2), uykuda yarı hız', () => {
  const y = yv(veri(kayit(10)));
  assert.equal(tuvaletDegeri(y, sonra(5 * 60)), 20);
  const uyku = { bas: iso(sonra(60)), bit: iso(sonra(9 * 60)) };
  const yu = yv(veri(kayit(10), { uyku }));
  // 1 sa uyanık (+2), 8 sa uyku (+8), 1 sa uyanık (+2)
  assert.equal(tuvaletDegeri(yu, sonra(10 * 60)), 22);
});

test('yemek sıkışıklığı artırır; eşikte "Çişi var" ve kazaya kalan süre', () => {
  let d = veri(kayit(55));
  let y = yv(d);
  assert.equal(tuvaletDurumu(y, T0).cisVar, false);
  d = uygula(d, tuvaletYamasi(y, { simdi: T0, artis: YEMEK_ARTIS.meyve }));
  y = yv(d);
  const du = tuvaletDurumu(y, sonra(30));
  assert.equal(du.cisVar, true);
  assert.equal(du.deger, 71);
  assert.equal(du.kazaAn, T0 + KAZA_SURE);
  assert.equal(du.kalan, KAZA_SURE - 30 * DK);
  assert.equal(du.sonKaza, null);
  assert.equal(du.yeniKaza, false);
});

test('eylemYap yamasıyla birleşir (mama: tokluk + tuvalet)', () => {
  const d = veri(kayit(0), { ihtiyac: { ...veri().ihtiyac, tokluk: kayit(40) } });
  const y = yv(d);
  const r = eylemYap(y, { eylem: 'mama', kim: A, simdi: T0 });
  const yama = { ...r.yama, ...tuvaletYamasi(y, { simdi: T0, artis: YEMEK_ARTIS.mama }) };
  const sonuc = uygula(d, yama);
  assert.equal(sonuc.ihtiyac.tokluk.v, 70);
  assert.deepEqual(sonuc.tuvalet, { v: 20, t: iso(T0) });
});

test('kaza: süre dolunca temizlik düşer, sıkışıklık sıfırlanır, puan yok', () => {
  const d = veri(kayit(ESIK), { puan: { [A]: 5 } });
  const y = yv(d);
  assert.equal(kazaYamasi(y, { kim: A, simdi: T0 + KAZA_SURE - 1 }), null, 'süre dolmadan kaza yok');
  const simdi = T0 + KAZA_SURE + 10 * DK;
  const k = kazaYamasi(y, { kim: A, simdi });
  const an = T0 + KAZA_SURE;
  assert.equal(k.kayitId, `kaza-${an}`);
  assert.deepEqual(k.kayit, { eylem: 'kaza', kim: A, at: iso(an) });
  // temizlik 100 − 2 sa × 2 = 96 → 76 (kaza anında)
  assert.deepEqual(k.yama['ihtiyac.temizlik'], { v: 96 - KAZA_TEMIZLIK, t: iso(an) });
  assert.deepEqual(k.yama.tuvalet, { v: 0, t: iso(an), kaza: iso(an) });
  assert.ok(!Object.keys(k.yama).some((x) => x.startsWith('puan.')));
  const sonra1 = yv(uygula(d, k.yama));
  assert.equal(sonra1.puan[A], 5);
  const du = tuvaletDurumu(sonra1, simdi);
  assert.equal(du.deger, 0.3);
  assert.equal(du.cisVar, false);
  assert.equal(du.sonKaza, iso(an));
  assert.equal(du.yeniKaza, true);
  assert.equal(tuvaletDurumu(sonra1, an + KAZA_GOSTER).yeniKaza, false);
});

test('kaza iki cihazda bir kez: aynı tabandan aynı yama, yazıldıktan sonra yeniden hesaplanmaz', () => {
  const d = veri(kayit(ESIK));
  const simdi = T0 + KAZA_SURE + 5 * DK;
  const ka = kazaYamasi(yv(d), { kim: A, simdi });
  const kb = kazaYamasi(yv(d), { kim: B, simdi: simdi + 3 * DK });
  assert.deepEqual(ka.yama, kb.yama);
  assert.equal(ka.kayitId, kb.kayitId);
  const bir = uygula(d, ka.yama);
  const iki = uygula(bir, kb.yama);
  assert.deepEqual(iki, bir, 'ikinci uygulama değiştirmez');
  assert.equal(ihtiyaclar(oku(iki), simdi).temizlik, ihtiyaclar(oku(bir), simdi).temizlik);
  assert.equal(kazaYamasi(yv(bir), { kim: B, simdi: simdi + 10 * DK }), null);
});

test('kazadan sonra yıkanmışsa temizlik düşmez', () => {
  const ih = { ...veri().ihtiyac, temizlik: kayit(90, T0 + KAZA_SURE + 5 * DK) };
  const d = veri(kayit(ESIK), { ihtiyac: ih });
  const k = kazaYamasi(yv(d), { kim: A, simdi: T0 + KAZA_SURE + 10 * DK });
  assert.equal(k.yama['ihtiyac.temizlik'], undefined);
  assert.equal(k.yama.tuvalet.v, 0);
});

test('uzun yoklukta kazalar sırayla; temizlik 0 altına inmez', () => {
  const d = veri(kayit(ESIK), { ihtiyac: { ...veri().ihtiyac, temizlik: kayit(30) } });
  // 1. kaza T0+2sa; sonra 0→70: 35 sa, +2 sa → 2. kaza T0+39sa
  const k = kazaYamasi(yv(d), { kim: A, simdi: T0 + 40 * SAAT });
  const ikinci = T0 + 39 * SAAT;
  assert.equal(k.kayitId, `kaza-${ikinci}`);
  assert.deepEqual(k.yama.tuvalet, { v: 0, t: iso(ikinci), kaza: iso(ikinci) });
  assert.deepEqual(k.yama['ihtiyac.temizlik'], { v: 0, t: iso(ikinci) });
});

test('uykuda kaza olmaz: uyanıştan KAZA_SURE sonraya kayar', () => {
  const uyku = { bas: iso(sonra(60)), bit: iso(sonra(9 * 60)) };
  const d = veri(kayit(ESIK), { uyku });
  const y = yv(d);
  assert.equal(kazaYamasi(y, { kim: A, simdi: sonra(8 * 60) }), null);
  assert.equal(tuvaletDurumu(y, sonra(8 * 60)).kazaAn, sonra(9 * 60) + KAZA_SURE);
  assert.ok(kazaYamasi(y, { kim: A, simdi: sonra(11 * 60) }));
});

test('tuvaletYamasi olmuş kazayı içerir (kaza yazılmadan yemek verilse de kaybolmaz)', () => {
  const d = veri(kayit(ESIK));
  const simdi = T0 + KAZA_SURE + 60 * DK;
  const yama = tuvaletYamasi(yv(d), { simdi, artis: YEMEK_ARTIS.mama });
  assert.equal(yama['ihtiyac.temizlik'].v, 96 - KAZA_TEMIZLIK);
  assert.deepEqual(yama.tuvalet, { v: 22, t: iso(simdi), kaza: iso(T0 + KAZA_SURE) });
});

test('lazımlık: çişi varken sıfırlar ve puan verir', () => {
  const d = veri(kayit(ESIK), { puan: { [A]: 3 }, son: { [A]: { mama: iso(T0) } } });
  const r = lazimlikEylemi(yv(d), { kim: A, simdi: sonra(30) });
  assert.equal(r.puan, true);
  assert.equal(r.mesaj, null);
  assert.deepEqual(r.kayit, { eylem: 'lazimlik', kim: A, at: iso(sonra(30)) });
  assert.deepEqual(r.yama.tuvalet, { v: 0, t: iso(sonra(30)) });
  assert.equal(r.yama[`puan.${A}`], 4);
  assert.deepEqual(r.yama[`son.${A}`], { mama: iso(T0), lazimlik: iso(sonra(30)) });
  for (const k of Object.keys(r.yama)) assert.ok(k.split('.').length <= 2, k);
  const sonuc = yv(uygula(d, r.yama));
  assert.equal(tuvaletDurumu(sonuc, sonra(31)).cisVar, false);
});

test('lazımlık: ihtiyaç yokken yapılır ama puan vermez; keyifsizken yarım puan', () => {
  const r = lazimlikEylemi(yv(veri(kayit(30))), { kim: A, simdi: T0 });
  assert.equal(r.puan, false);
  assert.equal(r.mesaj, LAZIMLIK.tok);
  assert.equal(r.yama[`puan.${A}`], undefined);
  assert.equal(r.yama.tuvalet.v, 0);
  const r2 = lazimlikEylemi(yv(veri(kayit(80))), { kim: B, simdi: T0, puanArtis: 0.5 });
  assert.equal(r2.yama[`puan.${B}`], 0.5);
});

test('lazımlık: kişi başı bekleme, uykuda olmaz', () => {
  let d = veri(kayit(ESIK));
  const r = lazimlikEylemi(yv(d), { kim: A, simdi: T0 });
  d = uygula(d, r.yama);
  const y = yv(d);
  assert.equal(lazimlikKalan(y, A, sonra(5)), LAZIMLIK.bekleme - 5 * DK);
  assert.deepEqual(lazimlikEylemi(y, { kim: A, simdi: sonra(5) }), { hata: 'bekle', kalan: LAZIMLIK.bekleme - 5 * DK });
  assert.ok(lazimlikEylemi(y, { kim: B, simdi: sonra(5) }).yama, 'partnerin beklemesi ayrı');
  assert.ok(lazimlikEylemi(y, { kim: A, simdi: T0 + LAZIMLIK.bekleme }).yama);
  const uyku = { bas: iso(T0), bit: iso(sonra(8 * 60)) };
  assert.deepEqual(lazimlikEylemi(yv(veri(kayit(80), { uyku })), { kim: A, simdi: sonra(60) }), { hata: 'uyuyor' });
});

test('lazımlık kaza süresi geçmişse: kaza da uygulanır, puan yok', () => {
  const d = veri(kayit(ESIK));
  const r = lazimlikEylemi(yv(d), { kim: A, simdi: T0 + KAZA_SURE + 10 * DK });
  assert.equal(r.puan, false);
  assert.equal(r.yama['ihtiyac.temizlik'].v, 96 - KAZA_TEMIZLIK);
  assert.equal(r.yama.tuvalet.kaza, iso(T0 + KAZA_SURE));
});
