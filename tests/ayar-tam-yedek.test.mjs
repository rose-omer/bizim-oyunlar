// Parolalı, medyalı tam yedek: biçim (AES-GCM, PBKDF2), üretim, geri yükleme planı, eski düz yedek, aylık hatırlatma.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { yedekYazici, yedekOkuyucu, sifreliMi, YedekHatasi, sifreDestegi, TEKRAR } from '../js/core/yedek-sifre.js';
import { yedekMedyalari, tamYedekUret, tamYedekOku, medyaEsle, belgelereUygula } from '../sayfalar/ayarlar/yedek-tam.js';
import {
  yedektenBelgeler, yedekDosyaAdi, tamYedekDosyaAdi, parolaHatasi, kullanimGorunum, yedekSonGun, odaSilGorunum,
} from '../sayfalar/ayarlar/mantik.js';
import { yedekHatirlatGerekli } from '../js/core/yedek-hatirlat.js';
import { dosyaPaylas } from '../js/core/dosya-paylas.js';

const AZ = { tekrar: 1000 }; // testte hızlı
const ODA = 'abcdefgh23';
const U1 = '0f8e2a1c-1b2d-4c3e-8f9a-0123456789ab';
const U2 = '1f8e2a1c-1b2d-4c3e-8f9a-0123456789ab';
const genel = (y) => `https://blgtlflryxknyalutugw.supabase.co/storage/v1/object/public/photos/${y}`;
const bayt = (n, d = 7) => new Uint8Array(n).fill(d);

async function yaz(parola, kayitlar, ayar = AZ) {
  const y = await yedekYazici(parola, ayar);
  for (const [meta, veri] of kayitlar) await y.ekle(meta, veri);
  return y.bitir();
}
async function oku(blob, parola) {
  const o = await yedekOkuyucu(blob, parola);
  const out = [];
  for await (const k of o.kayitlar()) out.push(k);
  return out;
}

test('biçim: yazılan kayıtlar aynen okunur; 4 MB\'tan büyük kayıt parçalara bölünür; dosyada düz metin yok', async () => {
  const buyuk = bayt(9 * 1024 * 1024, 42);
  const gizli = new TextEncoder().encode('çok gizli mesaj');
  const b = await yaz('parola1234', [[{ tur: 'veri' }, gizli], [{ tur: 'medya', ref: 'x' }, buyuk], [{ tur: 'medya', ref: 'y' }, new Uint8Array(0)]]);
  assert.equal(await sifreliMi(b), true);
  const ham = new TextDecoder('latin1').decode(new Uint8Array(await b.arrayBuffer()));
  assert.ok(!ham.includes('gizli'));
  const r = await oku(b, 'parola1234');
  assert.equal(r.length, 3);
  assert.deepEqual(r[0].meta, { tur: 'veri', boy: gizli.length });
  assert.deepEqual(r[0].veri, gizli);
  assert.equal(r[1].veri.length, buyuk.length);
  assert.ok(r[1].veri.every((x) => x === 42));
  assert.equal(r[2].veri.length, 0);
});

test('biçim: yanlış parola ve kısaltılmış, değiştirilmiş dosya reddedilir', async () => {
  const b = await yaz('parola1234', [[{ tur: 'veri' }, bayt(1000)], [{ tur: 'medya' }, bayt(5 * 1024 * 1024)]]);
  await assert.rejects(oku(b, 'yanlis-parola'), (e) => e instanceof YedekHatasi && e.neden === 'parola');
  const tam = new Uint8Array(await b.arrayBuffer());
  await assert.rejects(oku(new Blob([tam.slice(0, tam.length - 2000)]), 'parola1234'), (e) => e.neden === 'yarim');
  // Son parça tümüyle eksik: sınırda kesilmiş dosya da tam sayılmaz.
  const ilkParcaSonu = tam.length - (await sonParcaBoyu(tam));
  await assert.rejects(oku(new Blob([tam.slice(0, ilkParcaSonu)]), 'parola1234'), (e) => e.neden === 'yarim');
  const bozuk = tam.slice();
  bozuk[bozuk.length - 10] ^= 0xff;
  await assert.rejects(oku(new Blob([bozuk]), 'parola1234'), (e) => e.neden === 'bozuk');
  await assert.rejects(yedekOkuyucu(new Blob(['{"x":1}']), 'p'), (e) => e.neden === 'bicim');
  assert.equal(await sifreliMi(new Blob(['{"uygulama":"Biz İkimiz"}'])), false);
});

// Dosyanın son parçasının toplam boyu (uzunluk + bayrak + şifreli metin): çerçeveler sırayla gezilir.
async function sonParcaBoyu(tam) {
  const g = new DataView(tam.buffer);
  const sihir = 10;
  const baslik = g.getUint32(sihir);
  let i = sihir + 4 + baslik;
  let son = 0;
  while (i < tam.length) {
    son = 5 + g.getUint32(i);
    i += son;
  }
  return son;
}

test('biçim: varsayılan PBKDF2 tekrarı güçlü; başlıktaki aşırı tekrar reddedilir; her yedeğin tuzu farklı', async () => {
  assert.ok(TEKRAR >= 600000);
  const a = new Uint8Array(await (await yaz('p', [], AZ)).arrayBuffer());
  const b = new Uint8Array(await (await yaz('p', [], AZ)).arrayBuffer());
  assert.notDeepEqual(a.slice(0, 200), b.slice(0, 200));
  const d = new DataView(a.buffer);
  const n = d.getUint32(10);
  const bas = JSON.parse(new TextDecoder().decode(a.slice(14, 14 + n)));
  bas.tekrar = 50_000_000;
  const yeni = new TextEncoder().encode(JSON.stringify(bas));
  const uz = new Uint8Array(4);
  new DataView(uz.buffer).setUint32(0, yeni.length);
  await assert.rejects(yedekOkuyucu(new Blob([a.slice(0, 10), uz, yeni, a.slice(14 + n)]), 'p'), (e) => e.neden === 'bicim');
});

test('sifreDestegi: crypto.subtle yoksa (http yerel ağ) false', () => {
  assert.equal(sifreDestegi({ subtle: {} }), true);
  assert.equal(sifreDestegi({}), false);
  assert.equal(sifreDestegi(null), false);
});

test('yedekMedyalari: belgelerdeki başvurular tekil; eski adres, kova: ve local:; yabancı adres yok', () => {
  const y = { turler: {
    ani: [{ id: '1', data: { fotolar: [genel(`${ODA}/${U1}.webp`), `kova:${ODA}/${U2}.jpg`], dis: 'https://evil.example/a.webp' } }],
    mesaj: [{ id: '2', data: { ses: { url: `kova:${ODA}/${U2}.webm` }, foto: genel(`${ODA}/${U1}.webp`), metin: 'kova:yok' } }],
    not: [{ id: '3', data: { foto: 'local:abc' } }],
  } };
  assert.deepEqual(yedekMedyalari(y).sort(), [genel(`${ODA}/${U1}.webp`), `kova:${ODA}/${U2}.jpg`, `kova:${ODA}/${U2}.webm`, 'local:abc'].sort());
});

const yedek = () => ({
  uygulama: 'Biz İkimiz', surum: '2.0', alindi: '2026-11-04T00:00:00.000Z',
  turler: {
    ani: [{ id: 'a1', data: { baslik: 'Kapadokya', fotolar: [`kova:${ODA}/${U1}.webp`, 'local:abc'] }, author: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }],
    mesaj: [{ id: 'm1', data: { ses: { url: `kova:${ODA}/${U2}.webm` } }, author: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }],
  },
});

test('tamYedekUret + tamYedekOku: belge ve medya gider gelir; alınamayan dosya sayılır, yedek durmaz; eski okuyucu belgeyi anlar', async () => {
  const ilerleme = [];
  const { blob, eksikMedya, medyaSayisi } = await tamYedekUret({
    yedek: yedek(), parola: 'parola1234', ayar: AZ,
    indir: async (ref) => {
      if (ref.endsWith('.webm')) throw new Error('404');
      return new Blob([bayt(10, ref.startsWith('local') ? 1 : 2)], { type: 'image/webp' });
    },
    onIlerleme: (b, t) => ilerleme.push([b, t]),
  });
  assert.equal(medyaSayisi, 2);
  assert.deepEqual(eksikMedya, [`kova:${ODA}/${U2}.webm`]);
  assert.deepEqual(ilerleme.at(-1), [4, 4]);

  const ac = await tamYedekOku(blob, 'parola1234');
  assert.equal(ac.yedek.uygulama, 'Biz İkimiz');
  assert.equal(yedektenBelgeler(ac.yedek).belgeler.length, 2);
  const medya = [];
  for await (const m of ac.medyalar()) medya.push([m.ref, m.blob.size, m.blob.type]);
  assert.deepEqual(medya, [[`kova:${ODA}/${U1}.webp`, 10, 'image/webp'], ['local:abc', 10, 'image/webp']]);
});

test('medyaEsle: aynı oda aynı yola; eksik olmayan atlanır; başka oda ve yerel yeniden yüklenip başvuru değişir; hata sayılır', async () => {
  const cagrilar = [];
  const sonuc = await medyaEsle({
    roomId: ODA,
    yerel: false,
    varOlan: new Set([`${ODA}/${U2}.webm`]),
    medyalar: (async function* gen() {
      yield { ref: `kova:${ODA}/${U1}.webp`, blob: new Blob(['a'], { type: 'image/webp' }) };
      yield { ref: `kova:${ODA}/${U2}.webm`, blob: new Blob(['b'], { type: 'audio/webm' }) };
      yield { ref: `kova:zzzzzzzz22/${U1}.jpg`, blob: new Blob(['c'], { type: 'image/jpeg' }) };
      yield { ref: 'local:abc', blob: new Blob(['d'], { type: 'audio/mp4' }) };
      yield { ref: genel(`${ODA}/${U2}.jpg`), blob: new Blob(['e'], { type: 'image/jpeg' }) };
    })(),
    geriYukle: async (blob, oda, yol) => { cagrilar.push(['geri', yol]); if (yol.endsWith(`${U2}.jpg`)) throw new Error('dolu'); return 'yuklendi'; },
    yeniFoto: async () => { cagrilar.push(['foto']); return 'kova:yeni-foto'; },
    yeniSes: async () => { cagrilar.push(['ses']); return 'kova:yeni-ses'; },
  });
  assert.deepEqual(cagrilar, [['geri', `${ODA}/${U1}.webp`], ['foto'], ['ses'], ['geri', `${ODA}/${U2}.jpg`]]);
  assert.deepEqual([...sonuc.harita], [[`kova:zzzzzzzz22/${U1}.jpg`, 'kova:yeni-foto'], ['local:abc', 'kova:yeni-ses']]);
  assert.deepEqual([sonuc.yuklenen, sonuc.atlanan, sonuc.hata], [3, 1, 1]);
  assert.equal(sonuc.ilkHata, 'dolu');
});

test('belgelereUygula: yeni başvurular veriye iç içe yazılır; harita boşsa aynı', () => {
  const b = [{ kind: 'ani', id: '1', data: { fotolar: ['local:abc', 'kalir'], ic: { foto: 'local:abc' } } }];
  assert.equal(belgelereUygula(b, new Map()), b);
  const y = belgelereUygula(b, new Map([['local:abc', 'kova:yeni']]));
  assert.deepEqual(y[0].data, { fotolar: ['kova:yeni', 'kalir'], ic: { foto: 'kova:yeni' } });
  assert.equal(b[0].data.fotolar[0], 'local:abc', 'girdi değişmez');
});

test('eski düz JSON yedek okunmaya devam eder', () => {
  const r = yedektenBelgeler(JSON.stringify({ uygulama: 'Biz İkimiz', surum: '2.0', turler: { gun: [{ id: 'g', data: { baslik: 'x' } }] } }));
  assert.equal(r.belgeler.length, 1);
  assert.match(yedekDosyaAdi(new Date('2026-11-04T12:00:00')), /\.json$/);
  assert.match(tamYedekDosyaAdi(new Date('2026-11-04T12:00:00')), /^biz-ikimiz-tam-yedek-2026-11-04\.bizyedek$/);
});

test('parolaHatasi: en az 8 karakter; tekrar eşleşmeli', () => {
  assert.match(parolaHatasi('kisa', 'kisa'), /en az 8/);
  assert.match(parolaHatasi('uzunparola', 'baska'), /eşleşmiyor/);
  assert.equal(parolaHatasi('uzunparola', 'uzunparola'), null);
});

test('kullanimGorunum: MB ve yüzde; dolunca uyarır; veri yoksa null', () => {
  assert.equal(kullanimGorunum(null), null);
  const g = kullanimGorunum({ bayt: 52428800, dosya: 12, ses_bayt: 1048576, sinir: 838860800 });
  assert.equal(g.oran, 0.0625);
  assert.match(g.metin, /50 MB \/ 800 MB/);
  assert.match(g.alt, /12 dosya/);
  assert.match(g.alt, /sesli mesaj 1 MB/);
  assert.equal(g.uyari, null);
  assert.ok(kullanimGorunum({ bayt: 800000000, dosya: 1, ses_bayt: 0, sinir: 838860800 }).uyari);
  assert.equal(kullanimGorunum({ bayt: 5, dosya: 1, ses_bayt: 0, sinir: 0 }).oran, 1);
});

test('yedekSonGun: son yedek metni', () => {
  const simdi = new Date('2026-11-04T12:00:00Z');
  assert.match(yedekSonGun(null, simdi), /Henüz tam yedek almadın/);
  assert.match(yedekSonGun('2026-11-04T10:00:00Z', simdi), /bugün/);
  assert.match(yedekSonGun('2026-10-05T12:00:00Z', simdi), /30 gün önce/);
  assert.match(yedekSonGun('bozuk', simdi), /Henüz/);
});

test('yedekHatirlatGerekli: 30 gün; hiç yedek yoksa ilk görülmeden 30 gün; ertele 7 gün', () => {
  const g = 86_400_000;
  const simdi = Date.parse('2026-11-04T00:00:00Z');
  const iso = (d) => new Date(simdi - d * g).toISOString();
  assert.equal(yedekHatirlatGerekli({ son: iso(10), ilk: iso(100), simdi }), false);
  assert.equal(yedekHatirlatGerekli({ son: iso(31), ilk: iso(100), simdi }), true);
  assert.equal(yedekHatirlatGerekli({ son: null, ilk: iso(5), simdi }), false);
  assert.equal(yedekHatirlatGerekli({ son: null, ilk: iso(31), simdi }), true);
  assert.equal(yedekHatirlatGerekli({ son: null, ilk: null, simdi }), false);
  assert.equal(yedekHatirlatGerekli({ son: iso(31), ilk: iso(100), ertelendi: iso(3), simdi }), false);
  assert.equal(yedekHatirlatGerekli({ son: iso(31), ilk: iso(100), ertelendi: iso(8), simdi }), true);
});

test('odaSilGorunum: dört durum', () => {
  assert.equal(odaSilGorunum(null), 'yok');
  assert.equal(odaSilGorunum({ bekliyor: false }), 'bos');
  assert.equal(odaSilGorunum({ bekliyor: true, ben: true, tek: false }), 'bekliyorum');
  assert.equal(odaSilGorunum({ bekliyor: true, ben: true, tek: true }), 'onayla');
  assert.equal(odaSilGorunum({ bekliyor: true, ben: false, tek: false }), 'onayla');
});

test('dosyaPaylas: büyük Blob uygulamada parça parça yazılır (base64), sonra paylaşılır', async () => {
  const yazilan = [];
  const veri = bayt(7 * 1024 * 1024 + 5, 65);
  const o = {
    yerel: true,
    nav: {},
    eklenti: (ad) => (ad === 'Filesystem'
      ? {
        writeFile: async (a) => { yazilan.push(['yaz', a]); return { uri: 'file://x' }; },
        appendFile: async (a) => { yazilan.push(['ekle', a]); },
      }
      : { share: async ({ files }) => { yazilan.push(['paylas', files]); } }),
  };
  const r = await dosyaPaylas({ blob: new Blob([veri]), ad: 'y.bizyedek', tur: 'application/octet-stream', webShare: false }, o);
  assert.equal(r, 'paylasildi');
  assert.equal(yazilan[0][0], 'yaz');
  assert.equal(yazilan[0][1].encoding, undefined, 'base64 yazılır');
  assert.equal(yazilan[0][1].directory, 'CACHE');
  assert.ok(yazilan.filter((x) => x[0] === 'ekle').length >= 2);
  const birlesik = yazilan.filter((x) => x[0] !== 'paylas').map((x) => Buffer.from(x[1].data, 'base64'));
  assert.equal(Buffer.concat(birlesik).length, veri.length);
  assert.deepEqual(yazilan.at(-1), ['paylas', ['file://x']]);
});
