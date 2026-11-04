// `npx cap add android` ile üretilen projeye Biz İkimiz ayarlarını uygular. Java gerekmez.
// CI (.github/workflows/android.yml) her derlemede çalıştırır; tekrar çalıştırmak zararsızdır.
//   1. WebView'ın mikrofon ve konum izinlerini bildirir (WEB_IZINLERI: sesli mesaj, navigator.geolocation).
//   2. SCHEDULE_EXACT_ALARM iznini kaldırır (hatırlatıcılar kesin olmayan alarmla kurulur).
//   3. versionCode / versionName: BIZ_SURUM_KODU (CI'da github.run_number), BIZ_SURUM_ADI.
//   4. Release imzası: derleme anında BIZ_KEYSTORE_PATH varsa PKCS12 depoyla imzalar.
//   5. android-ek/res/ altındaki ek kaynakları (bildirim ikonu, bildirim rengi, widget) projeye kopyalar.
//   6. Ana ekran widget'ı: android-ek/java/ yerel kodunu kopyalar, AndroidManifest'e iki widget alıcısını
//      ekler, MainActivity'de BizWidget eklentisini kaydeder (js/core/mobil.js widgetGuncelle).
//   7. FCM: bildirim varsayılanları (ikon, renk, kanal) manifeste; android/app/google-services.json varsa
//      paket adını denetler. Dosya varsa Capacitor şablonu google-services Gradle eklentisini kendisi uygular
//      (app/build.gradle sonu; classpath kök build.gradle'da). Dosyayı CI yazar (GOOGLE_SERVICES_JSON_B64).
//   8. android:allowBackup="false": cihaz anahtarı (WebView localStorage) bulut yedeğine girmesin.
import { readFileSync, writeFileSync, cpSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOLS_NS = 'http://schemas.android.com/tools';
const EXACT_ALARM = 'android.permission.SCHEDULE_EXACT_ALARM';
const IMZA_ISARET = '// --- Biz İkimiz: CI imzası';

// FCM bildirimi kendi ikon/renk/kanalını taşır (supabase/functions/_shared/fcm.js). Bunlar yedek değerlerdir:
// ör. Firebase konsolundan gönderilen deneme bildirimi uygulama ikonunu (beyaz kare) değil kalbi gösterir.
// Kanal kimliği js/core/mobil.js FCM_KANAL ile aynı; renk android-ek/res/values/biz_bildirim.xml.
const FCM_META = [
  ['com.google.firebase.messaging.default_notification_icon', 'android:resource="@drawable/ic_stat_kalp"'],
  ['com.google.firebase.messaging.default_notification_color', 'android:resource="@color/biz_bildirim"'],
  ['com.google.firebase.messaging.default_notification_channel_id', 'android:value="biz-ikimiz"'],
];

/**
 * WebView'ın çalışma anında istediği izinler. Capacitor 8 BridgeWebChromeClient kendisi ister:
 * getUserMedia ses (sohbette sesli mesaj) → RECORD_AUDIO + MODIFY_AUDIO_SETTINGS;
 * navigator.geolocation (anı haritası, Ayarlar › Mesafe ve konum rehberi) → ACCESS_COARSE_LOCATION +
 * ACCESS_FINE_LOCATION (onGeolocationPermissionsShowPrompt ikisini birlikte ister; Android 12+ kullanıcı
 * "yaklaşık"ı seçerse yalnız COARSE verilir, Capacitor bunu da kabul eder).
 * Manifest'te bildirilmezse istek diyalogsuz reddedilir (sayfa PERMISSION_DENIED alır); ek kod gerekmez.
 * Diğer izinler eklentilerin manifestinden gelir (VIBRATE: haptics; POST_NOTIFICATIONS: local-notifications).
 */
export const WEB_IZINLERI = [
  'android.permission.RECORD_AUDIO',
  'android.permission.MODIFY_AUDIO_SETTINGS',
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.ACCESS_FINE_LOCATION',
];

/**
 * Manifest'e WebView izinlerini (yoksa), tools ad alanını, SCHEDULE_EXACT_ALARM kaldırma kuralını ve
 * <application> içine FCM bildirim varsayılanlarını (yoksa) ekler.
 */
export function manifestYamala(xml) {
  let out = xml;
  const nl = out.includes('\r\n') ? '\r\n' : '\n';
  const sona = (satir) => { out = out.replace(/<\/manifest>\s*$/, `    ${satir}${nl}</manifest>${nl}`); };
  if (!out.includes('xmlns:tools=')) {
    out = out.replace(/<manifest\b/, `<manifest xmlns:tools="${TOOLS_NS}"`);
  }
  out = out.replace(/<application\b[^>]*>/, (etiket) => (etiket.includes('android:allowBackup=')
    ? etiket.replace(/android:allowBackup="[^"]*"/, 'android:allowBackup="false"')
    : etiket.replace('<application', '<application android:allowBackup="false"')));
  const meta = FCM_META
    .filter(([ad]) => !out.includes(`android:name="${ad}"`))
    .map(([ad, deger]) => `        <meta-data android:name="${ad}" ${deger} />${nl}`);
  if (meta.length) out = out.replace(/([ \t]*)<\/application>/, (_, girinti) => `${meta.join('')}${girinti}</application>`);
  for (const izin of WEB_IZINLERI) {
    if (!new RegExp(`<uses-permission\\s+android:name="${izin.replace(/\./g, '\\.')}"`).test(out)) {
      sona(`<uses-permission android:name="${izin}" />`);
    }
  }
  if (!out.includes(`"${EXACT_ALARM}" tools:node="remove"`)) {
    sona(`<uses-permission android:name="${EXACT_ALARM}" tools:node="remove" />`);
  }
  return out;
}

/** Sürüm kodunu ve adını yazar; imza bloğunu bir kez ekler. */
export function gradleYamala(gradle, { surumKodu = 1, surumAdi } = {}) {
  const kod = Number.parseInt(surumKodu, 10);
  if (!Number.isInteger(kod) || kod < 1 || kod > 2100000000) throw new Error(`Geçersiz sürüm kodu: ${surumKodu}`);
  const ad = String(surumAdi || `1.0.${kod}`).replace(/["\\]/g, '');
  let out = gradle
    .replace(/versionCode\s+\d+/, `versionCode ${kod}`)
    .replace(/versionName\s+"[^"]*"/, `versionName "${ad}"`);
  if (!out.includes(IMZA_ISARET)) {
    out = `${out.replace(/\s*$/, '')}\n\n${IMZA_BLOGU}`;
  }
  return out;
}

const IMZA_BLOGU = `${IMZA_ISARET} (mobil/scripts/android-hazirla.mjs ekledi) ---
// BIZ_KEYSTORE_PATH tanımlıysa release derlemesi bu PKCS12 depoyla imzalanır.
// Parolalar yalnız ortam değişkeninden okunur; dosyaya yazılmaz.
if (System.getenv('BIZ_KEYSTORE_PATH')) {
    android {
        signingConfigs {
            bizRelease {
                storeFile = file(System.getenv('BIZ_KEYSTORE_PATH'))
                storeType = 'pkcs12'
                storePassword = System.getenv('BIZ_KEYSTORE_PASSWORD')
                keyAlias = System.getenv('BIZ_KEY_ALIAS')
                keyPassword = System.getenv('BIZ_KEY_PASSWORD')
            }
        }
        buildTypes {
            release {
                signingConfig = signingConfigs.bizRelease
            }
        }
    }
}
`;

// ---------- Ana ekran widget'ı ----------
// Java: android-ek/java/com/rose/bizikimiz/widget/ (paket appId'ye bağlı: R sınıfı com.rose.bizikimiz.R).

const WIDGET_ISARET = "Biz İkimiz: ana ekran widget'ı";
const WIDGET_PAKET = 'com.rose.bizikimiz.widget';

/** Manifest'e eklenen widget alıcıları: sınıf, seçicideki ad (@string), bilgi dosyası (@xml). */
export const WIDGETLER = [
  { sinif: `${WIDGET_PAKET}.BizWidgetKucuk`, ad: 'biz_widget_kucuk_ad', bilgi: 'biz_widget_kucuk_bilgi' },
  { sinif: `${WIDGET_PAKET}.BizWidgetBuyuk`, ad: 'biz_widget_buyuk_ad', bilgi: 'biz_widget_buyuk_bilgi' },
];

// exported=false: yayınları yalnız sistem (widget servisi, saat değişimi) ve uygulamanın kendi alarmı gönderir.
const alici = ({ sinif, ad, bilgi }) => `        <receiver
            android:name="${sinif}"
            android:exported="false"
            android:label="@string/${ad}">
            <intent-filter>
                <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />
                <action android:name="android.intent.action.TIME_SET" />
                <action android:name="android.intent.action.TIMEZONE_CHANGED" />
            </intent-filter>
            <meta-data
                android:name="android.appwidget.provider"
                android:resource="@xml/${bilgi}" />
        </receiver>
`;

/** <application> sonuna iki widget alıcısını bir kez ekler. */
export function widgetManifestYamala(xml) {
  if (xml.includes(WIDGET_ISARET)) return xml;
  const m = /\r?\n([ \t]*)<\/application>/.exec(xml);
  if (!m) throw new Error('AndroidManifest: </application> bulunamadı');
  const blok = `        <!-- ${WIDGET_ISARET} (mobil/scripts/android-hazirla.mjs ekledi) -->\n${WIDGETLER.map(alici).join('')}`;
  const nl = m[0].startsWith('\r') ? '\r\n' : '\n';
  return `${xml.slice(0, m.index)}${nl}${blok.replace(/\n/g, nl).replace(/\r?\n$/, '')}${xml.slice(m.index)}`;
}

/** Şablon MainActivity'de (boş gövde) BizWidget eklentisini super.onCreate'ten önce kaydeder. */
export function mainActivityYamala(java) {
  if (java.includes('registerPlugin(BizWidgetPlugin.class)')) return java;
  const nl = java.includes('\r\n') ? '\r\n' : '\n';
  const govde = /class MainActivity extends BridgeActivity\s*\{\s*\}/;
  const ice = /import com\.getcapacitor\.BridgeActivity;/;
  if (!govde.test(java) || !ice.test(java)) {
    throw new Error('MainActivity Capacitor şablonundan farklı; BizWidget eklentisi elle kaydedilmeli (android-hazirla.mjs).');
  }
  const satirlar = (...s) => s.join(nl);
  return java
    .replace(ice, satirlar('import android.os.Bundle;', 'import com.getcapacitor.BridgeActivity;', `import ${WIDGET_PAKET}.BizWidgetPlugin;`))
    .replace(govde, satirlar(
      'class MainActivity extends BridgeActivity {',
      '',
      '    // Biz İkimiz: yerel eklentiler (mobil/scripts/android-hazirla.mjs ekledi). super.onCreate köprüyü kurar; önce kaydedilir.',
      '    @Override',
      '    protected void onCreate(Bundle savedInstanceState) {',
      '        registerPlugin(BizWidgetPlugin.class);',
      '        super.onCreate(savedInstanceState);',
      '    }',
      '}',
    ));
}

/** kok = mobil/ klasörü (android/, android-ek/, capacitor.config.json). -> uygulanan sürüm kodu. */
export function hazirla(kok, env = process.env) {
  const app = join(kok, 'android', 'app');
  if (!existsSync(app)) throw new Error('android/app yok. Önce: npx cap add android');
  const ana = join(app, 'src', 'main');
  const yaz = (yol, fn) => writeFileSync(yol, fn(readFileSync(yol, 'utf8')));

  yaz(join(ana, 'AndroidManifest.xml'), (x) => widgetManifestYamala(manifestYamala(x)));

  const surumKodu = env.BIZ_SURUM_KODU || 1;
  yaz(join(app, 'build.gradle'), (g) => gradleYamala(g, { surumKodu, surumAdi: env.BIZ_SURUM_ADI }));

  cpSync(join(kok, 'android-ek', 'res'), join(ana, 'res'), { recursive: true });
  cpSync(join(kok, 'android-ek', 'java'), join(ana, 'java'), { recursive: true });

  const { appId } = JSON.parse(readFileSync(join(kok, 'capacitor.config.json'), 'utf8'));
  yaz(join(ana, 'java', ...appId.split('.'), 'MainActivity.java'), mainActivityYamala);
  return surumKodu;
}

/**
 * google-services.json metni bu paket için mi? -> Firebase proje kimliği. Değilse anlaşılır hata fırlatır
 * (google-services eklentisi aksi hâlde derlemenin ortasında "No matching client" der).
 */
export function googleServicesKontrol(metin, paket) {
  let j;
  try {
    j = JSON.parse(metin);
  } catch {
    throw new Error('google-services.json geçerli JSON değil (GOOGLE_SERVICES_JSON_B64 doğru mu?)');
  }
  const proje = j?.project_info?.project_id;
  const paketler = (Array.isArray(j?.client) ? j.client : []).map((c) => c?.client_info?.android_client_info?.package_name);
  if (!proje || !paketler.includes(paket)) {
    throw new Error(`google-services.json "${paket}" paketini içermiyor (Firebase'de bu paket adıyla Android uygulaması ekle)`);
  }
  return proje;
}

function main() {
  const kok = join(dirname(fileURLToPath(import.meta.url)), '..');
  const surumKodu = hazirla(kok);
  const gsYolu = join(kok, 'android', 'app', 'google-services.json');
  const { appId } = JSON.parse(readFileSync(join(kok, 'capacitor.config.json'), 'utf8'));
  const fcm = existsSync(gsYolu)
    ? `FCM açık (Firebase projesi ${googleServicesKontrol(readFileSync(gsYolu, 'utf8'), appId)})`
    : 'FCM kapalı (google-services.json yok)';
  console.log(`android hazır: sürüm kodu ${surumKodu}, WebView izinleri eklendi, SCHEDULE_EXACT_ALARM kaldırıldı, `
    + `bildirim ikonu ve ana ekran widget'ı eklendi, ${fcm}.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
