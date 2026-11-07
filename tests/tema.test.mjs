// Çalışma anı temaları: seçim, eşitleme kararı ve üretilen dosyaların yayına uygunluğu.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TEMALAR, VARSAYILAN_TEMA, IKONLU_TEMALAR, KOYU_TEMALAR, temaGecerli, temaKarar, temaAdi, temaModu } from '../js/core/tema.js';

const KOK = fileURLToPath(new URL('../', import.meta.url));
const oku = (y) => readFileSync(join(KOK, y), 'utf8');
const ozel = TEMALAR.filter((t) => t.id !== VARSAYILAN_TEMA);

test('TEMALAR: 13 tema, kimlikler tekil, her birinin adı var', () => {
  assert.equal(TEMALAR.length, 13);
  assert.equal(new Set(TEMALAR.map((t) => t.id)).size, 13);
  for (const t of TEMALAR) assert.ok(t.ad, t.id);
  assert.equal(VARSAYILAN_TEMA, 'pamuk');
  assert.equal(temaAdi('piksel'), 'Piksel');
  assert.equal(temaAdi('yok'), '');
});

test('temaGecerli: bilinen kimlik geçer, kalanı varsayılana düşer', () => {
  assert.equal(temaGecerli('iznik'), 'iznik');
  assert.equal(temaGecerli('yok'), 'pamuk');
  assert.equal(temaGecerli(null), 'pamuk');
  assert.equal(temaGecerli('__proto__'), 'pamuk');
});

test('temaKarar: gelen seçim daha yeniyse uygulanır', () => {
  const y = { tema: 'pamuk', temaAt: '2026-11-07T10:00:00.000Z' };
  assert.equal(temaKarar(y, { tema: 'iznik', temaAt: '2026-11-07T10:00:01.000Z' }), 'iznik');
});

test('temaKarar: eski, aynı ve geçersiz seçim yok sayılır', () => {
  const y = { tema: 'pamuk', temaAt: '2026-11-07T10:00:00.000Z' };
  assert.equal(temaKarar(y, { tema: 'iznik', temaAt: '2026-11-07T09:00:00.000Z' }), null);
  assert.equal(temaKarar(y, { tema: 'pamuk', temaAt: '2026-11-07T11:00:00.000Z' }), null);
  assert.equal(temaKarar(y, { tema: 'bilinmeyen', temaAt: '2026-11-07T11:00:00.000Z' }), null);
  assert.equal(temaKarar(y, {}), null);
  assert.equal(temaKarar(y, null), null);
});

test('temaKarar: cihazda henüz seçim tarihi yoksa ortak seçim geçerlidir', () => {
  assert.equal(temaKarar({ tema: 'pamuk' }, { tema: 'dergi', temaAt: '2026-11-07T11:00:00.000Z' }), 'dergi');
  assert.equal(temaKarar({ tema: 'pamuk' }, { tema: 'dergi' }), 'dergi');
});

test('temaModu: koyu tasarlanan tema otomatikte koyu açılır, kullanıcı seçimi korunur', () => {
  assert.equal(temaModu('yildiz', 'otomatik'), 'koyu');
  assert.equal(temaModu('yildiz', 'acik'), 'acik');
  assert.equal(temaModu('pamuk', 'otomatik'), 'otomatik');
  assert.equal(temaModu('dergi', 'koyu'), 'koyu');
});

test('erken.js koyu tema listesi KOYU_TEMALAR ile aynı', () => {
  const m = oku('js/core/erken.js').match(/var KOYU = \/\^\(([^)]+)\)\$\//);
  assert.ok(m, 'erken.js KOYU');
  assert.deepEqual(m[1].split('|').sort(), [...KOYU_TEMALAR].sort());
});

test('her temanın önizleme görseli var', () => {
  for (const { id } of TEMALAR) assert.ok(existsSync(join(KOK, 'assets/tema-onizleme', `${id}.jpg`)), id);
});

test('erken.js kimlik listesi TEMALAR ile aynı', () => {
  const m = oku('js/core/erken.js').match(/var TEMALAR = \/\^\(([^)]+)\)\$\//);
  assert.ok(m, 'erken.js TEMALAR');
  assert.deepEqual(m[1].split('|').sort(), TEMALAR.map((t) => t.id).sort());
});

test('her özel temanın temel, sayfalar ve oda dosyaları var; varsayılanın yok', () => {
  for (const { id } of ozel) {
    for (const f of ['temel.css', 'sayfalar.css']) assert.ok(existsSync(join(KOK, 'css/temalar', id, f)), `${id}/${f}`);
    for (const f of ['ortak.js', 'mutfak.js', 'banyo.js', 'tuvalet.js', 'yatak.js', 'oyun.js']) {
      assert.ok(existsSync(join(KOK, 'sayfalar/yavru/temalar', id, 'oda', f)), `${id}/oda/${f}`);
    }
  }
  assert.ok(!existsSync(join(KOK, 'css/temalar', VARSAYILAN_TEMA)));
});

test('tema CSS: @import yok, dış adres yok, her url() var olan dosyaya gider', () => {
  for (const { id } of ozel) {
    for (const f of ['temel.css', 'sayfalar.css']) {
      const y = `css/temalar/${id}/${f}`;
      const s = oku(y);
      assert.doesNotMatch(s, /@import/, y);
      assert.doesNotMatch(s, /url\(\s*['"]?https?:/i, y);
      for (const m of s.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)) {
        if (/^(data:|#|%23)/.test(m[2])) continue;
        assert.ok(existsSync(resolve(KOK, dirname(y), m[2])), `${y}: ${m[2]}`);
      }
      assert.equal((s.match(/\{/g) || []).length, (s.match(/\}/g) || []).length, `${y}: süslü denge`);
    }
  }
});

test('tema yazı tipleri: her aile lisans dosyasında yazılı, tek dosyalıların OFL metni yanında', () => {
  const kok = join(KOK, 'assets/fonts/temalar');
  const lisans = readFileSync(join(kok, 'LISANS.txt'), 'utf8');
  assert.match(lisans, /SIL OPEN FONT LICENSE Version 1\.1/);
  for (const g of readdirSync(kok, { withFileTypes: true })) {
    if (g.isDirectory()) assert.ok(lisans.includes(g.name), g.name);
  }
  for (const f of readdirSync(kok).filter((x) => x.endsWith('.woff2'))) {
    const aile = f.split(/[-.]/)[0];
    assert.ok(readdirSync(kok).some((x) => x.toLowerCase() === `ofl-${aile}.txt`), f);
  }
});

test('simgeli temaların simge dosyası var, listede olmayanın yok', () => {
  const dosyalar = readdirSync(join(KOK, 'js/core/tema-ikon')).map((f) => f.replace('.js', '')).sort();
  assert.deepEqual(dosyalar, [...IKONLU_TEMALAR].sort());
});

test('simge dosyası ICONS ve TAB_ICONS verir', async () => {
  for (const id of IKONLU_TEMALAR) {
    const m = await import(`../js/core/tema-ikon/${id}.js`);
    assert.ok(m.ICONS.back, id);
    assert.ok(m.TAB_ICONS.biz, id);
  }
});

test('Piksel simgeleri: bilinen ad çizilir, oda modülleri CSS verir', async () => {
  const p = await import('../sayfalar/yavru/temalar/piksel/ikonlar.js');
  assert.match(p.ikon('kalp'), /crispEdges/);
  assert.equal(p.ikon('yok'), '');
  const o = await import('../sayfalar/yavru/temalar/piksel/oda/ortak.js');
  assert.ok(o.ORTAK_CSS.length > 0);
});

test('odaTemaYukle: oda çizimi temaya geçer, varsayılana döner', async () => {
  const c = await import('../sayfalar/yavru/oda-cizim.js');
  const pamuk = c.odaSvg('banyo');
  const css = c.ODA_CSS;
  await c.odaTemaYukle('yildiz');
  assert.notEqual(c.odaSvg('banyo'), pamuk);
  assert.notEqual(c.ODA_CSS, css);
  assert.ok(c.KUVET_SVG && c.LAZIMLIK_SVG && c.SABUN_SVG);
  await c.odaTemaYukle('pamuk');
  assert.equal(c.odaSvg('banyo'), pamuk);
  assert.equal(c.ODA_CSS, css);
});
