// Kelime Zinciri sayfası. Ev sahibi durumu tutar (oyun.js), misafir niyet yollar ve çizer.
// Sözlük yok: yazılan kelimeyi partner onaylar (5 sn cevap yoksa kabul).
import { joinRoom } from '../../js/core/room.js';
import { readGameParams, lobbyUrl } from '../../js/core/identity.js';
import { mountShell, waitForPartner, celebrate, confirmDialog, ICONS } from '../../js/core/ui.js';
import { sfx } from '../../js/core/sound.js';
import { logGame } from '../../js/core/db.js';
import { oyunOdulu } from '../../js/core/oyun-odul.js';
import { createSync, sessionStore } from '../hafiza/sync.js';
import { fitToViewport, esc } from '../hafiza/ekran.js';
import {
  MODLAR, KATEGORILER, SURELER, CAN, ONAY_MS,
  kontrol, ipucuSec, sonHarf, sonHarfYeri, buyuk, puanYaz, kategoriBul,
  initialState, reduce, toAction, schedule, resultOf, birlikteMi, canYeri, toplamPuan,
} from './oyun.js';

const NS = 'kelime';
const UYARI_SN = 5;
const FLASH_MS = 2600;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)');
const STROKE = 'fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"';
const SVG = {
  send: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M12 19V5.5M6 11.5l6-6 6 6"/></svg>`,
  yes: `<svg viewBox="0 0 24 24" ${STROKE}><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>`,
  no: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M7 7l10 10M17 7 7 17"/></svg>`,
  bulb: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3z"/></svg>`,
  skip: `<svg viewBox="0 0 24 24" ${STROKE}><path d="M5 12h11M12 7l5 5-5 5"/><path d="M20 6v12"/></svg>`,
};

const { roomId, hostId, isHost } = readGameParams();
const room = await joinRoom({ roomId, ns: NS });
mountShell({ title: 'Kelime Zinciri', room });

// ---------- iskelet ----------
const segHtml = (items) => items.map(([v, ad]) => `<button type="button" data-v="${v}" aria-pressed="false">${ad}</button>`).join('');
const app = document.getElementById('app');
app.innerHTML = `
  <section class="kz" id="kz" aria-label="Kelime Zinciri">
    <div class="kz-setup hidden" id="kz-setup">
      <div class="kz-setup-in">
        <ol class="kz-chain kz-demo" aria-hidden="true">
          <li class="kz-word p0"><span class="kz-txt">d<span class="kz-last">a</span><span class="kz-skip">ğ</span></span></li>
          <li class="kz-word p1"><span class="kz-txt"><span class="kz-first">a</span>ğa<span class="kz-last">ç</span></span></li>
          <li class="kz-word p0"><span class="kz-txt"><span class="kz-first">ç</span>ile<span class="kz-last">k</span></span></li>
        </ol>
        <p class="kz-rule">Her kelime öncekinin <b>son harfiyle</b> başlar. Son harf <b>ğ</b> ise ondan önceki harf geçer.</p>
        <div class="kz-field" role="group" aria-labelledby="kz-l-mod">
          <p class="kz-label" id="kz-l-mod">Nasıl oynayalım?</p>
          <div class="seg kz-seg" data-ayar="mod">${segHtml(Object.values(MODLAR).map((m) => [m.id, m.ad]))}</div>
          <p class="kz-help" id="kz-mod-help"></p>
        </div>
        <div class="kz-field" role="group" aria-labelledby="kz-l-sure">
          <p class="kz-label" id="kz-l-sure">Hamle süresi</p>
          <div class="seg kz-seg" data-ayar="sure">${segHtml(SURELER.map((s) => [s, s ? `${s} sn` : 'Sınırsız']))}</div>
        </div>
        <div class="kz-field" role="group" aria-labelledby="kz-l-kat">
          <p class="kz-label" id="kz-l-kat">Kategori <span class="kz-opt">isteğe bağlı</span></p>
          <div class="seg kz-seg kz-seg-wrap" data-ayar="kategori">${segHtml(KATEGORILER.map((k) => [k.id, k.ad]))}</div>
          <p class="kz-help">Kategori, onay sorusunda hatırlatılır.</p>
        </div>
        <p class="kz-rekor" id="kz-rekor"></p>
        <div class="kz-setup-go">
          <button type="button" class="btn primary wide" data-act="yeni" id="kz-start">Başla</button>
          <p class="kz-help center">Yazdığın kelimeyi sevgilin onaylar. 5 sn içinde cevap gelmezse kelime geçer.</p>
        </div>
      </div>
    </div>
    <div class="kz-game hidden" id="kz-game">
      <div class="kz-top" id="kz-top"></div>
      <div class="kz-chain-wrap" id="kz-wrap">
        <ol class="kz-chain" id="kz-chain" aria-label="Zincir"></ol>
      </div>
      <div class="kz-dock" id="kz-dock">
        <div class="kz-ask hidden" id="kz-ask" role="group" aria-labelledby="kz-ask-q"></div>
        <p class="kz-status" id="kz-status" aria-hidden="true"><span id="kz-st-text"></span><span class="kz-time" id="kz-st-time"></span></p>
        <form class="kz-form" id="kz-form" autocomplete="off" novalidate>
          <span class="kz-letter" id="kz-letter" aria-hidden="true"><span class="kz-letter-in" id="kz-letter-in">Aa</span></span>
          <label class="sr-only" for="kz-input">Kelimen</label>
          <input class="input kz-input" id="kz-input" name="kelime" type="text" lang="tr" inputmode="text" enterkeyhint="send"
            autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" maxlength="30" aria-describedby="kz-msg">
          <button type="submit" class="btn primary kz-send" id="kz-send" aria-label="Gönder">${SVG.send}</button>
        </form>
        <p class="kz-msg" id="kz-msg"></p>
        <div class="kz-tools" id="kz-tools">
          <button type="button" class="btn small ghost" data-act="ipucu" id="kz-ipucu">${SVG.bulb}İpucu</button>
          <button type="button" class="kz-hint hidden" id="kz-hint"></button>
          <span class="kz-gap"></span>
          <button type="button" class="btn small ghost" data-act="pas" id="kz-pas">${SVG.skip}Pas</button>
          <button type="button" class="icon-btn" data-act="kurulum" aria-label="Ayarlar">${ICONS.settings}</button>
        </div>
        <div class="kz-end hidden" id="kz-end"></div>
      </div>
    </div>
    <p class="sr-only" id="kz-live" aria-live="polite"></p>
    <div class="kz-away hidden" id="kz-away" role="status">
      <div class="card stack center">
        <p class="kz-away-title">Sevgilin dönünce devam 💞</p>
        <p class="muted">Süre durdu, zincir bekliyor.</p>
      </div>
    </div>
  </section>`;
const $ = (id) => document.getElementById(id);
const root = $('kz');
const setupEl = $('kz-setup');
const gameEl = $('kz-game');
const top = $('kz-top');
const wrap = $('kz-wrap');
const chain = $('kz-chain');
const ask = $('kz-ask');
const statusEl = $('kz-status');
const stText = $('kz-st-text');
const stTime = $('kz-st-time');
const form = $('kz-form');
const letterEl = $('kz-letter');
const letterIn = $('kz-letter-in');
const input = $('kz-input');
const sendBtn = $('kz-send');
const msgEl = $('kz-msg');
const tools = $('kz-tools');
const ipucuBtn = $('kz-ipucu');
const hintBtn = $('kz-hint');
const pasBtn = $('kz-pas');
const endEl = $('kz-end');
const live = $('kz-live');
const away = $('kz-away');

await waitForPartner(room, { ns: NS, text: 'Sevgilin gelince sırayla kelime yazarsınız.' });
const me = room.me.clientId;
const partner = room.partner();
const players = [me, partner?.clientId || 'sevgilim'];
const names = { [me]: room.me.name, [players[1]]: partner?.name || '' };

// ---------- rekor (cihazda; ev sahibi durumda birleştirir) ----------
const REKOR_KEY = `bizim.kelime.rekor.${roomId || '-'}`;
function yerelRekor() {
  try { return parseInt(localStorage.getItem(REKOR_KEY), 10) || 0; } catch { return 0; }
}
function rekorKaydet(n) {
  try { if (n > yerelRekor()) localStorage.setItem(REKOR_KEY, String(n)); } catch { /* kapalı */ }
}

let shown = null;
let chainKey = '';
let askKey = '';
let endKey = '';
let flash = null;        // { text, tone, until }
let flashTimer = 0;
let msgErr = false;
let hint = null;         // { k, key }
let sending = false;
let sendTimer = 0;
let ticker = 0;
let lastSec = null;
let closeCelebrate = null;
let celebrateTimer = 0;
let loggedGame = null;
let rekorSent = 0;
let awayTimer = 0;
let peerHere = false;

const sync = createSync({
  room, ns: NS, hostId, isHost, solo: false,
  reduce, schedule,
  toAction: (intent, by, s) => toAction(intent, by, s, { hostId: me, now: Date.now() }),
  initial: initialState({ players, names, rekor: yerelRekor() }),
  storage: sessionStore(),
  storeKey: `bizim.kelime.${roomId || '-'}`,
  accept: (s) => s.v === 1 && s.players?.join() === players.join(),
  onState: (s, prev) => render(s, prev),
  onPeer: (here) => {
    peerHere = here;
    clearTimeout(awayTimer);
    if (here) {
      away.classList.add('hidden');
      if (isHost) sync.dispatch({ type: 'devam' });
      return;
    }
    // kısa kopmada titremesin; sonra süre durur
    awayTimer = setTimeout(() => {
      away.classList.remove('hidden');
      if (isHost) sync.dispatch({ type: 'durdur' });
    }, 1500);
  },
  onJoin: (from) => fillSeat(from),
});

// Ev sahibi: başka cihazdan (yeni clientId) dönen partner, oyundaki koltuğuna oturur.
function fillSeat(p) {
  if (!isHost || !p?.clientId || p.clientId === me) return;
  sync.dispatch({ type: 'seat', ids: [me, p.clientId], names: p.name ? { [p.clientId]: p.name } : {} });
}

fitToViewport(root, scrollChain);
sync.start();
if (isHost) {
  room.on('presence', (p) => { if (p) fillSeat(p); });
  // Yenilemeden dönen oyun: geçen süre sayılmaz, kalan süre (en az 3 sn) yeniden başlar.
  sync.dispatch({ type: 'durdur' });
  if (peerHere) sync.dispatch({ type: 'devam' });
}

// ---------- yardımcılar ----------
function myIdx(s) { return s.players.indexOf(me); }
function nameOf(s, k) {
  const id = s.players[k];
  if (id === me) return 'Sen';
  return s.names?.[id] || 'Sevgilin';
}
function partnerName(s) { return nameOf(s, 1 - Math.max(0, myIdx(s))); }
function announce(text) { if (text) live.textContent = text; }
function benim(s) { const mi = myIdx(s); return mi >= 0 && s.faz === 'oyun' && s.sira === mi && !s.durak; }
function turnKey(s) { return `${s.oyun}:${s.zincir.length}:${s.sira}`; }
function kullanilan(s) { return s.zincir.map((z) => z.k); }
// Bana görünen sıradaki harf: partnerin onay bekleyen kelimesi varsa onun son harfi.
function gorunenHarf(s) {
  const b = s.bekleyen;
  if (s.faz === 'onay' && b && b.by !== myIdx(s)) return sonHarf(b.k);
  return s.harf;
}
function closeCel() {
  clearTimeout(celebrateTimer);
  if (closeCelebrate) { try { closeCelebrate(); } catch { /* kapalı */ } closeCelebrate = null; }
}
function hearts(n, label, lostAt = -1) {
  let h = '';
  for (let i = 0; i < CAN; i++) h += `<span class="kz-heart${i < n ? '' : ' is-off'}${i === lostAt ? ' is-lost' : ''}">${ICONS.heart}</span>`;
  return `<span class="kz-hearts" role="img" aria-label="${esc(label)}: ${n} can">${h}</span>`;
}

// ---------- çizim ----------
function render(s, prev) {
  if (!s) return;
  shown = s;
  sending = false;
  clearTimeout(sendTimer);
  rekorSenk(s);
  if (s.faz !== 'bitti') closeCel();
  const kurulum = s.faz === 'kurulum';
  setupEl.classList.toggle('hidden', !kurulum);
  gameEl.classList.toggle('hidden', kurulum);
  effects(s, prev);
  if (kurulum) {
    drawSetup(s);
  } else {
    drawTop(s, prev);
    drawChain(s, prev);
    drawDock(s);
  }
  runTicker(s);
}

// Rekor iki cihazda da saklanır; büyük olan ev sahibinin durumuna geçer.
function rekorSenk(s) {
  if (s.rekor > yerelRekor()) rekorKaydet(s.rekor);
  const yerel = yerelRekor();
  if (yerel > s.rekor && rekorSent !== yerel) {
    rekorSent = yerel;
    queueMicrotask(() => sync.dispatch({ type: 'rekor', n: yerel }));
  }
}

function drawSetup(s) {
  setupEl.querySelectorAll('[data-ayar]').forEach((seg) => {
    const v = String(s.ayar[seg.dataset.ayar]);
    seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === v)));
  });
  $('kz-mod-help').textContent = MODLAR[s.ayar.mod].aciklama;
  const rk = $('kz-rekor');
  rk.classList.toggle('hidden', !birlikteMi(s));
  rk.innerHTML = s.rekor
    ? `${ICONS.heart}<span>En uzun zincirimiz <b>${Number(s.rekor)}</b> kelime</span>`
    : `${ICONS.heart}<span>Henüz rekor yok. İlkini birlikte kuralım!</span>`;
}

function drawTop(s, prev) {
  const mi = Math.max(0, myIdx(s));
  const o = s.olay;
  const yeniKayip = o && (o.tur === 'sure' || o.tur === 'pas') && prev && prev.olay?.no !== o.no && prev.oyun === s.oyun;
  const lost = (yer) => (yeniKayip && canYeri(s, o.by) === yer ? s.canlar[yer] : -1);
  if (birlikteMi(s)) {
    const n = s.zincir.length;
    const rekorda = (s.faz !== 'bitti' && s.rekor > 0 && n > s.rekor) || s.yeniRekor;
    top.innerHTML = `
      <div class="kz-co">
        <div class="kz-stat"><b class="kz-num">${n}</b><span class="kz-lbl">kelime</span></div>
        ${hearts(s.canlar[0], 'Ortak', lost(0))}
        <div class="kz-stat end${rekorda ? ' is-record' : ''}"><b class="kz-num">${Math.max(s.rekor, n)}</b><span class="kz-lbl">${rekorda ? 'yeni rekor!' : 'rekor'}</span></div>
      </div>`;
    return;
  }
  const plate = (k) => `
    <div class="kz-plate p${k}${s.faz !== 'bitti' && s.sira === k ? ' is-turn' : ''}${s.kazanan === k ? ' is-win' : ''}">
      <span class="kz-dot" aria-hidden="true"></span>
      <span class="kz-name">${esc(nameOf(s, k))}</span>
      ${hearts(s.canlar[k], nameOf(s, k), lost(k))}
      <b class="kz-num" aria-label="puan ${puanYaz(s.puan[k])}">${puanYaz(s.puan[k])}</b>
    </div>`;
  top.innerHTML = `<div class="kz-vs">${plate(mi)}${plate(1 - mi)}</div>`;
}

function balon(z, i, { pending = false } = {}) {
  const chars = [...z.k];
  const j = sonHarfYeri(z.k);
  const txt = chars.map((c, idx) => {
    const cls = [];
    if (idx === 0 && i > 0) cls.push('kz-first');
    if (idx === j && !pending) cls.push('kz-last');
    if (idx > j && !pending) cls.push('kz-skip');
    return cls.length ? `<span class="${cls.join(' ')}">${esc(c)}</span>` : esc(c);
  }).join('');
  const who = shown ? nameOf(shown, z.by) : '';
  const extra = pending
    ? '<span class="sr-only">, onay bekliyor</span>'
    : `${z.ipucu ? '<span class="kz-half" aria-hidden="true">½</span>' : ''}<span class="sr-only">, ${esc(who)}${z.ipucu ? ', ipucuyla' : ''}</span>`;
  return `<li class="kz-word p${z.by}${pending ? ' is-pending' : ''}${z.ipucu ? ' is-hint' : ''}"><span class="kz-txt">${txt}</span>${extra}</li>`;
}

function drawChain(s, prev) {
  const b = s.faz === 'onay' ? s.bekleyen : null;
  const key = `${s.oyun}|${s.zincir.length}|${b ? b.no : ''}|${s.faz}|${s.sira}`;
  if (key === chainKey) return;
  const old = chainKey.split('|');
  chainKey = key;
  const n = s.zincir.length;
  let html = s.zincir.map((z, i) => balon(z, i)).join('');
  if (b) html += balon({ k: b.k, by: b.by }, n, { pending: true });
  if (!html) {
    const mine = s.sira === myIdx(s);
    const text = s.faz === 'bitti' ? 'Bu sefer zincir kurulamadı.'
      : mine ? 'İlk kelime serbest. Aklına gelen ilk kelimeyle başla!'
        : `${esc(partnerName(s))} ilk kelimeyi düşünüyor…`;
    html = `<li class="kz-empty">${text}</li>`;
  }
  chain.innerHTML = html;
  chain.setAttribute('aria-label', `Zincir: ${n} kelime`);
  // yeni eklenen balon (ya da onay bekleyen) küçük bir hareketle gelir
  const sameGame = old[0] === String(s.oyun) && prev;
  if (sameGame) {
    const grew = n > Number(old[1]);
    const newPending = b && old[2] !== String(b.no);
    const words = chain.querySelectorAll('.kz-word');
    if (newPending) words[words.length - 1]?.classList.add('is-new');
    else if (grew) words[n - 1]?.classList.add('is-new');
  }
  scrollChain();
}

function scrollChain() {
  wrap.scrollTo({ top: wrap.scrollHeight, behavior: REDUCED.matches ? 'auto' : 'smooth' });
}

function drawDock(s) {
  const mi = myIdx(s);
  const izle = mi < 0;
  const end = s.faz === 'bitti';
  const mine = benim(s);
  // onayda araçlar ve kural satırı çekilir: onay kartına yer açılır (klavye açıkken de)
  const onay = s.faz === 'onay' && !s.durak;
  form.classList.toggle('hidden', end);
  tools.classList.toggle('hidden', end || onay);
  msgEl.classList.toggle('hidden', end || onay);
  endEl.classList.toggle('hidden', !end);
  if (end) drawEnd(s); else endKey = '';
  drawAsk(s, mi);
  drawStatus(s);
  statusEl.classList.toggle('hidden', !ask.classList.contains('hidden')); // onay kartı aynı şeyi söyler

  input.disabled = izle || end || !!s.durak;
  sendBtn.disabled = !mine || sending;
  const h = gorunenHarf(s);
  input.placeholder = mine
    ? (s.harf ? `${buyuk(s.harf)} ile başlayan bir kelime` : 'İlk kelime serbest')
    : s.faz === 'onay' && s.bekleyen?.by === mi ? 'Onay bekleniyor…' : 'Sıranı beklerken düşün…';
  letterIn.textContent = h ? buyuk(h) : 'Aa';
  letterEl.classList.toggle('is-idle', !mine);
  if (!mine || (hint && hint.key !== turnKey(s))) setHint(null);
  ipucuBtn.disabled = !mine;
  pasBtn.disabled = !mine;
  if (!msgErr) showRule(s);
}

function drawStatus(s) {
  const mi = myIdx(s);
  const pn = partnerName(s);
  let text;
  let tone = 'wait';
  if (mi < 0) text = 'Bu cihaz oyunda değil · izliyorsun';
  else if (s.durak) text = 'Ara verildi · süre durdu';
  else if (flash && flash.until > Date.now()) ({ text, tone } = flash);
  else if (s.faz === 'oyun') {
    if (s.sira === mi) { text = 'Sıra sende'; tone = 'mine'; } else text = `${pn} düşünüyor…`;
  } else if (s.faz === 'onay') {
    text = s.bekleyen?.by === mi ? `${pn} onaylıyor…` : `${pn} bir kelime yazdı`;
    if (s.bekleyen?.by !== mi) tone = 'mine';
  } else if (s.faz === 'bitti') {
    text = birlikteMi(s) ? 'Zincir koptu' : s.kazanan === mi ? 'Kazandın!' : `${pn} kazandı`;
    tone = birlikteMi(s) || s.kazanan === mi ? 'mine' : 'wait';
  }
  stText.textContent = text || '';
  statusEl.dataset.tone = tone;
}

function setFlash(text, tone) {
  flash = { text, tone, until: Date.now() + FLASH_MS };
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { flash = null; if (shown && shown.faz !== 'kurulum') drawStatus(shown); }, FLASH_MS);
}

function showRule(s) {
  const son = s.zincir[s.zincir.length - 1]?.k;
  msgEl.dataset.tone = '';
  input.removeAttribute('aria-invalid');
  if (son && son.endsWith('ğ') && s.harf) {
    msgEl.innerHTML = `<b>${esc(son)}</b> ğ ile bitti; ğ'den önceki harf geçer: <b>${esc(buyuk(s.harf))}</b>`;
    msgEl.dataset.tone = 'note';
  } else {
    msgEl.textContent = 'Son harfle başla · ğ ile biterse ondan önceki harf';
  }
}

function showErr(text) {
  msgErr = true;
  msgEl.textContent = text;
  msgEl.dataset.tone = 'bad';
  input.setAttribute('aria-invalid', 'true');
  announce(text);
  if (!REDUCED.matches) {
    form.classList.remove('is-nudge');
    void form.offsetWidth;
    form.classList.add('is-nudge');
  }
}

function setHint(k, s = shown) {
  hint = k ? { k, key: turnKey(s) } : null;
  hintBtn.classList.toggle('hidden', !k);
  if (k) {
    hintBtn.innerHTML = `<span class="kz-hint-k">${esc(k)}</span><span class="kz-hint-half">½ puan</span>`;
    hintBtn.setAttribute('aria-label', `Öneri: ${k}. Yazmak için dokun. İpucuyla yarım puan.`);
  }
}

function drawAsk(s, mi) {
  const b = s.faz === 'onay' && !s.durak && mi >= 0 ? s.bekleyen : null;
  if (!b) { ask.classList.add('hidden'); askKey = ''; return; }
  const key = `${s.oyun}:${b.no}`;
  if (askKey === key) return;
  askKey = key;
  const yazan = b.by === mi;
  const pn = esc(partnerName(s));
  const kat = kategoriBul(s.ayar.kategori);
  ask.classList.remove('hidden');
  ask.classList.toggle('is-mine', yazan);
  ask.innerHTML = yazan
    ? `<div class="kz-ask-row"><p class="kz-ask-q" id="kz-ask-q">${pn} onaylıyor…</p><p class="kz-ask-word">${esc(b.k)}</p></div>
       <div class="kz-bar" aria-hidden="true"><i></i></div>`
    : `<div class="kz-ask-row"><p class="kz-ask-q" id="kz-ask-q"><b>${pn}</b> yazdı. Geçerli mi?</p><p class="kz-ask-word">${esc(b.k)}</p></div>
       ${kat && kat.id !== 'serbest' ? `<p class="kz-ask-cat">Kategori: <b>${esc(kat.ad)}</b></p>` : ''}
       <div class="kz-ask-btns">
         <button type="button" class="btn kz-no" data-act="hayir">${SVG.no}İtiraz</button>
         <button type="button" class="btn primary kz-yes" data-act="evet">${SVG.yes}Geçerli</button>
       </div>
       <div class="kz-bar" aria-hidden="true"><i></i></div>
       <p class="kz-ask-note">Cevap vermezsen 5 sn sonra geçer.</p>`;
}

function drawEnd(s) {
  const key = `${s.oyun}:${s.rekor}`;
  if (endKey === key) return;
  endKey = key;
  const mi = Math.max(0, myIdx(s));
  const n = s.zincir.length;
  let title;
  let sub;
  if (birlikteMi(s)) {
    title = s.yeniRekor ? `Yeni rekor: ${n} kelime!` : `${n} kelimelik zincir`;
    sub = `Puan ${puanYaz(toplamPuan(s))} · Rekorunuz ${s.rekor}`;
  } else {
    title = s.kazanan === mi ? 'Kazandın!' : `${partnerName(s)} kazandı`;
    sub = `${n} kelime · Puan ${puanYaz(s.puan[mi])} – ${puanYaz(s.puan[1 - mi])}`;
  }
  endEl.innerHTML = `
    <div class="kz-end-text"><p class="kz-end-title">${esc(title)}</p><p class="kz-end-sub">${esc(sub)}</p></div>
    <div class="kz-end-btns">
      <button type="button" class="btn ghost" data-act="kurulum">Ayarlar</button>
      <button type="button" class="btn primary" data-act="yeni">Tekrar oyna</button>
    </div>`;
}

// ---------- süre göstergesi ----------
function runTicker(s) {
  const need = !s.durak && ((s.faz === 'oyun' && s.bitis != null) || (s.faz === 'onay' && s.bekleyen?.bitis != null));
  if (need && !ticker) ticker = setInterval(tick, 100);
  if (!need && ticker) { clearInterval(ticker); ticker = 0; }
  tick();
}

function tick() {
  const s = shown;
  if (!s || s.faz === 'kurulum') return;
  const now = sync.hostNow();
  if (s.faz === 'oyun' && s.bitis != null && !s.durak) {
    const rem = Math.max(0, s.bitis - now);
    const sec = Math.ceil(rem / 1000);
    letterEl.style.setProperty('--p', Math.min(1, rem / (s.ayar.sure * 1000)).toFixed(3));
    letterEl.classList.toggle('is-low', sec <= UYARI_SN);
    stTime.textContent = `${sec} sn`;
    if (benim(s) && sec !== lastSec && sec <= UYARI_SN && sec > 0) sfx('tick');
    lastSec = sec;
  } else {
    letterEl.style.setProperty('--p', '1');
    letterEl.classList.remove('is-low');
    stTime.textContent = '';
    lastSec = null;
  }
  const bar = ask.querySelector('.kz-bar > i');
  if (bar && s.faz === 'onay' && s.bekleyen?.bitis != null) {
    const q = Math.max(0, Math.min(1, (s.bekleyen.bitis - now) / ONAY_MS));
    bar.style.transform = `scaleX(${q.toFixed(3)})`;
  }
}

// ---------- ses, duyuru, bitiş ----------
function focusInput() {
  if (document.querySelector('dialog[open], .celebrate:not(.leaving)')) return;
  input.focus({ preventScroll: true });
}

function effects(s, prev) {
  const mi = myIdx(s);
  if (!prev || mi < 0) return;
  const pn = partnerName(s);
  if (prev.oyun !== s.oyun) {
    flash = null;
    msgErr = false;
    if (s.faz === 'oyun') {
      announce(`Yeni oyun. ${s.sira === mi ? 'Sen başlıyorsun; ilk kelime serbest.' : `${pn} başlıyor.`}`);
      if (s.sira === mi) queueMicrotask(focusInput);
    }
    return;
  }
  const o = s.olay;
  if (o && o.no !== prev.olay?.no) {
    const ben = o.by === mi;
    switch (o.tur) {
      case 'yazdi':
        if (ben) announce(`${pn} onaylıyor.`);
        else { sfx('flip'); announce(`${pn} “${o.k}” yazdı. Geçerli mi?`); }
        break;
      case 'kabul': {
        sfx('pop');
        let t = ben ? (o.oto ? `Cevap gelmedi, “${o.k}” geçti.` : `${pn} onayladı: “${o.k}”.`) : `“${o.k}” zincire eklendi.`;
        if (s.sira === mi) t += ` Sıra sende, ${buyuk(s.harf)} ile.`;
        announce(t);
        if (birlikteMi(s) && s.rekor > 0 && s.zincir.length === s.rekor + 1) { setFlash('Yeni rekor! Devam 💞', 'mine'); sfx('match'); }
        break;
      }
      case 'red':
        sfx('wrong');
        if (ben) {
          setFlash(`${pn} itiraz etti · yeniden dene`, 'bad');
          announce(`${pn} “${o.k}” kelimesine itiraz etti. Yeniden dene.`);
          if (!input.value) { input.value = o.k; queueMicrotask(() => { focusInput(); input.select(); }); }
        } else {
          setFlash(`İtiraz ettin · ${pn} yeniden deniyor`, 'wait');
          announce(`İtiraz ettin. ${pn} yeniden deniyor.`);
        }
        break;
      case 'sure':
      case 'pas': {
        sfx('wrong');
        const t = o.tur === 'sure'
          ? (ben ? 'Süre doldu · 1 can gitti' : `${pn} yetiştiremedi · 1 can gitti`)
          : (ben ? 'Pas geçtin · 1 can gitti' : `${pn} pas geçti · 1 can gitti`);
        if (s.faz !== 'bitti') setFlash(t, 'bad');
        announce(`${t}.`);
        break;
      }
      default:
        break;
    }
  }
  if (s.faz === 'bitti' && prev.faz !== 'bitti') endGame(s);
  if (benim(s) && !(prev.faz === 'oyun' && prev.sira === mi)) queueMicrotask(focusInput);
}

function endGame(s) {
  const mi = myIdx(s);
  const pn = partnerName(s);
  // Ödül iki cihazda. oyunNo yok: s.oyun her oturumda 1'den başlar; yeniden yüklemede endGame çalışmaz (prev yok).
  oyunOdulu({ roomId, oyun: NS, sonuc: birlikteMi(s) ? 'ortak' : s.kazanan === mi ? 'kazan' : 'kayip', ikiKisi: s.players.length === 2 && !s.players.includes('sevgilim') });
  if (isHost && roomId && loggedGame !== s.oyun) {
    loggedGame = s.oyun;
    logGame(roomId, NS, resultOf(s));
  }
  const n = s.zincir.length;
  let title;
  let lines;
  if (birlikteMi(s)) {
    sfx(s.yeniRekor ? 'win' : 'match');
    title = s.yeniRekor ? 'Yeni rekor! 🎉' : n ? `${n} kelimelik zincir! 💞` : 'Bir dahaki sefere! 💞';
    lines = [`Ortak puan: ${puanYaz(toplamPuan(s))}`, `Rekorunuz: ${s.rekor} kelime`];
  } else {
    sfx(s.kazanan === mi ? 'win' : 'wrong');
    title = s.kazanan === mi ? 'Kazandın! 🎉' : `${pn} kazandı! 🎉`;
    lines = [`Zincir: ${n} kelime`, `Puan: Sen ${puanYaz(s.puan[mi])} – ${puanYaz(s.puan[1 - mi])} ${pn}`];
  }
  announce(`${title.replace(/\s*\S+$/u, '')}. ${lines.join('. ')}.`);
  clearTimeout(celebrateTimer);
  celebrateTimer = setTimeout(() => {
    if (shown?.faz !== 'bitti' || shown.oyun !== s.oyun) return;
    closeCelebrate = celebrate({
      title,
      lines,
      buttons: [
        { label: 'Tekrar oyna', primary: true, onClick: () => { closeCelebrate = null; sync.dispatch({ type: 'yeni', oyun: s.oyun }); } },
        { label: 'Ana sayfaya dön', onClick: () => { location.href = lobbyUrl(); } },
      ],
    });
  }, REDUCED.matches ? 300 : 1100);
}

// ---------- etkileşim ----------
// Düğmeye dokununca giriş odağı (ve telefon klavyesi) kapanmasın.
for (const el of [sendBtn, ask, hintBtn, ipucuBtn]) {
  el.addEventListener('mousedown', (e) => { if (document.activeElement === input && e.target.closest('button')) e.preventDefault(); });
}

input.addEventListener('input', () => {
  if (!msgErr) return;
  msgErr = false;
  if (shown) showRule(shown);
});

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const s = shown;
  if (!s || s.faz !== 'oyun' || s.durak || myIdx(s) < 0) return;
  if (!benim(s)) {
    announce(`Şimdi ${partnerName(s)} yazıyor.`);
    statusEl.classList.remove('is-nudge');
    void statusEl.offsetWidth;
    statusEl.classList.add('is-nudge');
    return;
  }
  if (sending) return;
  const r = kontrol(input.value, { harf: s.harf, kullanilan: kullanilan(s) });
  if (!r.ok) { showErr(r.mesaj); return; }
  const ipucu = !!hint && hint.k === r.kelime;
  if (!sync.dispatch({ type: 'kelime', k: r.kelime, ipucu })) {
    showErr(isHost ? 'Süre doldu.' : 'Bağlantı yok, biraz sonra yeniden dene.');
    return;
  }
  sfx('tap');
  input.value = '';
  setHint(null);
  if (!isHost) {
    sending = true;
    sendBtn.disabled = true;
    sendTimer = setTimeout(() => { sending = false; if (shown) drawDock(shown); }, 3000);
  }
});

ask.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-act]');
  const s = shown;
  if (!b || !s?.bekleyen || s.faz !== 'onay') return;
  ask.querySelectorAll('button').forEach((x) => { x.disabled = true; });
  sfx('tap');
  sync.dispatch({ type: 'onay', evet: b.dataset.act === 'evet', no: s.bekleyen.no });
});

ipucuBtn.addEventListener('click', () => {
  const s = shown;
  if (!s || !benim(s)) return;
  const k = ipucuSec(s.harf, kullanilan(s));
  if (!k) { showErr('Bu harfle önerim kalmadı. Pas geçebilirsin.'); return; }
  sfx('tap');
  setHint(k, s);
  announce(`Öneri: ${k}. İpucuyla yazılan kelime yarım puan.`);
});

hintBtn.addEventListener('click', () => {
  if (!hint) return;
  input.value = hint.k;
  msgErr = false;
  if (shown) showRule(shown);
  input.focus({ preventScroll: true });
});

root.addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-act]');
  const s = shown;
  if (!b || !s) return;
  const act = b.dataset.act;
  if (act === 'yeni') {
    sfx('tap');
    sync.dispatch({ type: 'yeni', oyun: s.oyun }); // gördüğüm oyun: aynı anda iki istek tek oyun açar
  } else if (act === 'kurulum') {
    if ((s.faz === 'oyun' || s.faz === 'onay')
      && !(await confirmDialog('Bu oyunu bırakıp ayarlara dönelim mi?', { ok: 'Dönelim' }))) return;
    sfx('tap');
    sync.dispatch({ type: 'kurulum', oyun: s.oyun });
  } else if (act === 'pas') {
    if (!benim(s) || !(await confirmDialog('Pas geçersen 1 can gider.', { ok: 'Pas geç' }))) return;
    if (shown && benim(shown)) sync.dispatch({ type: 'pas' });
  }
});

setupEl.addEventListener('click', (e) => {
  const b = e.target.closest('[data-ayar] button[data-v]');
  if (!b || b.getAttribute('aria-pressed') === 'true') return;
  const key = b.closest('[data-ayar]').dataset.ayar;
  const v = key === 'sure' ? Number(b.dataset.v) : b.dataset.v;
  sfx('tap');
  sync.dispatch({ type: 'ayar', ayar: { [key]: v } });
});
