// Yılımız paylaşım görseli: canvas → PNG (1080×1350). Renkler base.css değişkenlerinden okunur.
// Paylaş: navigator.share dosya destekliyorsa; yoksa indir.

const W = 1080;
const H = 1350;
const P = 96;
const HEART_D =
  'M12 20.7c-.27 0-.53-.09-.75-.27C6.6 16.6 3 13.5 3 9.45 3 6.68 5.13 4.5 7.8 4.5c1.68 0 3.2.83 4.2 2.15 1-1.32 2.52-2.15 4.2-2.15 2.67 0 4.8 2.18 4.8 4.95 0 4.05-3.6 7.15-8.25 10.98-.22.18-.48.27-.75.27z';
const DISPLAY = "'Fraunces', Georgia, serif";
const BODY = "'Nunito', 'Segoe UI', system-ui, sans-serif";

function renkler() {
  const css = getComputedStyle(document.documentElement);
  const v = (ad) => css.getPropertyValue(ad).trim();
  return { zemin: v('--hero'), yazi: v('--hero-ink'), soluk: v('--hero-muted'), vurgu: v('--hero-accent') };
}

async function fontlar() {
  try {
    await Promise.all([
      document.fonts.load(`600 200px ${DISPLAY}`),
      document.fonts.load(`italic 500 72px ${DISPLAY}`),
      document.fonts.load(`700 38px ${BODY}`),
    ]);
  } catch { /* sistem yazısıyla çizilir */ }
}

/** Metni genişliğe sığdırır: sığmazsa yazı boyunu küçültür. */
function sigdir(ctx, metin, font, boy, enCok) {
  let b = boy;
  ctx.font = font(b);
  while (b > 24 && ctx.measureText(metin).width > enCok) { b -= 4; ctx.font = font(b); }
  return b;
}

/** g = gorselOzeti(...) → Promise<Blob> (image/png). */
export async function gorselCiz(g) {
  await fontlar();
  const r = renkler();
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');

  ctx.fillStyle = r.zemin;
  ctx.fillRect(0, 0, W, H);
  const isik = ctx.createRadialGradient(W * 0.5, -160, 40, W * 0.5, -160, 1150);
  isik.addColorStop(0, r.vurgu);
  isik.addColorStop(1, r.zemin);
  ctx.globalAlpha = 0.32;
  ctx.fillStyle = isik;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;

  // Üst: kalp + uygulama adı.
  ctx.save();
  ctx.translate(P, P - 8);
  ctx.scale(2.6, 2.6);
  ctx.fillStyle = r.vurgu;
  ctx.fill(new Path2D(HEART_D));
  ctx.restore();
  ctx.fillStyle = r.yazi;
  ctx.textBaseline = 'alphabetic';
  ctx.font = `800 40px ${BODY}`;
  ctx.fillText('Biz İkimiz', P + 78, P + 40);
  if (g.emoji) {
    ctx.font = '96px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(g.emoji, W - P, P + 62);
    ctx.textAlign = 'left';
  }

  // Yıl ve adlar.
  ctx.fillStyle = r.yazi;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '-10px';
  ctx.font = `600 300px ${DISPLAY}`;
  ctx.fillText(String(g.yil), P - 12, 500);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  ctx.fillStyle = r.vurgu;
  sigdir(ctx, g.adlar, (b) => `italic 500 ${b}px ${DISPLAY}`, 76, W - 2 * P);
  ctx.fillText(g.adlar, P, 600);

  ctx.strokeStyle = r.soluk;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(P, 668);
  ctx.lineTo(W - P, 668);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Sayılar: iki sütun, en çok üç satır.
  const kol = (W - 2 * P) / 2;
  g.sayilar.slice(0, 6).forEach((s, i) => {
    const x = P + (i % 2) * kol;
    const y = 790 + Math.floor(i / 2) * 170;
    ctx.fillStyle = r.yazi;
    sigdir(ctx, s.deger, (b) => `600 ${b}px ${DISPLAY}`, 104, kol - 24);
    ctx.fillText(s.deger, x, y);
    ctx.fillStyle = r.soluk;
    ctx.font = `700 36px ${BODY}`;
    ctx.fillText(s.etiket, x + 2, y + 50);
  });
  if (!g.sayilar.length) {
    ctx.fillStyle = r.soluk;
    ctx.font = `italic 500 56px ${DISPLAY}`;
    ctx.fillText('Hikâyemiz yeni başlıyor.', P, 820);
  }

  ctx.fillStyle = r.soluk;
  ctx.font = `700 34px ${BODY}`;
  ctx.fillText('Yılımız', P, H - P + 10);

  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Görsel hazırlanamadı.'))), 'image/png'));
}

/** Bu tarayıcı dosya paylaşabilir mi? */
export function dosyaPaylasilir() {
  try {
    const f = new File([new Uint8Array(1)], 'deneme.png', { type: 'image/png' });
    return !!(navigator.canShare && navigator.share && navigator.canShare({ files: [f] }));
  } catch {
    return false;
  }
}

/** -> 'paylasildi' | 'vazgecildi' | 'indirildi' */
export async function paylasVeyaIndir(blob, { ad, baslik }) {
  const dosya = new File([blob], ad, { type: 'image/png' });
  if (dosyaPaylasilir()) {
    try {
      await navigator.share({ files: [dosya], title: baslik });
      return 'paylasildi';
    } catch (e) {
      if (e?.name === 'AbortError') return 'vazgecildi';
      // Paylaşım reddedildi: indirmeye düş.
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = ad;
  a.hidden = true;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
  return 'indirildi';
}
