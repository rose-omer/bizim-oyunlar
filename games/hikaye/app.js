// Birlikte Hikâye sayfası. Kurallar oyun.js'te; ev sahibi uygular, misafir niyet yollar (dama/masa.js).
// Açılış cümlesinin altına sırayla birer cümle eklenir. Taslak yazı yeniden çizimde silinmez.
import { celebrate, toast, h } from '../../js/core/ui.js';
import { lobbyUrl } from '../../js/core/identity.js';
import { sfx } from '../../js/core/sound.js';
import { logGame } from '../../js/core/db.js';
import { oyunOdulu } from '../../js/core/oyun-odul.js';
import { fitToViewport } from '../hafiza/ekran.js';
import { bootMasa, agoText, bulunma, mountAway, resumeCard } from '../dama/masa.js';
import { UNKNOWN } from '../dama/kayit.js';
import * as S from './oyun.js';

const NS = 'hikaye';
const OPTIMISTIC_MS = 3000;

const app = document.getElementById('app');
app.innerHTML = `
  <section class="hk" id="hk" aria-label="Birlikte Hikâye">
    <div class="hk-top" id="hk-top"></div>
    <div class="hk-story" id="hk-story" aria-live="polite" aria-relevant="additions"></div>
    <form class="hk-compose" id="hk-compose" autocomplete="off">
      <label class="sr-only" for="hk-text">Sıradaki cümle</label>
      <textarea class="input hk-text" id="hk-text" rows="2" maxlength="${S.EN_UZUN}" enterkeyhint="send"
        placeholder="Hikâyeyi sürdür…"></textarea>
      <div class="hk-row">
        <span class="hk-count" id="hk-count" aria-live="off"></span>
        <div class="hk-tools" id="hk-tools"></div>
        <button type="submit" class="btn primary small" id="hk-send">Ekle</button>
      </div>
    </form>
    <div class="masa-cover hidden" id="hk-cover"></div>
  </section>`;
const root = document.getElementById('hk');
const topEl = document.getElementById('hk-top');
const storyEl = document.getElementById('hk-story');
const form = document.getElementById('hk-compose');
const textEl = document.getElementById('hk-text');
const countEl = document.getElementById('hk-count');
const toolsEl = document.getElementById('hk-tools');
const sendBtn = document.getElementById('hk-send');
const cover = document.getElementById('hk-cover');

const M = await bootMasa({
  ns: NS,
  title: 'Birlikte Hikâye',
  game: {
    reduce: S.reduce, toAction: S.toAction, seat: S.seat, isNewer: S.isNewer,
    finished: (s) => s.phase === 'end',
    fresh: (players, names) => S.initialState({ players, names, now: Date.now(), seed: Math.floor(Math.random() * 1e9) }),
  },
  valid: S.validSaved,
});
const me = M.meId;

let optimistic = null; // { s, timer }
let closeCelebrate = null;
let resumeOpen = false;
let closeResume = null;
let quiet = false;
let drawnKey = '';
const away = mountAway(root, { isGuest: !M.authority, onHost: () => M.becomeHost() });

// ---------- yardımcılar ----------
function state() {
  return optimistic?.s || M.sync.state;
}
function seatOf(s) {
  const i = s.players.indexOf(me);
  return i < 0 ? 0 : i;
}
function nameOf(s, id) {
  return id === me ? 'Sen' : M.nameOf(id, s);
}
function myTurn(s) {
  return !!s && s.phase === 'play' && s.players[s.turn] === me && !resumeOpen;
}
function clearOptimistic() {
  if (!optimistic) return;
  clearTimeout(optimistic.timer);
  optimistic = null;
}
const tone = (s, p) => (p === seatOf(s) ? 'p0' : 'p1');

// ---------- çizim ----------
function render() {
  const s = state();
  if (!s) return;
  const mine = myTurn(s);
  renderTop(s, mine);
  renderStory(s);
  const open = s.phase === 'play';
  form.classList.toggle('hidden', !open);
  textEl.disabled = !mine;
  sendBtn.disabled = !mine;
  textEl.placeholder = mine
    ? (s.parts.length ? 'Hikâyeyi sürdür…' : 'İlk cümleyi sen yaz…')
    : `Sıra ${bulunma(nameOf(s, s.players[s.turn]))}; o yazınca sen sürdürürsün`;
  countEl.textContent = `${s.parts.length}/${S.HEDEF} cümle`;
  renderTools(s);
}

function renderTop(s, mine) {
  let text;
  if (s.phase === 'end') text = `Hikâyeniz hazır: ${s.parts.length} cümle`;
  else if (mine) text = 'Sıra sende: bir cümle ekle';
  else if (s.players[s.turn] === me) text = 'Sıra sende';
  else {
    const other = nameOf(s, s.players[s.turn]);
    text = M.partnerHere() ? `${other} yazıyor…` : `Sıra ${bulunma(other)} · gelince görecek`;
  }
  topEl.classList.toggle('is-turn', mine);
  topEl.replaceChildren(
    h('span', { class: 'hk-who' }, text),
    h('span', { class: 'hk-legend' },
      h('span', { class: 'hk-dot p0', 'aria-hidden': 'true' }), 'Sen',
      h('span', { class: 'hk-dot p1', 'aria-hidden': 'true' }), nameOf(s, s.players[1 - seatOf(s)])),
  );
}

function renderStory(s) {
  const key = `${s.no}:${s.acilis}:${s.parts.length}:${s.players.join(',')}`;
  if (key === drawnKey) return;
  const grew = drawnKey.startsWith(`${s.no}:`) && s.parts.length > Number(drawnKey.split(':')[2]);
  drawnKey = key;
  const items = [h('p', { class: 'hk-open' }, S.ACILISLAR[s.acilis])];
  s.parts.forEach((p, i) => {
    items.push(h('p', { class: `hk-part ${tone(s, p.by)}${grew && i === s.parts.length - 1 ? ' is-new' : ''}` },
      h('span', { class: 'sr-only' }, `${nameOf(s, s.players[p.by])}: `), p.text));
  });
  storyEl.replaceChildren(...items);
  storyEl.scrollTop = storyEl.scrollHeight;
}

function renderTools(s) {
  const btns = [];
  if (S.bitirebilir(s)) {
    btns.push(h('button', { type: 'button', class: 'btn small ghost', onclick: finish }, 'Bitir'));
  }
  toolsEl.replaceChildren(...btns);
}

function finish() {
  sfx('tap');
  if (M.sync.dispatch({ type: 'bitir' }) === false) toast('Bağlantı yok; biraz sonra yeniden dene.');
}

async function copyStory(s) {
  const text = S.tamMetin(s);
  try {
    if (navigator.share) await navigator.share({ title: 'Hikâyemiz', text });
    else { await navigator.clipboard.writeText(text); toast('Hikâye panoya kopyalandı'); }
  } catch (e) {
    if (e?.name !== 'AbortError') toast('Kopyalanamadı.');
  }
}

// ---------- yazma ----------
function submit() {
  const s = M.sync.state;
  if (!myTurn(state())) return;
  const text = S.temizle(textEl.value);
  if (!text) { sfx('wrong'); toast('Biraz daha yaz.'); textEl.focus(); return; }
  sfx('pop');
  const ok = M.sync.dispatch({ type: 'yaz', text });
  if (ok === false) { toast('Bağlantı yok; cümle gönderilemedi.'); return; }
  textEl.value = '';
  if (!M.authority) {
    const pre = S.reduce(s, { type: 'yaz', by: me, text, now: s.at });
    if (pre !== s) optimistic = { s: pre, timer: setTimeout(() => { optimistic = null; render(); }, OPTIMISTIC_MS) };
  }
  render();
}

form.addEventListener('submit', (e) => { e.preventDefault(); submit(); });
textEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); }
});

// ---------- ses, bitiş ----------
function effects(s, prev, info) {
  if (!prev) return;
  if (s.no !== prev.no) {
    if (closeCelebrate) { try { closeCelebrate(); } catch { /* kapalı */ } closeCelebrate = null; }
    sfx('flip');
    toast(s.players[0] === me ? 'Yeni hikâye · ilk cümle senin' : `Yeni hikâye · ${nameOf(s, s.players[0])} başlıyor`);
    return;
  }
  if (s.parts.length > prev.parts.length && s.parts.at(-1).by !== seatOf(s)) sfx('pop');
  if (s.phase === 'end' && prev.phase !== 'end') celebrateEnd(s, info);
}

function celebrateEnd(s, info) {
  sfx('win');
  if (M.authority && !info?.adopted) logGame(M.roomId, NS, S.resultOf(s));
  if (!info?.adopted) {
    const yazdi = [0, 1].map((p) => s.parts.some((x) => x.by === p));
    oyunOdulu({
      roomId: M.roomId, oyun: NS, sonuc: 'ortak',
      ikiKisi: yazdi[0] && yazdi[1] && s.players.includes(me) && !s.players.includes(UNKNOWN), oyunNo: s.startedAt,
    });
  }
  const by = s.result?.reason === 'bitir' ? s.players[s.result.by] : null;
  closeCelebrate = celebrate({
    title: 'Hikâyeniz hazır',
    lines: [
      `${s.parts.length} cümle, iki kalem.`,
      by ? `${by === me ? 'Sen' : nameOf(s, by)} "son" dedi.` : 'Hedef cümleye vardınız.',
    ],
    buttons: [
      { label: 'Hikâyeyi oku', primary: true, onClick: () => { closeCelebrate = null; } },
      { label: 'Paylaş ya da kopyala', onClick: () => { closeCelebrate = null; copyStory(s); } },
      { label: 'Yeni hikâye', onClick: () => { closeCelebrate = null; M.sync.dispatch({ type: 'new', no: s.no }); } },
      { label: 'Ana sayfaya dön', onClick: () => { location.href = lobbyUrl(); } },
    ],
  });
}

// Bitince alt çubuk: paylaş ve yeni hikâye.
const endBar = h('div', { class: 'hk-end hidden', id: 'hk-end' });
root.insertBefore(endBar, cover);
function renderEnd() {
  const s = state();
  const done = !!s && s.phase === 'end';
  endBar.classList.toggle('hidden', !done);
  if (!done) return;
  endBar.replaceChildren(
    h('button', { type: 'button', class: 'btn small ghost', onclick: () => copyStory(s) }, 'Paylaş / kopyala'),
    h('button', { type: 'button', class: 'btn small primary', onclick: () => M.sync.dispatch({ type: 'new', no: s.no }) }, 'Yeni hikâye'),
  );
}

// ---------- başlat ----------
fitToViewport(root);

function dropResume() {
  if (!resumeOpen) return;
  resumeOpen = false;
  closeResume?.();
  closeResume = null;
}

M.start({
  onState(s, prev, info) {
    clearOptimistic();
    if (s.phase !== 'play') dropResume();
    render();
    renderEnd();
    if (!quiet) effects(s, prev, info);
  },
  onPeer(here) { away.set(here); render(); },
  notify: (s, prev) => S.notice(prev, s, { by: me, ad: (id) => M.nameOf(id, s) }),
  onGone() {
    if (!resumeOpen) return;
    dropResume();
    quiet = true;
    try { M.fresh(); } finally { quiet = false; }
    toast('Bu hikâye bitmiş. Yeni hikâye hazır.');
  },
});

if (M.authority && M.resumed && M.sync.state?.phase === 'play' && M.sync.state.parts.length > 0) {
  const s = M.sync.state;
  resumeOpen = true;
  const turnTxt = s.players[s.turn] === me ? 'Sıra sende' : `Sıra ${bulunma(M.nameOf(s.players[s.turn], s))}`;
  closeResume = resumeCard(cover, {
    title: 'Hikâyemiz yarım kaldı',
    detail: `${s.parts.length}/${S.HEDEF} cümle · ${turnTxt}${s.at ? ` · ${agoText(Date.now() - s.at)}` : ''}`,
    newLabel: 'Yeni hikâye',
    onContinue: () => { resumeOpen = false; closeResume = null; render(); },
    onNew: () => { resumeOpen = false; closeResume = null; M.sync.dispatch({ type: 'new', no: M.sync.state.no }); },
  });
}
render();
renderEnd();
