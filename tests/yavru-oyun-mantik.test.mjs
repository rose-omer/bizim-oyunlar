import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as balon from '../sayfalar/yavru/oyunlar/balon.js';
import * as top from '../sayfalar/yavru/oyunlar/top.js';
import * as cee from '../sayfalar/yavru/oyunlar/cee.js';
import * as ninni from '../sayfalar/yavru/oyunlar/ninni.js';

const kos = (m, s, ms, dt = 16) => { for (let t = 0; t < ms && !s.bitti; t += dt) m.adim(s, dt); return s; };
const izBalon = (s) => s.balonlar.map((b) => [b.tur, b.x0.toFixed(3), b.vy.toFixed(3)].join());

// ---------- Balon ----------

test('balon: aynı tohum aynı balon dizisi, farklı tohum farklı', () => {
  const a = kos(balon, balon.yeni({ tohum: 7 }), 4000);
  const b = kos(balon, balon.yeni({ tohum: 7 }), 4000);
  const c = kos(balon, balon.yeni({ tohum: 8 }), 4000);
  assert.deepEqual(izBalon(a), izBalon(b));
  assert.notDeepEqual(izBalon(a), izBalon(c));
});

test('balon: zorluk zamanla artar (aralık kısalır, hız ve diken payı büyür)', () => {
  const z0 = balon.zorluk(0);
  const z1 = balon.zorluk(balon.SURE);
  assert.ok(z1.aralik < z0.aralik);
  assert.ok(z1.hiz > z0.hiz);
  assert.ok(z1.diken > z0.diken);
  assert.deepEqual(balon.zorluk(balon.SURE * 3), z1, 'süre sonrası sabit');
});

test('balon: süre bitince biter; dt üst sınırlı (100 ms)', () => {
  const s = balon.yeni({ tohum: 1 });
  balon.adim(s, 10_000);
  assert.equal(s.t, 100);
  kos(balon, s, balon.SURE * 2, 100);
  assert.equal(s.bitti, true);
  assert.equal(balon.kalanMs(s), 0);
  assert.equal(balon.dokun(s, 50, 50), null);
});

test('balon: dokunuş puanları; skor eksiye inmez; boşa dokunuş null', () => {
  const s = balon.yeni({ tohum: 3 });
  s.balonlar = [
    { id: 1, tur: 'normal', r: 9, x0: 20, x: 20, y: 60, vy: 0, faz: 0 },
    { id: 2, tur: 'altin', r: 7, x0: 50, x: 50, y: 60, vy: 0, faz: 0 },
    { id: 3, tur: 'diken', r: 9, x0: 80, x: 80, y: 60, vy: 0, faz: 0 },
  ];
  assert.equal(balon.dokun(s, 80, 61).puan, -3);
  assert.equal(s.skor, 0, 'eksiye inmez');
  assert.equal(balon.dokun(s, 21, 59).tur, 'normal');
  assert.equal(balon.dokun(s, 50, 60).puan, 5);
  assert.equal(s.skor, 6);
  assert.equal(balon.dokun(s, 5, 150), null);
  assert.equal(s.patlayan, 3);
});

test('balon: hareket azaltma daha yavaş yükseltir ama aynı balonlar doğar', () => {
  const h = kos(balon, balon.yeni({ tohum: 5 }), 1500);
  const y = kos(balon, balon.yeni({ tohum: 5, yavas: true }), 1500);
  assert.deepEqual(h.balonlar.map((b) => b.id), y.balonlar.map((b) => b.id));
  assert.ok(y.balonlar[0].y > h.balonlar[0].y);
});

// ---------- Top ----------

test('top: aynı tohum aynı düşüş dizisi', () => {
  const iz = (s) => s.esyalar.map((e) => `${e.tur}:${e.x.toFixed(3)}`);
  assert.deepEqual(iz(kos(top, top.yeni({ tohum: 11 }), 5000)), iz(kos(top, top.yeni({ tohum: 11 }), 5000)));
  assert.notDeepEqual(iz(kos(top, top.yeni({ tohum: 11 }), 5000)), iz(kos(top, top.yeni({ tohum: 12 }), 5000)));
});

test('top: zorluk artar; sepet kenarda sınırlanır', () => {
  assert.ok(top.zorluk(top.SURE).aralik < top.zorluk(0).aralik);
  assert.ok(top.zorluk(top.SURE).hiz > top.zorluk(0).hiz);
  const s = top.yeni();
  top.sepetKonum(s, -50);
  assert.equal(s.sepetX, top.SEPET_G / 2);
  top.sepetKaydir(s, 1000);
  assert.equal(s.sepetX, top.GEN - top.SEPET_G / 2);
  top.sepetKonum(s, NaN);
  assert.equal(s.sepetX, top.GEN - top.SEPET_G / 2);
});

test('top: sepetin altına düşen yakalanır, uzaktaki kaçar ve seriyi sıfırlar; 5li seri ödülü', () => {
  const s = top.yeni({ tohum: 2 });
  s.sonraki = Infinity; // otomatik üretimi kapat
  const dus = (x) => s.esyalar.push({ id: s.id++, tur: 'top', r: 6, x, y: top.SEPET_Y - 3, vy: 60, don: 0 });
  top.sepetKonum(s, 50);
  for (let i = 0; i < 5; i++) { dus(50); top.adim(s, 100); }
  assert.equal(s.yakalanan, 5);
  assert.equal(s.skor, 5 + top.SERI_ODUL);
  dus(5);
  for (let i = 0; i < 10; i++) top.adim(s, 100);
  assert.equal(s.kacan, 1);
  assert.equal(s.seri, 0);
  assert.deepEqual(s.olaylar.map((o) => o.tur), ['yakalandi', 'yakalandi', 'yakalandi', 'yakalandi', 'yakalandi', 'kacti']);
});

test('top: süre bitince biter, otomatik oyunda sepet ortada bir şeyler yakalar', () => {
  const s = kos(top, top.yeni({ tohum: 4 }), top.SURE + 1000, 50);
  assert.equal(s.bitti, true);
  assert.ok(s.yakalanan > 0 && s.kacan > 0);
});

// ---------- Ce-e ----------

function ceeBul(s) { // karışmadan sonra bebeğin yuvası
  const bebekYuva = s.yer[s.bebek];
  return s.yer.indexOf(bebekYuva);
}

test('cee: tur ayarı zorlaşır (battaniye, takas, hız)', () => {
  const a = cee.turAyar(1);
  const b = cee.turAyar(cee.TUR_SAYISI);
  assert.equal(a.n, 3);
  assert.equal(b.n, 5);
  assert.ok(b.takas > a.takas);
  assert.ok(b.takasMs < a.takasMs);
});

test('cee: aynı tohum aynı bebek yeri ve takas dizisi', () => {
  const a = cee.yeni({ tohum: 21 });
  const b = cee.yeni({ tohum: 21 });
  assert.equal(a.bebek, b.bebek);
  assert.deepEqual(a.takaslar, b.takaslar);
  assert.ok(a.takaslar.every(([x, y]) => x < y && y < a.n));
  for (let i = 1; i < a.takaslar.length; i++) assert.notDeepEqual(a.takaslar[i], a.takaslar[i - 1]);
});

test('cee: faz akışı; karışınca battaniyeler permütasyon; doğru seçim 2+tur puan', () => {
  const s = cee.yeni({ tohum: 9 });
  assert.equal(s.faz, 'goster');
  assert.equal(cee.sec(s, 0), null, 'göstermede seçilmez');
  for (let g = 0; g < 2000 && s.faz !== 'sec'; g++) cee.adim(s, 20);
  assert.equal(s.faz, 'sec');
  assert.deepEqual([...s.yer].sort(), s.yer.map((_, i) => i));
  const k = ceeBul(s);
  assert.equal(k, s.bebek);
  assert.deepEqual(cee.sec(s, s.bebek), { dogru: true, puan: cee.turPuan(1) });
  assert.equal(s.faz, 'sonuc');
  assert.equal(cee.sec(s, s.bebek), null, 'ikinci seçim yok');
});

test('cee: yanlış ya da süre dolması 0 puan; 6 tur sonra biter, en çok puan sınırı', () => {
  const s = cee.yeni({ tohum: 13 });
  const dogruTur = new Set([1, 3, 5]);
  let guard = 0;
  while (!s.bitti && guard++ < 100000) {
    if (s.faz === 'sec' && s.tur !== 6) cee.sec(s, dogruTur.has(s.tur) ? s.bebek : (s.bebek + 1) % s.n);
    cee.adim(s, 50);
  }
  assert.equal(s.bitti, true);
  assert.equal(s.tur, cee.TUR_SAYISI);
  assert.equal(s.dogru, 3);
  assert.equal(s.skor, cee.turPuan(1) + cee.turPuan(3) + cee.turPuan(5));
  let enCok = 0;
  for (let t = 1; t <= cee.TUR_SAYISI; t++) enCok += cee.turPuan(t);
  assert.ok(enCok <= 40);
});

test('cee: konumlar takas sırasında ara değer verir', () => {
  const s = cee.yeni({ tohum: 3 });
  kos(cee, s, cee.GOSTER_MS + cee.ORTU_MS + 10, 10);
  assert.equal(s.faz, 'karistir');
  while (s.fazT < s.takasMs / 2) cee.adim(s, Math.min(10, s.takasMs / 2 - s.fazT));
  const [a, b] = s.takaslar[0];
  const k = s.yer.indexOf(a);
  const p = cee.konumlar(s)[k];
  assert.ok(p.yuva > Math.min(a, b) && p.yuva < Math.max(a, b));
  assert.ok(Math.abs(p.kalk) > 0.9);
});

test('cee: yavaş mod takasları uzatır, dizi aynı', () => {
  const a = cee.yeni({ tohum: 4 });
  const b = cee.yeni({ tohum: 4, yavas: true });
  assert.deepEqual(a.takaslar, b.takaslar);
  assert.ok(b.takasMs > a.takasMs);
});

// ---------- Ninni ----------

const calSonu = (s) => { let g = 0; while (s.faz !== 'cal' && !s.bitti && g++ < 5000) ninni.adim(s, 20); };

test('ninni: dizi tohumlu ve art arda en çok iki aynı yıldız', () => {
  const a = ninni.yeni({ tohum: 30 });
  assert.deepEqual(a.dizi, ninni.yeni({ tohum: 30 }).dizi);
  assert.notDeepEqual(a.dizi, ninni.yeni({ tohum: 31 }).dizi);
  for (let t = 1; t < 200; t++) {
    const d = ninni.yeni({ tohum: t }).dizi;
    assert.equal(d.length, ninni.EN_UZUN);
    for (let i = 2; i < d.length; i++) assert.ok(!(d[i] === d[i - 1] && d[i] === d[i - 2]));
    assert.ok(d.every((x) => x >= 0 && x < ninni.YILDIZ));
  }
});

test('ninni: dinle fazında notalar sırayla yanar', () => {
  const s = ninni.yeni({ tohum: 5 });
  for (let t = 0; t < 5000 && s.faz === 'dinle'; t += 20) ninni.adim(s, 20);
  const notalar = s.olaylar.filter((o) => o.tur === 'nota').map((o) => o.yildiz);
  assert.deepEqual(notalar, s.dizi.slice(0, ninni.ILK_UZUNLUK));
  assert.equal(s.faz, 'cal');
});

test('ninni: doğru dizi uzar ve tempo hızlanır; puan dokunuş + uzunluk', () => {
  const s = ninni.yeni({ tohum: 8 });
  calSonu(s);
  assert.equal(ninni.dokun(s, 0 + s.dizi[0]).dogru, true);
  assert.equal(ninni.dokun(s, s.dizi[1]).tamam, false);
  assert.equal(ninni.dokun(s, s.dizi[2]).tamam, true);
  assert.equal(s.skor, 3 + 3);
  assert.equal(s.uzunluk, 4);
  assert.ok(ninni.notaMs(4) < ninni.notaMs(3));
  assert.equal(ninni.dokun(s, s.dizi[0]), null, 'iyi fazında dokunuş yok');
});

test('ninni: yanlış dokunuş bulut getirir, dizi yeniden çalar; 3 bulutta biter', () => {
  const s = ninni.yeni({ tohum: 8 });
  for (let i = 0; i < ninni.CAN; i++) {
    calSonu(s);
    assert.equal(s.faz, 'cal');
    const yanlis = (s.dizi[0] + 1) % ninni.YILDIZ;
    assert.equal(ninni.dokun(s, yanlis).dogru, false);
    assert.equal(s.uzunluk, ninni.ILK_UZUNLUK);
  }
  assert.equal(s.can, 0);
  calSonu(s);
  assert.equal(s.bitti, true);
  assert.equal(s.skor, 0);
});

test('ninni: süre dolunca biter; yanan dinle dışında -1', () => {
  const s = ninni.yeni({ tohum: 2 });
  calSonu(s);
  assert.equal(ninni.yanan(s), -1);
  kos(ninni, s, ninni.SURE + 500, 100);
  assert.equal(s.bitti, true);
  assert.equal(ninni.kalanMs(s), 0);
});
