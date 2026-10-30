// Aynı Kafa — sayfa. Durum: ./logic.js; senkron: ../_soru/sync.js.
// Süreyi ev sahibi tutar: seçim süresi dolunca `timeout`, açılıştan sonra kendiliğinden `next`.
import { sfx } from '../../js/core/sound.js';
import { toast } from '../../js/core/ui.js';
import { createSync } from '../_soru/sync.js';
import {
  boot, h, createView, partnerName, absenceText, lockChoice, seg,
  loadingScreen, createEnding, endActions,
} from '../_soru/view.js';
import { reduce, initialState, COUNTS, PICK_MS, pairOf, result } from './logic.js';

const NS = 'aynikafa';
const REVEAL_MS = 2600;

const view = createView(document.getElementById('app'));
view.show(loadingScreen('Bağlanıyor…'), 'boot');

const { room, roomId, hostId, isHost } = await boot({ ns: NS, waitText: 'Sevgilini bekliyoruz 🤝' });
const ending = createEnding();
let prev = null;

const sync = createSync({
  room,
  ns: NS,
  roomId,
  hostId,
  isHost,
  reduce,
  initial: (players) => initialState({ players }),
  onChange: render,
});

function act(a) {
  sfx('tap');
  const ok = sync.dispatch(a);
  if (ok === false && !sync.ctx().isHost) {
    toast('Bağlantı yok; biraz sonra yeniden dene.');
    render(sync.state, sync.ctx());
  }
}

function render(s, c) {
  if (!s) {
    view.show(loadingScreen('Oyun yükleniyor…'), 'load');
    return;
  }
  view.banner(absenceText(s, c));
  effects(prev, s, c);
  hostTimers(s, c);
  prev = s;

  const key = `${s.phase}:${s.seed}:${s.round}`;
  const fresh = view.fresh(key);
  const canAct = c.isHost || c.partnerHere;
  let node;
  if (s.phase === 'setup') node = setupView(s, c, canAct);
  else if (s.phase === 'pick') node = pickView(s, c, canAct, fresh);
  else if (s.phase === 'reveal') node = revealView(s, c, canAct, fresh);
  else node = endView(s, c);
  view.show(node, key);
  tick();
}

// ---- Ev sahibi zamanlayıcıları ----

let timer = 0;
let timerKey = '';
let wasHere = false;

function hostTimers(s, c) {
  if (!c.isHost) return;
  // Partner geri geldiğinde süre azalmışsa turu tazele.
  if (c.partnerHere && !wasHere && s.phase === 'pick' && s.deadline - Date.now() < PICK_MS / 2) {
    wasHere = true;
    queueMicrotask(() => sync.dispatch({ type: 'rearm' }));
    return;
  }
  wasHere = c.partnerHere;
  const key = c.partnerHere ? `${s.phase}:${s.seed}:${s.round}:${s.deadline}` : 'paused';
  if (key === timerKey) return;
  timerKey = key;
  clearTimeout(timer);
  timer = 0;
  if (!c.partnerHere) return;
  if (s.phase === 'pick') {
    const round = s.round;
    timer = setTimeout(() => {
      const done = sync.dispatch({ type: 'timeout', round });
      const now = sync.state;
      if (!done && now.phase === 'pick' && now.round === round) {
        timerKey = '';
        hostTimers(now, sync.ctx());
      }
    }, Math.max(0, s.deadline - Date.now()) + 60);
  } else if (s.phase === 'reveal') {
    const round = s.round;
    timer = setTimeout(() => sync.dispatch({ type: 'next', round }), REVEAL_MS);
  }
}

// ---- Geri sayım (her iki tarafta) ----

let lastSec = -1;

function tick() {
  const s = sync.state;
  const c = sync.ctx();
  const el = document.querySelector('[data-countdown]');
  if (!s || s.phase !== 'pick' || !el) {
    lastSec = -1;
    return;
  }
  const paused = !c.partnerHere;
  const left = paused ? PICK_MS : Math.max(0, s.deadline + c.offset - Date.now());
  const sec = Math.ceil(left / 1000);
  el.querySelector('.ak-sec').textContent = paused ? '⏸' : String(sec);
  el.style.setProperty('--left', (left / PICK_MS).toFixed(3));
  el.dataset.low = String(!paused && sec <= 3);
  if (!paused && sec !== lastSec && sec > 0 && sec <= 3 && s.picks[c.mySeat] === null) sfx('tick');
  lastSec = sec;
}
setInterval(tick, 200);

// ---- Olaylar ----

function effects(p, s, c) {
  const other = 1 - c.mySeat;
  if (s.phase !== 'end') ending.hide();
  if (!p) {
    if (s.phase === 'end') showEnding(s, c, false);
    return;
  }
  if (s.phase === 'pick' && p.phase === 'pick' && p.round === s.round && p.picks[other] === null && s.picks[other] !== null) {
    sfx('pop');
  }
  if (s.phase === 'pick' && (p.phase !== 'pick' || p.round !== s.round)) sfx('flip');
  if (s.phase === 'reveal' && p.phase !== 'reveal') sfx(s.log[s.round]?.m ? 'match' : 'wrong');
  if (s.phase === 'end') showEnding(s, c, p.phase !== 'end');
}

function showEnding(s, c, live) {
  const r = result(s);
  ending.show({
    title: r.tier,
    lines: [`Uyumunuz: %${r.percent}`, `${s.count} sorunun ${s.matches} tanesinde aynı şeyi seçtiniz.`],
    onAgain: () => act({ type: 'restart' }),
    log: live && c.isHost
      ? { roomId, gameId: NS, result: { percent: r.percent, matches: s.matches, count: s.count } }
      : null,
  });
}

// ---- Ekranlar ----

function setupView(s, c, canAct) {
  const pn = partnerName(s, c);
  view.say('Kurulum: tur sayısını seçin ve başlayın.');
  return h('section', { class: 'soru-screen' },
    h('div', { class: 'soru-intro soru-in' },
      h('div', { class: 'soru-hero', 'aria-hidden': 'true' }, '🤝'),
      h('h1', { class: 'title' }, 'Aynı Kafa'),
      h('p', { class: 'subtitle' },
        'Her turda iki seçenek çıkar. 10 saniyede ikiniz de seçin; aynı şeyi seçerseniz uyum puanı!')),
    h('div', { class: 'card stack' },
      h('p', { class: 'soru-names' }, `Sen 💞 ${pn}`),
      seg({
        label: 'Kaç tur?',
        keyPrefix: 'count',
        options: COUNTS.map((n) => ({ value: n, label: String(n) })),
        value: s.count,
        disabled: !canAct,
        onPick: (count) => act({ type: 'config', count }),
      }),
      h('button', {
        type: 'button',
        class: 'btn primary wide',
        dataset: { k: 'start' },
        disabled: !canAct || undefined,
        onclick: () => act({ type: 'start' }),
      }, 'Başlayalım')));
}

function topBar(s) {
  const pair = pairOf(s.qs[s.round]);
  const done = s.round + (s.phase === 'reveal' ? 1 : 0);
  return [
    h('div', { class: 'soru-top' },
      h('span', { class: 'chip' }, `Tur ${s.round + 1}/${s.qs.length}`),
      h('span', { class: 'chip accent' }, pair?.cat || ''),
      h('span', { class: 'chip' }, `Uyum ${s.matches}/${done}`)),
    h('div', { class: 'soru-progress', 'aria-hidden': 'true', vars: { '--p': `${Math.round((100 * done) / s.qs.length)}%` } }, h('span')),
  ];
}

function pickView(s, c, canAct, fresh) {
  const me = c.mySeat;
  const pn = partnerName(s, c);
  const pair = pairOf(s.qs[s.round]) || { a: '?', b: '?' };
  const mine = s.picks[me];
  const theirs = s.picks[1 - me];

  let status;
  if (mine === null && theirs === null) status = 'İlk aklına gelen! ⚡';
  else if (mine === null) status = `${pn} seçti, çabuk!`;
  else status = `${pn} düşünüyor…`;
  view.say(`${pair.a} mı, ${pair.b} mı? ${status}`);

  const choice = (v) => h('button', {
    type: 'button',
    class: 'btn ak-choice',
    'aria-pressed': String(mine === v),
    disabled: mine !== null || !canAct || undefined,
    dataset: { k: `pick-${v}` },
    onclick: (e) => {
      lockChoice(e.currentTarget);
      act({ type: 'pick', choice: v });
    },
  }, pair[v]);

  return h('section', { class: 'soru-screen' },
    topBar(s),
    h('div', { class: 'ak-timer', role: 'timer', 'aria-label': 'Kalan süre (saniye)', dataset: { countdown: '' } },
      h('div', { class: 'ak-bar', 'aria-hidden': 'true' }, h('span')),
      h('span', { class: 'ak-sec' }, '10')),
    h('div', { class: `ak-vs${fresh ? ' soru-in' : ''}`, role: 'group', 'aria-label': 'Hangisi?' },
      choice('a'),
      h('span', { class: 'ak-or', 'aria-hidden': 'true' }, 'ya da'),
      choice('b')),
    h('div', { class: 'soru-locks' },
      h('span', { class: 'chip soru-lock', dataset: { on: String(mine !== null) } }, mine !== null ? 'Sen ✓' : 'Sen …'),
      h('span', { class: 'chip soru-lock', dataset: { on: String(theirs !== null) } }, theirs !== null ? `${pn} ✓` : `${pn} …`)),
    h('p', { class: `soru-status${mine !== null && theirs === null ? ' soru-wait' : ''}` }, status));
}

function revealView(s, c, canAct, fresh) {
  const me = c.mySeat;
  const pn = partnerName(s, c);
  const pair = pairOf(s.qs[s.round]) || { a: '?', b: '?' };
  const mine = s.picks[me];
  const theirs = s.picks[1 - me];
  const m = !!s.log[s.round]?.m;
  const label = (v) => (v ? pair[v] : 'Seçmedi ⏰');
  const res = m ? 'Aynı kafa! 🤝' : mine === null || theirs === null ? 'Süre doldu ⏰' : 'Farklı seçtiniz 🙃';
  const last = s.round + 1 >= s.qs.length;
  view.say(`İkiniz de seçtiniz! Sen: ${label(mine)}. ${pn}: ${label(theirs)}. ${res}`);

  const face = (who, v) => h('div', { class: `soru-face ${m ? 'good' : 'bad'}${fresh ? ' soru-flip' : ''}` },
    h('span', { class: 'soru-face-label' }, who),
    h('span', { class: 'soru-face-value' }, label(v)));

  return h('section', { class: 'soru-screen' },
    topBar(s),
    h('p', { class: 'ak-pairline' }, `${pair.a} ya da ${pair.b}`),
    h('div', { class: 'soru-reveal' }, face('Sen', mine), face(pn, theirs)),
    h('p', { class: `soru-result ${m ? 'good' : 'bad'}${fresh ? ' soru-pop' : ''}` }, res),
    h('button', {
      type: 'button',
      class: 'btn primary wide',
      dataset: { k: 'next' },
      disabled: !canAct || undefined,
      onclick: () => act({ type: 'next', round: s.round }),
    }, last ? 'Sonuçları gör' : 'Sonraki'),
    h('p', { class: 'muted ak-note' }, 'Birazdan kendiliğinden geçer.'));
}

function endView(s, c) {
  const r = result(s);
  const me = c.mySeat;
  const pn = partnerName(s, c);
  const rows = s.log.map((e) => ({ ...e, pair: pairOf(e.q) })).filter((e) => e.pair);
  const same = rows.filter((e) => e.m);
  const diff = rows.filter((e) => !e.m);
  const pick = (e, seat) => (e.p[seat] ? e.pair[e.p[seat]] : '—');
  view.say(`Oyun bitti. ${r.tier}. Uyum yüzde ${r.percent}.`);

  return h('section', { class: 'soru-screen' },
    h('div', { class: 'soru-intro' },
      h('div', { class: 'soru-hero', 'aria-hidden': 'true' }, '🤝'),
      h('h1', { class: 'title' }, r.tier),
      h('p', { class: 'subtitle' }, `%${r.percent} uyum · ${s.count} turun ${s.matches} tanesinde aynı`)),
    same.length > 0 && h('h2', { class: 'soru-list-title' }, `Aynı seçtikleriniz (${same.length})`),
    same.length > 0 && h('ul', { class: 'soru-list' },
      same.map((e) => h('li', {},
        h('span', {}, `${e.pair.a} / ${e.pair.b}`),
        h('strong', { class: 'ak-good' }, `✓ ${pick(e, me)}`)))),
    diff.length > 0 && h('h2', { class: 'soru-list-title' }, `Farklı düşündükleriniz (${diff.length})`),
    diff.length > 0 && h('ul', { class: 'soru-list' },
      diff.map((e) => h('li', {},
        h('span', {}, `${e.pair.a} / ${e.pair.b}`),
        h('span', { class: 'ak-diff' }, `Sen: ${pick(e, me)} · ${pn}: ${pick(e, 1 - me)}`)))),
    endActions(() => sync.dispatch({ type: 'restart' })));
}
