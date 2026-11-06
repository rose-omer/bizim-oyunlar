import { test } from 'node:test';
import assert from 'node:assert/strict';
import { skorJeton } from '../sayfalar/yavru/oyunlar/cerceve.js';
import * as tarif from '../sayfalar/yavru/oyunlar/tarif.js';

const kos = (s, ms, dt = 16) => { for (let t = 0; t < ms && !s.bitti; t += dt) tarif.adim(s, dt); return s; };
/** Kartı kapatır: faz 'ekle' olana kadar zamanı ilerletir. */
const kartiGec = (s) => { while (s.faz === 'goster') tarif.adim(s, 16); return s; };
/** Sıradaki doğru malzemeyi ekler. */
const dogruEkle = (s) => tarif.ekle(s, s.tarif[s.girilen]);
/** Sıradaki malzemeden farklı bir malzeme ekler. */
const yanlisEkle = (s) => tarif.ekle(s, (s.tarif[s.girilen] + 1) % tarif.MALZEMELER.length);
const tarifiBitir = (s) => { kartiGec(s); while (s.faz === 'ekle') dogruEkle(s); return s; };

test('tarif: tasarım sabitleri', () => {
  assert.equal(tarif.SURE, 45000);
  assert.equal(tarif.CAN, 3);
  assert.equal(tarif.ILK_UZUNLUK, 3);
  assert.equal(tarif.EN_UZUN, 7);
  assert.equal(tarif.KART_MS, 900);
  assert.deepEqual(tarif.MALZEMELER.map((m) => m.ad), ['Muz', 'Elma', 'Havuç', 'Süt', 'Çilek', 'Bal', 'Yulaf', 'Armut']);
  assert.deepEqual(tarif.MALZEMELER.map((m) => m.emoji), ['🍌', '🍎', '🥕', '🥛', '🍓', '🍯', '🥣', '🍐']);
});

test('tarif: aynı tohum aynı tarifler, farklı tohum farklı', () => {
  const iz = (tohum) => {
    const s = tarif.yeni({ tohum });
    const out = [s.tarif.join()];
    for (let i = 0; i < 4; i++) { tarifiBitir(s); kos(s, tarif.IYI_MS + 32); out.push(s.tarif.join()); }
    return out;
  };
  assert.deepEqual(iz(7), iz(7));
  assert.notDeepEqual(iz(7), iz(8));
});

test('tarif: malzeme tekrar edebilir ama art arda aynısı olmaz', () => {
  let tekrarVar = false;
  for (let tohum = 1; tohum <= 200; tohum++) {
    const t = tarif.tarifUret(tarif.yeni({ tohum }).rnd, tarif.EN_UZUN);
    assert.equal(t.length, tarif.EN_UZUN);
    for (let i = 0; i < t.length; i++) {
      assert.ok(Number.isInteger(t[i]) && t[i] >= 0 && t[i] < tarif.MALZEMELER.length);
      if (i > 0) assert.notEqual(t[i], t[i - 1], `tohum ${tohum}, sıra ${i}`);
    }
    if (new Set(t).size < t.length) tekrarVar = true;
  }
  assert.ok(tekrarVar, 'en az bir tarifte tekrar görülmeli');
});

test('tarif: 3 malzemeyle başlar; kart uzunluk × 900 ms açık kalır', () => {
  const s = tarif.yeni({ tohum: 1 });
  assert.equal(s.faz, 'goster');
  assert.equal(s.tarif.length, 3);
  assert.equal(tarif.gosterMs(s), 2700);
  tarif.adim(s, 100);
  assert.equal(s.faz, 'goster');
  kos(s, 2600 - 100, 100);
  assert.equal(s.faz, 'goster', '2600 ms: kart hâlâ açık');
  tarif.adim(s, 100);
  assert.equal(s.faz, 'ekle', '2700 ms: kart kapanır');
});

test('tarif: hareket azaltmada kart biraz daha uzun açık kalır', () => {
  const h = tarif.yeni({ tohum: 1 });
  const y = tarif.yeni({ tohum: 1, yavas: true });
  assert.ok(tarif.gosterMs(y) > tarif.gosterMs(h));
  assert.deepEqual(y.tarif, h.tarif);
});

test('tarif: goster fazında süre durur; ekle fazında akar', () => {
  const s = tarif.yeni({ tohum: 2 });
  kartiGec(s);
  assert.equal(s.t, 0, 'kart açıkken süre akmaz');
  assert.equal(tarif.kalanMs(s), tarif.SURE);
  kos(s, 1000);
  assert.ok(s.t >= 1000 && s.t < 1100);
});

test('tarif: uzun kart süre yemez (7 malzemelik kart)', () => {
  const s = tarif.yeni({ tohum: 3 });
  for (let u = 3; u < 7; u++) { tarifiBitir(s); kos(s, tarif.IYI_MS + 32); }
  assert.equal(s.faz, 'goster');
  assert.equal(s.tarif.length, 7);
  const once = s.t;
  kartiGec(s);
  assert.equal(s.t, once);
});

test('tarif: kart açıkken tıklama sayılmaz', () => {
  const s = tarif.yeni({ tohum: 4 });
  assert.equal(tarif.ekle(s, s.tarif[0]), null);
  assert.equal(tarif.ekle(s, (s.tarif[0] + 1) % 8), null);
  assert.equal(s.skor, 0);
  assert.equal(s.girilen, 0);
  assert.equal(s.can, tarif.CAN);
  assert.equal(s.faz, 'goster');
});

test('tarif: geçersiz malzeme sayılmaz', () => {
  const s = kartiGec(tarif.yeni({ tohum: 5 }));
  for (const m of [-1, 8, 1.5, NaN, '1', undefined]) assert.equal(tarif.ekle(s, m), null, String(m));
  assert.equal(s.can, tarif.CAN);
  assert.equal(s.faz, 'ekle');
});

test('tarif: doğru malzeme +2; tarif bitince uzunluk × 3 bonus', () => {
  const s = kartiGec(tarif.yeni({ tohum: 6 }));
  assert.deepEqual(dogruEkle(s), { dogru: true, tamam: false });
  assert.equal(s.skor, 2);
  assert.equal(s.girilen, 1);
  dogruEkle(s);
  assert.equal(s.skor, 4);
  s.olaylar.length = 0;
  assert.deepEqual(dogruEkle(s), { dogru: true, tamam: true });
  assert.equal(s.skor, 6 + 9);
  assert.equal(s.faz, 'iyi');
  assert.ok(s.olaylar.some((o) => o.tur === 'tamam' && o.uzunluk === 3 && o.bonus === 9));
});

test('tarif: iyi fazında tıklama sayılmaz; sonra yeni tarif bir uzar', () => {
  const s = tarifiBitir(tarif.yeni({ tohum: 7 }));
  const skor = s.skor;
  assert.equal(tarif.ekle(s, 0), null);
  assert.equal(s.skor, skor);
  assert.equal(s.tarif.length, 3, 'iyi fazında tarif değişmez');
  assert.equal(s.girilen, 3, 'tencere dolu kalır');
  kos(s, tarif.IYI_MS + 32);
  assert.equal(s.faz, 'goster');
  assert.equal(s.tarif.length, 4);
  assert.equal(s.girilen, 0);
  assert.equal(tarif.gosterMs(s), 3600);
});

test('tarif: uzunluk en çok 7; 7 bitince yine 7 malzemelik yeni tarif', () => {
  const s = tarif.yeni({ tohum: 8 });
  const uzunluklar = [];
  for (let i = 0; i < 7; i++) {
    uzunluklar.push(s.tarif.length);
    tarifiBitir(s);
    kos(s, tarif.IYI_MS + 32);
  }
  assert.deepEqual(uzunluklar, [3, 4, 5, 6, 7, 7, 7]);
});

test('tarif: yanlış malzeme can götürür, mama taşar, aynı tarif yeniden gösterilir', () => {
  const s = kartiGec(tarif.yeni({ tohum: 9 }));
  const onceki = [...s.tarif];
  dogruEkle(s);
  s.olaylar.length = 0;
  assert.deepEqual(yanlisEkle(s), { dogru: false, tamam: false });
  assert.equal(s.can, tarif.CAN - 1);
  assert.equal(s.faz, 'tasti');
  assert.equal(s.skor, 2, 'kazanılan puan kalır');
  assert.ok(s.olaylar.some((o) => o.tur === 'yanlis' && o.can === tarif.CAN - 1));
  assert.equal(tarif.ekle(s, 0), null, 'tasti fazında tıklama sayılmaz');
  kos(s, tarif.TASTI_MS + 32);
  assert.equal(s.faz, 'goster');
  assert.deepEqual(s.tarif, onceki, 'aynı tarif');
  assert.equal(s.girilen, 0, 'tencere boşalır');
  assert.equal(s.bitti, false);
});

test('tarif: 3. yanlışta mama taşar, sonra oyun biter', () => {
  const s = tarif.yeni({ tohum: 10 });
  for (let i = 0; i < 2; i++) {
    kartiGec(s);
    yanlisEkle(s);
    kos(s, tarif.TASTI_MS + 32);
  }
  kartiGec(s);
  yanlisEkle(s);
  assert.equal(s.can, 0);
  assert.equal(s.faz, 'tasti');
  assert.equal(s.bitti, false, 'taşma önce görünür');
  kos(s, tarif.TASTI_MS + 32);
  assert.equal(s.bitti, true);
  assert.equal(tarif.ekle(s, 0), null);
  assert.ok(s.olaylar.some((o) => o.tur === 'faz' && o.faz === 'bitti'));
});

test('tarif: süre dolunca biter; dt üst sınırlı (100 ms)', () => {
  const s = kartiGec(tarif.yeni({ tohum: 11 }));
  tarif.adim(s, 10_000);
  assert.equal(s.t, 100);
  kos(s, tarif.SURE * 2, 100);
  assert.equal(s.bitti, true);
  assert.equal(tarif.kalanMs(s), 0);
  assert.equal(tarif.ekle(s, s.tarif[s.girilen]), null);
  const t = s.t;
  tarif.adim(s, 100);
  assert.equal(s.t, t, 'bitince zaman ilerlemez');
});

test('tarif: süre iyi ve tasti fazlarında da akar', () => {
  const a = tarifiBitir(tarif.yeni({ tohum: 12 }));
  assert.equal(a.faz, 'iyi');
  kos(a, 160);
  assert.equal(a.t, 160);
  const b = kartiGec(tarif.yeni({ tohum: 12 }));
  yanlisEkle(b);
  assert.equal(b.faz, 'tasti');
  kos(b, 160);
  assert.equal(b.t, 160);
});

test('tarif: puan dengesi: 3 + 4 + 5 uzunluklu tarifler 60 puan; iyi oyun (100 puan) 25 jeton', () => {
  const s = tarif.yeni({ tohum: 13 });
  for (let i = 0; i < 3; i++) { tarifiBitir(s); kos(s, tarif.IYI_MS + 32); }
  assert.equal(s.skor, 15 + 20 + 25);
  assert.equal(skorJeton('tarif', 100), 25);
});
