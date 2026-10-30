// sayfalar/gunler/ics-arayuz.js icsPaylas: Web Share → uygulama eklentisi → indirme sırası (sahte ortamla).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { icsPaylas } from '../sayfalar/gunler/ics-arayuz.js';

const METIN = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nX-WR-CALNAME:Biz İkimiz\r\nEND:VCALENDAR\r\n';

function ortam({ canShare = false, share, yerel = false, eklentiler = {}, nav = true } = {}) {
  const k = { paylasilan: null, tiklanan: null, olusturulan: 0, eklenen: 0, kaldirilan: 0, zamanlanan: [] };
  const a = {
    click() { k.tiklanan = { href: a.href, download: a.download }; },
    remove() { k.kaldirilan++; },
  };
  return {
    k,
    nav: nav ? {
      canShare: (v) => { k.canShareArg = v; return canShare; },
      share: share || (async (v) => { k.paylasilan = v; }),
    } : {},
    doc: { createElement: () => { k.olusturulan++; return a; }, body: { append: () => { k.eklenen++; } } },
    yerel,
    eklenti: (ad) => eklentiler[ad] || null,
    zamanla: (fn, ms) => k.zamanlanan.push({ fn, ms }),
  };
}
const hata = (name, message = name) => Object.assign(new Error(message), { name });

test('tarayıcı dosya paylaşabiliyorsa: Web Share, biz-ikimiz.ics (text/calendar)', async () => {
  const o = ortam({ canShare: true });
  assert.equal(await icsPaylas(METIN, o), 'paylasildi');
  const f = o.k.paylasilan.files[0];
  assert.equal(f.name, 'biz-ikimiz.ics');
  assert.equal(f.type, 'text/calendar');
  assert.equal(await f.text(), METIN);
  assert.equal(o.k.canShareArg.files[0], f);
  assert.equal(o.k.olusturulan, 0, 'indirme yapılmaz');
});

test('paylaşım iptal: indirmeye düşmez', async () => {
  const o = ortam({ canShare: true, share: async () => { throw hata('AbortError'); } });
  assert.equal(await icsPaylas(METIN, o), 'iptal');
  assert.equal(o.k.olusturulan, 0);
});

test('paylaşım başka hatayla düşerse tarayıcıda indirir', async () => {
  const o = ortam({ canShare: true, share: async () => { throw hata('NotAllowedError'); } });
  assert.equal(await icsPaylas(METIN, o), 'indirildi');
  assert.equal(o.k.tiklanan.download, 'biz-ikimiz.ics');
});

test('dosya paylaşımı yoksa: <a download> ile indirir, adres sonra bırakılır', async () => {
  for (const o of [ortam({ canShare: false }), ortam({ nav: false })]) {
    assert.equal(await icsPaylas(METIN, o), 'indirildi');
    assert.equal(o.k.tiklanan.download, 'biz-ikimiz.ics');
    assert.match(o.k.tiklanan.href, /^blob:/);
    assert.deepEqual([o.k.eklenen, o.k.kaldirilan], [1, 1]);
    assert.equal(o.k.zamanlanan.length, 1);
    assert.doesNotThrow(() => o.k.zamanlanan[0].fn());
  }
});

test('uygulamada eklenti yoksa: indirme denenmez, "yok" döner', async () => {
  const o = ortam({ yerel: true, nav: false });
  assert.equal(await icsPaylas(METIN, o), 'yok');
  assert.equal(o.k.olusturulan, 0);
  const yarim = ortam({ yerel: true, nav: false, eklentiler: { Share: { share: async () => {} } } });
  assert.equal(await icsPaylas(METIN, yarim), 'yok', 'Filesystem olmadan dosya paylaşılamaz');
});

test('uygulamada Filesystem + Share: önbelleğe yazar, dosyayı paylaşır', async () => {
  const k = {};
  const eklentiler = {
    Filesystem: { writeFile: async (v) => { k.yaz = v; return { uri: 'file:///cache/biz-ikimiz.ics' }; } },
    Share: { share: async (v) => { k.paylas = v; } },
  };
  const o = ortam({ yerel: true, nav: false, eklentiler });
  assert.equal(await icsPaylas(METIN, o), 'paylasildi');
  assert.deepEqual(k.yaz, { path: 'biz-ikimiz.ics', data: METIN, directory: 'CACHE', encoding: 'utf8' });
  assert.deepEqual(k.paylas.files, ['file:///cache/biz-ikimiz.ics']);
  assert.equal(o.k.olusturulan, 0);
});

test('uygulamada önce Web Share denenir; eklenti iptali ve hatası', async () => {
  const o = ortam({ yerel: true, canShare: true });
  assert.equal(await icsPaylas(METIN, o), 'paylasildi');
  assert.ok(o.k.paylasilan.files);

  const iptal = ortam({
    yerel: true, nav: false,
    eklentiler: {
      Filesystem: { writeFile: async () => ({ uri: 'file:///x.ics' }) },
      Share: { share: async () => { throw new Error('Share canceled'); } },
    },
  });
  assert.equal(await icsPaylas(METIN, iptal), 'iptal');

  const bozuk = ortam({
    yerel: true, nav: false,
    eklentiler: { Filesystem: { writeFile: async () => { throw new Error('disk dolu'); } }, Share: { share: async () => {} } },
  });
  const uyar = console.warn;
  console.warn = () => {};
  try {
    assert.equal(await icsPaylas(METIN, bozuk), 'hata');
  } finally {
    console.warn = uyar;
  }
});
