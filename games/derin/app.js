// Derin Sohbet — sayfa. Durum: ./logic.js; senkron: ../_soru/sync.js.
// Zamanlayıcı yok. Konuşan "Sıra sende" der; ikisi de cevaplayınca yeni soru.
// Aşama sonunda nazik bir ara görevi; ikisi de "Hazırım" deyince devam.
import { sfx } from '../../js/core/sound.js';
import { toast, confirmDialog } from '../../js/core/ui.js';
import { createSync } from '../_soru/sync.js';
import {
  boot, h, createView, partnerName, absenceText, seg,
  loadingScreen, createEnding, endActions,
} from '../_soru/view.js';
import { ASAMALAR } from './sorular.js';
import {
  reduce, initialState, PERS, STAGES, speaker, questionById, taskOf, summary,
} from './logic.js';

const NS = 'derin';
const view = createView(document.getElementById('app'));
view.show(loadingScreen('Bağlanıyor…'), 'boot');

const { room, roomId, hostId, isHost } = await boot({ ns: NS, waitText: 'Sevgilini bekliyoruz 🕯️' });
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
  if (!s) {
    view.show(loadingScreen('Sohbet hazırlanıyor…'), 'load');
    return;
  }
  view.banner(absenceText(s, c));
  effects(prev, s, c);
  prev = s;

  // Yarı (half) anahtarda yok: "Sıra sende" kartı yeniden canlandırmaz, odak korunur.
  const key = `${s.phase}:${s.seed}:${s.stage}:${s.idx}`;
  const fresh = view.fresh(key);
  const canAct = c.isHost || c.partnerHere;
  let node;
  if (s.phase === 'setup') node = setupView(s, c, canAct);
  else if (s.phase === 'ask') node = askView(s, c, canAct, fresh);
  else if (s.phase === 'ara') node = araView(s, c, canAct, fresh);
  else node = endView(s, c);
  view.show(node, key);
}

// ---- Olaylar: ses, kutlama, kayıt ----

function effects(p, s, c) {
  if (s.phase !== 'end') ending.hide();
  if (!p) {
    if (s.phase === 'end') showEnding(s, c, false);
    return;
  }
  const me = c.mySeat;
  const sameQ = p.phase === 'ask' && p.seed === s.seed && p.stage === s.stage && p.idx === s.idx;
  if (s.phase === 'ask' && !sameQ) sfx('flip');
  if (s.phase === 'ask' && sameQ && p.half === 0 && s.half === 1 && speaker(s) === me) {
    sfx('pop');
    view.say('Sıra sende. Şimdi sen cevapla.');
  }
  if (s.phase === 'ara' && p.phase !== 'ara') sfx('match');
  if (s.phase === 'ara' && p.phase === 'ara' && !p.ready[1 - me] && s.ready[1 - me]) sfx('pop');
  if (s.phase === 'end') showEnding(s, c, p.phase !== 'end');
}

function endLines(s) {
  const r = summary(s);
  const lines = [`${r.answered} soruyu birlikte konuştunuz.`];
  if (r.skipped) lines.push(`${r.skipped} soruyu atladınız; bir dahakine.`);
  lines.push('Şimdi birbirinize sarılın 💛');
  return lines;
}

function showEnding(s, c, live) {
  ending.show({
    title: 'Ne güzel konuştunuz 🕯️',
    lines: endLines(s),
    onAgain: () => act({ type: 'restart' }),
    // tam: son aşama bitti ("Sohbeti bitir" değil) ve en az bir soruyu ikisi de cevapladı (atlamak tek kişiyle olur).
    log: live ? { roomId, gameId: NS, s, c, tam: s.answered > 0 && s.stagesDone === STAGES - s.from, result: summary(s) } : null,
  });
}

// ---- Parçalar ----

/** Mum: alev, fitil, gövde. Süs; ekran okuyucudan gizli. */
function candle(big = false) {
  return h('div', { class: `dr-candle${big ? ' dr-candle-big' : ''}`, 'aria-hidden': 'true' },
    h('span', { class: 'dr-glow' }),
    h('span', { class: 'dr-flame' }),
    h('span', { class: 'dr-wick' }),
    h('span', { class: 'dr-wax' }));
}

/** Üç aşama göstergesi. current = şimdiki aşama; doneUpTo = biten aşamalar bu sayının altında. */
function stages(current, { from = 0, done = false } = {}) {
  return h('ol', { class: 'dr-stages', 'aria-label': 'Aşamalar' },
    ASAMALAR.map((a, i) => {
      let state = 'next';
      if (i < from) state = 'off';
      else if (i < current || (done && i === current)) state = 'done';
      else if (i === current) state = 'now';
      return h('li', { class: 'dr-stage', dataset: { state }, 'aria-current': state === 'now' ? 'step' : null },
        h('span', { class: 'dr-dot', 'aria-hidden': 'true' }),
        h('span', { class: 'dr-stage-name' }, a.ad));
    }));
}

function quietButtons(s, { skip }) {
  return h('div', { class: 'dr-quiet' },
    skip ? h('button', {
      type: 'button',
      class: 'btn ghost small',
      dataset: { k: 'skip' },
      onclick: () => act({ type: 'skip', idx: s.idx }, 'tap'),
    }, 'Bu soruyu atla') : null,
    h('button', {
      type: 'button',
      class: 'btn ghost small',
      dataset: { k: 'finish' },
      onclick: async () => {
        sfx('tap');
        const ok = await confirmDialog('Sohbeti burada bitirelim mi?', { ok: 'Bitir', cancel: 'Devam' });
        if (ok) act({ type: 'finish' }, null);
      },
    }, 'Sohbeti bitir'));
}

// ---- Ekranlar ----

function setupView(s, c, canAct) {
  const pn = partnerName(s, c);
  const total = s.per * (STAGES - s.from);
  view.say('Derin Sohbet. Soru sayısını ve başlangıç aşamasını seçin, sonra başlayın.');
  return h('section', { class: 'soru-screen dr-screen' },
    h('div', { class: 'soru-intro soru-in' },
      candle(true),
      h('h1', { class: 'title' }, 'Derin Sohbet'),
      h('p', { class: 'subtitle' },
        'Üç aşamada gittikçe derinleşen sorular. Sırayla soruyu sesli okuyun, cevaplayın ve "Sıra sende" deyin. Acele yok; istemediğiniz soruyu atlayın.')),
    h('ul', { class: 'dr-path' },
      ASAMALAR.map((a, i) => h('li', { class: 'dr-path-item', dataset: { on: String(i >= s.from) } },
        h('span', { class: 'dr-path-name' }, a.ad),
        h('span', { class: 'dr-path-desc' }, a.aciklama)))),
    h('div', { class: 'card stack' },
      h('p', { class: 'soru-names' }, `Sen 🕯️ ${pn}`),
      seg({
        label: 'Her aşamada kaç soru?',
        keyPrefix: 'per',
        options: PERS.map((n) => ({ value: n, label: n === 36 ? '36 · hepsi' : String(n) })),
        value: s.per,
        disabled: !canAct,
        onPick: (per) => act({ type: 'config', per }, null),
      }),
      seg({
        label: 'Nereden başlayalım?',
        keyPrefix: 'from',
        options: ASAMALAR.map((a, i) => ({ value: i, label: a.ad })),
        value: s.from,
        disabled: !canAct,
        onPick: (from) => act({ type: 'config', from }, null),
      }),
      h('p', { class: 'muted dr-note' }, `Toplam ${total} soru. İkiniz de cevaplarsınız; zaman sınırı yok.`),
      h('button', {
        type: 'button',
        class: 'btn primary wide',
        dataset: { k: 'start' },
        disabled: !canAct || undefined,
        onclick: () => act({ type: 'start' }),
      }, 'Sohbete başlayalım')));
}

function askView(s, c, canAct, fresh) {
  const me = c.mySeat;
  const other = 1 - me;
  const pn = partnerName(s, c);
  const q = questionById(s.qs[s.idx]);
  const sp = speaker(s);
  const mine = sp === me;
  const lastQ = s.idx + 1 >= s.qs.length;

  let who;
  let how;
  if (mine && s.half === 0) {
    who = 'Sen başla';
    how = 'Soruyu sesli oku ve cevapla. Bitince "Sıra sende" de.';
  } else if (mine) {
    who = 'Şimdi sen cevapla';
    how = `${pn} cevapladı. Senin cevabından sonra yeni soruya geçin.`;
  } else if (s.half === 0) {
    who = `${pn} anlatıyor`;
    how = 'Dinle; sıra sana gelecek.';
  } else {
    who = `${pn} cevaplıyor`;
    how = 'Sen cevapladın. Şimdi dinle 💛';
  }
  view.say(`${who}. ${q?.text || ''}`);

  // Kimin cevapladığı: ilk yarıda first konuşur; ikinci yarıda first cevaplamıştır.
  const state = (seat) => {
    if (seat === sp) return 'speak';
    if (s.half === 1 && seat === s.first) return 'done';
    return 'wait';
  };
  const turnChip = (seat, name) => {
    const st = state(seat);
    const label = st === 'speak' ? `🎙️ ${name}` : st === 'done' ? `${name} ✓` : `${name} …`;
    return h('span', { class: 'chip dr-turn', dataset: { state: st } }, label);
  };

  let primary;
  if (mine) {
    let label = 'Sıra sende →';
    if (s.half === 1) label = !lastQ ? 'Sonraki soru' : s.stage + 1 < STAGES ? 'Aşamayı tamamla' : 'Sohbeti tamamla';
    primary = h('button', {
      type: 'button',
      class: 'btn primary wide dr-pass',
      dataset: { k: 'pass' },
      disabled: !canAct || undefined,
      onclick: (e) => {
        e.currentTarget.disabled = true;
        act({ type: 'pass', idx: s.idx, half: s.half });
      },
    }, label);
  } else {
    primary = h('p', { class: 'soru-status soru-wait dr-listen' }, `${pn} konuşuyor…`);
  }

  return h('section', { class: 'soru-screen dr-screen' },
    stages(s.stage, { from: s.from }),
    h('p', { class: 'dr-count' }, `${ASAMALAR[s.stage].ad} · Soru ${s.idx + 1}/${s.qs.length}`),
    h('article', { class: `card dr-card${fresh ? ' soru-in' : ''}`, dataset: { mine: String(mine) } },
      h('p', { class: 'dr-who' }, who),
      h('h2', { class: 'dr-q' }, q?.text || 'Soru bulunamadı'),
      h('p', { class: 'dr-how' }, how)),
    h('div', { class: 'soru-locks' }, turnChip(me, 'Sen'), turnChip(other, pn)),
    primary,
    quietButtons(s, { skip: true }));
}

function araView(s, c, canAct, fresh) {
  const me = c.mySeat;
  const pn = partnerName(s, c);
  const next = ASAMALAR[s.stage + 1];
  const iReady = s.ready[me];
  const task = taskOf(s);
  view.say(`Kısa bir ara. ${task}`);
  return h('section', { class: 'soru-screen dr-screen' },
    stages(s.stage, { from: s.from, done: true }),
    h('div', { class: `soru-intro${fresh ? ' soru-in' : ''}` },
      candle(true),
      h('h1', { class: 'title' }, 'Kısa bir ara'),
      h('p', { class: 'subtitle' }, `${ASAMALAR[s.stage].ad} bitti. Sırada ${next?.ad || 'son'}: ${next?.aciklama?.toLocaleLowerCase('tr') || ''}.`)),
    h('blockquote', { class: 'card dr-task' }, task),
    h('div', { class: 'soru-locks' },
      h('span', { class: 'chip soru-lock', dataset: { on: String(iReady) } }, iReady ? 'Sen hazırsın ✓' : 'Sen …'),
      h('span', { class: 'chip soru-lock', dataset: { on: String(s.ready[1 - me]) } }, s.ready[1 - me] ? `${pn} hazır ✓` : `${pn} …`)),
    iReady
      ? h('p', { class: 'soru-status soru-wait' }, `${pn} de hazır olunca devam ediyoruz.`)
      : h('button', {
        type: 'button',
        class: 'btn primary wide',
        dataset: { k: 'ready' },
        disabled: !canAct || undefined,
        onclick: (e) => {
          e.currentTarget.disabled = true;
          act({ type: 'ready' });
        },
      }, 'Hazırım'),
    quietButtons(s, { skip: false }));
}

function endView(s) {
  const r = summary(s);
  view.say(`Sohbet bitti. ${r.answered} soruyu konuştunuz.`);
  return h('section', { class: 'soru-screen dr-screen' },
    h('div', { class: 'soru-intro' },
      candle(true),
      h('h1', { class: 'title' }, 'Ne güzel konuştunuz'),
      h('p', { class: 'subtitle' }, 'Bu sohbet ikinizin. Mum sönse de sözler kalır.')),
    h('ul', { class: 'soru-list' },
      h('li', {}, h('span', {}, 'Birlikte konuştuğunuz soru'), h('strong', {}, String(r.answered))),
      h('li', {}, h('span', {}, 'Atladığınız soru'), h('strong', {}, String(r.skipped))),
      h('li', {}, h('span', {}, 'Tamamlanan aşama'), h('strong', {}, `${r.stagesDone}/${STAGES - r.from}`))),
    h('p', { class: 'dr-closing' }, 'Şimdi birbirinize sarılın 💛'),
    endActions(() => act({ type: 'restart' }, null)));
}
