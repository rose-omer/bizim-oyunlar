// Ev sahibi otoritesi (soru oyunları). DOM'a dokunmaz; oda nesnesi dışarıdan gelir.
// Ev sahibi durumu tutar, reducer'ı uygular, her değişiklikte { t:'state', s, now } yayar.
// Misafir { t:'join' } ve { t:'intent', a } yollar; gelen durumu olduğu gibi çizer.
// Misafir yalnız ev sahibinin (hostId) mesajını dinler.
// Rol çakışması: küçük clientId ev sahibidir; yanlış roldeki taraf sayfayı doğru rolle yeniden açar.
// Aynı telefonda (solo): oyun ağsız; odalıysa gelen join/intent'e { t:'solo' } der.
import { randomSeed } from './rng.js';
import { isSeat } from './common.js';
import { gameUrl } from '../../js/core/identity.js';

/** Misafirden kabul edilmeyen eylemler. */
export const HOST_ONLY = new Set(['seat', 'timeout', 'rearm']);

const KEEP_MS = 12 * 3600 * 1000;
const SOLO_NOTE_MS = 5000; // tek başına oynayan taraf en fazla 5 sn'de bir { t:'solo' } der

function defaultStorage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

/**
 * onChange(state, ctx) her değişiklikte; ctx = { mySeat, isHost, solo, partnerHere, partnerSolo, offset }.
 * offset = yerel saat − ev sahibi saati (misafirde geri sayım için).
 * partnerSolo = ev sahibi "Tek başıma" oynuyor (misafirde; durum gelince düşer).
 * relaunch(host) sayfayı bu host ile yeniden açar (testte enjekte edilir).
 * İlk çizim bir mikro görev sonra yapılır (dönen nesne o anda hazırdır).
 */
export function createSync({
  room,
  ns,
  roomId = null,
  hostId = null,
  isHost,
  solo = false,
  reduce,
  initial,
  onChange,
  storage = defaultStorage(),
  beatMs = 4000,
  retryMs = 2000,
  relaunch = (host) => globalThis.location?.replace(gameUrl(ns, { roomId, host })),
}) {
  const authority = solo || !!isHost;
  const mySeat = authority ? 0 : 1;
  const key = `bizim.soru.${ns}.${solo ? 'solo' : roomId || 'oda'}`;
  let state = null;
  let lastJson = '';
  let pending = false; // misafir niyet yolladı, yanıt bekliyor
  let offset = 0;
  let partnerHere = solo;
  let partnerSolo = false;
  let lastSoloNote = -Infinity;
  let ready = false;
  let alive = true;
  const offs = [];
  const timers = [];

  const ctx = () => ({ mySeat, isHost: authority, solo, partnerHere, partnerSolo, offset });
  const emit = () => {
    if (ready && alive) onChange(state, ctx());
  };

  function load() {
    if (!authority || !storage) return null;
    try {
      const v = JSON.parse(storage.getItem(key) || 'null');
      if (v && Date.now() - v.at < KEEP_MS && v.s && v.s.game === ns) return v.s;
    } catch { /* bozuk kayıt: yok say */ }
    return null;
  }

  function save() {
    if (!storage) return;
    try {
      storage.setItem(key, JSON.stringify({ at: Date.now(), s: state }));
    } catch { /* kota / gizli mod */ }
  }

  function broadcast() {
    if (!solo && state) room.send({ t: 'state', s: state, now: Date.now() });
  }

  function commit(next) {
    if (!next || next === state) return false;
    state = next;
    save();
    broadcast();
    emit();
    return true;
  }

  function apply(a, by) {
    if (!state || !a || typeof a !== 'object' || typeof a.type !== 'string') return false;
    const act = { ...a, now: Date.now() };
    if (!(solo && isSeat(a.by))) act.by = by;
    if (act.type === 'start') act.seed = randomSeed();
    return commit(reduce(state, act));
  }

  function seatPartner(p) {
    if (p && p.clientId) apply({ type: 'seat', idx: 1, id: p.clientId, name: p.name }, 0);
  }

  const sendJoin = () => room.send({ t: 'join' });

  // Sayfayı doğru rolle yeniden aç; bu senkron artık bir şey yapmaz.
  function moveTo(host) {
    if (!alive) return;
    destroy();
    relaunch(host);
  }

  function onMessage(msg, from) {
    if (!msg || typeof msg !== 'object') return;
    const myId = room.me.clientId;
    const fromId = from?.clientId || null;
    if (solo) {
      if ((msg.t === 'join' || msg.t === 'intent') && Date.now() - lastSoloNote >= SOLO_NOTE_MS) {
        lastSoloNote = Date.now();
        room.send({ t: 'solo' });
      }
      return;
    }
    if (authority) {
      if (msg.t === 'join') {
        seatPartner(from);
        broadcast();
      } else if (msg.t === 'intent' && msg.a && !HOST_ONLY.has(msg.a.type)) {
        apply(msg.a, 1);
      } else if (msg.t === 'state' && fromId && fromId !== myId) {
        // İki ev sahibi: küçük clientId kalır, büyük olan misafir olarak yeniden açılır.
        if (myId > fromId) moveTo(fromId);
      }
      return;
    }
    if (!fromId || fromId !== hostId) return; // misafir yalnız ev sahibini dinler
    if (msg.t === 'join') {
      // İkisi de misafir: küçük clientId ev sahibi olur; büyük olan beklemeyi sürdürür.
      if (myId < fromId) moveTo(myId);
      return;
    }
    if (msg.t === 'solo') {
      if (!partnerSolo) {
        partnerSolo = true;
        emit();
      }
      return;
    }
    if (msg.t === 'state' && msg.s && msg.s.game === ns) {
      offset = Date.now() - (Number(msg.now) || Date.now());
      const json = JSON.stringify(msg.s);
      // Aynı durum yeniden çizilmez; ama niyet yollandıysa bir kez çizilir (iyimser kilit çözülsün).
      if (json === lastJson && !pending && !partnerSolo) return;
      pending = false;
      partnerSolo = false;
      lastJson = json;
      state = msg.s;
      emit();
    }
  }

  function onPresence(p) {
    const here = !!(p && p.page === ns);
    const changed = here !== partnerHere;
    partnerHere = here;
    if (authority && here) seatPartner(p);
    if (changed && here) {
      if (authority) broadcast();
      else sendJoin();
    }
    if (changed) emit();
  }

  function dispatch(a) {
    if (!alive || !a) return false;
    if (authority) return apply(a, 0);
    if (HOST_ONLY.has(a.type)) return false;
    const sent = room.send({ t: 'intent', a }) !== false;
    if (sent) pending = true;
    return sent;
  }

  function destroy() {
    alive = false;
    offs.forEach((off) => off && off());
    timers.forEach((t) => clearInterval(t));
  }

  if (authority) {
    const p = typeof room.partner === 'function' ? room.partner() : null;
    const players = [
      { id: room.me.clientId, name: room.me.name },
      { id: p?.clientId || '', name: p?.name || '' },
    ];
    state = load() || initial(players);
    if (!solo) state = reduce(state, { type: 'seat', idx: 0, id: room.me.clientId, name: room.me.name });
  }

  if (solo && roomId) {
    // "Tek başıma": gelen partnere tek başına oynandığını söyle.
    offs.push(room.on('message', onMessage));
  }
  if (!solo) {
    offs.push(room.on('message', onMessage));
    offs.push(room.on('presence', onPresence));
    if (authority) {
      timers.push(setInterval(() => partnerHere && broadcast(), beatMs));
    } else {
      sendJoin();
      const retry = setInterval(() => {
        if (state) clearInterval(retry);
        else sendJoin();
      }, retryMs);
      timers.push(retry);
    }
  }

  queueMicrotask(() => {
    ready = true;
    emit();
  });

  return {
    dispatch,
    ctx,
    destroy,
    get state() {
      return state;
    },
  };
}
