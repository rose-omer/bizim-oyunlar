// Yavrumuz oda çizimi: mutfak. Solda kemerli pencere, perdeler ve alçak tezgâh; sağda raf, kavanozlar, askıda kepçe ve tava.
import { sar, TABAN } from './ortak.js';

const PENCERE = '<path class="yvo-cam" d="M36 226V146a48 48 0 0 1 96 0v80Z"/>'
  + '<path class="yvo-cizgi-duvar" d="M84 98v128M36 166h96"/>'
  + '<rect class="yvo-esya2" x="26" y="224" width="116" height="13" rx="6.5"/>'
  + '<path class="yvo-esya" d="M28 98c0 44 8 68 28 82-14 2-28-4-32-12V98ZM140 98c0 44-8 68-28 82 14 2 28-4 32-12V98Z"/>';

// Örnek sahneden 28 birim aşağıda: küçük ekranda üst kırpılınca kavanozlar y 150'nin altında kalır.
// Kepçe ve tava örnekten sağda: bebeğin başı kepçeyi örtmesin.
const RAF = '<g transform="translate(0 28)">'
  + '<rect class="yvo-esya2" x="250" y="171" width="122" height="11" rx="5.5"/>'
  + '<rect class="yvo-r5" x="264" y="130" width="26" height="42" rx="10"/><rect class="yvo-esya2" x="261" y="122" width="32" height="12" rx="6"/>'
  + '<rect class="yvo-r2" x="298" y="144" width="24" height="28" rx="9"/><rect class="yvo-esya2" x="295" y="136" width="30" height="11" rx="5.5"/>'
  + '<path class="yvo-r4" d="M332 152h24v10a10 10 0 0 1-10 10h-4a10 10 0 0 1-10-10Z"/>'
  + '<path class="yvo-cizgi" d="M306 179v42M338 179v28"/>'
  + '<ellipse class="yvo-esya2" cx="306" cy="229" rx="9" ry="12"/><circle class="yvo-r3" cx="338" cy="222" r="16"/>'
  + '</g>';

const FAYANS = '<defs><pattern id="yvo-karo-mutfak" width="26" height="26" patternUnits="userSpaceOnUse"><rect class="yvo-duvar2" x="1.5" y="1.5" width="23" height="23" rx="6"/></pattern></defs>'
  + '<rect class="yvo-duvar" x="20" y="250" width="350" height="104"/><rect fill="url(#yvo-karo-mutfak)" x="20" y="250" width="350" height="104"/>';

const TEZGAH = '<rect class="yvo-esya" x="-8" y="288" width="88" height="84" rx="14"/>'
  + '<rect class="yvo-esya2" x="-10" y="276" width="100" height="16" rx="8"/>'
  + '<circle class="yvo-esya2" cx="60" cy="324" r="5.5"/>'
  + '<rect class="yvo-r5" x="22" y="248" width="16" height="28" rx="6"/><rect class="yvo-esya2" x="25" y="240" width="10" height="10" rx="4"/>'
  + '<circle class="yvo-r1" cx="58" cy="258" r="8"/><circle class="yvo-r6" cx="71" cy="260" r="7"/>'
  + '<path class="yvo-r4" d="M46 262H84A19 15 0 0 1 46 262Z"/>';

const ZEMIN_OVAL = '<ellipse class="yvo-zemin2 yvo-puf" cx="195" cy="430" rx="150" ry="24"/>';

export const sahne = () => sar('mutfak', TABAN + FAYANS + PENCERE + RAF + TEZGAH + ZEMIN_OVAL);
export const CSS = '';
