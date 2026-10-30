// Kısa, yumuşak efektler. WebAudio ile sentez; ses dosyası yok.
// AudioContext ilk kullanıcı dokunuşunda kurulur. Sessiz ayarı localStorage 'bizim.mute'.

const MUTE_KEY = 'bizim.mute';
const MIN_GAP_MS = 30; // aynı sesin üst üste binmesini önler

let ctx = null;
let out = null;
let noiseBuf = null;
const lastAt = Object.create(null);

function readMute() {
  try { return globalThis.localStorage?.getItem(MUTE_KEY) === '1'; } catch { return false; }
}
let muted = readMute();

export function isMuted() {
  return muted;
}

export function setMuted(bool) {
  muted = !!bool;
  try { globalThis.localStorage?.setItem(MUTE_KEY, muted ? '1' : '0'); } catch { /* gizli sekme */ }
  if (!muted) unlock(); // düğme tıklaması bir kullanıcı hareketidir
  try { globalThis.dispatchEvent?.(new CustomEvent('bizim:mute', { detail: muted })); } catch { /* Node */ }
}

function unlock() {
  if (muted && !ctx) return;
  if (!ctx) {
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return;
    try { ctx = new AC(); } catch { return; }
    const comp = ctx.createDynamicsCompressor();
    out = ctx.createGain();
    out.gain.value = 0.55;
    out.connect(comp);
    comp.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
}

if (typeof window !== 'undefined') {
  // pointerdown değil: ilk kaydırma hareketinde ses kurulumu takılma yapmasın; dokunuş bitince kurulur.
  for (const type of ['pointerup', 'keydown', 'touchend']) {
    window.addEventListener(type, unlock, { capture: true, passive: true });
  }
}

function tone({ f, to, type = 'sine', at = 0, dur = 0.12, vol = 0.2, attack = 0.006 }) {
  const t0 = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f, t0);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(out);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

function noise({ at = 0, dur = 0.05, vol = 0.15, f = 2000, to, q = 1.2 }) {
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.3), ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t0 = ctx.currentTime + at;
  const src = ctx.createBufferSource();
  const bp = ctx.createBiquadFilter();
  const g = ctx.createGain();
  src.buffer = noiseBuf;
  bp.type = 'bandpass';
  bp.Q.value = q;
  bp.frequency.setValueAtTime(f, t0);
  if (to) bp.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(bp);
  bp.connect(g);
  g.connect(out);
  src.start(t0);
  src.stop(t0 + dur + 0.03);
}

const SOUNDS = {
  // yumuşak dokunuş
  tap() {
    tone({ f: 620, to: 560, dur: 0.07, vol: 0.12 });
    tone({ f: 1240, dur: 0.03, vol: 0.025, type: 'triangle' });
  },
  // yapboz parçası oturdu: tık + küçük tok ses
  snap() {
    noise({ f: 3200, dur: 0.03, vol: 0.22, q: 2 });
    tone({ f: 190, to: 120, type: 'triangle', dur: 0.09, vol: 0.22 });
  },
  // kart çevirme: kısa hışırtı
  flip() {
    noise({ f: 900, to: 3200, dur: 0.11, vol: 0.12, q: 0.9 });
    tone({ f: 420, to: 520, dur: 0.05, vol: 0.04, type: 'triangle', at: 0.04 });
  },
  // eşleşme: iki tatlı nota yukarı
  match() {
    tone({ f: 659.25, type: 'triangle', dur: 0.16, vol: 0.14 });
    tone({ f: 987.77, dur: 0.26, vol: 0.13, at: 0.09 });
    tone({ f: 1975.5, dur: 0.2, vol: 0.025, at: 0.09 });
  },
  // yanlış: iki alçak nota aşağı, sert değil
  wrong() {
    tone({ f: 311, to: 293, type: 'triangle', dur: 0.15, vol: 0.13 });
    tone({ f: 247, to: 220, type: 'triangle', dur: 0.24, vol: 0.13, at: 0.13 });
  },
  // kazanma: arpej + parıltılı akor
  win() {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => tone({ f, type: 'triangle', dur: 0.32, vol: 0.13, at: i * 0.09 }));
    [1046.5, 1318.5, 1568].forEach((f) => tone({ f, dur: 1.1, vol: 0.05, at: 0.4, attack: 0.03 }));
    tone({ f: 2093, dur: 0.6, vol: 0.02, at: 0.45, attack: 0.02 });
  },
  // baloncuk
  pop() {
    tone({ f: 330, to: 880, dur: 0.09, vol: 0.16 });
  },
  // sayaç tıkı
  tick() {
    tone({ f: 1900, type: 'triangle', dur: 0.025, vol: 0.05, attack: 0.002 });
  },
};

export function sfx(name) {
  if (muted) return;
  const play = SOUNDS[name];
  if (!play) return;
  // Modül dokunuştan sonra yüklendiyse: kullanıcı sayfayla etkileşti, kurmak serbest.
  if (!ctx && globalThis.navigator?.userActivation?.hasBeenActive) unlock();
  if (!ctx || ctx.state === 'closed') return; // henüz dokunuş yok: sessiz geç
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  const now = performance.now();
  if (now - (lastAt[name] || 0) < MIN_GAP_MS) return;
  lastAt[name] = now;
  try { play(); } catch { /* ses kritik değil */ }
}
