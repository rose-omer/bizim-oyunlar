// Yavrumuz ses taklidi (tarayıcı): dinler, konuşmayı yakalar, bebek sesiyle tekrar eder.
// Kayıt yalnız bellekte işlenir; hiçbir yere gönderilmez, saklanmaz. Saf parçalar: ./taklit-mantik.js.
//
// Kullanım (dokunma işleyicisinin İÇİNDE, await'ten önce çağır: iOS/Android AudioContext'i ancak böyle açar):
//   const t = taklitBaslat({ onDurum: (d, ek) => ..., onAgiz: (v) => ... });   // v: 0..1
//   t.durdur();   // her an; mikrofonu kapatır, sesi keser
//   Bas-konuş: taklitBaslat({ mod: 'bas-konus', ... }) → bırakınca t.birak().
// Durumlar: 'dinliyor' → 'konusuyor' → 'tekrar' → 'bitti'; ya da 'izin-yok' | 'hata'.
//   ek: { neden } — bitti: 'tamam' | 'sessiz' | 'kisa' | 'durduruldu'; hata: 'destek-yok' | 'mikrofon' | 'isleme'.
// Mikrofon yalnız 'dinliyor' ve 'konusuyor' durumlarında açıktır (mikrofonAcikMi): gösterge buna bağlanır.
// Sayfa arka plana geçince (visibilitychange/pagehide) kendisi durur.
//
// Neden ScriptProcessorNode: AudioWorklet ayrı modül dosyası ister ve eski iOS'ta sorunlu; ScriptProcessor
// eskimiş ama Android WebView ve iOS Safari'de çalışır. sohbet/ses.js MediaRecorder ile sıkıştırılmış kayıt yapar;
// burada ham PCM gerektiği için oradan yalnız hata eşlemesi fikri alındı (mikrofonHatasi dışa açık değil).
import {
  TAKLIT, rms, birlestir, sesAlgilayici, bebekSesi, zarfCikar, agizDegeri, mikrofonHataDurumu,
} from './taklit-mantik.js';

export { mikrofonAcikMi, TAKLIT } from './taklit-mantik.js';

const BLOK = 2048;
const KARE_SN = 1 / 60;

/** Bu tarayıcı taklit yapabilir mi? */
export function taklitDestegi() {
  return !!(globalThis.navigator?.mediaDevices?.getUserMedia && (globalThis.AudioContext || globalThis.webkitAudioContext));
}

export function taklitBaslat({ onDurum, onAgiz, mod = 'otomatik', yarimTon = TAKLIT.yarimTon, hiz = TAKLIT.hiz, algilama = {} } = {}) {
  let durum = null;
  let bitti = false;
  let akis = null;
  let kaynak = null;
  let islemci = null;
  let calan = null;
  let kare = 0;
  let ctx = null;
  const parcalar = [];
  const onParcalar = []; // konuşma başlamadan önceki son ~0.3 sn
  let onBoy = 0;
  const alg = sesAlgilayici(algilama);
  let basKonusSn = 0;

  const bildir = (d, ek = {}) => {
    if (bitti) return;
    durum = d;
    try { onDurum?.(d, ek); } catch (e) { console.error(e); }
  };
  const agiz = (v) => { try { onAgiz?.(v); } catch (e) { console.error(e); } };

  function mikrofonuKapat() {
    if (islemci) { islemci.onaudioprocess = null; try { islemci.disconnect(); } catch { /* yok */ } }
    try { kaynak?.disconnect(); } catch { /* yok */ }
    for (const t of akis?.getTracks() || []) t.stop();
    islemci = null;
    kaynak = null;
    akis = null;
  }

  function temizle() {
    mikrofonuKapat();
    cancelAnimationFrame(kare);
    if (calan) { calan.onended = null; try { calan.stop(); } catch { /* çalmamış */ } calan = null; }
    agiz(0);
    parcalar.length = 0;
    onParcalar.length = 0;
    document.removeEventListener('visibilitychange', gorunurluk);
    removeEventListener('pagehide', durdur);
    ctx?.close?.().catch(() => {});
    ctx = null;
  }

  function son(d, ek) {
    if (bitti) return;
    bildir(d, ek);
    bitti = true;
    temizle();
  }

  function durdur() {
    son('bitti', { neden: 'durduruldu' });
  }

  function gorunurluk() {
    if (document.visibilityState === 'hidden') durdur();
  }

  async function tekrarEt(kuyrukSn) {
    const hz = ctx.sampleRate;
    let kayit = birlestir(parcalar);
    parcalar.length = 0;
    const kes = Math.max(0, Math.floor((kuyrukSn - 0.15) * hz)); // sondaki sessizliği at, 150 ms nefes kalsın
    if (kes) kayit = kayit.subarray(0, Math.max(0, kayit.length - kes));
    mikrofonuKapat(); // çalarken kendini duymasın; iOS da hoparlöre döner
    bildir('tekrar');
    let ses;
    try {
      ses = bebekSesi(kayit, hz, { yarimTon, hiz });
    } catch (e) {
      console.error(e);
      son('hata', { neden: 'isleme' });
      return;
    }
    if (bitti || !ses.length) { son('bitti', { neden: 'kisa' }); return; }
    const zarf = zarfCikar(ses, hz, KARE_SN);
    const tampon = ctx.createBuffer(1, ses.length, hz);
    tampon.copyToChannel(ses, 0);
    calan = ctx.createBufferSource();
    calan.buffer = tampon;
    calan.connect(ctx.destination);
    if (ctx.state !== 'running') await ctx.resume().catch(() => {});
    if (bitti) return;
    const basla = ctx.currentTime + 0.05;
    const dongu = () => {
      if (bitti || !ctx) return;
      agiz(agizDegeri(zarf, ctx.currentTime - basla, KARE_SN));
      kare = requestAnimationFrame(dongu);
    };
    calan.onended = () => son('bitti', { neden: 'tamam' });
    calan.start(basla);
    kare = requestAnimationFrame(dongu);
  }

  function blokGeldi(e) {
    if (bitti || !islemci) return;
    const veri = new Float32Array(e.inputBuffer.getChannelData(0)); // kopya: tampon yeniden kullanılır
    const dt = veri.length / ctx.sampleRate;
    if (mod === 'bas-konus') {
      parcalar.push(veri);
      basKonusSn += dt;
      if (basKonusSn >= TAKLIT.enCokSn) birak();
      return;
    }
    const olay = alg.besle(rms(veri), dt);
    if (durum === 'konusuyor') parcalar.push(veri);
    else {
      onParcalar.push(veri);
      onBoy += veri.length;
      while (onParcalar.length > 1 && onBoy - onParcalar[0].length >= TAKLIT.onSn * ctx.sampleRate) onBoy -= onParcalar.shift().length;
    }
    if (!olay) return;
    if (olay.tur === 'basladi') {
      parcalar.push(...onParcalar);
      onParcalar.length = 0;
      onBoy = 0;
      bildir('konusuyor');
    } else if (olay.tur === 'vazgec') {
      parcalar.length = 0;
      bildir('dinliyor');
    } else if (olay.tur === 'sessiz') {
      son('bitti', { neden: 'sessiz' });
    } else if (olay.tur === 'bitti') {
      tekrarEt(olay.kuyrukSn);
    }
  }

  /** Bas-konuş: parmak kalkınca. Otomatik modda konuşmayı hemen bitirir. */
  function birak() {
    if (bitti || durum === 'tekrar') return;
    if (!islemci) { durdur(); return; } // mikrofon henüz açılmadan bırakıldı (ör. izin sorusu)
    if (durum === 'konusuyor' && (mod === 'bas-konus' || parcalar.length)) {
      const sn = parcalar.reduce((t, p) => t + p.length, 0) / ctx.sampleRate;
      if (sn < TAKLIT.enAzSn) { son('bitti', { neden: 'kisa' }); return; }
      tekrarEt(0);
    } else if (durum === 'dinliyor') {
      durdur();
    }
  }

  async function ac() {
    if (!taklitDestegi()) { son('hata', { neden: 'destek-yok' }); return; }
    // Dokunuşun içinde, ilk await'ten önce: iOS ve Android WebView ancak böyle sesi açar.
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    try {
      ctx = new AC();
      ctx.resume?.().catch(() => {});
    } catch (e) {
      console.error(e);
      son('hata', { neden: 'destek-yok' });
      return;
    }
    document.addEventListener('visibilitychange', gorunurluk);
    addEventListener('pagehide', durdur);
    let a;
    try {
      a = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
    } catch (e) {
      const d = mikrofonHataDurumu(e);
      son(d, d === 'hata' ? { neden: 'mikrofon', ad: e?.name || null } : {});
      return;
    }
    if (bitti) { for (const t of a.getTracks()) t.stop(); return; }
    akis = a;
    try {
      if (ctx.state !== 'running') await ctx.resume();
      kaynak = ctx.createMediaStreamSource(akis);
      islemci = ctx.createScriptProcessor(BLOK, 1, 1);
      islemci.onaudioprocess = blokGeldi;
      kaynak.connect(islemci);
      islemci.connect(ctx.destination); // bağlı değilse Chrome işlemciyi çalıştırmaz; çıkış sessiz
    } catch (e) {
      console.error(e);
      son('hata', { neden: 'mikrofon' });
      return;
    }
    // Mikrofon izni kullanıcı başka sekmeden kapatırsa
    for (const t of akis.getTracks()) t.addEventListener('ended', () => { if (durum === 'dinliyor' || durum === 'konusuyor') son('hata', { neden: 'mikrofon' }); });
    bildir(mod === 'bas-konus' ? 'konusuyor' : 'dinliyor');
  }

  ac();
  return { durdur, birak, get durum() { return durum; } };
}
