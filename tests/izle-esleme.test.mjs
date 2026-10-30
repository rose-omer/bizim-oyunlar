import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  gecerliId, saniyeAyristir, videoAyristir, kapakUrl, sonaEkle, sureYazi, oncesi,
  hedefZaman, sicramaVar, saatFarki, dahaYeni, createEsleyici,
  KAYMA_ESIK, BASTIR_MS, YUKLE_BASTIR_MS, KALP_MS,
} from '../sayfalar/izle/esleme.js';

const ID = 'dQw4w9WgXcQ';

// ---------- Bağlantı ayrıştırma ----------

test('videoAyristir: watch, youtu.be, shorts, embed, live, m./music., nocookie, yalın kimlik', () => {
  const ok = (s, id, bas = 0) => assert.deepEqual(videoAyristir(s), { id, baslangic: bas }, s);
  ok(`https://www.youtube.com/watch?v=${ID}`, ID);
  ok(`youtube.com/watch?v=${ID}&list=PL123&index=2`, ID);
  ok(`https://m.youtube.com/watch?feature=share&v=${ID}`, ID);
  ok(`https://music.youtube.com/watch?v=${ID}`, ID);
  ok(`https://youtu.be/${ID}`, ID);
  ok(`https://youtu.be/${ID}?si=AbCdEf`, ID);
  ok(`https://www.youtube.com/shorts/${ID}`, ID);
  ok(`https://youtube.com/shorts/${ID}?feature=share`, ID);
  ok(`https://www.youtube.com/embed/${ID}?start=42`, ID, 42);
  ok(`https://www.youtube-nocookie.com/embed/${ID}`, ID);
  ok(`https://www.youtube.com/live/${ID}`, ID);
  ok(`https://www.youtube.com/v/${ID}`, ID);
  ok(ID, ID);
  ok(`  Şuna bak: https://youtu.be/${ID}?t=95 çok güzel  `, ID, 95);
});

test('videoAyristir: t= başlangıcı (saniye, 1m30s, 1h2m3s, #t=)', () => {
  assert.equal(videoAyristir(`https://youtu.be/${ID}?t=90`).baslangic, 90);
  assert.equal(videoAyristir(`https://youtu.be/${ID}?t=90s`).baslangic, 90);
  assert.equal(videoAyristir(`https://www.youtube.com/watch?v=${ID}&t=1m30s`).baslangic, 90);
  assert.equal(videoAyristir(`https://www.youtube.com/watch?v=${ID}&t=1h2m3s`).baslangic, 3723);
  assert.equal(videoAyristir(`https://www.youtube.com/watch?v=${ID}#t=2m`).baslangic, 120);
  assert.equal(videoAyristir(`https://www.youtube.com/watch?v=${ID}&t=abc`).baslangic, 0);
});

test('videoAyristir: YouTube olmayan ya da bozuk bağlantılar null', () => {
  for (const s of [
    '', '   ', 'merhaba', 'https://vimeo.com/123456', `https://example.com/watch?v=${ID}`,
    'https://www.youtube.com/watch?v=kisa', 'https://youtu.be/', 'https://www.youtube.com/@kanal',
    `https://youtube.com.evil.example/watch?v=${ID}`, null, undefined,
  ]) assert.equal(videoAyristir(s), null, String(s));
});

test('saniyeAyristir ve sureYazi', () => {
  assert.equal(saniyeAyristir('75'), 75);
  assert.equal(saniyeAyristir('2m5s'), 125);
  assert.equal(saniyeAyristir('1h'), 3600);
  assert.equal(saniyeAyristir('1:30'), 90);
  assert.equal(saniyeAyristir('01:02:03'), 3723);
  assert.equal(saniyeAyristir(''), 0);
  assert.equal(saniyeAyristir('x1m'), 0);
  assert.equal(sureYazi(65), '1:05');
  assert.equal(sureYazi(3723), '1:02:03');
  assert.equal(sureYazi(-3), '0:00');
});

test('gecerliId ve kapakUrl', () => {
  assert.equal(gecerliId(ID), true);
  assert.equal(gecerliId('kısa'), false);
  assert.equal(gecerliId(`${ID}x`), false);
  assert.equal(kapakUrl(ID), `https://i.ytimg.com/vi/${ID}/mqdefault.jpg`);
  assert.equal(kapakUrl('<script>'), '');
});

test('sonaEkle: başa ekler, tekilleştirir, en çok 10, eski başlığı korur', () => {
  let l = [];
  for (let i = 0; i < 12; i++) l = sonaEkle(l, { id: `video${String(i).padStart(6, '0')}`, baslik: `V${i}`, at: i });
  assert.equal(l.length, 10);
  assert.equal(l[0].baslik, 'V11');
  assert.equal(l.at(-1).baslik, 'V2');
  l = sonaEkle(l, { id: 'video000005', baslik: '', at: 99 });
  assert.equal(l[0].id, 'video000005');
  assert.equal(l[0].baslik, 'V5', 'boş başlık eskisini ezmez');
  assert.equal(l.filter((x) => x.id === 'video000005').length, 1);
  assert.deepEqual(sonaEkle(l, { id: 'bozuk' }), l);
  assert.deepEqual(sonaEkle(null, { id: ID, baslik: 'a', at: 1 }), [{ id: ID, baslik: 'a', at: 1 }]);
});

// ---------- Saf eşleme yardımcıları ----------

test('hedefZaman: oynarken hızla ilerler, duruyorken sabit', () => {
  assert.equal(hedefZaman({ durum: 'oynuyor', zaman: 10, hiz: 1, at: 1000 }, 3000), 12);
  assert.equal(hedefZaman({ durum: 'oynuyor', zaman: 10, hiz: 2, at: 1000 }, 3000), 14);
  assert.equal(hedefZaman({ durum: 'durdu', zaman: 10, hiz: 1, at: 1000 }, 9000), 10);
  assert.equal(hedefZaman(null, 1), 0);
});

test('sicramaVar: normal akış ve tamponda kalma sıçrama değildir; sarma sıçramadır', () => {
  const once = { zaman: 10, at: 1000, oynuyor: true, hiz: 1 };
  assert.equal(sicramaVar(once, { zaman: 10.5, at: 1500 }), false);
  assert.equal(sicramaVar(once, { zaman: 10.1, at: 1500 }), false, 'yarım sn takılma');
  assert.equal(sicramaVar(once, { zaman: 40, at: 1500 }), true, 'ileri sardı');
  assert.equal(sicramaVar(once, { zaman: 2, at: 1500 }), true, 'geri sardı');
  assert.equal(sicramaVar({ ...once, oynuyor: false }, { zaman: 10, at: 9000 }), false);
});

test('saatFarki ve dahaYeni', () => {
  assert.deepEqual(saatFarki(1000, 5050, 1100), { fark: 4000, rtt: 100 });
  assert.equal(dahaYeni({ surum: 3, sahip: 'a' }, { surum: 2, sahip: 'z' }), true);
  assert.equal(dahaYeni({ surum: 2, sahip: 'a' }, { surum: 3, sahip: 'a' }), false);
  assert.equal(dahaYeni({ surum: 2, sahip: 'b' }, { surum: 2, sahip: 'a' }), true, 'eşitlikte büyük kimlik');
  assert.equal(dahaYeni({ surum: 2, sahip: 'a' }, { surum: 2, sahip: 'b' }), false);
  assert.equal(dahaYeni({ surum: 1, sahip: 'a' }, null), true);
});

// ---------- Denetleyici: iki sahte oynatıcı ----------

function sahteOynatici(saat) {
  const p = {
    t: 0, d: 'yok', h: 1, son: saat.now, video: null, log: [], engelli: false,
    ilerle() { const n = saat.now; if (p.d === 'oynuyor') p.t += ((n - p.son) / 1000) * p.h; p.son = n; },
    zaman() { p.ilerle(); return p.t; },
    durum() { return p.d; },
    hiz() { return p.h; },
    oynat() { p.ilerle(); p.log.push('oynat'); if (!p.engelli) p.d = 'oynuyor'; },
    duraklat() { p.ilerle(); p.log.push('duraklat'); p.d = 'durdu'; },
    git(sn) { p.ilerle(); p.log.push(['git', Math.round(sn * 10) / 10]); p.t = sn; },
    hizAyarla(h) { p.ilerle(); p.log.push(['hiz', h]); p.h = h; },
    yukle(id, sn, oyn) {
      p.ilerle();
      p.log.push(['yukle', id, Math.round(sn * 10) / 10, oyn]);
      p.video = id; p.t = sn;
      p.d = oyn ? (p.engelli ? 'hazir' : 'oynuyor') : 'durdu';
    },
    // kullanıcı oynatıcının kendi düğmeleriyle oynuyor
    kDuraklat() { p.ilerle(); p.d = 'durdu'; },
    kOynat() { p.ilerle(); p.d = 'oynuyor'; },
    kSar(sn) { p.ilerle(); p.t = sn; },
    kHiz(h) { p.ilerle(); p.h = h; },
  };
  return p;
}

function ikili({ gecikme = 200 } = {}) {
  const saat = { now: 100_000 };
  const kutu = { A: [], B: [] };
  const engel = { A: [], B: [] };
  const pa = sahteOynatici(saat), pb = sahteOynatici(saat);
  const A = createEsleyici({ oynatici: pa, ben: 'A', simdi: () => saat.now, gonder: (m) => kutu.B.push(JSON.parse(JSON.stringify(m))), onEngel: (v) => engel.A.push(v) });
  const B = createEsleyici({ oynatici: pb, ben: 'B', simdi: () => saat.now, gonder: (m) => kutu.A.push(JSON.parse(JSON.stringify(m))), onEngel: (v) => engel.B.push(v) });
  const ilerle = (ms) => { saat.now += ms; };
  // Mesajları gecikmeyle teslim et; her teslimden sonra alıcı yoklar
  const teslim = (kime) => {
    const k = kutu[kime].splice(0);
    ilerle(gecikme);
    return k.map((m) => (kime === 'A' ? A : B).uzaktan(m));
  };
  // Zamanı yoklamalarla ilerlet (500 ms adım)
  const zaman = (ms) => {
    for (let t = 0; t < ms; t += 500) { ilerle(Math.min(500, ms - t)); A.denetle(); B.denetle(); }
  };
  return { saat, kutu, engel, pa, pb, A, B, ilerle, teslim, zaman };
}

test('video açılınca karşıya yayılır; alıcı ağ gecikmesini telafi ederek yükler', () => {
  const t = ikili({ gecikme: 300 });
  t.A.videoAc(ID, 30);
  assert.deepEqual(t.pa.log[0], ['yukle', ID, 30, true]);
  assert.equal(t.kutu.B.length, 1);
  const m = t.kutu.B[0];
  assert.equal(m.t, 'izle');
  assert.equal(m.videoId, ID);
  assert.equal(m.durum, 'oynuyor');
  assert.equal(typeof m.at, 'number');
  assert.deepEqual(t.teslim('B'), ['tamam']);
  assert.deepEqual(t.pb.log[0], ['yukle', ID, 30.3, true], '300 ms gecikme eklenir');
  assert.equal(t.B.lider, false);
  assert.equal(t.A.lider, true);
});

test('yankı yok: uzaktan uygulanan eylem geri yayılmaz', () => {
  const t = ikili();
  t.A.videoAc(ID, 0);
  t.teslim('B');
  t.zaman(YUKLE_BASTIR_MS + 3000);
  assert.equal(t.kutu.A.length, 0, 'B hiçbir şey yaymadı');
  t.pa.kDuraklat();
  t.A.denetle();
  assert.equal(t.kutu.B.length, 1);
  t.teslim('B');
  assert.ok(t.pb.log.includes('duraklat'));
  t.zaman(3000);
  assert.equal(t.kutu.A.length, 0, 'duraklatmanın yankısı da yok');
  assert.equal(t.kutu.B.length, 0);
});

test('oynat/duraklat iki yönde eşlenir; son eylemi yapan lider olur', () => {
  const t = ikili();
  t.A.videoAc(ID, 0);
  t.teslim('B');
  t.zaman(YUKLE_BASTIR_MS + 1000);
  t.pb.kDuraklat();
  t.B.denetle();
  assert.equal(t.B.lider, true);
  t.teslim('A');
  assert.equal(t.pa.durum(), 'durdu');
  assert.equal(t.A.lider, false);
  const dur = t.pb.zaman();
  assert.ok(Math.abs(t.pa.zaman() - dur) <= KAYMA_ESIK);
  t.zaman(2000);
  t.pa.kOynat();
  t.A.denetle();
  t.teslim('B');
  assert.equal(t.pb.durum(), 'oynuyor');
  assert.equal(t.A.lider, true);
});

test('ileri sarma algılanır ve karşıda 1,5 sn\'den büyük kaymada git() çağrılır', () => {
  const t = ikili();
  t.A.videoAc(ID, 0);
  t.teslim('B');
  t.zaman(YUKLE_BASTIR_MS + 1000);
  t.pa.kSar(120);
  t.A.denetle();
  assert.equal(t.kutu.B.length, 1);
  assert.equal(t.kutu.B[0].zaman, 120);
  t.teslim('B');
  const git = t.pb.log.filter((x) => Array.isArray(x) && x[0] === 'git');
  assert.equal(git.length, 1);
  assert.ok(Math.abs(git[0][1] - 120.2) < 0.05, `hedef ${git[0][1]}`);
});

test('küçük kayma (≤ 1,5 sn) için git() yapılmaz', () => {
  const t = ikili({ gecikme: 100 });
  t.A.videoAc(ID, 0);
  t.teslim('B');
  t.zaman(YUKLE_BASTIR_MS + 1000);
  t.pb.t += 1.0; // B bir saniye önde
  t.pa.kDuraklat();
  t.A.denetle();
  t.teslim('B');
  const gitler = t.pb.log.filter((x) => Array.isArray(x) && x[0] === 'git');
  assert.equal(gitler.length, 0);
});

test('hız değişimi eşlenir', () => {
  const t = ikili();
  t.A.videoAc(ID, 0);
  t.teslim('B');
  t.zaman(YUKLE_BASTIR_MS + 500);
  t.pa.kHiz(1.5);
  t.A.denetle();
  assert.equal(t.kutu.B[0].hiz, 1.5);
  t.teslim('B');
  assert.equal(t.pb.hiz(), 1.5);
  t.zaman(3000);
  assert.equal(t.kutu.A.length, 0, 'hız yankısı yok');
});

test('son eylem kazanır: aynı anda iki eylemde iki taraf aynı sonuca varır', () => {
  const t = ikili();
  t.A.videoAc(ID, 0);
  t.teslim('B');
  t.zaman(YUKLE_BASTIR_MS + 1000);
  t.pa.kDuraklat(); t.A.denetle();     // A: duraklat (sürüm 2, A)
  t.pb.kSar(200); t.B.denetle();       // B: aynı anda sarar (sürüm 2, B)
  const ra = t.teslim('A');
  const rb = t.teslim('B');
  assert.deepEqual(ra, ['tamam'], 'A, B\'nin eylemini kabul eder (eşitlikte büyük kimlik)');
  assert.deepEqual(rb, ['eski'], 'B, A\'nın eylemini eski sayar');
  assert.equal(t.A.ortak.durum, t.B.ortak.durum);
  assert.ok(Math.abs(t.A.ortak.zaman - t.B.ortak.zaman) < 1);
  assert.ok(t.pa.zaman() > 199);
});

test('eski mesaj geç gelirse yok sayılır', () => {
  const t = ikili();
  t.A.videoAc(ID, 0);
  const ilk = t.kutu.B.splice(0);
  t.zaman(1000);
  t.A.videoAc('aaaaaaaaaaa', 0);
  t.teslim('B');
  assert.equal(t.B.ortak.videoId, 'aaaaaaaaaaa');
  assert.equal(t.B.uzaktan(ilk[0]), 'eski');
  assert.equal(t.B.ortak.videoId, 'aaaaaaaaaaa');
  assert.equal(t.B.uzaktan({ t: 'izle', videoId: 'kotu' }), 'gecersiz');
});

test('otomatik oynatma engeli: kaplama ister, yaymaz; dokununca ortak zamandan oynar', () => {
  const t = ikili();
  t.pb.engelli = true;
  t.A.videoAc(ID, 0);
  t.teslim('B');
  assert.equal(t.pb.durum(), 'hazir');
  t.zaman(YUKLE_BASTIR_MS + 1000);
  assert.deepEqual(t.engel.B, [true]);
  assert.equal(t.kutu.A.length, 0, 'engellenen oynatma duraklatma diye yayılmaz');
  t.pb.engelli = false;
  t.B.dokunOynat();
  assert.equal(t.pb.durum(), 'oynuyor');
  assert.ok(Math.abs(t.pb.zaman() - t.pa.zaman()) < 0.5, 'ortak zamana gitti');
  assert.deepEqual(t.engel.B, [true, false]);
  t.zaman(3000);
  assert.equal(t.kutu.A.length, 0, 'dokunarak oynatmak eylem değildir');
});

test('engelli oynatıcı "durdu"ya düşse de oynamadıysa yayın yapmaz', () => {
  const t = ikili();
  t.A.videoAc(ID, 0);
  t.teslim('B');
  t.zaman(YUKLE_BASTIR_MS + 1000);
  t.pa.kDuraklat(); t.A.denetle(); t.teslim('B');
  t.zaman(2000);
  t.pb.engelli = true;
  t.pa.kOynat(); t.A.denetle(); t.teslim('B');
  t.pb.d = 'durdu'; // tarayıcı oynatmayı reddetti
  t.zaman(BASTIR_MS + 1000);
  assert.equal(t.kutu.A.length, 0);
  assert.equal(t.engel.B.at(-1), true);
});

test('takipçi tamponda kalırsa yaymaz; sonra ortak zamana yetişir', () => {
  const t = ikili();
  t.A.videoAc(ID, 0);
  t.teslim('B');
  t.zaman(YUKLE_BASTIR_MS + 1000);
  t.pb.ilerle();
  t.pb.d = 'tamponda';
  t.zaman(3000);
  assert.equal(t.kutu.A.length, 0, 'tampon yayılmaz');
  t.pb.ilerle();
  t.pb.d = 'oynuyor';
  t.B.denetle();
  assert.equal(t.kutu.A.length, 0);
  const git = t.pb.log.filter((x) => Array.isArray(x) && x[0] === 'git');
  assert.equal(git.length, 1, 'geride kalan takipçi yetişir');
  assert.ok(Math.abs(t.pb.zaman() - t.pa.zaman()) < 0.2);
});

test('lider oynarken düzenli kalp atışı yollar; alıcı yalnız kaymayı düzeltir', () => {
  const t = ikili();
  t.A.videoAc(ID, 0);
  t.teslim('B');
  t.zaman(KALP_MS + 500);
  const kalp = t.kutu.B.filter((m) => m.kalp);
  assert.ok(kalp.length >= 1);
  t.pb.t -= 3; // B 3 sn geride kaldı
  const once = t.pb.log.length;
  t.teslim('B');
  const yeni = t.pb.log.slice(once);
  assert.ok(yeni.some((x) => Array.isArray(x) && x[0] === 'git'), 'kayma düzeltildi');
  assert.ok(!yeni.includes('oynat'), 'durum zaten aynı');
  assert.equal(t.kutu.A.length, 0);
});

test('saat farkı: karşının saati ileri olsa da gecikme doğru telafi edilir', () => {
  const t = ikili({ gecikme: 200 });
  // A'nın saati B'ninkinden 5 sn ileri: A'nın mesajındaki at'i 5 sn ileri yaz
  t.B.saatOrnek(1000, 6050, 1100); // fark +5000, rtt 100
  t.A.videoAc(ID, 10);
  t.kutu.B[0].at += 5000;
  t.teslim('B');
  const y = t.pb.log.find((x) => x[0] === 'yukle');
  assert.equal(y[2], 10.2, 'yalnız 200 ms eklenir');
  // Daha kötü (uzun rtt) ölçüm en iyiyi bozmaz
  t.B.saatOrnek(0, 99999, 2000);
  assert.equal(t.B.saat.rtt, 100);
});

test('durumMesaji: partner gelince güncel konum; video yokken null', () => {
  const t = ikili();
  assert.equal(t.A.durumMesaji(), null);
  t.A.videoAc(ID, 5);
  t.ilerle(2000);
  const m = t.A.durumMesaji();
  assert.equal(m.zaman, 7);
  assert.equal(m.videoId, ID);
  // Yeni gelen B mesajı alır ve yükler
  assert.equal(t.B.uzaktan(m), 'tamam');
  assert.equal(t.pb.video, ID);
});

test('oynatıcı sonradan hazır olursa ortak durumu yükler', () => {
  const t = ikili();
  t.A.videoAc(ID, 0);
  t.pb.d = 'yok';
  t.teslim('B');
  t.ilerle(3000);
  t.pb.log.length = 0;
  t.B.oynaticiHazir();
  assert.equal(t.pb.log[0][0], 'yukle');
  assert.ok(t.pb.log[0][2] >= 3, 'geçen süre eklenir');
});

test('oncesi: göreli zaman', () => {
  const now = 10 * 86400000;
  assert.equal(oncesi(now - 20000, now), 'az önce');
  assert.equal(oncesi(now - 5 * 60000, now), '5 dk önce');
  assert.equal(oncesi(now - 3 * 3600000, now), '3 sa önce');
  assert.equal(oncesi(now - 30 * 3600000, now), 'dün');
  assert.equal(oncesi(now - 4 * 86400000, now), '4 gün önce');
});

test('esitle: oynatıcının hâlini yeni eylem olarak yayar; karşı taraf ona gider', () => {
  const t = ikili();
  assert.equal(t.A.esitle(), false, 'video yokken');
  t.A.videoAc(ID, 0);
  t.teslim('B');
  t.zaman(YUKLE_BASTIR_MS + 1000);
  t.pb.t += 0.8; // küçük kayma: kendiliğinden düzeltilmez
  assert.equal(t.B.esitle(), true);
  assert.equal(t.B.lider, true);
  t.teslim('A');
  assert.ok(Math.abs(t.pa.zaman() - t.pb.zaman()) < 1);
  assert.equal(t.A.lider, false);
});
