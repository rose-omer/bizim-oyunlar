// Gizli seçim oyunları için ortak sayfa: Kim Daha Çok? ve Hiç … Yaptın mı?
// Akış: kurulum (tur + kategoriler) → seçim (ikisi de gizli) → açılış → … → bitiş.
// Süre yok; "Sonraki" ikisinden biri basınca geçer. Ev sahibi otoritedir (../_soru/sync.js).
// Oyuna özel parçalar `o` ile gelir (metinler, düğme etiketleri, açılış ve bitiş içeriği).
import { sfx } from '../../js/core/sound.js';
import { toast, confirmDialog } from '../../js/core/ui.js';
import { createSync } from '../_soru/sync.js';
import {
  boot, h, createView, partnerName, absenceText, lockChoice, seg,
  loadingScreen, createEnding, endActions,
} from '../_soru/view.js';
import { COUNTS } from './secim.js';

/** Kendi adın (ad yoksa "Sen"). */
export function myName(s, c) {
  return s.players[c.mySeat]?.name || 'Sen';
}

/** Açılışta bir kişinin kartı. */
export function face(label, value, cls, fresh) {
  return h('div', { class: `soru-face ${cls || ''}${fresh ? ' soru-flip' : ''}` },
    h('span', { class: 'soru-face-label' }, label),
    h('span', { class: 'soru-face-value' }, value));
}

/** Başlıklı ifade listesi (bitiş ekranı). */
export function textList(title, texts) {
  if (!texts.length) return [];
  return [
    h('h2', { class: 'soru-list-title' }, `${title} (${texts.length})`),
    h('ul', { class: 'soru-list s2-list' }, texts.map((t) => h('li', {}, h('span', {}, t)))),
  ];
}

/**
 * o = { ns, hero, title, intro, waitText, catLabel, cats: { id: { label, emoji, desc } }, catOrder,
 *   logic: { reduce, initialState, itemById }, choices: [x, y],
 *   hint(s,c), choice(v,s,c) -> { big, sub }, topChip(s,c), revealSound(s),
 *   reveal(s,c,{ fresh, act }) -> Node[], ending(s,c) -> { title, lines, result },
 *   endBody(s,c) -> Node[], effects?(p,s,c,view) }
 */
export async function secimSayfasi(o) {
  const view = createView(document.getElementById('app'));
  view.show(loadingScreen('Bağlanıyor…'), 'boot');

  const { room, roomId, hostId, isHost } = await boot({ ns: o.ns, waitText: o.waitText });
  const ending = createEnding();
  let prev = null;

  const sync = createSync({
    room,
    ns: o.ns,
    roomId,
    hostId,
    isHost,
    reduce: o.logic.reduce,
    initial: (players) => o.logic.initialState({ players }),
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
    if (!p) {
      if (s.phase === 'end') showEnding(s, c, false);
      return;
    }
    const sameRound = p.phase === s.phase && p.round === s.round && p.seed === s.seed;
    if (s.phase === 'pick' && sameRound && p.picks[other] === null && s.picks[other] !== null) sfx('pop');
    if (s.phase === 'pick' && !sameRound) sfx('flip');
    if (s.phase === 'reveal' && p.phase !== 'reveal') sfx(o.revealSound(s));
    if (s.phase === 'end') showEnding(s, c, p.phase !== 'end');
    o.effects?.(p, s, c, view);
  }

  function showEnding(s, c, live) {
    const e = o.ending(s, c);
    ending.show({
      title: e.title,
      lines: e.lines,
      onAgain: () => act({ type: 'restart' }),
      // tam: bütün turlar oynandı ("Oyunu bitir" ile yarım kalmadı).
      log: live ? { roomId, gameId: o.ns, s, c, tam: s.log.length === s.qs.length, result: e.result } : null,
    });
  }

  // ---- Parçalar ----

  function toggleCat(s, cat) {
    const has = s.cats.includes(cat);
    const next = has ? s.cats.filter((x) => x !== cat) : [...s.cats, cat];
    if (!next.length) {
      toast('En az birini seçin.');
      return;
    }
    act({ type: 'config', cats: next });
  }

  function finishButton() {
    return h('button', {
      type: 'button',
      class: 'btn ghost small s2-finish',
      dataset: { k: 'finish' },
      onclick: async () => {
        sfx('tap');
        const ok = await confirmDialog('Oyunu burada bitirelim mi?', { ok: 'Bitir', cancel: 'Devam' });
        if (ok) act({ type: 'finish' }, null);
      },
    }, 'Oyunu bitir');
  }

  function topBar(s, c) {
    const item = o.logic.itemById(s.qs[s.round]);
    const cat = o.cats[item?.cat];
    const done = s.round + (s.phase === 'reveal' ? 1 : 0);
    const extra = o.topChip(s, c);
    return [
      h('div', { class: 'soru-top' },
        h('span', { class: 'chip' }, `Tur ${s.round + 1}/${s.qs.length}`),
        cat ? h('span', { class: 'chip accent' }, `${cat.emoji} ${cat.label}`) : null,
        extra ? h('span', { class: 'chip' }, extra) : null),
      h('div', { class: 'soru-progress', 'aria-hidden': 'true', vars: { '--p': `${Math.round((100 * done) / s.qs.length)}%` } }, h('span')),
    ];
  }

  function questionCard(s, note, fresh) {
    const item = o.logic.itemById(s.qs[s.round]);
    return h('div', { class: `card soru-qcard stack s2-qcard${fresh ? ' soru-in' : ''}` },
      note ? h('p', { class: 'soru-role' }, note) : null,
      h('h2', { class: 'soru-q' }, item?.text || 'İfade bulunamadı'));
  }

  // ---- Ekranlar ----

  function setupView(s, c, canAct) {
    view.say(`${o.title}. Tur sayısını ve kategorileri seçin, sonra başlayın.`);
    const labelId = `${o.ns}-cats`;
    return h('section', { class: 'soru-screen' },
      h('div', { class: 'soru-intro soru-in' },
        h('div', { class: 'soru-hero', 'aria-hidden': 'true' }, o.hero),
        h('h1', { class: 'title' }, o.title),
        h('p', { class: 'subtitle' }, o.intro)),
      h('div', { class: 'card stack' },
        h('p', { class: 'soru-names' }, `Sen 💞 ${partnerName(s, c)}`),
        seg({
          label: 'Kaç tur?',
          keyPrefix: 'count',
          options: COUNTS.map((n) => ({ value: n, label: String(n) })),
          value: s.count,
          disabled: !canAct,
          onPick: (count) => act({ type: 'config', count }, null),
        }),
        h('div', { class: 'soru-field s2-field' },
          h('span', { class: 'soru-label', id: labelId }, o.catLabel),
          h('div', { class: 's2-cats', role: 'group', 'aria-labelledby': labelId },
            o.catOrder.map((id) => h('button', {
              type: 'button',
              class: 's2-cat',
              'aria-pressed': String(s.cats.includes(id)),
              disabled: !canAct || undefined,
              dataset: { k: `cat-${id}` },
              onclick: () => toggleCat(s, id),
            },
            h('span', { class: 's2-cat-emoji', 'aria-hidden': 'true' }, o.cats[id].emoji),
            h('span', { class: 's2-cat-name' }, o.cats[id].label),
            h('span', { class: 's2-cat-desc' }, o.cats[id].desc))))),
        h('button', {
          type: 'button',
          class: 'btn primary wide',
          dataset: { k: 'start' },
          disabled: !canAct || undefined,
          onclick: () => act({ type: 'start' }),
        }, 'Başlayalım')));
  }

  function pickView(s, c, canAct, fresh) {
    const me = c.mySeat;
    const pn = partnerName(s, c);
    const mine = s.picks[me];
    const theirs = s.picks[1 - me];
    const item = o.logic.itemById(s.qs[s.round]);

    let status;
    if (mine === null && theirs === null) status = 'İkiniz de gizlice seçin.';
    else if (mine === null) status = `${pn} seçti, sıra sende!`;
    else status = `${pn} düşünüyor…`;
    view.say(`${item?.text || ''} ${status}`);

    const choiceBtn = (v) => {
      const lab = o.choice(v, s, c);
      return h('button', {
        type: 'button',
        class: 'btn s2-choice',
        'aria-pressed': String(mine === v),
        disabled: mine !== null || !canAct || undefined,
        dataset: { k: `pick-${v}` },
        onclick: (e) => {
          lockChoice(e.currentTarget);
          act({ type: 'pick', choice: v });
        },
      },
      h('span', { class: 's2-choice-big' }, lab.big),
      lab.sub ? h('span', { class: 's2-choice-sub' }, lab.sub) : null);
    };

    return h('section', { class: 'soru-screen' },
      topBar(s, c),
      questionCard(s, o.hint(s, c), fresh),
      h('div', { class: 's2-choices', role: 'group', 'aria-label': 'Cevabın' }, o.choices.map(choiceBtn)),
      h('div', { class: 'soru-locks' },
        h('span', { class: 'chip soru-lock', dataset: { on: String(mine !== null) } }, mine !== null ? 'Sen ✓' : 'Sen …'),
        h('span', { class: 'chip soru-lock', dataset: { on: String(theirs !== null) } }, theirs !== null ? `${pn} ✓` : `${pn} …`)),
      h('p', { class: `soru-status${mine !== null && theirs === null ? ' soru-wait' : ''}` }, status),
      finishButton());
  }

  function revealView(s, c, canAct, fresh) {
    const last = s.round + 1 >= s.qs.length;
    return h('section', { class: 'soru-screen' },
      topBar(s, c),
      questionCard(s, 'İkiniz de seçtiniz!', false),
      o.reveal(s, c, { fresh, act, canAct }),
      h('button', {
        type: 'button',
        class: 'btn primary wide',
        dataset: { k: 'next' },
        disabled: !canAct || undefined,
        onclick: () => act({ type: 'next', round: s.round }),
      }, last ? 'Sonuçları gör' : 'Sonraki'),
      finishButton());
  }

  function endView(s, c) {
    const e = o.ending(s, c);
    view.say(`Oyun bitti. ${e.title}`);
    return h('section', { class: 'soru-screen' },
      h('div', { class: 'soru-intro' },
        h('div', { class: 'soru-hero', 'aria-hidden': 'true' }, o.hero),
        h('h1', { class: 'title' }, e.title),
        e.lines[0] ? h('p', { class: 'subtitle' }, e.lines[0]) : null),
      o.endBody(s, c),
      endActions(() => act({ type: 'restart' }, null)));
  }
}
