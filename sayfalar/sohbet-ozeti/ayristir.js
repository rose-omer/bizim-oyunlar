// Sohbet Özetimiz: WhatsApp dışa aktarım metnini ayrıştırır (saf; DOM yok, Node'da test edilir).
// Çıktı: { bicim: 'android'|'ios'|null, mesajlar: [{ t: Date (yerel), kim, m }], aramalar: [Date], saniye: bool }.
// Mesaj metni yalnız bellekte kalır; hiçbir yere yazılmaz.

// Android: "4/7/25, 6:18 PM - Ad: mesaj" ya da "07.04.2025 18:18 - Ad: mesaj".
const ANDROID_RE = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4}),? (\d{1,2})[:.](\d{2})(?::(\d{2}))?(?: ?([AaPp])\.? ?[Mm]\.?)? - ([\s\S]*)$/;
// iPhone: "[8/9/26, 3:57:40 PM] Ad: mesaj" ya da "[9.08.2026 15:57:40] Ad: mesaj".
const IOS_RE = /^\[(\d{1,2})[./-](\d{1,2})[./-](\d{2,4}),? (\d{1,2})[:.](\d{2})(?::(\d{2}))?(?: ?([AaPp])\.? ?[Mm]\.?)?\] ?([\s\S]*)$/;

const GORUNMEZ_RE = /[‎‏‪-‮⁦-⁩﻿]/g;
const BOSLUK_RE = /[   ]/g;

const DUZENLENDI_RE = /\s*<(?:This message was edited|Bu mesaj düzenlendi)>\s*$/i;
const SILINEN = new Set([
  'this message was deleted', 'you deleted this message', 'bu mesaj silindi', 'bu mesajı sildiniz',
]);
// iPhone'da arama mesaj gibi gelir: "Missed voice call", "Sesli arama" …
const ARAMA_RE = /^(?:\[call\]|(?:missed )?(?:voice|video|group voice|group video) call(?:, .*)?|cevapsız (?:sesli |görüntülü )?arama|(?:sesli|görüntülü) arama(?:, .*)?)$/i;

/** Satırı temizler: görünmez yön işaretleri atılır, dar boşluklar düz boşluk olur. */
export function satirTemizle(s) {
  return String(s ?? '').replace(GORUNMEZ_RE, '').replace(BOSLUK_RE, ' ');
}

/**
 * Mesaj metninin türü. -> { tur: 'metin'|'medya'|'silinen', medya?: 'cikartma'|'foto'|'ses'|'video'|'gif'|'belge'|'not'|'konum'|'medya' }
 * Medya ve silinen mesaj sayılır, kelimeye girmez.
 */
export function icerikTuru(m) {
  const s = String(m ?? '').trim();
  const k = s.toLocaleLowerCase('tr');
  if (SILINEN.has(k)) return { tur: 'silinen' };
  if (k === 'null' || k === '<album message>' || k === '<albüm mesajı>') return { tur: 'medya', medya: k === 'null' ? 'medya' : 'foto' };
  if (/^live location shared$|^canlı konum paylaşıldı$/.test(k)) return { tur: 'medya', medya: 'konum' };
  if (/^location: |^konum: /.test(k)) return { tur: 'medya', medya: 'konum' };
  const ek = /^<attached: [^>]+>$|\(file attached\)$|\(dosya ekli\)$|\(dosya eklendi\)$/.test(k);
  const atlandi = /(?:omitted|dahil edilmedi|eklenmedi)>?$/.test(k);
  if (!ek && !atlandi) return { tur: 'metin' };
  return { tur: 'medya', medya: medyaTuru(k) };
}

function medyaTuru(k) {
  if (/media omitted|medya dahil edilmedi|medya eklenmedi/.test(k)) return 'medya';
  if (/sticker|çıkartma|cikartma|-sticker-/.test(k)) return 'cikartma';
  if (/video note|video message|görüntülü not|görüntülü mesaj|video notu/.test(k)) return 'not';
  if (/voice message|audio|ses kaydı|sesli mesaj|ses dahil|ses eklenmedi|-audio-|\.opus|\.m4a/.test(k)) return 'ses';
  if (/g[iı]f/.test(k)) return 'gif';
  if (/video|-video-|\.mp4/.test(k)) return 'video';
  if (/image|photo|görüntü|fotoğraf|resim|-photo-|\.jpe?g|\.png|\.webp/.test(k)) return 'foto';
  if (/document|belge|\.pdf/.test(k)) return 'belge';
  return 'medya';
}

/** Ayrıştırıcının durumu: parça parça satır eklenir, sonda `bitir()`. */
export function ayristirici() {
  let bicim = null;
  let re = null;
  const ham = []; // { a, b, y, H, M, S, ap, kim, m } | { arama: true, … }
  let son = null;
  let saniye = false;
  let gunIlkte = false; // ilk sayı 12'den büyük görüldü: gün/ay
  let ayIlkte = false;  // ikinci sayı 12'den büyük görüldü: ay/gün
  let ampm = false;
  let ayirac = '';

  function satir(ham0) {
    const s = satirTemizle(ham0);
    if (!re) {
      const t = s.trimStart();
      if (IOS_RE.test(t)) { bicim = 'ios'; re = IOS_RE; }
      else if (ANDROID_RE.test(t)) { bicim = 'android'; re = ANDROID_RE; }
      else return;
    }
    const x = re.exec(s.trimStart());
    if (!x) {
      if (son && !son.arama) son.m += `\n${s}`;
      return;
    }
    const [, a, b, y, H, M, S, ap, geri] = x;
    const na = +a;
    const nb = +b;
    if (na > 12) gunIlkte = true;
    if (nb > 12) ayIlkte = true;
    if (ap) ampm = true;
    if (S != null) saniye = true;
    if (!ayirac) ayirac = /^\[?\d{1,2}([./-])/.exec(s.trimStart())?.[1] || '';
    const zaman = { a: na, b: nb, y: +y, H: +H, M: +M, S: S == null ? 0 : +S, ap: ap ? ap.toLowerCase() : '' };
    let govde = geri;
    if (bicim === 'ios' && govde.startsWith('- ')) {
      // "[…] - [Call]" gibi sistem satırı
      son = /call|arama/i.test(govde) ? { ...zaman, arama: true } : null;
      if (son) ham.push(son);
      return;
    }
    const i = govde.indexOf(': ');
    if (i <= 0) { son = null; return; } // sistem satırı ("Messages and calls are end-to-end encrypted" …)
    const kim = govde.slice(0, i).trim();
    let m = govde.slice(i + 2);
    if (ARAMA_RE.test(m.trim())) {
      son = { ...zaman, arama: true, kim };
      ham.push(son);
      return;
    }
    son = { ...zaman, kim, m };
    ham.push(son);
  }

  function bitir() {
    // Gün/ay sırası: 12'den büyük ilk sayı günü gösterir; belirsizse ayırıcıya ve AM/PM'e bak.
    let gunOnce;
    if (gunIlkte && !ayIlkte) gunOnce = true;
    else if (ayIlkte && !gunIlkte) gunOnce = false;
    else gunOnce = !(ampm && ayirac === '/');
    const mesajlar = [];
    const aramalar = [];
    for (const r of ham) {
      const gun = gunOnce ? r.a : r.b;
      const ay = gunOnce ? r.b : r.a;
      const yil = r.y < 100 ? 2000 + r.y : r.y;
      let saat = r.H;
      if (r.ap === 'p' && saat < 12) saat += 12;
      if (r.ap === 'a' && saat === 12) saat = 0;
      const t = new Date(yil, ay - 1, gun, saat, r.M, r.S);
      if (Number.isNaN(t.getTime())) continue;
      if (r.arama) { aramalar.push(t); continue; }
      mesajlar.push({ t, kim: r.kim, m: r.m.replace(DUZENLENDI_RE, '') });
    }
    return { bicim, mesajlar, aramalar, saniye };
  }

  return { satir, bitir };
}

/** Eşzamanlı ayrıştırma (küçük metin ve testler için). */
export function ayristir(metin) {
  const a = ayristirici();
  for (const s of String(metin ?? '').split(/\r?\n/)) a.satir(s);
  return a.bitir();
}

/**
 * Büyük dosya: parça parça işler, araya `await` koyar (ana iş parçacığı kilitlenmez).
 * ilerleme(oran 0..1). bekle: parçalar arası bekleme (varsayılan setTimeout 0).
 */
export async function ayristirParcali(metin, { ilerleme = null, parca = 8000, bekle = () => new Promise((r) => setTimeout(r, 0)) } = {}) {
  const satirlar = String(metin ?? '').split(/\r?\n/);
  const a = ayristirici();
  for (let i = 0; i < satirlar.length; i += parca) {
    const bit = Math.min(satirlar.length, i + parca);
    for (let j = i; j < bit; j++) a.satir(satirlar[j]);
    ilerleme?.(bit / satirlar.length);
    if (bit < satirlar.length) await bekle();
  }
  return a.bitir();
}

/** Mesaj yazan adlar, çoktan aza. -> [{ ad, n }] */
export function yazanlar(mesajlar) {
  const say = new Map();
  for (const x of mesajlar || []) say.set(x.kim, (say.get(x.kim) || 0) + 1);
  return [...say].map(([ad, n]) => ({ ad, n })).sort((p, q) => q.n - p.n || p.ad.localeCompare(q.ad, 'tr'));
}
