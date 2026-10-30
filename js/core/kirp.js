// Fotoğraf kırpma: tam ekran pencere. Tek parmakla kaydır, iki parmakla / tekerlekle / kaydırıcıyla
// yakınlaştır, 90° döndür, sıfırla. Görsel çerçeveyi her zaman doldurur (boşluk kalmaz).
//   const blob = await fotoKirp(file, { oran: 1, cikti: 512, daire: true, baslik: 'Profil fotoğrafı' });
//   // -> JPEG Blob (cikti × cikti/oran) | null (vazgeçildi). Açılamayan dosyada PhotoError fırlatır.
// Saf geometri (aşağıdaki dışa aktarımlar) DOM'a dokunmaz; tests/kirp-geometri.test.mjs sınar.
import { normalizeImage } from '../../games/yapboz/image.js';
import { h, toast, ICONS, geriyleKapat } from './ui.js';

export const EN_COK_KAT = 5; // en çok yakınlaştırma: kapsama ölçeğinin katı
export const JPEG_KALITE = 0.88;

// ---------- Saf geometri ----------
// Ölçü  o = { W, H, fw, fh, maxKat? }: W×H görselin piksel boyu, fw×fh çerçevenin ekran boyu.
// Durum d = { s, tx, ty, r }: s = ekran px / görsel px; (tx, ty) = döndürülmüş görselin sol-üst köşesinin
// çerçeveye göre yeri; r = saat yönünde çeyrek tur sayacı (sınırsız; yön = r mod 4).

const ceyrek = (r) => ((Math.round(r) % 4) + 4) % 4;
const sinir = (x, a, b) => Math.min(b, Math.max(a, x));

/** Döndürülmüş görselin boyu. */
export function donukBoyut(o, r) {
  return ceyrek(r) % 2 ? { iw: o.H, ih: o.W } : { iw: o.W, ih: o.H };
}

/** Çerçeveyi dolduran en küçük ölçek. */
export function kapsamaOlcegi(iw, ih, fw, fh) {
  return Math.max(fw / iw, fh / ih);
}

export function olcekSiniri(o, r) {
  const { iw, ih } = donukBoyut(o, r);
  const min = kapsamaOlcegi(iw, ih, o.fw, o.fh);
  return { min, max: min * Math.max(1, o.maxKat ?? EN_COK_KAT) };
}

/** Ölçeği sınırlar, görseli çerçeveyi dolduracak biçimde iter. */
export function sinirla(d, o) {
  const { iw, ih } = donukBoyut(o, d.r);
  const { min, max } = olcekSiniri(o, d.r);
  const s = sinir(d.s, min, max);
  return {
    s,
    tx: sinir(d.tx, o.fw - iw * s, 0),
    ty: sinir(d.ty, o.fh - ih * s, 0),
    r: d.r,
  };
}

/** Ortalanmış, çerçeveyi tam dolduran durum. */
export function baslangicDurumu(o, r = 0) {
  const { iw, ih } = donukBoyut(o, r);
  const s = kapsamaOlcegi(iw, ih, o.fw, o.fh);
  return sinirla({ s, tx: (o.fw - iw * s) / 2, ty: (o.fh - ih * s) / 2, r }, o);
}

export function kaydir(d, dx, dy, o) {
  return sinirla({ ...d, tx: d.tx + dx, ty: d.ty + dy }, o);
}

/** Ölçeği yeniS yapar; odak (çerçeve koordinatı) altındaki görsel noktası yerinde kalır. */
export function odakliOlcekle(d, yeniS, odak, o) {
  const { min, max } = olcekSiniri(o, d.r);
  const s = sinir(yeniS, min, max);
  const px = (odak.x - d.tx) / d.s;
  const py = (odak.y - d.ty) / d.s;
  return sinirla({ s, tx: odak.x - px * s, ty: odak.y - py * s, r: d.r }, o);
}

/** Yakınlık: 1 (kapsama) … maxKat. */
export function yakinlik(d, o) {
  return d.s / olcekSiniri(o, d.r).min;
}

/**
 * İki parmak: bas = başlangıç durumu, a1/a2 = başlangıç noktaları, b1/b2 = şimdiki noktalar (çerçeve
 * koordinatı). Ölçek mesafe oranıyla değişir; başlangıçtaki orta noktanın altındaki görsel noktası şimdiki
 * orta noktaya gider (iki parmakla kaydırma da olur).
 */
export function pinchDurumu(bas, a1, a2, b1, b2, o) {
  const da = Math.hypot(a2.x - a1.x, a2.y - a1.y);
  const db = Math.hypot(b2.x - b1.x, b2.y - b1.y);
  const oran = da > 1 ? db / da : 1;
  const ma = { x: (a1.x + a2.x) / 2, y: (a1.y + a2.y) / 2 };
  const mb = { x: (b1.x + b2.x) / 2, y: (b1.y + b2.y) / 2 };
  const { min, max } = olcekSiniri(o, bas.r);
  const s = sinir(bas.s * oran, min, max);
  const px = (ma.x - bas.tx) / bas.s;
  const py = (ma.y - bas.ty) / bas.s;
  return sinirla({ s, tx: mb.x - px * s, ty: mb.y - py * s, r: bas.r }, o);
}

/** Saat yönünde 90°. Yakınlık ve çerçeve ortasındaki görsel noktası korunur (sınır izin verdikçe). */
export function dondur(d, o) {
  const { ih } = donukBoyut(o, d.r);
  const kat = yakinlik(d, o);
  const cx = o.fw / 2;
  const cy = o.fh / 2;
  const px = (cx - d.tx) / d.s;
  const py = (cy - d.ty) / d.s;
  const nx = ih - py; // (u, v) → (ih − v, u)
  const ny = px;
  const r = d.r + 1;
  const s = olcekSiniri(o, r).min * kat;
  return sinirla({ s, tx: cx - nx * s, ty: cy - ny * s, r }, o);
}

/** Çerçeve boyu değişince (döndürme, pencere boyu): yakınlık ve ortadaki görsel noktası korunur. */
export function yenidenOlcekle(d, eski, yeni) {
  const kat = yakinlik(d, eski);
  const px = (eski.fw / 2 - d.tx) / d.s;
  const py = (eski.fh / 2 - d.ty) / d.s;
  const s = olcekSiniri(yeni, d.r).min * kat;
  return sinirla({ s, tx: yeni.fw / 2 - px * s, ty: yeni.fh / 2 - py * s, r: d.r }, yeni);
}

/** Alana (kenar boşluğuyla) sığan en büyük `oran` dikdörtgeni; tam sayı. */
export function cerceveBoyu(alanW, alanH, oran, bosluk = 20) {
  const w = Math.max(1, alanW - 2 * bosluk);
  const hh = Math.max(1, alanH - 2 * bosluk);
  const r = oran > 0 ? oran : 1;
  if (w / hh > r) return { fw: Math.max(1, Math.floor(hh * r)), fh: Math.max(1, Math.floor(hh)) };
  return { fw: Math.max(1, Math.floor(w)), fh: Math.max(1, Math.floor(w / r)) };
}

/** Kırpılan alan, döndürülmüş görselin piksel koordinatında. */
export function kirpmaAlani(d, o) {
  return { x: -d.tx / d.s, y: -d.ty / d.s, w: o.fw / d.s, h: o.fh / d.s };
}

export function ciktiBoyu(cikti, oran) {
  const w = Math.max(1, Math.round(Number(cikti) || 0));
  return { w, h: Math.max(1, Math.round(w / (oran > 0 ? oran : 1))) };
}

/** Özgün görsel → döndürülmüş görsel (tuval setTransform sırası: [a, b, c, d, e, f]). */
export function donusMatrisi(r, W, H) {
  switch (ceyrek(r)) {
    case 1: return [0, 1, -1, 0, H, 0];   // (x, y) → (H − y, x)
    case 2: return [-1, 0, 0, -1, W, H];  // (x, y) → (W − x, H − y)
    case 3: return [0, -1, 1, 0, 0, W];   // (x, y) → (y, W − x)
    default: return [1, 0, 0, 1, 0, 0];
  }
}

/** Özgün görsel → cw×ch çıktı tuvali: kırpma alanı tuvali tam doldurur. */
export function ciktiMatrisi(d, o, cw, ch) {
  const [a, b, c, dd, e, f] = donusMatrisi(d.r, o.W, o.H);
  const k = kirpmaAlani(d, o);
  const kx = cw / k.w;
  const ky = ch / k.h;
  return [kx * a, ky * b, kx * c, ky * dd, kx * (e - k.x), ky * (f - k.y)];
}

/**
 * Ekran için: görsel merkezinin çerçevedeki yeri (cx, cy), açı (derece; sayaç sınırsız, CSS geçişi
 * saat yönünde döner) ve ölçek. CSS: translate(cx, cy) rotate(aci) scale(s) translate(−W/2, −H/2).
 */
export function ekranDonusumu(d, o) {
  const { iw, ih } = donukBoyut(o, d.r);
  return { cx: d.tx + (iw * d.s) / 2, cy: d.ty + (ih * d.s) / 2, aci: 90 * d.r, s: d.s };
}

// ---------- Pencere ----------
const CIZGI = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"';
const SVG = {
  eksi: '<path d="M6.5 12h11"/>',
  arti: '<path d="M12 6.5v11M6.5 12h11"/>',
  dondur: '<path d="M20 12a8 8 0 1 1-8-8c2.2 0 4.3.9 5.9 2.4L20 8.5"/><path d="M20 3.5v5h-5"/>',
};
const svg = (ad) => h('span', { class: 'kirp-svg', 'aria-hidden': 'true', html: `<svg viewBox="0 0 24 24" ${CIZGI}>${SVG[ad]}</svg>` });

const azHareket = () => {
  try { return !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};
const kabaIsaretci = () => {
  try { return !!globalThis.matchMedia?.('(pointer: coarse)').matches; } catch { return false; }
};

function jpeg(tuval) {
  return new Promise((res, rej) => {
    tuval.toBlob((b) => (b ? res(b) : rej(new Error('JPEG kodlanamadı'))), 'image/jpeg', JPEG_KALITE);
  });
}

/** Kırpılmış çıktıyı üretir: boy.w × boy.h JPEG. */
function ciktiUret(kaynak, d, o, boy) {
  const t = document.createElement('canvas');
  t.width = boy.w;
  t.height = boy.h;
  const ctx = t.getContext('2d');
  ctx.fillStyle = '#fff'; // saydam PNG siyaha dönmesin
  ctx.fillRect(0, 0, boy.w, boy.h);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.setTransform(...ciktiMatrisi(d, o, boy.w, boy.h));
  ctx.drawImage(kaynak, 0, 0);
  return jpeg(t);
}

let sira = 0;

/**
 * Tam ekran kırpma penceresi. oran = genişlik/yükseklik (kapak için 16/9), cikti = çıktı genişliği (px),
 * daire = çerçeve daire maskeli (yalnız oran 1'de). -> Promise<Blob | null>
 */
export async function fotoKirp(fileOrBlob, { oran = 1, cikti = 512, daire = true, baslik = 'Fotoğrafı ayarla' } = {}) {
  if (typeof document === 'undefined') throw new Error('fotoKirp yalnız tarayıcıda çalışır.');
  const ora = Number(oran) > 0 ? Number(oran) : 1;
  const yuvarlak = !!daire && Math.abs(ora - 1) < 1e-6;
  const boy = ciktiBoyu(cikti, ora);
  const n = ++sira;
  const id = { b: `kirp-b-${n}`, y: `kirp-y-${n}` };

  // --- DOM ---
  const gorsel = h('canvas', { class: 'kirp-gorsel', 'aria-hidden': 'true' });
  const cerceve = h('div', { class: `kirp-cerceve${yuvarlak ? ' daire' : ''}`, 'aria-hidden': 'true' },
    h('span', { class: 'kirp-izgara' }));
  const bekle = h('div', { class: 'kirp-bekle', role: 'status' },
    h('span', { class: 'kirp-bekle-kalp', 'aria-hidden': 'true', html: ICONS.heart }),
    h('span', {}, 'Fotoğraf hazırlanıyor…'));
  const sahne = h('div', {
    class: 'kirp-sahne', tabindex: '0', role: 'application', 'aria-roledescription': 'kırpma alanı',
    'aria-label': 'Fotoğrafı çerçeveye yerleştir', 'aria-describedby': id.y,
  }, gorsel, cerceve, bekle);

  const vazgecBtn = h('button', { type: 'button', class: 'kirp-metin-btn' }, 'Vazgeç');
  const sifirlaBtn = h('button', { type: 'button', class: 'kirp-metin-btn sag', disabled: true }, 'Sıfırla');
  const eksiBtn = h('button', { type: 'button', class: 'kirp-ikon', 'aria-label': 'Uzaklaştır', title: 'Uzaklaştır', disabled: true }, svg('eksi'));
  const artiBtn = h('button', { type: 'button', class: 'kirp-ikon', 'aria-label': 'Yakınlaştır', title: 'Yakınlaştır', disabled: true }, svg('arti'));
  const dondurBtn = h('button', { type: 'button', class: 'kirp-ikon', 'aria-label': '90 derece döndür', title: 'Döndür', disabled: true }, svg('dondur'));
  const olcek = h('input', {
    type: 'range', class: 'kirp-olcek', min: '1', max: String(EN_COK_KAT), step: '0.01', value: '1',
    'aria-label': 'Yakınlaştırma', disabled: true,
  });
  const kullanBtn = h('button', { type: 'button', class: 'btn primary kirp-kullan', disabled: true }, 'Kullan');
  const ipucu = h('p', { class: 'kirp-ipucu', id: id.y },
    kabaIsaretci() ? 'Sürükleyerek kaydır, iki parmakla yakınlaştır.' : 'Sürükleyerek kaydır, tekerlekle yakınlaştır.',
    h('span', { class: 'sr-only' }, ' Ok tuşları kaydırır; artı ve eksi yakınlaştırır.'));

  const dlg = h('dialog', { class: 'kirp', 'aria-labelledby': id.b },
    h('div', { class: 'kirp-ic' },
      h('div', { class: 'kirp-ust' }, vazgecBtn, h('h2', { class: 'kirp-baslik', id: id.b }, baslik), sifirlaBtn),
      sahne,
      ipucu,
      h('div', { class: 'kirp-araclar', role: 'group', 'aria-label': 'Yakınlaştır ve döndür' },
        eksiBtn, olcek, artiBtn, h('span', { class: 'kirp-ayrac', 'aria-hidden': 'true' }), dondurBtn),
      kullanBtn));

  // --- Açılış / kapanış ---
  let sonuc = null;
  let ro = null;
  let bitti;
  const bitis = new Promise((res) => { bitti = res; });
  document.body.append(dlg);
  dlg.showModal();
  sahne.focus({ preventScroll: true });
  const birak = geriyleKapat(() => { if (dlg.open) dlg.close(); });
  dlg.addEventListener('close', () => {
    birak();
    ro?.disconnect();
    dlg.remove();
    bitti(sonuc);
  });
  vazgecBtn.addEventListener('click', () => dlg.close());

  // Odak tuzağı: Tab pencerenin içinde döner.
  const tuzak = (e) => {
    const odaklar = [...dlg.querySelectorAll('button, input, [tabindex="0"]')]
      .filter((el) => !el.disabled && el.getClientRects().length);
    if (!odaklar.length) return;
    const ilk = odaklar[0];
    const son = odaklar[odaklar.length - 1];
    const aktif = document.activeElement;
    if (e.shiftKey && (aktif === ilk || !dlg.contains(aktif))) { e.preventDefault(); son.focus(); }
    else if (!e.shiftKey && (aktif === son || !dlg.contains(aktif))) { e.preventDefault(); ilk.focus(); }
  };
  dlg.addEventListener('keydown', (e) => { if (e.key === 'Tab') tuzak(e); });

  // --- Görseli hazırla (EXIF yönü, ≤ 2000 px; HEIC ve bozuk dosyada Türkçe PhotoError) ---
  let kaynak;
  try {
    kaynak = await normalizeImage(fileOrBlob);
  } catch (e) {
    if (dlg.open) dlg.close();
    throw e;
  }
  const kapatKaynak = () => { try { kaynak.image?.close?.(); } catch { /* tuval */ } };
  if (!dlg.open) { kapatKaynak(); return null; } // hazırlanırken vazgeçti
  bitis.finally(kapatKaynak);

  const { image, width: W, height: H } = kaynak;
  gorsel.width = W;
  gorsel.height = H;
  gorsel.getContext('2d').drawImage(image, 0, 0);

  // --- Durum ve çizim ---
  let o = null;
  let d = null;
  let ox = 0;
  let oy = 0;

  const merkez = () => ({ x: o.fw / 2, y: o.fh / 2 });
  const degisti = () => {
    const b = baslangicDurumu(o, d.r - ceyrek(d.r));
    return ceyrek(d.r) !== 0 || Math.abs(d.s - b.s) > 1e-6 || Math.abs(d.tx - b.tx) > 0.5 || Math.abs(d.ty - b.ty) > 0.5;
  };

  const ciz = (yumusak = false) => {
    if (!o) return;
    dlg.classList.toggle('kirp-yumusak', yumusak && !azHareket());
    const t = ekranDonusumu(d, o);
    gorsel.style.transform =
      `translate(${ox + t.cx}px, ${oy + t.cy}px) rotate(${t.aci}deg) scale(${t.s}) translate(${-W / 2}px, ${-H / 2}px)`;
    const kat = yakinlik(d, o);
    olcek.value = String(kat);
    olcek.style.setProperty('--dolu', `${((kat - 1) / (EN_COK_KAT - 1)) * 100}%`);
    olcek.setAttribute('aria-valuetext', `%${Math.round(kat * 100)}`);
    eksiBtn.disabled = kat <= 1.001;
    artiBtn.disabled = kat >= EN_COK_KAT - 0.001;
    sifirlaBtn.disabled = !degisti();
  };

  const yerlesim = () => {
    const sw = sahne.clientWidth;
    const sh = sahne.clientHeight;
    if (!sw || !sh) return;
    const { fw, fh } = cerceveBoyu(sw, sh, ora, sw < 480 ? 16 : 28);
    const yeni = { W, H, fw, fh, maxKat: EN_COK_KAT };
    d = o && d ? yenidenOlcekle(d, o, yeni) : baslangicDurumu(yeni);
    o = yeni;
    ox = Math.round((sw - fw) / 2);
    oy = Math.round((sh - fh) / 2);
    Object.assign(cerceve.style, { left: `${ox}px`, top: `${oy}px`, width: `${fw}px`, height: `${fh}px` });
    ciz();
  };

  // Ayarlarken üçte bir ızgarası görünür.
  let ayarZaman = 0;
  const ayarlaniyor = (acik) => {
    clearTimeout(ayarZaman);
    dlg.toggleAttribute('data-ayar', acik);
  };
  const kisaAyar = () => {
    ayarlaniyor(true);
    ayarZaman = setTimeout(() => dlg.removeAttribute('data-ayar'), 450);
  };
  const yakinlas = (k, odak = merkez(), yumusak = true) => {
    d = odakliOlcekle(d, d.s * k, odak, o);
    ciz(yumusak);
  };

  // Parmak / fare
  const parmaklar = new Map();
  let pinch = null;
  const yerel = (e) => {
    const r = sahne.getBoundingClientRect();
    return { x: e.clientX - r.left - ox, y: e.clientY - r.top - oy };
  };
  sahne.addEventListener('pointerdown', (e) => {
    if (!o || parmaklar.size >= 2 || (e.pointerType === 'mouse' && e.button !== 0)) return;
    try { sahne.setPointerCapture(e.pointerId); } catch { /* eski tarayıcı */ }
    parmaklar.set(e.pointerId, yerel(e));
    if (parmaklar.size === 2) {
      const [a1, a2] = [...parmaklar.values()];
      pinch = { bas: d, a1, a2 };
    }
    ayarlaniyor(true);
  });
  sahne.addEventListener('pointermove', (e) => {
    const once = parmaklar.get(e.pointerId);
    if (!once || !o) return;
    const p = yerel(e);
    parmaklar.set(e.pointerId, p);
    if (pinch && parmaklar.size === 2) {
      const [b1, b2] = [...parmaklar.values()];
      d = pinchDurumu(pinch.bas, pinch.a1, pinch.a2, b1, b2, o);
    } else {
      d = kaydir(d, p.x - once.x, p.y - once.y, o);
    }
    ciz();
  });
  const parmakKalkti = (e) => {
    if (!parmaklar.delete(e.pointerId)) return;
    pinch = null; // kalan parmak bulunduğu yerden kaydırmaya devam eder
    if (!parmaklar.size) ayarlaniyor(false);
  };
  sahne.addEventListener('pointerup', parmakKalkti);
  sahne.addEventListener('pointercancel', parmakKalkti);
  sahne.addEventListener('lostpointercapture', parmakKalkti);
  sahne.addEventListener('gesturestart', (e) => e.preventDefault()); // iOS: sayfa yakınlaşmasın
  sahne.addEventListener('wheel', (e) => {
    if (!o) return;
    e.preventDefault();
    const birim = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    yakinlas(Math.exp(-e.deltaY * birim * (e.ctrlKey ? 0.01 : 0.0015)), yerel(e), false);
    kisaAyar();
  }, { passive: false });

  // Klavye: ok tuşları kaydırır, + / − yakınlaştırır (kaydırıcı kendi oklarını kullanır).
  dlg.addEventListener('keydown', (e) => {
    if (!o || e.target === olcek || e.altKey || e.ctrlKey || e.metaKey) return;
    const adim = e.shiftKey ? 40 : 12;
    const ok = { ArrowLeft: [-adim, 0], ArrowRight: [adim, 0], ArrowUp: [0, -adim], ArrowDown: [0, adim] }[e.key];
    if (ok) {
      e.preventDefault();
      d = kaydir(d, ok[0], ok[1], o);
      ciz(true);
      kisaAyar();
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      yakinlas(1.2);
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      yakinlas(1 / 1.2);
    }
  });

  // Düğmeler
  eksiBtn.addEventListener('click', () => yakinlas(1 / 1.25));
  artiBtn.addEventListener('click', () => yakinlas(1.25));
  olcek.addEventListener('input', () => {
    d = odakliOlcekle(d, olcekSiniri(o, d.r).min * Number(olcek.value), merkez(), o);
    ciz();
    kisaAyar();
  });
  dondurBtn.addEventListener('click', () => {
    d = dondur(d, o);
    ciz(true);
  });
  sifirlaBtn.addEventListener('click', () => {
    d = baslangicDurumu(o, d.r - ceyrek(d.r)); // geri sarar: dik hâle döner
    ciz(true);
    sahne.focus({ preventScroll: true });
  });
  kullanBtn.addEventListener('click', async () => {
    if (!o || kullanBtn.disabled) return;
    kullanBtn.disabled = true;
    kullanBtn.setAttribute('aria-busy', 'true');
    kullanBtn.textContent = 'Hazırlanıyor…';
    try {
      sonuc = await ciktiUret(image, d, o, boy);
      if (dlg.open) dlg.close();
    } catch (err) {
      console.warn('[kirp]', err);
      toast('Fotoğraf hazırlanamadı. Tekrar dener misin?');
      kullanBtn.disabled = false;
      kullanBtn.removeAttribute('aria-busy');
      kullanBtn.textContent = 'Kullan';
    }
  });

  // Hazır
  dlg.dataset.hazir = '';
  for (const el of [dondurBtn, olcek, kullanBtn]) el.disabled = false;
  if (typeof ResizeObserver === 'function') {
    ro = new ResizeObserver(yerlesim);
    ro.observe(sahne);
  } else {
    globalThis.addEventListener('resize', yerlesim);
    bitis.finally(() => globalThis.removeEventListener('resize', yerlesim));
  }
  yerlesim();
  return bitis;
}
