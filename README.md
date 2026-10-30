# Bizim Oyunlar

İki sevgilinin birlikte oynadığı oyun sitesi. Statik site + Supabase (ücretsiz plan).

Oyunlar: Yapboz (100–1000 parça), Beni Ne Kadar Tanıyorsun?, Aynı Kafa,
Doğruluk mu Cesaret mi, Hafıza Kartları, Çiz Bakalım.

## Yerel çalıştırma
```bash
node dev/serve.mjs
```
- Aç: http://localhost:5173/?yerel=1
- `?yerel=1` = Supabase'siz test. Aynı tarayıcıda iki sekme birbirini görür.
- İkinci sekme için lobideki davet linkini aç.

## Testler
```bash
node --test
```

## 1. Supabase kurulumu (bir kez)
1. https://supabase.com → ücretsiz hesap → **New project**. Bölge: **Frankfurt (eu-central-1)**.
2. **SQL Editor** → `supabase/schema.sql` içeriğini yapıştır → **Run**.
3. **Project Settings → API Keys**: "Project URL" ve "publishable" (ya da "anon") anahtarını al.
4. `js/config.js` içine yaz:
   ```js
   export const SUPABASE_URL = 'https://xxxx.supabase.co';
   export const SUPABASE_ANON_KEY = 'sb_publishable_...';
   ```
- Bu anahtar gizli değildir; tarayıcıda zaten görünür. Tablolar RLS ile kapalı, erişim yalnız RPC ile.
- "service_role" / "secret" anahtarını ASLA siteye koyma.

## 2. Yayın (ücretsiz, sürekli açık)
Şu an: **GitHub Pages** → https://rose-omer.github.io/bizim-oyunlar/
- Depo: https://github.com/rose-omer/bizim-oyunlar (main dalı, kök klasör).
- Her `git push` siteyi 1 dk içinde günceller. `.nojekyll` dosyası silinmemeli (`games/_soru` için gerekli).

Alternatif: **Cloudflare Pages** (ücretsiz, HTTPS, sınırsız trafik; gizli depo olabilir).
1. Bu klasörü bir GitHub deposuna gönder (gizli depo olabilir).
2. Cloudflare → Workers & Pages → Create → Pages → depoyu bağla.
3. Build command: boş. Output directory: `/`.
4. Her `git push` siteyi günceller.

Alternatif: GitHub Pages (Settings → Pages → Branch: main, `/`), Netlify ya da kendi hostingin.
Site statik; klasörü olduğu gibi yüklemek yeter. Alt klasörde de çalışır.

## 3. Supabase'i uyanık tutma (önemli)
- Ücretsiz Supabase projesi **7 gün** hareketsiz kalırsa durur. Oyunlar o zaman online çalışmaz.
- Çözüm: 3 günde bir `ping` isteği.
- **Yol A — GitHub Actions** (`.github/workflows/keepalive.yml`):
  Secret gerekmez; URL ve anahtar `js/config.js` içinden okunur.
  GitHub 60 gün commit almayan depoda zamanlanmış işi kapatır; iş bu yüzden 45 günde bir boş commit atar.
  Dosyayı göndermek için token'da `workflow` yetkisi gerekir: `gh auth refresh -h github.com -s workflow`.
- **Yol B — cron-job.org** (ücretsiz, yedek olarak önerilir):
  - URL: `https://xxxx.supabase.co/rest/v1/rpc/ping`
  - Method: POST, Body: `{}`
  - Header: `apikey: <publishable anahtar>`, `Content-Type: application/json`
  - Sıklık: 3 günde bir.

## Ücretsiz plan sınırları (çift kullanımı için fazlasıyla yeter)
- Realtime: 200 eşzamanlı bağlantı, ayda 2 milyon mesaj.
- Depolama: 1 GB (yapboz fotoğrafları, her biri ~0,5 MB).
- Veritabanı: 500 MB (yalnız oyun geçmişi).

## Klasörler
- `index.html`, `js/hub.js`: ana sayfa (Odamız)
- `js/core/`: oda (gerçek zamanlı), kimlik, depolama, veritabanı, ortak arayüz, ses
- `games/<oyun>/`: her oyun ayrı sayfa
- `supabase/schema.sql`: veritabanı kurulumu
- `SOZLESME.md`: modüller arası sözleşme (geliştirici için)
