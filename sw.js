// Biz İkimiz service worker (site kökünde; kapsam = site kökü, alt klasörde de doğru). Sahip: Sunucu ajanı.
// - HTML, JS ve CSS: ağ önce, önbellek yedek (yeni sürüm hemen ve birlikte gelir; çevrimdışında son kopya).
// - Görsel, ikon, font: önbellekten hemen, arkada tazele (stale-while-revalidate).
// - Supabase, YouTube ve diğer dış adresler önbelleğe alınmaz (yalnız Google Fonts alınır).
// - push → bildirim gösterir; bildirime dokununca açık pencereyi odaklar ya da sayfayı açar.
// Tüm önbelleği atmak için SURUM'u değiştir.
const SURUM = '2026-10-30.2';
const ONBELLEK = `biz-${SURUM}`;
const KOK = new URL('./', self.location.href).href;
const ON_YUKLE = ['./', 'css/base.css', 'assets/favicon.svg', 'manifest.webmanifest', 'assets/icons/icon-192.png', 'assets/icons/rozet-96.png'];
const FONT_HOST = new Set(['fonts.googleapis.com', 'fonts.gstatic.com']);
const VARLIK_RE = /\.(png|jpe?g|webp|gif|svg|ico|woff2?|ttf|otf|webmanifest)$/i;
const VARLIK_HEDEF = new Set(['image', 'font', 'manifest']);

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(ONBELLEK);
    // Biri eksik olsa da diğerleri alınsın (addAll hepsini birden düşürür).
    await Promise.allSettled(ON_YUKLE.map((y) => c.add(new Request(new URL(y, KOK).href, { cache: 'reload' }))));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const ad of await caches.keys()) {
      if (ad.startsWith('biz-') && ad !== ONBELLEK) await caches.delete(ad);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return;

  if (url.origin === self.location.origin) {
    if (!url.href.startsWith(KOK) || req.headers.has('range')) return; // site dışı yol ya da video parçası
    if (req.mode === 'navigate') {
      e.respondWith(sayfaGetir(req));
    } else if (VARLIK_HEDEF.has(req.destination) || VARLIK_RE.test(url.pathname)) {
      e.respondWith(tazeleArkada(e));
    } else {
      e.respondWith(agOnce(req));
    }
    return;
  }
  if (FONT_HOST.has(url.hostname)) e.respondWith(tazeleArkada(e));
  // Supabase, YouTube ve diğerleri: dokunma (tarayıcı doğrudan gider).
});

/** HTML: ağ önce. Önbellek anahtarı sorgu dizesiz (oda/host parametreleri sayfa çoğaltmasın). */
async function sayfaGetir(req) {
  const c = await caches.open(ONBELLEK);
  const u = new URL(req.url);
  const anahtar = u.origin + u.pathname;
  try {
    const res = await fetch(req, { cache: 'no-cache' });
    if (res.ok && res.type === 'basic' && !res.redirected) c.put(anahtar, res.clone()).catch(() => {});
    return res;
  } catch {
    // Başka sayfanın kopyası verilmez: göreli yollar o adreste bozulur.
    return (await c.match(anahtar, { ignoreVary: true })) || cevrimdisiSayfa();
  }
}

/** JS ve diğerleri: ağ önce (HTTP önbelleği de doğrulanır), çevrimdışında son kopya. */
async function agOnce(req) {
  const c = await caches.open(ONBELLEK);
  try {
    const res = await fetch(req, { cache: 'no-cache' });
    if (res.ok && res.type === 'basic' && !res.redirected) c.put(req, res.clone()).catch(() => {});
    return res;
  } catch (err) {
    const eski = await c.match(req, { ignoreVary: true });
    if (eski) return eski;
    throw err;
  }
}

/** Varlıklar: önbellekte varsa hemen ver, arkada tazele. */
async function tazeleArkada(e) {
  const req = e.request;
  const c = await caches.open(ONBELLEK);
  const eski = await c.match(req, { ignoreVary: true });
  const yeni = fetch(req).then((res) => {
    if ((res.ok && !res.redirected) || res.type === 'opaque') c.put(req, res.clone()).catch(() => {});
    return res;
  });
  if (eski) {
    e.waitUntil(yeni.catch(() => {}));
    return eski;
  }
  return yeni;
}

function cevrimdisiSayfa() {
  const html = `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Çevrimdışı · Biz İkimiz</title>
<style>
:root{color-scheme:light dark;--bg:#FBF4EE;--text:#3B1F2B;--muted:#7D6070;--accent:#C2375C;--ink:#FFFFFF}
@media (prefers-color-scheme:dark){:root{--bg:#1C1120;--text:#F7E9EF;--muted:#BBA2B2;--accent:#F08DA8;--ink:#2B0E1B}}
*{box-sizing:border-box}
body{margin:0;min-height:100dvh;display:grid;place-items:center;padding:24px;background:var(--bg);color:var(--text);
font-family:'Nunito',ui-rounded,'Segoe UI',system-ui,sans-serif;text-align:center}
main{max-width:340px;display:flex;flex-direction:column;align-items:center;gap:14px}
svg{width:64px;height:64px;color:var(--accent)}
h1{font-family:'Fraunces',Georgia,serif;font-size:1.6rem;margin:0}
p{margin:0;color:var(--muted);line-height:1.5}
button{min-height:48px;padding:0 24px;border:0;border-radius:999px;background:var(--accent);color:var(--ink);font:inherit;font-weight:700;cursor:pointer}
button:focus-visible{outline:3px solid var(--text);outline-offset:3px}
</style>
</head>
<body>
<main>
<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 20.7c-.27 0-.53-.09-.75-.27C6.6 16.6 3 13.5 3 9.45 3 6.68 5.13 4.5 7.8 4.5c1.68 0 3.2.83 4.2 2.15 1-1.32 2.52-2.15 4.2-2.15 2.67 0 4.8 2.18 4.8 4.95 0 4.05-3.6 7.15-8.25 10.98-.22.18-.48.27-.75.27z"/></svg>
<h1>Şu an çevrimdışısın</h1>
<p>Bu sayfa henüz bu cihaza kaydedilmedi. İnternet gelince kaldığın yerden devam edersin.</p>
<button type="button" onclick="location.reload()">Tekrar dene</button>
</main>
</body>
</html>`;
  return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

// ---------- Anlık bildirim ----------

/** Yükteki göreli adres → site içi mutlak adres (dışarıya çıkamaz). */
function hedefAdres(yol) {
  try {
    const u = new URL(String(yol || ''), KOK);
    if (u.href.startsWith(KOK)) return u.href;
  } catch { /* geçersiz adres */ }
  return KOK;
}

self.addEventListener('push', (e) => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch {
    d = { metin: e.data ? e.data.text() : '' };
  }
  const secenek = {
    body: String(d.metin || '').slice(0, 200),
    icon: new URL('assets/icons/icon-192.png', KOK).href,
    badge: new URL('assets/icons/rozet-96.png', KOK).href,
    lang: 'tr',
    data: { url: hedefAdres(d.url) },
  };
  if (d.tur) {
    secenek.tag = `biz-${String(d.tur).slice(0, 20)}`; // aynı türün yenisi eskisinin yerine geçer
    secenek.renotify = true;
  }
  e.waitUntil(self.registration.showNotification(String(d.baslik || 'Biz İkimiz').slice(0, 80), secenek));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const hedef = hedefAdres(e.notification.data?.url);
  e.waitUntil((async () => {
    const yol = (h) => {
      const u = new URL(h);
      return u.origin + u.pathname;
    };
    const pencereler = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const ayni = pencereler.find((c) => yol(c.url) === yol(hedef));
    if (ayni) return ayni.focus();
    const bizim = pencereler.find((c) => c.url.startsWith(KOK));
    if (bizim) {
      try {
        const odak = await bizim.focus();
        const gitti = await (odak || bizim).navigate(hedef);
        if (gitti) return gitti;
      } catch { /* denetlenmeyen pencere: yeni pencere aç */ }
    }
    return self.clients.openWindow(hedef);
  })());
});
