// Supabase ayarları.
// İkisi de boşsa site "yerel mod"da çalışır: yalnız aynı tarayıcının sekmeleri birbiriyle konuşur.
//
// Değerleri nereden alırsın:
//   1. https://supabase.com/dashboard → projeni aç.
//   2. Project Settings > API (ya da üstteki "Connect" düğmesi).
//   3. "Project URL" değerini SUPABASE_URL'e yapıştır.
//   4. "anon public" (eyJ... ile başlar) ya da "publishable" (sb_publishable_... ile başlar)
//      anahtarını SUPABASE_ANON_KEY'e yapıştır. Bu anahtar gizli değildir; sitede görünür.
//
// UYARI: "service_role" ya da "secret" (sb_secret_...) anahtarını ASLA buraya yazma.
// Önce supabase/schema.sql dosyasını SQL Editor'de çalıştır.
// Ayar dolu olsa da adrese ?yerel=1 eklenirse site yerel modda çalışır (geliştirme ve test).
export const SUPABASE_URL = 'https://blgtlflryxknyalutugw.supabase.co'; // örn. https://abcd.supabase.co
export const SUPABASE_ANON_KEY = 'sb_publishable_AzTJ8fQKYOAdjhrbnNoEoA_8FjjqelZ'; // anon / publishable anahtar (gizli değildir)
export const PHOTO_BUCKET = 'photos';
// false: yeni yükleme belgeye eski biçimde (herkese açık adres) yazılır; eski cihaz da okur. Kova kapatıldıktan sonra true yapılır
// ('kova:<yol>'). İki biçim de her zaman okunur. Bkz. geçiş planı.
export const MEDYA_KOVA_BICIMI = false;
export const VAPID_PUBLIC_KEY = 'BCnQ9D_-QCXTTAznN8Fu4CvzMo50bIRHQfvQp3DpsTHK3xYgqUug_D3LONZFheqVZp-j7CprzmPUT7oGY8kE7ZQ'; // Web Push genel anahtarı (gizli değildir)
