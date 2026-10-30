// Masa oyunlarının saf yardımcıları (DOM ve ağ yok; Node'da test edilir).

export const SAVE_MS = 3000;
export const KIND = 'oyunkayit';
export const UNKNOWN = '?';
export const REFRESH_WAIT_MS = 2500;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Kayıtlı oyunu okur. col: openCollection sonucu (get, refresh). Önbellek bayat olabilir (oyun öbür cihazda
 * bitti, kayıt silindi): okumadan önce sunucudan tazeleme en çok `wait` ms beklenir.
 * -> { saved: sürdürülebilir durum | null, done: bitmiş kayıt (eski sürümden; silinmeli) }
 */
export async function readSaved(col, ns, { valid = () => true, finished = () => false, wait = REFRESH_WAIT_MS } = {}) {
  await Promise.race([col.refresh(), sleep(wait)]);
  const d = col.get(ns)?.data;
  if (!d || d.kind !== ns || d.v !== 1 || !valid(d)) return { saved: null, done: false };
  if (finished(d)) return { saved: null, done: true };
  return { saved: d, done: false };
}

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
