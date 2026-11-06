// Beni Ne Kadar Tanıyorsun? — sayfa. Durum: ./logic.js; senkron: ../_soru/sync.js.
import { sfx } from '../../js/core/sound.js';
import { toast } from '../../js/core/ui.js';
import { createSync } from '../_soru/sync.js';
import {
  boot, h, createView, nameOf, partnerName, absenceText, lockChoice, seg,
  loadingScreen, createEnding, endActions,
} from '../_soru/view.js';
import { reduce, initialState, COUNTS, subjectOf, questionById, result } from './logic.js';

const NS = 'tanis';
const view = createView(document.getElementById('app'));
view.show(loadingScreen('Bağlanıyor…'), 'boot');

const { room, roomId, hostId, isHost } = await boot({ ns: NS, waitText: 'Sevgilini bekliyoruz 💭' });
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
}

// ---- Olaylar: ses, kutlama, kayıt ----

function effects(p, s, c) {
  const other = 1 - c.mySeat;
  if (s.phase !== 'end') ending.hide();
  if (s.phase === 'pick' && (!p || p.phase !== 'pick' || p.round !== s.round)) {
    if (p) sfx('flip');
  } else if (s.phase === 'pick' && p.picks[other] === null && s.picks[other] !== null) {
    sfx('pop');
  }
  if (s.phase === 'reveal' && p && p.phase !== 'reveal') sfx(s.picks[0] === s.picks[1] ? 'match' : 'wrong');
  if (s.phase === 'end') showEnding(s, c, !!p && p.phase !== 'end');
}

function showEnding(s, c, live) {
  const r = result(s);
  const pn = partnerName(s, c);
  const mine = r.per[c.mySeat];
  const theirs = r.per[1 - c.mySeat];
  ending.show({
    title: r.tier,
    lines: [
      `${pn} hakkında ${mine.correct}/${mine.of} bildin.`,
      `${pn} senin hakkında ${theirs.correct}/${theirs.of} bildi.`,
      `Toplam uyum: %${r.percent}`,
    ],
    onAgain: () => act({ type: 'restart' }),
    log: live
      ? {
        roomId,
        gameId: NS,
        s,
        c,
        result: { scores: s.scores, asked: s.asked, percent: r.percent, names: s.players.map((x) => x.name) },
      }
      : null,
  });
}

// ---- Ekranlar ----

function setupView(s, c, canAct) {
  const pn = partnerName(s, c);
  view.say('Kurulum: soru sayısını seçin ve başlayın.');
  return h('section', { class: 'soru-screen' },
    h('div', { class: 'soru-intro soru-in' },
      h('div', { class: 'soru-hero', 'aria-hidden': 'true' }, '💭'),
      h('h1', { class: 'title' }, 'Beni Ne Kadar Tanıyorsun?'),
      h('p', { class: 'subtitle' },
        'Her turda biriniz kendini cevaplar, diğeri tahmin eder. İkiniz de seçince cevaplar açılır.')),
    h('div', { class: 'card stack' },
      h('p', { class: 'soru-names' }, `Sen 💞 ${pn}`),
      seg({
        label: 'Kaç soru?',
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

function topBar(s, c) {
  const subj = subjectOf(s);
  const label = subj === c.mySeat ? 'Senin hakkında' : `${partnerName(s, c)} hakkında`;
  const pct = Math.round((100 * (s.round + (s.phase === 'reveal' ? 1 : 0))) / s.qs.length);
  return [
    h('div', { class: 'soru-top' },
      h('span', { class: 'chip' }, `Soru ${s.round + 1}/${s.qs.length}`),
      h('span', { class: 'chip accent tn-subject' }, label)),
    h('div', { class: 'soru-progress', 'aria-hidden': 'true', vars: { '--p': `${pct}%` } }, h('span')),
  ];
}

function questionText(s, c) {
  const q = questionById(s.qs[s.round]);
  if (!q) return { q: null, text: 'Soru bulunamadı' };
  return { q, text: subjectOf(s) === c.mySeat ? q.self : q.other };
}

function pickView(s, c, canAct, fresh) {
  const me = c.mySeat;
  const other = 1 - me;
  const pn = partnerName(s, c);
  const iAmSubject = subjectOf(s) === me;
  const { q, text } = questionText(s, c);
  const mine = s.picks[me];
  const theirs = s.picks[other];

  let status;
  if (mine === null && theirs === null) status = iAmSubject ? 'Kendi cevabını seç.' : 'Tahminini seç.';
  else if (mine === null) status = `${pn} seçti, sıra sende!`;
  else status = `${pn} düşünüyor…`;
  view.say(`${text} ${status}`);

  return h('section', { class: 'soru-screen' },
    topBar(s, c),
    h('div', { class: `card soru-qcard stack${fresh ? ' soru-in' : ''}` },
      h('p', { class: 'soru-role' }, iAmSubject ? `Dürüst ol, ${pn} tahmin edecek 😉` : `${pn} ne seçer sence?`),
      h('h2', { class: 'soru-q' }, text)),
    h('div', { class: 'soru-opts', role: 'group', 'aria-label': 'Şıklar' },
      (q?.a || []).map((label, i) => h('button', {
        type: 'button',
        class: 'btn soru-opt',
        'aria-pressed': String(mine === i),
        disabled: mine !== null || !canAct || undefined,
        dataset: { k: `opt${i}` },
        onclick: (e) => {
          lockChoice(e.currentTarget);
          act({ type: 'pick', choice: i });
        },
      }, label))),
    h('div', { class: 'soru-locks' },
      h('span', { class: 'chip soru-lock', dataset: { on: String(mine !== null) } }, mine !== null ? 'Sen ✓' : 'Sen …'),
      h('span', { class: 'chip soru-lock', dataset: { on: String(theirs !== null) } }, theirs !== null ? `${pn} ✓` : `${pn} …`)),
    h('p', { class: `soru-status${mine !== null && theirs === null ? ' soru-wait' : ''}` }, status));
}

function revealView(s, c, canAct, fresh) {
  const me = c.mySeat;
  const pn = partnerName(s, c);
  const subj = subjectOf(s);
  const guesser = 1 - subj;
  const { q, text } = questionText(s, c);
  const hit = s.picks[0] === s.picks[1];
  const opt = (i) => q?.a[i] ?? '—';

  let res;
  if (guesser === me) res = hit ? 'Bildin! 🎉' : 'Olmadı… 🙈';
  else res = hit ? `${pn} bildi! 💘` : `${pn} bilemedi 🙈`;
  const last = s.round + 1 >= s.qs.length;
  const score = `Skor · Sen ${s.scores[me]} · ${pn} ${s.scores[1 - me]}`;
  view.say(`İkiniz de seçtiniz! Cevap: ${opt(s.picks[subj])}. Tahmin: ${opt(s.picks[guesser])}. ${res}`);

  const anim = (cls) => (fresh ? `${cls} soru-flip` : cls);
  return h('section', { class: 'soru-screen' },
    topBar(s, c),
    h('div', { class: 'card soru-qcard stack' },
      h('p', { class: 'soru-role' }, 'İkiniz de seçtiniz!'),
      h('h2', { class: 'soru-q' }, text)),
    h('div', { class: 'soru-reveal' },
      h('div', { class: anim('soru-face good') },
        h('span', { class: 'soru-face-label' }, `Cevap · ${nameOf(s, subj, c)}`),
        h('span', { class: 'soru-face-value' }, opt(s.picks[subj]))),
      h('div', { class: anim(`soru-face ${hit ? 'good' : 'bad'}`) },
        h('span', { class: 'soru-face-label' }, `Tahmin · ${nameOf(s, guesser, c)}`),
        h('span', { class: 'soru-face-value' }, opt(s.picks[guesser])))),
    h('p', { class: `soru-result ${hit ? 'good' : 'bad'}${fresh ? ' soru-pop' : ''}` }, res),
    h('p', { class: 'soru-score' }, score),
    h('button', {
      type: 'button',
      class: 'btn primary wide',
      dataset: { k: 'next' },
      disabled: !canAct || undefined,
      onclick: () => act({ type: 'next', round: s.round }),
    }, last ? 'Sonuçları gör' : 'Sonraki soru'));
}

function endView(s, c) {
  const r = result(s);
  const pn = partnerName(s, c);
  const mine = r.per[c.mySeat];
  const theirs = r.per[1 - c.mySeat];
  view.say(`Oyun bitti. ${r.tier}. Toplam uyum yüzde ${r.percent}.`);
  return h('section', { class: 'soru-screen' },
    h('div', { class: 'soru-intro' },
      h('div', { class: 'soru-hero', 'aria-hidden': 'true' }, '🏆'),
      h('h1', { class: 'title' }, r.tier),
      h('p', { class: 'subtitle' }, `İkiniz toplam %${r.percent} bildiniz.`)),
    h('ul', { class: 'soru-list' },
      h('li', {}, h('span', {}, `Sen, ${pn} hakkında`), h('strong', {}, `${mine.correct}/${mine.of}`)),
      h('li', {}, h('span', {}, `${pn}, senin hakkında`), h('strong', {}, `${theirs.correct}/${theirs.of}`))),
    endActions(() => sync.dispatch({ type: 'restart' })));
}
