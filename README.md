# Biz İkimiz

İki sevgilinin ücretsiz uygulaması. Statik site + Supabase (ücretsiz plan).
Adres: https://rose-omer.github.io/bizim-oyunlar/

## Özellikler
- **Biz:** kaç gündür birlikteyiz, yaklaşan özel günler, buluşma geri sayımı, dokunuş (💗 💋 🤗 🥺 💭), ruh hâli, mesafe (isteğe bağlı).
- **Sohbet:** fotoğraf, tepki, yanıt, görüldü, yazıyor.
- **Anılar:** fotoğraflı zaman çizelgesi, albüm, "geçen yıl bugün". **Mektuplar:** zaman kapsülü.
- **Özel Günler:** takvim, doğum günleri, kilometre taşları, hatırlatma.
- **Listelerimiz**, **Randevu Fikirleri** (200 fikir), **Günün Sorusu** (432 soru, seri), **Sevgi Dili Testi**, **Birlikte İzle** (YouTube eş zamanlı).
- **Oyunlar (13):** Yapboz, Beni Ne Kadar Tanıyorsun, Aynı Kafa, Doğruluk mu Cesaret mi, Hafıza, Çiz Bakalım,
  Kim Daha Çok, Hiç Yaptın mı, Derin Sohbet, Dama, Tavla, Dört Taş/XOX, Amiral Battı.
- **Ayarlar:** profil, başlangıç tarihi, PIN kilidi, tema, bildirim, yedek indirme.
- **Bildirim:** dokunuş, mesaj, mektup; her sabah 09:00 özel gün, akşam 20:00 günün sorusu hatırlatması.

## Telefona kurma
- **iPhone:** Safari → Paylaş → **Ana Ekrana Ekle**. Bildirim yalnız böyle kurulunca çalışır (iOS 16.4+).
- **Android:** Chrome → menü → **Uygulamayı yükle**. Ya da APK:
  https://github.com/rose-omer/bizim-oyunlar/releases/download/android-latest/BizIkimiz.apk
  (APK'da partnerden anlık bildirim yok; cihaz hatırlatıcıları var. Anlık bildirim için Chrome kurulumu.)

## Yerel çalıştırma
```bash
node dev/serve.mjs
```
- Aç: http://localhost:5173/?yerel=1 (`?yerel=1` = Supabase'siz; aynı tarayıcının iki sekmesi birbirini görür).

## Testler
```bash
npm test
```

## Supabase kurulumu
1. **SQL Editor** → `supabase/schema.sql` tamamı → **Run** (tekrar çalıştırmak güvenli).
2. **SQL Editor** → `C:/Users/koseo/.bizim-ikimiz/vault.sql` (gizli; depoda yok) → **Run** (bir kez).
3. Edge Function'lar ve gizli değerler:
   ```bash
   npx supabase login
   npx supabase secrets set --env-file C:/Users/koseo/.bizim-ikimiz/secrets.env --project-ref blgtlflryxknyalutugw
   npx supabase functions deploy bildir hatirlat --no-verify-jwt --use-api --project-ref blgtlflryxknyalutugw
   ```
4. Kontrol: `select jobname, schedule from cron.job;` → 2 satır.
- `js/config.js`'teki publishable anahtar ve VAPID genel anahtarı gizli değildir. Özel anahtarlar yalnız
  `C:/Users/koseo/.bizim-ikimiz/` klasöründe (yedekle). "service_role" / "secret" anahtarını siteye koyma.

## Yayın
- **GitHub Pages:** her `git push` siteyi 1 dk içinde günceller. `.nojekyll` silinmemeli.
- **Android APK:** `.github/workflows/android.yml`. `mobil/**` değişince ya da elle (`gh workflow run android.yml`) derlenir;
  `android-latest` sürümüne yüklenir. İmza: `ANDROID_KEYSTORE_B64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`,
  `ANDROID_KEY_PASSWORD` secret'ları; anahtar `C:/Users/koseo/.bizim-ikimiz/android-keystore.p12` (kaybolursa güncelleme kurulmaz).

## Uyanık tutma
- Ücretsiz Supabase 7 gün hareketsiz kalırsa durur.
- pg_cron hatırlatma işleri her gün çalışır; `keepalive.yml` 3 günde bir `ping` atar ve 45 günde bir boş commit ile
  GitHub'ın 60 gün kuralını önler.

## Ücretsiz plan sınırları
- Realtime: 200 eşzamanlı bağlantı, ayda 2 milyon mesaj. Depolama: 1 GB (fotoğraf ~0,5 MB). Veritabanı: 500 MB.
- Çıkış trafiği: ayda 5 GB. Edge Function: ayda 500 bin çağrı.

## Klasörler
- `index.html`, `js/hub.js`: Biz (ana sayfa). `sayfalar/<ad>/`: özellik sayfaları. `games/<oyun>/`: oyunlar.
- `js/core/`: oda, veri (`veri.js`), profil, tarih (`gunler.js`), arayüz, kilit, bildirim, PWA, mobil.
- `supabase/`: şema ve Edge Function'lar. `mobil/`: Capacitor Android. `sw.js`, `manifest.webmanifest`: PWA.
- `SOZLESME.md`: modüller arası sözleşme (geliştirici için).
