// İzin Belgesi: "Hanımdan" ya da "Beyden" izin kâğıdı. Şaka bir resmî belge.
// Akış: biri doldurur → öbürü damgalar → izinli olan eve varınca yazar; geç kaldıysa sebep zorunlu.
// Saf mantık mantik.js'te (tests/izin-mantik). Kullanıcı metni yalnız textContent ile basılır (h()).
import { bootPage } from '../../js/core/sayfa.js';
import { openCollection } from '../../js/core/veri.js';
import { openProfil } from '../../js/core/profil.js';
import { bildir } from '../../js/core/bildirim.js';
import { partnerGoruyor } from '../../js/core/room.js';
import { toDay } from '../../js/core/gunler.js';
import { h, icon, toast, confirmDialog, knownPartner, geriyleKapat } from '../../js/core/ui.js';
import { sfx } from '../../js/core/sound.js';
import { ek } from '../mektup/mantik.js';
import * as K from './mantik.js';

const { room, roomId, me } = await bootPage({ ns: 'izin', title: 'İzin Belgesi', tab: 'daha' });
const myId = me.clientId;
const app = document.getElementById('app');
app.replaceChildren(h('div', { class: 'iz' }, h('p', { class: 'iz-not', role: 'status' }, 'Belgeler açılıyor…')));

const [col, profil] = await Promise.all([
  openCollection(room, 'izin'),
  openProfil(room).catch((e) => { console.warn('[izin] profil açılamadı', e); return null; }),
]);

const azHareket = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const partnerAdi = () => profil?.partner()?.ad || room.partner?.()?.name || knownPartner(roomId)?.name || 'Sevgilin';
const benAdi = () => profil?.ben()?.ad || me.name || '';
const partnerId = () => profil?.partner()?.clientId || room.partner?.()?.clientId || knownPartner(roomId)?.clientId || null;

function haberVer(olay, data) {
  if (partnerGoruyor(room.partner?.(), 'izin')) return; // Sayfada ve sekmesi önde: zaten görüyor
  bildir(roomId, { tur: 'mektup', ...K.bildirimMetni(olay, benAdi(), data), url: 'sayfalar/izin/', gizli: { metin: 'İzin belgesinde yenilik var' } })
    .catch((err) => console.warn('[izin] bildirim gönderilemedi', err));
}

// ---------- Kâğıt ----------
const SUS_YAPRAK = [
  'M72 20C80 12 92 12 98 18 92 26 80 28 72 20Z',
  'M46 13C46 5 54 0 62 2 62 10 54 16 46 13Z',
  'M24 20C18 12 20 4 26 2 32 8 32 16 24 20Z',
  'M58 16C66 22 68 32 62 38 54 34 52 24 58 16Z',
].map((d) => `<path d="${d}" fill="currentColor" stroke="none"/>`).join('');
const SUS_KOSE = `<path d="M72 20C52 8 24 12 14 34 6 52 18 70 36 68 50 66 54 50 44 43 36 38 26 44 30 53"/><path d="M30 16C26 10 14 8 8 14 4 19 9 25 14 22"/>${SUS_YAPRAK}`;
const SUS_ORTA = `<path d="M160 34C152 24 152 12 160 4 168 12 168 24 160 34Z" fill="currentColor" stroke="none"/><path d="M156 34C146 34 134 28 130 18 142 16 152 22 156 34Z" fill="currentColor" stroke="none"/><path d="M164 34C174 34 186 28 190 18 178 16 168 22 164 34Z" fill="currentColor" stroke="none"/><path d="M132 40C142 44 152 41 160 41 168 41 178 44 188 40"/>`;
const SUS = `<svg viewBox="0 0 320 74" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true" focusable="false">${SUS_KOSE}<g transform="translate(320 0) scale(-1 1)">${SUS_KOSE}</g>${SUS_ORTA}</svg>`;

const OK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m9.5 5.5 6.5 6.5-6.5 6.5"/></svg>';

const baslikEl = (tur) => {
  const [ust, alt] = K.belgeBasligi(tur);
  return h('h3', { class: 'iz-baslik' }, h('span', {}, ust), ' ', h('span', {}, alt));
};
const susEl = () => h('div', { class: 'iz-sus', html: SUS });

function satirEl(etiket, deger) {
  return h('div', { class: 'iz-satir' }, h('dt', { class: 'iz-etiket' }, etiket), h('dd', { class: 'iz-deger' }, deger || ''));
}

function damgaEl(d, i, vur) {
  return h('p', { class: `iz-damga${vur ? ' vur' : ''}`, dataset: { renk: d.renk, sira: String(i) } },
    h('strong', {}, d.metin), h('span', {}, d.alt));
}

/** Dolu kâğıt (salt okunur). */
function kagitEl(d, { vur = false } = {}) {
  const sebep = d.durum === 'dondu' ? (d.gec > 0 ? d.sebep : 'Geç kalmadı.') : '';
  const liste = K.damgalar(d);
  return h('article', { class: 'iz-kagit', 'aria-label': `${K.belgeBasligi(d.tur).join(' ')}, ${K.tarihYazi(d.tarih)}` },
    susEl(),
    baslikEl(d.tur),
    h('p', { class: 'iz-tarih' }, h('span', { class: 'iz-etiket-yazi' }, 'Tarih :'), ' ', h('span', { class: 'iz-kalem' }, K.tarihYazi(d.tarih))),
    h('dl', { class: 'iz-kutu' },
      satirEl('Adı', d.ad),
      satirEl('Soyadı', d.soyad),
      satirEl('Buluşacağı Kişi', d.kisi),
      satirEl('Buluşma Yeri', d.yer),
      satirEl('Buluşma Nedeni', d.neden),
      satirEl('Ev\'den Çıkış Saati', d.cikis),
      satirEl('Eve Varış Saati', K.varisYazi(d)),
      satirEl('Geç Kaldıysa Sebepleri', sebep)),
    // Yalnız son damga vurulur: öncekiler zaten kâğıtta duruyordu.
    liste.length ? h('div', { class: 'iz-damgalar' }, liste.map((x, i) => damgaEl(x, i, vur && i === liste.length - 1))) : null);
}

/** Belgeye ait açıklama ve düğmeler. */
function eylemEl(doc) {
  const d = doc.data;
  if (K.damgalayabilir(doc, myId)) {
    return h('div', { class: 'iz-eylem' },
      h('button', { type: 'button', class: 'btn ghost', dataset: { odak: `red:${doc.id}` }, onclick: () => karar(doc, false) }, 'Reddet'),
      h('button', { type: 'button', class: 'btn primary', dataset: { odak: `izin:${doc.id}` }, onclick: () => karar(doc, true) }, 'İzin ver'));
  }
  if (K.donebilir(doc, myId)) {
    return h('div', { class: 'iz-eylem' },
      h('button', { type: 'button', class: 'btn primary', dataset: { odak: `don:${doc.id}` }, onclick: () => eveVardim(doc) }, 'Eve vardım'));
  }
  if (d.durum === 'bekliyor') return h('p', { class: 'iz-not' }, `${K.makamAdi(d.tur)} makamının damgası bekleniyor.`);
  if (d.durum === 'izinli') return h('p', { class: 'iz-not' }, `${partnerAdi()} dışarıda. Eve varınca haberin olur.`);
  return null;
}

function silEl(doc) {
  if (!K.silinebilir(doc, myId)) return null;
  return h('button', { type: 'button', class: 'btn ghost small iz-sil', dataset: { odak: `sil:${doc.id}` }, onclick: () => sil(doc) }, 'Belgeyi sil');
}

// ---------- Çizim ----------
const durum = { acik: new Set() };
const gorulen = new Map(); // id -> son görülen durum: damga, ikinizin ekranına da düşer
let vurulacak = new Set();

function belgeEl(doc) {
  return h('li', { class: 'iz-belge', dataset: { id: doc.id } },
    kagitEl(doc.data, { vur: vurulacak.has(doc.id) }), eylemEl(doc), doc.data.durum === 'bekliyor' ? silEl(doc) : null);
}

function arsivEl(doc) {
  const d = doc.data;
  const son = K.damgalar(d).at(-1);
  const kutu = h('details', { class: 'iz-arsiv', open: durum.acik.has(doc.id) },
    h('summary', { class: 'iz-arsiv-ust' },
      h('span', { class: 'iz-arsiv-yazi' },
        h('strong', {}, d.tur === 'bey' ? 'Beyden' : 'Hanımdan'),
        h('span', {}, `${K.tarihYazi(d.tarih)} · ${d.kisi}, ${d.yer}`)),
      son ? h('span', { class: 'iz-arsiv-damga', dataset: { renk: son.renk } }, son.metin) : null,
      h('span', { class: 'iz-arsiv-ok', html: OK_SVG })),
    h('div', { class: 'iz-arsiv-ic' }, kagitEl(d, { vur: vurulacak.has(doc.id) }), silEl(doc)));
  kutu.addEventListener('toggle', () => {
    if (kutu.open) durum.acik.add(doc.id); else durum.acik.delete(doc.id);
  });
  return h('li', { dataset: { id: doc.id } }, kutu);
}

function bolumEl(b) {
  const hid = `iz-b-${b.id}`;
  return h('section', { class: 'iz-bolum', 'aria-labelledby': hid },
    h('h2', { class: 'iz-bolum-baslik', id: hid }, b.baslik),
    h('ul', { class: 'iz-liste' }, b.docs.map(b.id === 'arsiv' ? arsivEl : belgeEl)));
}

function yeniEl(tur) {
  const [ust, alt] = K.belgeBasligi(tur);
  return h('button', { type: 'button', class: 'iz-yeni-btn', dataset: { tur }, onclick: () => doldurAc(tur) },
    h('span', { class: 'iz-yeni-ust' }, ust),
    h('span', { class: 'iz-yeni-alt' }, alt),
    h('span', { class: 'iz-yeni-eylem' }, 'Doldur'));
}

const yeniHanim = yeniEl('hanim');
const yeniBey = yeniEl('bey');
const partnerYok = h('p', { class: 'iz-not', hidden: true }, 'Sevgilin uygulamayı bir kez açınca ona belge gönderebilirsin.');
const govde = h('div', { class: 'iz-govde' });
app.replaceChildren(h('div', { class: 'iz' },
  h('div', { class: 'iz-yeni', role: 'group', 'aria-label': 'Yeni belge doldur' }, yeniHanim, yeniBey),
  partnerYok,
  govde));

let sonImza = '';
function ciz() {
  const docs = col.all();
  const imza = JSON.stringify([partnerId(), partnerAdi(), docs.map((d) => [d.id, d.data])]);
  if (imza === sonImza) return;
  sonImza = imza;
  vurulacak = new Set();
  for (const d of docs) {
    const once = gorulen.get(d.id);
    if (once && once !== d.data.durum && !azHareket()) vurulacak.add(d.id);
    gorulen.set(d.id, d.data.durum);
  }
  const pId = partnerId();
  partnerYok.hidden = !!pId;
  yeniHanim.disabled = !pId;
  yeniBey.disabled = !pId;
  const bol = K.bolumler(docs, myId);
  const odak = document.activeElement?.dataset?.odak || null;
  govde.replaceChildren(...(bol.length ? bol.map(bolumEl)
    : [h('p', { class: 'iz-bos' }, 'Henüz belge yok. Dışarı çıkmadan önce bir tane doldur; sonra “haberim yoktu” denmesin.')]));
  if (odak) govde.querySelector(`[data-odak="${CSS.escape(odak)}"]`)?.focus({ preventScroll: true });
}

// ---------- Eylemler ----------
async function karar(doc, izin) {
  const guncel = col.get(doc.id);
  if (!K.damgalayabilir(guncel, myId)) {
    toast('Bu belge artık damga beklemiyor.');
    return;
  }
  try {
    await col.patch(doc.id, K.kararYamasi(izin));
  } catch (err) {
    toast(err?.message || 'Kaydedilemedi. Biraz sonra yeniden dene.');
    return;
  }
  sfx(izin ? 'match' : 'tap');
  toast(izin ? 'Damga vuruldu. İzin çıktı.' : 'Damga vuruldu. İzin yok.', {
    action: { label: 'Geri al', onClick: () => col.patch(doc.id, K.kararGeriAlYamasi()).catch((e) => toast(e.message)) },
  });
  haberVer(izin ? 'izinli' : 'reddedildi', doc.data);
}

async function donusKaydet(doc, gec, sebep) {
  await col.patch(doc.id, K.donusYamasi(gec, sebep));
  sfx(gec ? 'tap' : 'match');
  toast(gec ? 'Sebep makama iletildi.' : 'Tam vaktinde. Aferin.');
  haberVer('dondu', { gec });
}

async function eveVardim(doc) {
  const guncel = col.get(doc.id);
  if (!K.donebilir(guncel, myId)) {
    toast('Bu belge artık dönüş beklemiyor.');
    return;
  }
  const gec = K.gecDakika(guncel.data);
  if (gec) {
    sebepAc(guncel, gec);
    return;
  }
  const ok = await confirmDialog(`Eve vardın mı? Varış saatin ${K.saatYazi(new Date())} olarak yazılacak.`, { ok: 'Eve vardım', cancel: 'Henüz değil' });
  if (!ok) return;
  try {
    await donusKaydet(guncel, 0, '');
  } catch (err) {
    toast(err?.message || 'Kaydedilemedi. Biraz sonra yeniden dene.');
  }
}

async function sil(doc) {
  const d = { ...doc.data };
  const ok = await confirmDialog('Bu belge ikiniz için de silinsin mi?', { ok: 'Sil', cancel: 'Vazgeç' });
  if (!ok) return;
  try {
    await col.remove(doc.id);
  } catch (err) {
    toast(err?.message || 'Silinemedi.');
    return;
  }
  sfx('tap');
  toast('Belge silindi', { action: { label: 'Geri al', onClick: () => col.put(d, doc.id).catch((e) => toast(e.message)) } });
}

// ---------- Pencereler ----------
function pencereAc(baslik, icerik) {
  const onceOdak = document.activeElement;
  const dlg = h('dialog', { class: 'iz-dlg', 'aria-label': baslik },
    h('header', { class: 'iz-dlg-ust' },
      h('p', { class: 'iz-dlg-baslik' }, baslik),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Kapat', onclick: () => dlg.close() }, icon('close'))),
    icerik);
  const birak = geriyleKapat(() => dlg.close());
  dlg.addEventListener('close', () => {
    birak();
    dlg.remove();
    if (onceOdak?.isConnected) onceOdak.focus({ preventScroll: true });
  });
  document.body.append(dlg);
  dlg.showModal();
  return dlg;
}

/** Hata kutusu ve iki düğmeli alt çubuk (ikisi de aynı kalıp). */
function formAlti(gonderYazi, kapat) {
  const hata = h('p', { class: 'iz-hata', role: 'alert', hidden: true });
  const gonder = h('button', { type: 'submit', class: 'btn primary' }, gonderYazi);
  const cubuk = h('div', { class: 'iz-dlg-alt' },
    h('button', { type: 'button', class: 'btn ghost', onclick: kapat }, 'Vazgeç'), gonder);
  return { hata, gonder, cubuk };
}

function doldurAc(tur) {
  const onayci = partnerId();
  if (!onayci) return;
  const kimlik = K.kimlikOneri(col.all(), myId);
  const girdi = (ad, ozellik = {}) => h('input', {
    id: `iz-${ad}`, class: 'iz-girdi', name: ad, type: 'text', autocomplete: 'off', 'aria-describedby': 'iz-hata', ...ozellik,
  });
  const alan = {
    tarih: girdi('tarih', { type: 'date', class: 'iz-girdi iz-tarih-girdi', 'aria-label': 'Tarih' }),
    ad: girdi('ad', { maxlength: String(K.AD_MAX), enterkeyhint: 'next' }),
    soyad: girdi('soyad', { maxlength: String(K.AD_MAX), enterkeyhint: 'next' }),
    kisi: girdi('kisi', { maxlength: String(K.METIN_MAX), enterkeyhint: 'next' }),
    yer: girdi('yer', { maxlength: String(K.METIN_MAX), enterkeyhint: 'next' }),
    neden: girdi('neden', { maxlength: String(K.METIN_MAX), enterkeyhint: 'next' }),
    cikis: girdi('cikis', { type: 'time' }),
    varis: girdi('varis', { type: 'time' }),
  };
  alan.tarih.value = toDay();
  alan.ad.value = kimlik.ad || benAdi();
  alan.soyad.value = kimlik.soyad;
  const satir = (etiket, ad) => h('div', { class: 'iz-satir' },
    h('label', { class: 'iz-etiket', for: `iz-${ad}` }, etiket), h('div', { class: 'iz-deger' }, alan[ad]));

  let dlg = null;
  const { hata, gonder, cubuk } = formAlti('Damgaya gönder', () => dlg.close());
  hata.id = 'iz-hata';
  const form = h('form', { class: 'iz-form', novalidate: true },
    h('div', { class: 'iz-kagit' },
      susEl(),
      baslikEl(tur),
      h('p', { class: 'iz-tarih' }, h('span', { class: 'iz-etiket-yazi' }, 'Tarih :'), ' ', alan.tarih),
      h('div', { class: 'iz-kutu' },
        satir('Adı', 'ad'),
        satir('Soyadı', 'soyad'),
        satir('Buluşacağı Kişi', 'kisi'),
        satir('Buluşma Yeri', 'yer'),
        satir('Buluşma Nedeni', 'neden'),
        satir('Ev\'den Çıkış Saati', 'cikis'),
        satir('Eve Varış Saati', 'varis'),
        h('div', { class: 'iz-satir' },
          h('span', { class: 'iz-etiket' }, 'Geç Kaldıysa Sebepleri'),
          h('span', { class: 'iz-deger iz-sonra' }, 'Dönüşte doldurulur.')))),
    hata,
    cubuk);

  form.addEventListener('input', () => {
    hata.hidden = true;
    for (const g of Object.values(alan)) g.removeAttribute('aria-invalid');
  });
  let gonderiliyor = false;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (gonderiliyor) return;
    const f = { tur, ...Object.fromEntries(Object.entries(alan).map(([k, g]) => [k, g.value])) };
    const sorun = K.belgeDogrula(f);
    if (sorun) {
      hata.textContent = sorun.mesaj;
      hata.hidden = false;
      alan[sorun.alan]?.setAttribute('aria-invalid', 'true');
      alan[sorun.alan]?.focus();
      return;
    }
    const data = K.belgeVerisi(f, { isteyen: myId, onaylayan: onayci });
    gonderiliyor = true;
    gonder.disabled = true;
    try {
      await col.put(data);
    } catch (err) {
      hata.textContent = err?.message || 'Kaydedilemedi. Biraz sonra yeniden dene.';
      hata.hidden = false;
      gonderiliyor = false;
      gonder.disabled = false;
      return;
    }
    sfx('pop');
    dlg.close();
    toast(`Belge ${ek(partnerAdi(), 'e')} gitti. Damga bekleniyor.`);
    haberVer('gonderildi', data);
  });

  dlg = pencereAc('Belgeyi doldur', form);
  alan[alan.ad.value ? 'kisi' : 'ad'].focus({ preventScroll: true });
}

function sebepAc(doc, gec) {
  let dlg = null;
  const sebep = h('textarea', {
    id: 'iz-sebep', class: 'input iz-sebep', rows: '4', maxlength: String(K.SEBEP_MAX),
    placeholder: 'Trafik bahanesi kabul edilmez.', 'aria-describedby': 'iz-sebep-hata',
  });
  const { hata, gonder, cubuk } = formAlti('Makama ilet', () => dlg.close());
  hata.id = 'iz-sebep-hata';
  const form = h('form', { class: 'iz-form', novalidate: true },
    h('p', { class: 'iz-gec' }, `${K.gecMetni(gec)} geç kaldın.`),
    h('label', { class: 'iz-sebep-etiket', for: 'iz-sebep' }, 'Geç Kaldıysa Sebepleri'),
    sebep,
    hata,
    cubuk);
  sebep.addEventListener('input', () => { hata.hidden = true; });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const sorun = K.donusDogrula(gec, sebep.value);
    if (sorun) {
      hata.textContent = sorun;
      hata.hidden = false;
      sebep.focus();
      return;
    }
    gonder.disabled = true;
    try {
      await donusKaydet(doc, gec, sebep.value);
    } catch (err) {
      hata.textContent = err?.message || 'Kaydedilemedi. Biraz sonra yeniden dene.';
      hata.hidden = false;
      gonder.disabled = false;
      return;
    }
    dlg.close();
  });
  dlg = pencereAc('Eve varış', form);
  sebep.focus({ preventScroll: true });
}

// ---------- Canlı ----------
let sonHata = 0;
col.on('error', (err) => {
  if (Date.now() - sonHata < 15000) return;
  sonHata = Date.now();
  toast(err?.message || 'Bağlantı sorunu. Kayıt bekletilip gönderilecek.');
});
col.on('change', ciz);
profil?.on('change', ciz);
room.on('presence', () => ciz());

ciz();
