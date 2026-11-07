// Stil worktree'lerinden (C:\BizIkimiz\stiller) çalışma anı temalarını üretir. Yayınlanmaz; çıktısı depoya girer.
// Çalıştır: node dev/tema-uret.mjs [--stiller <klasör>] [--ata <commit>]
//   css/temalar/<id>/temel.css     css/base.css farkı (base.css'in hemen ardına takılır)
//   css/temalar/<id>/sayfalar.css  sayfa CSS farkları (kapsamlı) + JS içi CSS farkları (yükseltilmiş)
//   assets/fonts/temalar/<aile>/   temanın yazı tipleri; assets/temalar/<id>/  temanın görselleri
//   sayfalar/yavru/temalar/<id>/oda/  temanın oda çizimleri
//   js/core/tema-ikon/<id>.js      temanın simgeleri (yalnız değişenler)
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { temaFarki, yaz, kapsamla, yukselt, urlCevir, jsCss } from './tema-fark.mjs';

const arg = (ad, varsayilan) => {
  const i = process.argv.indexOf(ad);
  return i >= 0 ? process.argv[i + 1] : varsayilan;
};
const KOK = fileURLToPath(new URL('../', import.meta.url));
const STILLER = arg('--stiller', 'C:/BizIkimiz/stiller');
const ATA = arg('--ata', 'd21578b');
const TEMALAR = {
  klasik: '00-mevcut', ucak: '01-ucak-postasi', defter: '02-ani-defteri', yildiz: '03-yildiz-haritasi',
  popbant: '04-pop-bant', balon: '06-cam-balon', piksel: '07-piksel', dergi: '08-dergi',
  yesilcam: '09-yesilcam', iznik: '10-iznik', sivicam: '11-sivi-cam', sessiz: '12-sessiz',
};
// Stile yapılan elle düzeltmeler: temel.css'in sonuna eklenir.
// Piksel açık + Mercan: vurgu üstündeki yazı karşıtlığı 4,3 kalıyordu.
const EK = { piksel: ':root[data-renk="mercan"] { --rk-accent: #BA4530; }\n:root { --sw-mercan: #BA4530; }\n' };
const HARIC_RE = /^(mobil|dev|tests|supabase|node_modules|_site|\.)|yavru-eski|^sayfalar\/yavru\/temalar|^css\/temalar/;
const YAVRU_RE = /^sayfalar\/yavru\//;

const git = (...a) => execFileSync('git', ['-C', KOK, '-c', 'core.safecrlf=false', ...a], { encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] });
const ataOku = (yol) => {
  try { return git('show', `${ATA}:${yol}`).replace(/\r\n/g, '\n'); } catch { return ''; }
};
const oku = (p) => (existsSync(p) ? readFileSync(p, 'utf8').replace(/\r\n/g, '\n') : '');
const yazDosya = (p, s) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, s); };

function gez(d, kok = d, out = []) {
  for (const g of readdirSync(d, { withFileTypes: true })) {
    if (g.name.startsWith('.') || g.name === 'node_modules') continue;
    const p = join(d, g.name);
    const rel = posix.normalize(p.slice(kok.length).replaceAll('\\', '/').replace(/^\//, ''));
    if (HARIC_RE.test(rel)) continue;
    if (g.isDirectory()) gez(p, kok, out);
    else out.push(rel);
  }
  return out;
}

// Hangi CSS hangi sayfada: HTML'lerdeki <link> ile. HTML'de olmayan CSS çalışma anında yüklenir.
const sayfaHaritasi = new Map();
for (const h of gez(KOK).filter((f) => f.endsWith('.html'))) {
  const sayfa = posix.dirname(h) === '.' ? '' : posix.dirname(h);
  for (const m of oku(join(KOK, h)).matchAll(/<link rel="stylesheet" href="([^"]+)"/g)) {
    const css = posix.normalize(posix.join(sayfa, m[1]));
    if (!sayfaHaritasi.has(css)) sayfaHaritasi.set(css, []);
    sayfaHaritasi.get(css).push(sayfa);
  }
}

const anaDosyalar = gez(KOK);
const rapor = {};
for (const id of Object.keys(TEMALAR)) rmSync(join(KOK, 'css/temalar', id), { recursive: true, force: true });
rmSync(join(KOK, 'assets/fonts/temalar'), { recursive: true, force: true });
rmSync(join(KOK, 'assets/temalar'), { recursive: true, force: true });
rmSync(join(KOK, 'sayfalar/yavru/temalar'), { recursive: true, force: true });
rmSync(join(KOK, 'js/core/tema-ikon'), { recursive: true, force: true });

// ui.js simge bloğu: HEART_D'den TAB_ICONS'un sonuna kadar.
const simgeBlogu = (js) => js.match(/const HEART_D =[\s\S]*?const TAB_ICONS = \{[\s\S]*?\n\};/)?.[0] || '';
const anaSimge = simgeBlogu(oku(join(KOK, 'js/core/ui.js')));

// Vurgu rengi örnekleri: ana CSS'teki aileler temanın değerini göstersin.
function ornekler(css) {
  const out = [];
  for (const m of css.matchAll(/:root(?:\[data-renk="(\w+)"\])?\s*\{[^{}]*?--rk-accent:\s*(#[0-9A-Fa-f]{3,8})/g)) {
    const ad = m[1] || 'pembe';
    if (!out.some((x) => x[0] === ad)) out.push([ad, m[2]]);
  }
  return out;
}

for (const [id, klasor] of Object.entries(TEMALAR)) {
  const wt = join(STILLER, klasor);
  const hedefTemel = `css/temalar/${id}/temel.css`;
  const hedefSayfa = `css/temalar/${id}/sayfalar.css`;
  const dosyalar = [...new Set([...gez(wt), ...anaDosyalar])];
  const r = { uyari: [] };

  /** Temanın varlığı siteye taşınır; font ailesi paylaşılır, görsel temaya özeldir. */
  const varlik = (yol) => {
    const kaynak = join(wt, yol);
    if (!existsSync(kaynak)) { r.uyari.push(`varlık yok: ${yol}`); return yol; }
    const anaKopya = join(KOK, yol);
    if (existsSync(anaKopya) && readFileSync(anaKopya).equals(readFileSync(kaynak))) return yol;
    const yeni = yol.startsWith('assets/fonts/')
      ? yol.replace('assets/fonts/', 'assets/fonts/temalar/')
      : yol.replace('assets/', `assets/temalar/${id}/`);
    const h = join(KOK, yeni);
    mkdirSync(dirname(h), { recursive: true });
    copyFileSync(kaynak, h);
    // Tek dosyalı yazı tipinin OFL metni yanında durur.
    if (posix.dirname(yol) === 'assets/fonts') {
      const aile = posix.basename(yol).split(/[-.]/)[0];
      for (const f of readdirSync(join(wt, 'assets/fonts'))) {
        if (f.toLowerCase() === `ofl-${aile}.txt`) copyFileSync(join(wt, 'assets/fonts', f), join(dirname(h), f));
      }
    }
    return yeni;
  };

  /** @import edilen yazı tipi dosyasının içeriği, adresleri hedefe göre çevrilmiş. */
  const importYaz = (adres, kaynak, hedef) => {
    const yol = posix.normalize(posix.join(posix.dirname(kaynak), adres));
    return urlCevir(oku(join(wt, yol)), yol, hedef, varlik);
  };

  // ---------- temel.css ----------
  const taban = temaFarki({ ata: ataOku('css/base.css'), ana: oku(join(KOK, 'css/base.css')), tema: oku(join(wt, 'css/base.css')) });
  const temel = taban.importlar.map((a) => importYaz(a, 'css/base.css', hedefTemel)).join('')
    + urlCevir(yaz(taban.ogeler), 'css/base.css', hedefTemel, varlik);
  const sw = ornekler(oku(join(wt, 'css/base.css'))).map(([ad, renk]) => `--sw-${ad}: ${renk};`).join(' ');
  yazDosya(join(KOK, hedefTemel), `/* Üretildi: dev/tema-uret.mjs. Elle düzenleme. */\n${temel}:root { ${sw} }\n${EK[id] || ''}`);

  // ---------- sayfalar.css ----------
  const parcalar = [];
  const kareler = new Map();
  for (const f of dosyalar.filter((x) => x.endsWith('.css') && x !== 'css/base.css').sort()) {
    const tema = oku(join(wt, f));
    const ana = oku(join(KOK, f));
    if (!ana || !tema || tema === ana) continue; // ana sitede olmayan CSS bağlanmaz
    const fark = temaFarki({ ata: ataOku(f), ana, tema, anaKorur: YAVRU_RE.test(f) });
    if (!fark.ogeler.length) continue;
    const sayfalar = sayfaHaritasi.get(f);
    const donustur = sayfalar
      ? (s) => kapsamla(s, `:where(${sayfalar.map((y) => `[data-sayfa='${y}']`).join(',')})`)
      : yukselt;
    for (const o of fark.ogeler) {
      if (o.tur === 'blok' && o.bas.startsWith('@keyframes')) {
        if (kareler.has(o.bas) && kareler.get(o.bas).govde !== o.govde) r.uyari.push(`@keyframes çakışması: ${o.bas} (${kareler.get(o.bas).f}, ${f})`);
        kareler.set(o.bas, { govde: o.govde, f });
      }
    }
    parcalar.push(`/* ${f} */\n${urlCevir(yaz(fark.ogeler, { donustur }), f, hedefSayfa, varlik)}`);
  }

  // JS içi CSS: sınıf adları dosyaya özel, her sayfada zararsız; çalışma anı <style>'ını yenmek için yükseltilir.
  for (const f of dosyalar.filter((x) => x.endsWith('.js') && !/\/oda\//.test(x)).sort()) {
    const tema = oku(join(wt, f));
    const ana = oku(join(KOK, f));
    if (!ana || !tema || tema === ana) continue;
    const cTema = jsCss(tema);
    if (!cTema) continue;
    const fark = temaFarki({ ata: jsCss(ataOku(f)), ana: jsCss(ana), tema: cTema, anaKorur: true });
    if (!fark.ogeler.length) continue;
    parcalar.push(`/* ${f} (gömülü) */\n${yaz(fark.ogeler, { donustur: yukselt })}`);
  }
  // Yavrumuz ikonlarının çizgi kalınlığı öznitelikte; CSS özniteliği yener.
  const ikonlarJs = oku(join(wt, 'sayfalar/yavru/ikonlar.js'));
  const kalinlik = ikonlarJs.match(/class="yv-ikon"[^>]*stroke-width="([\d.]+)"/)?.[1];
  if (kalinlik && kalinlik !== '1.8') parcalar.push(`/* Yavrumuz ikon çizgisi */\n:root .yv-ikon { stroke-width: ${kalinlik}; }\n`);
  yazDosya(join(KOK, hedefSayfa), `/* Üretildi: dev/tema-uret.mjs. Elle düzenleme. */\n${parcalar.join('')}`);

  // ---------- simgeler ----------
  const simge = simgeBlogu(oku(join(wt, 'js/core/ui.js')));
  if (simge && simge !== anaSimge) {
    yazDosya(join(KOK, 'js/core/tema-ikon', `${id}.js`), `// Üretildi: dev/tema-uret.mjs. Elle düzenleme.\n${simge.replace('const TAB_ICONS', 'export const TAB_ICONS').replace(/\nconst ICONS/, '\nexport const ICONS')}\n`);
  }
  if (ikonlarJs.includes('crispEdges')) {
    yazDosya(join(KOK, 'sayfalar/yavru/temalar', id, 'ikonlar.js'), ikonlarJs);
  }

  // ---------- oda çizimleri ----------
  for (const f of readdirSync(join(wt, 'sayfalar/yavru/oda'))) {
    copyFileSync(join(wt, 'sayfalar/yavru/oda', f), (() => {
      const h = join(KOK, 'sayfalar/yavru/temalar', id, 'oda', f);
      mkdirSync(dirname(h), { recursive: true });
      return h;
    })());
  }

  r.temel = Math.round(Buffer.byteLength(temel) / 1024);
  r.sayfalar = Math.round(Buffer.byteLength(parcalar.join('')) / 1024);
  rapor[id] = r;
}

// Yazı tipi lisansları
const ofl = oku(join(STILLER, TEMALAR.klasik, 'assets/fonts/OFL-Nunito.txt'));
const aileler = readdirSync(join(KOK, 'assets/fonts/temalar'), { withFileTypes: true }).filter((g) => g.isDirectory()).map((g) => g.name);
yazDosya(join(KOK, 'assets/fonts/temalar/LISANS.txt'), `Tema yazı tipleri. Aileler Fontsource üzerinden alındı; her biri SIL Open Font License 1.1 ile dağıtılır.
Telif bildirimleri yazı tipi dosyalarının içindeki üst veride durur. piksel-yama bu proje için çizildi, aynı lisansla.

${aileler.join('\n')}

${ofl.slice(ofl.indexOf('-----'))}`);

for (const [id, r] of Object.entries(rapor)) {
  console.log(`${id.padEnd(10)} temel ${String(r.temel).padStart(4)} KB  sayfalar ${String(r.sayfalar).padStart(4)} KB${r.uyari.length ? `  UYARI ${r.uyari.length}` : ''}`);
  for (const u of [...new Set(r.uyari)].slice(0, 12)) console.log(`  ${u}`);
}
