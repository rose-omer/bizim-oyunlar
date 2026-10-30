import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { manifestYamala, gradleYamala } from '../mobil/scripts/android-hazirla.mjs';
import { SUPABASE_URL } from '../js/config.js';

const yol = (p) => new URL(`../${p}`, import.meta.url);
const json = (p) => JSON.parse(readFileSync(yol(p), 'utf8'));

// Capacitor 8 şablonundan (npx cap add android) kısaltılmış örnekler.
const MANIFEST = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application android:label="@string/app_name" />
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
    '@capacitor/haptics', '@capacitor/app', '@capacitor/status-bar', '@capacitor/splash-screen', '@capacitor/assets']) {
    assert.match(hepsi[ad] || '', /^\d+\.\d+\.\d+$/, `${ad} sabit sürüm olmalı`);
    assert.equal(kilit.packages[`node_modules/${ad}`]?.version, hepsi[ad], `${ad} kilitte farklı`);
  }
  assert.equal(hepsi['@capacitor/core'], hepsi['@capacitor/android']);
  assert.equal(hepsi['@capacitor/core'], hepsi['@capacitor/cli']);
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
