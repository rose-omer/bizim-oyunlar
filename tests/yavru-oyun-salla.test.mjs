import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  yeni, basla, adim, vur, esVurdu, elSikis, isik, hedefYari, pencerede, kalanMs, araMs, vurusZamani,
  SURE, VURUS_SAYISI, PENCERE, PENCERE_YAVAS, PUAN_ISABET, PUAN_UYUM, BASLA_YINELE_MS,
} from '../sayfalar/yavru/oyunlar/salla.js';
import { skorJeton } from '../sayfalar/yavru/oyunlar/cerceve.js';

/** Oyunu t anına getirir (adim en çok 100 ms ilerler). */
function git(s, t) {
  while (s.t < t && s.faz !== 'bitti') adim(s, Math.min(100, t - s.t));
  return s;
}
const oyunda = (o) => { const s = yeni(o); basla(s); return s; };
const oyna = (s, b, sapma = 0) => { git(s, vurusZamani(b) + sapma); return vur(s); };

// ---------- Tempo ----------

test('salla: vuruş aralığı 1000 ms ile başlar, 700 ms\'e iner, sonra sabit', () => {
  assert.equal(araMs(0), 1000);
  for (let b = 1; b < 80; b++) assert.ok(araMs(b) <= araMs(b - 1));
  assert.equal(araMs(30), 700);
  assert.equal(araMs(1000), 700);
});

test('salla: 30 sn; son vuruş bitişten en az 700 ms önce (geç gelen mesaj sayılır)', () => {
  assert.equal(SURE, 30000);
  assert.equal(vurusZamani(0), 1000);
  assert.equal(VURUS_SAYISI, 35);
  assert.ok(vurusZamani(VURUS_SAYISI - 1) <= SURE - 700);
  assert.ok(vurusZamani(VURUS_SAYISI) >= SURE - 700, 'sığan her vuruş kullanılır');
});

test('salla: her vuruş bir kez olay üretir; yavaş mod tempoyu değiştirmez (iki cihaz aynı indeks)', () => {
  const zamanlar = (o) => {
    const s = oyunda(o);
    const z = [];
    while (s.faz !== 'bitti') {
      adim(s, 16);
      for (const e of s.olaylar.splice(0)) if (e.tur === 'vurus') z.push([e.b, s.t]);
    }
    return z;
  };
  const a = zamanlar({});
  assert.deepEqual(a.map(([b]) => b), Array.from({ length: VURUS_SAYISI }, (_, i) => i));
  assert.deepEqual(a, zamanlar({ yavas: true }));
});

// ---------- Fazlar ----------

test('salla: bekle fazında süre akmaz, ilerleme 0, dokunuş sayılmaz', () => {
  const s = yeni();
  assert.equal(s.faz, 'bekle');
  adim(s, 100);
  assert.equal(s.t, 0);
  assert.equal(kalanMs(s), SURE);
  assert.equal(vur(s), null);
  assert.equal(pencerede(s), false);
  assert.equal(isik(s), 0);
});

test('salla: basla yalnız bekle fazından geçirir; oyundaki taraf yok sayar', () => {
  const s = yeni();
  assert.equal(basla(s), true);
  assert.equal(s.faz, 'oyun');
  git(s, 3000);
  assert.equal(basla(s), false);
  assert.equal(s.t, 3000);
  git(s, SURE);
  assert.equal(basla(s), false);
  assert.equal(s.faz, 'bitti');
});

test('salla: süre bitince biter; dt üst sınırlı; bitti fazında dokunuş ve eş mesajı sayılmaz', () => {
  const s = oyunda();
  adim(s, 10_000);
  assert.equal(s.t, 100);
  s.olaylar.length = 0;
  git(s, SURE);
  assert.equal(s.faz, 'bitti');
  assert.equal(kalanMs(s), 0);
  assert.ok(s.olaylar.some((e) => e.tur === 'faz' && e.faz === 'bitti'));
  assert.equal(vur(s), null);
  assert.equal(esVurdu(s, { b: 0, isabet: true }), false);
  assert.equal(s.skor, 0);
});

// ---------- Dokunuş ----------

test('salla: pencere ±180 ms; sınır içi isabet +1, dışı kaçtı ve ceza yok', () => {
  const s = oyunda();
  assert.deepEqual(oyna(s, 3, -PENCERE), { b: 3, isabet: true });
  assert.equal(s.skor, PUAN_ISABET);
  assert.deepEqual(oyna(s, 4, PENCERE), { b: 4, isabet: true });
  assert.equal(s.skor, PUAN_ISABET * 2);
  assert.deepEqual(oyna(s, 5, -PENCERE - 1), { b: 5, isabet: false });
  assert.deepEqual(oyna(s, 6, PENCERE + 1), { b: 6, isabet: false });
  assert.equal(s.skor, PUAN_ISABET * 2, 'kaçan dokunuş puan düşürmez');
  assert.deepEqual(s.olaylar.filter((e) => e.tur === 'kacti').map((e) => e.b), [5, 6]);
});

test('salla: yavaş modda pencere ±260 ms', () => {
  assert.equal(PENCERE, 180);
  assert.equal(PENCERE_YAVAS, 260);
  const n = oyunda();
  const y = oyunda({ yavas: true });
  assert.equal(oyna(n, 2, 200).isabet, false);
  assert.equal(oyna(y, 2, 200).isabet, true);
  assert.equal(oyna(y, 3, -PENCERE_YAVAS).isabet, true);
  assert.equal(oyna(y, 4, PENCERE_YAVAS + 1).isabet, false);
});

test('salla: vuruş başına bir dokunuş; pencere dışı dokunuş o vuruşun hakkını alır', () => {
  const s = oyunda();
  assert.equal(oyna(s, 2).isabet, true);
  assert.equal(vur(s), null, 'aynı vuruşa ikinci dokunuş sayılmaz');
  assert.equal(s.skor, PUAN_ISABET);
  assert.equal(oyna(s, 3, -300).isabet, false);
  assert.equal(oyna(s, 3), null, 'hak gitti: tam ortada da sayılmaz');
  assert.equal(s.skor, PUAN_ISABET);
  assert.equal(oyna(s, 4).isabet, true, 'sonraki vuruş yeni hak');
});

test('salla: ilk yarım aralıkta ve son vuruştan sonra dokunuş hak yakmaz', () => {
  const s = oyunda();
  git(s, 200);
  assert.equal(vur(s), null);
  assert.equal(oyna(s, 0).isabet, true);
  git(s, vurusZamani(VURUS_SAYISI - 1) + 400);
  assert.equal(vur(s), null, 'olmayan vuruş');
});

test('salla: sürekli dokunuş vuruş sayısından fazla mesaj üretemez', () => {
  const s = oyunda();
  let mesaj = 0;
  while (s.faz !== 'bitti') {
    adim(s, 16);
    if (vur(s)) mesaj++;
  }
  assert.ok(mesaj <= VURUS_SAYISI);
});

// ---------- Uyum ----------

test('salla: kendi isabetim önce, eşin mesajı sonra: uyum, vuruş toplamı +2', () => {
  const s = oyunda();
  oyna(s, 1);
  assert.equal(s.skor, PUAN_ISABET);
  assert.equal(esVurdu(s, { b: 1, isabet: true }), true);
  assert.equal(s.skor, PUAN_UYUM);
  assert.equal(s.uyum, 1);
  assert.ok(s.olaylar.some((e) => e.tur === 'uyum' && e.b === 1));
});

test('salla: eşin mesajı önce, kendi isabetim sonra: aynı puan', () => {
  const s = oyunda();
  assert.equal(esVurdu(s, { b: 1, isabet: true }), false);
  assert.equal(s.skor, 0);
  oyna(s, 1);
  assert.equal(s.skor, PUAN_UYUM);
  assert.equal(s.uyum, 1);
});

test('salla: uyum yalnız aynı vuruşta iki isabetle; yinelenen ya da geçersiz mesaj puan vermez', () => {
  const s = oyunda();
  oyna(s, 1);
  assert.equal(esVurdu(s, { b: 2, isabet: true }), false, 'başka vuruş');
  assert.equal(esVurdu(s, { b: 1, isabet: false }), false, 'eş kaçırdı');
  assert.equal(s.skor, PUAN_ISABET);
  assert.equal(esVurdu(s, { b: 1, isabet: true }), true);
  assert.equal(esVurdu(s, { b: 1, isabet: true }), false, 'yinelenen mesaj');
  for (const b of [-1, 1.5, '1', null, undefined, VURUS_SAYISI]) assert.equal(esVurdu(s, { b, isabet: true }), false);
  assert.equal(s.skor, PUAN_UYUM);
  oyna(s, 2, 300);
  esVurdu(s, { b: 3, isabet: true });
  assert.equal(s.uyum, 1, 'kendi dokunuşum kaçtıysa uyum yok');
  assert.equal(esVurdu(s, {}), false);
});

test('salla: bekle fazında gelen eş vuruşu kaybolmaz (basla mesajı gecikirse)', () => {
  const s = yeni();
  assert.equal(esVurdu(s, { b: 0, isabet: true }), false);
  basla(s);
  oyna(s, 0);
  assert.equal(s.uyum, 1);
});

// ---------- İki cihaz ----------

/** İki cihaz: biri fark ms sonra başlar, mesajlar gecikme ms sonra varır. Her cihaz kendi isabetlerini yerel hesaplar. */
function ikiCihaz({ fark = 0, gecikme = 0, adimMs = 16, dokunA = () => 0, dokunB = () => 0 } = {}) {
  const a = oyunda();
  const b = yeni();
  const yol = [];
  let saat = 0;
  const siradaki = { a: 0, b: 0 };
  const gonder = (hedef, r) => yol.push({ at: saat + gecikme, hedef, r });
  const dok = (s, ad, sapma, hedef) => {
    while (siradaki[ad] < VURUS_SAYISI) {
      const n = siradaki[ad];
      const fk = sapma(n);
      if (fk == null) { siradaki[ad]++; continue; }
      if (s.t < vurusZamani(n) + fk) break;
      siradaki[ad]++;
      const r = vur(s);
      if (r) gonder(hedef, r);
    }
  };
  while (a.faz !== 'bitti' || b.faz !== 'bitti') {
    saat += adimMs;
    if (b.faz === 'bekle' && saat >= fark) basla(b);
    adim(a, adimMs);
    adim(b, adimMs);
    if (a.faz === 'oyun') dok(a, 'a', dokunA, b);
    if (b.faz === 'oyun') dok(b, 'b', dokunB, a);
    for (const m of yol.filter((x) => x.at <= saat)) esVurdu(m.hedef, m.r);
    for (let i = yol.length - 1; i >= 0; i--) if (yol[i].at <= saat) yol.splice(i, 1);
  }
  return { a, b };
}

test('salla: başlangıç farkı ve ağ gecikmesi puanı bozmaz; iki cihaz aynı skoru görür', () => {
  const { a, b } = ikiCihaz({ fark: 150, gecikme: 150 });
  assert.equal(a.isabet, VURUS_SAYISI);
  assert.equal(b.isabet, VURUS_SAYISI);
  assert.equal(a.skor, VURUS_SAYISI * PUAN_UYUM);
  assert.equal(b.skor, a.skor);
});

test('salla: son vuruşun mesajı 300 ms gecikmede de bitişten önce varır', () => {
  const { a, b } = ikiCihaz({ fark: 300, gecikme: 300 });
  assert.equal(a.uyum, VURUS_SAYISI);
  assert.equal(b.uyum, VURUS_SAYISI);
});

// ---------- Puan dengesi ----------

test('salla: iyi oyun ≈ 50 puan (ikiniz de %80), kusursuz 70, tek başına en çok 35', () => {
  const iyi = ikiCihaz({
    dokunA: (n) => (n % 5 === 0 ? null : 0),
    dokunB: (n) => (n % 5 === 2 ? null : 0),
  });
  assert.ok(iyi.a.skor >= 45 && iyi.a.skor <= 55, `iyi oyun: ${iyi.a.skor}`);
  assert.equal(iyi.a.skor, iyi.b.skor);
  assert.equal(skorJeton('salla', iyi.a.skor), Math.floor(iyi.a.skor / 2));

  const { a } = ikiCihaz();
  assert.equal(a.skor, 70);
  assert.equal(skorJeton('salla', a.skor), 30);

  const tek = oyunda();
  for (let n = 0; n < VURUS_SAYISI; n++) oyna(tek, n);
  git(tek, SURE);
  assert.equal(tek.skor, 35);
});

// ---------- Işık ----------

test('salla: ışık vuruşta ortada, aralık ortasında uçta, her vuruşta yön değişir', () => {
  const s = oyunda();
  git(s, vurusZamani(0));
  assert.ok(Math.abs(isik(s)) < 1e-9);
  git(s, vurusZamani(0) + araMs(1) / 2);
  const u1 = isik(s);
  git(s, vurusZamani(1) + araMs(2) / 2);
  const u2 = isik(s);
  assert.ok(Math.abs(Math.abs(u1) - 1) < 1e-9);
  assert.ok(Math.abs(Math.abs(u2) - 1) < 1e-9);
  assert.ok(Math.sign(u1) !== Math.sign(u2));
});

test('salla: çizilen hedef bölge gerçek pencereyle aynı (ışık bölgedeyken dokunuş isabet)', () => {
  for (const yavas of [false, true]) {
    const s = oyunda({ yavas });
    while (s.faz !== 'bitti') {
      adim(s, 37);
      if (s.faz === 'bitti') break;
      const r = vur(structuredClone(s));
      if (!r) { assert.equal(pencerede(s), false); continue; }
      assert.equal(pencerede(s), r.isabet);
      const fark = Math.abs(isik(s)) - hedefYari(s);
      if (Math.abs(fark) > 1e-9) assert.equal(fark < 0, r.isabet, `t=${s.t}`);
    }
  }
});

test('salla: pencerede, hak kullanılınca söner', () => {
  const s = oyunda();
  git(s, vurusZamani(2));
  assert.equal(pencerede(s), true);
  vur(s);
  assert.equal(pencerede(s), false);
});

// ---------- El sıkışma ----------

test('salla: lider hazir görünce başlar ve basla gönderir; diğeri bekler', () => {
  const lider = yeni();
  assert.equal(elSikis(lider, 'hazir', true), true);
  assert.equal(lider.faz, 'oyun');
  const diger = yeni();
  assert.equal(elSikis(diger, 'hazir', false), false);
  assert.equal(diger.faz, 'bekle');
  assert.equal(elSikis(diger, 'basla', false), false);
  assert.equal(diger.faz, 'oyun');
});

test('salla: basla kaybolursa lider sonraki hazir ile yineler; süresini sıfırlamaz', () => {
  const lider = yeni();
  elSikis(lider, 'hazir', true);
  git(lider, 2000);
  assert.equal(elSikis(lider, 'hazir', true), true);
  assert.equal(lider.t, 2000);
});

test('salla: oyunun geç anında gelen hazir eski oyuna bağlanmaz; bitti fazında yanıt yok', () => {
  const lider = yeni();
  elSikis(lider, 'hazir', true);
  git(lider, BASLA_YINELE_MS);
  assert.equal(elSikis(lider, 'hazir', true), false);
  git(lider, SURE);
  assert.equal(elSikis(lider, 'hazir', true), false);
  assert.equal(lider.faz, 'bitti');
});

test('salla: oyundaki taraf gelen basla ile yeniden başlamaz; bilinmeyen mesaj etkisiz', () => {
  const s = yeni();
  elSikis(s, 'basla', false);
  git(s, 1234);
  assert.equal(elSikis(s, 'basla', false), false);
  assert.equal(s.t, 1234);
  const b = yeni();
  assert.equal(elSikis(b, 'xyz', true), false);
  assert.equal(b.faz, 'bekle');
});
