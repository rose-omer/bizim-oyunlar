// Giydirme Siparişi: saf mantık (sayfalar/yavru/oyunlar/giydir.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as g from '../sayfalar/yavru/oyunlar/giydir.js';
import { YUVALAR, yuvaBul } from '../sayfalar/yavru/giyim.js';
import { URUNLER } from '../sayfalar/yavru/jeton.js';
import { bebekSvg, giyimParcaSvg } from '../sayfalar/yavru/bebek.js';
import { mulberry32 } from '../games/hafiza/rng.js';

const istenmeyen = (s) => s.secenekler.find((id) => !s.siparis.includes(id));
const siparisiBitir = (s) => { for (const id of [...s.siparis]) g.sec(s, id); };
const kutlamayiGec = (s) => { while (s.faz === 'kutla' && !s.bitti) g.adim(s, 100); };
const turAt = (s) => { siparisiBitir(s); kutlamayiGec(s); };
const iz = (s, n = 8) => {
  const out = [];
  for (let i = 0; i < n; i++) { out.push([...s.siparis, '|', ...s.secenekler].join()); turAt(s); }
  return out;
};
/** s, uzunluğu n olan siparişe gelene kadar oynanır. */
const uzunlugaGel = (s, n) => { while (s.siparis.length < n) turAt(s); };

test('giydir: aynı tohum aynı sipariş ve seçenek dizisi, farklı tohum farklı', () => {
  assert.deepEqual(iz(g.yeni({ tohum: 7 })), iz(g.yeni({ tohum: 7 })));
  assert.notDeepEqual(iz(g.yeni({ tohum: 7 })), iz(g.yeni({ tohum: 8 })));
});

test('giydir: sipariş 1 parçayla başlar, tamamlandıkça 3 parçaya çıkar, 3\'ü geçmez', () => {
  const s = g.yeni({ tohum: 1 });
  const uzunluklar = [];
  for (let i = 0; i < 9; i++) { uzunluklar.push(s.siparis.length); turAt(s); }
  assert.equal(uzunluklar[0], 1);
  assert.ok(uzunluklar.includes(2));
  assert.equal(uzunluklar.at(-1), 3);
  assert.equal(Math.max(...uzunluklar), 3);
  assert.deepEqual(uzunluklar, [...uzunluklar].sort((a, b) => a - b), 'uzunluk azalmaz');
});

test('giydir: siparişte her parça farklı yuvada; seçenekler 6 benzersiz parça, siparişi içerir', () => {
  for (let tohum = 1; tohum <= 40; tohum++) {
    const s = g.yeni({ tohum });
    for (let i = 0; i < 8; i++) {
      const yuvalar = s.siparis.map(yuvaBul);
      assert.ok(yuvalar.every(Boolean), 'parça katalogda');
      assert.equal(new Set(yuvalar).size, s.siparis.length, 'yuvalar farklı');
      assert.equal(s.secenekler.length, g.SECENEK);
      assert.equal(g.SECENEK, 6);
      assert.equal(new Set(s.secenekler).size, g.SECENEK, 'seçenekler benzersiz');
      for (const id of s.siparis) assert.ok(s.secenekler.includes(id), 'sipariş seçeneklerde');
      turAt(s);
    }
  }
});

test('giydir: çeldiricilerde sipariş parçasıyla aynı yuvadan parça var', () => {
  for (let tohum = 1; tohum <= 20; tohum++) {
    const s = g.yeni({ tohum });
    uzunlugaGel(s, 2);
    const yuvalar = new Set(s.siparis.map(yuvaBul));
    assert.ok(s.secenekler.some((id) => !s.siparis.includes(id) && yuvalar.has(yuvaBul(id))));
  }
});

test('giydir: art arda gelen siparişte aynı parça istenmez', () => {
  const s = g.yeni({ tohum: 5 });
  for (let i = 0; i < 30; i++) {
    const once = [...s.siparis];
    turAt(s);
    assert.ok(!s.siparis.some((id) => once.includes(id)), `${once} -> ${s.siparis}`);
  }
});

test('giydir: doğru parça +2 puan, yuvasına giyilir; giyim nesnesi yalnız değişince yenilenir', () => {
  const s = g.yeni({ tohum: 3 });
  uzunlugaGel(s, 2);
  const once = s.skor;
  const bos = s.giyilenler;
  assert.deepEqual(bos, {});
  const id = s.siparis[0];
  const r = g.sec(s, id);
  assert.deepEqual(r, { dogru: true, tamam: false, puan: 2 });
  assert.equal(s.skor, once + 2);
  assert.deepEqual(s.giyilenler, { [yuvaBul(id)]: id });
  assert.notEqual(s.giyilenler, bos);
  assert.equal(g.giyildiMi(s, id), true);
  assert.equal(g.giyildiMi(s, s.siparis[1]), false);
  const simdi = s.giyilenler;
  g.adim(s, 50);
  assert.equal(s.giyilenler, simdi, 'zaman geçince yeniden çizim yok');
});

test('giydir: sipariş bitince uzunluk × 2 bonus, kutlama, sonra yeni sipariş ve boş bebek', () => {
  const s = g.yeni({ tohum: 3 });
  uzunlugaGel(s, 3);
  const once = s.skor;
  const seri = s.seri;
  const [a, b, c] = s.siparis;
  assert.equal(g.sec(s, a).puan, 2);
  assert.equal(g.sec(s, b).puan, 2);
  const son = g.sec(s, c);
  assert.equal(son.tamam, true);
  assert.equal(son.puan, 2 + 6 + (seri >= 1 ? g.SERI_PUAN : 0));
  assert.equal(s.skor, once + 2 + 2 + son.puan);
  assert.equal(s.faz, 'kutla');
  assert.equal(g.sec(s, a), null, 'kutlamada seçim yok');
  const no = s.no;
  g.adim(s, 100);
  assert.equal(s.no, no, 'kutlama hemen bitmez');
  assert.ok(g.KUTLA_MS <= 1500, 'kısa kutlama');
  kutlamayiGec(s);
  assert.equal(s.faz, 'sec');
  assert.equal(s.no, no + 1);
  assert.deepEqual(s.giyilenler, {});
});

test('giydir: art arda hatasız sipariş ek puan alır; hata seriyi sıfırlar', () => {
  const s = g.yeni({ tohum: 2 });
  const puan = () => { const once = s.skor; siparisiBitir(s); const fark = s.skor - once; kutlamayiGec(s); return fark; };
  const taban = () => s.siparis.length * 4;
  let t = taban();
  assert.equal(puan(), t, 'ilk sipariş ek almaz');
  t = taban();
  assert.equal(puan(), t + g.SERI_PUAN, 'ikinci hatasız');
  assert.equal(s.seri, 2);
  g.sec(s, istenmeyen(s));
  assert.equal(s.seri, 0);
  t = taban();
  assert.equal(puan(), t, 'hatalı sipariş ek almaz');
  assert.equal(s.seri, 0);
  t = taban();
  assert.equal(puan(), t, 'hatadan sonraki ilk hatasız ek almaz');
  t = taban();
  assert.equal(puan(), t + g.SERI_PUAN);
});

test('giydir: yanlış parça 3 sn süre götürür, puan ve giyim değişmez, olay yazar', () => {
  const s = g.yeni({ tohum: 4 });
  const kalan = g.kalanMs(s);
  const giyim = s.giyilenler;
  const r = g.sec(s, istenmeyen(s));
  assert.deepEqual(r, { dogru: false });
  assert.equal(g.kalanMs(s), kalan - 3000);
  assert.equal(s.skor, 0);
  assert.equal(s.giyilenler, giyim);
  assert.equal(s.faz, 'sec');
  assert.ok(s.olaylar.some((o) => o.tur === 'yanlis'));
});

test('giydir: siparişte zaten giyilmiş parça ceza ve puan vermez', () => {
  const s = g.yeni({ tohum: 6 });
  uzunlugaGel(s, 2);
  const id = s.siparis[0];
  g.sec(s, id);
  const { skor, t, seri, giyilenler } = s;
  const r = g.sec(s, id);
  assert.deepEqual(r, { dogru: true, tamam: false, puan: 0 });
  assert.equal(s.skor, skor);
  assert.equal(s.t, t);
  assert.equal(s.seri, seri);
  assert.equal(s.giyilenler, giyilenler, 'yeniden çizim yok');
});

test('giydir: seçeneklerde olmayan parça yok sayılır', () => {
  const s = g.yeni({ tohum: 6 });
  const disarida = Object.values(YUVALAR).flat().find((id) => !s.secenekler.includes(id));
  assert.equal(g.sec(s, disarida), null);
  assert.equal(g.sec(s, undefined), null);
  assert.equal(g.kalanMs(s), g.SURE);
});

test('giydir: 45 sn sonra biter; dt üst sınırlı (100 ms); bitince seçim yok', () => {
  assert.equal(g.SURE, 45000);
  const s = g.yeni({ tohum: 1 });
  g.adim(s, 10_000);
  assert.equal(s.t, 100);
  assert.equal(g.ilerleme(s), 100 / g.SURE);
  for (let i = 0; i < 1000 && !s.bitti; i++) g.adim(s, 100);
  assert.equal(s.bitti, true);
  assert.equal(g.kalanMs(s), 0);
  assert.equal(g.ilerleme(s), 1);
  assert.equal(g.sec(s, s.siparis[0]), null);
  const t = s.t;
  g.adim(s, 100);
  assert.equal(s.t, t);
});

test('giydir: yanlış parça son saniyede oyunu bitirir, kalan süre eksiye inmez', () => {
  const s = g.yeni({ tohum: 1 });
  s.t = g.SURE - 1000;
  g.sec(s, istenmeyen(s));
  assert.equal(s.bitti, true);
  assert.equal(g.kalanMs(s), 0);
  assert.ok(s.olaylar.some((o) => o.tur === 'bitti'));
});

test('giydir: kutlamada süre biterse oyun biter, puan kalır', () => {
  const s = g.yeni({ tohum: 1 });
  s.t = g.SURE - 100;
  siparisiBitir(s);
  const skor = s.skor;
  assert.equal(s.faz, 'kutla');
  g.adim(s, 100);
  assert.equal(s.bitti, true);
  assert.equal(s.skor, skor);
});

test('giydir: hareket azaltmada süre ve kutlama uzar, aynı siparişler gelir', () => {
  const h = g.yeni({ tohum: 9 });
  const y = g.yeni({ tohum: 9, yavas: true });
  assert.ok(g.kalanMs(y) > g.kalanMs(h));
  assert.ok(g.kalanMs(y) <= g.SURE * 1.3);
  assert.deepEqual(iz(y, 5), iz(h, 5));
  const a = g.yeni({ tohum: 9 });
  const b = g.yeni({ tohum: 9, yavas: true });
  siparisiBitir(a);
  siparisiBitir(b);
  for (let i = 0; i < g.KUTLA_MS / 100; i++) { g.adim(a, 100); g.adim(b, 100); }
  assert.equal(a.faz, 'sec');
  assert.equal(b.faz, 'kutla');
  // Yanlış parça cezası değişmez: 3 sn.
  const kalan = g.kalanMs(a);
  g.sec(a, istenmeyen(a));
  assert.equal(g.kalanMs(a), kalan - g.CEZA_MS);
});

test('giydir: varsayılan katalog YUVALAR; katalog parametresi kullanılır', () => {
  const tum = new Set(Object.values(YUVALAR).flat());
  const v = g.yeni({ tohum: 1 });
  assert.ok(v.secenekler.every((id) => tum.has(id)));
  const katalog = { bas: ['tac', 'sapka', 'bere'], goz: ['gozluk', 'kalpgozluk'], boyun: ['atki', 'papyon'] };
  const izin = new Set(Object.values(katalog).flat());
  const s = g.yeni({ tohum: 1, katalog });
  for (let i = 0; i < 10; i++) {
    assert.ok(s.secenekler.every((id) => izin.has(id)));
    assert.equal(s.secenekler.length, 6);
    assert.deepEqual(g.sec(s, s.siparis[0]).dogru, true);
    siparisiBitir(s);
    assert.ok(Object.keys(s.giyilenler).every((y) => Object.hasOwn(katalog, y)));
    kutlamayiGec(s);
  }
});

test('giydir: küçük katalogda sipariş ve seçenek olana göre kısalır, oyun takılmaz', () => {
  const tekYuva = g.yeni({ tohum: 1, katalog: { bas: ['tac', 'sapka'] } });
  for (let i = 0; i < 8; i++) {
    assert.equal(tekYuva.siparis.length, 1, 'yuva sayısını aşmaz');
    assert.equal(tekYuva.secenekler.length, 2);
    turAt(tekYuva);
  }
  const tekParca = g.yeni({ tohum: 1, katalog: { goz: ['gozluk'] } });
  turAt(tekParca);
  assert.deepEqual(tekParca.siparis, ['gozluk'], 'başka parça yoksa tekrar eder');
  const bos = g.yeni({ tohum: 1, katalog: {} });
  assert.equal(bos.secenekler.length, 6, 'boş katalog varsayılana döner');
  const bilinmeyen = g.yeni({ tohum: 1, katalog: { sac: ['x'], bas: ['tac', 'tac'] } });
  assert.deepEqual(bilinmeyen.secenekler, ['tac'], 'bilinmeyen yuva ve tekrar atılır');
});

test('giydir: oyuna girebilen her parçanın adı ve çizimi var; giyilen parça bebekte görünür', () => {
  for (const [yuva, liste] of Object.entries(YUVALAR)) {
    for (const id of liste) {
      assert.ok(URUNLER[id]?.ad, `${id} adı`);
      assert.match(giyimParcaSvg(id, { renk: 2 }), /^<svg /, `${id} çizimi`);
      const svg = bebekSvg({ asama: 'buyuk', renk: 2, kisilik: '', ruh: 'mutlu', giyim: { [yuva]: id } });
      assert.ok(svg.includes(`data-urun="${id}"`), `${id} bebekte`);
    }
  }
});

test('giydir: olaylar sırası: doğru, tamam, siparis', () => {
  const s = g.yeni({ tohum: 8 });
  assert.deepEqual(s.olaylar.splice(0).map((o) => o.tur), ['siparis']);
  const id = s.siparis[0];
  g.sec(s, id);
  assert.deepEqual(s.olaylar.splice(0), [
    { tur: 'dogru', urun: id, tamam: true },
    { tur: 'tamam', uzunluk: 1, bonus: 2, seriPuan: 0 },
  ]);
  kutlamayiGec(s);
  const o = s.olaylar.splice(0);
  assert.deepEqual(o, [{ tur: 'siparis', parcalar: s.siparis }]);
  assert.notEqual(o[0].parcalar, s.siparis, 'olay kopya taşır');
});

// Model oyuncu: her parçayı tiklamaMs'te bulur, hataOrani kadar yanlış basar. Kutlamada bekler.
function oynat(tohum, tiklamaMs, hataOrani) {
  const s = g.yeni({ tohum });
  const rnd = mulberry32(tohum + 1000);
  let bekle = tiklamaMs;
  while (!s.bitti) {
    g.adim(s, 50);
    if (s.faz !== 'sec') { bekle = tiklamaMs; continue; }
    bekle -= 50;
    if (bekle > 0) continue;
    bekle = tiklamaMs;
    if (rnd() < hataOrani) g.sec(s, istenmeyen(s));
    else g.sec(s, s.siparis.find((id) => !g.giyildiMi(s, id)));
  }
  return s.skor;
}
const ortalama = (tiklamaMs, hataOrani) => {
  let t = 0;
  for (let tohum = 1; tohum <= 30; tohum++) t += oynat(tohum, tiklamaMs, hataOrani);
  return t / 30;
};

test('giydir: denge: dikkatli oyuncu yaklaşık 50 puan alır, yavaş ve hatalı oyuncu az alır', () => {
  const dikkatli = ortalama(2500, 0.05);
  const yavas = ortalama(4500, 0.2);
  assert.ok(dikkatli >= 40 && dikkatli <= 70, `dikkatli ${dikkatli}`);
  assert.ok(yavas < dikkatli * 0.6, `yavaş ${yavas}`);
  assert.ok(yavas > 0);
});
