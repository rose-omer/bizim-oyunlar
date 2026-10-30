// Sesli mesaj: kayıt (MediaRecorder) ve tek oynatıcı (bir anda tek ses çalar).
// Saf yardımcılar Node'da test edilir; tarayıcı nesnelerine yalnız fonksiyon içinde erişilir.
import { sesTuru, SES_MAX_BAYT } from '../../js/core/storage.js';

export const SES_MAX_SN = 120;
export const SES_EN_AZ_MS = 700; // daha kısası gönderilmez (yanlışlıkla dokunma)
export const IPTAL_ESIK = 90;    // basılı tutarken bu kadar sola kaydırınca kayıt silinir (px)
// Chrome/Android: webm-opus; iPhone Safari: mp4 (AAC). Kova yalnız audio/webm ve audio/mp4 kabul eder.
export const KAYIT_TURLERI = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
const BIT_HIZI = 48000; // 2 dk ≈ 720 KB (sınır 2 MB)

export class SesHatasi extends Error {
  constructor(message) {
    super(message);
    this.name = 'SesHatasi';
  }
}

/** destekliMi(tur) -> boolean (MediaRecorder.isTypeSupported). -> ilk desteklenen kayıt türü | null */
export function kayitTuruSec(destekliMi) {
  if (typeof destekliMi !== 'function') return null;
  try {
    return KAYIT_TURLERI.find((t) => destekliMi(t)) || null;
  } catch {
    return null;
  }
}

/** '0:07', '2:00'. Aşağı yuvarlar (sayaç ileri atlamaz). */
export function sureYazisi(sn) {
  const s = Number.isFinite(sn) && sn > 0 ? Math.floor(sn) : 0;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Kayıt süresi (ms) → mesajdaki saniye: en az 1, en çok SES_MAX_SN. */
export function sesSuresi(ms) {
  if (!Number.isFinite(ms)) return 1;
  return Math.min(SES_MAX_SN, Math.max(1, Math.round(ms / 1000)));
}

/** mesaj.ses alanı: { url, sure (sn), tur (parametresiz mime) } */
export function sesVerisi({ url, ms, mime }) {
  return { url, sure: sesSuresi(ms), tur: sesTuru(mime)?.mime || null };
}

export function kaydirIptalMi(dx) {
  return dx <= -IPTAL_ESIK;
}

/** Bu tarayıcı sesli mesaj kaydedebilir mi? */
export function kayitDestegi() {
  if (typeof MediaRecorder !== 'function' || !globalThis.navigator?.mediaDevices?.getUserMedia) return false;
  return !!kayitTuruSec((t) => MediaRecorder.isTypeSupported(t));
}

function mikrofonHatasi(e) {
  if (e?.name === 'NotAllowedError' || e?.name === 'SecurityError') return 'Mikrofon izni yok. Tarayıcı ayarlarından izin verebilirsin.';
  if (e?.name === 'NotFoundError' || e?.name === 'OverconstrainedError') return 'Mikrofon bulunamadı.';
  return 'Mikrofon açılamadı. Başka bir uygulama kullanıyor olabilir.';
}

/**
 * Kaydı başlatır. -> { mime, gecen() sn, durduMu(), bitir() -> { blob, ms }, iptal() }
 * Süre (SES_MAX_SN) ya da boyut (SES_MAX_BAYT) dolunca kendisi durur ve onSinir(neden) çağrılır; blob saklanır.
 * Hata: SesHatasi (Türkçe metin).
 */
export async function kayitBaslat({ onSinir } = {}) {
  const mime = kayitDestegi() ? kayitTuruSec((t) => MediaRecorder.isTypeSupported(t)) : null;
  if (!mime) throw new SesHatasi('Bu tarayıcı ses kaydedemiyor.');
  let akis;
  try {
    akis = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } catch (e) {
    throw new SesHatasi(mikrofonHatasi(e));
  }
  const kapat = () => { for (const t of akis.getTracks()) t.stop(); };
  let kaydedici;
  try {
    kaydedici = new MediaRecorder(akis, { mimeType: mime, audioBitsPerSecond: BIT_HIZI });
  } catch {
    kapat();
    throw new SesHatasi('Bu tarayıcı ses kaydedemiyor.');
  }
  const parcalar = [];
  let bayt = 0;
  let durdu = false;
  let zaman = 0;
  const basla = performance.now();
  let bitis = 0;
  const bitti = new Promise((resolve) => {
    kaydedici.addEventListener('stop', () => { kapat(); resolve(); }, { once: true });
    kaydedici.addEventListener('error', () => { kapat(); resolve(); }, { once: true });
  });
  const durdur = () => {
    if (durdu) return;
    durdu = true;
    bitis = performance.now();
    clearTimeout(zaman);
    try {
      if (kaydedici.state !== 'inactive') kaydedici.stop();
      else kapat();
    } catch {
      kapat();
    }
  };
  const sinir = (neden) => {
    if (durdu) return;
    durdur();
    onSinir?.(neden);
  };
  kaydedici.addEventListener('dataavailable', (e) => {
    if (!e.data?.size) return;
    parcalar.push(e.data);
    bayt += e.data.size;
    if (bayt >= SES_MAX_BAYT * 0.92) sinir('boyut');
  });
  zaman = setTimeout(() => sinir('sure'), SES_MAX_SN * 1000);
  kaydedici.start(1000); // saniyede bir parça: boyut izlenir
  return {
    mime,
    gecen: () => ((bitis || performance.now()) - basla) / 1000,
    durduMu: () => durdu,
    async bitir() {
      durdur();
      await bitti;
      const blob = new Blob(parcalar, { type: kaydedici.mimeType || mime });
      return { blob, ms: bitis - basla };
    },
    iptal() {
      durdur();
      parcalar.length = 0;
    },
  };
}

/**
 * Tek oynatıcı: bir anda tek ses çalar; başka sesi açmak öncekini durdurur.
 * onDurum({ id, caliyor, konum, sure }) her değişimde (çalarken kare başına) çağrılır.
 * ac(id, src, sure): aynı id ise oynat/duraklat; değilse src'yi baştan çalar. src yalnız yeni seste gerekir.
 */
export function tekOynatici({ onDurum, onHata } = {}) {
  let a = null;
  let aktif = null; // { id, sure }
  let kare = 0;
  const toplam = () => (a && Number.isFinite(a.duration) && a.duration > 0 ? a.duration : aktif?.sure || 0);
  const durum = () => ({
    id: aktif?.id || null,
    caliyor: !!a && !a.paused && !a.ended,
    konum: !a || a.ended ? 0 : a.currentTime,
    sure: toplam(),
  });
  const bildir = () => onDurum?.(durum());
  const dongu = () => {
    cancelAnimationFrame(kare);
    bildir();
    if (a && !a.paused && !a.ended) kare = requestAnimationFrame(dongu);
  };
  const hata = () => {
    const id = aktif?.id;
    aktif = null;
    bildir();
    if (id) onHata?.(id);
  };
  function kur() {
    a = new Audio();
    a.preload = 'auto';
    a.addEventListener('play', dongu);
    a.addEventListener('pause', dongu);
    a.addEventListener('ended', dongu);
    a.addEventListener('error', () => { if (aktif && a.getAttribute('src')) hata(); });
  }
  return {
    durum,
    async ac(id, src, sure = 0) {
      if (!a) kur();
      try {
        if (aktif?.id === id) {
          if (a.paused || a.ended) await a.play();
          else a.pause();
          return;
        }
        if (!src) return;
        a.pause();
        aktif = { id, sure };
        a.src = src;
        bildir();
        await a.play();
      } catch (e) {
        if (e?.name !== 'AbortError') hata(); // AbortError: başka sese geçildi
      }
    },
    durdur() {
      a?.pause();
    },
  };
}
