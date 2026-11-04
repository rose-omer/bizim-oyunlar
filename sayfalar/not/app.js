// Not Bırak: sevgiline yazı, çizim ya da fotoğraf notu. Sürpriz not, alan kişi dokununca açılır ve arşivde kalır.
// Saf mantık mantik.js'te (tests/not-mantik). Not metni yalnız textContent ile basılır (h()).
import { bootPage } from '../../js/core/sayfa.js';
import { openCollection } from '../../js/core/veri.js';
import { openProfil } from '../../js/core/profil.js';
import { bildir } from '../../js/core/bildirim.js';
import { partnerGoruyor } from '../../js/core/room.js';
import { uploadPhoto } from '../../js/core/storage.js';
import { dosyaSec, fotoKucult, fotoImg, hataMetni } from '../../js/core/foto.js';
import { h, icon, toast, confirmDialog, formatDay, knownPartner, geriyleKapat } from '../../js/core/ui.js';
import { sfx } from '../../js/core/sound.js';
import { ikon } from '../listeler/ikonlar.js';
import { ek } from '../mektup/mantik.js';
import { renkSirasi } from '../kupon/mantik.js';
import { cizimPedi } from './cizim.js';
import * as N from './mantik.js';

const { room, roomId, me } = await bootPage({ ns: 'not', title: 'Not Bırak', tab: 'daha' });
const myId = me.clientId;
const app = document.getElementById('app');
app.replaceChildren(h('div', { class: 'nt' }, h('p', { class: 'nt-yukleniyor muted', role: 'status' }, 'Notlar açılıyor…')));

const [col, profil] = await Promise.all([
  openCollection(room, N.TUR),
  openProfil(room).catch((e) => { console.warn('[not] profil açılamadı', e); return null; }),
]);

const azHareket = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
const partnerAdi = () => profil?.partner()?.ad || room.partner?.()?.name || knownPartner(roomId)?.name || 'Sevgilin';
const benAdi = () => profil?.ben()?.ad || me.name || '';
const partnerId = () => profil?.partner()?.clientId || room.partner?.()?.clientId || knownPartner(roomId)?.clientId || null;
const adOf = (id) => (id === myId ? benAdi() : profil?.kisiler?.get(id)?.data?.ad || partnerAdi());

const saatFmt = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' });
function zamanYazi(iso) {
  const gun = formatDay(iso);
  if (!gun) return '';
  return gun === 'bugün' || gun === 'dün' ? `${gun} ${saatFmt.format(new Date(iso))}` : gun;
}

const durum = { aciliyor: new Set(), yeni: null };

// ---------- İskelet ----------
const birakBtn = h('button', { type: 'button', class: 'btn primary wide nt-birak', onclick: () => yazAc() }, ikon('edit'), 'Not bırak');
const partnerYok = h('p', { class: 'nt-bilgi', hidden: true }, 'Sevgilin uygulamayı bir kez açınca ona not bırakabilirsin.');
const govde = h('div', { class: 'nt-govde' });
app.replaceChildren(h('div', { class: 'nt' }, birakBtn, partnerYok, govde));

// ---------- Not kartı ----------
function gorselEl(d, kapali) {
  if (d.tur === 'yazi' || !d.foto) return null;
  const img = fotoImg(d.foto, { alt: kapali ? '' : d.tur === 'cizim' ? 'Çizim' : 'Fotoğraf', className: 'nt-gorsel' });
  return h('div', { class: `nt-gorsel-kutu${d.tur === 'cizim' ? ' cizim' : ''}` }, img);
}

function notEl(doc) {
  const d = doc.data;
  const giden = N.yon(doc, myId) === 'giden';
  const kapali = N.kapaliMi(doc, myId);
  const kimAd = giden ? adOf(d.kime) : adOf(N.yazan(doc));
  const kim = giden ? ek(kimAd, 'e') : ek(kimAd, 'den');

  const icerik = h('div', { class: 'nt-icerik', dataset: { tur: d.tur } },
    gorselEl(d, kapali),
    d.metin ? h('p', { class: 'nt-metin' }, d.metin) : null);

  const sd = giden ? N.surprizDurumu(d) : null;
  const durumYazi = sd === 'kapali' ? 'Sürpriz · henüz açmadı' : sd === 'acildi' ? 'Sürprizi açtı 💛' : '';
  const sil = giden ? h('button', {
    type: 'button', class: 'icon-btn nt-sil', 'aria-label': 'Notu sil', onclick: () => silNot(doc),
  }, ikon('trash')) : null;
  const alt = h('footer', { class: 'nt-alt' },
    h('p', { class: 'nt-kim' },
      h('span', {}, `${kim} · ${zamanYazi(doc.created_at)}`),
      durumYazi ? h('span', { class: `nt-durum${sd === 'acildi' ? ' acildi' : ''}` }, durumYazi) : null),
    sil);

  const sahne = h('div', { class: 'nt-sahne' }, icerik);
  const kagit = h('article', {
    class: 'nt-kagit', tabindex: '-1',
    dataset: { renk: String(renkSirasi(doc.id)), tur: d.tur, ...(kapali ? { kapali: '1' } : {}) },
  }, h('span', { class: 'nt-bant', 'aria-hidden': 'true' }), sahne, alt);

  if (kapali) {
    icerik.inert = true;
    icerik.setAttribute('aria-hidden', 'true');
    sahne.append(h('button', {
      type: 'button', class: 'nt-kapak', 'aria-label': `${ek(kimAd, 'den')} sürpriz not. Açmak için dokun.`,
      onclick: () => ac(doc, kagit),
    },
    h('span', { class: 'nt-kurdele', 'aria-hidden': 'true' }),
    h('span', { class: 'nt-kapak-yazi', 'aria-hidden': 'true' },
      h('span', { class: 'nt-kapak-emoji' }, '🎁'),
      h('strong', {}, 'Sürpriz not'),
      h('span', {}, 'Açmak için dokun'))));
    if (durum.aciliyor.has(doc.id)) kagit.classList.add('aciliyor');
  }

  const li = h('li', { class: 'nt-not', dataset: { id: doc.id, yon: giden ? 'giden' : 'gelen' } }, kagit);
  if (durum.yeni === doc.id && !azHareket()) li.classList.add('yeni');
  return li;
}

function bosDurum() {
  const ornek = h('div', { class: 'nt-kagit nt-ornek', dataset: { renk: '6', tur: 'yazi' }, 'aria-hidden': 'true' },
    h('span', { class: 'nt-bant' }),
    h('div', { class: 'nt-icerik' }, h('p', { class: 'nt-metin' }, 'Kahven masada, öpücüğün yanında. İyi ki varsın 💛')));
  return h('div', { class: 'nt-bos' },
    ornek,
    h('h2', { class: 'nt-bos-baslik' }, 'Henüz not yok'),
    h('p', { class: 'nt-bos-metin' },
      `Buzdolabına not bırakır gibi: ${ek(partnerAdi(), 'e')} küçük bir yazı, çizim ya da fotoğraf bırak.`));
}

let sonImza = '';
function ciz() {
  const docs = N.siralanmis(col.all());
  const imza = JSON.stringify([partnerId(), partnerAdi(), benAdi(), formatDay(new Date()), docs.map((d) => [d.id, d.data])]);
  if (imza === sonImza) return;
  sonImza = imza;
  const pId = partnerId();
  partnerYok.hidden = !!pId;
  birakBtn.disabled = !pId;
  const odak = document.activeElement?.closest?.('.nt-not')?.dataset.id || null;
  govde.replaceChildren(docs.length
    ? h('ul', { class: 'nt-liste', 'aria-label': 'Notlarımız' }, docs.map(notEl))
    : bosDurum());
  if (odak) {
    const li = govde.querySelector(`.nt-not[data-id="${CSS.escape(odak)}"]`);
    (li?.querySelector('button') || li?.querySelector('.nt-kagit'))?.focus({ preventScroll: true });
  }
  durum.yeni = null;
}

// ---------- Eylemler ----------
async function ac(doc, kagit) {
  if (durum.aciliyor.has(doc.id)) return;
  durum.aciliyor.add(doc.id);
  kagit.classList.add('aciliyor');
  sfx('pop');
  if (!azHareket()) await bekle(620);
  try {
    await col.patch(doc.id, N.acYamasi());
  } catch (err) {
    kagit.classList.remove('aciliyor');
    toast(err?.message || 'Açılamadı. Biraz sonra yeniden dene.');
  } finally {
    durum.aciliyor.delete(doc.id);
  }
}

async function silNot(doc) {
  const d = { ...doc.data };
  const ok = await confirmDialog('Bu not ikiniz için de silinsin mi?', { ok: 'Sil', cancel: 'Vazgeç' });
  if (!ok) return;
  try {
    await col.remove(doc.id);
  } catch (err) {
    toast(err?.message || 'Silinemedi.');
    return;
  }
  sfx('tap');
  toast('Not silindi', { action: { label: 'Geri al', onClick: () => col.put(d, doc.id).catch((e) => toast(e.message)) } });
}

function haberVer(data) {
  if (partnerGoruyor(room.partner?.(), 'not')) return; // sayfada ve önde: zaten görüyor
  bildir(roomId, { tur: 'mesaj', ...N.bildirimMetni(data, benAdi()), url: 'sayfalar/not/', gizli: { metin: 'Yeni not' } })
    .catch((err) => console.warn('[not] bildirim gönderilemedi', err));
}

// ---------- Not bırak (pencere) ----------
const TURLER = [['yazi', 'Yazı'], ['cizim', 'Çizim'], ['foto', 'Fotoğraf']];

function yazAc() {
  const pId = partnerId();
  if (!pId) return;
  const pAd = partnerAdi();
  const form = { tur: 'yazi', surpriz: false, fotoBlob: null, fotoUrl: '', fotoYukleniyor: false };
  let ped = null;
  let gonderiliyor = false;

  const kapatBtn = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Kapat', onclick: () => vazgec() }, icon('close'));
  const baslikEl = h('h2', { class: 'nt-dlg-baslik', id: 'nt-dlg-baslik', tabindex: '-1' }, 'Not bırak');

  const turSeg = h('div', { class: 'seg nt-tur', role: 'group', 'aria-label': 'Not türü' },
    TURLER.map(([k, ad]) => h('button', { type: 'button', dataset: { k }, onclick: () => turSec(k) }, ad)));

  const metin = h('textarea', {
    id: 'nt-metin', class: 'nt-metin-girdi', rows: '5', maxlength: String(N.METIN_MAX), 'aria-describedby': 'nt-sayac nt-hata',
  });
  const sayac = h('span', { class: 'nt-sayac', id: 'nt-sayac', 'aria-live': 'polite' });
  const metinEtiket = h('label', { class: 'sr-only', for: 'nt-metin' });
  const yazKagit = h('div', { class: 'nt-yaz', dataset: { renk: '6' } }, h('span', { class: 'nt-bant', 'aria-hidden': 'true' }));
  const panel = h('div', { class: 'nt-panel' });

  const surprizGirdi = h('input', { type: 'checkbox', id: 'nt-surpriz', class: 'nt-anahtar-girdi', role: 'switch' });
  surprizGirdi.addEventListener('change', () => { form.surpriz = surprizGirdi.checked; });
  const surprizEl = h('label', { class: 'nt-surpriz', for: 'nt-surpriz' },
    h('span', { class: 'nt-surpriz-yazi' },
      h('strong', {}, 'Sürpriz olsun 🎁'),
      h('span', {}, `${pAd} dokununca açılır; o zamana dek kapalı durur.`)),
    surprizGirdi,
    h('span', { class: 'nt-anahtar', 'aria-hidden': 'true' }));

  const hata = h('p', { class: 'nt-hata', id: 'nt-hata', role: 'alert', hidden: true });
  const gonderBtn = h('button', { type: 'submit', class: 'btn primary' }, 'Notu bırak');
  const formEl = h('form', { class: 'nt-form', novalidate: true },
    h('p', { class: 'nt-dlg-alt' }, `${ek(pAd, 'e')} küçük bir not bırak.`),
    turSeg, panel, surprizEl, hata,
    h('div', { class: 'nt-dlg-cubuk' },
      h('button', { type: 'button', class: 'btn ghost', onclick: () => vazgec() }, 'Vazgeç'), gonderBtn));

  const dlg = h('dialog', { class: 'nt-dlg', 'aria-labelledby': 'nt-dlg-baslik' },
    h('header', { class: 'nt-dlg-ust' }, h('span', { 'aria-hidden': 'true' }), baslikEl, kapatBtn),
    h('div', { class: 'nt-dlg-icerik' }, formEl));

  const onceOdak = document.activeElement;
  const birak = geriyleKapat(() => dlg.close());
  dlg.addEventListener('close', () => {
    birak();
    ped?.kapat();
    if (form.fotoUrl) URL.revokeObjectURL(form.fotoUrl);
    dlg.remove();
    (onceOdak?.isConnected ? onceOdak : birakBtn).focus({ preventScroll: true });
  });

  dlg.addEventListener('cancel', (e) => { e.preventDefault(); vazgec(); }); // Esc: yarım not sorulmadan gitmesin
  const dolu = () => !!metin.value.trim() || (ped && !ped.bos()) || !!form.fotoBlob;
  async function vazgec() {
    if (gonderiliyor) return;
    if (dolu() && !(await confirmDialog('Notun gitmedi. Yine de kapatalım mı?', { ok: 'Kapat', cancel: 'Yazmaya devam' }))) return;
    dlg.close();
  }

  function hataGoster(m) {
    hata.textContent = m || '';
    hata.hidden = !m;
  }

  function sayacCiz() {
    const n = [...metin.value].length;
    sayac.textContent = `${n}/${N.METIN_MAX}`;
    sayac.classList.toggle('az', n > N.METIN_MAX - 20);
  }
  metin.addEventListener('input', () => { sayacCiz(); if (!hata.hidden) hataGoster(''); });

  function fotoPanel() {
    if (form.fotoYukleniyor) {
      return h('div', { class: 'nt-foto-sec', role: 'status' }, h('span', { class: 'nt-donen', 'aria-hidden': 'true' }), 'Fotoğraf hazırlanıyor…');
    }
    if (!form.fotoUrl) {
      return h('button', { type: 'button', class: 'nt-foto-sec', onclick: () => fotoSec() },
        ikon('photo'), h('strong', {}, 'Fotoğraf seç'), h('span', {}, 'Galeriden ya da kameradan'));
    }
    return h('div', { class: 'nt-foto-onizleme' },
      h('img', { src: form.fotoUrl, alt: 'Seçtiğin fotoğraf' }),
      h('button', { type: 'button', class: 'btn small nt-foto-degis', onclick: () => fotoSec() }, ikon('photo'), 'Değiştir'));
  }

  function panelCiz() {
    for (const b of turSeg.children) b.setAttribute('aria-pressed', String(b.dataset.k === form.tur));
    if (form.tur === 'yazi') {
      metin.rows = 5;
      metin.placeholder = 'Aklından geçeni yaz…';
      metinEtiket.textContent = 'Notun';
      metin.className = 'nt-metin-girdi';
      yazKagit.append(metinEtiket, metin, sayac);
      panel.replaceChildren(yazKagit);
    } else {
      metin.rows = 2;
      metin.placeholder = 'Altına bir söz yaz (isteğe bağlı)';
      metinEtiket.textContent = 'Altına bir söz (isteğe bağlı)';
      metin.className = 'input nt-altyazi';
      if (form.tur === 'cizim') ped ||= cizimPedi({ onDegis: () => { if (!hata.hidden) hataGoster(''); } });
      panel.replaceChildren(form.tur === 'cizim' ? ped.el : fotoPanel(),
        h('div', { class: 'nt-altyazi-alan' }, metinEtiket, metin, sayac));
    }
    sayacCiz();
  }

  function turSec(k) {
    if (form.tur === k) return;
    form.tur = k;
    hataGoster('');
    panelCiz();
    sfx('tap');
  }

  async function fotoSec() {
    const [file] = await dosyaSec();
    if (!file || !dlg.open) return;
    form.fotoYukleniyor = true;
    hataGoster('');
    panelCiz();
    try {
      const { blob } = await fotoKucult(file);
      if (form.fotoUrl) URL.revokeObjectURL(form.fotoUrl);
      form.fotoBlob = blob;
      form.fotoUrl = URL.createObjectURL(blob);
    } catch (e) {
      hataGoster(hataMetni(e, file));
    }
    form.fotoYukleniyor = false;
    if (dlg.open && form.tur === 'foto') panelCiz();
  }

  formEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (gonderiliyor) return;
    const tur = form.tur;
    const gorselVar = tur === 'cizim' ? !!ped && !ped.bos() : tur === 'foto' ? !!form.fotoBlob : false;
    const h1 = N.notDogrula({ tur, metin: metin.value, gorselVar });
    if (h1) {
      hataGoster(h1);
      if (tur === 'yazi' || /karakter/.test(h1)) metin.focus();
      return;
    }
    gonderiliyor = true;
    gonderBtn.disabled = true;
    gonderBtn.textContent = 'Bırakılıyor…';
    let data;
    let id;
    try {
      let foto = null;
      if (tur === 'cizim') {
        const { blob } = await fotoKucult(await ped.blob());
        foto = await uploadPhoto(blob, roomId);
      } else if (tur === 'foto') {
        foto = await uploadPhoto(form.fotoBlob, roomId);
      }
      data = N.notVerisi({ tur, metin: metin.value, foto, surpriz: form.surpriz }, { kime: pId, kimden: myId });
      id = await col.put(data);
    } catch (err) {
      console.warn('[not] bırakılamadı', err);
      hataGoster(tur === 'yazi' ? (err?.message || 'Kaydedilemedi. Biraz sonra yeniden dene.') : hataMetni(err));
      gonderiliyor = false;
      gonderBtn.disabled = false;
      gonderBtn.textContent = 'Notu bırak';
      return;
    }
    sfx('pop');
    durum.yeni = id;
    gonderiliyor = false;
    dlg.close();
    ciz();
    toast(form.surpriz ? `Sürpriz not ${ek(pAd, 'e')} bırakıldı 🎁` : `Not ${ek(pAd, 'e')} bırakıldı ✍️`);
    haberVer(data);
  });

  document.body.append(dlg);
  dlg.showModal();
  panelCiz();
  requestAnimationFrame(() => metin.focus({ preventScroll: true }));
}

// ---------- Canlı ----------
let sonHata = 0;
col.on('error', (err) => {
  if (Date.now() - sonHata < 15000) return;
  sonHata = Date.now();
  toast(err?.message || 'Bağlantı sorunu. Not bekletilip gönderilecek.');
});
col.on('change', ciz);
profil?.on('change', ciz);
room.on('presence', () => ciz());
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') ciz(); });

ciz();
