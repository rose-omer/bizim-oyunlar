// Masa oyunları (Dama, Tavla) ortak açılışı: oda, roller, "kaldığın yerden" kaydı, bildirim.
//
// - Ev sahibi otoritedir (games/hafiza/sync.js: join/state/intent, 4 sn'de durum tekrarı, rol çakışması).
// - Eşzamansız oyun: sayfayı tek başına açan kendi ev sahibidir; durumu `oyunkayit` belgesinden (id = oyun id)
//   yükler, her değişimden sonra en çok SAVE_MS'de bir yazar. Partner girince kendi ev sahipliğinde kaydı görür.
// - Kayıt değişirse (öbür cihaz yazdı) ve daha yeniyse ev sahibi onu benimser (seq karşılaştırması).
// - Bildirim adresinde oda yoksa (games/dama/) kayıtlı oda kullanılır.
import { joinRoom } from '../../js/core/room.js';
import { readGameParams, currentRoom, gameUrl, lobbyUrl } from '../../js/core/identity.js';
import { mountShell, waitForPartner, knownPartner, h } from '../../js/core/ui.js';
import { openCollection } from '../../js/core/veri.js';
import { bildir } from '../../js/core/bildirim.js';
import { createSync } from '../hafiza/sync.js';
import { newSeed } from '../hafiza/rng.js';
import { KIND, UNKNOWN, createSaver, resumeSeat, handedTo, saveOp } from './kayit.js';

export { SAVE_MS } from './kayit.js';
export { agoText, bulunma, tamlayan } from './dil.js';

/**
 * Oyun sayfasını kurar. game: { reduce, toAction, schedule?, view?, seat, isNewer, fresh(players, names), finished(s) }.
 * Oyun bitince (finished) `oyunkayit` belgesi silinir; bitmiş kayıt açılışta sürdürülmez.
 * -> { room, roomId, meId, authority, sync, resumed, nameOf, partnerHere, becomeHost, start }
 * start(handlers) çağrılınca senkron başlar; handlers: onState(s, prev, info), onPeer(here),
 * notify(s, prev) -> metin | { baslik, metin } | null (sıra partnere geçti ve partner sayfada değil)
 */
export async function bootMasa({ ns, title, game, valid = () => true }) {
  const finished = (s) => !!s && !!game.finished?.(s);
  const params = readGameParams();
  const roomId = params.roomId || currentRoom();
  const hostId = params.roomId ? params.hostId : null;
  const room = await joinRoom({ roomId, ns });
  mountShell({ title, room });
  if (!roomId || room.backend === 'solo') {
    await waitForPartner(room, { ns }); // "Bu oyun iki kişilik" kaplaması; çözülmez
    return new Promise(() => {});
  }
  const meId = room.me.clientId;
  const authority = !hostId || hostId === meId;
  const p0 = room.partner();
  const known = knownPartner(roomId);
  let partnerId = p0?.clientId || known?.clientId || null;
  const names = { [meId]: room.me.name || 'Ben' };
  if (partnerId) names[partnerId] = p0?.name || known?.name || 'Sevgilin';

  let col = null;
  let saved = null;
  if (authority) {
    try {
      col = await openCollection(room, KIND);
      const d = col.get(ns)?.data;
      if (d && d.kind === ns && d.v === 1 && valid(d)) saved = d;
      if (saved && finished(saved)) {
        saved = null;
        col.remove(ns).catch(() => {}); // eski sürümden kalmış bitmiş kayıt
      }
    } catch (e) {
      console.warn('[masa] kayıt açılamadı:', e?.message || e);
    }
  }

  let initial = null;
  let resumed = false;
  const seatInfo = authority ? resumeSeat(saved, meId, partnerId) : null;
  if (seatInfo) {
    initial = game.seat(saved, [meId, seatInfo.partner], names);
    if (!initial.players.includes(meId)) initial = null;
    else resumed = true;
  }
  if (!initial) initial = game.fresh([meId, partnerId || UNKNOWN], names);

  let handlers = {};
  let peerHere = false;
  let adopting = false;
  const saver = createSaver((s) => {
    const op = saveOp(s, finished(s), !!col?.get(ns));
    const done = op === 'put' ? col?.put(s, ns) : op === 'remove' ? col?.remove(ns) : null;
    done?.catch((e) => console.warn('[masa] kaydedilemedi:', e?.message || e));
  });

  const relaunch = (host) => {
    saver.flush();
    location.replace(gameUrl(ns, { roomId, host }));
  };

  const sync = createSync({
    room, ns, hostId, isHost: authority, solo: false,
    reduce: game.reduce,
    schedule: game.schedule || null,
    view: game.view || ((s) => s),
    initial,
    toAction: (intent, by, s) => game.toAction(intent, by, s, { hostId: meId, now: Date.now(), seed: newSeed() }),
    onState: (s, prev) => {
      // İlk durum yazılmaz: kayıt henüz gelmediyse boş oyun gerçek kaydın üstüne yazılmasın.
      if (authority && col && s && prev && prev.seq !== s.seq) {
        saver.push(s);
        if (finished(s) && !finished(prev)) saver.flush(); // bitiş: kaydı hemen sil
      }
      if (authority && prev && !peerHere && handlers.notify) {
        const to = handedTo(prev, s);
        if (to && to !== meId && to !== UNKNOWN) {
          const n = handlers.notify(s, prev);
          const msg = typeof n === 'string' ? { baslik: 'Sıra sende', metin: n } : n;
          if (msg?.metin) bildir(roomId, { tur: 'oyun', baslik: msg.baslik || 'Sıra sende', metin: msg.metin, url: `games/${ns}/` });
        }
      }
      handlers.onState?.(s, prev, { adopted: adopting });
    },
    onPeer: (here) => {
      peerHere = here;
      handlers.onPeer?.(here);
    },
    onJoin: (from) => fillSeat(from),
    relaunch,
  });

  function fillSeat(p) {
    if (!authority || !p?.clientId || p.clientId === meId) return;
    partnerId = p.clientId;
    const s = sync.state;
    if (!s) return;
    const nm = p.name ? { [p.clientId]: p.name } : {};
    sync.dispatch({ type: 'seat', ids: [meId, p.clientId], names: nm });
  }

  function adopt() {
    const d = col?.get(ns)?.data;
    if (!d || d.kind !== ns || !valid(d) || !game.isNewer(d, sync.state)) return;
    const s = game.seat(d, [meId, partnerId || d.players.find((x) => x !== meId) || UNKNOWN], {});
    if (!s.players.includes(meId)) return;
    adopting = true;
    try { sync.dispatch({ type: 'load', s }); } finally { adopting = false; }
  }

  const nameOf = (id, s = sync.state) => {
    if (id === meId) return room.me.name || 'Sen';
    return s?.names?.[id] || room.partner()?.name || knownPartner(roomId)?.name || 'Sevgilin';
  };

  return {
    room, roomId, meId, authority, sync, resumed, nameOf,
    partnerHere: () => peerHere,
    becomeHost: () => relaunch(meId),
    start(h = {}) {
      handlers = h;
      sync.start();
      if (authority) {
        room.on('presence', (p) => { if (p) fillSeat(p); });
        col?.on('change', adopt);
        const save = () => saver.flush();
        window.addEventListener('pagehide', save);
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save(); });
      }
    },
  };
}

// ---------- Ortak arayüz parçaları ----------

const AWAY_DELAY_MS = 2500;

/**
 * Misafir için "ev sahibi yok" kaplaması. set(here) presence ile çağrılır; kısa gecikmeyle açılır.
 * Misafir "Burada devam et" ile kendi ev sahipliğinde (kayıttan) sürdürür.
 */
export function mountAway(root, { isGuest, onHost }) {
  const el = h('div', { class: 'masa-away hidden', role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': 'masa-away-t' },
    h('div', { class: 'card stack masa-card' },
      h('h2', { class: 'masa-card-title', id: 'masa-away-t' }, 'Sevgilin oyundan çıktı'),
      h('p', { class: 'muted' }, 'Oyun kaydedildi. Buradan sürdürebilirsin; sıra ondaysa o girince görür.'),
      h('div', { class: 'masa-card-actions' },
        h('button', { type: 'button', class: 'btn primary', onclick: () => onHost?.() }, 'Devam et'),
        h('a', { class: 'btn ghost', href: lobbyUrl() }, 'Ana sayfaya dön'))));
  root.appendChild(el);
  let timer = 0;
  const set = (here) => {
    if (!isGuest) return;
    clearTimeout(timer);
    if (here) el.classList.add('hidden');
    else timer = setTimeout(() => el.classList.remove('hidden'), AWAY_DELAY_MS);
  };
  set(false);
  return { set };
}

/** Kayıtlı oyun bulununca tahtanın üstünde "Devam et / Yeni oyun" kartı. */
export function resumeCard(cover, { title, detail, onContinue, onNew, newLabel = 'Yeni oyun' }) {
  const close = () => { cover.classList.add('hidden'); cover.replaceChildren(); };
  const cont = h('button', { type: 'button', class: 'btn primary', onclick: () => { close(); onContinue?.(); } }, 'Devam et');
  cover.replaceChildren(h('div', { class: 'card stack masa-card', role: 'dialog', 'aria-labelledby': 'masa-resume-t' },
    h('h2', { class: 'masa-card-title', id: 'masa-resume-t' }, title),
    detail ? h('p', { class: 'muted' }, detail) : null,
    h('div', { class: 'masa-card-actions' },
      cont,
      h('button', { type: 'button', class: 'btn ghost', onclick: () => { close(); onNew?.(); } }, newLabel))));
  cover.classList.remove('hidden');
  cont.focus({ preventScroll: true });
  return close;
}

export const LANDSCAPE = '(orientation: landscape) and (max-height: 560px)';

/**
 * Tahta için kullanılabilir alan. Dikeyde satırlar tahtaya yaslanır: yükseklik = kök − diğer satırlar.
 * Yatayda tahta kendi sütununda: sahnenin ölçüsü. -> { w, h }
 */
export function boardSpace(root, stage, others) {
  const w = stage.clientWidth;
  if (matchMedia(LANDSCAPE).matches) return { w, h: stage.clientHeight };
  const cs = getComputedStyle(root);
  const pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
  const gap = parseFloat(cs.rowGap) || 0;
  const used = others.reduce((n, el) => n + el.offsetHeight, 0) + gap * others.length;
  return { w, h: Math.max(160, root.clientHeight - pad - used) };
}
