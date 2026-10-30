// Soru oyunları: tarayıcı tarafı ortak parçalar (açılış, çizim yardımcıları, bitiş).
// İçe aktarınca DOM'a dokunmaz; fonksiyonlar çağrılınca dokunur.
import { joinRoom } from '../../js/core/room.js';
import { readGameParams, lobbyUrl } from '../../js/core/identity.js';
import { mountShell, waitForPartner, celebrate } from '../../js/core/ui.js';
import { sfx } from '../../js/core/sound.js';
import { logGame } from '../../js/core/db.js';
import { gameById } from '../../js/core/games.js';

/** Odaya gir, üst şeridi kur, partneri bekle. -> { room, roomId, hostId, isHost, solo } */
export async function boot({ ns, allowSolo = false, waitText }) {
  const { roomId, hostId, isHost } = readGameParams();
  const room = await joinRoom({ roomId, ns });
  mountShell({ title: gameById(ns)?.title || '', room });
  const mode = await waitForPartner(room, { ns, text: waitText, allowSolo });
  return { room, roomId, hostId, isHost, solo: mode === 'solo' };
}

/** Eleman kurucu. Metin çocuklar textContent olur (adlar güvenle basılır). */
export function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'vars') for (const [p, val] of Object.entries(v)) el.style.setProperty(p, val);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : String(kid));
  }
  return el;
}

/**
 * #app içinde kalıcı iskelet: durum şeridi, ekran okuyucu bölgesi, değişen gövde.
 * show() gövdeyi değiştirir, odaktaki [data-k] öğesini korur.
 */
export function createView(root) {
  const banner = h('p', { class: 'soru-banner', role: 'status', hidden: true });
  const live = h('div', { class: 'sr-only', 'aria-live': 'polite', 'aria-atomic': 'true' });
  const body = h('div', { class: 'soru-body' });
  root.replaceChildren(banner, live, body);
  let lastKey = null;
  let said = '';
  return {
    /** Bu anahtar ilk kez mi çiziliyor? (giriş animasyonları için) */
    fresh: (key) => key !== lastKey,
    show(node, key) {
      const focusKey = document.activeElement?.closest?.('[data-k]')?.dataset.k;
      const changed = key !== lastKey;
      lastKey = key;
      body.replaceChildren(node);
      if (focusKey && !changed) {
        const el = body.querySelector(`[data-k="${focusKey}"]`);
        if (el && !el.disabled) el.focus({ preventScroll: true });
      }
      if (changed && window.scrollY > 0) window.scrollTo(0, 0);
    },
    say(text) {
      if (!text || text === said) return;
      said = text;
      live.textContent = text;
    },
    banner(text) {
      banner.textContent = text || '';
      banner.hidden = !text;
    },
  };
}

/** Koltuktaki kişinin görünen adı. Ağda kendin "Sen"; aynı telefonda hep ad. */
export function nameOf(s, seat, c) {
  if (!c.solo && seat === c.mySeat) return 'Sen';
  return s.players[seat]?.name || (c.solo ? `${seat + 1}. oyuncu` : 'Sevgilin');
}

export function partnerName(s, c) {
  return s.players[1 - c.mySeat]?.name || 'Sevgilin';
}

/** Partner yokken üst şerit metni. */
export function absenceText(s, c) {
  if (c.solo || c.partnerHere || !s) return '';
  const pn = partnerName(s, c);
  return c.isHost ? `${pn} ayrıldı. Dönünce kaldığınız yerden devam.` : `${pn} dönünce devam ediyoruz…`;
}

/** Dokununca anında görsel kilit (durum gelene kadar). */
export function lockChoice(btn) {
  const group = btn.closest('[role="group"]') || btn.parentElement;
  for (const b of group.querySelectorAll('button')) b.disabled = true;
  btn.setAttribute('aria-pressed', 'true');
  btn.classList.add('is-picked');
}

/** Segment seçici (.seg). options = [{ value, label }]. */
export function seg({ label, options, value, disabled, onPick, keyPrefix }) {
  const id = `seg-${keyPrefix}`;
  return h('div', { class: 'soru-field' },
    h('span', { class: 'soru-label', id }, label),
    h('div', { class: 'seg', role: 'group', 'aria-labelledby': id },
      options.map((o) => h('button', {
        type: 'button',
        'aria-pressed': String(o.value === value),
        disabled: disabled || undefined,
        dataset: { k: `${keyPrefix}-${o.value}` },
        onclick: () => {
          if (o.value === value) return;
          sfx('tap');
          onPick(o.value);
        },
      }, o.label))));
}

export function goLobby() {
  location.href = lobbyUrl();
}

/** Bağlanırken gösterilen sade ekran. */
export function loadingScreen(text = 'Oyun hazırlanıyor…') {
  return h('section', { class: 'soru-screen soru-center' },
    h('div', { class: 'soru-hero soru-wait', 'aria-hidden': 'true' }, '💞'),
    h('p', { class: 'subtitle' }, text));
}

/**
 * Bitiş kutlaması: bir kez açar, aşama değişince kapatır. Ev sahibi canlı bitişte logGame çağırır.
 * show({ title, lines, onAgain, log }) ; log = { roomId, gameId, result } | null
 */
export function createEnding() {
  let close = null;
  return {
    show({ title, lines, onAgain, log }) {
      if (close) return;
      sfx('win');
      const c = celebrate({
        title,
        lines,
        buttons: [
          { label: 'Tekrar', primary: true, onClick: onAgain },
          { label: 'Odamıza dön', onClick: goLobby },
        ],
      });
      close = typeof c === 'function' ? c : () => {};
      if (log && log.roomId) logGame(log.roomId, log.gameId, log.result);
    },
    hide() {
      if (!close) return;
      try { close(); } catch { /* zaten kapalı */ }
      close = null;
    },
  };
}

/** Bitiş ekranının alt düğmeleri (kutlama kapatıldıysa da erişilebilir). */
export function endActions(onAgain) {
  return h('div', { class: 'soru-actions' },
    h('button', { type: 'button', class: 'btn primary', dataset: { k: 'again' }, onclick: () => { sfx('tap'); onAgain(); } }, 'Tekrar oynayalım'),
    h('button', { type: 'button', class: 'btn', dataset: { k: 'lobby' }, onclick: goLobby }, 'Odamıza dön'));
}
