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
- Font: Baloo 2 ve Quicksand sitede: `assets/fonts/` (alt küme WOFF2, OFL), `css/base.css` `@font-face`, `font-display: swap`. Font için dış adres yok; CSP `font-src 'self'`. Temaların yazı tipleri `assets/fonts/temalar/`.
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
room.setAlan(metin | null) // sayfa içi yer (ör. Yavrumuz odası) presence ile yayılır; null siler
room.leave()
// on(...) bir "abonelikten çık" fonksiyonu döner.
```
- Supabase: kanal `oda:<roomId>`, broadcast olayı `m`, yük `{ ns, from, m }`. Presence anahtarı clientId,
  yük `{ clientId, name, page: ns, host }` (host = sayfanın ev sahibi id'si; lobide null).
  Partner = kendinden farklı ilk clientId. Lobiden partnerin oyununa katılırken `host: p.host || p.clientId`.
- Presence yükünde `gorunur: document.visibilityState === 'visible'`. `visibilitychange`'de Supabase yeniden
  `track` eder, yerel mod hemen "buradayım" yayar. Eski istemcide alan yoksa `true` sayılır.
  `partnerGoruyor(partner, page?)` (room.js): partner o sayfada (page yoksa herhangi bir sayfada) ve sekmesi önde.
- İsteğe bağlı `alan` (≤ 40 karakter, `room.setAlan`): yükte ve partner nesnesinde yalnız doluysa bulunur (`alanAl`).
  Değişince Supabase yeniden `track` eder, yerel mod hemen "buradayım" yayar. Eski istemci alanı bilmez ve görmezden gelir;
  alanı olmayan partner için sayfa eski görünümü gösterir. Belgeye yazılmaz. Kullanan: Yavrumuz (bulunulan oda).
  Anlık bildirim (`bildir`) yalnız bu `false` iken gönderilir; uygulama içi görünüm zaten gider.
- Rol çakışması: küçük clientId ev sahibidir. İki ev sahibi → büyük olan misafir olarak yeniden yüklenir.
  İki misafir → küçük olan ev sahibi olarak yeniden yüklenir. Misafir `state`'i yalnız ev sahibinden kabul eder.
- Yerel: BroadcastChannel `bizim:<roomId>`; presence 3 sn'de bir "buradayım", 8 sn sessizlik = yok.
- Bağlantı kopunca kendisi yeniden bağlanır; sekme arka plandan dönünce durumu tazeler.

## 7. js/core/storage.js ve js/core/db.js (Çekirdek)
```js
// storage.js
export async function uploadPhoto(blob, roomId) // -> başvuru (string; belgeye yazılır). Yol `<roomId>/<uuid>.<uzantı>`. Yerel: 'local:<id>'.
export async function loadPhoto(url)            // -> Blob
export async function medyaAdresi(url)          // -> <img>/<audio> kaynağı | null (imzalı adres; ayrıntı §28)
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
- Depolama: `photos` kovası; 5 MB sınır; ayrıntı §28 (eski: herkese açık, `anon` INSERT).
- Ücretsiz proje 7 gün hareketsiz kalırsa durur: `keepalive.yml` 3 günde bir `ping` çağırır.
- `room_doc` silme veriyi korur: `doc_put` (`p_deleted`) yalnız `deleted`, `author`, `updated_at` yazar; `deleted = false` ile yazmak geri getirir.

---

# v2 — "Biz İkimiz": sevgili uygulaması

v2 bölümleri v1'in üstüne gelir. Çatışmada v2 geçerli.

## 14. Ürün ve kararlar
- Ad: **Biz İkimiz** (uygulama adı). Site aynı adreste kalır: https://rose-omer.github.io/bizim-oyunlar/
- Ücretli çift uygulamalarının (Between, Paired, Lovewick, Agapé) özellikleri + oyunlar, ücretsiz.
- Sunucu = **Supabase** (veritabanı, depolama, realtime, Edge Functions, pg_cron). Bu bilgisayar sunucu değildir.
- Mobil = **PWA** (iPhone + Android; ana ekrana kurulur; anlık bildirim) + **Android APK** (Capacitor; GitHub Actions derler; GitHub Releases'ta).
- Her şey oda (çift) koduyla korunur. Oda kodu 10 karakter, tahmin edilemez. Giriş/hesap yok.
- Alt sekmeler: **Biz** (ana sayfa) · **Sohbet** · **Anılar** · **Yavrumuz** · **Günler** · **Daha**. Oyunlar ana sayfada.

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
await col.refresh(); await col.loadOlder(50); col.hasOlder(); col.close();  // refresh -> sunucudan okudu mu (true/false), fırlatmaz
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
| `kisi` | clientId | `{ ad, foto?, dogum?: gün, renk?, bildirimGizli?: bool }` (`bildirimGizli`: alıcının ayarı; yalnız `false` iken bildirimde içerik gider, alan yoksa gizli) | profil.js |
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
| `konum` | clientId | `{ lat, lng, hassas, …, at }` ya da `{ kapali: true, at }` (isteğe bağlı, varsayılan kapalı; ayrıntı §26) | Konum (`sayfalar/konum/mantik.js`) |
| `oyunkayit` | oyun id | oyuna özel kayıtlı durum (Dama/Tavla "kaldığın yerden") | Masa oyunları |

Silme veriyi korur (deleted = true, data kalır); Ayarlar › Verilerimiz › Son silinenler'den geri alınır. Ekranlar silineni `deleted` bayrağıyla eler.
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
await bildir(roomId, { tur, baslik, metin, url, gizli? })  // partnerin cihazlarına push; hata fırlatmaz
//   gizli: { metin, baslik? }: kullanıcı içeriği taşıyan her çağrıda zorunlu; partnerin kisi.bildirimGizli'si false değilse bunlar gider.
//   tur: 'dokunus'|'mesaj'|'mektup'|'ani'|'gun'|'oyun'|'soru'|'liste'|'izle'. url site köküne göre göreli ('sayfalar/sohbet/').
// js/core/pwa.js (Sunucu)
registerPwa(); kurulumDurumu()  // { durum: 'kurulu'|'kurulabilir'|'ios-elle'|'yok', kur() }
// js/core/kilit.js (Ayarlar)
await kilitKontrol(); await kilitAyarla(pin | null); kilitVarMi()
// js/core/mobil.js (Mobil)
isNative(); titret(desen); await yerelHatirlaticilar([{ id, baslik, metin, zaman: ISO }])
// js/core/dosya-paylas.js — metin dosyası: Web Share (isteğe bağlı) → uygulamada Filesystem + Share → <a download>
await dosyaPaylas({ metin, ad, tur, baslik?, dialogBaslik?, webShare? }) // 'paylasildi'|'iptal'|'indirildi'|'yok'|'hata'
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
- Ortak tema (`js/core/tema.js`): 13 tema, Ayarlar › Görünüm seçer. Seçim `cift` belgesinde `{ tema, temaAt }`; son seçen kazanır. `temaEsitle(room)` (ui.js) canlı `veri` yayınını dinler, açılışta belgeyi okur. Vurgu rengi ve açık/koyu cihaza özeldir.
  - Varsayılan `pamuk` ek dosya yüklemez. Pamuk'a özel, yüksek seçicilikli süs kuralı `:where([data-tema='pamuk'])` ile başlar. `<html data-tema data-sayfa>` erken.js yazar.
  - Üretilen dosyalar: `css/temalar/<id>/temel.css` (base.css'in ardına), `sayfalar.css` (`<head>` sonuna), `js/core/tema-ikon/<id>.js`, `sayfalar/yavru/temalar/<id>/`, `assets/temalar/<id>/`. Elle düzenlenmez; `node dev/tema-uret.mjs` stil worktree'lerinden (`C:\BizIkimiz\stiller`) yeniden üretir. Bu dosyalar sayfa CSS'inin farkıdır: sayfa CSS'i değişince yeni kurallar temalara da geçer.
- Her HTML `<head>`'i: charset'in hemen arkasına birebir aynı CSP ve referrer meta'sı (`tests/guvenlik-baslik.test.mjs`; yeni dış kaynak CSP'ye de eklenir), theme-color, favicon, manifest, apple-touch-icon, apple/mobile meta, erken.js. Satır içi `<script>` ve `on*=` yasak.
- `games/hafiza/sync.js`, `rng.js`, `ekran.js` artık ortak (Çiz, Dört Taş, Amiral, Dama, Tavla). API'leri sabit kalmalı.
- Yerel duman testi: `iki.mjs` service worker'ı varsayılan engeller; PWA testi için `{ sw: true }`.

---

# v3 — Cihaz üyeliği, otomatik güncelleme ve yeni özellikler

v3 bölümleri v1 ve v2'nin üstüne gelir. Çatışmada v3 geçerli.

## 24. Cihaz üyeliği ve yetki
- Oda kodu tek başına veriye erişim vermez. Her cihaz (`clientId`) odaya onayla girer.
- **anahtar:** cihaz başına 32 bayt rastgele, base64url (43 karakter). localStorage `bizim.anahtar.<oda>`. Sunucuda yalnız sha256 özeti.
- **Kimlik** = `(p_cihaz, p_anahtar)`. `js/core/uyelik.js` `kimlik(roomId)` verir. veri.js, db.js, bildirim.js her RPC'ye ekler. Yeni RPC'yi doğrudan çağırma; bu katmanı kullan.
- **Durum:** `onayli | bekliyor | reddedildi`; istemcide ek olarak `cakisma` (aynı cihaz, farklı anahtar), `eski-sunucu` (RPC yok: kimliksiz eski davranış), `cevrimdisi`, `yok`.
- **Onay yolları** (`oda_katil`): kurucu (veri olmayan yeni oda), geçiş (koruma başlamadan önce, odada `kisi` belgesi olan eski cihaz), tek kullanımlık davet (7 gün), kurtarma kodu (tek kullanım; çakışmayı da çözer). Başka cihaz Ayarlar › Cihazlar'dan onaylar.
- **Koruma** (`oda.zorunlu`): yeni odada hemen; eski odada ilk girişten 3 gün sonra; bir cihaz çıkarılınca hemen. Koruma öncesinde kimliksiz çağrı çalışır, geçersiz kimlik her zaman reddedilir (42501).
- **Kanal:** gerçek zamanlı konu `'oda:' + kanal`. Koruma öncesinde kanal = oda kodu; sonra gizli. Cihaz çıkarılınca yenilenir. İstemci 60 sn'de bir ve öne gelince `durumTazele` ile yakalar.
- **Çıkarma:** cihazın satırı, Web Push abonelikleri, FCM belirteçleri ve davetleri silinir; kanal yenilenir; o cihazın oluşturduğu kurtarma kodu silinir.
- **Bildirim kaydı:** `push_kaydet` ve `fcm_kaydet` sona `p_anahtar` alır; koruma altındaki odada hedef yalnız anahtarla kaydedilmiş onaylı cihazdır (`push_sayilir`). FCM şemada 8. bölüm.
- **42501:** yazma giden kutusunda kalır, eşitleme durur, `kapi.js` tam ekran kapıyı gösterir.
- Modüller: `js/core/uyelik.js` (API), `uyelik-mantik.js` (saf; yerel sıkı öykünme), `kapi.js` (onay bekleme ekranı). Yerel modda varsayılan gevşek (herkes onaylı); sessionStorage `bizim.yerel.uyelik` = `'1'` ise sıkı öykünme.
- Davet linki: `inviteUrl(roomId, davet)` → `<kök>/#oda=<id>&davet=<kod>`.
- Yeni telefon linki (kişiye bağlı davet): `davetOlustur(roomId, { kimlik })` + `buildTasimaUrl` → `#oda=&davet=&kim=&ad=` (anahtar yok). Yalnız o kimlik kullanır; çakışmayı çözer (anahtar yenilenir, kurtarma kodu kalır). Genel davet çakışmayı çözmez. Kimlik yalnız elle yapıştırınca uygulanır.
- Sunucu: `supabase/schema.sql` 7. bölüm (`oda`, `oda_cihaz`, `oda_davet`, `oda_yetki`, `oda_katil`, `oda_durum`, `cihaz_*`, `davet_olustur`, `kurtarma_olustur`, `doc_ice_aktar`). Var olan RPC'ler sona `p_cihaz`, `p_anahtar` (`default null`) aldı.
- Kimliksiz çağrı yalnız oda satırı olan ve koruması başlamamış odada geçer; satırı olmayan oda 42501 verir. Oda satırını ilk girişte `oda_katil` açar.
- Durum ek: `silindi` (oda tamamen silindi; kapı ekranı, "Odadan çık" cihazdaki kopyayı siler).
- Yedekten geri yükleme: Ayarlar › Verilerimiz. `doc_ice_aktar` 200'lük parçalar; yedekteki kopya daha yeniyse ya da mevcut kayıt silinmişse yazılır; yazılan `updated_at` = şimdi.

## 25. Otomatik güncelleme
- `js/core/pwa.js` `guncellemeIzle({ bildir })`: yayın sürümü = GitHub Pages `Last-Modified`. Öne gelince ve açıkken 30 dk'da bir bakar.
  Boştaki sayfa (30 sn+ arka planda) yenilenir; oyunda, Birlikte İzle'de, açık pencerede ya da dolu yazı alanında "Yeni sürüm hazır" toast'u. Android uygulamasında yayından 10 dk sonra (HTTP önbelleği).
- `sw.js`: HTML, JS ve CSS ağ önce; görsel ve font önbellekten.
- Yayın damgası: `pages.yml` `_site` kopyasında `dev/surum-damgala.mjs` çalıştırır. Yerel js ve css adresleri (import, `import()`, `new URL`, HTML, CSS `@import`) `?v=<commit>` alır; `sw.js` `SURUM` aynı değere bağlanır. Neden: APK'da service worker yok, Pages 10 dk önbellek verir; eski ve yeni modül karışınca sayfa boş kalır. Depo ve ev sunucusu damgasızdır. Yeni dosya yükleme biçimi eklersen damga betiğine ve testine (`tests/yayin-damga.test.mjs`) ekle: damgasız adres yayını durdurur.
- `js/core/mobil.js` `kabukGuncellemeKontrol`: 12 saatte bir son APK sürümü; yeniyse bir kez "İndir" toast'u.

## 26. Yeni veri türleri
| Tür | id | data | Sahibi |
|---|---|---|---|
| `ruhgecmis` | `<YYYY-MM-DD>-<clientId>` | `{ emoji, not?, at }` (günün son seçimi) | Ruh Hâlimiz (`sayfalar/ruh/kayit.js`) |
| `skor` | oyun id | `{ [clientId]: n, berabere, y<YYYY>: { [clientId]: n, berabere }, son: { kazanan, at } }` | `js/core/skor.js` |
| `gunfoto` | `<YYYY-MM-DD>-<clientId>` | `{ foto, not?, at }` | Günün Fotoğrafı |
| `haftalik` | `<YYYY-Www>-<clientId>` | `{ puanlar: { iletisim, yakinlik, eglence, destek } (1–5), not?, at }` | Haftalık Kontrol |
| `harcama` | uuid (hesaplaşma `hesap-<hash>-<tutar>`) | `{ baslik, tutar (kuruş), odeyen, pay: { [clientId]: ağırlık }, tarih, kategori, hesaplasma? }` | Ortak Harcamalar |
| `yavru` | `'bizim'` | `{ asama: 'yumurta'/'kucuk'/'buyuk', ad, renk (1–6), dogum, catlama?, buyume?, ihtiyac: { tokluk/mutluluk/temizlik/enerji: { v, t } }, uyku: { bas, bit } \| null, puan: { [clientId]: n }, isitma: { [clientId]: [ISO] }, son: { [clientId]: { [eylem]: ISO } }, kisilik?: 'obur'/'uykucu'/'neseli'/'titiz', gorev?: { [YYYY-MM-DD]: { id, at, jeton?, seri?, kiyafet? } }, gorevSeri?: { n, son: gün, en, telafi?: gün }, evre?: { ay1|ay3|ay6|yas1: { at } }, tuvalet?: { v, t, kaza? }, jeton?: { [clientId]: { kazanc, harcama, gun, bugun, gorevGun? } }, dolap?: { [ürünId]: { at, kim, fiyat } }, giyim?: { bas?, goz?, boyun?, govde?, agiz?, kucak? } (ürün id'leri: `giyim.js` `YUVALAR`) }` (yama: `ihtiyac.<ad>`, `puan.<clientId>`, `son.<clientId>`, `gorev.<gün>`, `gorevSeri`, `evre.<id>`, `tuvalet`, `jeton.<clientId>`, `dolap.<ürünId>`, `giyim.<yuva>`). `kisilik` çatlarken bir kez yazılır (`kisilik.js`; yoksa etkisiz). `gorev` = ödülü verilmiş günler, son 7 (`gorev.js`; lazımlık bakım sayılır). Görev ödülü puan değil jeton: gün kaydı `jeton` = kişi başı 15 (+ özel gün 20, + seri ödülü); her kişi kendi sayacına `gorevJetonTopla` ile alır (`jetonKazan`, `kaynak: 'gorev'`), `jeton.<clientId>.gorevGun` çift almayı önler, günlük sınıra sığmayan gün sonraya kalır; `jeton` alanı olmayan eski gün kaydı yeniden ödenmez. `gorevSeri` (`seri.js`): ödül yamasıyla mutlak yazılır (iki cihaz aynı sonuç); `n` üst üste gün, `en` rekor, `telafi` affedilen son kaçan gün (tek kaçan gün 7 günde bir); kırık seri okurken 0; alan yok = 0. Rekorda ödül: 7. gün kişi başı +30 jeton, 30. gün Ayıcıklı bodi, 100. gün Yıldızlı pijama (`dolap.<id>` `fiyat: 0`; dolaptaysa kişi başı +100, +150 jeton). Sayfa ve kart "🔥 5 gün" gösterir. `evre` (`evre.js`): büyük aşamada çatlamadan 1, 3, 6, 12 ay sonra unvan (Meraklı minik, Küçük kâşif, Neşeli yumurcak, Evimizin neşesi; çipte aşama adının yerine) ve eşya (atkı, gözlük, elbise, taç): eşya evreye dek mağazada kilitli (`urunKilidi`, `satinAl` hatası `kilitli`), evrede `dolap.<id>` `fiyat: 0` gelir; önceden alınmış kıyafet ve bedeli korunur; sahne cihaz başına bir kez (`bizim.yavru.evreGoruldu.<oda>`). Özel gün (`mantik.js` `ozelGun`, `gunler.js` `milestones`; başlangıç çatlama günü: ay dönümü, doğum günü, gün sayıları): kısa sahne (`buyume-sahne.js` `kutlamaSahnesi`; cihazda gün başına bir kez, `bizim.yavru.ozelGoruldu.<oda>`; evre sahnesi olan gün yalnız o), kişi başı bir bedava pasta (`son.<clientId>.pastaGun`, jeton düşmez), günün görevi mum üfleme (`gorev.js` `MUM_GOREV`; seri ve ödül aynı yoldan). Keyifsizlik saklanmaz, ihtiyaç kayıtlarından hesaplanır (`saglik.js`); keyifsizken bakım 0.5 puan, `puan` kesirli olabilir. `tuvalet` (`tuvalet.js`): sıkışıklık hesaplanır (saatte +2, uykuda yarı; yemek +10–20); 70 ve üstü "Çişi var", 6 saat içinde lazımlık (`son.<clientId>.lazimlik`, 20 dk bekleme, puan yalnız çişi varken) yoksa kaza: temizlik −20, mutlak yama (iki cihaz aynı yamayı yazar), partnere bildirilir (yazan cihaz; 30 dk sınırı yok). Yerel hatırlatıcı eşikte ve kazadan 1 saat önce (`tuvaletOlaylari`; 23:00–08:00 arası sabaha kayar, `gunduzeKaydir`). Kazanın yazdığı temizlik zamanı "Sizi özledi" hesabında bakım sayılmaz. Yemek, uyut ve uyandır yamasına tuvalet yaması eklenir; eski belgede alan yok = artmaz. `jeton` (`jeton.js`): ortak bakiye hesaplanır (Σ kazanç − Σ harcama − dolap fiyatları); `jeton.<clientId>` yalnız sahibi yazar; günde kişi başı en çok 200; `dolap` kalıcı kıyafet. Sayfa bakiyeyi çip olarak gösterir; mağaza `magaza.js` (alt sayfa: yiyecek ve giyim sekmesi, satın alma `satinAl`, giy/çıkar; kıyafet alınınca hemen giyilir: `giyim.js` `satinAlGiyYamasi` tek yama `dolap.<id>` + `giyim.<yuva>`). `giyim` (`giyim.js`): yuva başına giyilen ürün id; yalnız dolapta olan geçerli (`giyimOku`), çıkarınca `giyim.<yuva>` = null; baş boşsa çizim varsayılan pembe fiyonku, gövde boşsa benekli tulumu gösterir; emzik ağlama ve kahkahada çıkar (konuşurken CSS gizler); küçükte (kundak) yalnız baş yuvası, küçük boy (gövde, ağız, kucak yok). Kıyafet katmanları `.yvb-kiyafet`, aksesuarlar `.yvb-giyim` altında (banyoda gizlenir). Yeni çizimler `sayfalar/yavru/giysi/*.js` (`giysi.js` birleştirir): `renk` giysiye kendi rengini verir (`--yvb-k-<renk>`; yoksa oda rengi), `ayak` patik parçası, `baslik` kapüşon parçası (saçın üstünde; varken varsayılan fiyonk çizilmez). Büyüme koşulu (`mantik.js` `buyumeDurumu`): çatlamadan 6 gün, toplam 60 puan, kişi başı en az 15. Küçük gösterim (≈64–96 px, ana sayfa kartı): `yavruSvg`/`bebekSvg` `kucukBoy: true` → parmaksız sade el ve ayak. Büyüme anı sahnesi `buyume-sahne.js` (cihaz başına bir kez, `buyumeSahnesiGerekli`; çatlama sahnesi gibi). İlk gün (yumurta paneli): `yumurtaRehberi` üç adım, sevgili bilinmiyorsa davet düğmesi (`shareInvite`); ilk ad formunda odaya kararlı üç öneri (`adOnerileri`; dokununca yalnız girdiye yazar); 24 saat dolunca yerel hatırlatıcı (hazırsa çatlama, değilse ısıtma çağrısı). Sayfa düzeni tek ekran (`style.css`, `body.yv-tam`: genel üst şerit bu sayfada gizli; sayfa bir alt sekme, çubuk görünür): sahne esner; altında durum, odanın düğmeleri, görev şeridi; en altta, sekme çubuğunun üstünde oda sırası. Oda sırası aynı zamanda ihtiyaç göstergesidir (`odalar.js` `odaDurumlari`: Mutfak tokluk, Banyo temizlik, Tuvalet rahatlık, Yatak enerji, Oyun mutluluk; `UYARI` altında halka vurgulu). Odada tek önerilen eylem vurgulanır (`onerilenEylem`). Görev, Oyunlar ve kart tek biçim alt sayfada (`alt-sayfa.js`; içerik `gorev-sayfa.js`, `oyun-sec.js`, `bilge-karti.js`, adına dokununca açılır). Ses düğmesi kartta. Sev düğmesi gösterilmez: bebeğe dokunmak aynı işi yapar. Sabun Yıka düğmesinden sürüklenir; köpük bitince Durula. İkonlar tek dil (`ikonlar.js`). Oda çizimleri `oda/*.js` (viewBox 0 0 390 480, alt kenar sabit; jetonlar `oda/ortak.js`), `oda-cizim.js` birleştirir. Çizim: yumurta `cizim.js` (kabuk rengi ve çizgisi küçük bebeğin kabuğu ve çatlama sahnesiyle aynı), küçük ve büyük `bebek.js` (katmanlı SVG; gradyan id'leri SVG başına benzersiz; aksesuarlar ayrı `<g class="yvb-giyim yvb-giyim-<yuva>">`). Dokunma tepkisi (`dokunma.js`: bölge → geçici ifade; 3 sn'de 6 dokunuş ağlatır) belgeye yazılmaz; yalnız baş okşama ve karın gıdıklama `sev` eylemini dener. Odalar (`odalar.js` saf, `oda-cizim.js` çizim) ve oda seçimi belgeye yazılmaz (son oda cihazda: localStorage `bizim.yavru.oda.<oda>`; partnere presence `alan` = oda id: "Gül şu an banyoda 🫧", `partnerOdaMetni`); sürükle-bırak bakım var olan eylem yamasını yazar, yeni alan yok. Görev kartı ilgili odaya geçiş düğmesi gösterir (`gorev.js` `gorevOdalari`: eylemlerin odaları, en çok 2; genel bakım görevinde yok). Erken uyandırma (uyku süresinin ilk yarısında `uyandir`, `dokunma.js` `uyandirmaTepkisi`) kısa ağlatır; ağlarken Salla düğmesi ya da sağ-sol 3 salınım (`sallaIlerle`) hemen `huzur` verir; ağlama kendiliğinden de biter (geçici, belgeye yazılmaz). Ninni (`ninni.js`; yatak odası; bizim bestemiz, Web Audio, `sound.js` sessiz ayarına uyar) belgeye yazmaz; çalarken gözler kırpışır, uyanık ve enerji < 50 ise `uykulu`; bitince uyut önerilir (otomatik uyutma yok). Mini oyun jetonu (`oyunlar/cerceve.js` `skorJeton`, oyun başı en çok 30): `jetonKazan(..., { kaynak: 'oyun' })` → `jeton.<clientId>` yaması, günlük sınırla kısılabilir. Mini oyunlar: Balon, Top, Ce-e, Ninni, Giydirme Siparişi (`giydir`), Mama Tarifi (`tarif`), Birlikte Salla (`salla`; iki kişi, `room.send` ile el sıkışma ve vuruş; isabet yerel hesaplanır, saat karşılaştırılmaz). Ekran sözleşmesine `baglam` eklendi: `{ room, renk, kisilik, giyim }`. Site oyunu ödülü (`js/core/oyun-odul.js` `oyunOdulu`, kural `sayfalar/yavru/site-oyun.js`): iki kişilik oyun bitince her cihaz kendi `jeton.<clientId>` sayacına yazar; kazan 20, beraber ve ortak 15, kayıp 12; kişi başı, oyun başı günde 3 ödül (`jeton.<clientId>.oyunHak`: `{ gun, sayi }`); günlük sınır aynen geçerli; yalnız oyun ve XOX ödül almaz; partner çevrimdışıyken biten oyunda yalnız bitişi gören cihaz alır | Yavrumuz (`sayfalar/yavru/mantik.js`) |
| `yavrubakim` | uuid (kaza: `kaza-<ms>`) | `{ eylem, kim (clientId), at, deger? }` (bakım günlüğü; `eylem` ayrıca `'ilac'`, `'lazimlik'`, `'kaza'` (kaza anı; iki cihaz aynı id'yi yazar), `'satinal'` (`deger` = ürün id), `'mum'` (id `mum-<gün>-<clientId>`), `'evre'` (id `evre-<evreId>`, `deger` = unvan); sayfa son 50'yi açar (günlük görev sayımı), son 10'u gösterir) | Yavrumuz |
| `kupon` | uuid | `{ baslik, emoji, aciklama?, veren, alan (clientId), durum: 'verildi'/'kullanildi'/'tamam', verildi: ISO, kullanildi?: ISO, tamam?: ISO, son?: gün }` (son gün dahil kullanılır) | Aşk Kuponları |
| `bilgi` | clientId | `{ ust?, alt?, ayakkabi?, yuzuk?, cicek?, renk?, yemek?, tatli?, icecek?, markalar?, sevmedikleri?, alerji?, hediye?, not?, sorular?: { [alan]: ISO } }` (her kişi yalnız kendi belgesini alan alan yazar; `sorular` = sevgiliye "Sor" dediklerim) | Onun Hakkında |
| `kumbara` | uuid | `{ baslik, emoji, hedef (kuruş), son?: gün, tamam?: ISO }` (`tamam` = hedefe ilk ulaşılan an; para alınsa da kalır) | Ortak Harcamalar → Kumbara (`sayfalar/harcama/kumbara-mantik.js`) |
| `katki` | uuid | `{ kumbara (id), tutar (kuruş; eksi = kumbaradan alma), kim (clientId), not?, tarih: gün }` | Ortak Harcamalar → Kumbara |
| `not` | uuid | `{ tur: 'yazi'/'cizim'/'foto', metin? (≤200), foto?: url (çizim WebP), kime, kimden (clientId), surpriz: bool, acildi?: ISO }` (sürpriz: alan kişi dokununca açılır; açılınca da arşivde kalır) | Not Bırak (`sayfalar/not/mantik.js`) |
| `sohbetozet` | `'bizim'` | `{ v: 1, at, yukleyen, kaynak: { bicim, ilk, son, mesaj, gun, konusulanGun, medyaTuru, saniye }, ilkMesaj, gunluk, aylik, saat, haftaGunu, enYogunGunler, seri, sessizlik, sohbet, arama, kisi: { [clientId]: { mesaj, kelime, soz, sozIlk, kelimeler, emojiler, … } } }` (WhatsApp dışa aktarımından yalnız sayılar; ham mesaj gitmez; dosya telefonda bellekte işlenir; < 32 KB; yeni yükleme üstüne yazar) | Sohbet Özetimiz (`sayfalar/sohbet-ozeti/hesapla.js`) |
- `konum` (v3, §17'deki satırın yerine): paylaşıyorsa `{ lat, lng, hassas: 'yaklasik'|'tam', dogruluk?: metre (yalnız tam), yer?: 'Kadıköy, İstanbul', pil?: 0–100, sarj?: bool, canli?: ISO bitiş ('Ben kapatana dek' = '9999-12-31T00:00:00Z'), at: ISO }`;
  yaklaşık 2 ondalık (~1 km), tam 5 ondalık. Durdurunca `{ kapali: true, at }` (putDoc; **removeDoc kullanılmaz**: silme veriyi saklar, koordinat sunucuda kalırdı).
  Eski `{ lat, lng, sehir?, at }` yaklaşık sayılır. Okuyan her yer `kapali` belgeyi "paylaşmıyor" sayar (`paylasiyorMu`).
  Yer adı paylaşan cihazda Nominatim ters aramasıyla (dakikada en çok 1, yerel önbellek; hata sessiz). Canlı: uygulama açıkken her sayfada `watchPosition` (ui.js `canliKonum` yerel işarete bakar: `bizim.konum.canli.<oda>.<clientId>` = bitiş; işaret yoksa konum kodu yüklenmez; sayfa başına tek izleyici ve tek koleksiyon: `paylasim.js` `canliServis`, `konumKoleksiyonu`); en çok dakikada 1 yazım, 50 m altı hareket ve 3 dk'dan taze kayıtta yazım yok; süre dolunca `canli` silinir, son konum kalır. Açılışta paylaşım açık ve kayıt 10 dk'dan eskiyse bir kez güncellenir.
  Saf yardımcılar `sayfalar/konum/mantik.js`; tarayıcı tarafı (alma, yazma, canlı izleme, açılış tazelemesi) `sayfalar/konum/paylasim.js`.
- Ek alanlar: `ani.konum = { lat, lng }` (4 ondalık); `mesaj.ses = { url, sure, tur }`; `mesaj.yildiz = { [clientId]: true }` (patch `yildiz.<clientId>`);
  `mesaj.sabit = { at: ISO, kim: clientId }` (ikimiz için ortak; patch `sabit`, kaldırınca `null`; en çok 10; eski sabitler istemcide `bizim.sohbet.sabit.<oda>` önbelleğinde);
  `liste.liste = 'sarki'` + `baglanti?` (yalnız https YouTube/Spotify/Apple Music) + `bizim?` (tek "Bizim şarkımız").
- Yeni tür `sayfalar/ayarlar/mantik.js` `YEDEK_TURLERI` sonuna eklenir.
- Yavrumuz otomatik yazımları (kaza, çatlama, büyüme, görev ödülü, görev jetonu, evre) yalnız görünümdeki ilk başarılı tazelemeden sonra çalışır (`sayfalar/yavru/tazelik.js`); arka plandan dönünce önce tazelenir. Düğmeler beklemez.

## 28. Medya, kalıcı silme, tam yedek
- **Başvuru:** belgede duran değer adres değil konumdur: eski `https://<proje>/storage/v1/object/public/photos/<yol>` ya da `kova:<yol>`; `<yol>` = `<oda>/<uuid>.jpg|webp|webm|m4a`. İkisi de her zaman okunur. Yeni yazım `js/config.js` `MEDYA_KOVA_BICIMI` ile seçilir. İmzalı adres belgeye yazılmaz.
- **Okuma:** `img.src = başvuru` YASAK. `fotoImg`, `fotoSrc`, `medyaAdresi`, `loadPhoto` kullan. Eşzamanlı gerekirse `medyaHazir` (hazır imza | null). İmza 1 saat; `medya-imza.js` toplu ister, sessionStorage `bizim.imza`da tutar. İmza alınamazsa açık adrese düşer (kova kapalıyken görüntü hatası).
- **Edge Function `medya`** (`supabase/functions/_shared/medya.js`): `?islem=imzala`, `?islem=yukle` (foto 5 MB, ses 2 MB, içerik imzası denetlenir), `?islem=temizle` (pg_cron). Cihaz yetkisi ve sınır SQL'de (`schema.sql` 9. bölüm).
- **Sınır:** oda 800 MB ve 5000 dosya, genel 950 MB, oda saatte 600 dosya (`medya_sinirlar`). Gösterge: Ayarlar › Verilerimiz (`medya_kullanim`).
- **Silme:** `doc_kalici_sil` ve `cop_temizle` (30 gün) `data` = `{}` yapar, satır kalır; odada anılmayan dosya `medya_silinecek` kuyruğuna girer; `medya?islem=temizle` Storage API ile siler. Düzenlemeyle belgeden çıkarılan dosya silinmez.
- **Oda silme:** `oda_sil_iste` (48 saat), `oda_sil_onayla` (başka cihaz; yalnız gerçek cihaz yoksa isteyen; `yedek-pc-*` sayılmaz), `oda_sil_vazgec`, `oda_sil_durum`. Kod `oda_silindi`'ye girer, bir daha açılmaz.
- **Tam yedek** (`.bizyedek`, `js/core/yedek-sifre.js`, `sayfalar/ayarlar/yedek-tam.js`): PBKDF2-SHA256 600.000 tekrar, AES-256-GCM, 4 MB parça; sıra ve son parça ek veride. İlk kayıt `yedekVerisi`, sonra medya. Eski düz `.json` okunur. `crypto.subtle` https ister: http yerel ağda çalışmaz. Geri yüklemede bu odanın dosyası aynı yola yazılır; başka oda ya da `local:` yeni başvuru alır. Hatırlatma: `js/core/yedek-hatirlat.js` (30 gün, cihaz başına; `bizim.yedek.*`).
- **Canlı geçiş:** `schema.sql` kovanın `public` değerine ve eski politikaya dokunmaz, temizliği zamanlamaz. Bu adımlar `supabase/gecis/` altında, ayrı onayla.

## 27. Yeni sayfalar, oyunlar ve ortak modüller
- SAYFALAR: `ruh`, `skor`, `yilimiz`, `rozetler`, `gunfoto`, `haftalik`, `harcama`, `konum` (Daha › Biz; Ayarlar'daki eski Mesafe bölümünün yerine), `sohbetozet` (Sohbet Özetimiz, Daha › Biz, `yilimiz`'ın arkasında; `sayfalar/sohbet-ozeti/`). GAMES: `satranc`, `pisti`, `duello` (Kelime Düellosu), `sudoku`.
- Rekabetçi oyun bitişinde ev sahibi `logGame` yanında `skorKaydet(room, oyunId, { kazanan })` çağırır; kutlamaya `toplamSatiri(...)` eklenir.
- Masa oyunları `games/dama/masa.js` `bootMasa` üstüne kurulur. `game.save?(s)` kayda gideni belirler (varsayılan `view`). "Sıra sende" bildirimini sırayı devreden cihaz yollar; `partnerGoruyor(partner, ns)` doğruysa yollanmaz.
- `storage.js`: `uploadAudio(blob, roomId)` (`<oda>/<uuid>.webm|m4a`, en çok 2 MB); `uploadPhoto` yolu `.webp` ya da `.jpg`. Kova: `image/jpeg|webp|png`, `audio/webm|mp4`.
- `foto.js`: `fotoKucult(file)` (destek varsa WebP 0.82, yoksa JPEG).
- `mobil.js`: `widgetGuncelle({ baslangic, bulusma, adlar })` → Android ana ekran widget'ı (yerel eklenti `BizWidget`, `mobil/android-ek/`). hub.js profil verisi gelince çağırır.
- `mobil/scripts/android-hazirla.mjs` manifest'e `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS`, `ACCESS_COARSE_LOCATION`, `ACCESS_FINE_LOCATION` ekler (Capacitor WebView istemi kendisi açar).
- Yavrumuz odaları (`sayfalar/yavru/`): Mutfak, Banyo, Tuvalet, Yatak odası, Oyun odası (yumurtada oda yok). Sekme + sahnede yatay kaydırma; ihtiyacı düşük odanın sekmesinde nokta. Sürükle-bırak (pointer events): yemek ağza (yemek düğmesi `touch-action: pan-y`: düz dikey hareket sayfayı kaydırır; yatay ya da yukarı-çapraz hareket ya da 300 ms basılı tutma sürükler, `odalar.js` `yemekSurukleKarar`), sabun köpüğü + Durula → `yika`, bebek lazımlığa; düğmeye dokunuş ve klavye aynı eylemi yapar. Oyun odası: mini oyunlar (`oyunAc` tam ekran katman; Ce-e'ye `yavruSvg` verilir), ses taklidi (`taklit.js`; mikrofon açıkken gösterge; **ses yalnız cihazda bellekte işlenir, hiçbir yere gönderilmez, saklanmaz**; uyurken yok), Mağaza düğmesi (app.js `magazaAc` kancası). Bebek konuşma ağzı: `bebek.js` `.yvb-agiz-konus`, ata öğede `[data-konusuyor]` + `--yvb-konus` (0..1).
- Sohbet sekmesi rozeti: `js/core/sohbet-rozet.js` (`mountTabBar` yükler). Yalnız son 10 mesaj ve `okundu` okunur; `okunmamisSayisi` saf (`sayfalar/sohbet/mantik.js`).
- Ana sayfa "Geçen yıl bugün": `sayfalar/anilar/kart.js` `mountBugunGecenKart(el, { room })`; anı yoksa bölüm gizli.
- Anı taslağı: başka sayfa `sessionStorage` `ANI_TASLAK_ANAHTARI` = `{ fotolar, not }` yazar, `sayfalar/anilar/?yeni=1&taslak=1` açar. Fotoğraf adresi URL'e yazılmaz.
- Daha: arama `dahaAra`, son kullanılanlar yerel (`bizim.daha.son.<clientId>`); yalnız Daha'dan açılanlar kaydedilir.
- Dış kod: `vendor/supabase.js` ve `vendor/leaflet/` (Leaflet 1.9.4, BSD-2; yalnız `sayfalar/anilar/harita.js` `leafletYukle` dinamik yükler; Konum sayfası da onu ve `haritaKur`'u kullanır). Harita karoları OpenStreetMap; atıf zorunlu.
