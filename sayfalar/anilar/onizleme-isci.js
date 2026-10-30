// Önizleme işçisi (modül Worker): fotoğrafı ana iş parçacığı dışında çözer, küçültür, JPEG'e kodlar.
// Mesaj: { no, blob, kisa, uzun } -> { no, blob } | { no, ayni: true } (küçültmeye gerek yok) | { no, hata }
import { onizlemeBoyu } from './mantik.js';

self.onmessage = async (e) => {
  const { no, blob, kisa, uzun } = e.data || {};
  try {
    const bmp = await createImageBitmap(blob);
    const b = onizlemeBoyu(bmp.width, bmp.height, { kisa, uzun });
    if (!b.kucult) {
      bmp.close();
      self.postMessage({ no, ayni: true });
      return;
    }
    const tuval = new OffscreenCanvas(b.en, b.boy);
    const g = tuval.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(bmp, 0, 0, b.en, b.boy);
    bmp.close();
    const kucuk = await tuval.convertToBlob({ type: 'image/jpeg', quality: 0.82 });
    self.postMessage({ no, blob: kucuk });
  } catch (err) {
    self.postMessage({ no, hata: String(err?.message || err) });
  }
};
