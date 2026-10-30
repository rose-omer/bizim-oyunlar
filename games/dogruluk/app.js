// Doğruluk mu Cesaret mi — sayfa. Durum: ./logic.js; senkron: ../_soru/sync.js.
// Odasız ya da "Tek başıma" seçilirse aynı telefonda sırayla oynanır (aynı reducer, yerel).
import { sfx } from '../../js/core/sound.js';
import { toast, confirmDialog } from '../../js/core/ui.js';
import { createSync } from '../_soru/sync.js';
import { NAME_MAX } from '../_soru/common.js';
import {
  boot, h, createView, nameOf, partnerName, absenceText,
  loadingScreen, createEnding, endActions, goLobby,
} from '../_soru/view.js';
import { reduce, initialState, LEVELS, cardById, winner } from './logic.js';

const NS = 'dogruluk';
const LEVEL_INFO = {
  tatli: { label: 'Tatlı', emoji: '🍬', desc: 'Romantik ve sevimli' },
  eglenceli: { label: 'Eğlenceli', emoji: '😄', desc: 'Gülmeye hazır olun' },
  cesur: { label: 'Cesur', emoji: '🔥', desc: 'Biraz yüz kızartır' },
};
const KIND_INFO = {
  dogruluk: { label: 'Doğruluk', emoji: '🗣️' },
  cesaret: { label: 'Cesaret', emoji: '🔥' },
};

const view = createView(document.getElementById('app'));
view.show(loadingScreen('Bağlanıyor…'), 'boot');

const { room, roomId, hostId, isHost, solo } = await boot({
  ns: NS,
  allowSolo: true,
  waitText: 'Sevgilini bekliyoruz 🎲',
});
const ending = createEnding();
let prev = null;
const draftNames = ['', ''];

const sync = createSync({
  room,
  ns: NS,
  roomId,
  hostId,
  isHost,
  solo,
  reduce,
  initial: (players) => initialState({
    players: solo ? [{ id: '1', name: room.me.name }, { id: '2', name: '' }] : players,
    solo,
  }),
  onChange: render,
});

// "Tek başıma" oynarken sevgilin gelirse haber ver (hafıza ile aynı).
if (solo && roomId) {
  let seen = false;
  room.on('presence', (p) => {
    const here = !!p && p.page === NS;
    if (here && !seen) {
      toast(`${p.name || 'Sevgilin'} geldi!`, { action: { label: 'Birlikte oyna', onClick: () => location.reload() }, ms: 8000 });
    }
    seen = here;
  });
}

function act(a, sound = 'tap') {
  if (sound) sfx(sound);
  const ok = sync.dispatch(a);
  if (ok === false && !sync.ctx().isHost) {
    toast('Bağlantı yok; biraz sonra yeniden dene.');
    render(sync.state, sync.ctx());
  }
  return ok;
}

function render(s, c) {
  if (c.partnerSolo) {
    view.banner('');
    view.show(soloView(), 'partner-solo');
    return;
  }
  if (!s) {
    view.show(loadingScreen('Oyun yükleniyor…'), 'load');
    return;
  }
  view.banner(absenceText(s, c));
  effects(prev, s, c);
  prev = s;

  const key = `${s.phase}:${s.seed}:${s.draws}`;
  const fresh = view.fresh(key);
  const canAct = c.solo || c.isHost || c.partnerHere;
  let node;
  if (s.phase === 'setup') node = setupView(s, c, canAct);
  else if (s.phase === 'choose') node = chooseView(s, c, canAct, fresh);
  else if (s.phase === 'card') node = cardView(s, c, canAct, fresh);
  else node = endView(s, c);
  view.show(node, key);
}

// ---- Olaylar ----

function effects(p, s, c) {
  if (s.phase !== 'end') ending.hide();
  if (!p) {
    if (s.phase === 'end') showEnding(s, c, false);
    return;
  }
  if (s.phase === 'card' && p.phase !== 'card') sfx('flip');
  if (p.phase === 'card' && s.phase === 'choose' && s.last) sfx(s.last.result === 'done' ? 'match' : 'wrong');
  if (s.phase === 'end') showEnding(s, c, p.phase !== 'end');
}

function showEnding(s, c, live) {
  const w = winner(s);
  const total = s.scores[0] + s.scores[1] + s.passes[0] + s.passes[1];
  let title = 'Berabere! 💞';
  if (w !== null) title = !c.solo && w === c.mySeat ? 'Sen kazandın! 🏆' : `Kazanan: ${nameOf(s, w, c)} 🏆`;
  ending.show({
    title,
    lines: [
      `${nameOf(s, 0, c)}: ${s.scores[0]} puan`,
      `${nameOf(s, 1, c)}: ${s.scores[1]} puan`,
      `${total} kart oynadınız.`,
    ],
    onAgain: () => act({ type: 'restart' }),
    log: live && c.isHost
      ? {
        roomId,
        gameId: NS,
        result: { scores: s.scores, passes: s.passes, levels: s.levels, names: s.players.map((x) => x.name), solo: c.solo },
      }
      : null,
  });
}

// ---- Ekranlar ----

// Misafir: ev sahibi "Tek başıma" seçti. Bu sayfada kalırsa, o "Birlikte oyna" deyince oyun açılır.
function soloView() {
  const pn = room.partner()?.name || 'Sevgilin';
  view.say(`${pn} şu an tek başına oynuyor.`);
  return h('section', { class: 'soru-screen soru-center' },
    h('div', { class: 'soru-hero', 'aria-hidden': 'true' }, '🎲'),
    h('h1', { class: 'title' }, `${pn} tek başına oynuyor`),
    h('p', { class: 'subtitle' }, 'Bitince birlikte oynayın 💞 Burada beklersen oyun birlikte açılır.'),
    h('button', { type: 'button', class: 'btn primary', dataset: { k: 'lobby' }, onclick: goLobby }, 'Ana sayfaya dön'));
}

function nameField(i, value) {
  const id = `dg-name-${i}`;
  return h('div', { class: 'soru-field dg-name' },
    h('label', { class: 'soru-label', for: id }, `${i + 1}. oyuncu`),
    h('input', {
      id,
      class: 'input',
      type: 'text',
      maxlength: NAME_MAX,
      autocomplete: 'off',
      placeholder: i === 0 ? 'Senin adın' : 'Sevgilinin adı',
      value,
      dataset: { k: id },
      oninput: (e) => { draftNames[i] = e.currentTarget.value; },
    }));
}

function toggleLevel(s, level) {
  const has = s.levels.includes(level);
  const next = has ? s.levels.filter((l) => l !== level) : [...s.levels, level];
  if (!next.length) {
    toast('En az bir seviye seçin.');
    return;
  }
  act({ type: 'config', levels: next });
}

function startGame(s, c) {
  if (c.solo) {
    for (const i of [0, 1]) {
      const name = (draftNames[i] || s.players[i].name || '').trim() || `${i + 1}. oyuncu`;
      sync.dispatch({ type: 'seat', idx: i, name });
    }
  }
  act({ type: 'start' });
}

function setupView(s, c, canAct) {
  if (c.solo) {
    for (const i of [0, 1]) if (!draftNames[i]) draftNames[i] = s.players[i].name;
  }
  view.say('Kurulum: seviyeleri seçin ve başlayın.');
  return h('section', { class: 'soru-screen' },
    h('div', { class: 'soru-intro soru-in' },
      h('div', { class: 'soru-hero', 'aria-hidden': 'true' }, '🎲'),
      h('h1', { class: 'title' }, 'Doğruluk mu Cesaret mi'),
      h('p', { class: 'subtitle' },
        c.solo
          ? 'Aynı telefonda sırayla oynayın. Sırası gelen seçer, diğeri "yaptı mı" diye karar verir.'
          : 'Sırası gelen seçer, kart ikinize de görünür. Diğeriniz "yaptı mı" diye karar verir.')),
    h('div', { class: 'card stack' },
      c.solo
        ? h('div', { class: 'dg-names' }, nameField(0, draftNames[0]), nameField(1, draftNames[1]))
        : h('p', { class: 'soru-names' }, `Sen 💞 ${partnerName(s, c)}`),
      h('div', { class: 'soru-field' },
        h('span', { class: 'soru-label', id: 'dg-levels' }, 'Seviyeler (birden çok seçebilirsiniz)'),
        h('div', { class: 'dg-levels', role: 'group', 'aria-labelledby': 'dg-levels' },
          LEVELS.map((l) => h('button', {
            type: 'button',
            class: 'dg-level',
            'aria-pressed': String(s.levels.includes(l)),
            disabled: !canAct || undefined,
            dataset: { k: `lvl-${l}` },
            onclick: () => toggleLevel(s, l),
          },
          h('span', { class: 'dg-level-emoji', 'aria-hidden': 'true' }, LEVEL_INFO[l].emoji),
          h('span', { class: 'dg-level-name' }, LEVEL_INFO[l].label),
          h('span', { class: 'dg-level-desc' }, LEVEL_INFO[l].desc))))),
      h('button', {
        type: 'button',
        class: 'btn primary wide',
        dataset: { k: 'start' },
        disabled: !canAct || undefined,
        onclick: () => startGame(s, c),
      }, 'Başlayalım')));
}

function scoreBar(s, c) {
  return h('div', { class: 'soru-top' },
    [0, 1].map((i) => h('span', { class: `chip${s.turn === i && s.phase !== 'end' ? ' accent' : ''}` },
      `${nameOf(s, i, c)} · ${s.scores[i]} puan`)));
}

function finishButton() {
  return h('button', {
    type: 'button',
    class: 'btn ghost small dg-finish',
    dataset: { k: 'finish' },
    onclick: async () => {
      sfx('tap');
      const ok = await confirmDialog('Oyunu bitirelim mi?', { ok: 'Bitir', cancel: 'Devam' });
      if (ok) act({ type: 'finish' }, null);
    },
  }, 'Bitir');
}

function lastLine(s, c) {
  if (!s.last) return null;
  const who = nameOf(s, s.last.seat, c);
  const text = s.last.result === 'done' ? `${who} yaptı ✓ +1` : `${who} pas geçti ✗`;
  return h('p', { class: `soru-score dg-last ${s.last.result === 'done' ? 'good' : 'bad'}` }, text);
}

function chooseView(s, c, canAct, fresh) {
  const turnName = nameOf(s, s.turn, c);
  const mine = c.solo || s.turn === c.mySeat;
  const heading = c.solo ? `Sıra: ${turnName}` : mine ? 'Sıra sende!' : `Sıra: ${turnName}`;
  const status = mine ? 'Doğruluk mu, cesaret mi?' : `${turnName} seçiyor…`;
  view.say(`${heading} ${status}`);

  const pickBtn = (kind) => h('button', {
    type: 'button',
    class: `btn dg-kind dg-${kind}`,
    dataset: { k: `kind-${kind}` },
    disabled: !canAct || undefined,
    onclick: (e) => {
      e.currentTarget.disabled = true;
      act({ type: 'choose', kind, by: s.turn });
    },
  },
  h('span', { class: 'dg-kind-emoji', 'aria-hidden': 'true' }, KIND_INFO[kind].emoji),
  KIND_INFO[kind].label);

  return h('section', { class: 'soru-screen' },
    scoreBar(s, c),
    h('div', { class: `soru-intro${fresh ? ' soru-in' : ''}` },
      h('h1', { class: 'title dg-turn' }, heading),
      c.solo ? h('p', { class: 'subtitle' }, `Telefonu ver: ${turnName}`) : null),
    lastLine(s, c),
    mine
      ? h('div', { class: 'dg-kinds', role: 'group', 'aria-label': status }, pickBtn('dogruluk'), pickBtn('cesaret'))
      : h('p', { class: 'soru-status soru-wait' }, status),
    finishButton());
}

function cardView(s, c, canAct, fresh) {
  const card = cardById(s.card);
  const turnName = nameOf(s, s.turn, c);
  const judge = 1 - s.turn;
  const judgeName = nameOf(s, judge, c);
  const iJudge = c.solo || judge === c.mySeat;
  const kind = KIND_INFO[card?.kind] || KIND_INFO.dogruluk;
  const level = LEVEL_INFO[card?.level] || LEVEL_INFO.tatli;

  let note;
  if (c.solo) note = `${turnName} kartı yapsın. Karar veren: ${judgeName}`;
  else if (iJudge) note = `${turnName} kartı yapınca karar ver:`;
  else note = `Senin kartın! Yapınca ${judgeName} onaylayacak.`;
  view.say(`${kind.label} kartı: ${card?.text || ''} ${note}`);

  const markBtn = (result, label, cls) => h('button', {
    type: 'button',
    class: `btn ${cls}`,
    dataset: { k: `mark-${result}` },
    disabled: !canAct || undefined,
    onclick: (e) => {
      e.currentTarget.disabled = true;
      act({ type: 'mark', result, by: judge }, null);
    },
  }, label);

  return h('section', { class: 'soru-screen' },
    scoreBar(s, c),
    h('p', { class: 'soru-role dg-for' }, c.solo || s.turn !== c.mySeat ? `${turnName} için` : 'Senin için'),
    h('article', { class: `card dg-card dg-${card?.kind || 'dogruluk'}${fresh ? ' soru-flip' : ''}` },
      h('div', { class: 'dg-card-head' },
        h('span', { class: 'chip accent' }, `${kind.emoji} ${kind.label}`),
        h('span', { class: 'chip' }, `${level.emoji} ${level.label}`)),
      h('p', { class: 'dg-card-text' }, card?.text || 'Kart bulunamadı')),
    h('p', { class: 'soru-status' }, note),
    iJudge
      ? h('div', { class: 'soru-actions', role: 'group', 'aria-label': `${turnName} yaptı mı?` },
        markBtn('done', 'Yaptı ✓', 'primary'),
        markBtn('pass', 'Pas ✗', ''))
      : null,
    finishButton());
}

function endView(s, c) {
  const w = winner(s);
  const title = w === null ? 'Berabere! 💞' : !c.solo && w === c.mySeat ? 'Sen kazandın! 🏆' : `Kazanan: ${nameOf(s, w, c)} 🏆`;
  view.say(`Oyun bitti. ${title}`);
  return h('section', { class: 'soru-screen' },
    h('div', { class: 'soru-intro' },
      h('div', { class: 'soru-hero', 'aria-hidden': 'true' }, '🎉'),
      h('h1', { class: 'title' }, title)),
    h('ul', { class: 'soru-list' },
      [0, 1].map((i) => h('li', {},
        h('span', {}, nameOf(s, i, c)),
        h('strong', {}, `${s.scores[i]} puan · ${s.passes[i]} pas`)))),
    endActions(() => sync.dispatch({ type: 'restart' })));
}
