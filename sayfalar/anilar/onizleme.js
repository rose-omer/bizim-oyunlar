// Küçük önizleme: 2000 px fotoğraf küçük kutuda (ızgara, kart kapağı, sohbet balonu) tam boy çözülmesin.
// Telefonda tam boy kod çözme hem belleği (fotoğraf başına ~12 MB) hem çözme süresini şişirir.
// Kutu görünüme yaklaşınca işçi (onizleme-isci.js) küçük JPEG üretir; sonuç bellekte blob: URL olarak saklanır.
// İşçi yoksa ya da hata olursa özgün adres kullanılır (foto.js fotoAdresi). Tam ekran ve galeri özgün fotoğrafı kullanır.
import { fotoAdresi } from '../../js/core/foto.js';
import { loadPhoto, isAllowedPhotoUrl } from '../../js/core/storage.js';

/** Kare kapak ve ızgara (object-fit: cover): kısa kenar 480 px (~160 CSS px × 3). */
export const KAPAK = Object.freeze({ kisa: 480 });
const ESZAMAN = 2; // aynı anda çözülen fotoğraf (geçici bellek tepe noktası)

const hazir = new Map(); // anahtar -> src
const bekleyen = new Map(); // anahtar -> Promise<src | null>
const anahtar = (url, s) => `${s.kisa || ''}x${s.uzun || ''}|${url}`;

// ---------- İşçi ----------
let isci = null;
let isciYok = false;
let sira = 0;
const isler = new Map(); // no -> sonuç fonksiyonu

function isciAl() {
  if (isci || isciYok) return isci;
  try {
    if (typeof Worker !== 'function' || typeof OffscreenCanvas !== 'function' || typeof createImageBitmap !== 'function') {
      throw new Error('desteklenmiyor');
    }
    isci = new Worker(new URL('./onizleme-isci.js', import.meta.url), { type: 'module' });
    isci.onmessage = (e) => {
      const bitir = isler.get(e.data?.no);
      if (!bitir) return;
      isler.delete(e.data.no);
      bitir(e.data);
    };
    isci.onerror = () => {
      isciYok = true;
      isci = null;
      for (const bitir of isler.values()) bitir({ hata: 'işçi' });
      isler.clear();
    };
  } catch {
    isciYok = true;
    isci = null;
  }
  return isci;
}

// ---------- Kuyruk: son istenen önce (kaydırırken ekrana yeni giren kutu beklemesin) ----------
let calisan = 0;
const kuyruk = [];
function sirala(is) {
  return new Promise((coz) => {
    kuyruk.push({ is, coz });
    dene();
  });
}
function dene() {
  while (calisan < ESZAMAN && kuyruk.length) {
    const { is, coz } = kuyruk.pop();
    calisan++;
    is().catch(() => null).then((sonuc) => {
      calisan--;
      coz(sonuc);
      dene();
    });
  }
}

// İndirme/okuma sınırsız; yalnız çözme kuyrukta.
async function uret(url, secenek) {
  if (!isciAl()) return null;
  const blob = await loadPhoto(url);
  return sirala(() => kucult(blob, url, secenek));
}

async function kucult(blob, url, secenek) {
  const w = isciAl();
  if (!w) return null;
  const no = ++sira;
  const r = await new Promise((bitir) => {
    isler.set(no, bitir);
    w.postMessage({ no, blob, kisa: secenek.kisa, uzun: secenek.uzun });
  });
  if (r.blob) return URL.createObjectURL(r.blob);
  if (r.ayni) return URL.createObjectURL(blob); // indirilen dosya elde: imzalı adres süresi dolabilir
  return null;
}

/** Fotoğraf adresi → küçük önizlemenin <img src> adresi (hata olursa özgün adres; izin dışıysa null). */
export function onizlemeAdresi(url, secenek = KAPAK) {
  if (!isAllowedPhotoUrl(url)) return Promise.resolve(null);
  const k = anahtar(url, secenek);
  if (hazir.has(k)) return Promise.resolve(hazir.get(k));
  if (!bekleyen.has(k)) {
    // Önizleme olmazsa (işçi yok, indirme/CORS hatası) özgün adrese düşülür.
    const p = uret(url, secenek)
      .catch(() => null)
      .then((src) => src || fotoAdresi(url))
      .catch(() => null)
      .then((src) => {
        bekleyen.delete(k);
        if (src) hazir.set(k, src);
        return src;
      });
    bekleyen.set(k, p);
  }
  return bekleyen.get(k);
}

// ---------- <img> bağlama: görünüme yaklaşınca üret ----------
const ayar = new WeakMap(); // img -> { url, secenek, hata }
const gozculer = new Map(); // kaydırma kökü (null = görünüm alanı) -> IntersectionObserver
function gozcuAl(kok = null) {
  if (typeof IntersectionObserver !== 'function') return null;
  let g = gozculer.get(kok);
  if (!g) {
    g = new IntersectionObserver((girdiler) => {
      for (const e of girdiler) {
        if (!e.isIntersecting) continue;
        g.unobserve(e.target);
        yukle(e.target);
      }
    }, { root: kok, rootMargin: '600px 0px' });
    gozculer.set(kok, g);
  }
  return g;
}

function yukle(img) {
  const a = ayar.get(img);
  if (!a) return;
  onizlemeAdresi(a.url, a.secenek).then((src) => {
    if (src) img.src = src;
    else a.hata();
  });
}

/**
 * Var olan <img>'yi önizlemeye bağlar. Önizleme hazırsa src hemen konur (yeniden çizimde titreme yok).
 * eager: görünürlük beklenmez. kok: iç kaydırma kutusu (yoksa görünüm alanı).
 * hata(): fotoğraf açılamazsa (varsayılan: data-hata="1").
 */
export function onizlemeBagla(img, url, { secenek = KAPAK, eager = false, kok = null, hata } = {}) {
  const hataFn = hata || (() => { img.dataset.hata = '1'; });
  if (!isAllowedPhotoUrl(url)) {
    hataFn();
    return img;
  }
  img.dataset.foto = url;
  const src = hazir.get(anahtar(url, secenek));
  if (src) {
    img.src = src;
    return img;
  }
  ayar.set(img, { url, secenek, hata: hataFn });
  const g = eager ? null : gozcuAl(kok);
  if (g) g.observe(img);
  else yukle(img);
  return img;
}

/** Önizleme <img>'si (foto.js fotoImg yerine; küçük kutular için). */
export function onizlemeImg(url, { alt = '', className = '', eager = false, secenek = KAPAK } = {}) {
  const img = document.createElement('img');
  img.alt = alt;
  img.decoding = 'async';
  if (className) img.className = className;
  img.addEventListener('error', () => { img.dataset.hata = '1'; });
  return onizlemeBagla(img, url, { secenek, eager });
}
