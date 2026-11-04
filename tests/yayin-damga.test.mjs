// Yayın damgası: her yayında tüm modül adresleri aynı sürümü taşır; eski ve yeni dosyalar karışmaz (APK'da service worker yok).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { damgalaCss, damgalaHtml, damgalaJs, damgalaSw, damgalaKlasor, denetle } from '../dev/surum-damgala.mjs';

const KOK = fileURLToPath(new URL('../', import.meta.url));
const V = 'abc123';

test('damgalaJs: statik, yan etkili, dinamik ve export adresleri', () => {
  const g = [
    "import { a } from './a.js';",
    "import './b.js';",
    "export * from '../c.js';",
    "export { d } from \"./d.js\";",
    "const m = await import('../../e.js');",
    "import {\n  f,\n} from './f.js';",
  ].join('\n');
  const c = damgalaJs(g, V);
  for (const y of ["'./a.js?v=abc123'", "'./b.js?v=abc123'", "'../c.js?v=abc123'", '"./d.js?v=abc123"', "'../../e.js?v=abc123'", "'./f.js?v=abc123'"]) {
    assert.ok(c.includes(y), y);
  }
});

test('damgalaJs: new URL ile yüklenen js ve css; sw.js ve klasörler değişmez', () => {
  const c = damgalaJs([
    "new URL('../../vendor/supabase.js', import.meta.url)",
    "new URL('./oyun.css', import.meta.url)",
    "new URL('leaflet.js', kok)",
    "new URL('./isci.js', import.meta.url)",
    "new URL('../../sw.js', import.meta.url)",
    "new URL('../../', import.meta.url)",
    "new URL('indir/surum.json', SITE_ROOT)",
  ].join('\n'), V);
  assert.ok(c.includes("'../../vendor/supabase.js?v=abc123'"));
  assert.ok(c.includes("'./oyun.css?v=abc123'"));
  assert.ok(c.includes("'leaflet.js?v=abc123'"));
  assert.ok(c.includes("'./isci.js?v=abc123'"));
  assert.ok(c.includes("'../../sw.js'"), 'sw.js adresi sabit kalmalı');
  assert.ok(c.includes("new URL('../../', import.meta.url)"));
  assert.ok(c.includes("'indir/surum.json'"));
});

test('damgalaJs: dış adres, paket adı ve zaten damgalı adres değişmez', () => {
  const g = "import x from 'https://x.y/z.js';\nimport y from 'paket';\nimport z from './z.js?v=eski';";
  assert.equal(damgalaJs(g, V), g);
});

test('damgalaHtml: yerel betik ve stil; dış adres, manifest ve simge değişmez', () => {
  const c = damgalaHtml([
    '<script src="../../js/core/erken.js"></script>',
    '<script type="module" src="./app.js"></script>',
    '<link rel="stylesheet" href="../../css/base.css">',
    '<link rel="manifest" href="../../manifest.webmanifest">',
    '<link rel="icon" href="../../assets/favicon.svg">',
    '<script src="https://x.y/z.js"></script>',
  ].join('\n'), V);
  assert.ok(c.includes('src="../../js/core/erken.js?v=abc123"'));
  assert.ok(c.includes('src="./app.js?v=abc123"'));
  assert.ok(c.includes('href="../../css/base.css?v=abc123"'));
  assert.ok(c.includes('href="../../manifest.webmanifest"'));
  assert.ok(c.includes('href="../../assets/favicon.svg"'));
  assert.ok(c.includes('src="https://x.y/z.js"'));
});

test('damgalaCss: @import adresi damgalanır; dış adres değişmez', () => {
  const c = damgalaCss("@import url('../_soru/soru.css');\n@import url('https://x.y/z.css');", V);
  assert.ok(c.includes("url('../_soru/soru.css?v=abc123')"));
  assert.ok(c.includes("url('https://x.y/z.css')"));
});

test('damgalaSw: önbellek sürümü yayına bağlanır; SURUM yoksa hata', () => {
  assert.ok(damgalaSw("const SURUM = '2026-11-04.1';\nconst ONBELLEK = `biz-${SURUM}`;", V).includes("const SURUM = 'abc123';"));
  assert.throws(() => damgalaSw('const x = 1;', V), /SURUM/);
});

function ornekSite() {
  const k = mkdtempSync(join(tmpdir(), 'damga-'));
  const yaz = (p, m) => { mkdirSync(dirname(join(k, p)), { recursive: true }); writeFileSync(join(k, p), m); };
  yaz('index.html', '<script type="module" src="./js/a.js"></script><link rel="stylesheet" href="css/s.css">');
  yaz('js/a.js', "import './b.js';\nimport('../sayfa/c.js');");
  yaz('js/b.js', 'export const b = 1;');
  yaz('sayfa/c.js', 'export const c = 1;');
  yaz('css/s.css', 'a{}');
  yaz('sw.js', "const SURUM = 'eski';");
  yaz('vendor/v.js', "// import x from './yok.js'\n");
  return { k, yaz };
}

test('damgalaKlasor + denetle: temiz site geçer; vendor içeriğine dokunulmaz', () => {
  const { k } = ornekSite();
  try {
    damgalaKlasor(k, V);
    assert.deepEqual(denetle(k, V), []);
    assert.ok(readFileSync(join(k, 'js/a.js'), 'utf8').includes("'./b.js?v=abc123'"));
    assert.ok(readFileSync(join(k, 'sw.js'), 'utf8').includes("'abc123'"));
    assert.ok(readFileSync(join(k, 'vendor/v.js'), 'utf8').includes("'./yok.js'"));
  } finally { rmSync(k, { recursive: true, force: true }); }
});

test('denetle: eksik dosya ve damgasız adres yakalanır', () => {
  const { k, yaz } = ornekSite();
  try {
    damgalaKlasor(k, V);
    yaz('js/d.js', "import './b.js';\nimport './yok.js?v=abc123';");
    const h = denetle(k, V).join('\n');
    assert.match(h, /damgasız.*b\.js/);
    assert.match(h, /bulunamadı.*yok\.js/);
  } finally { rmSync(k, { recursive: true, force: true }); }
});

test('gerçek depo: damgalanınca tüm adresler çözülür', () => {
  const k = mkdtempSync(join(tmpdir(), 'damga-depo-'));
  try {
    for (const d of ['js', 'sayfalar', 'games', 'vendor', 'css', 'index.html', 'sw.js']) cpSync(join(KOK, d), join(k, d), { recursive: true });
    damgalaKlasor(k, V);
    assert.deepEqual(denetle(k, V), []);
  } finally { rmSync(k, { recursive: true, force: true }); }
});

test('pages.yml: yayında damga adımı ve denetimi var, varlık yükleme öncesinde', () => {
  const y = readFileSync(join(KOK, '.github/workflows/pages.yml'), 'utf8').replace(/\r\n/g, '\n');
  const damga = y.indexOf('node dev/surum-damgala.mjs _site');
  assert.ok(damga > 0, 'damga adımı yok');
  assert.ok(damga > y.indexOf('Site dosyaları (_site)'));
  assert.ok(damga < y.indexOf('actions/upload-pages-artifact'));
});
