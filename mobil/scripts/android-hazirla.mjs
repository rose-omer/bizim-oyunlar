// `npx cap add android` ile üretilen projeye Biz İkimiz ayarlarını uygular. Java gerekmez.
// CI (.github/workflows/android.yml) her derlemede çalıştırır; tekrar çalıştırmak zararsızdır.
//   1. SCHEDULE_EXACT_ALARM iznini kaldırır (hatırlatıcılar kesin olmayan alarmla kurulur).
//   2. versionCode / versionName: BIZ_SURUM_KODU (CI'da github.run_number), BIZ_SURUM_ADI.
//   3. Release imzası: derleme anında BIZ_KEYSTORE_PATH varsa PKCS12 depoyla imzalar.
//   4. android-ek/res/ altındaki ek kaynakları (bildirim ikonu) projeye kopyalar.
import { readFileSync, writeFileSync, cpSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOLS_NS = 'http://schemas.android.com/tools';
const EXACT_ALARM = 'android.permission.SCHEDULE_EXACT_ALARM';
const IMZA_ISARET = '// --- Biz İkimiz: CI imzası';

/** Manifest'e tools ad alanını ve SCHEDULE_EXACT_ALARM kaldırma kuralını ekler. */
export function manifestYamala(xml) {
  let out = xml;
  if (!out.includes('xmlns:tools=')) {
    out = out.replace(/<manifest\b/, `<manifest xmlns:tools="${TOOLS_NS}"`);
  }
  if (!out.includes(`"${EXACT_ALARM}" tools:node="remove"`)) {
    const satir = `    <uses-permission android:name="${EXACT_ALARM}" tools:node="remove" />\n`;
    out = out.replace(/<\/manifest>\s*$/, `${satir}</manifest>\n`);
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
  console.log(`android hazır: sürüm kodu ${surumKodu}, SCHEDULE_EXACT_ALARM kaldırıldı, bildirim ikonu eklendi.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
