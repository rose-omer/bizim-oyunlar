// Uygulama kilidi (PIN). Sahip: Ayarlar ajanı. Sözleşme §20.
// PIN cihazda kalır: localStorage 'bizim.kilit' = { v, tuz, ozet, n } (tuzlu SHA-256 özeti, PIN'in kendisi değil).
// Açılışta tam ekran tuş takımı; arka plan içerik görünmez ve `inert`. 5 yanlışta 30 sn bekleme.
// Oturum: sayfalar arası geçişte yeniden sormaz; sekme 5 dk arka planda kalırsa ya da sayfa yenilenirse sorar.
// Üst kısım saf (Node'da test edilir); DOM yalnız fonksiyonların içinde kullanılır.
import { readStore, writeStore, clearRoom, lobbyUrl, isValidRoomId } from './identity.js';

export const K_PIN = 'bizim.kilit';
export const K_DENEME = 'bizim.kilit.deneme';
export const K_OTURUM = 'bizim.kilit.oturum'; // sessionStorage
export const MAX_YANLIS = 5;
export const BEKLEME_MS = 30_000;
export const ARKA_PLAN_MS = 5 * 60_000;
export const BILDIRIM_BEKLE_MS = 5000; // odadan çıkarken bildirim kapatma en çok bu kadar beklenir

const PIN_RE = /^\d{4,6}$/;
const HEX_RE = (n) => new RegExp(`^[0-9a-f]{${n}}$`);

// ---------- Saf yardımcılar ----------

/** PIN biçimi uygunsa null, değilse Türkçe hata metni. */
export function pinHatasi(pin) {
  if (typeof pin !== 'string' || !PIN_RE.test(pin)) return 'PIN 4–6 rakamdan oluşmalı.';
  return null;
}

/** localStorage'daki ham kayıt → { v, tuz, ozet, n } | null (bozuksa null). */
export function kayitCoz(raw) {
  let k;
  try { k = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return null; }
  if (!k || typeof k !== 'object') return null;
  if (!HEX_RE(32).test(k.tuz || '') || !HEX_RE(64).test(k.ozet || '')) return null;
  if (!Number.isInteger(k.n) || k.n < 4 || k.n > 6) return null;
  return { v: 1, tuz: k.tuz, ozet: k.ozet, n: k.n };
}

/** Deneme durumu: { yanlis, kadar } (kadar = bekleme bitiş zamanı, ms). */
export function denemeCoz(raw) {
  let d;
  try { d = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { d = null; }
  const yanlis = Number.isInteger(d?.yanlis) && d.yanlis > 0 ? Math.min(d.yanlis, MAX_YANLIS) : 0;
  const kadar = Number.isFinite(d?.kadar) && d.kadar > 0 ? d.kadar : 0;
  return { yanlis, kadar };
}

/** Yanlış PIN sonrası yeni durum. MAX_YANLIS'e ulaşınca sayaç sıfırlanır, bekleme başlar. */
export function yanlisSay(durum, simdi) {
  const yanlis = denemeCoz(durum).yanlis + 1;
  if (yanlis >= MAX_YANLIS) return { yanlis: 0, kadar: simdi + BEKLEME_MS };
  return { yanlis, kadar: 0 };
}

/** Kalan bekleme (ms). Saat geri alınmışsa bekleme en çok BEKLEME_MS sürer. */
export function beklemeKalan(durum, simdi) {
  const { kadar } = denemeCoz(durum);
  return Math.max(0, Math.min(kadar - simdi, BEKLEME_MS));
}

export function kalanHak(durum) {
  return MAX_YANLIS - denemeCoz(durum).yanlis;
}

/** Oturum açık mı? Son görünürlükten bu yana `sure`den az geçtiyse evet. */
export function oturumGecerli(oturum, simdi, sure = ARKA_PLAN_MS) {
  if (!oturum || oturum.acik !== true || !Number.isFinite(oturum.son)) return false;
  const fark = simdi - oturum.son;
  return fark >= -60_000 && fark < sure; // küçük saat kaymasına tolerans
}

// Odaya bağlı ama adında oda kodu olmayan anahtarlar: oda kaydı, bildirim tazeleme işareti (session).
const ODA_GENEL = new Set(['bizim.room', 'bizim.bildirim.tazelendi']);

/**
 * "Bu cihazdan odayı unut" (localStorage ve sessionStorage için ayrı ayrı çağrılır):
 * adında oda kodu geçen tüm bizim.* anahtarları (önbellek, giden kutusu, taslaklar, oyun durumları)
 * + ODA_GENEL. Yerel mod verisi (bizim.yerelveri.*) kalır: orada sunucunun yerini tutar.
 */
export function unutulacakAnahtarlar(anahtarlar, roomId) {
  if (!isValidRoomId(roomId)) return [];
  return [...anahtarlar].filter((k) => typeof k === 'string' && k.startsWith('bizim.')
    && !k.startsWith('bizim.yerelveri.') && (ODA_GENEL.has(k) || k.includes(roomId)));
}

export function hexYap(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// SHA-256: crypto.subtle güvenli bağlam ister (http://192.168… olmaz). Orada saf yedek kullanılır;
// iki yol aynı özeti verir, PIN hangi bağlantıda kurulduysa diğerinde de açılır.
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
const ror = (x, n) => (x >>> n) | (x << (32 - n));

/** Saf SHA-256 (yedek yol). bytes: Uint8Array → Uint8Array(32). */
export function sha256Saf(bytes) {
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const len = bytes.length;
  const n = ((len + 9 + 63) >> 6) << 6;
  const m = new Uint8Array(n);
  m.set(bytes);
  m[len] = 0x80;
  const dv = new DataView(m.buffer);
  dv.setUint32(n - 8, Math.floor((len * 8) / 2 ** 32));
  dv.setUint32(n - 4, (len * 8) >>> 0);
  const w = new Uint32Array(64);
  for (let i = 0; i < n; i += 64) {
    for (let t = 0; t < 16; t++) w[t] = dv.getUint32(i + t * 4);
    for (let t = 16; t < 64; t++) {
      const x = w[t - 15], y = w[t - 2];
      w[t] = w[t - 16] + (ror(x, 7) ^ ror(x, 18) ^ (x >>> 3)) + w[t - 7] + (ror(y, 17) ^ ror(y, 19) ^ (y >>> 10));
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let t = 0; t < 64; t++) {
      const t1 = (h + (ror(e, 6) ^ ror(e, 11) ^ ror(e, 25)) + ((e & f) ^ (~e & g)) + K[t] + w[t]) | 0;
      const t2 = ((ror(a, 2) ^ ror(a, 13) ^ ror(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
  }
  const out = new Uint8Array(32);
  const ov = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) ov.setUint32(i * 4, H[i]);
  return out;
}

/** Tuzlu özet (hex). Girdi: UTF-8 "<tuz>:<pin>". */
export async function ozetle(pin, tuz) {
  const bytes = new TextEncoder().encode(`${tuz}:${pin}`);
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    try { return hexYap(new Uint8Array(await subtle.digest('SHA-256', bytes))); } catch { /* yedek yola düş */ }
  }
  return hexYap(sha256Saf(bytes));
}

/** PIN kayıtla eşleşiyor mu? */
export async function pinDogrula(pin, kayit) {
  const k = kayitCoz(kayit);
  if (!k || pinHatasi(pin)) return false;
  return (await ozetle(pin, k.tuz)) === k.ozet;
}

// ---------- Depo ----------

const oku = (kind, key) => {
  try { return JSON.parse(readStore(kind, key) || 'null'); } catch { return null; }
};
const yaz = (kind, key, v) => writeStore(kind, key, v == null ? null : JSON.stringify(v));

function kayitOku() { return kayitCoz(readStore('local', K_PIN)); }
function denemeOku() { return denemeCoz(readStore('local', K_DENEME)); }
function oturumAc() { yaz('session', K_OTURUM, { acik: true, son: Date.now() }); }

/** PIN ayarlı mı? (senkron) */
export function kilitVarMi() {
  return !!kayitOku();
}

/** Girilen PIN bu cihazdaki PIN mi? (Ayarlar: değiştir/kaldır öncesi) */
export async function pinDogruMu(pin) {
  return pinDogrula(pin, kayitOku());
}

/** pin = 4–6 rakam (string) ya da null (kilidi kaldır). Biçim yanlışsa hata fırlatır. */
export async function kilitAyarla(pin) {
  if (pin == null) {
    writeStore('local', K_PIN, null);
    writeStore('local', K_DENEME, null);
    writeStore('session', K_OTURUM, null);
    return;
  }
  const hata = pinHatasi(pin);
  if (hata) throw new Error(hata);
  const tuzBayt = new Uint8Array(16);
  globalThis.crypto.getRandomValues(tuzBayt);
  const tuz = hexYap(tuzBayt);
  const ozet = await ozetle(pin, tuz);
  yaz('local', K_PIN, { v: 1, tuz, ozet, n: pin.length });
  writeStore('local', K_DENEME, null);
  oturumAc(); // PIN'i yeni giren kişi bu oturumda yeniden sorulmaz
}

/**
 * Bu cihazdan odayı unut. Önce bu cihazın bildirim aboneliği kapanır (sunucudan da silinir; hata yutulur,
 * en çok BILDIRIM_BEKLE_MS beklenir). Sonra odanın tüm yerel anahtarları ve oda kaydı silinir.
 * PIN kalır (cihaz ayarı); "PIN'i unuttum" ayrıca kilitAyarla(null) çağırır.
 */
export async function cihazdanUnut(roomId) {
  let zaman;
  try {
    await Promise.race([
      import('./bildirim.js').then((m) => m.bildirimKapat(roomId)),
      new Promise((r) => { zaman = setTimeout(r, BILDIRIM_BEKLE_MS); }),
    ]);
  } catch { /* bildirim kapatılamadı: yine de unut */ } finally {
    clearTimeout(zaman);
  }
  for (const ad of ['localStorage', 'sessionStorage']) {
    try {
      const depo = globalThis[ad];
      const keys = [];
      for (let i = 0; i < (depo?.length || 0); i++) keys.push(depo.key(i));
      for (const k of unutulacakAnahtarlar(keys, roomId)) depo.removeItem(k);
    } catch { /* depo yok */ }
  }
  clearRoom();
}

// ---------- Kilit ekranı (DOM) ----------

let kapak = null; // kaplama kökü (açıkken)
let kurulum = null; // kilitle() sözü (aynı anda iki kaplama olmasın)
let dinleniyor = false;
let ilkKarar = null; // bu sayfa yüklemesinin kilit kararı (bootPage ve mountShell aynı sözü paylaşır)

function yenilendi() {
  try { return globalThis.performance?.getEntriesByType?.('navigation')?.[0]?.type === 'reload'; } catch { return false; }
}

/**
 * PIN ayarlıysa kilit ekranı gösterir; doğru PIN girilince çözülür. PIN yoksa hemen döner.
 * bootPage odaya katılmadan önce bekler; mountShell de çağırır. Sayfa başına bir karar verilir
 * (yenilenen sayfada PIN iki kez sorulmasın); sonraki kilitlemeleri görünürlük dinleyicisi yapar.
 */
export function kilitKontrol() {
  if (typeof document === 'undefined') return Promise.resolve();
  if (!ilkKarar) ilkKarar = ilkKontrol();
  return ilkKarar;
}

async function ilkKontrol() {
  dinle();
  if (!kilitVarMi()) return perdeKaldir();
  if (!yenilendi() && oturumGecerli(oku('session', K_OTURUM), Date.now())) {
    oturumAc();
    return perdeKaldir();
  }
  await kilitle();
}

// erken.js PIN varken içeriği gizler ('kilit-bekle'); karar verilince ya da kaplama kurulunca kalkar.
// Geç yüklenince erken.js'in "Kilit yüklenemedi" kartı da kalkar.
function perdeKaldir() {
  document.documentElement.classList.remove('kilit-bekle');
  document.getElementById('kilit-yuklenemedi')?.remove();
}

function dinle() {
  if (dinleniyor) return;
  dinleniyor = true;
  const gizlendi = () => { if (!kapak && kilitVarMi()) oturumAc(); };
  const denetle = () => {
    if (kapak || !kilitVarMi()) return;
    if (oturumGecerli(oku('session', K_OTURUM), Date.now())) oturumAc();
    else kilitle();
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') gizlendi();
    else denetle();
  });
  window.addEventListener('pagehide', gizlendi);
  window.addEventListener('pageshow', (e) => { if (e.persisted) denetle(); });
}

function kilitle() {
  if (!kurulum) {
    kurulum = kapakKur().finally(() => { kurulum = null; });
  }
  return kurulum;
}

const STIL = `
.kilit{position:fixed;inset:0;z-index:2000;display:grid;place-items:center;overflow-y:auto;
  padding:calc(20px + var(--safe-top,0px)) 20px calc(20px + var(--safe-bottom,0px));
  background-color:var(--bg);background-image:var(--grain);color:var(--text);
  --tus:clamp(60px,9.2dvh,76px)}
.kilit-kart{display:flex;flex-direction:column;align-items:center;gap:clamp(12px,2.4dvh,22px);width:100%;max-width:340px;text-align:center}
.kilit-mark{width:52px;height:52px}
.kilit-mark svg{width:100%;height:100%}
.kilit-baslik{font-size:1.75rem;letter-spacing:-.02em}
.kilit-durum{min-height:3em;max-width:30ch;color:var(--muted);font-weight:650;line-height:1.5}
.kilit-durum[data-tur=hata]{color:var(--bad)}
.kilit-noktalar{display:flex;gap:16px;height:16px;align-items:center}
.kilit-nokta{width:14px;height:14px;border-radius:50%;box-shadow:inset 0 0 0 2px var(--muted);transition:background-color .12s ease,box-shadow .12s ease,transform .12s var(--ease)}
.kilit-nokta.dolu{background:var(--accent);box-shadow:none;transform:scale(1.08)}
.kilit-noktalar.salla{animation:kilit-salla .42s cubic-bezier(.36,.07,.19,.97)}
.kilit-tuslar{display:grid;grid-template-columns:repeat(3,var(--tus));gap:clamp(10px,1.8dvh,16px) clamp(18px,6vw,28px)}
.kilit-tus{display:grid;place-items:center;width:var(--tus);height:var(--tus);padding:0;border:1px solid var(--line);border-radius:50%;
  background:var(--surface);color:var(--text);box-shadow:var(--shadow-sm);font-size:1.75rem;font-weight:650;
  font-variant-numeric:tabular-nums;touch-action:manipulation;user-select:none;-webkit-user-select:none;
  transition:background-color .12s ease,transform .1s var(--ease)}
.kilit-tus:active:not(:disabled){background:var(--accent-soft);transform:scale(.93)}
.kilit-tus:disabled{opacity:.4;cursor:not-allowed}
.kilit-tus.sil{border-color:transparent;background:transparent;box-shadow:none}
.kilit-tus svg{width:28px;height:28px}
.kilit-unuttum{min-height:44px;padding:0 16px;border:0;border-radius:var(--radius-pill,999px);background:transparent;color:var(--accent-strong);font-weight:750}
@media (hover:hover){.kilit-tus:hover:not(:disabled){border-color:color-mix(in srgb,var(--accent) 40%,var(--line))}.kilit-unuttum:hover{background:var(--surface-2)}}
@keyframes kilit-salla{10%,90%{transform:translateX(-2px)}20%,80%{transform:translateX(4px)}30%,50%,70%{transform:translateX(-7px)}40%,60%{transform:translateX(7px)}}
@media (prefers-reduced-motion:reduce){.kilit-noktalar.salla{animation:none}.kilit-tus,.kilit-nokta{transition:none}}
`;

const SIL_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M9 5h10.5A1.5 1.5 0 0 1 21 6.5v11a1.5 1.5 0 0 1-1.5 1.5H9l-6-7z"/><path d="m12 9.5 5 5m0-5-5 5"/></svg>';

async function kapakKur() {
  const kayit = kayitOku();
  if (!kayit) return;
  writeStore('session', K_OTURUM, null);

  // Önce boş, opak kaplama: içerik bir an bile görünmesin.
  if (!document.getElementById('kilit-stil')) {
    const st = document.createElement('style');
    st.id = 'kilit-stil';
    st.textContent = STIL;
    document.head.append(st);
  }
  const kok = document.createElement('div');
  kok.className = 'kilit';
  kok.setAttribute('role', 'dialog');
  kok.setAttribute('aria-modal', 'true');
  kok.setAttribute('aria-labelledby', 'kilit-baslik');
  document.body.append(kok);
  kapak = kok;
  perdeKaldir(); // opak kaplama artık içeriği örtüyor
  for (const d of document.querySelectorAll('dialog[open]')) d.close(); // üst katmanda kalmasın

  // Arka planı etkisiz kıl; sonradan eklenenleri de (onay penceresi hariç).
  const onceki = new Map();
  const sustur = (el) => {
    if (el === kok || el.tagName === 'DIALOG' || el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || onceki.has(el)) return;
    onceki.set(el, el.inert);
    el.inert = true;
  };
  for (const el of document.body.children) sustur(el);
  const izle = new MutationObserver((list) => {
    for (const m of list) for (const n of m.addedNodes) if (n.nodeType === 1 && n.parentElement === document.body) sustur(n);
  });
  izle.observe(document.body, { childList: true });
  const html = document.documentElement;
  const tasma = html.style.overflow;
  html.style.overflow = 'hidden';

  const ui = await import('./ui.js');
  const { h, ICONS, confirmDialog } = ui;

  let giris = '';
  let mesgul = false;
  let sayac = 0;
  const noktalar = h('div', { class: 'kilit-noktalar', 'aria-hidden': 'true' });
  const durum = h('p', { class: 'kilit-durum', role: 'status', 'aria-live': 'polite' });
  const tuslar = [];
  const tus = (rakam) => {
    const b = h('button', { type: 'button', class: 'kilit-tus', 'aria-label': rakam, onclick: () => ekle(rakam) }, rakam);
    tuslar.push(b);
    return b;
  };
  const silTus = h('button', { type: 'button', class: 'kilit-tus sil', 'aria-label': 'Son rakamı sil', html: SIL_SVG, onclick: () => sil() });
  tuslar.push(silTus);

  const boya = () => {
    noktalar.replaceChildren(...Array.from({ length: kayit.n }, (_, i) => h('span', { class: `kilit-nokta${i < giris.length ? ' dolu' : ''}` })));
  };
  const yazDurum = (metin, tur = '') => {
    durum.textContent = metin;
    durum.dataset.tur = tur;
  };
  const beklet = () => {
    clearInterval(sayac);
    const tik = () => {
      const kalan = beklemeKalan(denemeOku(), Date.now());
      const kapali = kalan > 0;
      for (const b of tuslar) b.disabled = kapali;
      if (kapali) yazDurum(`Çok fazla yanlış deneme. ${Math.ceil(kalan / 1000)} sn sonra tekrar dene.`, 'hata');
      else {
        clearInterval(sayac);
        yazDurum('Şimdi tekrar deneyebilirsin.');
      }
    };
    tik();
    if (beklemeKalan(denemeOku(), Date.now()) > 0) sayac = setInterval(tik, 500);
  };

  function ekle(rakam) {
    if (mesgul || giris.length >= kayit.n || beklemeKalan(denemeOku(), Date.now()) > 0) return;
    giris += rakam;
    boya();
    if (giris.length === kayit.n) dene();
  }
  function sil() {
    if (mesgul) return;
    giris = giris.slice(0, -1);
    boya();
  }
  async function dene() {
    mesgul = true;
    const dogru = await pinDogrula(giris, kayit);
    if (dogru) {
      writeStore('local', K_DENEME, null);
      oturumAc();
      kapat();
      return;
    }
    const yeni = yanlisSay(denemeOku(), Date.now());
    yaz('local', K_DENEME, yeni);
    giris = '';
    noktalar.classList.remove('salla');
    void noktalar.offsetWidth; // animasyonu yeniden başlat
    noktalar.classList.add('salla');
    import('./mobil.js').then((m) => m.titret([60, 40, 60])).catch(() => {});
    setTimeout(() => { mesgul = false; boya(); }, 260);
    if (yeni.kadar) beklet();
    else {
      const hak = kalanHak(yeni);
      yazDurum(`Yanlış PIN. ${hak} hakkın kaldı.`, 'hata');
    }
  }

  const tusTakimi = h('div', { class: 'kilit-tuslar' },
    ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(tus),
    h('span', { 'aria-hidden': 'true' }), tus('0'), silTus);

  const unuttum = h('button', {
    type: 'button',
    class: 'kilit-unuttum',
    onclick: async () => {
      const ok = await confirmDialog(
        'PIN\'i unuttuysan bu cihaz odanızı unutur ve PIN silinir. Odanıza davet linkini yeniden açarak dönersin. Devam edilsin mi?',
        { ok: 'Odayı bu cihazdan unut', cancel: 'Vazgeç' });
      if (!ok) return;
      unuttum.disabled = true; // bildirim kapatılırken (en çok 5 sn) ikinci tıklama olmasın
      const { currentRoom } = await import('./identity.js');
      await cihazdanUnut(currentRoom());
      await kilitAyarla(null);
      location.replace(lobbyUrl());
    },
  }, 'PIN\'i unuttum');

  kok.append(h('div', { class: 'kilit-kart' },
    h('div', { class: 'kilit-mark', 'aria-hidden': 'true', html: ICONS.mark }),
    h('h2', { class: 'kilit-baslik', id: 'kilit-baslik' }, 'PIN\'ini gir'),
    noktalar,
    durum,
    tusTakimi,
    unuttum));
  boya();
  yazDurum('Biz İkimiz kilitli. Açmak için PIN\'ini gir.');
  if (beklemeKalan(denemeOku(), Date.now()) > 0) beklet();

  const tusBasildi = (e) => {
    if (document.querySelector('dialog[open]')) return; // onay penceresi açıkken
    if (/^[0-9]$/.test(e.key)) { e.preventDefault(); ekle(e.key); } else if (e.key === 'Backspace') { e.preventDefault(); sil(); }
  };
  document.addEventListener('keydown', tusBasildi);
  tuslar[0].focus({ preventScroll: true });

  let coz;
  const acildi = new Promise((r) => { coz = r; });
  function kapat() {
    clearInterval(sayac);
    document.removeEventListener('keydown', tusBasildi);
    izle.disconnect();
    for (const [el, v] of onceki) el.inert = v;
    html.style.overflow = tasma;
    kok.remove();
    kapak = null;
    coz();
  }
  return acildi;
}
