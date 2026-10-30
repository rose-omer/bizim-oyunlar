// Ev sahibi otoriteli durum eşitleme (Hafıza ve Çiz ortak). DOM'a dokunmaz.
//
// Misafir → ev sahibi: { t:'join' }, { t:'intent', a }
// Ev sahibi → misafir: { t:'state', s, now }   (now = ev sahibi saati; misafir kaymayı hesaplar)
// Tek başına oynayan taraf, gelen join/state/intent'e { t:'solo' } der.
// Mesajlar kaybolabilir: karşı taraf bu sayfadayken ev sahibi tam durumu 4 sn'de bir yeniden yollar.
// Rol çakışmasında küçük clientId ev sahibidir; diğer taraf relaunch(host) ile sayfayı yeniden açar.
//
// createSync(...) yan etkisizdir; abonelik, ilk yayın ve zamanlayıcı start() ile başlar.
import { gameUrl } from '../../js/core/identity.js';

const MAX_AGE = 3 * 60 * 60 * 1000; // kayıtlı durum en fazla 3 saat geçerli
const JOIN_RETRY_MS = 2000;
const JOIN_TRIES = 10;
const RESEND_MS = 4000;

export function sessionStore() {
  try {
    const ss = globalThis.sessionStorage;
    if (!ss) return null;
    return { get: (k) => ss.getItem(k), set: (k, v) => ss.setItem(k, v) };
  } catch {
    return null;
  }
}

export function createSync(o) {
  const {
    room, ns, hostId = null, isHost, solo = false,
    reduce, toAction, view = (s) => s, schedule = null,
    onState = () => {}, onMessage = () => {}, onPeer = () => {}, onJoin = () => {}, onSoloPartner = () => {},
    storage = null, storeKey = null, accept = () => true, now = () => Date.now(),
    relaunch = (host) => globalThis.location?.replace(gameUrl(ns, { roomId: room?.roomId, host })),
  } = o;
  const authority = solo || isHost;
  const net = !!room && !solo;
  const meId = room?.me?.clientId ?? 'me';
  let state = authority ? (restore() ?? o.initial) : null;
  let skew = 0;
  let timer = null;
  let timerKey = null;
  let peerHere = false;
  let gotState = false;
  let joinTimer = null;
  let joinTries = 0;
  let resendTimer = null;
  let moved = false;
  let lastSoloNote = -Infinity;
  const offs = [];

  function restore() {
    if (!storage || !storeKey) return null;
    try {
      const raw = storage.get(storeKey);
      if (!raw) return null;
      const { at, s } = JSON.parse(raw);
      if (!s || now() - at > MAX_AGE || !accept(s)) return null;
      return s;
    } catch {
      return null;
    }
  }
  function persist() {
    if (!storage || !storeKey) return;
    try { storage.set(storeKey, JSON.stringify({ at: now(), s: state })); } catch { /* dolu ya da kapalı */ }
  }
  function partnerId() {
    return room?.partner?.()?.clientId ?? null;
  }
  function sendState() {
    if (!net || !authority) return;
    room.send({ t: 'state', s: view(state, partnerId()), now: now() });
  }
  function commit(next) {
    if (!next || next === state) return false;
    const prev = state;
    state = next;
    persist();
    sendState();
    onState(state, prev);
    arm(false);
    return true;
  }
  function apply(action) {
    if (!action) return false;
    return commit(reduce(state, action));
  }
  function arm(retry) {
    if (!schedule || !authority) return;
    const plan = schedule(state);
    if (!plan) {
      clearTimeout(timer);
      timer = null;
      timerKey = null;
      return;
    }
    if (timer && plan.key === timerKey) return;
    clearTimeout(timer);
    timerKey = plan.key;
    let wait = plan.at != null ? plan.at - now() : plan.delay ?? 0;
    if (retry) wait = Math.max(wait, 25);
    timer = setTimeout(() => {
      timer = null;
      timerKey = null;
      if (!apply({ ...plan.action, now: now() })) arm(true); // erken uyandıysa yeniden kur
    }, Math.max(0, wait));
  }

  function stopJoin() {
    clearTimeout(joinTimer);
    joinTimer = null;
  }
  function startJoin() {
    stopJoin();
    gotState = false;
    joinTries = 0;
    const tryJoin = () => {
      if (gotState || joinTries >= JOIN_TRIES) return;
      joinTries++;
      room.send({ t: 'join' });
      joinTimer = setTimeout(tryJoin, JOIN_RETRY_MS);
    };
    tryJoin();
  }
  function stopResend() {
    clearInterval(resendTimer);
    resendTimer = null;
  }
  // Rol çakışması: sayfayı doğru rolle yeniden aç (bir kez).
  function relaunchAs(host) {
    if (moved) return;
    moved = true;
    destroy();
    relaunch(host);
  }

  function onNetMessage(msg, from) {
    if (!msg || typeof msg !== 'object') return;
    if (solo) {
      if ((msg.t === 'join' || msg.t === 'state' || msg.t === 'intent') && now() - lastSoloNote > 5000) {
        lastSoloNote = now();
        room.send({ t: 'solo' });
      }
      return;
    }
    if (authority) {
      if (msg.t === 'join') { sendState(); onJoin(from); return; }
      if (msg.t === 'intent') { apply(toAction(msg.a || {}, from?.clientId ?? null, state)); return; }
      if (msg.t === 'state') {
        // iki ev sahibi: büyük clientId misafir olur; küçük olan yok sayar (karşı taraf çekilir)
        if (from?.clientId && meId > from.clientId) relaunchAs(from.clientId);
        return;
      }
    } else {
      if (msg.t === 'state') {
        if (!from || from.clientId !== hostId) return; // yalnız ev sahibinden
        gotState = true;
        stopJoin();
        if (typeof msg.now === 'number') skew = msg.now - now();
        if (JSON.stringify(msg.s) === JSON.stringify(state)) return; // yeniden yayın, değişiklik yok
        const prev = state;
        state = msg.s;
        onState(state, prev);
        return;
      }
      if (msg.t === 'join') {
        // ikimiz de misafiriz: küçük clientId ev sahibi olur; büyük olan beklemeyi sürdürür
        if (from?.clientId === hostId && meId < hostId) relaunchAs(meId);
        return;
      }
      if (msg.t === 'intent') return;
    }
    if (msg.t === 'solo') { onSoloPartner(); return; }
    onMessage(msg, from);
  }

  function onPresence(p) {
    const here = !!p && p.page === ns && (authority || !hostId || p.clientId === hostId);
    if (authority) {
      if (here && !peerHere) sendState();
      if (here && !resendTimer) resendTimer = setInterval(sendState, RESEND_MS);
      else if (!here) stopResend();
    } else if (here && !peerHere) {
      startJoin();
    } else if (!here) {
      stopJoin();
    }
    peerHere = here;
    onPeer(here);
  }

  function destroy() {
    for (const off of offs) off?.();
    offs.length = 0;
    clearTimeout(timer);
    stopJoin();
    stopResend();
  }

  return {
    get state() { return state; },
    get isAuthority() { return authority; },
    hostNow: () => now() + (authority ? 0 : skew),
    start() {
      if (room) offs.push(room.on('message', onNetMessage));
      if (net) offs.push(room.on('presence', onPresence));
      if (authority) {
        sendState();
        onState(state, null);
        arm(false);
      }
    },
    dispatch(intent) {
      if (authority) return apply(toAction(intent, meId, state));
      return net ? room.send({ t: 'intent', a: intent }) : false;
    },
    destroy,
  };
}
