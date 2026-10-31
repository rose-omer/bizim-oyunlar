// Oyunlarımız: tüm oyunlar, gruplu (grup üyeliği mantik.js OYUN_GRUBU). Kart: kutucuk, ad, kişi ve süre.
// Oyun açma ana sayfayla aynı kural (acilisPlani): sevgilin o oyundaysa ona katıl; değilse 'go' ile haber ver.
import { bootPage } from '../../js/core/sayfa.js';
import { GAMES, gameById } from '../../js/core/games.js';
import { gameUrl } from '../../js/core/identity.js';
import { h, knownPartner, locative } from '../../js/core/ui.js';
import { sfx } from '../../js/core/sound.js';
import { grupla, grupRengi, kartAlt, acilisPlani } from './mantik.js';

const BEKLEME_MS = 2500; // sevgilinin yeri belli olana dek kartlar kapalı (ikinci ev sahibi olmasın)
const GONDERME_MS = 160; // 'go' mesajı yola çıksın diye sayfadan çıkmadan önce bekleme

const { room, roomId, me } = await bootPage({ ns: 'oyunlar', title: 'Oyunlarımız', tab: 'biz' });
const app = document.getElementById('app');

let partner = room.partner?.() || null;
let bekliyor = !partner;
let gidiyor = false;

const ipucu = h('p', { class: 'oy-ipucu', role: 'status' });
const kartlar = [];

function kart(g) {
  const rozet = h('span', { class: 'chip accent oy-rozet', hidden: true });
  const el = h('button', { type: 'button', class: 'game-card oy-kart', dataset: { game: g.id }, onclick: () => ac(g) },
    h('span', { class: 'game-tile', dataset: { tint: grupRengi(g.id) }, 'aria-hidden': 'true' }, g.emoji),
    h('span', { class: 'oy-govde' },
      h('span', { class: 'game-title' }, g.title),
      h('span', { class: 'oy-alt' }, kartAlt(g))),
    rozet);
  kartlar.push({ el, rozet, id: g.id });
  return el;
}

const izgara = h('div', { class: 'oy' },
  ipucu,
  grupla(GAMES).map((gr) => h('section', { class: 'oy-grup', 'aria-labelledby': `oy-${gr.id}` },
    h('div', { class: 'oy-grup-bas' },
      h('h2', { id: `oy-${gr.id}` }, gr.ad),
      h('span', { class: 'oy-sayi' }, `${gr.oyunlar.length} oyun`)),
    h('div', { class: 'oy-izgara' }, gr.oyunlar.map(kart)))));
app.replaceChildren(izgara);

function ciz() {
  const ad = partner?.name || knownPartner(roomId)?.name || '';
  const nerede = partner ? gameById(partner.page) : null;
  ipucu.textContent = bekliyor ? 'Bağlanıyor…'
    : nerede ? `${ad || 'Sevgilin'} şu an ${locative(nerede.title)}.`
    : partner ? `Bir oyun seç; ${ad || 'sevgilin'} de seninle gelir.`
    : ad ? `Bir oyun açarsan ${ad} gelince seni orada görür.` : '';
  izgara.setAttribute('aria-busy', String(bekliyor));
  for (const { el, rozet, id } of kartlar) {
    el.disabled = bekliyor;
    const burada = !!partner && partner.page === id;
    el.dataset.partner = String(burada);
    rozet.hidden = !burada;
    rozet.textContent = burada ? `${ad || 'Sevgilin'} burada` : '';
  }
}

function ac(g) {
  if (gidiyor || bekliyor) return;
  gidiyor = true;
  sfx('tap');
  const plan = acilisPlani(g.id, { roomId, partner, benId: me.clientId });
  const url = gameUrl(g.id, { roomId, host: plan.host });
  if (!plan.gonder) {
    location.href = url;
    return;
  }
  try { room.sendAll({ t: 'go', game: g.id, host: plan.host }); } catch { /* bağlantı yoksa da oyun açılır */ }
  setTimeout(() => { location.href = url; }, GONDERME_MS);
}

const zaman = setTimeout(() => {
  bekliyor = false;
  ciz();
}, BEKLEME_MS);
room.on('presence', (p) => {
  partner = p || null;
  if (p) {
    clearTimeout(zaman);
    bekliyor = false;
  }
  ciz();
});
// Geri tuşuyla önbellekten dönülürse yeniden seçilebilsin.
window.addEventListener('pageshow', (e) => { if (e.persisted) gidiyor = false; });
ciz();
