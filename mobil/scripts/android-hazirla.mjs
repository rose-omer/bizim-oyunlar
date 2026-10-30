// `npx cap add android` ile üretilen projeye Biz İkimiz ayarlarını uygular. Java gerekmez.
// CI (.github/workflows/android.yml) her derlemede çalıştırır; tekrar çalıştırmak zararsızdır.
//   1. Konum izinlerini ekler (sayfadaki navigator.geolocation için).
//   2. SCHEDULE_EXACT_ALARM iznini kaldırır (hatırlatıcılar kesin olmayan alarmla kurulur).
//   3. versionCode / versionName: BIZ_SURUM_KODU (CI'da github.run_number), BIZ_SURUM_ADI.
//   4. Release imzası: derleme anında BIZ_KEYSTORE_PATH varsa PKCS12 depoyla imzalar.
//   5. android-ek/res/ altındaki ek kaynakları (bildirim ikonu, bildirim rengi) projeye kopyalar.
//   6. FCM: bildirim varsayılanları (ikon, renk, kanal) manifeste; android/app/google-services.json varsa
//      paket adını denetler. Dosya varsa Capacitor şablonu google-services Gradle eklentisini kendisi uygular
//      (app/build.gradle sonu; classpath kök build.gradle'da). Dosyayı CI yazar (GOOGLE_SERVICES_JSON_B64).
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

// Capacitor BridgeWebChromeClient.onGeolocationPermissionsShowPrompt bu ikisini çalışma anında ister.
// Manifestte yoksa Android diyalog göstermeden reddeder; sayfa PERMISSION_DENIED (kod 1) alır.
// Android 12+ kullanıcı "yaklaşık"ı seçerse yalnız COARSE verilir; Capacitor bunu da kabul eder.
// Diğer izinler eklentilerin manifestinden gelir (VIBRATE: haptics; POST_NOTIFICATIONS: local-notifications).
const EK_IZINLER = ['android.permission.ACCESS_COARSE_LOCATION', 'android.permission.ACCESS_FINE_LOCATION'];

/**
 * Manifest'e konum izinlerini, tools ad alanını, SCHEDULE_EXACT_ALARM kaldırma kuralını ve
 * <application> içine FCM bildirim varsayılanlarını ekler.
 */
export function manifestYamala(xml) {
  let out = xml;
  if (!out.includes('xmlns:tools=')) {
    out = out.replace(/<manifest\b/, `<manifest xmlns:tools="${TOOLS_NS}"`);
  }
  const meta = FCM_META
    .filter(([ad]) => !out.includes(`android:name="${ad}"`))
    .map(([ad, deger]) => `        <meta-data android:name="${ad}" ${deger} />\n`);
  if (meta.length) out = out.replace(/([ \t]*)<\/application>/, (_, girinti) => `${meta.join('')}${girinti}</application>`);
  const satirlar = EK_IZINLER
    .filter((izin) => !out.includes(`android:name="${izin}"`))
    .map((izin) => `    <uses-permission android:name="${izin}" />\n`);
  if (!out.includes(`"${EXACT_ALARM}" tools:node="remove"`)) {
    satirlar.push(`    <uses-permission android:name="${EXACT_ALARM}" tools:node="remove" />\n`);
  }
  if (satirlar.length) out = out.replace(/<\/manifest>\s*$/, `${satirlar.join('')}</manifest>\n`);
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
  const app = join(kok, 'android', 'app');
  if (!existsSync(app)) throw new Error('android/app yok. Önce: npx cap add android');

  const manifestYolu = join(app, 'src', 'main', 'AndroidManifest.xml');
  writeFileSync(manifestYolu, manifestYamala(readFileSync(manifestYolu, 'utf8')));

  const gradleYolu = join(app, 'build.gradle');
  const surumKodu = process.env.BIZ_SURUM_KODU || 1;
  writeFileSync(gradleYolu, gradleYamala(readFileSync(gradleYolu, 'utf8'), { surumKodu, surumAdi: process.env.BIZ_SURUM_ADI }));

  cpSync(join(kok, 'android-ek', 'res'), join(app, 'src', 'main', 'res'), { recursive: true });

  const gsYolu = join(app, 'google-services.json');
  const { appId } = JSON.parse(readFileSync(join(kok, 'capacitor.config.json'), 'utf8'));
  const fcm = existsSync(gsYolu)
    ? `FCM açık (Firebase projesi ${googleServicesKontrol(readFileSync(gsYolu, 'utf8'), appId)})`
    : 'FCM kapalı (google-services.json yok)';
  console.log(`android hazır: sürüm kodu ${surumKodu}, konum izinleri eklendi, SCHEDULE_EXACT_ALARM kaldırıldı, bildirim ikonu eklendi, ${fcm}.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
