// Yayınlanan her HTML aynı CSP ve referrer meta'sını taşır; satır içi betik ve olay özniteliği yoktur.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SUPABASE_URL } from '../js/config.js';

const KOK = fileURLToPath(new URL('../', import.meta.url));
const HARIC = new Set(['mobil', 'dev', 'tests', 'supabase', 'node_modules', '_site']); // pages.yml ile aynı
function sayfalar(d = KOK, out = []) {
  for (const g of readdirSync(d, { withFileTypes: true })) {
    if (g.name.startsWith('.') || (d === KOK && HARIC.has(g.name))) continue;
    const p = join(d, g.name);
    if (g.isDirectory()) sayfalar(p, out);
    else if (g.name.endsWith('.html')) out.push(p);
  }
  return out;
}
const HTML = sayfalar().map((p) => ({ yol: relative(KOK, p).split(sep).join('/'), s: readFileSync(p, 'utf8').replace(/\r\n/g, '\n') }));
const CSP_RE = /<meta http-equiv="Content-Security-Policy" content="[^"]+">/g;
const REF_RE = /<meta name="referrer" content="[^"]+">/g;
const kok = () => HTML.find((h) => h.yol === 'index.html').s;
const csp = () => kok().match(CSP_RE)[0].match(/content="([^"]+)"/)[1];
const yonerge = (ad) => csp().split(';').map((x) => x.trim().split(/\s+/)).find((x) => x[0] === ad)?.slice(1);

test('yayınlanan sayfalar bulundu (kök, sayfalar, oyunlar)', () => {
  assert.ok(HTML.length >= 40, String(HTML.length));
  for (const y of ['index.html', 'sayfalar/sohbet/index.html', 'games/yapboz/index.html']) assert.ok(HTML.some((h) => h.yol === y), y);
});

test('her HTML: CSP ve referrer birer kez ve birebir aynı; erken.js ile her kaynaktan önce', () => {
  const c = kok().match(CSP_RE)?.[0];
  const r = kok().match(REF_RE)?.[0];
  assert.ok(c && r, 'index.html');
  for (const { yol, s } of HTML) {
    assert.deepEqual(s.match(CSP_RE), [c], `${yol}: CSP`);
    assert.deepEqual(s.match(REF_RE), [r], `${yol}: referrer`);
    const a = s.indexOf(c);
    const k = s.search(/<(script|link|style)\b/);
    assert.ok(a > s.indexOf('<head>') && a < k, `${yol}: CSP ilk kaynaktan önce`);
    assert.ok(s.indexOf(r) < k, `${yol}: referrer ilk kaynaktan önce`);
    assert.ok(s.indexOf('erken.js') > a, `${yol}: erken.js`);
    // Eski WebView'da Capacitor köprüsü satır içi betik olarak "<head>"in hemen arkasına girer: CSP ondan sonra gelmeli.
    assert.equal(s.split('<head>').length, 2, `${yol}: tek ve yalın <head>`);
  }
});

test('her HTML: satır içi <script> ve on*= yok (script-src unsafe-inline içermez)', () => {
  for (const { yol, s } of HTML) {
    for (const m of s.matchAll(/<script\b([^>]*)>/gi)) assert.match(m[1], /\ssrc=/, `${yol}: satır içi betik`);
    assert.doesNotMatch(s, /<[a-z][^>]*\son[a-z]+\s*=/i, `${yol}: olay özniteliği`);
  }
});

test('politika: güvenlik sınırları ve kullanılan dış kaynaklar', () => {
  assert.deepEqual(yonerge('default-src'), ["'self'"]);
  assert.deepEqual(yonerge('script-src'), ["'self'", 'https://www.youtube.com']);
  assert.deepEqual(yonerge('object-src'), ["'none'"]);
  assert.deepEqual(yonerge('base-uri'), ["'self'"]);
  assert.deepEqual(yonerge('form-action'), ["'self'"]);
  assert.deepEqual(yonerge('worker-src'), ["'self'"]);
  assert.ok(yonerge('style-src').includes("'unsafe-inline'"));
  assert.doesNotMatch(csp(), /upgrade-insecure-requests/); // ev sunucusu http
  assert.doesNotMatch(csp(), /unsafe-eval/);
  const host = new URL(SUPABASE_URL).host;
  assert.ok(yonerge('connect-src').includes(`https://${host}`));
  assert.ok(yonerge('connect-src').includes(`wss://${host}`));
  assert.ok(yonerge('img-src').includes(`https://${host}`));
  assert.ok(yonerge('media-src').includes(`https://${host}`));
});

test('fontlar sitede: Google Fonts yok, @font-face yerel WOFF2 ve font-display: swap', () => {
  const DIS = /fonts\.(googleapis|gstatic)\.com/;
  assert.deepEqual(yonerge('font-src'), ["'self'"]);
  assert.deepEqual(yonerge('style-src'), ["'self'", "'unsafe-inline'"]);
  for (const { yol, s } of HTML) assert.doesNotMatch(s, DIS, yol);
  const oku = (y) => readFileSync(join(KOK, y), 'utf8');
  const base = oku('css/base.css');
  assert.doesNotMatch(base, /@import/);
  assert.doesNotMatch(base, DIS);
  assert.doesNotMatch(oku('sw.js'), DIS);
  const yuzler = base.match(/@font-face\s*{[^}]*}/g) || [];
  assert.equal(yuzler.length, 12); // 2 aile × 3 ağırlık × latin ve latin-ext
  for (const y of yuzler) {
    assert.match(y, /font-display: swap/);
    const dosya = y.match(/url\('\.\.\/(assets\/fonts\/[a-z-]+\.woff2)'\)/)?.[1];
    assert.ok(dosya, y);
    assert.ok(statSync(join(KOK, dosya)).size > 10_000, dosya);
  }
  for (const y of ['assets/fonts/OFL-Baloo2.txt', 'assets/fonts/OFL-Quicksand.txt']) assert.match(oku(y), /SIL OPEN FONT LICENSE/);
});

test('referrer: YouTube gömmesi ve OSM karoları kaynak bekler; no-referrer olmaz', () => {
  assert.equal(kok().match(REF_RE)[0], '<meta name="referrer" content="strict-origin-when-cross-origin">');
});
