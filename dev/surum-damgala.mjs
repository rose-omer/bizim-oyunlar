// Yayın damgası: node dev/surum-damgala.mjs <klasör> <sürüm>
// Yalnız yayın kopyasında (_site) çalışır; depoya ve ev sunucusuna dokunmaz.
// Neden: APK'da service worker yok, GitHub Pages dosyaları 10 dk önbellekte tutar. Yayın sonrası eski ve yeni modüller
// karışırsa "does not provide an export" hatasıyla sayfa boş kalır. Her yayında tüm js ve css adresleri (css @import dahil) ?v=<sürüm> alır:
// yeni dosya yalnız aynı yayının dosyalarını ister. sw.js adresi sabit kalır; önbellek sürümü yayına bağlanır (eski kopyalar silinir).
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const HARIC = new Set(['vendor', 'indir', 'assets']);
const YEREL = /^(?!https?:|\/\/|data:|blob:)[^'"?#\s]+\.(?:js|css)$/;
const AYRAC = /^\.{1,2}\//;

// from './x.js' | import './x.js' | import('./x.js')
const MODUL = /(\bfrom\s*|\bimport\s*\(?\s*)(['"])(\.{1,2}\/[^'"\s]+)\2/g;
// new URL('x.js', ...)
const ADRES = /(\bnew URL\(\s*)(['"])([^'"\s]+)\2/g;
// @import url('../a.css')
const CSS_IMPORT = /(@import\s+url\(\s*)(['"])([^'"]+)\2/g;
const ETIKET = /(<(?:script|link)\b[^>]*?\b(?:src|href)=)(["'])([^"']+)\2/g;

const damgalanir = (y) => YEREL.test(y) && !/(^|\/)sw\.js$/.test(y);

function degistir(metin, desen, v) {
  return metin.replace(desen, (t, on, tirnak, y) => (damgalanir(y) ? `${on}${tirnak}${y}?v=${v}${tirnak}` : t));
}

export function damgalaJs(metin, v) {
  return degistir(degistir(metin, MODUL, v), ADRES, v);
}

export function damgalaCss(metin, v) {
  return degistir(metin, CSS_IMPORT, v);
}

export function damgalaHtml(metin, v) {
  return degistir(metin, ETIKET, v);
}

export function damgalaSw(metin, v) {
  const yeni = metin.replace(/const SURUM = '[^']*';/, `const SURUM = '${v}';`);
  if (yeni === metin && !metin.includes(`const SURUM = '${v}';`)) throw new Error('sw.js içinde SURUM bulunamadı');
  return yeni;
}

function* dosyalar(kok, k = kok) {
  for (const e of readdirSync(k, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (k !== kok || !HARIC.has(e.name)) yield* dosyalar(kok, join(k, e.name));
    } else if (/\.(js|html|css)$/.test(e.name)) {
      yield join(k, e.name);
    }
  }
}

const swMi = (kok, d) => resolve(d) === resolve(kok, 'sw.js');

export function damgalaKlasor(kok, v) {
  if (!/^[A-Za-z0-9._-]+$/.test(v)) throw new Error('Geçersiz sürüm: ' + v);
  let n = 0;
  for (const d of dosyalar(kok)) {
    const m = readFileSync(d, 'utf8');
    const y = swMi(kok, d) ? damgalaSw(m, v) : d.endsWith('.html') ? damgalaHtml(m, v) : d.endsWith('.css') ? damgalaCss(m, v) : damgalaJs(m, v);
    if (y !== m) { writeFileSync(d, y); n++; }
  }
  return n;
}

/** Damgalı klasörü denetler: damgasız yerel adres ya da olmayan hedef. -> hata metinleri */
export function denetle(kok, v) {
  const hatalar = [];
  const ek = `?v=${v}`;
  for (const d of dosyalar(kok)) {
    if (swMi(kok, d)) continue;
    // Satır başı yorumlardaki örnek adresler gerçek başvuru değil.
    const m = readFileSync(d, 'utf8').replace(/^\s*(?:\/\/|\*|\/\*).*$/gm, '');
    const desenler = d.endsWith('.html') ? [ETIKET] : d.endsWith('.css') ? [CSS_IMPORT] : [MODUL, ADRES];
    for (const desen of desenler) {
      for (const [, , , y] of m.matchAll(desen)) {
        const yol = y.split('?')[0];
        if (!YEREL.test(yol) || /(^|\/)sw\.js$/.test(yol)) continue;
        if (!y.endsWith(ek)) hatalar.push(`damgasız: ${d} -> ${y}`);
        else if ((AYRAC.test(yol) || !d.endsWith('.js')) && !existsSync(resolve(dirname(d), yol))) hatalar.push(`bulunamadı: ${d} -> ${y}`);
      }
    }
  }
  return hatalar;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [kok, v] = process.argv.slice(2);
  if (!kok || !v) {
    console.error('Kullanım: node dev/surum-damgala.mjs <klasör> <sürüm>');
    process.exit(2);
  }
  const n = damgalaKlasor(kok, v);
  const hatalar = denetle(kok, v);
  if (hatalar.length) {
    console.error(hatalar.join('\n'));
    process.exit(1);
  }
  console.log(`Damgalandı: ${n} dosya, sürüm ${v}`);
}
