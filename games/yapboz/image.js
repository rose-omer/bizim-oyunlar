// Fotoğrafı yapboza hazırlar: EXIF yönü düzeltilir, uzun kenar ≤ 2000 px, JPEG 0.88.
// Saf yardımcılar (fitSize, isHeic, decodeErrorText) DOM'a dokunmaz; testlenir.

export const MAX_SIDE = 2000;
export const JPEG_QUALITY = 0.88;
export const MAX_BYTES = 4.5 * 1024 * 1024; // Supabase 'photos' kovası 5 MB sınırı
const MIN_SIDE = 64;

export class PhotoError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PhotoError';
  }
}

// Uzun kenarı max'a indirir; büyütmez. Sonuç tam sayı, en az 1.
export function fitSize(width, height, max = MAX_SIDE) {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const scale = Math.min(1, max / Math.max(w, h));
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  };
}

export function isHeic(file) {
  return /hei[cf]/i.test(file?.type || '') || /\.hei[cf]$/i.test(file?.name || '');
}

export function decodeErrorText(file) {
  if (isHeic(file)) {
    return 'Bu tarayıcı HEIC fotoğrafı açamıyor. Fotoğrafı JPEG olarak kaydedip tekrar dene.';
  }
  return 'Bu fotoğraf açılamadı. Başka bir fotoğraf dener misin?';
}

// Seçilen dosya -> { blob (JPEG), image (ImageBitmap | tuval), width, height }
export async function normalizeImage(file) {
  if (!file || typeof file.size !== 'number') throw new PhotoError('Lütfen bir fotoğraf seç.');
  if (file.type && !file.type.startsWith('image/')) {
    throw new PhotoError('Bu bir fotoğraf değil gibi. Lütfen bir fotoğraf seç.');
  }
  let src;
  try {
    src = await decodeSource(file);
  } catch {
    throw new PhotoError(decodeErrorText(file));
  }
  try {
    if (!src.width || !src.height) throw new PhotoError(decodeErrorText(file));
    if (Math.min(src.width, src.height) < MIN_SIDE) {
      throw new PhotoError('Bu fotoğraf çok küçük. Daha büyük bir fotoğraf seç.');
    }
    const { width, height } = fitSize(src.width, src.height);
    const canvas = makeCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; // saydam PNG'ler siyah olmasın
    ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src.source, 0, 0, width, height);
    let blob = await encodeJpeg(canvas, JPEG_QUALITY);
    for (const quality of [0.78, 0.66]) {
      if (blob.size <= MAX_BYTES) break;
      blob = await encodeJpeg(canvas, quality);
    }
    const image = await toBitmap(canvas);
    return { blob, image, width, height };
  } finally {
    src.close();
  }
}

// Hazır (normalize) JPEG Blob -> { image, width, height }. Misafir ve "devam" için.
export async function decodeImage(blob) {
  let src;
  try {
    src = await decodeSource(blob);
  } catch {
    throw new PhotoError('Fotoğraf açılamadı.');
  }
  if (!src.width || !src.height) {
    src.close();
    throw new PhotoError('Fotoğraf açılamadı.');
  }
  return { image: src.source, width: src.width, height: src.height };
}

async function decodeSource(blob) {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch {
      // Eski Safari seçenekleri desteklemez; <img> ile dene.
    }
  }
  const img = await loadImg(blob);
  return { source: img, width: img.naturalWidth, height: img.naturalHeight, close() {} };
}

function loadImg(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Görüntü çözülemedi'));
    };
    img.src = url;
  });
}

function makeCanvas(width, height) {
  if (typeof OffscreenCanvas === 'function') {
    try {
      const canvas = new OffscreenCanvas(width, height);
      if (typeof canvas.convertToBlob === 'function' && canvas.getContext('2d')) return canvas;
    } catch {
      // DOM tuvaline geç.
    }
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function encodeJpeg(canvas, quality) {
  if (typeof canvas.convertToBlob === 'function') {
    return canvas.convertToBlob({ type: 'image/jpeg', quality });
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('JPEG kodlanamadı'))), 'image/jpeg', quality);
  });
}

async function toBitmap(canvas) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(canvas);
    } catch {
      // Tuvalin kendisi de drawImage kaynağıdır.
    }
  }
  return canvas;
}
