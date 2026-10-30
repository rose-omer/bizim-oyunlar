# Bizim Oyunlar — Modül sözleşmesi

Modüller arası tek doğru kaynak. Her ajan yalnız kendi dosyalarına yazar.
API değişikliği gerekirse kodu değiştirmez; raporunda önerir.

## 1. Ürün
- İki sevgilinin birlikte oynadığı oyun sitesi. Ana sayfa = "Odamız" (lobi).
- Bir kişi oda kurar, davet linkini gönderir. İkisi de lobide oyunu seçer ve oynar.
- Oda kalıcıdır: link bir kez gönderilir; tarayıcı odayı hatırlar.
- Statik site. Build yok. Gerçek zamanlı iletişim ve veri: Supabase (ücretsiz plan).
- Supabase ayarı yoksa ya da URL'de `?yerel=1` varsa "yerel mod": aynı tarayıcının sekmeleri
  BroadcastChannel ile konuşur. Geliştirme ve test bu modla yapılır.
- Arayüz dili Türkçe. Telefon öncelikli; masaüstünde de tam çalışır. Yatay kaydırma yok.

## 2. Oyunlar (v1)
| id | Ad | Kişi | Özet |
|---|---|---|---|
| `yapboz` | Yapboz | 1–2 | Fotoğraf yükle, 100/200/500/1000 parça, birlikte aynı anda çöz. |
| `tanis` | Beni Ne Kadar Tanıyorsun? | 2 | Biri kendini cevaplar, diğeri tahmin eder; sırayla. |
| `aynikafa` | Aynı Kafa | 2 | "Bu mu, o mu?" ikiniz aynı anda seçersiniz; uyum yüzdesi. |
| `dogruluk` | Doğruluk mu Cesaret mi | 2 | Sırayla kart; tatlı / eğlenceli / cesur seviyeleri. |
| `hafiza` | Hafıza Kartları | 1–2 | Sırayla kart çevir, eşleri bul; puan. |
| `ciz` | Çiz Bakalım | 1–2 | Ortak tuval ya da çiz-tahmin et. |

Kayıt: `js/core/games.js` → `GAMES` dizisi (koordinatör yazdı).

## 3. Klasörler ve sahipler
| Yol | Sahip |
|---|---|
| `js/core/room.js`, `identity.js`, `storage.js`, `db.js`, `js/config.js`, `supabase/schema.sql`, `.github/workflows/keepalive.yml`, `tests/core-*.test.mjs`, `dev/room-test.html` | Çekirdek ajanı |
| `index.html`, `css/base.css`, `js/hub.js`, `js/core/ui.js`, `js/core/sound.js`, `assets/*` | Ana sayfa ajanı |
| `games/yapboz/grid.js`, `model.js`, `board.js`, `tests/yapboz-*.test.mjs` | Yapboz motor ajanı |
| `games/yapboz/index.html`, `app.js`, `image.js`, `store.js`, `style.css` | Yapboz sayfa ajanı |
| `games/tanis/*`, `games/aynikafa/*`, `games/dogruluk/*`, `games/_soru/*`, `tests/soru-*.test.mjs` | Soru oyunları ajanı |
| `games/hafiza/*`, `games/ciz/*`, `tests/hafiza-*.test.mjs`, `tests/ciz-*.test.mjs` | Hafıza+Çiz ajanı |
| `package.json`, `dev/serve.mjs`, `js/core/games.js`, `vendor/supabase.js`, `SOZLESME.md`, `README.md` | Koordinatör |

## 4. Genel kurallar
- Tüm JS dosyaları ES modülü. Build yok, npm paketi yok. Tek dış kod: `vendor/supabase.js` (supabase-js 2.118.0 UMD, `globalThis.supabase`).
- **Tüm yollar göreli.** Site bir alt klasörde de çalışmalı (ör. `kullanici.github.io/repo/`).
  Başka modüle göre adres üretmek için `new URL('...', import.meta.url)` kullan.
- Testler: `node --test tests/` (Node 25). Testler DOM'a dokunmaz. Saf mantığı ayrı modülde tut ve test et.
- Yerel sunucu: `node dev/serve.mjs` → http://localhost:5173 (koordinatör çalıştırır).
- Alt ajanlar tarayıcı aracı kullanmaz. Tarayıcı testini koordinatör yapar.
- Ağ bütçesi: istemci başına en fazla 10 mesaj/sn (sürekli). Tek mesaj < 100 KB.
  Sürükleme ve çizim verisi 100 ms'de bir toplu gönderilir; alıcı yumuşatır.
- Font: Google Fonts `@import` ile `css/base.css` içinde. Başka CDN yok.
- Erişilebilirlik: gerçek `<button>`, görünür odak, `aria-label`, en az 44 px dokunma alanı.
- Kullanıcıya görünen metin Türkçe, sıcak ve kısa. Açık saçık içerik yok (en fazla PG-13).

## 5. js/core/identity.js (Çekirdek)
```js
export function me()                  // -> { clientId, name }  clientId kalıcı (localStorage 'bizim.client')
export function setName(name)
export function currentRoom()         // -> roomId | null  (localStorage 'bizim.room')
export function setRoom(roomId)
export function clearRoom()
export function newRoomId()           // -> 10 karakter [a-z2-9], karışan harf yok (l, o, 0, 1)
export function inviteUrl(roomId)     // -> mutlak URL: <site kökü>/#oda=<roomId>
export function lobbyUrl()            // -> <site kökü>/
export function gameUrl(gameId, { roomId, host }) // -> <site kökü>/games/<gameId>/?oda=..&host=..
export function readGameParams()      // oyun sayfasında: -> { roomId|null, hostId|null, isHost, solo }
//  solo = roomId yok. isHost = solo || !hostId || hostId === me().clientId
export function isLocalMode()         // config boş ya da URL'de ?yerel=1 (yerel mod, sayfalar arası geçişte korunur)
```
- Site kökü: `new URL('../../', import.meta.url)`. Yerel modda ürettiği URL'lere `yerel=1` ekler.

## 6. js/core/room.js (Çekirdek)
```js
export async function joinRoom({ roomId, ns })  // -> Room. roomId null ise "yalnız oda" (no-op) döner.
// Room:
room.me                    // { clientId, name }
room.backend               // 'supabase' | 'local' | 'solo'
room.send(msg)             // aynı ns'deki karşı tarafa. msg JSON nesnesi. Bağlı değilse false.
room.sendAll(msg)          // ns '*': karşı tarafın hangi sayfada olursa olsun alması için
room.on('message', (msg, from) => {})  // aynı ns ve '*' mesajları; from = { clientId, name }. Kendi mesajın gelmez.
room.on('presence', (partner) => {})   // partner = { clientId, name, page, host, gorunur } | null. Abone olunca hemen bir kez çağrılır.
room.on('status', (status, detail) => {}) // 'connecting' | 'online' | 'offline' | 'error'; detail Türkçe
room.partner()             // şimdiki partner | null
room.leave()
// on(...) bir "abonelikten çık" fonksiyonu döner.
```
- Supabase: kanal `oda:<roomId>`, broadcast olayı `m`, yük `{ ns, from, m }`. Presence anahtarı clientId,
  yük `{ clientId, name, page: ns, host }` (host = sayfanın ev sahibi id'si; lobide null).
  Partner = kendinden farklı ilk clientId. Lobiden partnerin oyununa katılırken `host: p.host || p.clientId`.
- Presence yükünde `gorunur: document.visibilityState === 'visible'`. `visibilitychange`'de Supabase yeniden
  `track` eder, yerel mod hemen "buradayım" yayar. Eski istemcide alan yoksa `true` sayılır.
  `partnerGoruyor(partner, page?)` (room.js): partner o sayfada (page yoksa herhangi bir sayfada) ve sekmesi önde.
  Anlık bildirim (`bildir`) yalnız bu `false` iken gönderilir; uygulama içi görünüm zaten gider.
- Rol çakışması: küçük clientId ev sahibidir. İki ev sahibi → büyük olan misafir olarak yeniden yüklenir.
  İki misafir → küçük olan ev sahibi olarak yeniden yüklenir. Misafir `state`'i yalnız ev sahibinden kabul eder.
- Yerel: BroadcastChannel `bizim:<roomId>`; presence 3 sn'de bir "buradayım", 8 sn sessizlik = yok.
- Bağlantı kopunca kendisi yeniden bağlanır; sekme arka plandan dönünce durumu tazeler.

## 7. js/core/storage.js ve js/core/db.js (Çekirdek)
```js
// storage.js
export async function uploadPhoto(blob, roomId) // -> url (string). Supabase: herkese açık 'photos' kovası,
                                                //    yol `<roomId>/<uuid>.jpg`. Yerel: IndexedDB, 'local:<id>'.
export async function loadPhoto(url)            // -> Blob
// db.js  (oda kimliği = çift kimliği)
export async function logGame(roomId, gameId, result) // sessizce dener; hata fırlatmaz. result küçük JSON.
export async function roomStats(roomId)         // -> [{ game, played, last_at }]
export async function ping()                    // -> true/false
```
- Yerel modda db.js localStorage kullanır.
- Oyun bitince `logGame` yalnız ev sahibi (isHost) çağırır.

## 8. js/config.js (Çekirdek)
```js
export const SUPABASE_URL = '';       // örn. https://abcd.supabase.co
export const SUPABASE_ANON_KEY = '';  // anon / publishable anahtar (gizli değildir)
export const PHOTO_BUCKET = 'photos';
```

## 9. Ortak arayüz: js/core/ui.js, js/core/sound.js, css/base.css (Ana sayfa)
```js
// ui.js
export function mountShell({ title, room })   // <header id="shell"> doldurur: "← Odamız" (lobbyUrl), başlık,
//   partner çipi (nokta + ad + "çevrimiçi" / "çevrimdışı" / "<oyun adı>'nda"), ses aç/kapa, yerel modda "Yerel" çipi.
//   '*' gelen { t:'go', game, host } mesajında toast: "<ad> <oyun>'u açtı" + [Git] düğmesi (gameUrl).
export function toast(text, { action, ms } = {}) // action = { label, onClick }
export function celebrate({ title, lines = [], buttons = [] }) // tam ekran bitiş: kalp animasyonu.
//   buttons = [{ label, onClick, primary }]. -> close()
export function waitForPartner(room, { text, allowSolo = false }) // -> Promise<'partner' | 'solo'>
//   Partner bu sayfada değilse kaplama gösterir: metin, davet linki paylaş/kopyala, (allowSolo) "Tek başıma".
//   Partner aynı sayfaya (page === room ns) gelince çözülür. roomId yoksa: allowSolo ise hemen 'solo'.
export function confirmDialog(text, { ok = 'Evet', cancel = 'Vazgeç' } = {}) // -> Promise<boolean>
export async function shareInvite(roomId)      // navigator.share ya da panoya kopyala + toast

// sound.js  (WebAudio ile sentez, dosya yok)
export function sfx(name)   // 'tap' | 'snap' | 'flip' | 'match' | 'wrong' | 'win' | 'pop' | 'tick'
export function setMuted(bool); export function isMuted()
```
`css/base.css` sağlar (oyunlar bunları kullanır, renk sabit yazmaz):
- Değişkenler: `--bg --surface --surface-2 --line --text --muted --accent --accent-ink --accent-soft --plum --good --bad --radius --radius-lg --shadow --font-display --font-body --safe-top --safe-bottom`
- Sınıflar: `.btn` `.btn.primary` `.btn.ghost` `.btn.small` `.card` `.chip` `.input` `.seg` (içinde `button[aria-pressed]`)
  `.stack` (dikey boşluklu) `.row` (yatay, sarar) `.screen` (tam yükseklik bölüm) `.center` `.title` `.subtitle` `.muted` `.hidden`
- `<header id="shell">` üstte sabit; `<main id="app">` kalan alan. Koyu/açık tema: `prefers-color-scheme`.

## 10. Oyun sayfası şablonu
```html
<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Yapboz · Bizim Oyunlar</title>
  <link rel="stylesheet" href="../../css/base.css">
  <link rel="stylesheet" href="./style.css">
</head>
<body>
  <header id="shell"></header>
  <main id="app"></main>
  <script type="module" src="./app.js"></script>
</body>
</html>
```
```js
import { joinRoom } from '../../js/core/room.js';
import { readGameParams } from '../../js/core/identity.js';
import { mountShell, waitForPartner } from '../../js/core/ui.js';
const { roomId, isHost } = readGameParams();
const room = await joinRoom({ roomId, ns: 'yapboz' });   // ns = oyun id
mountShell({ title: 'Yapboz', room });
```
- Ev sahibi (isHost) oyunun otoritesidir: karıştırma, soru seçimi, sıra, puan, çakışma kararı.
- Misafir sayfaya girince `{ t:'join' }` gönderir; ev sahibi tam durumu (`{ t:'state', ... }`) yollar.
  Partner presence yeniden görünürse misafir tekrar `join` gönderir. Böylece yenileme ve kopma toparlanır.
- Ev sahibi yokken misafir oynamaz; "Sevgilin dönünce devam" gösterilir.
- Rastgelelik tohumlu (`seed`) olur; ev sahibi seed'i gönderir.
- Bitişte: `celebrate(...)`, `sfx('win')`, ev sahibi `logGame(...)`. "Tekrar" ve "Odamıza dön" düğmeleri.

## 11. Lobi akışı (Ana sayfa)
- URL'de `#oda=<id>` varsa: odayı kaydet (`setRoom`), adres çubuğundan hash'i temizle.
- Ad yoksa önce ad sor. Oda yoksa: "Odamızı kur" → `newRoomId` → davet linki ekranı.
- Lobi: iki kişinin durumu, oyun kartları (`GAMES`), "Birlikte oynadıklarımız" (`roomStats`).
- Kart seçilince: `room.sendAll({ t:'go', game, host: me().clientId })`, sonra `gameUrl(game, { roomId, host })`'a git.
- Lobideki partner `go` alınca 1,5 sn'lik bildirimle aynı oyuna otomatik geçer.
- Odasız da tek kişilik oyunlar (`players` '1–2') açılabilir: `gameUrl(game, {})` (solo).

## 12. Yapboz (Motor ↔ Sayfa)
Koordinatlar: dünya birimi = normalize fotoğraf pikseli (`imgW × imgH`). Çerçeve `[0,0]–[imgW,imgH]`.
`pw = imgW/cols`, `ph = imgH/rows`. Parça `id = row*cols + col`.
Grup ofseti `(x, y)`: parçanın sol-üstü = `(x + col*pw, y + row*ph)`. Hizalı ⇔ ofsetler eşit; doğru yerde ⇔ `(0,0)`.
Grup id = gruptaki en küçük parça id. Bitti ⇔ tek grup.

`BoardState = { v:1, groups:[{ id, x, y, pieces:number[] }] }` (dizi sırası = z sırası, alttan üste; x,y 1 ondalık).

```js
// grid.js
export const PIECE_COUNTS = [100, 200, 500, 1000];
export function computeGrid(target, imgW, imgH) // -> { cols, rows, count }; parça kareye yakın; 4:3 & 1000 -> ~37x27
export function mulberry32(seed)               // -> () => [0,1)
export function generateEdges(cols, rows, seed) // -> [{ id, col, row, top, right, bottom, left }]; 0 düz, 1 çıkıntı, -1 girinti
export function tabMargin(pw, ph)
export function piecePathD(piece, pw, ph)       // SVG path d, yerel koordinat; komşu kenarlar birebir aynı eğri

// board.js
const board = new Board(canvas, { image, cols, rows, seed, state, onAction, onProgress, onSnap, onComplete });
board.getState(); board.setState(state); board.applyRemote(action); board.cancelLocalDrag();
board.isDragging(); board.draggingGroup(); board.setPeerCursor({ x, y, name } | null); board.clearPeerHolds();
board.hash(); board.setEdgeOnly(bool); board.setGhost(bool); board.zoomBy(f); board.fitView();
board.shuffleLoose(); board.resize(); board.destroy();
// onProgress({ total, groups, percent }); percent = round(100*(total-groups)/(total-1))
```
Eylemler (`onAction` yayar, `applyRemote` kabul eder):
```js
{ type:'grab', g }
{ type:'move', g, x, y }            // kare başına en fazla bir; sayfa 100 ms'ye kısar; applyRemote yumuşatır (~100 ms)
{ type:'drop', g, x, y, pieces }    // yapışma sonrası nihai grup. Alıcı: pieces'tan herhangi birini içeren TÜM grupları
                                    //  tek grupta birleştirir (id = en küçük), ofset (x,y), tutmayı kaldırır.
{ type:'scatter', moves:[{ g, x, y }] }
{ type:'cursor', x, y }             // en fazla 100 ms'de bir; applyRemote kullanmaz (sayfa setPeerCursor çağırır)
```
- Yapışma toleransı `0.22*min(pw,ph)`. Komşusu olan ve ofseti yakın grupla birleş; `(0,0)`'a yakınsa otur.
- `applyRemote(grab)`: grup karşı tarafta; yerelde tutulamaz, yerel yapışma ona bağlanmaz; pembe çerçeve.
- Birleşen gruplardan biri yerelde sürükleniyorsa önce `cancelLocalDrag()`.

Yapboz mesajları (`room.send`):
| Yön | Mesaj |
|---|---|
| misafir → ev sahibi | `{ t:'join' }` |
| ev sahibi → misafir | `{ t:'hello', photo, cols, rows, seed, count, note, elapsed }` (photo = uploadPhoto URL), ardından `{ t:'state', state }` |
| iki yön | `{ t:'act', a }`, `{ t:'cur', x, y }` |
| ev sahibi → misafir | `{ t:'deny', g }`; her 5 sn `{ t:'hash', h, elapsed }` |
| misafir → ev sahibi | `{ t:'need' }` → `{ t:'state', state }` |
| ev sahibi → misafir | `{ t:'setup' }` ev sahibi yeni yapboz kuruyor |

Çakışma: ev sahibi kazanır. Ev sahibi, kendi sürüklediği grup için `grab` alırsa uygulamaz, `deny` yollar.
Misafir, kendi sürüklediği grup için `grab` alırsa `cancelLocalDrag()` sonra uygular; `deny` alırsa `cancelLocalDrag()`.
Misafir `hash` farkı görürse (sürüklemiyor ve son 1 sn eylem yok) `need` yollar.

## 13. Supabase (Çekirdek: supabase/schema.sql)
- Tablo `game_log(id, room, game, result jsonb, created_at)`; RLS açık, politika yok (doğrudan erişim kapalı).
- RPC (security definer, `anon`'a execute): `log_game(p_room, p_game, p_result)`, `room_stats(p_room)`, `ping()`.
- Depolama: herkese açık `photos` kovası; 5 MB sınır; yalnız jpeg/webp/png; `anon` yalnız INSERT (listeleme yok).
- Ücretsiz proje 7 gün hareketsiz kalırsa durur: `keepalive.yml` 3 günde bir `ping` çağırır.

---

# v2 — "Biz İkimiz": sevgili uygulaması

v2 bölümleri v1'in üstüne gelir. Çatışmada v2 geçerli.

## 14. Ürün ve kararlar
- Ad: **Biz İkimiz** (uygulama adı). Site aynı adreste kalır: https://rose-omer.github.io/bizim-oyunlar/
- Ücretli çift uygulamalarının (Between, Paired, Lovewick, Agapé) özellikleri + oyunlar, ücretsiz.
- Sunucu = **Supabase** (veritabanı, depolama, realtime, Edge Functions, pg_cron). Bu bilgisayar sunucu değildir.
- Mobil = **PWA** (iPhone + Android; ana ekrana kurulur; anlık bildirim) + **Android APK** (Capacitor; GitHub Actions derler; GitHub Releases'ta).
- Her şey oda (çift) koduyla korunur. Oda kodu 10 karakter, tahmin edilemez. Giriş/hesap yok.
- Alt sekmeler: **Biz** (ana sayfa) · **Sohbet** · **Anılar** · **Günler** · **Daha**. Oyunlar ana sayfada.

## 15. v2 klasörler ve sahipler
Her ajan yalnız kendi dosyalarına yazar. Başkasının dosyasında değişiklik gerekirse raporunda önerir.

| Yol | Sahip |
|---|---|
| `js/core/veri.js`, `profil.js`, `gunler.js`, `sayfa.js`, `games.js`, `identity.js`, `SOZLESME.md`, `README.md`, `tests/core-veri*`, `tests/core-gunler*` | Koordinatör (Günler ajanı gunler.js'e fonksiyon EKLEYEBİLİR, var olanı değiştirmez) |
| `index.html`, `js/hub.js`, `css/base.css`, `js/core/ui.js`, `js/core/sound.js`, `assets/*` (ikonlar hariç), `tests/hub-*` | Ana Sayfa ajanı |
| `sayfalar/ayarlar/*`, `sayfalar/daha/*`, `js/core/kilit.js`, `tests/ayar-*` | Ayarlar ajanı |
| `sayfalar/gunler/*`, `tests/gunler-*` | Günler ajanı |
| `sayfalar/sohbet/*`, `tests/sohbet-*` | Sohbet ajanı |
| `sayfalar/anilar/*`, `sayfalar/mektup/*`, `js/core/foto.js`, `tests/ani-*`, `tests/mektup-*` | Anılar ajanı |
| `sayfalar/listeler/*`, `sayfalar/randevu/*`, `tests/liste-*`, `tests/randevu-*` | Listeler ajanı |
| `sayfalar/gunun-sorusu/*`, `sayfalar/sevgi-dili/*`, `tests/gs-*`, `tests/sevgidili-*` | Günün Sorusu ajanı |
| `games/kimdaha/*`, `games/hicyaptin/*`, `games/derin/*`, `tests/soru2-*` (`games/_soru/*` yalnız okunur) | Soru oyunları ajanı |
| `games/dama/*`, `games/tavla/*`, `tests/dama-*`, `tests/tavla-*` | Masa oyunları ajanı |
| `games/dorttas/*`, `games/amiral/*`, `sayfalar/izle/*`, `tests/dorttas-*`, `tests/amiral-*`, `tests/izle-*` | Hızlı oyunlar + İzle ajanı |
| `supabase/schema.sql` (yalnız "5." ve sonrası bölümler), `supabase/functions/*`, `js/core/bildirim.js`, `js/core/pwa.js`, `sw.js`, `manifest.webmanifest`, `assets/icons/*`, `.github/workflows/keepalive.yml`, `tests/sunucu-*` | Sunucu ajanı |
| `mobil/*`, `.github/workflows/android.yml`, `js/core/mobil.js`, `tests/mobil-*` | Mobil ajanı |

## 16. js/core/veri.js — kalıcı çift verisi (Koordinatör, hazır ve testli)
Belge: `{ id, data, author, deleted, created_at, updated_at }`. `(oda, tür, id)` tekil; son yazan kazanır.
Tür: `^[a-z]{2,20}$`. id: `^[A-Za-z0-9_-]{1,64}$`. `data` düz nesne, en çok 32 KB (JSON, UTF-8).
Hız sınırı: oda başına saatte 2000 yazma. Döngüde toplu yazma yapma.

```js
import { openCollection } from '../../js/core/veri.js';
const col = await openCollection(room, 'liste');                    // room = bootPage/joinRoom sonucu
const col2 = await openCollection(room, 'mesaj', { recent: 100 });  // uzun türler: son N, loadOlder ile geri
col.all()                 // silinmemiş belgeler, created_at'e göre ESKİDEN YENİYE
col.get(id)               // belge | null
await col.put(data, id?)  // ekle/değiştir (id yoksa uuid). -> id. Hemen yerelde görünür (iyimser).
await col.patch(id, kismi)// mevcut data ile birleştirip yazar
await col.remove(id)
col.on('change', (docs) => {})  // her değişimde silinmemiş belgelerin tamamı. -> abonelikten çık
col.on('error', (err) => {})    // err.message Türkçe, kullanıcıya gösterilebilir (toast)
await col.refresh(); await col.loadOlder(50); col.hasOlder(); col.close();
```
- Önbellek: açılışta localStorage'dan anında gelir; sonra sunucudan tamamlanır. Çevrimdışı yazma giden kutusunda bekler, bağlantı gelince gider.
- Canlı: yazan taraf `room.sendAll({ t:'veri', kind, doc })` yayar; karşı tarafın aynı türdeki koleksiyonları güncellenir. Ayrıca 60 sn'de bir ve sekme öne gelince tazeler.
- `put` reddedilirse (çok uzun / geçersiz) Promise hata fırlatır ve yazma geri alınır. Ağ hatasında hata fırlatmaz; `error` olayı gelir, yazma bekler.
- Düşük seviye (gerekirse): `putDoc, removeDoc, listDocs, pageDocs` (roomId ile).
- Yerel modda (`?yerel=1`) veri localStorage'da; aynı tarayıcının sekmeleri paylaşır.
- Kendi yazdığın belge için `change` hemen (iyimser) ve sunucu onayından sonra bir kez daha gelir. Ekranı `docs`'tan baştan çiz (idempotent).

## 17. Veri türleri (data alanları)
Tarih: gün `'YYYY-MM-DD'`, an ISO (`new Date().toISOString()`). `author` = yazanın clientId'si (otomatik).

| Tür | id | data | Sahibi |
|---|---|---|---|
| `kisi` | clientId | `{ ad, foto?, dogum?: gün, renk? }` | profil.js |
| `cift` | `'cift'` | `{ baslangic?: gün, bulusma?: ISO, bulusmaNotu?, kapak?: url, ad? }` | profil.js |
| `gun` | uuid | `{ baslik, tarih: gün, tekrar: 'yil'/'ay'/'yok', tur: 'yildonumu'/'dogumgunu'/'ozel'/'plan', emoji, not?, hatirlat?: [0,1,7] }` | Günler |
| `mesaj` | uuid | `{ metin?, foto?: url, yanit?: id, tepki?: { [clientId]: emoji }, duzenlendi?: ISO }` | Sohbet |
| `okundu` | clientId | `{ son: mesajId, at: ISO }` | Sohbet |
| `ani` | uuid | `{ baslik, tarih: gün, yer?, not?, fotolar: [url], etiketler?: [], begeni?: { [clientId]: true } }` | Anılar |
| `mektup` | uuid | `{ baslik, metin, kime: clientId, acilis?: ISO, acildi?: ISO, zarf?: renk }` | Anılar |
| `liste` | uuid | `{ liste: 'yapilacak'/'izlenecek'/'gidilecek'/'hediye'/'alisveris', metin, not?, yapildi?: ISO, yapan?: clientId, kimin?: clientId }` | Listeler |
| `randevu` | uuid | `{ fikirId?, metin, plan?: gün, yapildi?: ISO }` | Listeler |
| `gs` | `<gunNo>-<clientId>` | `{ gun: number, cevap: string }` | Günün Sorusu |
| `sevgidili` | clientId | `{ puanlar: { soz, zaman, hediye, hizmet, dokunma }, at: ISO }` | Günün Sorusu |
| `ruh` | clientId | `{ emoji, not?, at: ISO }` (son ruh hâli) | Ana Sayfa |
| `dokunus` | uuid | `{ tur: 'kalp'/'opucuk'/'sarilma'/'ozledim'/'dusunuyorum', kime: clientId, at: ISO }` | Ana Sayfa |
| `konum` | clientId | `{ lat, lng (2 ondalık), sehir?, at: ISO }` (isteğe bağlı, varsayılan kapalı) | Ayarlar |
| `oyunkayit` | oyun id | oyuna özel kayıtlı durum (Dama/Tavla "kaldığın yerden") | Masa oyunları |

Yeni tür gerekirse raporunda bildir; çakışmayan bir ad seç.

## 18. js/core/profil.js ve js/core/gunler.js (Koordinatör, hazır)
```js
import { openProfil } from '../../js/core/profil.js';
const profil = await openProfil(room);
profil.ben()      // { clientId, ad, foto?, dogum?, renk? }
profil.partner()  // aynı biçim | null (henüz hiç görünmediyse)
profil.cift()     // { baslangic?, bulusma?, bulusmaNotu?, kapak?, ad? }
await profil.setBen({ foto }); await profil.setCift({ baslangic: '2025-02-14' });
profil.on('change', fn); profil.close();
```
```js
// gunler.js (saf; Node'da test edilir)
parseDay(s) toDay(date) daysBetween(a,b) addDays(day,n) daysInMonth(y,m)
daysTogether(baslangic, bugun)   // başlangıç günü = 1. gün
durationParts(baslangic, bugun)  // { years, months, days }
nextOccurrence(gun, tekrar, from) occurrenceIndex(gun, tekrar, olus)
upcoming(gunBelgeleri, { today, limit, within })  // [{ id, baslik, emoji, tur, tekrar, tarih, date, daysLeft, kacinci }]
milestones(baslangic, { today, limit, monthly })   // [{ date, baslik, tur:'gun'|'yil'|'ay', n, daysLeft }]
todaysEvents(gunBelgeleri, baslangic, bugun)
countdown(hedefIso, simdi)  // { past, total, days, hours, minutes, seconds } | null
leftText(daysLeft)          // 'Bugün' | 'Yarın' | 'N gün kaldı'
```

## 19. Uygulama sayfası şablonu (sayfalar/<ad>/)
`sayfalar/<ad>/index.html`:
```html
<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Sohbet · Biz İkimiz</title>
  <link rel="stylesheet" href="../../css/base.css">
  <link rel="stylesheet" href="./style.css">
</head>
<body class="sayfa">
  <header id="shell"></header>
  <main id="app"></main>
  <script type="module" src="./app.js"></script>
</body>
</html>
```
`app.js`:
```js
import { bootPage } from '../../js/core/sayfa.js';
import { openCollection } from '../../js/core/veri.js';
const { room, roomId, me } = await bootPage({ ns: 'sohbet', title: 'Sohbet', tab: 'sohbet' });
```
- `bootPage`: oda yoksa ana sayfaya gider; odaya katılır; `mountShell` + `mountTabBar(tab)`. ns = `SAYFALAR` id'si.
  Sekmesi olmayan sayfa (`ayarlar`, `mektup`, ...) `tab: 'daha'` verir.
- Sayfa adresi üretmek: `pageUrl('sayfalar/mektup/', { id })` (identity.js; yerel modu korur).
- Kayıtlar: `js/core/games.js` → `GAMES` (oyunlar), `SAYFALAR` (özellik sayfaları), `SEKMELER`, `sayfaById`.
- PWA etiketleri (manifest, apple-touch-icon) tüm HTML'lere sonda koordinatör ekler. Siz eklemeyin.
- Ortak arayüz: `ui.js` (h, icon, toast, confirmDialog, celebrate, formatDay, pairEl, knownPartner), `sound.js`.
  Yeni ortak bileşen gerekirse kendi klasörünüzde yazın.
- Oyun sayfaları v1 §10 şablonunu ve `_soru` motorunu izler.

## 20. Ortak servis modülleri (yer tutucular hazır; sahipleri doldurur)
```js
// js/core/bildirim.js (Sunucu)
bildirimDestegi()            // 'var' | 'ana-ekran-gerek' | 'yok'
await bildirimDurumu()       // 'acik' | 'kapali' | 'engelli' | 'yok'
await bildirimAc(roomId)     // kullanıcı tıklamasıyla; -> boolean
await bildirimKapat(roomId)
await bildir(roomId, { tur, baslik, metin, url })  // partnerin cihazlarına push; hata fırlatmaz
//   tur: 'dokunus'|'mesaj'|'mektup'|'ani'|'gun'|'oyun'|'soru'|'liste'|'izle'. url site köküne göre göreli ('sayfalar/sohbet/').
// js/core/pwa.js (Sunucu)
registerPwa(); kurulumDurumu()  // { durum: 'kurulu'|'kurulabilir'|'ios-elle'|'yok', kur() }
// js/core/kilit.js (Ayarlar)
await kilitKontrol(); await kilitAyarla(pin | null); kilitVarMi()
// js/core/mobil.js (Mobil)
isNative(); titret(desen); await yerelHatirlaticilar([{ id, baslik, metin, zaman: ISO }])
// js/core/foto.js (Anılar) — fotoğraf seç, küçült, yükle
await fotoSecVeYukle(roomId, { coklu }) // -> [url]; games/yapboz/image.js normalizeImage + storage.js uploadPhoto kullanır
```
`ui.js startAppServices()` (mountShell içinde) kilit ve PWA'yı başlatır.

## 21. Doğrulama (her ajan)
1. Saf mantık ayrı modülde; `tests/<önek>-*.test.mjs` ile test. Çalıştır: `node --test --test-timeout=15000 tests/<dosyalarınız>`.
2. `node --check` ile her JS dosyası.
3. **Tarayıcı duman testi** (zorunlu, arayüzü olan her parça): headless Edge + yerel mod.
   Sunucu açık: http://localhost:5173 (kapatmayın, yeni sunucu açmayın). Yardımcı:
   ```js
   import { ikiKisi } from 'file:///C:/Users/koseo/AppData/Local/Temp/pw/iki.mjs';
   const t = await ikiKisi('sayfalar/sohbet/'); // t.a = Ömer, t.b = Gül; aynı oda 'testpaka23'; telefon boyu 390x844
   // t.a / t.b Playwright Page. t.hatalar = konsol hataları ve yakalanmayan istisnalar.
   await t.kapat();
   ```
   Betikleri kendi geçici klasörünüze yazın (`C:/Users/koseo/AppData/Local/Temp/pw/<ajan>/`), proje klasörüne değil.
   `C:/Users/koseo/AppData/Local/Temp/pw` içinden `node <ajan>/<betik>.mjs` ile çalıştırın (playwright-core orada).
   İki kişilik akışı uçtan uca deneyin; ekran görüntüsü alıp Read ile bakın (taşma, kesilme, okunaksızlık, koyu tema).
   Hedef: `t.hatalar` boş (bilinen favicon/ikon 404'ü hariç), yatay kaydırma yok (`scrollWidth <= innerWidth`).
4. Claude tarayıcı paneli araçlarını (`mcp__Claude_Browser__*`) KULLANMAYIN. Sunucuyu kapatmayın.
5. git commit YAPMAYIN. Koordinatör toplar.

## 22. Görsel dil
- Sıcak, romantik, sade, "premium" his. `css/base.css` değişkenleri; sabit renk yok (kendi `style.css`'inizde de değişken).
- Arayüz yazmadan önce `ui-ux-pro-max` ve `impeccable` skill'lerini yükleyin (Skill aracı); mobil uygulama kalitesinde tasarlayın.
- Telefon öncelikli (390 px). Dokunma alanı ≥ 44 px. Koyu tema çalışmalı. Hareketler kısa ve `prefers-reduced-motion`'a uyar.
- Boş durumlar sevimli ve yol gösterici ("Henüz anı yok. İlkini ekleyelim mi?").
- Metinler Türkçe, sıcak, kısa. Emoji ölçülü. Açık saçık içerik yok.

## 23. v2 birleştirme notları (ajan raporlarından)
- `author` = **son yazan**. İlk yazanı gösterecek sayfa, veriye kendi alanını koyar:
  `mesaj.kimden`, `ani.ekleyen`, `mektup.kimden`, `liste.ekleyen` (clientId).
- Ek alanlar: `mesaj.en`, `mesaj.boy` (fotoğraf boyutu); `liste.alacak` (hediye "ben alacağım", sahibine gizli); `kisi.renk` = `#RRGGBB`.
- `oyunkayit.data` = oyunun misafirin görebileceği durumu (`view`; tavlada zar tohumu yok) `{ v, kind, seq, at, players, ... }`; `seq` büyük olan yenidir; oyun bitince belge silinir.
- gunler.js ekleri: `monthGrid(y, m)`, `milestonesBetween(baslangic, from, to, { monthly })`.
  `supabase/functions/_shared/gunler.js` bunun birebir kopyasıdır (test eşitliği denetler).
- `sayfalar/gunun-sorusu/kart.js`: `mountGununSorusuKart(el, { room, partnerAd? })` → kapatma fonksiyonu.
- kilit.js ekleri: `pinDogruMu(pin)`, `cihazdanUnut(roomId)`. mobil.js eki: `mobilBaslat()` (startAppServices çağırır).
- ui.js ekleri: `avatarEl`, `genitive`, `fotoSrc`, `removeTabBar`, `startAppServices` (tema, kilit, PWA, mobil, bildirim tazeleme).
- `js/core/erken.js`: her sayfanın `<head>`'inde klasik betik. Temayı ilk boyamadan uygular; PIN varsa `html.kilit-bekle` ile içeriği kilit kararına dek gizler.
- Her HTML `<head>`'i: theme-color, favicon, manifest, apple-touch-icon, apple/mobile meta, erken.js.
- `games/hafiza/sync.js`, `rng.js`, `ekran.js` artık ortak (Çiz, Dört Taş, Amiral, Dama, Tavla). API'leri sabit kalmalı.
- Yerel duman testi: `iki.mjs` service worker'ı varsayılan engeller; PWA testi için `{ sw: true }`.
