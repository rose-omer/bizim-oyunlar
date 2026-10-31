// Onun Hakkında: ölçüler, sevdikleri, alerjiler. Varsayılan görünüm sevgilinin kartı; "Benim kartım" düzenleme.
// Her kişi yalnız kendi 'bilgi' belgesini (id = clientId) alan alan yazar (veri.js patch). Saf mantık mantik.js'te.
// Boş alanda "Sor": kendi belgeme sorular.<alan> yazılır + bildirim; karşı taraf kendi kartında "merak ediyor" görür.
import { bootPage } from '../../js/core/sayfa.js';
import { openCollection } from '../../js/core/veri.js';
import { openProfil } from '../../js/core/profil.js';
import { bildir } from '../../js/core/bildirim.js';
import { partnerGoruyor } from '../../js/core/room.js';
import { h, toast, formatDay, knownPartner, avatarEl } from '../../js/core/ui.js';
import { sfx } from '../../js/core/sound.js';
import { ikon } from '../listeler/ikonlar.js';
import { ek } from '../mektup/mantik.js';
import * as O from './mantik.js';

const { room, roomId, me } = await bootPage({ ns: 'onun', title: 'Onun Hakkında', tab: 'daha' });
const myId = me.clientId;
const app = document.getElementById('app');
app.replaceChildren(h('div', { class: 'on' }, h('p', { class: 'on-yukleniyor muted', role: 'status' }, 'Kartlar açılıyor…')));

const [col, profil] = await Promise.all([
  openCollection(room, 'bilgi'),
  openProfil(room).catch((e) => { console.warn('[onun] profil açılamadı', e); return null; }),
]);

const KAYIT_MS = 700;
const partnerId = () => profil?.partner()?.clientId || room.partner?.()?.clientId || knownPartner(roomId)?.clientId || null;
const partnerAdi = () => profil?.partner()?.ad || room.partner?.()?.name || knownPartner(roomId)?.name || 'Sevgilin';
const benAdi = () => profil?.ben()?.ad || me.name || '';
const benimVeri = () => col.get(myId)?.data || {};
const onunBelge = () => { const id = partnerId(); return id ? col.get(id) : null; };
const onunVeri = () => onunBelge()?.data || {};

let kart = new URLSearchParams(location.search).get('kart') === 'ben' ? 'ben' : 'onun';

function haberVer(metin, url) {
  if (partnerGoruyor(room.partner?.(), 'onun')) return; // bu sayfada ve sekmesi önde: zaten görüyor
  bildir(roomId, { tur: 'liste', baslik: 'Onun Hakkında 💝', metin, url })
    .catch((err) => console.warn('[onun] bildirim gönderilemedi', err));
}

// ---------- İskelet ----------
const segOnun = h('button', { type: 'button', onclick: () => kartSec('onun') });
const segBen = h('button', { type: 'button', onclick: () => kartSec('ben') });
const seg = h('div', { class: 'seg on-seg', role: 'group', 'aria-label': 'Hangi kart' }, segOnun, segBen);
const govde = h('div', { class: 'on-govde' });
app.replaceChildren(h('div', { class: 'on' }, seg, govde));

function kartSec(k) {
  if (kart === k) return;
  kart = k;
  const u = new URL(location.href);
  if (k === 'ben') u.searchParams.set('kart', 'ben'); else u.searchParams.delete('kart');
  history.replaceState(history.state, '', u.pathname + u.search);
  ciz();
}

function segCiz() {
  const merak = O.ALANLAR.filter((a) => O.merakEdiyorMu(onunVeri(), benimVeri(), a.id)).length;
  segOnun.setAttribute('aria-pressed', String(kart === 'onun'));
  segBen.setAttribute('aria-pressed', String(kart === 'ben'));
  segOnun.replaceChildren(h('span', {}, `${partnerAdi()} hakkında`));
  segBen.replaceChildren(h('span', {}, 'Benim kartım'));
  if (merak) segBen.append(h('span', { class: 'on-rozet', 'aria-label': `${merak} soru bekliyor` }, String(merak)));
}

// ---------- Sevgilinin kartı ----------
let sonImza = '';
function onunKartiCiz({ zorla = false } = {}) {
  const pId = partnerId();
  const doc = onunBelge();
  const veri = doc?.data || {};
  const ben = benimVeri();
  const imza = JSON.stringify([pId, partnerAdi(), profil?.partner()?.foto || '', doc?.updated_at, veri, ben.sorular || {}, Math.floor(Date.now() / 60000)]);
  if (!zorla && imza === sonImza) return;
  sonImza = imza;
  const ad = partnerAdi();

  if (!pId) {
    govde.replaceChildren(h('div', { class: 'on-bos' },
      h('p', { class: 'on-bos-emoji', 'aria-hidden': 'true' }, '💝'),
      h('h2', { class: 'on-bos-baslik' }, 'Sevgilin henüz burada değil'),
      h('p', { class: 'on-bos-metin' }, 'Uygulamayı bir kez açınca kartı burada görünecek. Bu arada kendi kartını doldurabilirsin.'),
      h('button', { type: 'button', class: 'btn primary', onclick: () => kartSec('ben') }, 'Kendi kartımı doldur')));
    return;
  }

  const dolu = O.doluSayisi(veri);
  const ozet = dolu
    ? `${O.ALANLAR.length} alandan ${dolu} tanesi dolu${doc?.updated_at ? ` · ${formatDay(doc.updated_at)} güncelledi` : ''}`
    : 'Henüz bir şey yazmadı. Merak ettiklerini sorabilirsin.';
  const odak = document.activeElement?.dataset?.odak || null;
  govde.replaceChildren(
    h('header', { class: 'on-kart-bas' },
      avatarEl(ad, 'partner', profil?.partner()?.foto),
      h('div', { class: 'on-kart-yazi' },
        h('h2', { class: 'on-kart-baslik' }, `${ad} hakkında`),
        h('p', { class: 'on-kart-ozet' }, ozet))),
    ...O.GRUPLAR.map((g) => grupEl(g, veri, ben, ad)));
  if (odak) govde.querySelector(`[data-odak="${CSS.escape(odak)}"]`)?.focus({ preventScroll: true });
}

function grupEl(g, veri, ben, ad) {
  const alanlar = O.ALANLAR.filter((a) => a.grup === g.id);
  const hid = `on-g-${g.id}`;
  return h('section', { class: 'on-grup', dataset: { grup: g.id }, 'aria-labelledby': hid },
    h('h3', { class: 'on-grup-baslik', id: hid }, g.ad),
    h('ul', { class: `on-satirlar${g.id === 'olcu' ? ' izgara' : ''}` }, alanlar.map((a) => satirEl(a, veri, ben, ad))));
}

function satirEl(a, veri, ben, ad) {
  const v = O.deger(veri, a.id);
  const ds = { alan: a.id };
  if (v) ds.dolu = '1';
  let sag = null;
  if (!v && a.sorulur) {
    const sorulan = ben.sorular?.[a.id];
    sag = O.sorabilirMi(sorulan)
      ? h('button', {
        type: 'button', class: 'btn small on-sor', dataset: { odak: `sor:${a.id}` },
        'aria-label': `${ek(ad, 'e')} ${a.yazdi} sor`, onclick: (e) => sor(a, e.currentTarget),
      }, 'Sor')
      : h('span', { class: 'on-soruldu', dataset: { odak: `sor:${a.id}` }, tabindex: '-1' }, ikon('check'), 'Sordun');
  }
  return h('li', { class: 'on-satir', dataset: ds },
    h('span', { class: 'on-emoji', 'aria-hidden': 'true' }, a.emoji),
    h('div', { class: 'on-satir-yazi' },
      h('span', { class: 'on-etiket' }, a.ad),
      v ? h('span', { class: 'on-deger' }, v) : h('span', { class: 'on-bos-deger' }, 'Henüz yazmadı')),
    a.id === 'alerji' && v ? h('span', { class: 'on-onemli' }, 'Önemli') : null,
    sag);
}

async function sor(a, btn) {
  btn.disabled = true;
  try {
    await col.patch(myId, O.soruYamasi(a.id));
  } catch (err) {
    btn.disabled = false;
    toast(err?.message || 'Gönderilemedi. Biraz sonra yeniden dene.');
    return;
  }
  sfx('tap');
  toast(`Sordun. ${partnerAdi()} yazınca burada görünecek.`);
  haberVer(O.soruMetni(benAdi(), a.id), 'sayfalar/onun/?kart=ben');
}

// ---------- Benim kartım (düzenleme) ----------
// Girdiler bir kez kurulur; canlı değişimde yalnız odakta olmayan ve kaydı beklemeyen girdi tazelenir.
let duzen = null;

function benimKartimKur() {
  const girdiler = new Map(); // alan id -> { girdi, merak, zaman }
  const durumEl = h('p', { class: 'on-kayit', role: 'status', 'aria-live': 'polite' });
  let durumZaman = 0;
  const durumYaz = (metin) => {
    clearTimeout(durumZaman);
    durumEl.textContent = metin;
    if (metin === 'Kaydedildi') durumZaman = setTimeout(() => { durumEl.textContent = ''; }, 2200);
  };

  async function kaydet(id) {
    const g = girdiler.get(id);
    clearTimeout(g.zaman);
    g.zaman = 0;
    const once = benimVeri();
    const yeni = O.temizle(id, g.girdi.value);
    if ((O.deger(once, id) || null) === yeni) return;
    const sorulmustu = O.merakEdiyorMu(onunVeri(), once, id);
    durumYaz('Kaydediliyor…');
    try {
      await col.patch(myId, O.alanYamasi(id, g.girdi.value));
    } catch (err) {
      durumYaz('');
      toast(err?.message || 'Kaydedilemedi. Biraz sonra yeniden dene.');
      return;
    }
    durumYaz('Kaydedildi');
    if (yeni && sorulmustu) haberVer(O.cevapMetni(benAdi(), id), 'sayfalar/onun/');
  }

  const grupEl2 = (g) => {
    const alanlar = O.ALANLAR.filter((a) => a.grup === g.id);
    return h('fieldset', { class: `on-duzen-grup${g.id === 'olcu' ? ' izgara' : ''}` },
      h('legend', { class: 'on-grup-baslik' }, g.ad),
      alanlar.map((a) => {
        const gid = `on-f-${a.id}`;
        const girdi = a.uzun
          ? h('textarea', { id: gid, class: 'input on-girdi', rows: '2', maxlength: String(O.UZUN_MAX), placeholder: a.ipucu })
          : h('input', { id: gid, class: 'input on-girdi', type: 'text', maxlength: String(O.KISA_MAX), placeholder: a.ipucu, autocomplete: 'off', enterkeyhint: 'next' });
        girdi.value = O.deger(benimVeri(), a.id);
        const merak = h('span', { class: 'on-merak', hidden: true });
        const kayit = { girdi, merak, zaman: 0 };
        girdiler.set(a.id, kayit);
        girdi.addEventListener('input', () => {
          clearTimeout(kayit.zaman);
          kayit.zaman = setTimeout(() => kaydet(a.id), KAYIT_MS);
        });
        girdi.addEventListener('blur', () => { if (kayit.zaman) kaydet(a.id); });
        return h('div', { class: 'on-alan', dataset: { alan: a.id } },
          h('label', { for: gid, class: 'on-alan-etiket' },
            h('span', { class: 'on-emoji', 'aria-hidden': 'true' }, a.emoji), h('span', {}, a.ad), merak),
          girdi);
      }));
  };

  govde.replaceChildren(
    h('div', { class: 'on-duzen-bas' },
      h('p', { class: 'on-bilgi' }, `${partnerAdi()} bu kartı görür. Yazdıkça kendiliğinden kaydedilir.`),
      durumEl),
    h('form', { class: 'on-duzen', novalidate: true, onsubmit: (e) => e.preventDefault() }, O.GRUPLAR.map(grupEl2)));

  function guncelle() {
    const ben = benimVeri();
    const onun = onunVeri();
    const pAd = partnerAdi();
    govde.querySelector('.on-bilgi').textContent = `${pAd} bu kartı görür. Yazdıkça kendiliğinden kaydedilir.`;
    for (const [id, g] of girdiler) {
      if (document.activeElement !== g.girdi && !g.zaman) {
        const v = O.deger(ben, id);
        if (g.girdi.value.trim() !== v) g.girdi.value = v;
      }
      const m = O.merakEdiyorMu(onun, ben, id);
      g.merak.hidden = !m;
      g.merak.textContent = m ? `${pAd} merak ediyor` : '';
      g.girdi.closest('.on-alan').dataset.merak = m ? '1' : '';
    }
  }
  function kapat() {
    for (const [id, g] of girdiler) if (g.zaman) kaydet(id); // bekleyen yazmayı bırakma
    clearTimeout(durumZaman);
  }
  guncelle();
  return { guncelle, kapat };
}

// ---------- Çizim ----------
function ciz() {
  segCiz();
  if (kart === 'ben') {
    if (!duzen) {
      duzen = benimKartimKur();
      sonImza = '';
    } else duzen.guncelle();
  } else {
    if (duzen) { duzen.kapat(); duzen = null; }
    onunKartiCiz();
  }
}

let sonHata = 0;
col.on('error', (err) => {
  if (Date.now() - sonHata < 15000) return;
  sonHata = Date.now();
  toast(err?.message || 'Bağlantı sorunu. Kayıt bekletilip gönderilecek.');
});
col.on('change', ciz);
profil?.on('change', ciz);
room.on('presence', () => ciz());
// Sayfadan çıkarken bekleyen yazma gitsin.
addEventListener('pagehide', () => duzen?.kapat());

ciz();
