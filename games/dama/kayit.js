// Masa oyunlarının saf yardımcıları (DOM ve ağ yok; Node'da test edilir).

export const SAVE_MS = 3000;
export const KIND = 'oyunkayit';
export const UNKNOWN = '?';

/**
 * Seyreltilmiş yazıcı: en çok `ms`'de bir yazar, sondaki değeri kaçırmaz. flush() bekleyeni hemen yazar.
 * Saf zamanlayıcı enjeksiyonu ile Node'da test edilir.
 */
export function createSaver(write, { ms = SAVE_MS, now = () => Date.now(), setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let last = -Infinity;
  let timer = null;
  let pending;
  let has = false;
  function fire() {
    timer = null;
    if (!has) return;
    const v = pending;
    has = false;
    pending = undefined;
    last = now();
    write(v);
  }
  return {
    push(v) {
      pending = v;
      has = true;
      if (timer) return;
      const wait = last + ms - now();
      if (wait <= 0) fire();
      else timer = setTimer(fire, wait);
    },
    flush() {
      if (timer) { clearTimer(timer); timer = null; }
      fire();
    },
    get waiting() { return has; },
  };
}

/** Kayıtlı durum bu kişi için sürdürülebilir mi? Partner tahmini: bilinen partner ya da kayıttaki öbür kişi. */
export function resumeSeat(saved, meId, partnerId) {
  if (!saved || !Array.isArray(saved.players) || saved.players.length !== 2) return null;
  const guess = partnerId || saved.players.find((x) => x !== meId && x !== UNKNOWN) || null;
  if (saved.players.includes(meId)) return { partner: guess };
  if (guess && saved.players.includes(guess)) return { partner: guess };
  if (saved.players.includes(UNKNOWN)) return { partner: guess };
  return null;
}

/**
 * Kayda ne yapılmalı? Biten oyun (kazanan belli / maç bitti) silinir: ana sayfadaki "Kaldığınız yerden"
 * kartı bitmiş oyunu göstermesin. -> 'put' | 'remove' | null (zaten yok)
 */
export function saveOp(s, finished, exists) {
  if (!s) return null;
  if (finished) return exists ? 'remove' : null;
  return 'put';
}

/** Sıra karşı tarafa geçti mi? (bildirim için) */
export function handedTo(prev, s) {
  if (!prev || !s || prev.seq === s.seq) return null;
  const was = prev.players?.[prev.turn];
  const now = s.players?.[s.turn];
  if (was === now && prev.phase === s.phase) return null;
  return now || null;
}
