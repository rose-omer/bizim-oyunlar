// Kim Daha Çok? — saf durum makinesi. DOM'a dokunmaz.
// İkisi aynı anda "Ben" ya da "Sen" seçer. Aynı kişiyi gösterirlerse anlaşma:
// Ömer "Ben" + Gül "Sen" = ikisi de Ömer dedi.
import { LISTE, KATEGORILER } from './ifadeler.js';
import { secimOyunu, COUNTS, DEFAULT_COUNT } from './secim.js';
import { percent, tier } from '../_soru/common.js';

export { COUNTS, DEFAULT_COUNT };
export const CHOICES = ['ben', 'sen'];
export const DEFAULT_CATS = ['eglenceli', 'romantik', 'gunluk'];

const TIERS = [
  [90, 'Tek yürek, tek ses 💞'],
  [70, 'Birbirinizi ezbere biliyorsunuz 📖'],
  [50, 'Çoğu konuda hemfikirsiniz 🤝'],
  [30, 'Tatlı bir tartışma çıkar 😄'],
  [0, 'Kim kimdir, hâlâ çözülüyor 🤔'],
];

/** Koltuk `by`, `choice` seçince kimi gösterdi? (koltuk) */
export function target(by, choice) {
  return choice === 'ben' ? by : 1 - by;
}

const oyun = secimOyunu({
  game: 'kimdaha',
  items: LISTE,
  cats: KATEGORILER,
  defaultCats: DEFAULT_CATS,
  choices: CHOICES,
  agree: (p) => target(0, p[0]) === target(1, p[1]),
});

export const { initialState, reduce, itemById } = oyun;

/**
 * Bitiş özeti. votes[i] = i koltuğunu kaç kez gösterdiniz (iki kişinin toplamı);
 * agreed[i] = ikinizin de i dediği ifade sayısı.
 */
export function result(s) {
  const played = s.log.length;
  const votes = [0, 0];
  const agreed = [0, 0];
  for (const e of s.log) {
    const t0 = target(0, e.p[0]);
    const t1 = target(1, e.p[1]);
    votes[t0] += 1;
    votes[t1] += 1;
    if (t0 === t1) agreed[t0] += 1;
  }
  const pct = percent(s.matches, played);
  return { played, matches: s.matches, percent: pct, tier: tier(pct, TIERS), votes, agreed };
}
