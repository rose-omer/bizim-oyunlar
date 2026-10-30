// Skor Tablosu: rekabetçi oyunlarda kim kaç kez kazandı (tür 'skor', js/core/skor.js).
import { bootPage } from '../../js/core/sayfa.js';
import { openProfil } from '../../js/core/profil.js';
import { gameById } from '../../js/core/games.js';
import { lobbyUrl } from '../../js/core/identity.js';
import { h, avatarEl, formatDay, knownPartner, toast } from '../../js/core/ui.js';
import { skorKoleksiyonu, skorHaritasi, skorTablosu, sonOynananlar, kisilerOf, liderMetni } from '../../js/core/skor.js';

const { room, roomId, me } = await bootPage({ ns: 'skor', title: 'Skor Tablosu', tab: 'daha' });
const app = document.getElementById('app');
const kok = h('div', { class: 'sk' }, h('p', { class: 'sk-yukleniyor muted', role: 'status' }, 'Skorlar geliyor…'));
app.replaceChildren(kok);

const [col, profil] = await Promise.all([
  skorKoleksiyonu(room),
  openProfil(room).catch((e) => { console.warn('[skor] profil açılamadı', e); return null; }),
]);

const sayiFmt = new Intl.NumberFormat('tr-TR');
const n = (x) => sayiFmt.format(x || 0);

function kisiler() {
  const p = profil?.partner() || null;
  const canli = room.partner?.() || null;
  const bilinen = knownPartner(roomId);
  const ids = kisilerOf(skorHaritasi(col.all()), me.clientId, p?.clientId || canli?.clientId || bilinen?.clientId || null);
  return {
    ids,
    ben: { ad: profil?.ben()?.ad || me.name || 'Sen', foto: profil?.ben()?.foto || null },
    o: { ad: p?.ad || canli?.name || bilinen?.name || 'Sevgilin', foto: p?.foto || null },
  };
}

// ---------- Parçalar ----------

function kahraman(t, k) {
  const [a, b] = t.genel.kisiler;
  const lider = liderMetni([a, b], [k.ben.ad, k.o.ad]);
  const kisi = (ad, foto, cls, sayi, yon) => h('div', { class: `sk-kisi ${yon}` },
    avatarEl(ad, cls, foto),
    h('span', { class: 'sk-ad' }, ad),
    h('span', { class: 'sk-n' }, n(sayi)));
  const alt = [`${n(t.genel.toplam)} maç`];
  if (t.genel.berabere) alt.push(`${n(t.genel.berabere)} berabere`);
  return h('section', { class: 'sk-hero', 'aria-label': 'Toplam skor' },
    h('div', { class: 'sk-duel' },
      kisi(k.ben.ad, k.ben.foto, 'me', a, 'sol'),
      h('span', { class: 'sk-ayrac', 'aria-hidden': 'true' }, '–'),
      kisi(k.o.ad, k.o.foto, 'partner', b, 'sag')),
    t.genel.toplam
      ? [h('p', { class: 'sk-lider' }, lider || 'Henüz kimse kazanmadı'), h('p', { class: 'sk-alt' }, alt.join(' · '))]
      : [
          h('p', { class: 'sk-lider' }, 'Henüz skor yok.'),
          h('p', { class: 'sk-alt' }, 'İlk galibiyet kimin olacak?'),
          h('a', { class: 'btn primary sk-oyna', href: `${lobbyUrl()}#oyunlar` }, 'Bir oyun seçin'),
        ]);
}

function oyunSatiri(o, k, i) {
  const g = gameById(o.oyun);
  const [a, b] = o.kisiler;
  const etiket = o.toplam
    ? `${k.ben.ad} ${a}, ${k.o.ad} ${b}${o.berabere ? `, ${o.berabere} berabere` : ''}`
    : 'Henüz oynanmadı';
  const alt = [];
  if (o.berabere) alt.push(`${n(o.berabere)} berabere`);
  if (o.son?.at) alt.push(`son: ${formatDay(o.son.at)}`);
  return h('li', { class: o.toplam ? 'sk-oyun' : 'sk-oyun bos' },
    h('span', { class: 'game-tile', dataset: { tint: String((i % 6) + 1) }, 'aria-hidden': 'true' }, g?.emoji || ''),
    h('div', { class: 'sk-oyun-govde' },
      h('span', { class: 'sk-oyun-ad' }, g?.title || o.oyun),
      h('span', { class: 'sk-bar', role: 'img', 'aria-label': etiket },
        o.toplam ? [
          a ? h('span', { class: 'sk-bar-ben', style: { flexGrow: String(a) } }) : null,
          o.berabere ? h('span', { class: 'sk-bar-bb', style: { flexGrow: String(o.berabere) } }) : null,
          b ? h('span', { class: 'sk-bar-o', style: { flexGrow: String(b) } }) : null,
        ] : null),
      h('span', { class: 'sk-oyun-alt' }, o.toplam ? alt.join(' · ') : 'Henüz oynamadınız')),
    h('span', { class: 'sk-oyun-skor', 'aria-hidden': 'true' },
      h('span', {}, String(a)), h('span', { class: 'sk-tire' }, '–'), h('span', {}, String(b))));
}

function sonlar(list, k) {
  return h('section', { class: 'sk-bolum', 'aria-labelledby': 'sk-h-son' },
    h('h2', { id: 'sk-h-son' }, 'Son oynananlar'),
    h('ul', { class: 'card sk-son', role: 'list' }, list.map((x) => {
      const g = gameById(x.oyun);
      const kim = x.kazanan === null ? 'Berabere'
        : x.kazanan === me.clientId ? 'Sen kazandın'
          : `${x.kazanan === k.ids[1] ? k.o.ad : 'Sevgilin'} kazandı`;
      return h('li', { class: 'sk-son-satir' },
        h('span', { class: 'sk-son-ad' }, g?.title || x.oyun),
        h('span', { class: 'sk-son-kim', dataset: { kim: x.kazanan === null ? 'bb' : x.kazanan === me.clientId ? 'ben' : 'o' } }, kim),
        h('time', { class: 'sk-son-ne', datetime: x.at }, formatDay(x.at)));
    })));
}

// ---------- Çizim ----------

function ciz() {
  const harita = skorHaritasi(col.all());
  const k = kisiler();
  const t = skorTablosu(harita, k.ids);
  const son = sonOynananlar(harita, 6);
  kok.replaceChildren(
    kahraman(t, k),
    h('section', { class: 'sk-bolum', 'aria-labelledby': 'sk-h-oyun' },
      h('div', { class: 'sk-bas' },
        h('h2', { id: 'sk-h-oyun' }, 'Oyun oyun'),
        h('p', { class: 'sk-anahtar', 'aria-hidden': 'true' },
          h('span', { class: 'sk-nokta ben' }), k.ben.ad,
          h('span', { class: 'sk-nokta o' }), k.o.ad,
          h('span', { class: 'sk-nokta bb' }), 'berabere')),
      h('ul', { class: 'card sk-liste', role: 'list' }, t.oyunlar.map((o, i) => oyunSatiri(o, k, i)))),
    son.length ? sonlar(son, k) : null,
  );
}

ciz();
col.on('change', ciz);
profil?.on('change', ciz);
let sonHata = 0;
col.on('error', (e) => {
  if (Date.now() - sonHata < 15000) return;
  sonHata = Date.now();
  toast(e.message);
});
col.refresh();
