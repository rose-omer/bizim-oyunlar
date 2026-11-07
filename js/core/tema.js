// Ortak tema: seçim iki kişide aynıdır (tür 'cift': { tema, temaAt }). Bu cihazda 'bizim.tema' içinde durur.
// Varsayılan temanın (pamuk) dosyası yoktur: css/base.css ve sayfa CSS'leri odur.
// Diğerleri için css/temalar/<id>/temel.css base.css'in ardına, sayfalar.css <head>'in sonuna takılır (dev/tema-uret.mjs üretir).
// Kimlikler js/core/erken.js ile aynı olmalı (test eder).
export const VARSAYILAN_TEMA = 'pamuk';
export const TEMALAR = Object.freeze([
  { id: 'pamuk', ad: 'Pamuk Şeker' },
  { id: 'klasik', ad: 'Klasik' },
  { id: 'ucak', ad: 'Uçak Postası' },
  { id: 'defter', ad: 'Anı Defteri' },
  { id: 'yildiz', ad: 'Yıldız Haritası' },
  { id: 'popbant', ad: 'Pop Bant' },
  { id: 'balon', ad: 'Cam Balon' },
  { id: 'piksel', ad: 'Piksel' },
  { id: 'dergi', ad: 'Dergi' },
  { id: 'yesilcam', ad: 'Yeşilçam' },
  { id: 'iznik', ad: 'İznik' },
  { id: 'sivicam', ad: 'Sıvı Cam' },
  { id: 'sessiz', ad: 'Sessiz' },
]);
const KIMLIK = new Set(TEMALAR.map((t) => t.id));

// Simge çizimleri de değişen temalar: js/core/tema-ikon/<id>.js (dev/tema-uret.mjs üretir).
export const IKONLU_TEMALAR = Object.freeze(['yildiz', 'popbant', 'piksel', 'iznik', 'sessiz']);

// Koyu tasarlanan temalar: mod 'otomatik' iken koyu açılır (seçicideki görünümle aynı olsun). erken.js ile aynı olmalı.
export const KOYU_TEMALAR = Object.freeze(['yildiz', 'piksel', 'sivicam']);

/** Saf: <html data-mod> değeri. Kullanıcı açık ya da koyu seçtiyse o geçerlidir. */
export function temaModu(tema, mod) {
  return mod === 'otomatik' && KOYU_TEMALAR.includes(tema) ? 'koyu' : mod;
}

/** Saf: bilinen kimlik ya da varsayılan. */
export function temaGecerli(id) {
  return KIMLIK.has(id) ? id : VARSAYILAN_TEMA;
}

/** Saf: temanın görünen adı; bilinmeyen -> ''. */
export function temaAdi(id) {
  return TEMALAR.find((t) => t.id === id)?.ad || '';
}

/**
 * Saf: odadan gelen seçim bu cihaza uygulanmalı mı? -> tema kimliği | null.
 * Son seçen kazanır (temaAt); bilinmeyen tema (daha yeni istemciden) yok sayılır.
 */
export function temaKarar(yerel, gelen) {
  if (!gelen || !KIMLIK.has(gelen.tema) || gelen.tema === yerel?.tema) return null;
  if (yerel?.temaAt && !(String(gelen.temaAt || '') > yerel.temaAt)) return null;
  return gelen.tema;
}

function yuklendi(link) {
  if (link.sheet) return Promise.resolve();
  return new Promise((coz, red) => {
    link.addEventListener('load', () => coz(), { once: true });
    link.addEventListener('error', () => red(new Error(`Tema yüklenemedi: ${link.href}`)), { once: true });
  });
}

let sira = 0;

/**
 * Tema CSS'ini sayfa yenilenmeden değiştirir: yenisi yüklenince eskisi çıkar (arada boş kalmaz).
 * Yüklenemezse eski tema kalır ve hata fırlatır. -> Promise (bu çağrı hâlâ en sonuncuysa true)
 */
export async function temaCssGec(id) {
  const benim = ++sira;
  const eski = [...document.querySelectorAll('link[data-tema-css]')];
  if (eski.length ? eski.every((l) => l.dataset.temaCss === id) : id === VARSAYILAN_TEMA) {
    await Promise.all(eski.map(yuklendi));
    return benim === sira;
  }
  const yeni = [];
  if (id !== VARSAYILAN_TEMA) {
    const yap = (dosya) => {
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = new URL(`../../css/temalar/${id}/${dosya}`, import.meta.url).href;
      l.dataset.temaCss = id;
      yeni.push(l);
      return l;
    };
    const taban = document.querySelector('link[href$="css/base.css"]');
    const temel = yap('temel.css');
    if (taban) taban.after(temel);
    else document.head.append(temel);
    document.head.append(yap('sayfalar.css'));
    try {
      await Promise.all(yeni.map(yuklendi));
    } catch (e) {
      for (const l of yeni) l.remove();
      throw e;
    }
  }
  if (benim !== sira) {
    for (const l of yeni) l.remove();
    return false;
  }
  for (const l of eski) l.remove();
  document.documentElement.dataset.tema = id;
  return true;
}
