import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { manifestYamala, gradleYamala, googleServicesKontrol } from '../mobil/scripts/android-hazirla.mjs';
import { SUPABASE_URL } from '../js/config.js';
import { apkSurumu, FCM_KANAL } from '../js/core/mobil.js';
import { FCM_KANAL as SUNUCU_KANAL, FCM_IKON, FCM_RENK } from '../supabase/functions/_shared/fcm.js';

const yol = (p) => new URL(`../${p}`, import.meta.url);
const json = (p) => JSON.parse(readFileSync(yol(p), 'utf8'));

// Capacitor 8 şablonundan (npx cap add android) kısaltılmış örnekler.
const MANIFEST = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application android:label="@string/app_name">
        <activity android:name=".MainActivity" />
    </application>
    <uses-permission android:name="android.permission.INTERNET" />
</manifest>
`;
const GRADLE = `apply plugin: 'com.android.application'
android {
    defaultConfig {
        applicationId "com.rose.bizikimiz"
        versionCode 1
        versionName "1.0"
    }
}
apply from: 'capacitor.build.gradle'
`;

test('capacitor.config: canlı site, güvenli ayarlar, çevrimdışı sayfa', () => {
  const c = json('mobil/capacitor.config.json');
  assert.equal(c.appId, 'com.rose.bizikimiz');
  assert.equal(c.appName, 'Biz İkimiz');
  assert.equal(c.webDir, 'www');
  assert.equal(c.server.url, 'https://rose-omer.github.io/bizim-oyunlar/');
  assert.notEqual(c.server.cleartext, true);
  assert.equal(c.android.allowMixedContent, false);
  assert.notEqual(c.android.webContentsDebuggingEnabled, true);
  assert.ok(existsSync(yol(`mobil/www/${c.server.errorPath}`)), 'errorPath dosyası www içinde olmalı');
  const sayfa = readFileSync(yol(`mobil/www/${c.server.errorPath}`), 'utf8');
  assert.match(sayfa, /Bağlantı yok/);
  assert.match(sayfa, /Tekrar dene/);
  assert.ok(sayfa.includes(`'${c.server.url}'`), 'çevrimdışı sayfa canlı siteye dönmeli');
});

test('capacitor.config: gezinme izni yalnız site, Supabase ve YouTube', () => {
  const izin = json('mobil/capacitor.config.json').server.allowNavigation;
  assert.ok(izin.includes(new URL(SUPABASE_URL).host), 'js/config.js Supabase adresi izinli olmalı');
  for (const h of izin) {
    assert.match(h, /^(rose-omer\.github\.io|[a-z0-9]+\.supabase\.co|(\*\.)?youtube\.com|\*\.youtube-nocookie\.com)$/, h);
  }
});

test('package.json: Capacitor sürümleri sabit ve kilit dosyasıyla aynı', () => {
  const p = json('mobil/package.json');
  const kilit = json('mobil/package-lock.json');
  const hepsi = { ...p.dependencies, ...p.devDependencies };
  for (const ad of ['@capacitor/core', '@capacitor/cli', '@capacitor/android', '@capacitor/local-notifications',
    '@capacitor/haptics', '@capacitor/app', '@capacitor/status-bar', '@capacitor/splash-screen', '@capacitor/share',
    '@capacitor/push-notifications', '@capacitor/assets']) {
    assert.match(hepsi[ad] || '', /^\d+\.\d+\.\d+$/, `${ad} sabit sürüm olmalı`);
    assert.equal(kilit.packages[`node_modules/${ad}`]?.version, hepsi[ad], `${ad} kilitte farklı`);
  }
  assert.equal(hepsi['@capacitor/core'], hepsi['@capacitor/android']);
  assert.equal(hepsi['@capacitor/core'], hepsi['@capacitor/cli']);
});

test('package.json: yerel eklenti listesi (yeni eklenti = yeni izin; bilerek eklenir)', () => {
  const eklentiler = Object.keys(json('mobil/package.json').dependencies)
    .filter((ad) => !['@capacitor/core', '@capacitor/android'].includes(ad))
    .sort();
  assert.deepEqual(eklentiler, [
    '@capacitor/app',
    '@capacitor/browser', // izin yok; APK'yı dış tarayıcıda (Chrome özel sekmesi) indirmek için
    '@capacitor/filesystem', // izin yok (uygulama önbelleği); takvim dosyasını (.ics) paylaşmak için
    '@capacitor/haptics', // VIBRATE
    '@capacitor/local-notifications', // POST_NOTIFICATIONS, RECEIVE_BOOT_COMPLETED, WAKE_LOCK
    '@capacitor/push-notifications', // FCM (firebase-messaging: INTERNET, WAKE_LOCK, c2dm RECEIVE)
    '@capacitor/share', // izin yok; Android WebView'da navigator.share yok
    '@capacitor/splash-screen',
    '@capacitor/status-bar',
  ]);
  // Konum eklentisi gerekmez: WebView navigator.geolocation'ı BridgeWebChromeClient karşılar.
});

test('ikon kaynakları: en az 1024 / 2732 piksel SVG, XML yorumunda "--" yok', () => {
  const boyut = { 'icon-only': 1024, 'icon-foreground': 1024, 'icon-background': 1024, splash: 2732, 'splash-dark': 2732 };
  for (const [ad, en] of Object.entries(boyut)) {
    const svg = readFileSync(yol(`mobil/assets/${ad}.svg`), 'utf8');
    assert.ok(svg.includes(`width="${en}" height="${en}"`), ad);
    for (const yorum of svg.match(/<!--([\s\S]*?)-->/g) || []) {
      assert.ok(!yorum.slice(4, -3).includes('--'), `${ad}: yorumda -- var (librsvg okuyamaz)`);
    }
  }
});

test('manifestYamala: tools ad alanı ve kesin alarm izni kaldırma; tekrar zararsız', () => {
  const bir = manifestYamala(MANIFEST);
  assert.match(bir, /<manifest xmlns:tools="http:\/\/schemas\.android\.com\/tools" xmlns:android=/);
  assert.match(bir, /<uses-permission android:name="android\.permission\.SCHEDULE_EXACT_ALARM" tools:node="remove" \/>\n<\/manifest>\n$/);
  assert.match(bir, /android\.permission\.INTERNET/);
  assert.equal(manifestYamala(bir), bir);
});

test('manifestYamala: WebView mikrofon ve konum izinleri birer kez', () => {
  // Capacitor 8 BridgeWebChromeClient bunları çalışma anında ister (getUserMedia ses → RECORD_AUDIO +
  // MODIFY_AUDIO_SETTINGS; navigator.geolocation → COARSE + FINE). Manifest'te yoksa istek hemen reddedilir.
  const izinler = ['RECORD_AUDIO', 'MODIFY_AUDIO_SETTINGS', 'ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION'];
  const say = (xml, ad) => xml.split(`<uses-permission android:name="android.permission.${ad}"`).length - 1;
  const bir = manifestYamala(MANIFEST);
  for (const ad of izinler) assert.equal(say(bir, ad), 1, ad);
  const iki = manifestYamala(manifestYamala(bir));
  assert.equal(iki, bir, 'tekrar çalıştırınca çoğalmamalı');
  // Şablonda zaten varsa eklenmez (CRLF dosyada da).
  const hazir = MANIFEST.replace('</manifest>', '    <uses-permission android:name="android.permission.RECORD_AUDIO"/>\n</manifest>');
  assert.equal(say(manifestYamala(hazir), 'RECORD_AUDIO'), 1);
  const crlf = manifestYamala(MANIFEST.replace(/\n/g, '\r\n'));
  for (const ad of izinler) assert.equal(say(crlf, ad), 1, `${ad} (CRLF)`);
  assert.equal(manifestYamala(crlf), crlf);
  // İzinler <application> dışında, <manifest> altında.
  assert.ok(bir.indexOf('RECORD_AUDIO') > bir.indexOf('<application'));
  assert.ok(bir.indexOf('RECORD_AUDIO') < bir.indexOf('</manifest>'));
  assert.doesNotMatch(bir.slice(bir.indexOf('<application'), bir.indexOf('/>', bir.indexOf('<application'))), /uses-permission/);
});

test('manifestYamala: konum izinleri (WebView navigator.geolocation için) bir kez eklenir', () => {
  const bir = manifestYamala(MANIFEST);
  // BridgeWebChromeClient.onGeolocationPermissionsShowPrompt ikisini birlikte ister; manifestte yoksa
  // Android diyalog göstermeden reddeder ve sayfa PERMISSION_DENIED (kod 1) alır.
  for (const izin of ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION']) {
    const satir = `<uses-permission android:name="android.permission.${izin}" />`;
    assert.equal(bir.split(satir).length - 1, 1, izin);
  }
  assert.equal(manifestYamala(bir), bir);
  // Şablonda biri zaten varsa yinelenmez.
  const hazir = MANIFEST.replace('</manifest>', '    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />\n</manifest>');
  assert.equal(manifestYamala(hazir).split('android.permission.ACCESS_FINE_LOCATION').length - 1, 1);
});

test('manifestYamala: gereksiz izin eklemez (kamera, depolama, arka plan konumu)', () => {
  const bir = manifestYamala(MANIFEST);
  // <input type=file accept="image/*"> capture'sız: sistem seçicisi, izin gerekmez. CAMERA bildirilirse
  // capture için çalışma anı izni gerekir (BridgeWebChromeClient.isMediaCaptureSupported).
  // RECORD_AUDIO gerekli: sohbette sesli mesaj (WEB_IZINLERI).
  for (const izin of ['CAMERA', 'READ_MEDIA_IMAGES', 'READ_EXTERNAL_STORAGE', 'ACCESS_BACKGROUND_LOCATION']) {
    assert.ok(!bir.includes(`android.permission.${izin}"`), izin);
  }
});

test('gradleYamala: sürüm kodu/adı ve tek imza bloğu', () => {
  const bir = gradleYamala(GRADLE, { surumKodu: '57' });
  assert.match(bir, /versionCode 57\n/);
  assert.match(bir, /versionName "1\.0\.57"/);
  assert.match(bir, /if \(System\.getenv\('BIZ_KEYSTORE_PATH'\)\)/);
  assert.match(bir, /storeType = 'pkcs12'/);
  assert.match(bir, /signingConfig = signingConfigs\.bizRelease/);
  const iki = gradleYamala(bir, { surumKodu: 58, surumAdi: '2.0' });
  assert.equal(iki.match(/Biz İkimiz: CI imzası/g).length, 1);
  assert.match(iki, /versionCode 58\n/);
  assert.match(iki, /versionName "2\.0"/);
  assert.throws(() => gradleYamala(GRADLE, { surumKodu: 'abc' }), /Geçersiz sürüm kodu/);
  assert.throws(() => gradleYamala(GRADLE, { surumKodu: 0 }), /Geçersiz sürüm kodu/);
});

test('android.yml: secret adları, sabit indirme adı ve imza yedeği', () => {
  const yml = readFileSync(yol('.github/workflows/android.yml'), 'utf8');
  for (const s of ['ANDROID_KEYSTORE_B64', 'ANDROID_KEYSTORE_PASSWORD', 'ANDROID_KEY_ALIAS', 'ANDROID_KEY_PASSWORD']) {
    assert.ok(yml.includes(`secrets.${s}`), s);
  }
  assert.match(yml, /BizIkimiz\.apk/);
  assert.match(yml, /android-latest/);
  assert.match(yml, /assembleRelease/);
  assert.match(yml, /assembleDebug/);
  assert.match(yml, /contents: write/);
  assert.doesNotMatch(yml, /\t/, 'YAML sekme içermemeli');
});

test('android.yml: sürüm adı SURUM_ANA.<çalıştırma no>; surum.json uygulamanın okuduğu biçimde', () => {
  const yml = readFileSync(yol('.github/workflows/android.yml'), 'utf8');
  const ana = yml.match(/^\s+SURUM_ANA: '(\d+\.\d+)'$/m)?.[1];
  assert.equal(ana, '1.2');
  assert.equal(json('mobil/package.json').version, `${ana}.0`, 'mobil/package.json sürümü SURUM_ANA ile aynı');
  assert.match(yml, /BIZ_SURUM_ADI: \$\{\{ env\.SURUM_ANA \}\}\.\$\{\{ github\.run_number \}\}/);
  assert.match(yml, /BIZ_SURUM_KODU: \$\{\{ github\.run_number \}\}/);
  // Sürüm notu: pages.yml surum.json'u yoksa bu satırdan üretir.
  assert.match(yml, /sürüm \$\{SURUM_ANA\}\.\$\{GITHUB_RUN_NUMBER\}/);
  // surum.json: kod = versionCode (BIZ_SURUM_KODU ile aynı) → apkSurumu okur.
  assert.match(yml, /--arg surum "\$\{SURUM_ANA\}\.\$\{GITHUB_RUN_NUMBER\}" --argjson kod "\$GITHUB_RUN_NUMBER"/);
  assert.match(yml, /--argjson fcm "\$\(\[ "\$FCM" = acik \] && echo true \|\| echo false\)"/);
  assert.match(yml, /'\{surum: \$surum, kod: \$kod, tarih: \$tarih, fcm: \$fcm\}' > surum\.json/);
  assert.equal(apkSurumu({ surum: `${ana}.42`, kod: 42, tarih: '2026-10-30T12:00:00Z', fcm: true }), 42);
  // Önce APK, sonra surum.json.
  const apk = yml.indexOf('gh release upload "$tag" BizIkimiz.apk --clobber');
  const surum = yml.indexOf('gh release upload "$tag" surum.json --clobber');
  assert.ok(apk > 0 && surum > apk, JSON.stringify({ apk, surum }));
});

// ---------- FCM ----------

test('manifestYamala: FCM bildirim varsayılanları <application> içinde, bir kez', () => {
  const bir = manifestYamala(MANIFEST);
  const uygulama = bir.slice(bir.indexOf('<application'), bir.indexOf('</application>'));
  assert.match(uygulama, /<meta-data android:name="com\.google\.firebase\.messaging\.default_notification_icon" android:resource="@drawable\/ic_stat_kalp" \/>/);
  assert.match(uygulama, /<meta-data android:name="com\.google\.firebase\.messaging\.default_notification_color" android:resource="@color\/biz_bildirim" \/>/);
  assert.match(uygulama, new RegExp(`default_notification_channel_id" android:value="${FCM_KANAL}" />`));
  assert.match(bir, /<activity android:name="\.MainActivity" \/>\n {8}<meta-data/);
  assert.match(bir, /\/>\n {4}<\/application>/);
  assert.equal(manifestYamala(bir), bir);
});

test('FCM: kanal, ikon ve renk uygulama, manifest ve sunucuda aynı', () => {
  assert.equal(SUNUCU_KANAL, FCM_KANAL);
  assert.ok(existsSync(yol(`mobil/android-ek/res/drawable/${FCM_IKON}.xml`)), 'ikon kaynağı');
  const renk = readFileSync(yol('mobil/android-ek/res/values/biz_bildirim.xml'), 'utf8');
  assert.match(renk, new RegExp(`<color name="biz_bildirim">${FCM_RENK}</color>`));
  const c = json('mobil/capacitor.config.json');
  assert.equal(c.plugins.LocalNotifications.iconColor, FCM_RENK);
  assert.equal(c.plugins.PushNotifications?.presentationOptions, undefined,
    'uygulama açıkken sistem bildirimi yok; sayfa bizim:bildirim olayıyla gösterir');
});

test('googleServicesKontrol: paket adı eşleşmeli; anlaşılır hata', () => {
  const gs = (paket) => JSON.stringify({
    project_info: { project_id: 'biz-ikimiz-deneme' },
    client: [{ client_info: { android_client_info: { package_name: paket } } }],
  });
  assert.equal(googleServicesKontrol(gs('com.rose.bizikimiz'), 'com.rose.bizikimiz'), 'biz-ikimiz-deneme');
  assert.throws(() => googleServicesKontrol(gs('com.baska.app'), 'com.rose.bizikimiz'), /com\.rose\.bizikimiz/);
  assert.throws(() => googleServicesKontrol('bozuk', 'com.rose.bizikimiz'), /JSON/);
  assert.throws(() => googleServicesKontrol('{}', 'com.rose.bizikimiz'), /içermiyor/);
});

test('android.yml: google-services.json secret\'tan; secret yoksa eklenti çıkarılır (register çökmesin)', () => {
  const yml = readFileSync(yol('.github/workflows/android.yml'), 'utf8');
  assert.ok(yml.includes('secrets.GOOGLE_SERVICES_JSON_B64'));
  assert.match(yml, /base64 -d > android\/app\/google-services\.json/);
  assert.match(yml, /rm -rf node_modules\/@capacitor\/push-notifications/);
  // Sıra: cap add → Firebase → hazırla (paket denetimi) → cap sync (eklenti listesi yeniden yazılır).
  const sira = ['npx cap add android', 'name: Firebase (FCM)', 'node scripts/android-hazirla.mjs', 'npx cap sync android']
    .map((s) => yml.indexOf(s));
  assert.ok(sira.every((i, k) => i > 0 && (k === 0 || i > sira[k - 1])), JSON.stringify(sira));
});
