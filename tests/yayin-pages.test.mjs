// Gizli depo + herkese açık site: .github/workflows/pages.yml (Pages'i Actions ile yayınlar, APK'yı siteye koyar).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { APK_URL } from '../sayfalar/daha/mantik.js';
import { APK_SURUM_URL, apkSurumu } from '../js/core/mobil.js';
import { SITE_ROOT } from '../js/core/identity.js';

const KOK = fileURLToPath(new URL('../', import.meta.url));
const oku = (p) => readFileSync(join(KOK, p), 'utf8').replace(/\r\n/g, '\n'); // Windows klonu (autocrlf) CRLF verir
const PAGES = oku('.github/workflows/pages.yml');
const ANDROID = oku('.github/workflows/android.yml');
const SITE = 'https://rose-omer.github.io/bizim-oyunlar/';
const HARIC = ['mobil', 'supabase', 'tests', 'dev', 'node_modules'];

test('pages.yml: tetikler (push main, elle, Android APK bitince) ve izinler', () => {
  assert.doesNotMatch(PAGES, /\t/, 'YAML sekme içermemeli');
  assert.match(PAGES, /^on:\n {2}push:\n {4}branches: \[main\]\n {2}workflow_dispatch:\n {2}workflow_run:\n/m);
  const ad = ANDROID.match(/^name: (.+)$/m)?.[1];
  assert.equal(ad, 'Android APK');
  assert.ok(PAGES.includes(`    workflows: [${ad}]\n    types: [completed]\n    branches: [main]\n`), 'workflow_run android.yml adını izlemeli');
  assert.match(PAGES, /if: github\.event_name != 'workflow_run' \|\| github\.event\.workflow_run\.conclusion == 'success'/);
  assert.match(PAGES, /^permissions:\n {2}contents: read\n {2}pages: write\n {2}id-token: write\n/m);
  assert.match(PAGES, /^concurrency:\n {2}group: pages\n {2}cancel-in-progress: false\n/m);
  assert.match(PAGES, /environment:\n {6}name: github-pages\n/);
});

test('pages.yml: yayın adımları sırayla; güncel ana sürümler', () => {
  const sira = ['actions/checkout@v7', 'name: Site dosyaları', 'name: APK ve sürüm bilgisi', 'touch -h -d "@$t"',
    'actions/configure-pages@v6', 'actions/upload-pages-artifact@v5', 'actions/deploy-pages@v5'].map((s) => PAGES.indexOf(s));
  assert.ok(sira.every((i, k) => i > 0 && (k === 0 || i > sira[k - 1])), JSON.stringify(sira));
  assert.match(PAGES, /path: _site\n {10}include-hidden-files: true/);
});

test('pages.yml: yayından önce test işi; paket kurmaz; yayın ona bağlı', () => {
  const bas = PAGES.indexOf('  test:\n');
  const bit = PAGES.indexOf('  yayin:\n');
  assert.ok(bas > 0 && bas < bit);
  const is = PAGES.slice(bas, bit);
  assert.match(is, /if: github\.event_name != 'workflow_run' \|\| github\.event\.workflow_run\.conclusion == 'success'/);
  assert.match(is, /runs-on: ubuntu-latest/);
  assert.match(is, /actions\/checkout@v7/);
  assert.match(is, /actions\/setup-node@v7\n\s+with:\n\s+node-version: '25'/);
  assert.match(is, /run: npm test\n/);
  assert.doesNotMatch(PAGES, /npm (ci|install)/);
  assert.match(PAGES, /  yayin:\n    needs: test\n/);
});

test('pages.yml: _site hariç tutulanlar ve .nojekyll', () => {
  assert.ok(PAGES.includes(`${HARIC.join('|')}|_site|README.md|SOZLESME.md|package.json|package-lock.json) continue ;;`), 'hariç listesi');
  assert.match(PAGES, /for f in \*; do/); // nokta dosyaları (.git, .github) "*" ile gelmez
  assert.match(PAGES, /cp -a \.nojekyll _site\//);
});

test('site, yayına girmeyen klasörlere bağlı değil (içe aktarma, src, href)', () => {
  const kaynaklar = [];
  const gez = (d) => {
    for (const ad of readdirSync(join(KOK, d))) {
      const p = join(d, ad);
      if (statSync(join(KOK, p)).isDirectory()) gez(p);
      else if (['.js', '.mjs', '.html', '.css'].includes(extname(ad))) kaynaklar.push(p);
    }
  };
  for (const d of ['js', 'sayfalar', 'games', 'css']) gez(d);
  kaynaklar.push('index.html', 'sw.js');
  const re = /(?:\bfrom\s*|\bimport\s*\(\s*|\b(?:src|href)=)['"](\.{1,2}\/[^'"?#]*)/g;
  const sorunlu = [];
  for (const dosya of kaynaklar) {
    for (const [, yol] of oku(dosya).matchAll(re)) {
      const hedef = relative(KOK, resolve(KOK, dirname(dosya), yol));
      if (HARIC.includes(hedef.split(sep)[0])) sorunlu.push(`${dosya} → ${yol}`);
    }
  }
  assert.deepEqual(sorunlu, []);
});

test('pages.yml: APK ve surum.json, sitedeki adreslerle aynı yerde', () => {
  assert.match(PAGES, /gh release download "\$tag" -R "\$GITHUB_REPOSITORY" -p BizIkimiz\.apk -D _site\/indir/);
  assert.match(PAGES, /gh release download "\$tag" -R "\$GITHUB_REPOSITORY" -p surum\.json -D _site\/indir/);
  assert.match(PAGES, /GH_TOKEN: \$\{\{ github\.token \}\}/);
  assert.equal(APK_URL, `${SITE}indir/BizIkimiz.apk`);
  assert.equal(APK_SURUM_URL, new URL('indir/surum.json', SITE_ROOT).href);
  const capacitor = JSON.parse(oku('mobil/capacitor.config.json'));
  assert.equal(capacitor.server.url, SITE, 'uygulama aynı siteyi açar; surum.json aynı kökten okunur');
  // APK yoksa yayın durmaz: uyarı + exit 0.
  assert.match(PAGES, /::warning::\$tag sürümünde BizIkimiz\.apk yok[^\n]*\n\s+exit 0/);
});

test('pages.yml: surum.json yoksa sürüm notundan üretir (android.yml not biçimi)', () => {
  const re = PAGES.match(/re='([^']+)'/)?.[1];
  assert.ok(re, "pages.yml re='...' içermeli");
  const desen = new RegExp(re); // POSIX ERE; bu desen JS'de aynı anlamda
  const not = ANDROID.match(/\*\*Biz İkimiz\*\* Android uygulaması · sürüm \$\{SURUM_ANA\}\.\$\{GITHUB_RUN_NUMBER\}[^\n]*/)?.[0];
  assert.ok(not, 'android.yml sürüm notu');
  const ornek = not.replace('${SURUM_ANA}', '1.2').replace('${GITHUB_RUN_NUMBER}', '42').replace('${GITHUB_SHA::7}', 'abc1234');
  assert.deepEqual(desen.exec(ornek)?.slice(1, 3), ['1.2.42', '42']);
  // Bugünkü (surum.json'suz) android-latest notu.
  assert.deepEqual(desen.exec('**Biz İkimiz** Android uygulaması · sürüm 1.0.1 · 451e262 · imza: release')?.slice(1, 3), ['1.0.1', '1']);
  // FCM işareti iki dosyada aynı.
  assert.ok(ANDROID.includes('(FCM) yok'));
  assert.ok(PAGES.includes('*"(FCM) yok"*'));
  // Üretilen biçim uygulamanın okuduğu biçim.
  assert.match(PAGES, /'\{surum: \$surum, kod: \$kod, tarih: \$tarih, fcm: \$fcm\}' > _site\/indir\/surum\.json/);
  assert.equal(apkSurumu({ surum: '1.0.1', kod: 1, tarih: '2026-10-30T20:43:39Z', fcm: true }), 1);
});

test('Releases ve GitHub API adresi sitede ve README\'de kalmadı (gizli depoda girişsiz çalışmaz)', () => {
  const dosyalar = ['js/core/mobil.js', 'sayfalar/daha/mantik.js', 'sayfalar/daha/app.js', 'README.md'];
  for (const d of dosyalar) {
    assert.doesNotMatch(oku(d), /github\.com\/rose-omer\/bizim-oyunlar\/releases|api\.github\.com/, d);
  }
  assert.ok(oku('README.md').includes(APK_URL), 'README indirme adresi');
});
