// Metin ya da ikili dosyayı paylaşır veya indirir (takvim .ics, yedek .json, tam yedek .bizyedek). Sayfa arayüzü sonuca göre mesaj gösterir.
// Android uygulaması (Capacitor) WebView'ında <a download> çalışmaz: Filesystem + Share eklentisi gerekir.
import { isNative } from './mobil.js';

function tarayiciOrtami() {
  return {
    nav: globalThis.navigator,
    doc: globalThis.document,
    yerel: isNative(),
    eklenti: (ad) => globalThis.Capacitor?.Plugins?.[ad] || null,
    zamanla: (fn, ms) => setTimeout(fn, ms),
  };
}

// Tarayıcı: AbortError. Capacitor Share eklentisi: "Share canceled".
const iptalMi = (e) => e?.name === 'AbortError' || /cancel/i.test(e?.message || '');

const BLOB_PARCA = 3 * 1024 * 1024; // 3'ün katı: parçalar ayrı ayrı geçerli base64 olur

function base64(baytlar) {
  let s = '';
  for (let i = 0; i < baytlar.length; i += 32768) s += String.fromCharCode(...baytlar.subarray(i, i + 32768));
  return btoa(s);
}

/** Uygulamada büyük dosya: köprü tek seferde taşıyamaz; önbelleğe parça parça yazılır. -> uri */
async function blobYaz(fs, blob, ad) {
  let uri;
  for (let i = 0; i < blob.size || i === 0; i += BLOB_PARCA) {
    const data = base64(new Uint8Array(await blob.slice(i, i + BLOB_PARCA).arrayBuffer()));
    if (i === 0) ({ uri } = await fs.writeFile({ path: ad, data, directory: 'CACHE' }));
    else await fs.appendFile({ path: ad, data, directory: 'CACHE' });
  }
  return uri;
}

/**
 * Sıra:
 * 1. webShare açıksa ve Web Share dosyayı kabul ediyorsa paylaş.
 * 2. Uygulamada Filesystem + Share eklentisi varsa dosyayı önbelleğe yazıp paylaş, yoksa 'yok'.
 * 3. Tarayıcıda <a download>.
 * -> 'paylasildi' | 'iptal' | 'indirildi' | 'yok' | 'hata'. Hata fırlatmaz.
 */
export async function dosyaPaylas({ metin, blob, ad, tur, baslik = 'Biz İkimiz', dialogBaslik, webShare = true }, o = tarayiciOrtami()) {
  try {
    const icerik = blob ?? metin;
    const dosya = webShare && typeof File === 'function' ? new File([icerik], ad, { type: tur }) : null;
    if (dosya && o.nav?.canShare?.({ files: [dosya] })) {
      try {
        await o.nav.share({ files: [dosya], title: baslik });
        return 'paylasildi';
      } catch (e) {
        if (iptalMi(e)) return 'iptal';
        // İzin ya da tür hatası: aşağıdaki yollara düş.
      }
    }
    if (o.yerel) {
      const fs = o.eklenti('Filesystem');
      const share = o.eklenti('Share');
      if (typeof fs?.writeFile !== 'function' || typeof share?.share !== 'function') return 'yok';
      const { uri } = blob
        ? { uri: await blobYaz(fs, blob, ad) }
        : await fs.writeFile({ path: ad, data: metin, directory: 'CACHE', encoding: 'utf8' });
      await share.share({ title: baslik, files: [uri], dialogTitle: dialogBaslik });
      return 'paylasildi';
    }
    const url = URL.createObjectURL(new Blob([icerik], { type: tur }));
    const a = o.doc.createElement('a');
    a.href = url;
    a.download = ad;
    a.hidden = true;
    o.doc.body.append(a);
    a.click();
    a.remove();
    o.zamanla(() => URL.revokeObjectURL(url), 30000);
    return 'indirildi';
  } catch (e) {
    if (iptalMi(e)) return 'iptal';
    console.warn('[dosya] paylaşım', e);
    return 'hata';
  }
}
