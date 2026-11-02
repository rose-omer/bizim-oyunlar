// Yavrumuz: dokunma tepkileri (sayfalar/yavru/dokunma.js). Saf mantık, DOM yok.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bolgeBul, bolgeler, tepki, cokDurtuldu, gecmisEkle, BOLGE_ADI, DURTME_PENCERE, DURTME_SINIR,
  erkenUyanma, uyandirmaTepkisi, SAKIN, sallaBaslat, sallaIlerle, SALLA_GENLIK, SALLA_SALINIM,
} from '../sayfalar/yavru/dokunma.js';
import { BEBEK_RUHLARI } from '../sayfalar/yavru/bebek.js';

const T0 = Date.UTC(2026, 10, 2, 9, 0, 0);

test('bolgeBul: büyük bebekte baş, burun, yanak, karın, el, ayak', () => {
  assert.equal(bolgeBul(100, 30, 'buyuk'), 'bas', 'saç/alın');
  assert.equal(bolgeBul(79, 75, 'buyuk'), 'bas', 'göz de baş sayılır');
  assert.equal(bolgeBul(100, 89, 'buyuk'), 'burun');
  assert.equal(bolgeBul(68, 94, 'buyuk'), 'yanak');
  assert.equal(bolgeBul(132, 92, 'buyuk'), 'yanak');
  assert.equal(bolgeBul(100, 140, 'buyuk'), 'karin');
  assert.equal(bolgeBul(67, 160, 'buyuk'), 'el');
  assert.equal(bolgeBul(133, 158, 'buyuk'), 'el');
  assert.equal(bolgeBul(86, 178, 'buyuk'), 'ayak');
  assert.equal(bolgeBul(114, 174, 'buyuk'), 'ayak');
  assert.equal(bolgeBul(5, 5, 'buyuk'), null, 'boşluk');
  assert.equal(bolgeBul(195, 150, 'buyuk'), null);
});

test('bolgeBul: küçükte el/ayak yok (kundak); yumurtada ve bozuk girdide null', () => {
  assert.equal(bolgeBul(100, 70, 'kucuk'), 'bas');
  assert.equal(bolgeBul(100, 108, 'kucuk'), 'burun');
  assert.equal(bolgeBul(78, 111, 'kucuk'), 'yanak');
  assert.equal(bolgeBul(100, 160, 'kucuk'), 'karin');
  assert.deepEqual(bolgeler('kucuk').sort(), ['bas', 'burun', 'karin', 'yanak']);
  assert.deepEqual(bolgeler('buyuk').sort(), ['ayak', 'bas', 'burun', 'el', 'karin', 'yanak']);
  assert.deepEqual(bolgeler('yumurta'), []);
  assert.equal(bolgeBul(100, 100, 'yumurta'), null);
  assert.equal(bolgeBul(NaN, 100, 'buyuk'), null);
  assert.equal(bolgeBul(100, undefined, 'buyuk'), null);
  for (const b of bolgeler('buyuk')) assert.ok(BOLGE_ADI[b], b);
});

test('tepki: bölgeye göre ifade; yalnız baş ve karın sev dener', () => {
  const t = (b) => tepki(b, [], T0);
  assert.equal(t('karin').ruh, 'kahkaha');
  assert.equal(t('karin').animasyon, 'gidik');
  assert.equal(t('bas').ruh, 'huzur');
  assert.equal(t('burun').ruh, 'hapsu');
  assert.equal(t('yanak').ruh, 'sasirma');
  assert.equal(t('el').animasyon, 'salla');
  assert.equal(t('ayak').animasyon, 'salla');
  for (const b of ['karin', 'bas']) assert.equal(t(b).sev, true, b);
  for (const b of ['burun', 'yanak', 'el', 'ayak']) assert.equal(t(b).sev, false, b);
  for (const b of bolgeler('buyuk')) {
    const r = t(b);
    assert.ok(BEBEK_RUHLARI.includes(r.ruh), `${b}: çizimde var`);
    assert.ok(r.sure > 0 && r.sure <= 5000, `${b}: kısa`);
    assert.ok(r.metin, b);
    assert.equal(r.bolge, b);
  }
  assert.equal(tepki(null, [], T0), null);
  assert.equal(tepki('kuyruk', [], T0), null);
  assert.equal(tepki('__proto__', [], T0), null);
});

test('art arda çok dürtme: 3 sn içinde 6. dokunuş ağlatır; sev yok; sonra sakinleşir', () => {
  let g = [];
  for (let i = 0; i < DURTME_SINIR - 1; i++) {
    const an = T0 + i * 400;
    assert.notEqual(tepki('karin', g, an).ruh, 'aglama', `${i + 1}. dokunuş`);
    g = gecmisEkle(g, an);
  }
  const an = T0 + (DURTME_SINIR - 1) * 400;
  const r = tepki('burun', g, an);
  assert.equal(r.ruh, 'aglama');
  assert.equal(r.sev, false);
  assert.ok(r.sure >= 2000 && r.sure <= 6000, 'birkaç sn');
  // Pencere geçince (sakinleşti) yine normal tepki.
  assert.equal(tepki('karin', g, an + DURTME_PENCERE + 1).ruh, 'kahkaha');
  // Yavaş dokunuşlar ağlatmaz.
  let y = [];
  for (let i = 0; i < 12; i++) {
    assert.notEqual(tepki('bas', y, T0 + i * 700).ruh, 'aglama', `yavaş ${i}`);
    y = gecmisEkle(y, T0 + i * 700);
  }
});

test('cokDurtuldu ve gecmisEkle: bozuk ve gelecekteki anlar sayılmaz; geçmiş kısa kalır', () => {
  assert.equal(cokDurtuldu(null, T0), false);
  assert.equal(cokDurtuldu([NaN, 'x', T0 + 1000, T0 + 2000, T0 + 3000, T0 + 4000, T0 + 5000], T0), false);
  assert.equal(cokDurtuldu([T0 - 2999, T0 - 2000, T0 - 1500, T0 - 1000, T0 - 10], T0), true);
  assert.equal(cokDurtuldu([T0 - 3000, T0 - 2000, T0 - 1500, T0 - 1000, T0 - 10], T0), false, 'pencere sınırı dışarıda');
  let g = [];
  for (let i = 0; i < 50; i++) g = gecmisEkle(g, T0 + i * 10);
  assert.ok(g.length <= DURTME_SINIR * 2);
  assert.equal(g.at(-1), T0 + 490);
  assert.deepEqual(gecmisEkle([T0 - 5000, T0 - 100], T0), [T0 - 100, T0]);
});

const SA = 3600_000;
const uyku = (basSaat, sureSaat = 8) => ({ bas: new Date(T0 + basSaat * SA).toISOString(), bit: new Date(T0 + (basSaat + sureSaat) * SA).toISOString() });

test('erkenUyanma: uyku süresinin ilk yarısı', () => {
  assert.equal(erkenUyanma(uyku(0), T0 + 1 * SA), true);
  assert.equal(erkenUyanma(uyku(0), T0 + 3.99 * SA), true);
  assert.equal(erkenUyanma(uyku(0), T0 + 4 * SA), false, 'tam yarı: erken değil');
  assert.equal(erkenUyanma(uyku(0), T0 + 7 * SA), false);
  assert.equal(erkenUyanma(uyku(0), T0 + 9 * SA), false, 'uyku bitmiş');
  assert.equal(erkenUyanma(uyku(1), T0), false, 'henüz başlamamış');
  assert.equal(erkenUyanma(null, T0), false);
  assert.equal(erkenUyanma({ bas: 'x', bit: 'y' }, T0), false);
  assert.equal(erkenUyanma(uyku(0, 0), T0), false, 'boş aralık');
});

test('uyandirmaTepkisi: erken uyandırınca kısa ağlama, geç uyandırınca yok', () => {
  const r = uyandirmaTepkisi(uyku(0), T0 + SA);
  assert.equal(r.ruh, 'aglama');
  assert.equal(r.sev, false);
  assert.ok(r.sure >= 2000 && r.sure <= 8000);
  assert.ok(r.metin.length > 0);
  assert.equal(uyandirmaTepkisi(uyku(0), T0 + 6 * SA), null);
  assert.ok(BEBEK_RUHLARI.includes(SAKIN.ruh));
  assert.equal(SAKIN.ruh, 'huzur');
});

test('sallaIlerle: sağ-sol-sağ üç salınım tamamlar; küçük titreme sayılmaz', () => {
  const G = SALLA_GENLIK;
  let s = sallaBaslat(100);
  const yol = (xs) => {
    let t = false;
    for (const x of xs) { const r = sallaIlerle(s, x); s = r.s; t = r.tamam; }
    return t;
  };
  assert.equal(yol([105, 95, 108, 92]), false, 'titreme');
  assert.equal(s.n, 0);
  assert.equal(yol([100 + G]), false);
  assert.equal(s.n, 1);
  assert.equal(yol([100 + G + 20, 100]), false, 'sola dönüş: 2. salınım');
  assert.equal(s.n, 2);
  assert.equal(yol([100 - 30, 100 - 30 + G - 1]), false, 'genlik dolmadı');
  assert.equal(yol([100 - 30 + G]), true, '3. salınım');
  assert.equal(SALLA_SALINIM, 3);
  const once = sallaBaslat(0);
  assert.deepEqual(sallaIlerle(once, NaN), { s: once, tamam: false });
  assert.deepEqual(sallaIlerle(null, 5), { s: null, tamam: false });
});
