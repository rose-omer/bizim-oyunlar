// Yavrumuz oda çizimi: mutfak. Solda kemerli pencere, perdeler ve alçak tezgâh; sağda raf, kavanozlar, askıda kepçe ve tava.
import { sar, TABAN } from './ortak.js';

const PENCERE = '<path class="yvo-cam" d="M36 226V146a48 48 0 0 1 96 0v80Z"/>'
  + '<path class="yvo-cizgi-duvar" d="M84 98v128M36 166h96"/>'
  + '<path class="yvo-esya2" d="M30 226h108v8H30Z"/>'
  + '<path class="yvo-esya" d="M28 98c0 44 8 68 28 82-14 2-28-4-32-12V98ZM140 98c0 44-8 68-28 82 14 2 28-4 32-12V98Z"/>';

// Örnek sahneden 28 birim aşağıda: küçük ekranda üst kırpılınca kavanozlar y 150'nin altında kalır.
// Kepçe ve tava örnekten sağda: bebeğin başı kepçeyi örtmesin.
const RAF = '<g transform="translate(0 28)">'
  + '<rect class="yvo-esya2" x="252" y="172" width="118" height="7" rx="3.5"/>'
  + '<rect class="yvo-esya" x="264" y="130" width="26" height="42" rx="7"/><rect class="yvo-esya2" x="264" y="124" width="26" height="9" rx="3"/>'
  + '<rect class="yvo-esya" x="298" y="144" width="24" height="28" rx="6"/><rect class="yvo-esya2" x="298" y="138" width="24" height="8" rx="3"/>'
  + '<path class="yvo-esya" d="M332 152h24v12a8 8 0 0 1-8 8h-8a8 8 0 0 1-8-8Z"/>'
  + '<path class="yvo-cizgi" d="M306 179v42M338 179v28"/>'
  + '<ellipse class="yvo-esya2" cx="306" cy="229" rx="7" ry="10"/><circle class="yvo-esya" cx="338" cy="222" r="15"/>'
  + '</g>';

const TEZGAH = '<rect class="yvo-esya" x="-8" y="288" width="86" height="84" rx="6"/>'
  + '<rect class="yvo-esya2" x="-8" y="280" width="96" height="10" rx="4"/>'
  + '<circle class="yvo-esya2" cx="62" cy="324" r="3.5"/>';

const ZEMIN_OVAL = '<ellipse class="yvo-zemin2" cx="195" cy="430" rx="150" ry="24" opacity="0.5"/>';

export const sahne = () => sar('mutfak', TABAN + PENCERE + RAF + TEZGAH + ZEMIN_OVAL);
export const CSS = '';
