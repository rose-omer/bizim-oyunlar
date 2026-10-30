// Kim Daha Çok? — sayfa. Durum: ./logic.js; ortak sayfa: ./secim-sayfa.js.
import { h, partnerName } from '../_soru/view.js';
import { KATEGORILER } from './ifadeler.js';
import * as L from './logic.js';
import { secimSayfasi, face, myName, textList } from './secim-sayfa.js';

const CATS = {
  eglenceli: { label: 'Eğlenceli', emoji: '😄', desc: 'Gülmeye hazır olun' },
  romantik: { label: 'Romantik', emoji: '💘', desc: 'Kalbinizi ısıtsın' },
  gunluk: { label: 'Günlük hayat', emoji: '🏠', desc: 'Evdeki hâlleriniz' },
  cesur: { label: 'Cesur', emoji: '🔥', desc: 'Biraz yüz kızartır (PG-13)' },
};

/** Koltuğun görünen adı: kendin için kendi adın, karşı taraf için onun adı. */
const who = (seat, s, c) => (seat === c.mySeat ? myName(s, c) : partnerName(s, c));

function verdict(s, c) {
  const p = s.picks;
  const t0 = L.target(0, p[0]);
  if (t0 === L.target(1, p[1])) return { text: `Anlaştınız: ${who(t0, s, c)}! 🤝`, good: true };
  if (p[0] === 'ben') return { text: 'İkiniz de kendinizi gösterdiniz 🙃', good: false };
  return { text: 'İkiniz de birbirinizi gösterdiniz 🙃', good: false };
}

function topLine(r, s, c) {
  const me = c.mySeat;
  const mine = r.votes[me];
  const theirs = r.votes[1 - me];
  if (mine === theirs) return `Oylar eşit: ikiniz de ${mine} kez seçildiniz.`;
  return mine > theirs
    ? `En çok seçilen: Sen (${mine} oy) 🙋`
    : `En çok seçilen: ${partnerName(s, c)} (${theirs} oy) 🙋`;
}

secimSayfasi({
  ns: 'kimdaha',
  hero: '🤔',
  title: 'Kim Daha Çok?',
  waitText: 'Sevgilini bekliyoruz 🤔',
  intro: 'Her turda bir ifade çıkar. İkiniz de gizlice "Ben" ya da "Sen" deyin. Aynı kişiyi gösterirseniz anlaştınız!',
  catLabel: 'Kategoriler (birden çok seçebilirsiniz)',
  cats: CATS,
  catOrder: KATEGORILER,
  logic: L,
  choices: L.CHOICES,
  hint: (s, c) => `Sence kim? Gizlice seç; ${partnerName(s, c)} görmeyecek.`,
  choice: (v, s, c) => (v === 'ben'
    ? { big: 'Ben', sub: myName(s, c) }
    : { big: 'Sen', sub: partnerName(s, c) }),
  topChip: (s) => `Anlaşma ${s.matches}/${s.log.length}`,
  revealSound: (s) => (s.log[s.round]?.m ? 'match' : 'wrong'),

  reveal(s, c, { fresh }) {
    const me = c.mySeat;
    const other = 1 - me;
    const v = verdict(s, c);
    const cls = v.good ? 'good' : 'bad';
    const pointed = (seat) => who(L.target(seat, s.picks[seat]), s, c);
    return [
      h('div', { class: 'soru-reveal' },
        face('Sen dedin', pointed(me), cls, fresh),
        face(`${partnerName(s, c)} dedi`, pointed(other), cls, fresh)),
      h('p', { class: `soru-result ${cls}${fresh ? ' soru-pop' : ''}` }, v.text),
    ];
  },

  ending(s, c) {
    const r = L.result(s);
    return {
      title: r.tier,
      lines: [
        `Uyumunuz: %${r.percent}`,
        `${r.played} ifadenin ${r.matches} tanesinde anlaştınız.`,
        topLine(r, s, c),
      ],
      result: { percent: r.percent, matches: r.matches, played: r.played, votes: r.votes, cats: s.cats },
    };
  },

  endBody(s, c) {
    const r = L.result(s);
    const me = c.mySeat;
    const pn = partnerName(s, c);
    const textOf = (e) => L.itemById(e.q)?.text || '';
    const on = (seat) => s.log.filter((e) => e.m && L.target(0, e.p[0]) === seat).map(textOf);
    const split = s.log.filter((e) => !e.m).map(textOf);
    return [
      h('p', { class: 'soru-score' }, `${r.played} ifadenin ${r.matches} tanesinde anlaştınız.`),
      h('h2', { class: 'soru-list-title' }, 'Kim kaç kez seçildi?'),
      h('ul', { class: 'soru-list' },
        h('li', {}, h('span', {}, 'Sen'), h('strong', {}, `${r.votes[me]} oy`)),
        h('li', {}, h('span', {}, pn), h('strong', {}, `${r.votes[1 - me]} oy`))),
      h('p', { class: 'soru-score' }, topLine(r, s, c)),
      textList('Sen olduğunda anlaştıklarınız', on(me)),
      textList(`${pn} olduğunda anlaştıklarınız`, on(1 - me)),
      textList('Farklı düşündükleriniz', split),
    ];
  },
});
