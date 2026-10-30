// Ana ekran widget'ı: Android yaması (mobil/scripts/android-hazirla.mjs) ve yerel kaynakların durağan denetimi.
// Bu makinede Java/Android SDK yok; derleme CI'da. Burada derleyicinin yakalayacağı hataların bir kısmı yakalanır:
// kaynak adları, kırık @referanslar, RemoteViews'ta izinsiz görünüm, paket/dosya uyumu, minSdk 24 dışı API.
// Örnekler: tests/mobil-ornek/capacitor8/ = @capacitor/cli 8.6.0 android-template.tar.gz içinden aynen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, mkdtempSync, mkdirSync, cpSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join, relative, sep, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  manifestYamala, widgetManifestYamala, mainActivityYamala, hazirla, WIDGETLER,
} from '../mobil/scripts/android-hazirla.mjs';

const yol = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const oku = (p) => readFileSync(yol(p), 'utf8');
const ORNEK = 'tests/mobil-ornek/capacitor8';
// Windows'ta git (autocrlf) örnekleri CRLF açabilir; CI'daki üretilen proje LF'dir. CRLF ayrıca denenir.
const ornek = (ad) => oku(`${ORNEK}/${ad}`).replace(/\r\n/g, '\n');
const APP_ID = JSON.parse(oku('mobil/capacitor.config.json')).appId;
const EK = yol('mobil/android-ek');

/** `npx cap add android` MainActivity paketini appId yapar (@capacitor/cli dist/android/common.js). */
const sablonEtkinlik = () => ornek('MainActivity.java').replace(/package ([^;]*)/, `package ${APP_ID}`);

function dosyalar(kok) {
  const out = [];
  for (const ad of readdirSync(kok)) {
    const p = join(kok, ad);
    if (statSync(p).isDirectory()) out.push(...dosyalar(p));
    else out.push(p);
  }
  return out;
}
const goreli = (p) => relative(EK, p).split(sep).join('/');

/** Basit XML denetimi: yorumlar ve bildirim atılır, etiketler yığınla eşlenir. */
function xmlDengeli(xml) {
  const govde = xml.replace(/<!--[\s\S]*?-->/g, '').replace(/<\?xml[\s\S]*?\?>/, '');
  const yigin = [];
  for (const m of govde.matchAll(/<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*"[^"]*")*)\s*(\/?)>/g)) {
    const [, kapa, ad, , tek] = m;
    if (tek) continue;
    if (!kapa) yigin.push(ad);
    else if (yigin.pop() !== ad) return false;
  }
  const kalan = govde.replace(/<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*"[^"]*")*)\s*(\/?)>/g, '');
  return yigin.length === 0 && !/[<>]/.test(kalan.replace(/&(lt|gt|amp|quot|apos);/g, ''));
}

/** Java: yorum ve metinler atılınca {} () [] dengeli mi. */
function javaDengeli(java) {
  const temiz = java
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])'/g, "''");
  const es = { ')': '(', ']': '[', '}': '{' };
  const yigin = [];
  for (const c of temiz) {
    if ('([{'.includes(c)) yigin.push(c);
    else if (c in es && yigin.pop() !== es[c]) return false;
  }
  return yigin.length === 0;
}

// ---------- Yama: Capacitor 8 şablonu üzerinde ----------

test('widgetManifestYamala: iki alıcı <application> içinde, tek sefer', () => {
  const sablon = ornek('AndroidManifest.xml');
  const bir = widgetManifestYamala(manifestYamala(sablon));
  assert.ok(xmlDengeli(bir), 'manifest XML dengeli olmalı');
  const uygulama = bir.slice(bir.indexOf('<application'), bir.indexOf('</application>'));
  assert.equal(WIDGETLER.length, 2);
  for (const w of WIDGETLER) {
    assert.ok(uygulama.includes(`android:name="${w.sinif}"`), w.sinif);
    assert.ok(uygulama.includes(`android:resource="@xml/${w.bilgi}"`), w.bilgi);
    assert.ok(uygulama.includes(`android:label="@string/${w.ad}"`), w.ad);
  }
  assert.equal(bir.match(/<receiver\b/g).length, 2);
  assert.equal(bir.match(/android\.appwidget\.action\.APPWIDGET_UPDATE/g).length, 2);
  assert.equal(bir.match(/android:name="android\.appwidget\.provider"/g).length, 2);
  assert.match(bir, /android\.intent\.action\.TIME_SET/);
  assert.match(bir, /android\.intent\.action\.TIMEZONE_CHANGED/);
  assert.doesNotMatch(bir, /android:exported="true"[^>]*>\s*<intent-filter>\s*<action android:name="android\.appwidget/);
  // Şablonun geri kalanı yerinde; tekrar zararsız.
  assert.match(bir, /android:name="\.MainActivity"/);
  assert.match(bir, /androidx\.core\.content\.FileProvider/);
  assert.match(bir, /SCHEDULE_EXACT_ALARM" tools:node="remove"/);
  assert.equal(widgetManifestYamala(bir), bir);
  const crlf = widgetManifestYamala(sablon.replace(/\n/g, '\r\n'));
  assert.ok(xmlDengeli(crlf));
  assert.doesNotMatch(crlf.replace(/\r\n/g, ''), /\n/, 'CRLF dosyada satır sonları karışmamalı');
  assert.throws(() => widgetManifestYamala('<manifest><application android:label="x" /></manifest>'), /<\/application>/);
});

test('mainActivityYamala: eklenti super.onCreate öncesi kaydedilir; tekrar zararsız', () => {
  const bir = mainActivityYamala(sablonEtkinlik());
  assert.ok(javaDengeli(bir));
  assert.match(bir, new RegExp(`^package ${APP_ID.replace(/\./g, '\\.')};`));
  assert.match(bir, /\nimport android\.os\.Bundle;\n/);
  assert.match(bir, /\nimport com\.getcapacitor\.BridgeActivity;\n/);
  assert.match(bir, /\nimport com\.rose\.bizikimiz\.widget\.BizWidgetPlugin;\n/);
  assert.match(bir, /@Override\s+protected void onCreate\(Bundle savedInstanceState\) \{\s+registerPlugin\(BizWidgetPlugin\.class\);\s+super\.onCreate\(savedInstanceState\);\s+\}/);
  assert.equal(bir.match(/registerPlugin\(/g).length, 1);
  assert.equal(mainActivityYamala(bir), bir);
  assert.equal(mainActivityYamala(bir.replace(/\n/g, '\r\n')), bir.replace(/\n/g, '\r\n'));
  assert.ok(javaDengeli(mainActivityYamala(sablonEtkinlik().replace(/\n/g, '\r\n'))), 'CRLF şablon');
  // Şablon değişmişse sessizce geçmez: CI kırmızı olsun.
  assert.throws(() => mainActivityYamala('package x;\npublic class MainActivity extends BridgeActivity { void a() {} }\n'), /MainActivity/);
});

test('hazirla: Capacitor 8 projesinde Java, kaynak, manifest, MainActivity; iki kez çalışınca aynı', () => {
  const kok = mkdtempSync(join(tmpdir(), 'biz-android-'));
  try {
    const ana = join(kok, 'android', 'app', 'src', 'main');
    const paket = join(ana, 'java', ...APP_ID.split('.'));
    mkdirSync(paket, { recursive: true });
    mkdirSync(join(ana, 'res', 'values'), { recursive: true });
    cpSync(yol('mobil/capacitor.config.json'), join(kok, 'capacitor.config.json'));
    cpSync(EK, join(kok, 'android-ek'), { recursive: true });
    writeFileSync(join(ana, 'AndroidManifest.xml'), ornek('AndroidManifest.xml'));
    writeFileSync(join(paket, 'MainActivity.java'), sablonEtkinlik());
    writeFileSync(join(ana, 'res', 'values', 'strings.xml'), ornek('strings.xml'));
    writeFileSync(join(kok, 'android', 'app', 'build.gradle'), ornek('build.gradle'));

    hazirla(kok, { BIZ_SURUM_KODU: '12' });
    const anlik = () => Object.fromEntries(dosyalar(join(kok, 'android')).map((p) => [relative(kok, p), readFileSync(p, 'utf8')]));
    const ilk = anlik();
    hazirla(kok, { BIZ_SURUM_KODU: '12' });
    assert.deepEqual(anlik(), ilk, 'ikinci çalıştırma hiçbir şeyi değiştirmemeli');

    for (const ad of ['BizWidget', 'BizWidgetKucuk', 'BizWidgetBuyuk', 'BizWidgetPlugin']) {
      assert.ok(existsSync(join(paket, 'widget', `${ad}.java`)), `${ad}.java`);
    }
    assert.match(readFileSync(join(paket, 'MainActivity.java'), 'utf8'), /registerPlugin\(BizWidgetPlugin\.class\)/);
    const manifest = readFileSync(join(ana, 'AndroidManifest.xml'), 'utf8');
    assert.match(manifest, /BizWidgetKucuk/);
    assert.match(manifest, /SCHEDULE_EXACT_ALARM/);
    assert.match(readFileSync(join(kok, 'android', 'app', 'build.gradle'), 'utf8'), /versionCode 12\n/);
    assert.match(readFileSync(join(ana, 'res', 'values', 'strings.xml'), 'utf8'), /app_name/, 'şablon strings.xml ezilmemeli');
    for (const p of dosyalar(join(EK, 'res'))) {
      assert.ok(existsSync(join(ana, 'res', relative(join(EK, 'res'), p))), goreli(p));
    }
  } finally {
    rmSync(kok, { recursive: true, force: true });
  }
});

// ---------- Kaynaklar (mobil/android-ek/res) ----------

const RES = join(EK, 'res');
const resDosyalari = dosyalar(RES);
const xmlDosyalari = resDosyalari.filter((p) => p.endsWith('.xml'));
const JAVA = dosyalar(join(EK, 'java')).filter((p) => p.endsWith('.java'));

/** Tanımlı kaynaklar: tür → ad kümesi (dosya kaynakları, values içerikleri, @+id). */
function tanimlar() {
  const t = {};
  const ekle = (tur, ad) => (t[tur] ||= new Set()).add(ad);
  for (const p of resDosyalari) {
    const klasor = basename(join(p, '..')).split('-')[0];
    if (klasor === 'values') {
      for (const m of readFileSync(p, 'utf8').matchAll(/<(color|string|dimen|bool|integer)\s+name="([^"]+)"/g)) ekle(m[1], m[2]);
    } else {
      ekle(klasor, basename(p).replace(/\.\w+$/, ''));
    }
    for (const m of readFileSync(p, 'utf8').matchAll(/@\+id\/(\w+)/g)) ekle('id', m[1]);
  }
  return t;
}
// Şablondan ve önceki eklerden gelenler (android-ek dışında tanımlı).
const SABLON = { string: new Set(['app_name', 'title_activity_main', 'package_name', 'custom_url_scheme']) };

test('kaynak adları geçerli ve projeye özgü (biz_widget_ / ic_stat_)', () => {
  for (const p of resDosyalari) {
    const ad = basename(p);
    assert.match(ad, /^[a-z][a-z0-9_]*\.xml$/, goreli(p));
    assert.match(ad, /^(biz_widget_|ic_stat_)/, `${goreli(p)}: şablon dosyalarını ezmemeli`);
  }
});

test('XML dosyaları dengeli; kırık @referans yok', () => {
  const t = tanimlar();
  for (const p of xmlDosyalari) {
    const xml = readFileSync(p, 'utf8');
    assert.ok(xmlDengeli(xml), `${goreli(p)} dengeli değil`);
    for (const m of xml.matchAll(/"@(drawable|color|string|layout|xml|dimen|id|mipmap)\/(\w+)"/g)) {
      const [, tur, ad] = m;
      assert.ok(t[tur]?.has(ad) || SABLON[tur]?.has(ad), `${goreli(p)}: @${tur}/${ad} tanımlı değil`);
    }
  }
});

test('values-night renkleri gündüz renkleriyle aynı adlarda', () => {
  const adlar = (p) => [...readFileSync(join(RES, p), 'utf8').matchAll(/<color\s+name="([^"]+)"/g)].map((m) => m[1]).sort();
  const gunduz = adlar('values/biz_widget_renkler.xml');
  assert.ok(gunduz.length >= 5);
  assert.deepEqual(adlar('values-night/biz_widget_renkler.xml'), gunduz);
  for (const p of ['values/biz_widget_renkler.xml', 'values-night/biz_widget_renkler.xml']) {
    for (const m of readFileSync(join(RES, p), 'utf8').matchAll(/<color\s+name="[^"]+">([^<]*)</g)) {
      assert.match(m[1], /^#[0-9A-F]{6}$/, `${p}: ${m[1]}`);
    }
  }
  assert.match(oku('mobil/android-ek/res/values/biz_widget_renkler.xml'), /#C2375C/, 'açık temada uygulama vurgusu');
});

test('metinler: Türkçe, kesme işareti kaçışlı, biçim argümanı konumlu', () => {
  const xml = oku('mobil/android-ek/res/values/biz_widget_metin.xml');
  const metinler = [...xml.matchAll(/<string\s+name="([^"]+)"[^>]*>([^<]*)<\/string>/g)];
  assert.ok(metinler.length >= 8);
  for (const [, ad, deger] of metinler) {
    assert.doesNotMatch(deger.replace(/\\'/g, ''), /'/, `${ad}: kesme işareti \\' olmalı`);
    assert.doesNotMatch(deger, /%[sd]/, `${ad}: %1$s biçimi kullan`);
  }
  assert.match(xml, />gündür birlikteyiz</);
  assert.match(xml, />Buluşmaya %1\$s gün</);
});

/** RemoteViews'un şişirebildiği görünümler (API 24; Android 12'nin ekledikleri hariç). */
const REMOTE_VIEWS = new Set(['FrameLayout', 'LinearLayout', 'RelativeLayout', 'GridLayout', 'TextView', 'ImageView',
  'Button', 'ImageButton', 'ProgressBar', 'Chronometer', 'AnalogClock', 'ViewFlipper', 'ListView', 'GridView', 'StackView',
  'AdapterViewFlipper', 'ViewStub']);

test('widget yerleşimleri yalnız RemoteViews görünümleri; kök @android:id/background, okunur açıklama', () => {
  const yerlesimler = resDosyalari.filter((p) => goreli(p).startsWith('res/layout/'));
  assert.equal(yerlesimler.length, 4);
  for (const p of yerlesimler) {
    const xml = readFileSync(p, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
    for (const m of xml.matchAll(/<([A-Za-z][\w.]*)[\s>]/g)) {
      if (m[1] === 'xml') continue;
      assert.ok(REMOTE_VIEWS.has(m[1]), `${goreli(p)}: <${m[1]}> RemoteViews'ta yok`);
    }
    assert.match(xml, /<FrameLayout[^>]*android:id="@android:id\/background"/, goreli(p));
    assert.doesNotMatch(xml, /android:tint=/, 'tint yerine renkli vektör');
    for (const m of xml.matchAll(/<ImageView[^>]*>/g)) assert.match(m[0], /importantForAccessibility="no"/, 'süs görsel okunmaz');
  }
});

test('dikey ve yatay yerleşimler BizWidget.java\'nın yazdığı bütün kimlikleri taşır', () => {
  // Yerleşimde olmayan kimliğe RemoteViews eylemi widget'ı "yüklenemedi"ye düşürür.
  const java = oku('mobil/android-ek/java/com/rose/bizikimiz/widget/BizWidget.java');
  const ortak = ['biz_widget_sayi', 'biz_widget_etiket'];
  const buyukte = ['biz_widget_adlar', 'biz_widget_adlar_satir', 'biz_widget_bulusma'];
  const yazilan = new Set([...java.matchAll(/(?<![\w.])R\.id\.(\w+)/g)].map((m) => m[1]));
  assert.deepEqual([...yazilan].sort(), [...ortak, ...buyukte].sort());
  for (const [ad, beklenen] of [['kucuk', ortak], ['kucuk_yatay', ortak], ['buyuk', [...ortak, ...buyukte]], ['buyuk_yatay', [...ortak, ...buyukte]]]) {
    const xml = oku(`mobil/android-ek/res/layout/biz_widget_${ad}.xml`);
    const var_ = new Set([...xml.matchAll(/@\+id\/(\w+)/g)].map((m) => m[1]));
    for (const id of beklenen) assert.ok(var_.has(id), `biz_widget_${ad}: ${id} yok`);
    assert.match(java, new RegExp(`R\\.layout\\.biz_widget_${ad}\\b`), `${ad} Java'da kullanılmalı`);
  }
  // Küçük yerleşime yalnız ortak kimlikler yazılır (büyük alanlar if (buyuk) içinde).
  const kucukBolum = java.slice(java.indexOf('static RemoteViews ciz('), java.indexOf('if (buyuk) {'));
  for (const id of buyukte) assert.ok(!kucukBolum.includes(`R.id.${id}`), id);
});

test('widget bilgi dosyaları: 2×1 ve 4×2, yerleşim ve açıklama', () => {
  const bilgi = (ad) => oku(`mobil/android-ek/res/xml/${ad}.xml`);
  const kucuk = bilgi('biz_widget_kucuk_bilgi');
  const buyuk = bilgi('biz_widget_buyuk_bilgi');
  assert.match(kucuk, /android:targetCellWidth="2"/);
  assert.match(kucuk, /android:targetCellHeight="1"/);
  assert.match(kucuk, /android:initialLayout="@layout\/biz_widget_kucuk"/);
  assert.match(buyuk, /android:targetCellWidth="4"/);
  assert.match(buyuk, /android:targetCellHeight="2"/);
  assert.match(buyuk, /android:initialLayout="@layout\/biz_widget_buyuk"/);
  for (const x of [kucuk, buyuk]) {
    assert.match(x, /android:widgetCategory="home_screen"/);
    assert.match(x, /android:description="@string\//);
    // Eski hücre formülü (70 × n − 30 dp): 2 hücre 110, 4 hücre 250, 1 satır 40, 2 satır 110.
    assert.match(x, /android:minWidth="(110|250)dp"/);
  }
  assert.match(kucuk, /android:minHeight="40dp"/);
  assert.match(buyuk, /android:minHeight="110dp"/);
});

// ---------- Java (mobil/android-ek/java) ----------

test('Java: paket = klasör, sınıf = dosya adı, dengeli; manifest sınıfları var', () => {
  assert.equal(JAVA.length, 4);
  for (const p of JAVA) {
    const java = readFileSync(p, 'utf8');
    const paket = goreli(p).replace(/^java\//, '').split('/').slice(0, -1).join('.');
    assert.match(java, new RegExp(`^package ${paket.replace(/\./g, '\\.')};`), goreli(p));
    const sinif = basename(p, '.java');
    assert.match(java, new RegExp(`public (?:abstract |final )?class ${sinif}\\b`), goreli(p));
    assert.ok(javaDengeli(java), `${goreli(p)} parantez dengesi`);
    // Paket: com.rose.bizikimiz.widget; R sınıfı uygulama ad alanında (build.gradle namespace = appId).
    assert.equal(paket, `${APP_ID}.widget`);
  }
  for (const w of WIDGETLER) {
    assert.ok(existsSync(join(EK, 'java', ...w.sinif.split('.')) + '.java'), w.sinif);
  }
});

test('Java: R referansları tanımlı; minSdk 24 dışı API yok; eklenti adı mobil.js ile aynı', () => {
  const t = tanimlar();
  const hepsi = JAVA.map((p) => readFileSync(p, 'utf8')).join('\n');
  for (const m of hepsi.matchAll(/(?<![\w.])R\.(\w+)\.(\w+)/g)) {
    assert.ok(t[m[1]]?.has(m[2]), `R.${m[1]}.${m[2]} tanımlı değil`);
  }
  assert.match(hepsi, new RegExp(`import ${APP_ID.replace(/\./g, '\\.')}\\.R;`));
  const kod = hepsi.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  // java.time ve String.join API 26; Calendar.getInstance yerel takvim (Budist/Japon) döndürebilir.
  assert.doesNotMatch(kod, /java\.time|Calendar\.getInstance|SimpleDateFormat|String\.join\b/);
  assert.doesNotMatch(kod, /SCHEDULE_EXACT_ALARM|setExact|setAlarmClock/, 'kesin alarm izni yok');
  assert.match(hepsi, /PendingIntent\.FLAG_IMMUTABLE/);
  const eklenti = /@CapacitorPlugin\(name = "(\w+)"\)/.exec(hepsi)?.[1];
  assert.equal(eklenti, 'BizWidget');
  assert.match(oku('js/core/mobil.js'), new RegExp(`eklenti\\('${eklenti}'\\)|cagir\\('${eklenti}'`));
});
