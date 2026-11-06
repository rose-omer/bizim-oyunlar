// Yavrumuz görev şeridi ve seri noktaları (sayfalar/yavru/gorev-sayfa.js). Saf mantık ve CSS metni, DOM yok.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays } from '../js/core/gunler.js';
import { seriDurumu } from '../sayfalar/yavru/seri.js';
import { seriNoktalari, gorevSeritEtiket, CSS } from '../sayfalar/yavru/gorev-sayfa.js';

const GUN = '2026-11-10';
/** Gerçek seri.js sonucu: son görev `geri` gün önce. */
const seri = (n, geri = 0) => seriDurumu({ gorevSeri: { n, son: addDays(GUN, -geri), en: n } }, GUN);
const durumlar = (s) => seriNoktalari(s).map((x) => x.durum);
const sinifAdlari = () => [...new Set([...CSS.matchAll(/\.(-?[a-zA-Z_][\w-]*)/g)].map((m) => m[1]))];

test('seriNoktalari: sıradaki ödül 7. gün: 7 nokta, dolu n kadar, son hediye', () => {
  assert.deepEqual(seriNoktalari(seri(3)), [
    { gun: 1, durum: 'dolu' },
    { gun: 2, durum: 'dolu' },
    { gun: 3, durum: 'dolu' },
    { gun: 4, durum: 'bos' },
    { gun: 5, durum: 'bos' },
    { gun: 6, durum: 'bos' },
    { gun: 7, durum: 'hediye' },
  ]);
});

test('seriNoktalari: sınırlar 1 ve 6 gün', () => {
  assert.deepEqual(durumlar(seri(1)), ['dolu', 'bos', 'bos', 'bos', 'bos', 'bos', 'hediye']);
  assert.deepEqual(durumlar(seri(6)), ['dolu', 'dolu', 'dolu', 'dolu', 'dolu', 'dolu', 'hediye']);
});

test('seriNoktalari: dünkü seri ve telafi bekleyen seri sayılır', () => {
  assert.deepEqual(durumlar(seri(2, 1)), ['dolu', 'dolu', 'bos', 'bos', 'bos', 'bos', 'hediye']);
  const telafi = seri(4, 2);
  assert.equal(telafi.telafiBekliyor, true);
  assert.deepEqual(durumlar(telafi), ['dolu', 'dolu', 'dolu', 'dolu', 'bos', 'bos', 'hediye']);
});

test('seriNoktalari: başka ödül hedefinde null', () => {
  for (const n of [7, 8, 29, 30, 99]) assert.equal(seriNoktalari(seri(n)), null, `n=${n}`);
});

test('seriNoktalari: sonraki ödül yoksa null', () => {
  const s = seri(100);
  assert.equal(s.sonraki, null);
  assert.equal(seriNoktalari(s), null);
});

test('seriNoktalari: seri yoksa null', () => {
  assert.equal(seriNoktalari(null), null);
  assert.equal(seriNoktalari(undefined), null);
  assert.equal(seriNoktalari(seriDurumu({}, GUN)), null, 'alan yok');
  assert.equal(seriNoktalari(seri(5, 3)), null, 'kırık seri');
});

test('gorevSeritEtiket: görev metni ve sayı', () => {
  assert.equal(
    gorevSeritEtiket({ metin: 'Biri yıkasın, biri uyutsun', goster: 0, gerek: 2 }),
    'Günün görevi: Biri yıkasın, biri uyutsun. 0/2.',
  );
});

test('CSS: görevdeki tüm sınıflar tanımlı', () => {
  const adlar = sinifAdlari();
  for (const ad of [
    'yvg-serit', 'yvg-noktalar', 'yvg-nokta',
    'yv-gorev', 'yv-gorev-bas', 'yv-gorev-emoji', 'yv-gorev-govde', 'yv-gorev-baslik', 'yv-gorev-metin', 'yv-gorev-sayi',
    'yv-gorev-durum', 'yv-gorev-kisi', 'yv-gorev-seri', 'yv-gorev-odalar', 'yv-gorev-git',
    'yv-rehber', 'yv-adimlar', 'yv-adim', 'yv-adim-no', 'yv-adim-govde', 'yv-adim-baslik', 'yv-adim-alt', 'yv-davet',
  ]) assert.ok(adlar.includes(ad), ad);
});

test('CSS: eski durum kuralları korunur', () => {
  for (const secici of [
    '.yv-gorev[hidden]', '.yv-gorev-seri[hidden]', '.yv-gorev-odalar[hidden]', '.yv-rehber[hidden]', '.yv-davet[hidden]',
    '.yvg-serit[hidden]', '.yvg-noktalar[hidden]',
    ".yv-gorev-kisi[data-tamam='true'] strong", ".yv-gorev[data-tamam='true'] .yv-gorev-sayi",
    ".yv-gorev[data-tamam='true'] .yv-gorev-durum", ".yv-gorev[data-tamam='true'] .yv-cubuk-dolu",
    ".yv-adim[data-durum='simdi'] .yv-adim-no", ".yv-adim[data-durum='tamam'] .yv-adim-no", ".yv-adim[data-durum='sonra'] .yv-adim-baslik",
    ".yvg-serit[data-tamam='true'] .yvg-hap",
  ]) assert.ok(CSS.includes(secici), secici);
});

test('CSS: rehber başlığı görünür kalır; yalnız görev başlığı görsel olarak gizli', () => {
  assert.match(CSS, /\.yv-gorev \.yv-gorev-baslik \{[^}]*clip-path/);
  assert.match(CSS, /\.yv-rehber \.yv-gorev-baslik \{[^}]*font-family: var\(--font-display\)/);
  assert.doesNotMatch(CSS, /(^|\n)\.yv-gorev-baslik \{[^}]*clip-path/);
});

test('CSS: sınıf öneki, sabit renk, emoji, yazı boyu, hareket kuralı', () => {
  const izinli = new Set(['btn', 'small', 'yv-cubuk-dolu', 'yv-gorev', 'yv-rehber', 'yv-adimlar', 'yv-adim', 'yv-davet']);
  for (const ad of sinifAdlari()) {
    assert.ok(izinli.has(ad) || /^yvg-/.test(ad) || /^yv-(gorev|adim)-/.test(ad), `sınıf: ${ad}`);
  }
  assert.doesNotMatch(CSS, /#[0-9a-fA-F]{3,8}\b/, 'sabit renk');
  assert.doesNotMatch(CSS, /\b(rgb|hsl)a?\(/, 'sabit renk');
  assert.doesNotMatch(CSS, /\p{Extended_Pictographic}/u, 'emoji');
  for (const m of CSS.matchAll(/font-size:\s*([^;]+);/g)) {
    assert.match(m[1], /rem$/, m[0]);
    assert.ok(parseFloat(m[1]) >= 0.75, m[0]);
  }
  const hareketsiz = CSS.replace(/@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*?\n\}/g, '');
  assert.doesNotMatch(hareketsiz, /\b(transition|animation|transform)\b/, 'hareket yalnız no-preference içinde');
});

test('CSS: şerit ölçüleri ve odak', () => {
  assert.match(CSS, /\.yvg-serit \{[^}]*min-height: 54px/);
  assert.match(CSS, /\.yvg-serit \{[^}]*background: var\(--surface-2\)/);
  assert.match(CSS, /\.yvg-hap \{[^}]*background: var\(--bg\)/);
  assert.match(CSS, /\.yvg-serit\[data-tamam='true'\] \.yvg-hap \{[^}]*background: var\(--good\)/);
  assert.match(CSS, /\.yvg-serit:focus-visible \{[^}]*outline: 3px solid var\(--focus\)/);
  assert.match(CSS, /\.yvg-metin \{[^}]*white-space: nowrap[^}]*text-overflow: ellipsis/);
});
