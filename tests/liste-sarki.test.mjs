// Şarkılarımız: Listelerimiz'in 'sarki' listesi (bağlantı doğrulama, "Bizim şarkımız" tek işaret).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  listeById, yeniOge, duzenle, ogeler, isaretleyebilir, baglantiDogrula, baglantiKaynagi, bizimSarkimiz,
  bizimYamalari, MAX_BAGLANTI,
} from '../sayfalar/listeler/liste.js';

const BEN = 'omer-id';
const O = 'gul-id';
let seq = 0;
const doc = (data, { author = BEN } = {}) => {
  seq += 1;
  const t = new Date(Date.UTC(2026, 9, 1, 10, seq)).toISOString();
  return { id: `s${seq}`, data, author, deleted: false, created_at: t, updated_at: t };
};

test('sarki listesi: işaretlenmez, ipucu "şarkı – sanatçı"', () => {
  const l = listeById('sarki');
  assert.equal(l.ad, 'Şarkılarımız');
  assert.equal(l.isaretsiz, true);
  assert.match(l.ipucu, /Şarkı – sanatçı/);
  assert.equal(isaretleyebilir(doc({ liste: 'sarki', metin: 'a' }), BEN), false);
  assert.equal(isaretleyebilir(doc({ liste: 'yapilacak', metin: 'a' }), BEN), true);
});

test('baglantiDogrula: yalnız https YouTube, Spotify, Apple Music', () => {
  const kabul = [
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtube.com/watch?v=abc',
    'https://m.youtube.com/watch?v=abc',
    'https://music.youtube.com/watch?v=abc',
    'https://youtu.be/abc?si=x',
    'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC',
    'https://spotify.link/AbCdEf',
    'https://music.apple.com/tr/album/x/123?i=456',
    '  https://open.spotify.com/track/abc  ',
    'HTTPS://OPEN.SPOTIFY.COM/track/abc',
  ];
  for (const u of kabul) assert.ok(baglantiDogrula(u).url, u);
  assert.equal(baglantiDogrula('  https://youtu.be/abc  ').url, 'https://youtu.be/abc');
  const red = [
    'http://www.youtube.com/watch?v=abc',          // https değil
    'https://youtube.com.kotu.site/watch?v=abc',   // alt alan aldatması
    'https://kotuyoutube.com/watch',
    'https://open.spotify.com.evil.io/track/a',
    'https://user:pass@open.spotify.com/track/a',  // kimlik bilgisi
    'https://open.spotify.com:8443/track/a',       // port
    'javascript:alert(1)',
    'data:text/html,hi',
    'https://apple.com/music',
    'www.youtube.com/watch?v=abc',                 // şemasız
    'youtube',
    `https://youtu.be/${'a'.repeat(MAX_BAGLANTI)}`,
  ];
  for (const u of red) assert.ok(baglantiDogrula(u).hata, u);
  assert.deepEqual(baglantiDogrula(''), { url: null });
  assert.deepEqual(baglantiDogrula('   '), { url: null });
});

test('baglantiKaynagi: düğme metni için kaynak', () => {
  assert.equal(baglantiKaynagi('https://youtu.be/abc'), 'youtube');
  assert.equal(baglantiKaynagi('https://music.youtube.com/watch?v=a'), 'youtube');
  assert.equal(baglantiKaynagi('https://open.spotify.com/track/a'), 'spotify');
  assert.equal(baglantiKaynagi('https://spotify.link/a'), 'spotify');
  assert.equal(baglantiKaynagi('https://music.apple.com/tr/album/a/1'), 'apple');
  assert.equal(baglantiKaynagi('https://example.com'), null);
  assert.equal(baglantiKaynagi('bozuk'), null);
});

test('yeniOge ve duzenle: şarkıya bağlantı eklenir, geçersiz bağlantı reddedilir; diğer listeler bağlantıyı yok sayar', () => {
  assert.deepEqual(yeniOge({ liste: 'sarki', metin: ' Ah Bu Ben – Sezen Aksu ', baglanti: 'https://youtu.be/abc', me: BEN }).data,
    { liste: 'sarki', metin: 'Ah Bu Ben – Sezen Aksu', baglanti: 'https://youtu.be/abc', ekleyen: BEN });
  assert.equal('baglanti' in yeniOge({ liste: 'sarki', metin: 'Şarkı', baglanti: '', me: BEN }).data, false);
  assert.match(yeniOge({ liste: 'sarki', metin: 'Şarkı', baglanti: 'http://youtu.be/a', me: BEN }).hata, /YouTube, Spotify ya da Apple Music/);
  assert.equal('baglanti' in yeniOge({ liste: 'izlenecek', metin: 'Film', baglanti: 'https://youtu.be/a', me: BEN }).data, false);

  const eski = { liste: 'sarki', metin: 'Eski', baglanti: 'https://youtu.be/a', bizim: '2026-10-01T10:00:00.000Z', ekleyen: O };
  assert.deepEqual(duzenle(eski, { metin: 'Yeni', not: '', baglanti: 'https://open.spotify.com/track/b' }).data,
    { liste: 'sarki', metin: 'Yeni', baglanti: 'https://open.spotify.com/track/b', bizim: '2026-10-01T10:00:00.000Z', ekleyen: O });
  assert.equal('baglanti' in duzenle(eski, { metin: 'Yeni', baglanti: '' }).data, false);
  assert.ok(duzenle(eski, { metin: 'Yeni', baglanti: 'https://evil.com' }).hata);
  assert.equal(duzenle(eski, { metin: 'Yeni' }).data.baglanti, 'https://youtu.be/a', 'bağlantı verilmezse korunur');
});

test('bizimSarkimiz: en son işaretlenen tek şarkı', () => {
  const a = doc({ liste: 'sarki', metin: 'A', bizim: '2026-10-01T10:00:00.000Z' });
  const b = doc({ liste: 'sarki', metin: 'B', bizim: '2026-10-05T10:00:00.000Z' });
  const c = doc({ liste: 'sarki', metin: 'C' });
  const film = doc({ liste: 'izlenecek', metin: 'F', bizim: '2026-10-09T10:00:00.000Z' });
  assert.equal(bizimSarkimiz([a, b, c, film]), b.id);
  assert.equal(bizimSarkimiz([c]), null);
});

test('bizimYamalari: işaretlemek diğerlerini kaldırır; işaretliye dokunmak kaldırır', () => {
  const a = doc({ liste: 'sarki', metin: 'A', bizim: '2026-10-01T10:00:00.000Z' });
  const b = doc({ liste: 'sarki', metin: 'B' });
  const c = doc({ liste: 'sarki', metin: 'C', bizim: '2026-09-01T10:00:00.000Z' });
  const simdi = new Date('2026-10-31T12:00:00.000Z');
  assert.deepEqual(bizimYamalari([a, b, c], b.id, simdi),
    [[b.id, { bizim: '2026-10-31T12:00:00.000Z' }], [a.id, { bizim: null }], [c.id, { bizim: null }]]);
  assert.deepEqual(bizimYamalari([a, b, c], a.id, simdi), [[a.id, { bizim: null }], [c.id, { bizim: null }]]);
});

test('ogeler: şarkılarda "Bizim şarkımız" en üstte, sonra yeniden eskiye', () => {
  const eski = doc({ liste: 'sarki', metin: 'Eski', bizim: '2026-10-01T10:00:00.000Z' });
  const orta = doc({ liste: 'sarki', metin: 'Orta' });
  const yeni = doc({ liste: 'sarki', metin: 'Yeni' });
  assert.deepEqual(ogeler([orta, eski, yeni], { liste: 'sarki', me: BEN }).map((d) => d.data.metin), ['Eski', 'Yeni', 'Orta']);
});
