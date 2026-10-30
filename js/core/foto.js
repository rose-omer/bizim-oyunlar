// Fotoğraf seç, küçült, yükle (SOZLESME §20). Küçültme games/yapboz/image.js'tedir (EXIF yönü, ≤ 2000 px, JPEG);
// yükleme storage.js'tedir (Supabase 'photos' kovası ya da yerel modda IndexedDB). Burada yeni küçültme kodu yok.
// Node'da içe aktarılabilir: tarayıcı nesnelerine yalnız fonksiyon içinde erişilir.
import { normalizeImage, decodeErrorText, isHeic, PhotoError } from '../../games/yapboz/image.js';
import { uploadPhoto, loadPhoto, isAllowedPhotoUrl } from './storage.js';

export const EN_FAZLA = 10;

// ---------- Saf yardımcılar (test edilir) ----------

/** Dosya fotoğraf mı (tür ya da uzantı)? HEIC de sayılır: açılamazsa doğru hata metni gösterilir. */
export function fotoMu(file) {
  if (!file) return false;
  if (typeof file.type === 'string' && file.type.startsWith('image/')) return true;
  return isHeic(file) || /\.(jpe?g|png|webp|gif|avif|bmp)$/i.test(file.name || '');
}

/** -> { secilen: File[], atlanan: sayı (fotoğraf değil), fazla: sayı (sınırı aşan) } */
export function secilecekDosyalar(files, enFazla = EN_FAZLA) {
  const hepsi = Array.from(files || []);
  const fotolar = hepsi.filter(fotoMu);
  const sinir = Math.max(0, Math.floor(enFazla));
  return {
    secilen: fotolar.slice(0, sinir),
    atlanan: hepsi.length - fotolar.length,
    fazla: Math.max(0, fotolar.length - sinir),
  };
}

/** Hata → kullanıcıya gösterilecek Türkçe metin. */
export function hataMetni(err, file) {
  if (err instanceof PhotoError || err?.name === 'PhotoError') return err.message;
  const m = String(err?.message || '');
  if (/^Fotoğraf|oda gerekli|yerel fotoğraf/i.test(m)) return m;
  if (file && isHeic(file)) return decodeErrorText(file);
  return 'Fotoğraf yüklenemedi. Bağlantını kontrol edip tekrar dene.';
}

// ---------- Yükleme ----------

/**
 * Dosyaları sırayla küçültüp yükler (sürükle-bırak ve <input type=file> için). -> [url]
 * onIlerleme({ bitti, toplam }) başta (bitti: 0) ve her dosyadan sonra çağrılır.
 * Bir dosya başarısız olursa onHata(metin, dosya) çağrılır, diğerleri devam eder.
 * Hiçbiri yüklenemezse Türkçe hata fırlatır.
 */
export async function fotoYukle(roomId, files, { enFazla = EN_FAZLA, onIlerleme, onHata } = {}) {
  const { secilen, atlanan, fazla } = secilecekDosyalar(files, enFazla);
  if (!secilen.length) {
    if (enFazla <= 0) throw new Error('Fotoğraf sınırı doldu.');
    throw new Error(atlanan ? 'Bu bir fotoğraf değil gibi. Lütfen bir fotoğraf seç.' : 'Fotoğraf seçilmedi.');
  }
  if (fazla) onHata?.(`En çok ${enFazla} fotoğraf eklenebilir; ilk ${secilen.length} tanesini aldım.`, null);
  if (atlanan) onHata?.(`${atlanan} dosya fotoğraf olmadığı için atlandı.`, null);

  const urls = [];
  let ilkHata = null;
  onIlerleme?.({ bitti: 0, toplam: secilen.length });
  for (let i = 0; i < secilen.length; i++) {
    const file = secilen[i];
    try {
      const { blob, image } = await normalizeImage(file);
      image?.close?.(); // ImageBitmap belleğini bırak; burada yalnız JPEG gerekir
      urls.push(await uploadPhoto(blob, roomId));
    } catch (e) {
      const metin = hataMetni(e, file);
      ilkHata ||= metin;
      onHata?.(metin, file);
    }
    onIlerleme?.({ bitti: i + 1, toplam: secilen.length });
  }
  if (!urls.length) throw new Error(ilkHata || 'Fotoğraf yüklenemedi.');
  return urls;
}

/** Dosya seçiciyi açar. -> File[] (vazgeçilirse []). Kullanıcı tıklamasıyla çağrılmalı. */
export function dosyaSec({ coklu = false } = {}) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = !!coklu;
    input.hidden = true;
    let bitti = false;
    const bitir = (files) => {
      if (bitti) return;
      bitti = true;
      window.removeEventListener('focus', odak);
      input.remove();
      resolve(files);
    };
    // 'cancel' olayı olmayan tarayıcılar: pencere odağı dönüp bir süre seçim gelmezse vazgeçilmiş say.
    const odak = () => setTimeout(() => bitir(Array.from(input.files || [])), 1500);
    input.addEventListener('change', () => bitir(Array.from(input.files || [])));
    input.addEventListener('cancel', () => bitir([]));
    document.body.append(input);
    setTimeout(() => window.addEventListener('focus', odak, { once: true }), 300);
    input.click();
  });
}

/**
 * Dosya seçici aç, seçilenleri küçült ve yükle. -> [url] (vazgeçilirse []).
 * Seçimden sonra onIlerleme({ bitti: 0, toplam }) gelir: "yükleniyor" durumu o an açılmalı.
 */
export async function fotoSecVeYukle(roomId, { coklu = false, enFazla = EN_FAZLA, onIlerleme, onHata } = {}) {
  const files = await dosyaSec({ coklu });
  if (!files.length) return [];
  return fotoYukle(roomId, coklu ? files : files.slice(0, 1), { enFazla: coklu ? enFazla : 1, onIlerleme, onHata });
}

// ---------- Gösterim ----------

const yerelOnbellek = new Map(); // 'local:<id>' → Promise<objectURL>

/** Fotoğraf adresi → <img src> için adres. Yerel modda IndexedDB'den object URL. İzin dışı adres: null. */
export async function fotoAdresi(url) {
  if (!isAllowedPhotoUrl(url)) return null;
  if (!url.startsWith('local:')) return url;
  if (!yerelOnbellek.has(url)) {
    const p = loadPhoto(url).then((blob) => URL.createObjectURL(blob));
    p.catch(() => yerelOnbellek.delete(url));
    yerelOnbellek.set(url, p);
  }
  return yerelOnbellek.get(url);
}

let gozcu = null;
function yerelGozcu() {
  if (gozcu || typeof IntersectionObserver !== 'function') return gozcu;
  gozcu = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      gozcu.unobserve(e.target);
      yerelYukle(e.target);
    }
  }, { rootMargin: '400px 0px' });
  return gozcu;
}

function yerelYukle(img) {
  fotoAdresi(img.dataset.foto)
    .then((src) => { if (src) img.src = src; else img.dataset.hata = '1'; })
    .catch(() => { img.dataset.hata = '1'; });
}

/**
 * Tembel yüklenen <img>. Supabase adresi doğrudan (loading=lazy); yerel modda görününce IndexedDB'den.
 * İzin verilmeyen adres gösterilmez (data-hata="1").
 */
export function fotoImg(url, { alt = '', className = '', eager = false } = {}) {
  const img = document.createElement('img');
  img.alt = alt;
  img.decoding = 'async';
  img.loading = eager ? 'eager' : 'lazy';
  if (className) img.className = className;
  img.addEventListener('error', () => { img.dataset.hata = '1'; });
  if (!isAllowedPhotoUrl(url)) {
    img.dataset.hata = '1';
    return img;
  }
  if (!url.startsWith('local:')) {
    img.src = url;
    return img;
  }
  img.dataset.foto = url;
  const g = eager ? null : yerelGozcu();
  if (g) g.observe(img);
  else yerelYukle(img);
  return img;
}
