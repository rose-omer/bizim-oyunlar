// Hiç … Yaptın mı? — sayfa. Durum: ./logic.js; ortak sayfa: ../kimdaha/secim-sayfa.js.
import { sfx } from '../../js/core/sound.js';
import { h, partnerName } from '../_soru/view.js';
import { SEVIYELER } from './ifadeler.js';
import * as L from './logic.js';
import { secimSayfasi, face, textList } from '../kimdaha/secim-sayfa.js';

const CATS = {
  tatli: { label: 'Tatlı', emoji: '🍬', desc: 'Sevimli itiraflar' },
  eglenceli: { label: 'Eğlenceli', emoji: '😄', desc: 'Komik anılar' },
  cesur: { label: 'Cesur', emoji: '🔥', desc: 'Biraz yüz kızartır (PG-13)' },
};

const DID = 'yaptim';
const answerText = (v) => (v === DID ? 'Yaptım 🙋' : 'Yapmadım');

function verdict(s, c) {
  const [a, b] = s.picks;
  if (a === DID && b === DID) return 'İkiniz de yapmışsınız! 😮';
  if (a !== DID && b !== DID) return 'İkiniz de yapmamışsınız 😇';
  const did = a === DID ? 0 : 1;
  return did === c.mySeat ? 'Sen yapmışsın! 👀' : `${partnerName(s, c)} yapmış! 👀`;
}

/** "Anlat!" bölümü: yapan karşı tarafa istek düğmesi; senden istendiyse çağrı. */
function storyArea(s, c, act, canAct) {
  const me = c.mySeat;
  const other = 1 - me;
  const pn = partnerName(s, c);
  const ask = s.ask || [false, false];
  const parts = [];
  if (s.picks[me] === DID && ask[me]) {
    parts.push(h('p', { class: 'hy-call', role: 'status' }, `${pn} merak etti: Anlat bakalım! 🎤`));
  }
  if (s.picks[other] === DID) {
    parts.push(ask[other]
      ? h('p', { class: 'hy-asked' }, `İstek gitti. Şimdi ${pn} anlatsın 🎤`)
      : h('button', {
        type: 'button',
        class: 'btn hy-ask',
        dataset: { k: 'ask' },
        disabled: !canAct || undefined,
        onclick: (e) => {
          e.currentTarget.disabled = true;
          act({ type: 'ask' }, 'pop');
        },
      }, 'Anlat! 🎤'));
  }
  if (!parts.length) return null;
  return h('div', { class: 'hy-story' }, parts);
}

function title(r, s, c) {
  const me = c.mySeat;
  if (r.did[me] === r.did[1 - me]) return 'Maceraya eşit ortaksınız 🤝';
  return r.did[me] > r.did[1 - me] ? 'Sen daha maceracısın 🙈' : `Daha maceracı: ${partnerName(s, c)} 🙈`;
}

secimSayfasi({
  ns: 'hicyaptin',
  hero: '🙈',
  title: 'Hiç … Yaptın mı?',
  waitText: 'Sevgilini bekliyoruz 🙈',
  intro: 'Her turda bir "Hiç … yaptın mı?" sorusu. İkiniz de gizlice cevaplayın, cevaplar birlikte açılsın. Yapana "Anlat!" diyebilirsiniz.',
  catLabel: 'Seviyeler (birden çok seçebilirsiniz)',
  cats: CATS,
  catOrder: SEVIYELER,
  logic: L,
  choices: L.CHOICES,
  hint: () => 'Dürüst ol; cevaplar birlikte açılır.',
  choice: (v) => (v === DID ? { big: 'Yaptım', sub: 'Evet, oldu 🙈' } : { big: 'Yapmadım', sub: 'Hiç olmadı 😇' }),
  topChip: (s, c) => {
    const r = L.result(s);
    return `🙋 Sen ${r.did[c.mySeat]} · ${partnerName(s, c)} ${r.did[1 - c.mySeat]}`;
  },
  revealSound: (s) => (s.picks.includes(DID) ? 'pop' : 'flip'),

  reveal(s, c, { fresh, act, canAct }) {
    const me = c.mySeat;
    const other = 1 - me;
    const both = s.picks[0] === DID && s.picks[1] === DID;
    return [
      h('div', { class: 'soru-reveal' },
        face('Sen', answerText(s.picks[me]), s.picks[me] === DID ? 'hy-did' : '', fresh),
        face(partnerName(s, c), answerText(s.picks[other]), s.picks[other] === DID ? 'hy-did' : '', fresh)),
      h('p', { class: `soru-result hy-verdict${both ? ' good' : ''}${fresh ? ' soru-pop' : ''}` }, verdict(s, c)),
      storyArea(s, c, act, canAct),
    ];
  },

  // Senden anlatman istenince ses + ekran okuyucu duyurusu.
  effects(p, s, c, view) {
    const me = c.mySeat;
    if (s.phase === 'reveal' && p.phase === 'reveal' && p.round === s.round && !p.ask?.[me] && s.ask?.[me]) {
      sfx('pop');
      view.say(`${partnerName(s, c)} merak etti: Anlat bakalım!`);
    }
  },

  ending(s, c) {
    const r = L.result(s);
    const me = c.mySeat;
    return {
      title: title(r, s, c),
      lines: [
        `Sen ${r.did[me]} kez, ${partnerName(s, c)} ${r.did[1 - me]} kez "Yaptım" dedi.`,
        `Sürpriz eşleşme: ${r.both} (ikiniz de yapmışsınız)`,
        `${r.played} sorunun ${r.same} tanesinde aynı cevap.`,
      ],
      result: { did: r.did, both: r.both, none: r.none, played: r.played, cats: s.cats },
    };
  },

  endBody(s, c) {
    const r = L.result(s);
    const me = c.mySeat;
    const pn = partnerName(s, c);
    const textOf = (e) => L.itemById(e.q)?.text || '';
    const only = (seat) => s.log.filter((e) => e.p[seat] === DID && e.p[1 - seat] !== DID).map(textOf);
    return [
      h('ul', { class: 'soru-list' },
        h('li', {}, h('span', {}, 'Sen'), h('strong', {}, `${r.did[me]} kez "Yaptım"`)),
        h('li', {}, h('span', {}, pn), h('strong', {}, `${r.did[1 - me]} kez "Yaptım"`)),
        h('li', {}, h('span', {}, 'İkiniz de yapmamış'), h('strong', {}, `${r.none} soru`))),
      textList('Sürpriz eşleşmeler: ikiniz de yapmışsınız', s.log.filter((e) => e.p[0] === DID && e.p[1] === DID).map(textOf)),
      textList('Yalnız sen yapmışsın', only(me)),
      textList(`Yalnız ${pn} yapmış`, only(1 - me)),
    ];
  },
});
